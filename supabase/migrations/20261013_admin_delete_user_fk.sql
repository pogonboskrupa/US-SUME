-- Dendro Map 3.0.0: brisanje korisnika je padalo na
--   update or delete on table "users" violates foreign key constraint
--   "loc_fotos_korisnik_id_fkey" on table "loc_fotos"
-- admin_delete_user je ranije kreiran ručno (nije u migracijama), a tabele
-- koje upućuju na korisnika (loc_fotos i druge kreirane van repoa) nemaju
-- ON DELETE pravilo. Umjesto nabrajanja tabela koje repo ne vidi, funkcija
-- sama pronađe SVAKI strani ključ prema auth.users / public.korisnici koji
-- bi blokirao brisanje i razriješi ga:
--   * kolona smije biti NULL  -> SET NULL (zajednički podaci ostaju timu)
--   * kolona je NOT NULL      -> red se briše (lični podaci tog korisnika)
-- Ključevi koji već imaju CASCADE / SET NULL se ne diraju — baza ih sama
-- obavi. Sve je u jednoj transakciji: pad bilo kojeg koraka ne ostavlja
-- djelimično obrisanog korisnika.
--
-- Pokrenuti ručno u Supabase SQL Editoru.

DROP FUNCTION IF EXISTS public.admin_delete_user(uuid);

CREATE FUNCTION public.admin_delete_user(target_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $$
DECLARE
  fk record;
  n bigint;
  ociscen jsonb := '{}'::jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.je_admin() THEN
    RAISE EXCEPTION 'Samo admin može brisati korisnike' USING ERRCODE = '42501';
  END IF;
  IF target_id IS NULL THEN
    RAISE EXCEPTION 'Korisnik nije naveden' USING ERRCODE = '22004';
  END IF;
  IF target_id = auth.uid() THEN
    RAISE EXCEPTION 'Admin ne može obrisati vlastiti nalog' USING ERRCODE = '42501';
  END IF;

  FOR fk IN
    SELECT c.conrelid::regclass AS tabela,
           a.attname            AS kolona,
           a.attnotnull         AS obavezna
    FROM pg_constraint c
    JOIN pg_attribute a
      ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
    WHERE c.contype = 'f'
      AND array_length(c.conkey, 1) = 1
      AND c.confrelid IN ('auth.users'::regclass, 'public.korisnici'::regclass)
      AND c.conrelid <> 'public.korisnici'::regclass
      AND c.confdeltype IN ('a', 'r')          -- NO ACTION / RESTRICT
  LOOP
    IF fk.obavezna THEN
      EXECUTE format('DELETE FROM %s WHERE %I = $1', fk.tabela, fk.kolona) USING target_id;
    ELSE
      EXECUTE format('UPDATE %s SET %I = NULL WHERE %I = $1', fk.tabela, fk.kolona, fk.kolona) USING target_id;
    END IF;
    GET DIAGNOSTICS n = ROW_COUNT;
    IF n > 0 THEN
      ociscen := ociscen || jsonb_build_object(fk.tabela::text || '.' || fk.kolona, n);
    END IF;
  END LOOP;

  DELETE FROM public.korisnici WHERE id = target_id;
  DELETE FROM auth.users WHERE id = target_id;

  RETURN jsonb_build_object('deleted', true, 'id', target_id, 'ocisceno', ociscen);
END $$;

REVOKE ALL ON FUNCTION public.admin_delete_user(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_delete_user(uuid) TO authenticated;
NOTIFY pgrst, 'reload schema';
