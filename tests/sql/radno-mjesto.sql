\set ON_ERROR_STOP on
DO $$ BEGIN IF current_database()<>'codex_fixture' THEN RAISE EXCEPTION 'Samo testna baza codex_fixture'; END IF; END $$;
-- Oslanja se na stanje iz probni-pristup-238.sql: 003 odobren, 005 admin.
\ir ../../supabase/migrations/20261124_radno_mjesto.sql
\ir ../../supabase/migrations/20261124_radno_mjesto.sql
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub='00000000-0000-0000-0000-000000000003';
SELECT public.postavi_svoje_radno_mjesto('otpremac');
DO $$ BEGIN
 BEGIN PERFORM public.postavi_svoje_radno_mjesto('direktor');RAISE EXCEPTION 'Prihvaćeno nepoznato radno mjesto';EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE 'Nepoznato%' THEN RAISE; END IF; END;
 BEGIN PERFORM public.admin_radna_mjesta_lista();RAISE EXCEPTION 'Ne-admin čita listu';EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE 'Pristup odbijen%' THEN RAISE; END IF; END;
 BEGIN PERFORM public.admin_set_radno_mjesto('00000000-0000-0000-0000-000000000003','tehnolog');RAISE EXCEPTION 'Ne-admin postavlja';EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE 'Pristup odbijen%' THEN RAISE; END IF; END;
END $$;
SET LOCAL request.jwt.claim.sub='00000000-0000-0000-0000-000000000005';
DO $$ BEGIN
 IF (SELECT radno_mjesto FROM public.admin_radna_mjesta_lista() WHERE id='00000000-0000-0000-0000-000000000003') IS DISTINCT FROM 'otpremac' THEN RAISE EXCEPTION 'Admin ne vidi radno mjesto'; END IF;
 PERFORM public.admin_set_radno_mjesto('00000000-0000-0000-0000-000000000005','upravnik');
 IF (SELECT radno_mjesto FROM public.korisnici WHERE id='00000000-0000-0000-0000-000000000005') IS DISTINCT FROM 'upravnik' THEN RAISE EXCEPTION 'Admin nije postavio'; END IF;
 PERFORM public.admin_set_radno_mjesto('00000000-0000-0000-0000-000000000003',NULL);
 IF (SELECT radno_mjesto FROM public.korisnici WHERE id='00000000-0000-0000-0000-000000000003') IS NOT NULL THEN RAISE EXCEPTION 'Admin nije uklonio'; END IF;
 BEGIN PERFORM public.admin_set_radno_mjesto('00000000-0000-0000-0000-00000000ffff','tehnolog');RAISE EXCEPTION 'Postavljeno nepostojećem';EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE '%ne postoji%' THEN RAISE; END IF; END;
END $$;
-- Admin dodaje novo mjesto, isti naziv ne pravi duplikat, sklonjeno se više ne bira.
SET LOCAL request.jwt.claim.sub='00000000-0000-0000-0000-000000000005';
DO $$ DECLARE k text; k2 text; BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.radna_mjesta WHERE kod='teren' AND naziv='Terenski radnik') THEN RAISE EXCEPTION 'Nema Terenski radnik'; END IF;
 k := public.admin_radno_mjesto_dodaj('  Vozač   kamiona ');
 IF (SELECT naziv FROM public.radna_mjesta WHERE kod=k) <> 'Vozač kamiona' THEN RAISE EXCEPTION 'Naziv nije očišćen'; END IF;
 k2 := public.admin_radno_mjesto_dodaj('vozač kamiona');
 IF k2 <> k THEN RAISE EXCEPTION 'Isti naziv napravio duplikat'; END IF;
 PERFORM public.admin_set_radno_mjesto('00000000-0000-0000-0000-000000000003',k);
 PERFORM public.admin_radno_mjesto_skloni(k);
 IF (SELECT radno_mjesto FROM public.korisnici WHERE id='00000000-0000-0000-0000-000000000003') <> k THEN RAISE EXCEPTION 'Sklanjanje obrisalo dodijeljeno mjesto'; END IF;
 BEGIN PERFORM public.admin_set_radno_mjesto('00000000-0000-0000-0000-000000000005',k);RAISE EXCEPTION 'Sklonjeno mjesto prihvaćeno';EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE 'Nepoznato%' THEN RAISE; END IF; END;
 BEGIN PERFORM public.admin_radno_mjesto_dodaj('x');RAISE EXCEPTION 'Prekratak naziv';EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE 'Naziv%' THEN RAISE; END IF; END;
 k2 := public.admin_radno_mjesto_dodaj('Vozač kamiona');
 IF k2 <> k OR NOT (SELECT aktivno FROM public.radna_mjesta WHERE kod=k) THEN RAISE EXCEPTION 'Ponovno dodavanje nije vratilo sklonjeno'; END IF;
END $$;
SET LOCAL request.jwt.claim.sub='00000000-0000-0000-0000-000000000003';
DO $$ BEGIN
 BEGIN PERFORM public.admin_radno_mjesto_dodaj('Lugar');RAISE EXCEPTION 'Ne-admin dodaje';EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE 'Pristup odbijen%' THEN RAISE; END IF; END;
 IF (SELECT count(*) FROM public.radna_mjesta) < 9 THEN RAISE EXCEPTION 'Odobren korisnik ne čita spisak'; END IF;
END $$;
SET LOCAL ROLE anon;
DO $$ BEGIN BEGIN PERFORM public.postavi_svoje_radno_mjesto('otpremac');RAISE EXCEPTION 'Anon upis dopušten';EXCEPTION WHEN insufficient_privilege THEN NULL;END;END $$;
ROLLBACK;
\echo Radno mjesto: korisnik bira sebi, admin postavlja i čita, validacija, admin dodaje/sklanja mjesta, idempotentna migracija — OK
