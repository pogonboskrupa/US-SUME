\set ON_ERROR_STOP on
DO $$ BEGIN IF current_database()<>'codex_fixture' THEN RAISE EXCEPTION 'Samo testna baza codex_fixture'; END IF; END $$;
\ir ../../supabase/migrations/20261009_app_user_activity.sql
\ir ../../supabase/migrations/20261108_verzija_aplikacije.sql
\ir ../../supabase/migrations/20261108_verzija_aplikacije.sql
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub='00000000-0000-0000-0000-000000000003';
SELECT public.app_record_activity_ver('00000000-0000-0000-0000-000000000003',now(),'v3.7.0','apk');
DO $$ BEGIN
 BEGIN PERFORM public.app_record_activity_ver('00000000-0000-0000-0000-000000000005',now(),'v3.7.0','apk');RAISE EXCEPTION 'Verzija pripisana tuđem nalogu';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 IF (SELECT count(*) FROM public.admin_get_user_activity())<>0 THEN RAISE EXCEPTION 'Projektant vidi tuđe verzije';END IF;
END $$;
-- Neispravan oblik verzije/platforme se ne upisuje (zadržava prethodnu).
SELECT public.app_record_activity_ver('00000000-0000-0000-0000-000000000003',now(),'<script>','x');
-- Vraćanje na stariju verziju se bilježi.
SELECT public.app_record_activity_ver('00000000-0000-0000-0000-000000000003',now(),'v3.6.9','web');
SET LOCAL request.jwt.claim.sub='00000000-0000-0000-0000-000000000005';
DO $$ DECLARE r record; BEGIN
 SELECT * INTO r FROM public.admin_get_user_activity();
 IF r.app_version IS DISTINCT FROM 'v3.6.9' OR r.platforma IS DISTINCT FROM 'web' OR r.version_at IS NULL THEN
  RAISE EXCEPTION 'Admin ne vidi zadnju verziju: % %',r.app_version,r.platforma;END IF;
END $$;
SET LOCAL ROLE anon;
DO $$ BEGIN BEGIN PERFORM public.app_record_activity_ver('00000000-0000-0000-0000-000000000003',now(),'v1.0.0','apk');RAISE EXCEPTION 'Anon upis dopušten';EXCEPTION WHEN insufficient_privilege THEN NULL;END;END $$;
ROLLBACK;
\echo Verzija aplikacije: vlastiti nalog, validacija oblika, admin vidi, idempotentna migracija — OK
