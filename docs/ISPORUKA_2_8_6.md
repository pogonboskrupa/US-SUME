# Isporuka Dendro Map 2.8.6

Objavljen APK: [app-debug.apk](https://github.com/pogonboskrupa/US-SUME/releases/download/v2.8.6/app-debug.apk).
Ažuriranje: **Meni → Ažuriranje aplikacije**. Javni updater vraća v2.8.6.

## Izmjene

- Početni stil vlake: debljina 2 px, crtice, uključen outline. Strelice: potez 2 px, veličina 25 px. Eksplicitno sačuvani stilovi ostaju sačuvani.
- Popup bez određenog smjera nudi Smjer izvlačenja DS i Odredi dvosmjer. Kad smjer postoji, prikazuje samo Promijeni mjesto dvosmjera.
- Izbor dvosmjera prikazuje stvarne tačke glavne vlake ili kraka i prima dodir na liniji. Tačku bira projektant; nema automatskog prepolovljavanja. Prije i poslije tačke smjerovi vode prema suprotnim izlazima.
- Stil i boja vlaka: nezavisna veličina oblika lagera (50–250%) i oznake (8–28 px), sa zajedničkim stilom i izuzetkom po projektu. Pregled lagera nudi pomjeranje svakog lagera na karti.
- Vlastiti lager čuva novi položaj lokalno i šalje ga kroz postojeći red za server. Otklonjen izostanak lager_pt u upsert payloadu. Kolegini lageri prikazuju se i uklanjaju zajedno s njegovom vlakom; pomjeranje koleginog lagera čuva lični prikaz, bez upisa u njegove podatke.
- Postavke i položaji pamte se nakon restarta; upute ažurirane. Uključene sve promjene 2.8.5.

## Dokaz isporuke

- Source: `b45bebfd4d627f889ad76653baa23db2724ed8e6`; tree: `eaeede0115a24f492ab5fc09691d60e031d52834`.
- [CI 38137657357](https://github.com/pogonboskrupa/US-SUME/actions/runs/38137657357), pokušaj 2, job `114465954419`: SUCCESS. Prvi pokušaj stao je na provjeri vidljivosti popup-a u audit-parts-271. Lokalno je taj test prošao; ponovljeni CI na istom SHA prošao je cijeli skup. Nije predstavljeno kao izmjena ili popravka koda.
- Cijeli JS skup, SQL/RLS u izolovanoj testnoj bazi, postojeći browser tokovi i novi puni app test vlaka/lagera. Dodir glavne vlake, kraka i legacy zapisa; stvarno nacrtane Canvas tačke, promjena dvosmjera i otkazivanje; nezavisne veličine, globalni/projektni stil, vlastiti cache/outbox s lager_pt, kolegin lokalni prikaz, restart/offline, quota rollback, skrivanje i izolacija naloga.
- Novi prikaz: 6 rasporeda, bez prelijevanja i lošeg kontrasta; dnevni audit svih panela: 144 pregleda, bez grešaka kontrasta ili eksternih upisa. Postojeći stilovi/arhiva, server vlake i bafer, štampanje/PDF također prošli.
- UI artefakt `11701328001`: preuzet, SHA-256 `f58b6b5bd67e5f7290508bfd1083d1d7ef9fe24e6bfbceb2ed80a667513d1e0d`, pregledani novi JSON izvještaj i dnevni audit.
- Android 34 emulator: 20 testova, 0 padova/grešaka/preskoka. Potvrđeno preuzetim JUnit XML-om iz artefakta `11702133183`, SHA-256 `5e49ebec67778f2de92f3ab7294d461a1859e81cdace212af9d00c4e8f83d56a`.
- Javni APK stvarno preuzet: **24.406.688 B**; SHA-256 `78102cfcb8e698987c571ca71b3bcc670d98d09d7fd75339ea6f60e44581c9bc`.
- Manifest: `ba.spd.uss.vlake.debug`, versionCode **556**, versionName **2.8.6-debug**. Certifikat jednak prethodnom APK-u: SHA-256 `11fcd020c703053324ae26baf7a8207373711341f503277a90ec08a8468f286d`.
- Svih 73 web resursa u APK-u identično izvoru. Bez ugrađenog OCR modela. Pages: index, SW, direction JS, lager JS i field CSS javno preuzeti i identični izvoru.

## Granice provjere

Novi tokovi detaljno provjereni u stvarnom browseru; standardni Android testovi potvrđuju APK tokove, a provjera resursa identičan kod u APK-u. Fizički Xiaomi nije testiran. Produkcijski Supabase nije mijenjan; lager_pt koristi postojeću kolonu iz migracije 20260709. Raniji povremeni OPFS nalaz iz ISPORUKA_2_8_2.md nije proglašen riješenim.
