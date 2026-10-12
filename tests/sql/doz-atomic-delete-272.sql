\set ON_ERROR_STOP on
-- Pokrenuti nakon probni-pristup-238.sql, isključivo u codex_fixture.
DO $$ BEGIN IF current_database()<>'codex_fixture' THEN RAISE EXCEPTION 'Samo testna baza codex_fixture'; END IF; END $$;
BEGIN;
CREATE TABLE public.doz_projects(id uuid PRIMARY KEY,created_by uuid NOT NULL);
CREATE TABLE public.doz_project_members(project_id uuid REFERENCES doz_projects(id),user_id uuid,role text,is_active boolean);
CREATE TABLE public.doz_area_markings(id int PRIMARY KEY,project_id uuid REFERENCES doz_projects(id));
CREATE TABLE public.doz_track_points(id int PRIMARY KEY,project_id uuid REFERENCES doz_projects(id),user_id uuid);
\ir ../../supabase/migrations/20261009_doz_atomic_delete.sql
\ir ../../supabase/migrations/20261009_doz_atomic_delete.sql
INSERT INTO doz_projects VALUES('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000003'),('10000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000003');
INSERT INTO doz_project_members VALUES('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000005','manager',false),('10000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000005','manager',true);
INSERT INTO doz_area_markings VALUES(1,'10000000-0000-0000-0000-000000000001'),(2,'10000000-0000-0000-0000-000000000002');
INSERT INTO doz_track_points VALUES(1,'10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001'),(2,'10000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000005');
GRANT SELECT ON doz_projects,doz_project_members,doz_area_markings,doz_track_points TO authenticated;
CREATE FUNCTION public.fixture_fail_delete() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'fixture failure'; END $$;
CREATE TRIGGER fixture_fail BEFORE DELETE ON doz_project_members FOR EACH ROW EXECUTE FUNCTION fixture_fail_delete();
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub='00000000-0000-0000-0000-000000000003';
DO $$ BEGIN
 BEGIN PERFORM codex_delete_doz_project('10000000-0000-0000-0000-000000000001');RAISE EXCEPTION 'Očekivan pad';EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'fixture failure' THEN RAISE; END IF; END;
 IF (SELECT count(*) FROM doz_projects)<>2 OR (SELECT count(*) FROM doz_area_markings)<>2 OR (SELECT count(*) FROM doz_track_points)<>2 THEN RAISE EXCEPTION 'Nije vraćena cijela transakcija'; END IF;
END $$;
RESET ROLE;
DROP TRIGGER fixture_fail ON doz_project_members;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub='00000000-0000-0000-0000-000000000002';
DO $$ BEGIN BEGIN PERFORM codex_delete_doz_project('10000000-0000-0000-0000-000000000001');RAISE EXCEPTION 'Istekao pristup smije brisati';EXCEPTION WHEN insufficient_privilege THEN NULL;END;END $$;
SET LOCAL request.jwt.claim.sub='00000000-0000-0000-0000-000000000001';
DO $$ BEGIN BEGIN PERFORM codex_delete_doz_project('10000000-0000-0000-0000-000000000001');RAISE EXCEPTION 'Nečlan smije brisati';EXCEPTION WHEN insufficient_privilege THEN NULL;END;END $$;
SET LOCAL request.jwt.claim.sub='00000000-0000-0000-0000-000000000005';
DO $$ BEGIN
 BEGIN PERFORM codex_delete_doz_project('10000000-0000-0000-0000-000000000001');RAISE EXCEPTION 'Neaktivan manager smije brisati';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 IF (codex_delete_doz_project('10000000-0000-0000-0000-000000000002')->>'deleted')<>'true' THEN RAISE EXCEPTION 'Manager nije dobio potvrdu';END IF;
 IF (SELECT count(*) FROM doz_projects)<>1 OR (SELECT count(*) FROM doz_track_points)<>1 OR (SELECT count(*) FROM doz_project_members)<>1 OR (SELECT count(*) FROM doz_area_markings)<>1 THEN RAISE EXCEPTION 'Obrisan drugi projekat ili ostala djeca';END IF;
END $$;
SET LOCAL request.jwt.claim.sub='00000000-0000-0000-0000-000000000003';
DO $$ BEGIN
 IF (codex_delete_doz_project('10000000-0000-0000-0000-000000000001')->>'project_id')<>'10000000-0000-0000-0000-000000000001' THEN RAISE EXCEPTION 'Pogrešna potvrda';END IF;
 IF EXISTS(SELECT 1 FROM doz_track_points) OR EXISTS(SELECT 1 FROM doz_projects) THEN RAISE EXCEPTION 'Podaci nisu obrisani';END IF;
 BEGIN PERFORM codex_delete_doz_project('10000000-0000-0000-0000-000000000001');RAISE EXCEPTION 'Nepostojeći projekat potvrđen';EXCEPTION WHEN no_data_found THEN NULL;END;
 IF has_function_privilege('anon','public.codex_delete_doz_project(uuid)','EXECUTE') THEN RAISE EXCEPTION 'Anon pristup';END IF;
END $$;
RESET ROLE;
ROLLBACK;
\echo 'Atomic delete: rollback, authorization/trial, manager, exact scope and confirmation — OK'
