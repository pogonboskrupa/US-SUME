-- PRIPREMLJENO I TESTIRANO LOKALNO; nije izvršeno na produkciji.
-- Dendro Map 2.7.2: brisanje odjela i cijelog tima u jednoj transakciji.
-- Pozvati samo na izričit zahtjev kreatora/aktivnog managera. Nema promjene RLS-a.
CREATE OR REPLACE FUNCTION public.codex_delete_doz_project(pid uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $$
DECLARE
  actor uuid := auth.uid();
  creator uuid;
  removed uuid;
BEGIN
  IF actor IS NULL OR NOT public.je_odobren() THEN
    RAISE EXCEPTION 'Prijava i aktivan pristup su potrebni' USING ERRCODE='42501';
  END IF;
  SELECT created_by INTO creator FROM public.doz_projects WHERE id=pid FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Odjel nije dostupan; brisanje nije potvrđeno' USING ERRCODE='P0002';
  END IF;
  IF creator IS DISTINCT FROM actor AND NOT EXISTS(
    SELECT 1 FROM public.doz_project_members
    WHERE project_id=pid AND user_id=actor AND role='manager' AND is_active IS TRUE
  ) THEN
    RAISE EXCEPTION 'Odjel može obrisati samo kreator ili aktivni manager' USING ERRCODE='42501';
  END IF;
  DELETE FROM public.doz_track_points WHERE project_id=pid;
  DELETE FROM public.doz_area_markings WHERE project_id=pid;
  DELETE FROM public.doz_project_members WHERE project_id=pid;
  DELETE FROM public.doz_projects WHERE id=pid RETURNING id INTO removed;
  IF removed IS NULL THEN
    RAISE EXCEPTION 'Brisanje odjela nije potvrđeno' USING ERRCODE='P0002';
  END IF;
  RETURN jsonb_build_object('deleted',true,'project_id',removed);
END $$;
REVOKE ALL ON FUNCTION public.codex_delete_doz_project(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.codex_delete_doz_project(uuid) TO authenticated;
NOTIFY pgrst, 'reload schema';
