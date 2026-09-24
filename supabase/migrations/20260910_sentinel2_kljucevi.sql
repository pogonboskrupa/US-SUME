-- ============================================================
-- SENTINEL-2 (Copernicus Data Space Ecosystem) — svjež satelitski snimak za
-- praćenje stanja opožarenosti, na zahtjev korisnika (v3.128.0).
--
-- ISTI OBRAZAC kao pozari_kljucevi (20260909) — admin unese pristup JEDNOM za
-- CIJELU firmu, klijent čita dijeljeno. Razlika: CDSE koristi OAuth2 (client_id
-- + client_secret → kratkotrajni Bearer token), ne prostu MAP_KEY/x-api-key
-- vrijednost u URL-u/headeru — pa su ovdje ČETIRI polja umjesto jednog/dva:
--   • client_id / client_secret — OAuth klijent, napravljen na
--     dataspace.copernicus.eu (Settings → OAuth clients), besplatan nalog.
--   • instance_id — Sentinel Hub "konfiguracija" (Configuration Utility na
--     istom nalogu) koja definiše KOJI sloj se traži (npr. klonirana
--     Sentinel-2 L2A default konfiguracija).
--   • layer — ime sloja UNUTAR te konfiguracije (npr. "TRUE-COLOR") — zavisi
--     kako ga admin nazove pri kloniranju, zato je polje a ne fiksna vrijednost.
--
-- client_secret NIJE tretiran kao app_secrets tajna (SECURITY DEFINER-only) —
-- ISTA odluka kao za FIRMS MAP_KEY/GFW ključ (v3.124.0): sve to su vrijednosti
-- koje app ionako šalje trećoj strani sa svakog uređaja (token exchange se radi
-- KLIJENTSKI, ne kroz Supabase), a jedini realan rizik je da odobreni korisnik
-- (već vetovan RLS-om) vidi ključ — ne javnost. Server-side (pg_net) OAuth
-- exchange bi bio "sigurniji" na papiru, ali pg_net je asinhron (fire-and-
-- -forget, odgovor stiže u net._http_response) i nema provjeren sinhron put za
-- "zovi pa čekaj token" iz jedne SQL funkcije — rizik neprovjerenog mehanizma
-- veći je od dobiti, dosljedno dosadašnjoj odluci za FIRMS/GFW.
--
-- Idempotentna. Pokreće se RUČNO u Supabase SQL Editoru.
-- ============================================================

create table if not exists public.sentinel2_kljucevi (
  id             boolean primary key default true check (id),  -- singleton red
  client_id      text,
  client_secret  text,
  instance_id    text,
  layer          text,
  updated_at     timestamptz not null default now(),
  updated_by     uuid references auth.users(id)
);

insert into public.sentinel2_kljucevi(id) values (true) on conflict do nothing;

alter table public.sentinel2_kljucevi enable row level security;

-- Čitanje: svaki ODOBREN korisnik (klijent sam radi OAuth token exchange i WMS
-- pozive sa svog uređaja) — isti uslov kao svuda (public.je_odobren()).
drop policy if exists "sentinel2_kljucevi_select" on public.sentinel2_kljucevi;
create policy "sentinel2_kljucevi_select" on public.sentinel2_kljucevi
  for select to authenticated using (public.je_odobren());
-- Namjerno NEMA insert/update/delete politike — upis ide isključivo kroz
-- funkciju ispod, koja sama provjerava je_admin().

create or replace function public.admin_set_sentinel2_kljucevi(
  p_client_id     text,
  p_client_secret text,
  p_instance_id   text,
  p_layer         text
)
returns void language plpgsql security definer
set search_path = public, auth as $$
begin
  if not public.je_admin() then
    raise exception 'Pristup odbijen — samo admin';
  end if;
  update public.sentinel2_kljucevi
    set client_id     = nullif(trim(coalesce(p_client_id, '')), ''),
        client_secret = nullif(trim(coalesce(p_client_secret, '')), ''),
        instance_id   = nullif(trim(coalesce(p_instance_id, '')), ''),
        layer          = nullif(trim(coalesce(p_layer, '')), ''),
        updated_at    = now(),
        updated_by    = auth.uid()
    where id = true;
end $$;

revoke all on function public.admin_set_sentinel2_kljucevi(text, text, text, text) from public;
grant execute on function public.admin_set_sentinel2_kljucevi(text, text, text, text) to authenticated;

-- Osvježi PostgREST schema keš.
notify pgrst, 'reload schema';
