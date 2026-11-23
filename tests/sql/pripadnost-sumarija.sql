\set ON_ERROR_STOP on
DO $$ BEGIN IF current_database()<>'codex_fixture' THEN RAISE EXCEPTION 'Samo testna baza codex_fixture'; END IF; END $$;
-- Oslanja se na stanje iz probni-pristup-238.sql (korisnici, je_odobren): 003 odobren, 005 admin.
CREATE TABLE IF NOT EXISTS public.sumarije(naziv text PRIMARY KEY, aktivna boolean NOT NULL DEFAULT true);
INSERT INTO public.sumarije(naziv,aktivna) VALUES ('ŠPD US ŠUME',true),('ŠUMARIJA CAZIN',true),('ŠUMARIJA STARA',false) ON CONFLICT DO NOTHING;
UPDATE public.korisnici SET sumarija='ŠPD US ŠUME' WHERE id='00000000-0000-0000-0000-000000000003';
UPDATE public.korisnici SET sumarija='ŠUMARIJA CAZIN' WHERE id='00000000-0000-0000-0000-000000000005';
\ir ../../supabase/migrations/20261123_pripadnost_sumarija.sql
-- Idempotentno: drugo pokretanje ne pada.
\ir ../../supabase/migrations/20261123_pripadnost_sumarija.sql
BEGIN;
SET LOCAL ROLE authenticated;
-- Terenski profil bira svoju pripadnost; ne smije nepostojeću, neaktivnu ni samu ŠPD.
SET LOCAL request.jwt.claim.sub='00000000-0000-0000-0000-000000000003';
SELECT public.postavi_svoju_pripadnost('ŠUMARIJA CAZIN');
DO $$ BEGIN
 BEGIN PERFORM public.postavi_svoju_pripadnost('ŠUMARIJA NEPOSTOJI');RAISE EXCEPTION 'Prihvaćena nepoznata šumarija';EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE 'Nepoznata%' THEN RAISE; END IF; END;
 BEGIN PERFORM public.postavi_svoju_pripadnost('ŠUMARIJA STARA');RAISE EXCEPTION 'Prihvaćena neaktivna šumarija';EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE 'Nepoznata%' THEN RAISE; END IF; END;
 BEGIN PERFORM public.postavi_svoju_pripadnost('ŠPD US ŠUME');RAISE EXCEPTION 'Prihvaćena ŠPD kao pripadnost';EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE 'Nepoznata%' THEN RAISE; END IF; END;
 BEGIN PERFORM public.admin_pripadnost_lista();RAISE EXCEPTION 'Ne-admin čita listu';EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE 'Pristup odbijen%' THEN RAISE; END IF; END;
 BEGIN PERFORM public.admin_set_pripadnost('00000000-0000-0000-0000-000000000003','ŠUMARIJA CAZIN');RAISE EXCEPTION 'Ne-admin postavlja';EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE 'Pristup odbijen%' THEN RAISE; END IF; END;
END $$;
-- Projektant (ne terenski) ne bira pripadnost.
SET LOCAL request.jwt.claim.sub='00000000-0000-0000-0000-000000000005';
DO $$ BEGIN
 IF (SELECT pripadnost FROM public.admin_pripadnost_lista() WHERE id='00000000-0000-0000-0000-000000000003') IS DISTINCT FROM 'ŠUMARIJA CAZIN' THEN RAISE EXCEPTION 'Admin ne vidi pripadnost'; END IF;
 IF EXISTS(SELECT 1 FROM public.admin_pripadnost_lista() WHERE id='00000000-0000-0000-0000-000000000005') THEN RAISE EXCEPTION 'Lista sadrži ne-terenski profil'; END IF;
 PERFORM public.admin_set_pripadnost('00000000-0000-0000-0000-000000000003',NULL);
 IF (SELECT pripadnost FROM public.korisnici WHERE id='00000000-0000-0000-0000-000000000003') IS NOT NULL THEN RAISE EXCEPTION 'Admin nije uklonio pripadnost'; END IF;
 BEGIN PERFORM public.admin_set_pripadnost('00000000-0000-0000-0000-000000000005','ŠUMARIJA CAZIN');RAISE EXCEPTION 'Pripadnost postavljena projektantu';EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE '%nije terenski%' THEN RAISE; END IF; END;
 BEGIN PERFORM public.postavi_svoju_pripadnost('ŠUMARIJA CAZIN');RAISE EXCEPTION 'Projektant bira pripadnost';EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE '%samo terenski%' THEN RAISE; END IF; END;
END $$;
SET LOCAL ROLE anon;
DO $$ BEGIN BEGIN PERFORM public.postavi_svoju_pripadnost('ŠUMARIJA CAZIN');RAISE EXCEPTION 'Anon upis dopušten';EXCEPTION WHEN insufficient_privilege THEN NULL;END;END $$;
ROLLBACK;
\echo Pripadnost šumariji: terenski bira sebi, admin postavlja i čita, validacija, idempotentna migracija — OK
