-- ============================================================
-- POŽARI — DIJELJENA ARHIVA DETEKCIJA (v1.1.1)
--
-- Do sada je arhiva "Zadnjih 5 godina"/"Opožareno po godinama" (v3.119.0/
-- v3.122.0) bila ISKLJUČIVO lokalna (localStorage) — svaki telefon je gradio
-- SVOJU arhivu od trenutka kad je PRVI PUT otvorio panel Požari. Terenska
-- primjedba: admin (koristi app najduže, najviše osvježavanja) vidi
-- opožarenu površinu za stare požare, dok noviji korisnik za ISTI požar vidi
-- samo mjesto i broj detekcija — jer njegov telefon jednostavno nije bio
-- uključen dovoljno dugo da SAM sakupi dovoljno zapisa za računicu.
--
-- Rješenje: isti zapisi (godina, dan, zaokružena koordinata, senzor) se sada
-- i UPIŠU na server (svaki odobreni korisnik, ne samo admin — vidi INSERT
-- politiku ispod) i POVUKU sa servera (svaki odobreni korisnik čita SVE, ne
-- samo svoje). Lokalna arhiva OSTAJE izvor istine za crtanje/računicu na
-- klijentu (radi offline) — server je samo dijeljeno skladište koje se u nju
-- stapa (vidi _povArhSpojiServerske u index.html).
--
-- PRIMARNI KLJUČ (godina,dan,la,lo) je namjerno ISTI oblik dedup ključa koji
-- _povArhKljuc() već koristi lokalno — dva uređaja koja vide ISTI vreo piksel
-- istog dana upisuju IDENTIČAN red, pa klijentski INSERT sa ignoreDuplicates
-- (ON CONFLICT DO NOTHING) prirodno svede na "prvi upiše, ostali tiho
-- preskoče", bez ijedne posebne provjere na klijentu ili serveru.
--
-- Nema UPDATE/DELETE politike — ovo je isključivo append-only istorijski
-- zapis (izmjerena satelitska detekcija se ne mijenja niti briše).
--
-- Idempotentna. Pokreće se RUČNO u Supabase SQL Editoru.
-- ============================================================

create table if not exists public.pozari_arhiva (
  godina     int not null,
  dan        int not null,   -- redni dan u godini (0-365), UTC — vidi _povArhDan()
  la         numeric(7,4) not null,
  lo         numeric(7,4) not null,
  rez        int not null,   -- senzorska rezolucija (375 VIIRS / 1000 MODIS)
  created_at timestamptz not null default now(),
  primary key (godina, dan, la, lo)
);

alter table public.pozari_arhiva enable row level security;

-- Čitanje: svaki odobreni korisnik vidi CIJELU dijeljenu arhivu (ne samo ono
-- što je sâm upisao) — u tome je i cijela svrha ove migracije.
drop policy if exists "pozari_arhiva_select" on public.pozari_arhiva;
create policy "pozari_arhiva_select" on public.pozari_arhiva
  for select to authenticated using (public.je_odobren());

-- Upis SVAKOG odobrenog korisnika (ne samo admin, za razliku od
-- pozari_kljucevi/sentinel2_kljucevi) — svaki telefon dijeli ono što je
-- ionako već vidio preko FIRMS/GFW-a, nema tu ništa tajno ni osjetljivo.
drop policy if exists "pozari_arhiva_insert" on public.pozari_arhiva;
create policy "pozari_arhiva_insert" on public.pozari_arhiva
  for insert to authenticated with check (public.je_odobren());

-- Osvježi PostgREST schema keš.
notify pgrst, 'reload schema';
