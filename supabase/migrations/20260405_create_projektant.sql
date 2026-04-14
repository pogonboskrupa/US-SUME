-- ============================================================
-- Kreiranje projektanta bez odjave trenutnog korisnika
-- Poziva se kao sb.rpc('create_projektant', { p_ime, p_prezime, p_pin })
-- SECURITY DEFINER = izvršava se s pravima vlasnika funkcije (postgres)
-- ============================================================

CREATE OR REPLACE FUNCTION create_projektant(
  p_ime     TEXT,
  p_prezime TEXT,
  p_pin     TEXT
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_id       UUID    := gen_random_uuid();
  v_email    TEXT;
  v_sumarija TEXT;
  v_count    INT;
  v_boja     TEXT;
  v_colors   TEXT[]  := ARRAY[
    '#4ade80','#f97316','#818cf8','#fb7185',
    '#34d399','#fbbf24','#60a5fa','#a78bfa',
    '#f472b6','#2dd4bf','#facc15','#c084fc'
  ];
BEGIN
  -- Samo prijavljeni korisnik može kreirati
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Morate biti prijavljeni';
  END IF;

  -- Uzmi šumariju iz profila pozivaoca
  SELECT sumarija INTO v_sumarija
  FROM public.korisnici
  WHERE id = auth.uid();

  IF v_sumarija IS NULL THEN
    RAISE EXCEPTION 'Profil nije pronađen';
  END IF;

  -- Provjeri jedinstvenost imena
  IF EXISTS (
    SELECT 1 FROM public.korisnici
    WHERE ime = p_ime AND prezime = p_prezime
  ) THEN
    RAISE EXCEPTION 'Korisnik "% %" već postoji', p_ime, p_prezime;
  END IF;

  -- Provjeri PIN
  IF p_pin !~ '^\d{4,}$' THEN
    RAISE EXCEPTION 'PIN mora biti minimalno 4 cifre';
  END IF;

  -- Generiši interni email (nikad se ne prikazuje korisniku)
  v_email := lower(regexp_replace(p_ime,     '[^a-zA-Z]', '', 'g')) || '.' ||
             lower(regexp_replace(p_prezime,  '[^a-zA-Z]', '', 'g')) || '.' ||
             floor(extract(epoch FROM now()))::bigint || '@tvlake.ba';

  -- Boja prema redoslijedu u šumariji
  SELECT COUNT(*) INTO v_count
  FROM public.korisnici
  WHERE sumarija = v_sumarija;

  v_boja := v_colors[((v_count) % array_length(v_colors, 1)) + 1];

  -- Kreiraj auth korisnika
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
    crypt(rpad(p_pin, 6, '0'), gen_salt('bf')),
    now(), now(), now(),
    'authenticated', 'authenticated',
    '{"provider":"email","providers":["email"]}',
    '{}',
    FALSE, ''
  );

  -- Kreiraj identity (Supabase v2 zahtijeva)
  INSERT INTO auth.identities (
    id, user_id, identity_data, provider,
    last_sign_in_at, created_at, updated_at, provider_id
  ) VALUES (
    v_id, v_id,
    jsonb_build_object('sub', v_id::text, 'email', v_email),
    'email', now(), now(), now(), v_email
  );

  -- Kreiraj profil
  INSERT INTO public.korisnici (id, ime, prezime, sumarija, login_email, boja)
  VALUES (v_id, p_ime, p_prezime, v_sumarija, v_email, v_boja);

  RETURN v_id;
END;
$$;

-- Samo prijavljeni korisnici mogu zvati ovu funkciju
REVOKE ALL ON FUNCTION create_projektant(TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION create_projektant(TEXT, TEXT, TEXT) TO authenticated;

-- Dodaj strana kolonu za L/D identifikaciju kraka
ALTER TABLE vlake ADD COLUMN IF NOT EXISTS strana TEXT DEFAULT NULL;
