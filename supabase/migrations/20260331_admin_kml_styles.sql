-- ============================================================
-- 1. Globalni stilovi slojeva (admin postavlja, svi čitaju)
-- ============================================================
CREATE TABLE IF NOT EXISTS kml_styles_global (
  key         TEXT PRIMARY KEY,
  col         TEXT        NOT NULL DEFAULT '#3b82f6',
  dash        TEXT        NOT NULL DEFAULT '',
  weight      FLOAT4      NOT NULL DEFAULT 2,
  opacity     FLOAT4      NOT NULL DEFAULT 0.9,
  vis         BOOLEAN     NOT NULL DEFAULT TRUE,
  updated_by  UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE kml_styles_global ENABLE ROW LEVEL SECURITY;

-- Svi prijavljeni korisnici mogu čitati globalne stilove
CREATE POLICY "kml_global_read" ON kml_styles_global
  FOR SELECT USING (true);

-- Samo admin može pisati
CREATE POLICY "kml_global_admin_write" ON kml_styles_global
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM korisnici
      WHERE id = auth.uid() AND is_admin = TRUE
    )
  );

-- ============================================================
-- 2. Ažuriraj get_login_email da podržava prazan prezime
--    (za org/admin naloge koji nemaju prezime)
-- ============================================================
CREATE OR REPLACE FUNCTION get_login_email(p_ime TEXT, p_prezime TEXT)
RETURNS TEXT
LANGUAGE SQL SECURITY DEFINER AS $$
  SELECT login_email FROM korisnici
  WHERE ime = p_ime
    AND prezime = p_prezime
  LIMIT 1;
$$;

-- ============================================================
-- 3. Kreiranje admin naloga "Unsko sanske šume" / PIN 2501
--    (bezbjedno — izvršava se samo ako nalog još ne postoji)
-- ============================================================
DO $$
DECLARE
  v_id    UUID := gen_random_uuid();
  v_email TEXT := 'admin.uss@tvlake.ba';
BEGIN
  -- Provjeri da li nalog već postoji
  IF EXISTS (SELECT 1 FROM korisnici WHERE ime = 'Unsko sanske šume' AND prezime = '') THEN
    RAISE NOTICE 'Admin nalog već postoji, preskačem.';
    RETURN;
  END IF;

  -- Kreiraj Supabase auth korisnika
  INSERT INTO auth.users (
    id, instance_id, email, encrypted_password,
    email_confirmed_at, created_at, updated_at,
    aud, role,
    raw_app_meta_data, raw_user_meta_data,
    is_super_admin, confirmation_token
  ) VALUES (
    v_id,
    '00000000-0000-0000-0000-000000000000',
    v_email,
    crypt('250100', gen_salt('bf')),   -- PIN "2501" + padding "00"
    now(), now(), now(),
    'authenticated', 'authenticated',
    '{"provider":"email","providers":["email"]}',
    '{}',
    FALSE, ''
  );

  -- Supabase v2 zahtijeva identities unos
  INSERT INTO auth.identities (
    id, user_id, identity_data, provider,
    last_sign_in_at, created_at, updated_at, provider_id
  ) VALUES (
    v_id, v_id,
    jsonb_build_object('sub', v_id::text, 'email', v_email),
    'email', now(), now(), now(), v_email
  );

  -- Kreiraj profil u korisnici tabeli
  INSERT INTO korisnici (id, ime, prezime, sumarija, login_email, boja, is_admin)
  VALUES (v_id, 'Unsko sanske šume', '', 'USŠ d.o.o.', v_email, '#fbbf24', TRUE);

  RAISE NOTICE 'Admin nalog "Unsko sanske šume" uspješno kreiran.';
END $$;
