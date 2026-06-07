-- ============================================================
-- Admin funkcije v2
-- Oba upita idu kroz SECURITY DEFINER da zaobiđu RLS koji
-- ograničava SELECT/UPDATE samo na redove iste šumarije.
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
    SELECT 1 FROM korisnici WHERE id = auth.uid() AND is_admin = TRUE
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
    SELECT 1 FROM korisnici WHERE id = auth.uid() AND is_admin = TRUE
  ) THEN
    RAISE EXCEPTION 'Pristup odbijen — samo admin';
  END IF;

  IF EXISTS (
    SELECT 1 FROM korisnici WHERE id = p_user_id AND is_admin = TRUE
  ) THEN
    RAISE EXCEPTION 'Admin nalog se ne može premještati';
  END IF;

  UPDATE korisnici SET sumarija = p_sumarija WHERE id = p_user_id;
END;
$$;

REVOKE ALL ON FUNCTION admin_set_sumarija(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION admin_set_sumarija(UUID, TEXT) TO authenticated;
