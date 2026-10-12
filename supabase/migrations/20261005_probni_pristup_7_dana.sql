-- Primijeniti jednom u Supabase SQL Editoru. Nema brisanja naloga/podataka.
-- Oslanja se na postojeće migracije pristupa 20260727/28/30.
BEGIN;
ALTER TABLE public.korisnici ADD COLUMN IF NOT EXISTS probni_do timestamptz;

-- Datum registracije iz auth.users je autoritativan; postojeći čekatelji ne
-- dobivaju novih sedam dana od dana migracije. Opozvani ne dobivaju probni pristup.
UPDATE public.korisnici k SET probni_do=u.created_at+interval '7 days'
FROM auth.users u WHERE k.id=u.id AND k.probni_do IS NULL
 AND k.prvo_odobren_at IS NULL AND k.odobren=false AND NOT coalesce(k.is_admin,false);

CREATE OR REPLACE FUNCTION public.korisnici_probni_rok_zastita()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,auth AS $$
DECLARE v_registered timestamptz; v_admin boolean;
BEGIN
 IF TG_OP='INSERT' THEN
  SELECT u.created_at INTO v_registered FROM auth.users u WHERE u.id=NEW.id;
  IF v_registered IS NULL THEN RAISE EXCEPTION 'Nedostaje registracija korisnika'; END IF;
  NEW.created_at:=v_registered;
  NEW.probni_do:=v_registered+interval '7 days';
  NEW.prvo_odobren_at:=CASE WHEN NEW.odobren IS TRUE OR NEW.is_admin IS TRUE THEN now() ELSE NULL END;
 ELSE
  NEW.created_at:=OLD.created_at;
  NEW.probni_do:=OLD.probni_do;
  SELECT coalesce(k.is_admin,false) INTO v_admin FROM public.korisnici k WHERE k.id=auth.uid();
  IF auth.uid() IS NOT NULL AND NOT coalesce(v_admin,false) THEN
   NEW.prvo_odobren_at:=OLD.prvo_odobren_at;
  ELSE
   NEW.prvo_odobren_at:=coalesce(OLD.prvo_odobren_at,CASE WHEN NEW.odobren IS TRUE THEN now() ELSE NEW.prvo_odobren_at END);
  END IF;
 END IF;
 RETURN NEW;
END $$;
-- Izvršava se POSLIJE trg_korisnici_zastita (abecedni redoslijed), da sam
-- korisnik ne postavi odobrenje, prvi datum ili produži probni rok.
DROP TRIGGER IF EXISTS trg_zz_korisnici_probni_rok ON public.korisnici;
CREATE TRIGGER trg_zz_korisnici_probni_rok BEFORE INSERT OR UPDATE ON public.korisnici
 FOR EACH ROW EXECUTE FUNCTION public.korisnici_probni_rok_zastita();
REVOKE ALL ON FUNCTION public.korisnici_probni_rok_zastita() FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.je_odobren()
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE SET search_path=public,auth AS $$
 SELECT coalesce((SELECT coalesce(k.odobren,false) OR coalesce(k.is_admin,false)
  OR (k.odobren=false AND k.prvo_odobren_at IS NULL AND k.probni_do>now())
  FROM public.korisnici k WHERE k.id=auth.uid()),false);
$$;
REVOKE ALL ON FUNCTION public.je_odobren() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.je_odobren() TO authenticated;
-- Postojeće restrictive RLS politike i SECURITY DEFINER provjere koriste
-- je_odobren(); članstva, vlasništvo i administrativne uloge nisu proširene.

-- Neutralizuje stare pozivaoce (stari APK/admin RPC); rok više NE briše nalog.
CREATE OR REPLACE FUNCTION public.internal_expire_stale_registrations()
RETURNS integer LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$ SELECT 0; $$;
REVOKE ALL ON FUNCTION public.internal_expire_stale_registrations() FROM PUBLIC,authenticated,anon;
CREATE OR REPLACE FUNCTION public.check_own_pending_expiry()
RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$ SELECT false; $$;
REVOKE ALL ON FUNCTION public.check_own_pending_expiry() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_own_pending_expiry() TO authenticated;

-- Isti povratni potpis kao 20260730: datum je kraj probnog rada, a ne brisanja.
CREATE OR REPLACE FUNCTION public.admin_get_all_users()
RETURNS TABLE(id uuid,ime text,prezime text,sumarija text,login_email text,boja text,
 is_admin boolean,odobren boolean,je_vodeci boolean,created_at timestamptz,
 last_sign_in_at timestamptz,istice_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,auth AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.korisnici a WHERE a.id=auth.uid() AND a.is_admin=true) THEN
  RAISE EXCEPTION 'Pristup odbijen — samo admin';
 END IF;
 RETURN QUERY SELECT k.id,k.ime,k.prezime,k.sumarija,k.login_email,k.boja,k.is_admin,
  k.odobren,k.je_vodeci,k.created_at,u.last_sign_in_at,
  CASE WHEN k.odobren=false AND k.prvo_odobren_at IS NULL AND NOT coalesce(k.is_admin,false)
   THEN k.probni_do END
 FROM public.korisnici k LEFT JOIN auth.users u ON u.id=k.id
 ORDER BY k.odobren ASC,k.sumarija,k.ime;
END $$;
REVOKE ALL ON FUNCTION public.admin_get_all_users() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_get_all_users() TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
