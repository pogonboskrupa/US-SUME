-- ============================================================
-- KOLEGE (KONTAKTI) ZA SLANJE — terenski profil bira primaoce iz svog spiska (v4.1.0)
--
-- Terenski nalog nema pregled svih korisnika. Kolegu dodaje POZIVOM:
--   • A pozove: kontakt_poziv_napravi() → kod od 5 cifara (važi 1 dan, jednokratan)
--   • B prihvati: kontakt_poziv_prihvati(kod) → oba postaju jedno drugom kolega
--   • kontakti_moji() vraća spisak (za izbor primaoca u slanju KML-a/traga/slike)
--   • kontakt_ukloni(id) briše vezu u oba smjera
-- Poslije prihvatanja posalji_podatke() dozvoljava slanje i izvan iste šumarije.
-- Pogađanje koda: 10 pogrešnih pokušaja u 10 min (ista brana kao šifre fajlova).
--
-- Tabele nemaju NIJEDNU politiku — sve ide kroz funkcije. Idempotentna;
-- pokreće se RUČNO u Supabase SQL Editoru.
-- ============================================================

create table if not exists public.kontakti (
  a uuid not null references auth.users(id) on delete cascade,
  b uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (a, b),
  check (a <> b)
);
create index if not exists kontakti_b_idx on public.kontakti (b);
alter table public.kontakti enable row level security;

create table if not exists public.kontakt_pozivi (
  kod text primary key check (kod ~ '^[0-9]{5}$'),
  from_id uuid not null references auth.users(id) on delete cascade,
  expires_at timestamptz not null default now() + interval '1 day'
);
create index if not exists kontakt_pozivi_from_idx on public.kontakt_pozivi (from_id);
alter table public.kontakt_pozivi enable row level security;

create or replace function public.kontakt_poziv_napravi()
returns text language plpgsql security definer
set search_path = public, auth as $$
declare
  v_kod text; v_raw bytea; n int := 0;
begin
  if auth.uid() is null or not public.je_odobren() then raise exception 'Nemaš pristup'; end if;
  delete from public.kontakt_pozivi where expires_at < now();
  if (select count(*) from public.kontakt_pozivi where from_id = auth.uid()) >= 3 then
    raise exception 'Imaš 3 aktivna poziva — sačekaj da ih kolege prihvate ili isteknu';
  end if;
  loop
    v_raw := decode(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8), 'hex');
    v_kod := lpad(((get_byte(v_raw,0)::bigint * 16777216 + get_byte(v_raw,1) * 65536
                   + get_byte(v_raw,2) * 256 + get_byte(v_raw,3)) % 100000)::text, 5, '0');
    begin
      insert into public.kontakt_pozivi (kod, from_id) values (v_kod, auth.uid());
      return v_kod;
    exception when unique_violation then
      n := n + 1;
      if n > 20 then raise exception 'Poziv nije napravljen — pokušaj ponovo'; end if;
    end;
  end loop;
end; $$;

create or replace function public.kontakt_poziv_prihvati(p_kod text)
returns table (id uuid, ime text, sumarija text)
language plpgsql security definer
set search_path = public, auth as $$
declare
  v_k text := regexp_replace(coalesce(p_kod, ''), '[^0-9]', '', 'g');
  r public.kontakt_pozivi%rowtype;
begin
  if auth.uid() is null or not public.je_odobren() then raise exception 'Nemaš pristup'; end if;
  if (select count(*) from public.podaci_sifre_pokusaji where uid = auth.uid() and t > now() - interval '10 minutes') >= 10 then
    raise exception 'Previše pogrešnih pokušaja — pokušaj za nekoliko minuta';
  end if;
  delete from public.kontakt_pozivi where expires_at < now();
  select * into r from public.kontakt_pozivi p where p.kod = v_k for update;
  -- Neuspjeh se NE javlja izuzetkom (izuzetak bi poništio upis pokušaja)
  if not found or r.from_id = auth.uid() then
    insert into public.podaci_sifre_pokusaji (uid) values (auth.uid());
    return;
  end if;
  insert into public.kontakti (a, b) values (auth.uid(), r.from_id) on conflict do nothing;
  insert into public.kontakti (a, b) values (r.from_id, auth.uid()) on conflict do nothing;
  delete from public.kontakt_pozivi where kod = v_k;
  return query select k.id, btrim(coalesce(k.ime,'') || ' ' || coalesce(k.prezime,'')), k.sumarija
    from public.korisnici k where k.id = r.from_id;
