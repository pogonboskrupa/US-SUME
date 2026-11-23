-- ============================================================
-- ZADANE KOLEGE PO KORISNIKU (v4.2.2)
--
-- Admin za POJEDINAČNOG korisnika određuje koje kolege mu se prikazuju po defaultu u spisku za slanje
-- (jednosmjerno: korisnik njih vidi i može im slati; oni njega ne moraju). Korisnik i dalje sam
-- dodaje kolege šifrom. Grupe (20261115) ostaju za povezivanje više ljudi odjednom.
--   • admin_zadane_lista()                      — svi korisnici koji imaju zadane kolege (samo admin)
--   • admin_zadane_spremi(korisnik, kolege[])   — zamjenjuje spisak (prazan niz = ukloni sve)
--   • kolege_iz_grupa()                         — sada vraća kolege iz mojih grupa + zadane meni
--   • posalji_podatke()                         — dozvoljeno i prema zadanim kolegama
-- Idempotentna; pokreće se RUČNO u Supabase SQL Editoru (poslije 20261115_grupe_kolega.sql).
-- ============================================================

create table if not exists public.kolege_zadane (
  korisnik_id uuid not null references auth.users(id) on delete cascade,
  kolega_id uuid not null references auth.users(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (korisnik_id, kolega_id),
  check (korisnik_id <> kolega_id)
);
alter table public.kolege_zadane enable row level security;

create or replace function public.admin_zadane_lista()
returns table (korisnik_id uuid, korisnik text, sumarija text, kolege jsonb)
language plpgsql security definer
set search_path = public, auth as $$
begin
  if not public.je_admin() then raise exception 'Samo admin'; end if;
  return query
    select z.korisnik_id, btrim(coalesce(u.ime,'') || ' ' || coalesce(u.prezime,'')), u.sumarija,
      jsonb_agg(jsonb_build_object('id', k.id, 'ime', btrim(coalesce(k.ime,'') || ' ' || coalesce(k.prezime,'')), 'sumarija', k.sumarija)
                order by k.ime, k.prezime)
      from public.kolege_zadane z
      join public.korisnici u on u.id = z.korisnik_id
      join public.korisnici k on k.id = z.kolega_id
     group by z.korisnik_id, u.ime, u.prezime, u.sumarija
     order by 2;
end; $$;

create or replace function public.admin_zadane_spremi(p_korisnik uuid, p_kolege uuid[])
returns void language plpgsql security definer
set search_path = public, auth as $$
begin
  if not public.je_admin() then raise exception 'Samo admin'; end if;
  if p_korisnik is null or not exists (select 1 from public.korisnici where id = p_korisnik) then raise exception 'Korisnik ne postoji'; end if;
  if coalesce(array_length(p_kolege, 1), 0) > 500 then raise exception 'Previše kolega'; end if;
  delete from public.kolege_zadane where korisnik_id = p_korisnik;
  insert into public.kolege_zadane (korisnik_id, kolega_id, created_by)
    select p_korisnik, k.id, auth.uid() from public.korisnici k
     where k.id = any (coalesce(p_kolege, '{}'::uuid[])) and k.id <> p_korisnik
    on conflict do nothing;
end; $$;

create or replace function public.kolege_iz_grupa()
returns table (id uuid, ime text, sumarija text)
language plpgsql security definer
set search_path = public, auth as $$
begin
  if auth.uid() is null or not public.je_odobren() then raise exception 'Nemaš pristup'; end if;
  return query
    select s.id, s.ime, s.sumarija from (
      select k.id, btrim(coalesce(k.ime,'') || ' ' || coalesce(k.prezime,'')) as ime, k.sumarija
        from public.kolege_grupe_clanovi mi
        join public.kolege_grupe_clanovi on_ on on_.grupa_id = mi.grupa_id and on_.korisnik_id <> auth.uid()
        join public.korisnici k on k.id = on_.korisnik_id
       where mi.korisnik_id = auth.uid() and (coalesce(k.odobren,false) or coalesce(k.is_admin,false))
      union
      select k.id, btrim(coalesce(k.ime,'') || ' ' || coalesce(k.prezime,'')), k.sumarija
        from public.kolege_zadane z join public.korisnici k on k.id = z.kolega_id
       where z.korisnik_id = auth.uid() and (coalesce(k.odobren,false) or coalesce(k.is_admin,false))
    ) s order by s.ime;
end; $$;

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
     and not exists (select 1 from public.kolege_zadane z where z.korisnik_id = auth.uid() and z.kolega_id = p_to)
     and not exists (select 1 from public.kolege_grupe_clanovi a join public.kolege_grupe_clanovi b on b.grupa_id = a.grupa_id
                      where a.korisnik_id = auth.uid() and b.korisnik_id = p_to)
     and (v_ja_sum is null or v_on_sum is distinct from v_ja_sum) then
    raise exception 'Dodaj kolegu (šifra) ili ga izaberi iz svoje šumarije'; end if;

  delete from public.primljeni_podaci where expires_at < now();
  if not v_ja_admin then
    if (select count(*) from public.primljeni_podaci where from_id = auth.uid() and to_id = p_to) >= 20 then
      raise exception 'Kolega ima previše neprimljenih podataka od tebe'; end if;
    if (select count(*) from public.primljeni_podaci where from_id = auth.uid() and created_at > now() - interval '1 hour') >= 60 then
      raise exception 'Previše slanja u kratkom roku — pokušaj kasnije'; end if;
  end if;

  insert into public.primljeni_podaci (from_id, to_id, sumarija, vrsta, naziv, sadrzaj)
  values (auth.uid(), p_to, coalesce(v_on_sum, v_ja_sum), p_vrsta, btrim(p_naziv), p_sadrzaj)
  returning id into v_id;
  return v_id;
end; $$;

revoke all on function public.admin_zadane_lista() from public;
revoke all on function public.admin_zadane_spremi(uuid,uuid[]) from public;
revoke all on function public.kolege_iz_grupa() from public;
revoke all on function public.posalji_podatke(uuid,text,text,text) from public;
grant execute on function public.admin_zadane_lista() to authenticated;
grant execute on function public.admin_zadane_spremi(uuid,uuid[]) to authenticated;
grant execute on function public.kolege_iz_grupa() to authenticated;
grant execute on function public.posalji_podatke(uuid,text,text,text) to authenticated;
notify pgrst, 'reload schema';
