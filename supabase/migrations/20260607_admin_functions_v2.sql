-- ============================================================
-- Admin funkcije v2 (fixed: column reference ambiguity)
-- RETURNS TABLE output columns shadow unqualified names inside
-- the function body — sve WHERE klauzule moraju koristiti alias.
-- ============================================================

-- ─── 1. Dohvati SVE korisnike (za admin panel) ───────────────
CREATE OR REPLACE FUNCTION admin_get_all_users()
RETURNS TABLE(
  id           UUID,
  ime          TEXT,
  prezime      TEXT,
  sumarija     TEXT,
  login_email  TEXT,
  boja         TEXT,
  is_admin     BOOLEAN,
  created_at   TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM korisnici AS a WHERE a.id = auth.uid() AND a.is_admin = TRUE
  ) THEN
    RAISE EXCEPTION 'Pristup odbijen — samo admin';
  END IF;

  RETURN QUERY
    SELECT k.id, k.ime, k.prezime, k.sumarija,
           k.login_email, k.boja, k.is_admin, k.created_at
    FROM   korisnici k
    ORDER  BY k.sumarija, k.ime;
END;
$$;

REVOKE ALL ON FUNCTION admin_get_all_users() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION admin_get_all_users() TO authenticated;


-- ─── 2. Prebaci korisnika u drugu šumariju ───────────────────
CREATE OR REPLACE FUNCTION admin_set_sumarija(
  p_user_id  UUID,
  p_sumarija TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM korisnici AS a WHERE a.id = auth.uid() AND a.is_admin = TRUE
  ) THEN
    RAISE EXCEPTION 'Pristup odbijen — samo admin';
  END IF;

  IF EXISTS (
    SELECT 1 FROM korisnici AS b WHERE b.id = p_user_id AND b.is_admin = TRUE
  ) THEN
    RAISE EXCEPTION 'Admin nalog se ne može premještati';
  END IF;

  UPDATE korisnici SET sumarija = p_sumarija WHERE korisnici.id = p_user_id;
END;
$$;

REVOKE ALL ON FUNCTION admin_set_sumarija(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION admin_set_sumarija(UUID, TEXT) TO authenticated;
