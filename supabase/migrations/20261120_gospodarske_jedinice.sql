-- ============================================================
-- GOSPODARSKE JEDINICE PO ŠUMARIJAMA (v4.4.0)
--
-- Admin vodi spisak gospodarskih jedinica po šumariji (Meni / Korisnici → Gospodarske jedinice);
-- projektanti ih biraju u padajućem spisku pri pravljenju projekta, uz opciju "Druga GJ (upiši)".
-- Do sada je spisak postojao samo za Šumariju Bos. Krupa i bio je upisan u kod — taj spisak se ovdje
-- prenosi u tabelu. Čitanje: svaki odobreni korisnik. Upis/brisanje: samo admin (SECURITY DEFINER).
-- Idempotentna; pokreće se RUČNO u Supabase SQL Editoru.
-- ============================================================

create table if not exists public.gospodarske_jedinice (
  id uuid primary key default gen_random_uuid(),
  sumarija text not null,
  naziv text not null,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  check (char_length(btrim(naziv)) between 2 and 60)
);
create unique index if not exists gospodarske_jedinice_jedinstveno on public.gospodarske_jedinice (sumarija, lower(btrim(naziv)));
alter table public.gospodarske_jedinice enable row level security;
drop policy if exists gj_citanje on public.gospodarske_jedinice;
create policy gj_citanje on public.gospodarske_jedinice for select to authenticated using (public.je_odobren());

create or replace function public.admin_gj_dodaj(p_sumarija text, p_naziv text)
returns uuid language plpgsql security definer set search_path = public, auth as $$
declare v_id uuid;
begin
  if not public.je_admin() then raise exception 'Samo admin'; end if;
  if p_sumarija is null or char_length(btrim(p_sumarija)) = 0 then raise exception 'Izaberi šumariju'; end if;
  if p_naziv is null or char_length(btrim(p_naziv)) not between 2 and 60 then raise exception 'Naziv GJ: 2–60 znakova'; end if;
  insert into public.gospodarske_jedinice (sumarija, naziv, created_by) values (btrim(p_sumarija), btrim(p_naziv), auth.uid())
    on conflict (sumarija, lower(btrim(naziv))) do nothing returning id into v_id;
  if v_id is null then raise exception 'Ta GJ već postoji u toj šumariji'; end if;
  return v_id;
end; $$;

create or replace function public.admin_gj_obrisi(p_id uuid)
returns void language plpgsql security definer set search_path = public, auth as $$
begin
  if not public.je_admin() then raise exception 'Samo admin'; end if;
  delete from public.gospodarske_jedinice where id = p_id;
end; $$;

-- Dosadašnji fiksni spisak Šumarije Bos. Krupa.
insert into public.gospodarske_jedinice (sumarija, naziv) values
  ('ŠUMARIJA BOS.KRUPA','Risovac Krupa'),('ŠUMARIJA BOS.KRUPA','Grmeč Jasenica'),('ŠUMARIJA BOS.KRUPA','Vojskova'),
  ('ŠUMARIJA BOS.KRUPA','Baštra Ćorkovača'),('ŠUMARIJA BOS.KRUPA','Gomila')
on conflict do nothing;

revoke all on function public.admin_gj_dodaj(text,text) from public;
revoke all on function public.admin_gj_obrisi(uuid) from public;
grant execute on function public.admin_gj_dodaj(text,text) to authenticated;
grant execute on function public.admin_gj_obrisi(uuid) to authenticated;
notify pgrst, 'reload schema';
