-- v4.7.4: pripadnost terenskog profila šumariji.
-- Terenski profil ostaje u šumariji 'ŠPD US ŠUME' (po njoj app zna da je terenski — isSpd()),
-- pa se pripadnost čuva u ZASEBNOJ koloni. Služi samo kao oznaka: lakše povezivanje kolega
-- (Grupe korisnika, zadane kolege) i pregled kod admina. Ne mijenja nijedno pravo pristupa.
-- Pokrenuti ručno u Supabase SQL Editoru.
BEGIN;

ALTER TABLE public.korisnici ADD COLUMN IF NOT EXISTS pripadnost text;

-- Provjera naziva: aktivna šumarija, nikad sama 'ŠPD US ŠUME'. NULL = nije odabrano.
CREATE OR REPLACE FUNCTION public._pripadnost_ispravna(p text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT p IS NULL OR (p <> 'ŠPD US ŠUME' AND EXISTS(SELECT 1 FROM public.sumarije s WHERE s.naziv=p AND s.aktivna));
$$;
REVOKE ALL ON FUNCTION public._pripadnost_ispravna(text) FROM PUBLIC;

-- Korisnik terenskog profila bira svoju pripadnost (Meni → Moj nalog).
CREATE OR REPLACE FUNCTION public.postavi_svoju_pripadnost(p_sumarija text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,auth AS $$
DECLARE v text := nullif(btrim(coalesce(p_sumarija,'')),'');
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Nisi prijavljen'; END IF;
 IF NOT public.je_odobren() THEN RAISE EXCEPTION 'Pristup odbijen'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.korisnici k WHERE k.id=auth.uid() AND k.sumarija='ŠPD US ŠUME') THEN
  RAISE EXCEPTION 'Pripadnost šumariji bira samo terenski profil';
 END IF;
 IF NOT public._pripadnost_ispravna(v) THEN RAISE EXCEPTION 'Nepoznata šumarija: %', v; END IF;
 UPDATE public.korisnici SET pripadnost=v WHERE id=auth.uid();
 RETURN v;
END $$;
REVOKE ALL ON FUNCTION public.postavi_svoju_pripadnost(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.postavi_svoju_pripadnost(text) TO authenticated;

-- Admin postavlja pripadnost bilo kojem terenskom profilu.
CREATE OR REPLACE FUNCTION public.admin_set_pripadnost(p_user uuid, p_sumarija text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,auth AS $$
DECLARE v text := nullif(btrim(coalesce(p_sumarija,'')),'');
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.korisnici a WHERE a.id=auth.uid() AND a.is_admin=true) THEN
  RAISE EXCEPTION 'Pristup odbijen — samo admin';
 END IF;
 IF NOT public._pripadnost_ispravna(v) THEN RAISE EXCEPTION 'Nepoznata šumarija: %', v; END IF;
 UPDATE public.korisnici SET pripadnost=v WHERE id=p_user AND sumarija='ŠPD US ŠUME';
 IF NOT FOUND THEN RAISE EXCEPTION 'Korisnik nije terenski profil'; END IF;
 RETURN v;
END $$;
REVOKE ALL ON FUNCTION public.admin_set_pripadnost(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_set_pripadnost(uuid,text) TO authenticated;

-- Spisak pripadnosti za admina (zaseban RPC: admin_get_all_users se ne mijenja,
-- jer promjena povratnog tipa traži DROP, a stari klijenti ga i dalje zovu).
CREATE OR REPLACE FUNCTION public.admin_pripadnost_lista()
RETURNS TABLE(id uuid, pripadnost text) LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,auth AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.korisnici a WHERE a.id=auth.uid() AND a.is_admin=true) THEN
  RAISE EXCEPTION 'Pristup odbijen — samo admin';
 END IF;
 RETURN QUERY SELECT k.id, k.pripadnost FROM public.korisnici k WHERE k.sumarija='ŠPD US ŠUME';
END $$;
REVOKE ALL ON FUNCTION public.admin_pripadnost_lista() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_pripadnost_lista() TO authenticated;

NOTIFY pgrst,'reload schema';
COMMIT;
