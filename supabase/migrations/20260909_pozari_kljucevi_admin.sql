-- ============================================================
-- POŽARI — FIRMS MAP_KEY i GFW ključ postavlja SAMO ADMIN, za CIJELU firmu
--
-- UZROK: MAP_KEY/GFW ključ su do sada bili PO UREĐAJU (localStorage, svaki
-- korisnik ih unosio sam) — svaki šumar bi morao sam napraviti FIRMS/GFW
-- nalog da bi dobio precizniju/pouzdaniju rutu do detekcija požara. Na
-- eksplicitan zahtjev: ključ postavlja SAMO admin, jednom, za cijelu firmu;
-- ostali korisnici polje uopšte ne vide (index.html: mapKeyPolje se renderuje
-- samo kad je sbProfile?.is_admin true) i koriste taj isti ključ automatski.
--
-- Ključevi se koriste DIREKTNO SA UREĐAJA korisnika — FIRMS/GFW se zovu iz
-- browsera/APK-a, ne preko Supabase servera (vidi _poziApiUrl/_poziGfwUrl u
-- index.html) — pa tabela MORA biti čitljiva SVAKOM odobrenom korisniku, ne
-- samo adminu. Ovo NIJE tajna kao app_secrets (20260729_obavjestenja.sql) —
-- to su vrijednosti koje browser ionako šalje NASA/GFW serverima u URL-u/
-- headeru, samo se ovdje ne unose po uređaju nego čitaju sa jednog mjesta.
-- Upis ostaje isključivo adminov — kroz SECURITY DEFINER RPC, ne kroz
-- direktan REST UPDATE (tabela nema UPDATE/INSERT RLS politiku).
--
-- Idempotentna. Pokreće se RUČNO u Supabase SQL Editoru.
-- ============================================================

create table if not exists public.pozari_kljucevi (
  id             boolean primary key default true check (id),  -- singleton red
  firms_map_key  text,
  gfw_api_key    text,
  updated_at     timestamptz not null default now(),
  updated_by     uuid references auth.users(id)
);

insert into public.pozari_kljucevi(id) values (true) on conflict do nothing;

alter table public.pozari_kljucevi enable row level security;

-- Čitanje: svaki ODOBREN korisnik — klijent zove FIRMS/GFW SA OVIM ključem,
-- ne samo admin. Isti uslov kao svuda (public.je_odobren(), vidi
-- 20260727_pristup_odobrenje.sql).
drop policy if exists "pozari_kljucevi_select" on public.pozari_kljucevi;
create policy "pozari_kljucevi_select" on public.pozari_kljucevi
  for select to authenticated using (public.je_odobren());
-- Namjerno NEMA insert/update/delete politike — upis ide isključivo kroz
-- funkciju ispod, koja sama provjerava je_admin().

create or replace function public.admin_set_pozari_kljucevi(
  p_firms_map_key text,
  p_gfw_api_key   text
)
returns void language plpgsql security definer
set search_path = public, auth as $$
begin
  if not public.je_admin() then
    raise exception 'Pristup odbijen — samo admin';
  end if;
  update public.pozari_kljucevi
    set firms_map_key = nullif(trim(coalesce(p_firms_map_key, '')), ''),
        gfw_api_key    = nullif(trim(coalesce(p_gfw_api_key, '')), ''),
        updated_at     = now(),
        updated_by     = auth.uid()
    where id = true;
end $$;

revoke all on function public.admin_set_pozari_kljucevi(text, text) from public;
grant execute on function public.admin_set_pozari_kljucevi(text, text) to authenticated;

-- Osvježi PostgREST schema keš — bez ovoga nova tabela/funkcija zna kasniti
-- (PGRST204 "could not find column/function") dok se ne pozove ručno.
notify pgrst, 'reload schema';
