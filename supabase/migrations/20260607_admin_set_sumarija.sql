-- ============================================================
-- Admin: prebaci korisnika u drugu šumariju
-- SECURITY DEFINER — izvršava se s pravima vlasnika (postgres),
-- zaobilazi RLS koji blokira direktni UPDATE na korisnici tabeli.
-- ============================================================

CREATE OR REPLACE FUNCTION admin_set_sumarija(
  p_user_id  UUID,
  p_sumarija TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Samo admin može koristiti ovu funkciju
  IF NOT EXISTS (
    SELECT 1 FROM korisnici WHERE id = auth.uid() AND is_admin = TRUE
  ) THEN
    RAISE EXCEPTION 'Pristup odbijen — samo admin';
  END IF;

  -- Ne dozvoli mijenjanje adminu samom sebi ili drugom adminu
  IF EXISTS (
    SELECT 1 FROM korisnici WHERE id = p_user_id AND is_admin = TRUE
  ) THEN
    RAISE EXCEPTION 'Admin nalog se ne može premještati';
  END IF;

  UPDATE korisnici SET sumarija = p_sumarija WHERE id = p_user_id;
END;
$$;

-- Samo prijavljeni korisnici mogu zvati ovu funkciju
REVOKE ALL ON FUNCTION admin_set_sumarija(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION admin_set_sumarija(UUID, TEXT) TO authenticated;
