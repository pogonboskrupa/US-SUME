# Dendro Map 2.8.3 — nova ikona stila vlaka

Datum: 2026-10-11. Grana: `CODEX-US-SUME`.

„Stil i boja vlaka” u Meniju ima zaseban lokalni SVG prikaz odozgo: zelena glavna vlaka, spojen narandžasti krak i jedan znak dvosmjera ↔ pored trase. „Stil linija” zadržava svoju ikonu. Dimenzije kartice i rad opcija nisu mijenjani; nema nove bitmap slike ni zavisnosti.

## Provjerena isporuka

- Izvor: `9453af018add01a86479362019d688fa5d78b5ae`, tree `010b8dd77bb1aeb996d3110bbcb5c340c521c031`.
- [CI 38126831936](https://github.com/pogonboskrupa/US-SUME/actions/runs/38126831936), job `114432834261`: **SUCCESS**. JavaScript, tri PostgreSQL fixturea, puni browser skup, APK i analiza brzine prošli.
- Nova ikona pregledana u stvarnom Meniju. Navigacija: 12 mobilnih/tablet prikaza, sve uloge, dnevni/tamni mod, lokalni SVG; bez JS grešaka i vanjskih upisa. Dnevni audit: 144 pregleda, bez nalaza.
- UI artefakt `11697463430`: preuzet i SHA-256 potvrđen kao `59ff5a5731778948649cc0f36c3c4d2deb5dea51bba0014db1410d81093ec91a`. Pregledani CI izvještaji i slika Menija.
- Android 34 emulator: **20 testova, 0 padova, grešaka ili preskoka**, potvrđeno iz JUnit XML-a. Artefakt `11697808156`: SHA-256 `0c003900ac9573d9371739e552f6dee481e2849bd22f695c237b4a2f6b13e07d`.
- [Javni APK](https://github.com/pogonboskrupa/US-SUME/releases/download/v2.8.3/app-debug.apk) preuzet i provjeren: **24.375.535 B**, SHA-256 `1e2df200f3df2fc55ccc0e312077653c0310e9debe559388dac432a6d6e0d2ad`, jednak GitHub asset digestu.
- Paket `ba.spd.uss.vlake.debug`, versionCode **553**, versionName **2.8.3-debug**. Certifikat SHA-256 `11fcd020c703053324ae26baf7a8207373711341f503277a90ec08a8468f286d` ostaje isti. Svih **72 resursa** u javnom APK-u odgovara izvoru.
- Updaterov `/releases?per_page=1` vraća `v2.8.3` i pravi APK. Pages `index.html`, `sw.js` i `static/icons/navigation.svg` odgovaraju izvoru bajt po bajt.

Ažuriranje: **Meni → Ažuriraj aplikaciju**. [Objava 2.8.3](https://github.com/pogonboskrupa/US-SUME/releases/tag/v2.8.3). SQL migracija za ovu izmjenu nije potrebna; produkcijska baza nije mijenjana.

Ovo je promjena ikone, uz provjere na browseru i Android emulatoru; fizički Xiaomi i stvarni teren nisu provjeravani. Raniji povremeni nalaz pri otkazivanju offline uvoza ostaje zabilježen u `ISPORUKA_2_8_2.md`; prolazak ovog CI-a nije dokaz da je taj nalaz otklonjen.
