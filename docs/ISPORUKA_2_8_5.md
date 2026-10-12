# Isporuka Dendro Map 2.8.5

Objavljen APK: [app-debug.apk](https://github.com/pogonboskrupa/US-SUME/releases/download/v2.8.5/app-debug.apk).
Ažuriranje iz aplikacije: **Meni → Ažuriraj aplikaciju**. Updater API stvarno vraća v2.8.5 kao prvu objavu.

## Korisničke izmjene

- Izvještaj odjela: približno jedan kontrolni profil niz padinu na svaka 3 ha, prostorno raspoređen kroz odjel i odvojene odsjeke. Dodir linije ili stavke u Pregled profila otvara visine, Δh, vodoravnu dužinu i nagib u %. Linije se mogu sakriti; rezultat i izbor se pamte offline.
- Šest obojenih razreda nagiba ostaje lokalni DEM gradijent. Profil pokazuje prosjek duž svoje linije: **Δh / vodoravna dužina × 100**. Linije se prekidaju na granici, rupama i nedostajućem DEM-u. Nedostajući profili se prijavljuju, ne prikazuju kao ravni teren.
- Za stari izvještaj treba jednom ponoviti Izračunaj teren. Stari keš ostaje čitljiv bez interneta i bez samostalnog novog preuzimanja.
- Uključene su promjene 2.8.4: preuzete Granice odjela vraćaju Samo za poligon na uključeno pri novom ulasku; Učitaj kartu ima pregledniji dizajn bez GitHub oznaka na karticama; kompas azimuta uređaja veći je 20%.
- Upute u aplikaciji ažurirane.

## Potvrđena isporuka i provjere

- Source: `afa7bde0dc00037d20026d2fd122918f60e7c204`, tree `20a570f9ddb9ebda16298de974375096d8597015`.
- [CI 38135238777](https://github.com/pogonboskrupa/US-SUME/actions/runs/38135238777), job `114457649249`: **SUCCESS iz prvog pokušaja**.
- Cijeli JS skup; SQL/RLS na izolovanoj testnoj bazi; puni browser tokovi. Novi profili numerički provjereni na ravnima u šest smjerova, promjenjivim padinama, ravnom terenu, konkavnoj granici, odvojenim odsjecima, običnim i sub-pikselnim rupama te nedostajućem DEM-u.
- Pravi DEM PNG/Worker/Leaflet/IDB browser test: 10 profila za 28,09 ha; formula, popup, prikaz/sakrivanje, 18 rasporeda/podtabova, stari keš, restart/offline, otkazivanje, brisanje i izolacija naloga. Bez eksternih upisa.
- Dnevni audit **144 pregleda**, bez problema kontrasta/grešaka/upisa. Navigacija **12 pregleda**. UI artefakt `11700793067` preuzet i potvrđen SHA-256 `31fc44f5eebb1e7e95ad7b751b86d03396955e06b4aed9b51a60196fa60f44a2`.
- Android 34 emulator: **20 testova, bez padova, grešaka ili preskoka**, potvrđeno iz preuzetog JUnit XML-a. Android artefakt `11701062762`, SHA-256 `76bafb8e79e52261c8a4af7f81cbf25cce32109c4743f1d881ab5c8ce7c004fd`.
- Javni APK stvarno preuzet: **24.392.371 B**, SHA-256 `774b9d0c43bcaacfbc25ae7945a96be06b12f24fcc82c31408810f694a00d47b`. Manifest: `ba.spd.uss.vlake.debug`, code **555**, **2.8.5-debug**.
- Certifikat jednak prethodnim APK-ovima: SHA-256 `11fcd020c703053324ae26baf7a8207373711341f503277a90ec08a8468f286d`. Svih **72 web resursa u APK-u** identično izvoru. APK bez ugrađenog OCR modela.
- GitHub Pages: index, SW, report Worker/JS i field CSS javno preuzeti i byte-identični izvoru 2.8.5.

## Praktične granice provjere

Nagib i visine su DEM procjena rezolucije oko 30 m, odnosno grublje pri velikom izboru. Kontrolni profili ne povećavaju izvornu rezoluciju DEM-a. Nisu geodetska izmjera niti mjerenje na fizičkom Xiaomi telefonu. Novi profili detaljno provjereni u browseru; standardni Android testovi potvrđuju APK tokove, a provjera resursa potvrđuje identičan kod u APK-u. Produkcijski Supabase nije mijenjan. Raniji povremeni OPFS nalaz iz ISPORUKA_2_8_2.md nije proglašen riješenim.
