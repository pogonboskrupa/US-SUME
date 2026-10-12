-- SAMO PRAZNA LOKALNA TESTNA BAZA. Kreira lažne naloge i tabele.
-- Uvozi stvarne politike dijeljenja iz repoa; nije produkcijska migracija.
\set ON_ERROR_STOP on
\ir probni-pristup-238.sql
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','',false);
DROP TABLE public.vlake;
CREATE TABLE projekti(id uuid PRIMARY KEY,korisnik_id uuid REFERENCES korisnici(id),odjel text,gj text,povrsina double precision,datum text);
CREATE TABLE projekt_clanovi(projekt_id uuid REFERENCES projekti(id),korisnik_id uuid REFERENCES korisnici(id),added_by uuid REFERENCES korisnici(id),PRIMARY KEY(projekt_id,korisnik_id));
CREATE TABLE vlake(id integer PRIMARY KEY,projekt_id uuid REFERENCES projekti(id),korisnik_id uuid REFERENCES korisnici(id),nm text,br int,kr int,strana text,boja text,lager jsonb,pts jsonb);
CREATE TABLE doz_projects(id uuid PRIMARY KEY,created_by uuid REFERENCES korisnici(id),name text,known_area_ha double precision);
CREATE TABLE doz_project_members(project_id uuid REFERENCES doz_projects(id),user_id uuid REFERENCES korisnici(id),role text,track_color text,order_index int,is_active boolean,PRIMARY KEY(project_id,user_id));
CREATE TABLE doz_area_markings(project_id uuid,created_by uuid,marking_type text,label text,note text,boundary_geojson jsonb,area_ha double precision,is_visible boolean);
CREATE TABLE doz_track_points(project_id uuid,user_id uuid);
\ir ../../supabase/migrations/20260713_dijeljenje_popravka.sql
-- Pristup gate iz 20260727 je dodatna restrictive politika, ne zamjena za
-- vlasništvo. Namjerno ne uvozimo cijelu staru migraciju koja odobrava sve.
DO $$DECLARE t text;BEGIN
 FOREACH t IN ARRAY ARRAY['projekti','projekt_clanovi','vlake','doz_projects','doz_project_members','doz_area_markings','doz_track_points'] LOOP
  EXECUTE format('CREATE POLICY zzz_odobren ON %I AS RESTRICTIVE FOR ALL TO authenticated USING(public.je_odobren()) WITH CHECK(public.je_odobren())',t);
 END LOOP;
END$$;
GRANT SELECT,INSERT,UPDATE,DELETE ON projekti,projekt_clanovi,vlake,doz_projects,doz_project_members,doz_area_markings,doz_track_points TO authenticated;

-- Novi probni korisnik (006) pokušava dodati kolegu u još neposlan projekat.
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000006',false);
SET ROLE authenticated;
DO $$BEGIN
 ASSERT je_odobren(),'Novi korisnik u probnom roku mora imati pristup';
 BEGIN
  INSERT INTO projekt_clanovi VALUES('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000003',auth.uid());
  RAISE EXCEPTION 'Ocekivana RLS zabrana: projekat jos nije na serveru';
 EXCEPTION WHEN insufficient_privilege THEN
  ASSERT SQLERRM LIKE '%row-level security policy for table "projekt_clanovi"%';
 END;
 -- Nakon potvrđenog slanja istog projekta isto članstvo prolazi.
 INSERT INTO projekti VALUES('10000000-0000-0000-0000-000000000001',auth.uid(),'TEST',NULL,NULL,NULL);
 INSERT INTO projekt_clanovi VALUES('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000003',auth.uid());
 INSERT INTO vlake(id,projekt_id,korisnik_id,nm) VALUES(1,'10000000-0000-0000-0000-000000000001',auth.uid(),'T1');
END$$;
RESET ROLE;

-- Kolega dobiva projekt i vlaku, ali nema pravo sam dodavati nove članove.
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',false);
SET ROLE authenticated;
DO $$BEGIN
 ASSERT (SELECT count(*)=1 FROM projekti),'Clan mora vidjeti projekt';
 ASSERT (SELECT count(*)=1 FROM vlake),'Clan mora vidjeti vlaku kolege';
 BEGIN
  INSERT INTO projekt_clanovi VALUES('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001',auth.uid());
  RAISE EXCEPTION 'Clan ne smije sam siriti projekt';
 EXCEPTION WHEN insufficient_privilege THEN NULL;END;
END$$;
RESET ROLE;

-- Stari je_odobren (npr. vraćen starom migracijom) odbija isti novi nalog.
CREATE OR REPLACE FUNCTION je_odobren() RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE SET search_path=public,auth AS $$
 SELECT coalesce((SELECT coalesce(odobren,false) OR coalesce(is_admin,false) FROM korisnici WHERE id=auth.uid()),false)
$$;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000006',false);
SET ROLE authenticated;
DO $$BEGIN
 ASSERT NOT je_odobren();
 ASSERT (SELECT count(*)=0 FROM projekti),'RLS SELECT bez pristupa vraca prazan rezultat, ne gresku';
 BEGIN
  INSERT INTO projekt_clanovi VALUES('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001',auth.uid());
  RAISE EXCEPTION 'Stari gate mora odbiti probni korisnik';
 EXCEPTION WHEN insufficient_privilege THEN NULL;END;
END$$;
RESET ROLE;
\ir ../../supabase/migrations/20261005_probni_pristup_7_dana.sql
SET ROLE authenticated;
DO $$BEGIN
 ASSERT je_odobren(),'Vracen probni gate';
 INSERT INTO projekt_clanovi VALUES('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001',auth.uid());
END$$;
RESET ROLE;

-- Probni kolega sada vidi rad. RLS zavisi od onoga ko zove server, ne samo
-- od odobrenja kolege kojeg vlasnik dodaje.
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false);
SET ROLE authenticated;
DO $$BEGIN ASSERT je_odobren();ASSERT (SELECT count(*)=1 FROM projekti);ASSERT (SELECT count(*)=1 FROM vlake);END$$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','',false);
INSERT INTO auth.users(id,created_at) VALUES('00000000-0000-0000-0000-000000000007',now()-interval '8 days');
INSERT INTO korisnici(id) VALUES('00000000-0000-0000-0000-000000000007');
INSERT INTO projekt_clanovi VALUES('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000007','00000000-0000-0000-0000-000000000006');
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000007',false);
SET ROLE authenticated;
DO $$BEGIN ASSERT NOT je_odobren();ASSERT (SELECT count(*)=0 FROM projekti);ASSERT (SELECT count(*)=0 FROM vlake);END$$;
RESET ROLE;
\echo Server clanstvo: neposlan projekt, probni vlasnik/clan, stari gate i istekao SELECT — OK
