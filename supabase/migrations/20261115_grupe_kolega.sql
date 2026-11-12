-- ============================================================
-- GRUPE KOLEGA (v4.2.0) — admin povezuje kolege u grupe
--
-- Admin pravi VIŠE grupa i u svaku stavlja korisnike (terenske, projektante, projektante iz bilo koje
-- šumarije). Jedan korisnik može biti u više grupa. Korisnici grupe NE VIDE: svako dobija samo
-- spisak kolega iz svih svojih grupa kao prijedlog za slanje (kolege_iz_grupa), a slanje
-- posalji_podatke() je dozvoljeno i prema njima.
--   • admin_grupe_lista()                       — sve grupe sa članovima (samo admin)
--   • admin_grupa_spremi(id, naziv, clanovi[])  — nova grupa (id null) ili izmjena; vraća id
--   • admin_grupa_obrisi(id)
--   • kolege_iz_grupa()                         — kolege iz mojih grupa (bez imena grupa)
-- Tabele nemaju NIJEDNU politiku — sve ide kroz funkcije. Idempotentna; pokreće se RUČNO u Supabase
-- SQL Editoru (poslije 20261113_admin_svima.sql).
-- ============================================================

create table if not exists public.kolege_grupe (
  id uuid primary key default gen_random_uuid(),
  naziv text not null check (char_length(btrim(naziv)) between 1 and 80),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.kolege_grupe enable row level security;

create table if not exists public.kolege_grupe_clanovi (
  grupa_id uuid not null references public.kolege_grupe(id) on delete cascade,
  korisnik_id uuid not null references auth.users(id) on delete cascade,
  primary key (grupa_id, korisnik_id)
);
create index if not exists kolege_grupe_clanovi_k_idx on public.kolege_grupe_clanovi (korisnik_id);
alter table public.kolege_grupe_clanovi enable row level security;

create or replace function public.admin_grupe_lista()
returns table (id uuid, naziv text, clanovi jsonb)
language plpgsql security definer
set search_path = public, auth as $$
begin
  if not public.je_admin() then raise exception 'Samo admin'; end if;
  return query
    select g.id, g.naziv,
      coalesce((select jsonb_agg(jsonb_build_object('id', k.id, 'ime', btrim(coalesce(k.ime,'') || ' ' || coalesce(k.prezime,'')), 'sumarija', k.sumarija)
                                 order by k.ime, k.prezime)
                  from public.kolege_grupe_clanovi c join public.korisnici k on k.id = c.korisnik_id
                 where c.grupa_id = g.id), '[]'::jsonb)
    from public.kolege_grupe g order by g.naziv;
end; $$;

create or replace function public.admin_grupa_spremi(p_id uuid, p_naziv text, p_clanovi uuid[])
returns uuid language plpgsql security definer
set search_path = public, auth as $$
declare v_id uuid := p_id;
begin
  if not public.je_admin() then raise exception 'Samo admin'; end if;
  if p_naziv is null or char_length(btrim(p_naziv)) = 0 or char_length(p_naziv) > 80 then raise exception 'Neispravan naziv grupe'; end if;
  if coalesce(array_length(p_clanovi, 1), 0) > 500 then raise exception 'Previše članova'; end if;
  if v_id is null then
    insert into public.kolege_grupe (naziv, created_by) values (btrim(p_naziv), auth.uid()) returning kolege_grupe.id into v_id;
  else
    update public.kolege_grupe set naziv = btrim(p_naziv) where kolege_grupe.id = v_id;
    if not found then raise exception 'Grupa ne postoji'; end if;
    delete from public.kolege_grupe_clanovi where grupa_id = v_id;
  end if;
  insert into public.kolege_grupe_clanovi (grupa_id, korisnik_id)
    select v_id, k.id from public.korisnici k where k.id = any (coalesce(p_clanovi, '{}'::uuid[]))
    on conflict do nothing;
  return v_id;
end; $$;

create or replace function public.admin_grupa_obrisi(p_id uuid)
returns void language plpgsql security definer
set search_path = public, auth as $$
begin
  if not public.je_admin() then raise exception 'Samo admin'; end if;
  delete from public.kolege_grupe where id = p_id;
end; $$;

create or replace function public.kolege_iz_grupa()
returns table (id uuid, ime text, sumarija text)
language plpgsql security definer
set search_path = public, auth as $$
begin
  if auth.uid() is null or not public.je_odobren() then raise exception 'Nemaš pristup'; end if;
  return query
    select distinct k.id, btrim(coalesce(k.ime,'') || ' ' || coalesce(k.prezime,'')), k.sumarija
      from public.kolege_grupe_clanovi mi
      join public.kolege_grupe_clanovi on_ on on_.grupa_id = mi.grupa_id and on_.korisnik_id <> auth.uid()
      join public.korisnici k on k.id = on_.korisnik_id
     where mi.korisnik_id = auth.uid() and (coalesce(k.odobren,false) or coalesce(k.is_admin,false))
     order by 2;
end; $$;

-- Slanje dozvoljeno: admin, ista šumarija, prihvaćen kontakt ILI zajednička grupa
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

revoke all on function public.admin_grupe_lista() from public;
revoke all on function public.admin_grupa_spremi(uuid,text,uuid[]) from public;
revoke all on function public.admin_grupa_obrisi(uuid) from public;
revoke all on function public.kolege_iz_grupa() from public;
revoke all on function public.posalji_podatke(uuid,text,text,text) from public;
grant execute on function public.admin_grupe_lista() to authenticated;
grant execute on function public.admin_grupa_spremi(uuid,text,uuid[]) to authenticated;
grant execute on function public.admin_grupa_obrisi(uuid) to authenticated;
grant execute on function public.kolege_iz_grupa() to authenticated;
grant execute on function public.posalji_podatke(uuid,text,text,text) to authenticated;
notify pgrst, 'reload schema';
