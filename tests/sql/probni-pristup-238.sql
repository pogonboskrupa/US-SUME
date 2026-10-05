\set ON_ERROR_STOP on
CREATE ROLE authenticated NOLOGIN; CREATE ROLE anon NOLOGIN;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
CREATE TABLE auth.users(id uuid PRIMARY KEY,created_at timestamptz NOT NULL,last_sign_in_at timestamptz);
CREATE TABLE public.korisnici(id uuid PRIMARY KEY REFERENCES auth.users(id),ime text,prezime text,sumarija text,login_email text,boja text,is_admin boolean DEFAULT false,odobren boolean DEFAULT false,je_vodeci boolean DEFAULT false,created_at timestamptz DEFAULT now(),prvo_odobren_at timestamptz);
-- Postojeći trigger iz migracije 20260727: povlaštene kolone se ne mogu samostalno promijeniti.
CREATE FUNCTION public.korisnici_zastita() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,auth AS $$
BEGIN
 IF auth.uid() IS NULL OR EXISTS(SELECT 1 FROM korisnici WHERE id=auth.uid() AND is_admin) THEN RETURN NEW; END IF;
 IF TG_OP='INSERT' THEN NEW.id:=auth.uid();NEW.is_admin:=false;NEW.odobren:=false;NEW.je_vodeci:=false;
 ELSE NEW.id:=OLD.id;NEW.is_admin:=OLD.is_admin;NEW.odobren:=OLD.odobren;NEW.je_vodeci:=OLD.je_vodeci;END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER trg_korisnici_zastita BEFORE INSERT OR UPDATE ON public.korisnici FOR EACH ROW EXECUTE FUNCTION public.korisnici_zastita();
INSERT INTO auth.users(id,created_at) VALUES
 ('00000000-0000-0000-0000-000000000001',now()-interval '6 days'),
 ('00000000-0000-0000-0000-000000000002',now()-interval '8 days'),
 ('00000000-0000-0000-0000-000000000003',now()-interval '30 days'),
 ('00000000-0000-0000-0000-000000000004',now()-interval '2 days'),
 ('00000000-0000-0000-0000-000000000005',now()-interval '60 days'),
 ('00000000-0000-0000-0000-000000000006',now());
INSERT INTO korisnici(id,created_at,odobren,prvo_odobren_at,is_admin)
 SELECT id,created_at,id::text LIKE '%003',CASE WHEN id::text LIKE '%003' OR id::text LIKE '%004' THEN created_at END,id::text LIKE '%005'
 FROM auth.users WHERE id::text NOT LIKE '%006';
\ir ../../supabase/migrations/20261005_probni_pristup_7_dana.sql
-- Isti rezultat nakon ponovnog pokretanja: probni rok se ne produžava.
\ir ../../supabase/migrations/20261005_probni_pristup_7_dana.sql
ALTER TABLE korisnici ENABLE ROW LEVEL SECURITY;
CREATE POLICY self_profile ON korisnici TO authenticated USING(id=auth.uid()) WITH CHECK(id=auth.uid());
GRANT USAGE ON SCHEMA public,auth TO authenticated;
GRANT SELECT,INSERT,UPDATE ON korisnici TO authenticated;
CREATE TABLE vlake(id int PRIMARY KEY,owner uuid NOT NULL);
ALTER TABLE vlake ENABLE ROW LEVEL SECURITY;
CREATE POLICY owner_only ON vlake TO authenticated USING(owner=auth.uid()) WITH CHECK(owner=auth.uid());
CREATE POLICY zzz_odobren ON vlake AS RESTRICTIVE TO authenticated USING(public.je_odobren()) WITH CHECK(public.je_odobren());
GRANT SELECT,INSERT ON vlake TO authenticated;
INSERT INTO vlake VALUES(1,'00000000-0000-0000-0000-000000000001'),(2,'00000000-0000-0000-0000-000000000002');
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false);
SET ROLE authenticated;
DO $$ BEGIN
 ASSERT je_odobren(),'Probni korisnik mora dobiti pristup';
 ASSERT (SELECT count(*)=1 FROM vlake),'RLS mora ostaviti samo vlastite vlake';
 UPDATE korisnici SET created_at=now()+interval '100 days',probni_do=now()+interval '100 days',prvo_odobren_at=now(),odobren=true,is_admin=true WHERE id=auth.uid();
 ASSERT (SELECT probni_do=created_at+interval '7 days' AND prvo_odobren_at IS NULL AND NOT odobren AND NOT is_admin FROM korisnici WHERE id=auth.uid()),'Zaštićeni datum/odobrenje ne smiju biti promijenjeni';
 INSERT INTO vlake VALUES(3,auth.uid());
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',false);
SET ROLE authenticated;
DO $$ BEGIN
 ASSERT NOT je_odobren(),'Probni rok mora isteći nakon sedam dana';
 ASSERT (SELECT count(*)=0 FROM vlake),'Istekli korisnik ne čita vlake';
 ASSERT check_own_pending_expiry()=false,'Stari APK ne smije obrisati nalog';
 BEGIN INSERT INTO vlake VALUES(4,auth.uid()); RAISE EXCEPTION 'RLS je dozvolio istekao upis'; EXCEPTION WHEN insufficient_privilege THEN NULL;END;
END $$;
RESET ROLE;
DO $$ BEGIN ASSERT internal_expire_stale_registrations()=0;ASSERT (SELECT count(*)=6 FROM auth.users);ASSERT (SELECT count(*)=5 FROM korisnici); END $$;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000004',false);
SET ROLE authenticated;
DO $$ BEGIN ASSERT NOT je_odobren(),'Ranije odobren pa opozvan nema novi probni rok';END $$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000006',false);
SET ROLE authenticated;
INSERT INTO korisnici(id,is_admin,odobren,created_at,probni_do,prvo_odobren_at) VALUES(auth.uid(),true,true,now()+interval '999 days',now()+interval '999 days',now());
DO $$ BEGIN ASSERT (SELECT NOT is_admin AND NOT odobren AND prvo_odobren_at IS NULL AND probni_do=created_at+interval '7 days' FROM korisnici WHERE id=auth.uid());ASSERT je_odobren();END $$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','',false);
UPDATE korisnici SET odobren=true WHERE id='00000000-0000-0000-0000-000000000002';
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',false);
SET ROLE authenticated;
DO $$ BEGIN ASSERT je_odobren(),'Adminovo naknadno odobrenje vraća pristup';END $$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000005',false);
SET ROLE authenticated;
DO $$ BEGIN ASSERT (SELECT count(*)=6 FROM admin_get_all_users()),'Admin vidi sve sačuvane zahtjeve';END $$;
RESET ROLE;
\echo Probni pristup: PostgreSQL/RLS, 7 dana, zaštita roka, opoziv, bez brisanja — OK
