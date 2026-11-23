-- v4.7.5: radno mjesto korisnika (upravnik šumarije, poslovođa, terenski radnik…).
-- Samo oznaka za admina — lakše povezivanje kolega (Grupe korisnika) i pregled u
-- tabu Korisnici. Ne mijenja nijedno pravo pristupa.
-- Spisak radnih mjesta je TABELA: admin dodaje nova, a sklanja ih (aktivno=false)
-- umjesto brisanja, da korisnik kojem je mjesto već dodijeljeno ne izgubi naziv.
-- Korisnik čuva KOD mjesta, pa se naziv može ispraviti bez diranja korisnika.
-- Pokrenuti ručno u Supabase SQL Editoru.
BEGIN;

CREATE TABLE IF NOT EXISTS public.radna_mjesta(
  kod text PRIMARY KEY,
  naziv text NOT NULL,
  redoslijed int NOT NULL DEFAULT 100,
  aktivno boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.radna_mjesta(kod,naziv,redoslijed) VALUES
 ('upravnik','Upravnik šumarije',10),('pomocnik','Pomoćnik upravnika',20),('tehnolog','Tehnolog',30),
 ('posl_isk','Poslovođa iskorištavanja',40),('posl_uzg','Poslovođa uzgoja',50),
 ('primac','Primač šume na panju',60),('otpremac','Otpremač',70),('radnik_primka','Radnik u primci',80),
 ('teren','Terenski radnik',90)
ON CONFLICT (kod) DO NOTHING;
ALTER TABLE public.radna_mjesta ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS radna_mjesta_citaj ON public.radna_mjesta;
CREATE POLICY radna_mjesta_citaj ON public.radna_mjesta FOR SELECT TO authenticated USING (public.je_odobren());
REVOKE ALL ON public.radna_mjesta FROM anon;
GRANT SELECT ON public.radna_mjesta TO authenticated;

ALTER TABLE public.korisnici ADD COLUMN IF NOT EXISTS radno_mjesto text;

-- NULL = nije odabrano; inače aktivno mjesto iz tabele.
CREATE OR REPLACE FUNCTION public._radno_mjesto_ispravno(p text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT p IS NULL OR EXISTS(SELECT 1 FROM public.radna_mjesta r WHERE r.kod=p AND r.aktivno);
$$;
REVOKE ALL ON FUNCTION public._radno_mjesto_ispravno(text) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public._je_admin_rm()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,auth AS $$
 SELECT EXISTS(SELECT 1 FROM public.korisnici a WHERE a.id=auth.uid() AND a.is_admin=true);
$$;
REVOKE ALL ON FUNCTION public._je_admin_rm() FROM PUBLIC;

-- Svaki odobren korisnik bira svoje radno mjesto (Meni → Moj nalog).
CREATE OR REPLACE FUNCTION public.postavi_svoje_radno_mjesto(p_rm text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,auth AS $$
DECLARE v text := nullif(btrim(coalesce(p_rm,'')),'');
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Nisi prijavljen'; END IF;
 IF NOT public.je_odobren() THEN RAISE EXCEPTION 'Pristup odbijen'; END IF;
 IF NOT public._radno_mjesto_ispravno(v) THEN RAISE EXCEPTION 'Nepoznato radno mjesto: %', v; END IF;
 UPDATE public.korisnici SET radno_mjesto=v WHERE id=auth.uid();
 RETURN v;
END $$;
REVOKE ALL ON FUNCTION public.postavi_svoje_radno_mjesto(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.postavi_svoje_radno_mjesto(text) TO authenticated;

-- Admin postavlja radno mjesto bilo kojem korisniku.
CREATE OR REPLACE FUNCTION public.admin_set_radno_mjesto(p_user uuid, p_rm text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,auth AS $$
DECLARE v text := nullif(btrim(coalesce(p_rm,'')),'');
BEGIN
 IF NOT public._je_admin_rm() THEN RAISE EXCEPTION 'Pristup odbijen — samo admin'; END IF;
 IF NOT public._radno_mjesto_ispravno(v) THEN RAISE EXCEPTION 'Nepoznato radno mjesto: %', v; END IF;
 UPDATE public.korisnici SET radno_mjesto=v WHERE id=p_user;
 IF NOT FOUND THEN RAISE EXCEPTION 'Korisnik ne postoji'; END IF;
 RETURN v;
END $$;
REVOKE ALL ON FUNCTION public.admin_set_radno_mjesto(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_set_radno_mjesto(uuid,text) TO authenticated;

-- Spisak za admina (zaseban RPC: admin_get_all_users se ne mijenja — promjena
-- povratnog tipa traži DROP, a stari klijenti ga i dalje zovu).
CREATE OR REPLACE FUNCTION public.admin_radna_mjesta_lista()
RETURNS TABLE(id uuid, radno_mjesto text) LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,auth AS $$
BEGIN
 IF NOT public._je_admin_rm() THEN RAISE EXCEPTION 'Pristup odbijen — samo admin'; END IF;
 RETURN QUERY SELECT k.id, k.radno_mjesto FROM public.korisnici k;
END $$;
REVOKE ALL ON FUNCTION public.admin_radna_mjesta_lista() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_radna_mjesta_lista() TO authenticated;

-- Admin dodaje novo radno mjesto (ili vraća ranije sklonjeno istog naziva).
CREATE OR REPLACE FUNCTION public.admin_radno_mjesto_dodaj(p_naziv text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,auth AS $$
DECLARE n text := regexp_replace(btrim(coalesce(p_naziv,'')), '\s+', ' ', 'g'); k text;
BEGIN
 IF NOT public._je_admin_rm() THEN RAISE EXCEPTION 'Pristup odbijen — samo admin'; END IF;
 IF length(n) < 2 OR length(n) > 60 THEN RAISE EXCEPTION 'Naziv mora imati 2–60 znakova'; END IF;
 SELECT r.kod INTO k FROM public.radna_mjesta r WHERE lower(r.naziv)=lower(n);
 IF k IS NOT NULL THEN
  UPDATE public.radna_mjesta SET aktivno=true WHERE kod=k;
  RETURN k;
 END IF;
 k := 'rm_' || substr(md5(n || clock_timestamp()::text), 1, 10);
 INSERT INTO public.radna_mjesta(kod,naziv,redoslijed)
  VALUES (k, n, coalesce((SELECT max(redoslijed) FROM public.radna_mjesta),0)+10);
 RETURN k;
END $$;
REVOKE ALL ON FUNCTION public.admin_radno_mjesto_dodaj(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_radno_mjesto_dodaj(text) TO authenticated;

-- Admin sklanja radno mjesto sa spiska za izbor. Korisnici kojima je već
-- dodijeljeno zadržavaju ga (naziv i dalje postoji u tabeli).
CREATE OR REPLACE FUNCTION public.admin_radno_mjesto_skloni(p_kod text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,auth AS $$
BEGIN
 IF NOT public._je_admin_rm() THEN RAISE EXCEPTION 'Pristup odbijen — samo admin'; END IF;
 UPDATE public.radna_mjesta SET aktivno=false WHERE kod=p_kod;
 IF NOT FOUND THEN RAISE EXCEPTION 'Radno mjesto ne postoji'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.admin_radno_mjesto_skloni(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_radno_mjesto_skloni(text) TO authenticated;

NOTIFY pgrst,'reload schema';
COMMIT;
