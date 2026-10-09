-- Zadnja aktivnost u aplikaciji, nezavisna od zadnje prijave.
-- Pokrenuti jednom u Supabase SQL Editoru; ne mijenja korisnike ni odobrenja.
BEGIN;
CREATE TABLE IF NOT EXISTS public.app_user_activity (
 user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
 last_active_at timestamptz NOT NULL
);
ALTER TABLE public.app_user_activity ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.app_user_activity FROM anon, authenticated;
CREATE OR REPLACE FUNCTION public.app_record_activity(p_observed_at timestamptz DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_uid uuid := auth.uid(); v_time timestamptz;
BEGIN
 IF v_uid IS NULL OR NOT public.je_odobren() THEN RAISE EXCEPTION 'Pristup nije odobren' USING ERRCODE='42501'; END IF;
 -- Offline rad prijavljuje vrijeme opažanja; server ograničava budućnost i starost.
 v_time := least(now(),greatest(now()-interval '30 days',coalesce(p_observed_at,now())));
 INSERT INTO public.app_user_activity(user_id,last_active_at) VALUES(v_uid,v_time)
 ON CONFLICT(user_id) DO UPDATE SET last_active_at=greatest(public.app_user_activity.last_active_at,excluded.last_active_at)
 WHERE public.app_user_activity.last_active_at < excluded.last_active_at;
END $$;
CREATE OR REPLACE FUNCTION public.admin_get_user_activity()
RETURNS TABLE(user_id uuid,last_active_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
 SELECT a.user_id,a.last_active_at FROM public.app_user_activity a
 WHERE EXISTS(SELECT 1 FROM public.korisnici k WHERE k.id=auth.uid() AND k.is_admin IS TRUE);
$$;
REVOKE ALL ON FUNCTION public.app_record_activity(timestamptz) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_get_user_activity() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.app_record_activity(timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_user_activity() TO authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;
