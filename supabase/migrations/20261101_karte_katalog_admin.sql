-- ============================================================
-- Admin uređuje popis karata za preuzimanje (Meni → Učitaj kartu → Dostupne karte).
-- Popis dolazi sa GitHub-a (pogonboskrupa/KARTE); ovdje se čuvaju SAMO izmjene
-- prikaza: sakrivanje, prikazni naziv, opis i redoslijed. Fajl na GitHub-u se NE
-- dira (za to bi aplikacija trebala GitHub token sa pravom pisanja).
-- Ključ je NAZIV FAJLA (npr. KARTA_APP_v8_z12-17.mbtiles) — stabilan i kad se
-- isti fajl ponovo otpremi (GitHub asset id se tada promijeni).
-- Idempotentna. Pokreće se RUČNO u Supabase SQL Editoru.
-- ============================================================

create table if not exists public.karte_katalog (
  kljuc       text primary key check (char_length(kljuc) between 1 and 240),
  sakriveno   boolean not null default false,
  naziv       text check (naziv is null or char_length(naziv) <= 120),
  opis        text check (opis is null or char_length(opis) <= 300),
  redoslijed  integer,
  updated_at  timestamptz not null default now(),
  updated_by  uuid references auth.users(id)
);

alter table public.karte_katalog enable row level security;

drop policy if exists "karte_katalog_select" on public.karte_katalog;
create policy "karte_katalog_select" on public.karte_katalog
  for select to authenticated using (public.je_odobren());
-- Upis samo kroz funkcije ispod (nema insert/update/delete politike).

create or replace function public.admin_set_karta_katalog(
  p_kljuc text, p_sakriveno boolean, p_naziv text, p_opis text, p_redoslijed integer
) returns void language plpgsql security definer
set search_path = public, auth as $$
begin
  if not public.je_admin() then
    raise exception 'Pristup odbijen — samo admin';
  end if;
  insert into public.karte_katalog(kljuc, sakriveno, naziv, opis, redoslijed, updated_at, updated_by)
  values (trim(p_kljuc), coalesce(p_sakriveno, false),
          nullif(trim(coalesce(p_naziv, '')), ''), nullif(trim(coalesce(p_opis, '')), ''),
          p_redoslijed, now(), auth.uid())
  on conflict (kljuc) do update set
    sakriveno = excluded.sakriveno, naziv = excluded.naziv, opis = excluded.opis,
    redoslijed = excluded.redoslijed, updated_at = now(), updated_by = auth.uid();
end $$;

create or replace function public.admin_reset_karta_katalog(p_kljuc text)
returns void language plpgsql security definer
set search_path = public, auth as $$
begin
  if not public.je_admin() then
    raise exception 'Pristup odbijen — samo admin';
  end if;
  delete from public.karte_katalog where kljuc = p_kljuc;
end $$;

revoke all on function public.admin_set_karta_katalog(text, boolean, text, text, integer) from public;
grant execute on function public.admin_set_karta_katalog(text, boolean, text, text, integer) to authenticated;
revoke all on function public.admin_reset_karta_katalog(text) from public;
grant execute on function public.admin_reset_karta_katalog(text) to authenticated;

notify pgrst, 'reload schema';
