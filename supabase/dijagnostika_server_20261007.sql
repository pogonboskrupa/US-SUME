-- DIJAGNOSTIKA, NIJE POPRAVKA: samo SELECT, bez promjena podataka ili RLS-a.
-- Pokrenuti u Supabase SQL Editoru. Ispis ne sadrži PIN, token ili e-mail.
-- SQL Editor obično radi kao postgres; rezultat auth.uid()/je_odobren() u
-- toj sesiji NIJE dokaz prava prijavljenog korisnika aplikacije.

-- 1. Stvarna pravila: pregledati INSERT/UPDATE za projekt_clanovi i
-- restrictive zzz_odobren na svim projektnim/doznaka tabelama.
SELECT tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies
WHERE schemaname='public' AND tablename IN
 ('korisnici','projekti','projekt_clanovi','vlake','doz_projects',
  'doz_project_members','doz_area_markings','doz_track_points')
ORDER BY tablename, policyname;

-- 2. je_odobren mora prihvatiti važeći probni_do i prvo_odobren_at IS NULL.
-- Također se vide stvarne provjere vlasnika/člana, ne samo kopije iz repoa.
SELECT p.proname, p.prosecdef AS security_definer,
 pg_get_userbyid(p.proowner) AS vlasnik, p.proconfig,
 pg_get_functiondef(p.oid) AS definicija
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname IN
 ('je_odobren','je_clan_projekta','je_doz_clan','korisnici_probni_rok_zastita',
  'korisnici_zastita','internal_expire_stale_registrations','codex_save_gps_point')
ORDER BY p.proname;

-- 3. Da li zaštita registracije i probnog roka zaista postoje i jesu aktivne?
SELECT c.relname AS tabela, c.relrowsecurity AS rls, c.relforcerowsecurity AS force_rls
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relname IN
 ('korisnici','projekti','projekt_clanovi','vlake','doz_projects',
  'doz_project_members','doz_area_markings','doz_track_points')
ORDER BY c.relname;
SELECT c.relname AS tabela,t.tgname,t.tgenabled,
 pg_get_triggerdef(t.oid) AS definicija
FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relname IN ('korisnici','projekti','projekt_clanovi')
 AND NOT t.tgisinternal ORDER BY c.relname,t.tgname;
SELECT table_name,column_name,data_type,is_nullable,column_default
FROM information_schema.columns WHERE table_schema='public' AND
 ((table_name='korisnici' AND column_name IN ('odobren','probni_do','prvo_odobren_at','created_at'))
 OR table_name='projekt_clanovi') ORDER BY table_name,ordinal_position;

-- 4. Broj novih naloga po stanju, bez imena. to_jsonb radi i ako kolona
-- probni_do još ne postoji. Vrijeme registracije dolazi iz auth.users.
SELECT count(*) AS registrovani_posljednjih_7_dana,
 count(*) FILTER(WHERE coalesce((to_jsonb(k)->>'odobren')::boolean,false)
   OR coalesce((to_jsonb(k)->>'is_admin')::boolean,false)) AS odobreni_ili_admin,
 count(*) FILTER(WHERE to_jsonb(k)->>'odobren'='false'
   AND NOT coalesce((to_jsonb(k)->>'is_admin')::boolean,false)
   AND to_jsonb(k)->>'prvo_odobren_at' IS NULL
   AND (to_jsonb(k)->>'probni_do')::timestamptz>now()) AS imaju_vazeci_probni_rok,
 count(*) FILTER(WHERE k.id IS NULL) AS bez_profila,
 count(*) FILTER(WHERE to_jsonb(k)->>'odobren'='false'
   AND to_jsonb(k)->>'probni_do' IS NULL) AS bez_upisanog_probnog_roka
FROM auth.users u LEFT JOIN public.korisnici k ON k.id=u.id
WHERE u.created_at>now()-interval '7 days';

-- 5. Privilegije i jedinstveni ključ članstva; UPDATE politika je potrebna
-- samo ako aplikacija koristi upsert postojećeg članstva (npr. stari prenos).
SELECT grantee,table_name,privilege_type FROM information_schema.role_table_grants
WHERE table_schema='public' AND grantee IN ('authenticated','anon')
 AND table_name IN ('projekti','projekt_clanovi','vlake','doz_track_points')
ORDER BY table_name,grantee,privilege_type;
SELECT c.relname AS tabela,con.conname,pg_get_constraintdef(con.oid) AS definicija
FROM pg_constraint con JOIN pg_class c ON c.oid=con.conrelid
JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relname IN ('projekti','projekt_clanovi')
ORDER BY c.relname,con.conname;
