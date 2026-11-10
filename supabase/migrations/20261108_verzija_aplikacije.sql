-- Verzija aplikacije po korisniku (admin → Korisnici).
-- Pokrenuti jednom u Supabase SQL Editoru. Ne dira korisnike ni odobrenja.
-- Bez ove migracije app i dalje bilježi aktivnost starim putem, a admin vidi
-- "verzija nepoznata".
BEGIN;
ALTER TABLE public.app_user_activity ADD COLUMN IF NOT EXISTS app_version text;
ALTER TABLE public.app_user_activity ADD COLUMN IF NOT EXISTS platforma text;
ALTER TABLE public.app_user_activity ADD COLUMN IF NOT EXISTS version_at timestamptz;

-- Aktivnost + verzija u jednom pozivu. Verzija se uvijek prepisuje (i unazad:
-- ako neko vrati stariji APK, admin treba to vidjeti), ali samo za nalog koji
-- je započeo poziv i samo u očekivanom obliku.
CREATE OR REPLACE FUNCTION public.app_record_activity_ver(
  p_user_id uuid, p_observed_at timestamptz, p_app_ver text, p_platforma text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_ver text; v_plat text;
BEGIN
 IF auth.uid() IS NULL OR auth.uid() IS DISTINCT FROM p_user_id THEN
  RAISE EXCEPTION 'Nalog je promijenjen' USING ERRCODE='42501';
 END IF;
 PERFORM public.app_record_activity(p_observed_at);
 v_ver := CASE WHEN p_app_ver ~ '^v?[0-9]{1,4}(\.[0-9]{1,4}){1,3}$' THEN p_app_ver END;
 v_plat := CASE WHEN p_platforma IN ('apk','web') THEN p_platforma END;
 IF v_ver IS NOT NULL THEN
  UPDATE public.app_user_activity
     SET app_version = v_ver, platforma = v_plat, version_at = now()
   WHERE user_id = p_user_id;
 END IF;
END $$;

-- Povratni tip se mijenja (nove kolone), pa CREATE OR REPLACE nije dovoljan.
DROP FUNCTION IF EXISTS public.admin_get_user_activity();
CREATE FUNCTION public.admin_get_user_activity()
RETURNS TABLE(user_id uuid,last_active_at timestamptz,app_version text,platforma text,version_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
 SELECT a.user_id,a.last_active_at,a.app_version,a.platforma,a.version_at FROM public.app_user_activity a
 WHERE EXISTS(SELECT 1 FROM public.korisnici k WHERE k.id=auth.uid() AND k.is_admin IS TRUE);
$$;

REVOKE ALL ON FUNCTION public.app_record_activity_ver(uuid,timestamptz,text,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_get_user_activity() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.app_record_activity_ver(uuid,timestamptz,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_user_activity() TO authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;
