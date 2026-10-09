\set ON_ERROR_STOP on
DO $$ BEGIN IF current_database()<>'codex_fixture' THEN RAISE EXCEPTION 'Samo testna baza codex_fixture'; END IF; END $$;
\ir ../../supabase/migrations/20261009_app_user_activity.sql
\ir ../../supabase/migrations/20261009_app_user_activity.sql
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub='00000000-0000-0000-0000-000000000003';
SELECT public.app_record_activity_for_user('00000000-0000-0000-0000-000000000003',now()-interval '2 hours');
DO $$ BEGIN
 BEGIN PERFORM public.app_record_activity_for_user('00000000-0000-0000-0000-000000000005',now());RAISE EXCEPTION 'Aktivnost pripisana promijenjenom nalogu';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 IF (SELECT count(*) FROM public.admin_get_user_activity())<>0 THEN RAISE EXCEPTION 'Projektant vidi tuđu aktivnost';END IF;
 BEGIN INSERT INTO public.app_user_activity VALUES('00000000-0000-0000-0000-000000000005',now());RAISE EXCEPTION 'Direktan upis dopušten';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
END $$;
SELECT public.app_record_activity(now()-interval '4 hours');
RESET ROLE;
DO $$ BEGIN IF (SELECT last_active_at FROM public.app_user_activity LIMIT 1)<>now()-interval '2 hours' THEN RAISE EXCEPTION 'Stariji offline događaj prepisao noviji';END IF;END $$;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub='00000000-0000-0000-0000-000000000005';
DO $$ BEGIN IF (SELECT count(*) FROM public.admin_get_user_activity())<>1 THEN RAISE EXCEPTION 'Admin ne vidi zapis';END IF;END $$;
SET LOCAL request.jwt.claim.sub='00000000-0000-0000-0000-000000000003';
SELECT public.app_record_activity(now()+interval '3 days');
RESET ROLE;
DO $$ BEGIN IF (SELECT last_active_at FROM public.app_user_activity LIMIT 1)>now() THEN RAISE EXCEPTION 'Buduća aktivnost prihvaćena';END IF;END $$;
SET LOCAL ROLE anon;
DO $$ BEGIN BEGIN PERFORM public.app_record_activity(now());RAISE EXCEPTION 'Anon upis dopušten';EXCEPTION WHEN insufficient_privilege THEN NULL;END;END $$;
ROLLBACK;
\echo Activity: own identity, admin visibility, stale/future timestamps, direct writes blocked, idempotent migration — OK