end; $$;

create or replace function public.kontakti_moji()
returns table (id uuid, ime text, sumarija text)
language plpgsql security definer
set search_path = public, auth as $$
begin
  if auth.uid() is null or not public.je_odobren() then raise exception 'Nemaš pristup'; end if;
  return query
    select k.id, btrim(coalesce(k.ime,'') || ' ' || coalesce(k.prezime,'')), k.sumarija
    from public.kontakti c join public.korisnici k on k.id = c.b
    where c.a = auth.uid() and (coalesce(k.odobren,false) or coalesce(k.is_admin,false))
    order by 2;
end; $$;

create or replace function public.kontakt_ukloni(p_id uuid)
returns void language plpgsql security definer
set search_path = public, auth as $$
begin
  if auth.uid() is null then return; end if;
  delete from public.kontakti where (a = auth.uid() and b = p_id) or (a = p_id and b = auth.uid());
end; $$;

-- Slanje dozvoljeno: admin, ista šumarija ILI prihvaćen kontakt
create or replace function public.posalji_podatke(
  p_to uuid, p_vrsta text, p_naziv text, p_sadrzaj text)
returns uuid language plpgsql security definer
set search_path = public, auth as $$
declare
  v_ja_sum text; v_ja_admin boolean; v_on_sum text; v_on_ok boolean; v_id uuid;
begin
  if auth.uid() is null or not public.je_odobren() then raise exception 'Nemaš pristup'; end if;
  if p_to is null or p_to = auth.uid() then raise exception 'Izaberi kolegu'; end if;
  if p_vrsta not in ('trag','poligon','linija','kml') then raise exception 'Nepoznata vrsta podatka'; end if;
  if p_naziv is null or char_length(btrim(p_naziv)) = 0 or char_length(p_naziv) > 120 then raise exception 'Neispravan naziv'; end if;
  if p_sadrzaj is null or char_length(p_sadrzaj) = 0 or char_length(p_sadrzaj) > 3000000 then
    raise exception 'Podatak je prazan ili prevelik (najviše 3 MB)'; end if;

  select k.sumarija, coalesce(k.is_admin,false) into v_ja_sum, v_ja_admin from public.korisnici k where k.id = auth.uid();
  select k.sumarija, coalesce(k.odobren,false) or coalesce(k.is_admin,false)
    into v_on_sum, v_on_ok from public.korisnici k where k.id = p_to;
  if v_on_ok is not true then raise exception 'Kolega nije dostupan'; end if;
  if not v_ja_admin
     and not exists (select 1 from public.kontakti c where c.a = auth.uid() and c.b = p_to)
     and (v_ja_sum is null or v_on_sum is distinct from v_ja_sum) then
    raise exception 'Dodaj kolegu (poziv) ili ga izaberi iz svoje šumarije'; end if;

  delete from public.primljeni_podaci where expires_at < now();
  if (select count(*) from public.primljeni_podaci where from_id = auth.uid() and to_id = p_to) >= 20 then
    raise exception 'Kolega ima previše neprimljenih podataka od tebe'; end if;
  if (select count(*) from public.primljeni_podaci where from_id = auth.uid() and created_at > now() - interval '1 hour') >= 60 then
    raise exception 'Previše slanja u kratkom roku — pokušaj kasnije'; end if;

  insert into public.primljeni_podaci (from_id, to_id, sumarija, vrsta, naziv, sadrzaj)
  values (auth.uid(), p_to, coalesce(v_on_sum, v_ja_sum), p_vrsta, btrim(p_naziv), p_sadrzaj)
  returning id into v_id;
  return v_id;
end; $$;

revoke all on function public.kontakt_poziv_napravi() from public;
revoke all on function public.kontakt_poziv_prihvati(text) from public;
revoke all on function public.kontakti_moji() from public;
revoke all on function public.kontakt_ukloni(uuid) from public;
revoke all on function public.posalji_podatke(uuid,text,text,text) from public;
grant execute on function public.kontakt_poziv_napravi() to authenticated;
grant execute on function public.kontakt_poziv_prihvati(text) to authenticated;
grant execute on function public.kontakti_moji() to authenticated;
grant execute on function public.kontakt_ukloni(uuid) to authenticated;
grant execute on function public.posalji_podatke(uuid,text,text,text) to authenticated;
notify pgrst, 'reload schema';
