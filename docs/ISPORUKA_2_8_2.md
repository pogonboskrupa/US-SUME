# Dendro Map 2.8.2 — potvrđena isporuka

Datum: 2026-10-11. Grana: `CODEX-US-SUME`.

## Izvještaj odjela

Pregled je razdvojen u tri podtaba: **Pregled** (površina i visine), **Nagib** (šest razreda u procentima, udjeli i ha, prosjek/maksimum) i **Ekspozicija** (četiri strane, dominantna strana i ravni dio). Naziv/granica i postavke karte su sklopivi. Naziv i odabrani odsjeci ostaju u sažetku. Podtabovi ne mijenjaju kartu niti ponovo računaju DEM; posebna dugmad prikazuju nagib ili ekspoziciju na karti. Zadnji podtab se pamti po nalogu. Upute su ažurirane.

DEM worker, podaci projekta i stvarna doznaka nisu mijenjani. Novi CSS je ograničen na izvještaj; zajednički prikaz plana doznake je provjeren.

## Dokaz

- Izvor APK-a: `bbd3d366c4d5f845088d778b52af89804a82399f`; tree `04f704fc6ed0ce5a0c62cbebbbb574e33104b259`.
- [CI 38120768317](https://github.com/pogonboskrupa/US-SUME/actions/runs/38120768317), drugi pokušaj / job `114415552173`: **SUCCESS**. Cijeli JavaScript, tri PostgreSQL fixturea i browser skup prošli su, uz Android build, provjeru sadržaja i analizu brzine.
- Izvještaj: stvarni DEM PNG/Worker/Leaflet/KML/IDB, više odsjeka i ručno crtanje, prekid, nedostajući DEM, obnova bez mreže, brisanje i izolacija naloga. Tri podtaba u 18 rasporeda, kontrast i proširene postavke, ARIA/tastatura, oporavak ako nema prostora za pamćenje podtaba, eksplicitni prikazi/legende karte. Nema JS grešaka ni vanjskih upisa.
- UI ZIP `11695472585`: SHA-256 `f939e20a537ad92d7ebd86e640d8a39176047da1d59a980135d6da5ba63979cf`; preuzet i pregledan `282/department-report.json` i novi prikazi. Dnevni audit: 144 pregleda, bez nalaza, JS grešaka i vanjskih upisa.
- Android 34 emulator: JUnit **20 testova, 0 padova, 0 grešaka, 0 preskoka**. Android ZIP `11694814288`: SHA-256 `df5b8897a0ef4ce5a6426e020fc0a0edab802f3f6b4bb37e83644632346e6723`.
- [Javni APK](https://github.com/pogonboskrupa/US-SUME/releases/download/v2.8.2/app-debug.apk) je stvarno preuzet: **24.374.699 B**, SHA-256 `c63702f16f8ff5ef955305edfac9e777a6b964a284559ff49f20c8a7be3dd418`, jednak asset digestu na GitHubu.
- Paket `ba.spd.uss.vlake.debug`, versionCode **552**, versionName **2.8.2-debug**. Certifikat SHA-256 `11fcd020c703053324ae26baf7a8207373711341f503277a90ec08a8468f286d` jednak 2.8.1. Svih **72 resursa** u javnom APK-u imaju isti SHA-256 kao izvor.
- Native updaterov `/releases?per_page=1` vraća `v2.8.2`, ovaj APK i isti digest. Pages `index.html`, `sw.js`, report JS i CSS upoređeni su bajt po bajt s izvorom.

Ažuriranje: **Meni → Ažuriraj aplikaciju**. [Objava 2.8.2](https://github.com/pogonboskrupa/US-SUME/releases/tag/v2.8.2). Nova SQL migracija nije potrebna; produkcijska baza nije mijenjana.

## Zabilježeni raniji problem i ograničenja

Prvi CI pokušaj `114414899122` stao je prije izvještaja u postojećem testu `offline-import-240.py`: pri brisanju tokom drugog uvoza kopija je ostala zaključana (`NoModificationAllowedError`) i provjera uklanjanja privremenog OPFS fajla je pala. Kod offline uvoza nije mijenjan ovim zahvatom. Isti test lokalno je prošao 1,5 GB uvoz/restart/brisanje, a drugi CI pokušaj je prošao bez izmjene ili ublažavanja testa. Jedan uspješan pokušaj ne dokazuje da je prethodni povremeni problem otklonjen; ostaje za zaseban pregled. Log i sva tri artefakta prvog pokušaja sačuvani su lokalno uz provjerene SHA-256 prije čišćenja CI kopija radi ponavljanja upload-artifact v4.

Izračun terena ostaje DEM procjena. Fizički Xiaomi, stvarni GPS u šumi, instalacija na korisnikov telefon i produkcijska Supabase pravila nisu provjereni ovim postupkom. Android provjere su izvedene na emulatoru; novi podtabovi detaljno su provjereni u punoj browser aplikaciji.
