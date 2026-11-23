-- ============================================================
-- ADMIN: OBAVIJEST O AŽURIRANJU APLIKACIJE (v4.4.8)
--
-- Admin šalje korisniku (ili listi korisnika) poruku "Nova verzija — ažuriraj" kroz isti sandučić kao
-- primljeni podaci. Radi i na STARIJIM verzijama aplikacije: stara verzija je prikaže kao obični primljeni
-- fajl (naziv sadrži uputu i link), nova dodaje dugme "Preuzmi". Podatak se ne čuva na serveru duže od 7 dana.
-- Ponovno slanje zamjenjuje raniju obavijest istom korisniku (nema gomilanja). Samo admin.
-- v4.5.1: nova migracija BEZ regexa — ranija verzija (regex {8,300}) je bacala "invalid repetition count(s)". Pokreni OVU datoteku u SQL Editoru.
-- Idempotentna (create or replace); zamjenjuje funkciju iz 20261121.
-- Pokreće se RUČNO u Supabase SQL Editoru.
-- ============================================================

create or replace function public.admin_posalji_azuriranje(p_korisnici uuid[], p_verzija text, p_link text)
returns integer language plpgsql security definer
set search_path = public, auth as $$
declare
  v_ver text; v_naziv text; v_kml text; v_n integer := 0; r record;
begin
  if not public.je_admin() then raise exception 'Samo admin'; end if;
  if coalesce(array_length(p_korisnici, 1), 0) = 0 then raise exception 'Izaberi bar jednog korisnika'; end if;
  if coalesce(array_length(p_korisnici, 1), 0) > 500 then raise exception 'Previše korisnika odjednom'; end if;
  v_ver := btrim(coalesce(p_verzija, ''));
  if left(v_ver, 1) in ('v', 'V') then v_ver := substr(v_ver, 2); end if;
  -- Bez regularnih izraza (ranije "invalid repetition count(s)"): samo cifre i tačke, 3–15 znakova.
  if char_length(v_ver) < 3 or char_length(v_ver) > 15 or translate(v_ver, '0123456789.', '') <> ''
     or v_ver like '.%' or v_ver like '%.' or v_ver like '%..%' or position('.' in v_ver) = 0 then
    raise exception 'Neispravna verzija';
  end if;
  if p_link is null or left(p_link, 8) <> 'https://' or char_length(p_link) > 255
     or p_link ~~ '% %' or position('<' in p_link) > 0 or position('>' in p_link) > 0
     or position(']' in p_link) > 0 or position('"' in p_link) > 0 then
    raise exception 'Neispravan link';
  end if;
  v_naziv := '⬆ Nova verzija v' || v_ver || ' — Meni → Ažuriraj aplikaciju';
  v_kml := '<?xml version="1.0" encoding="UTF-8"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>' || v_naziv
        || '</name><Placemark><name>Nova verzija v' || v_ver || '</name><description><![CDATA[Dostupna je nova verzija aplikacije v' || v_ver
        || '. Ažuriraj: Meni → Ažuriraj aplikaciju, ili preuzmi APK: ' || p_link || ']]></description>'
        || '<ExtendedData><Data name="dendro_azuriranje"><value>' || v_ver || '</value></Data><Data name="link"><value>' || p_link || '</value></Data></ExtendedData>'
        || '</Placemark></Document></kml>';
  for r in select k.id from public.korisnici k where k.id = any (p_korisnici) and k.id <> auth.uid()
                                                  and (coalesce(k.odobren,false) or coalesce(k.is_admin,false)) loop
    delete from public.primljeni_podaci where to_id = r.id and from_id = auth.uid() and naziv like '⬆ Nova verzija%';
    insert into public.primljeni_podaci (from_id, to_id, sumarija, vrsta, naziv, sadrzaj)
      values (auth.uid(), r.id, (select sumarija from public.korisnici where id = r.id), 'kml', v_naziv, v_kml);
    v_n := v_n + 1;
  end loop;
  return v_n;
end; $$;

revoke all on function public.admin_posalji_azuriranje(uuid[], text, text) from public;
grant execute on function public.admin_posalji_azuriranje(uuid[], text, text) to authenticated;
notify pgrst, 'reload schema';
