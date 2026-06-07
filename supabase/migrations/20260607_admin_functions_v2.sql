-- ============================================================
-- Admin funkcije v2 (LANGUAGE sql — nema PL/pgSQL varijabli)
-- LANGUAGE sql nema problem s OUT-param shadowingom koji se
-- dešava u plpgsql RETURNS TABLE funkcijama.
-- ============================================================

-- ─── 1. Dohvati SVE korisnike (za admin panel) ───────────────
-- LANGUAGE sql: nema BEGIN/END, nema OUT column shadow problema.
-- WHERE EXISTS provjera: ako pozivalac nije admin, vraća prazno.
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
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT
    k.id, k.ime, k.prezime, k.sumarija,
    k.login_email, k.boja, k.is_admin, k.created_at
  FROM korisnici k
  WHERE EXISTS (
    SELECT 1 FROM korisnici a
    WHERE a.id = auth.uid() AND a.is_admin = TRUE
  )
  ORDER BY k.sumarija, k.ime
$$;

REVOKE ALL ON FUNCTION admin_get_all_users() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION admin_get_all_users() TO authenticated;


-- ─── 2. Prebaci korisnika u drugu šumariju ───────────────────
-- RETURNS VOID — nema OUT parametara, ali koristimo DECLARE/INTO
-- da izbjegnemo svaki unqualified column u subqueryima.
CREATE OR REPLACE FUNCTION admin_set_sumarija(
  p_user_id  UUID,
  p_sumarija TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_caller_admin  BOOLEAN;
  v_target_admin  BOOLEAN;
BEGIN
  SELECT k.is_admin INTO v_caller_admin
    FROM korisnici k WHERE k.id = auth.uid();

  IF NOT COALESCE(v_caller_admin, FALSE) THEN
    RAISE EXCEPTION 'Pristup odbijen — samo admin';
  END IF;

  SELECT k.is_admin INTO v_target_admin
    FROM korisnici k WHERE k.id = p_user_id;

  IF COALESCE(v_target_admin, FALSE) THEN
    RAISE EXCEPTION 'Admin nalog se ne može premještati';
  END IF;

  UPDATE korisnici SET sumarija = p_sumarija
    WHERE korisnici.id = p_user_id;
END;
$$;

REVOKE ALL ON FUNCTION admin_set_sumarija(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION admin_set_sumarija(UUID, TEXT) TO authenticated;
