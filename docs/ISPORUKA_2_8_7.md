# Isporuka Dendro Map 2.8.7

[Preuzmi APK](https://github.com/pogonboskrupa/US-SUME/releases/download/v2.8.7/app-debug.apk).
Ažuriranje: **Meni → Ažuriranje aplikacije**. Updater stvarno vraća v2.8.7.

## Promjena ponašanja

Kreiranje projekta vlaka ili doznake sada prvo trajno čuva lokalni zapis i red za slanje, pa automatski šalje roditeljski projekat na server. Projekat je odmah dostupan za lokalni rad. Bez veze ostaje u redu; start, povratak veze/u prvi plan i periodična provjera ponavljaju slanje uz postojeći backoff. Automatski prolaz obrađuje samo nove projekte. Ostali terenski podaci koriste postojeći tok slanja.

Dodavanje projektanta čeka slanje roditelja i potvrđuje ciljani ID i vlasnika čitanjem sa servera. Nepotvrđen ili nedostajući projekat sprečava upis članstva. In-flight guard sprečava dupli pritisak; promjena naloga ili izabranog projekta prekida nastavak. Prava RLS zabrana i dalje se poštuje; ova izmjena rješava pokušaj članstva prije nego što postoji roditeljski projekat.

Ponovni zahtjev nakon izgubljenog odgovora koristi isti UUID i potvrđuje postojeći sadržaj. Puna kvota keša ne uklanja trajni red: slanje se potvrđuje lokalno prije uklanjanja stavke. Doznaka lista obnavlja neposlane projekte iz reda i kada pomoćni keš nije sačuvan. Automatska potvrda ulazi u Poslano s vremenom slanja. Upute ažurirane.

## Potvrđena isporuka

- Source `5e396eaa32860e54b9d126ddf44165a7a1a05075`, tree `61803b831d080cb75f5ef0bba7697316a34f0bde`.
- [CI 38140008957](https://github.com/pogonboskrupa/US-SUME/actions/runs/38140008957), job `114471750184`: SUCCESS iz prvog pokušaja.
- Lokalno: cijeli JavaScript skup, 5 inline JS blokova i server-panel.js sintaksa. Postojeći server-confirm-234 sa stvarnim Supabase JS/HTTP-om prošao. CI također izvršio cijeli JS, izolovane SQL/RLS testove i sve browser tokove.
- Novi puni app test project-auto-sync-287 koristi stvarni Supabase JS/PostgREST nad kontrolisanim HTTP serverom. Devet scenarija: odgođen parent prije člana; offline/restart/online retry; izgubljen odgovor i idempotentnost; RLS odbijeni parent blokira člana; automatska doznaka i član; nedostajući parent pri čitanju; keširana sesija/izolacija naloga; kvota keša čuva red; red terenskih podataka i GPS ostaju lokalno. Potvrđena auto historija/vrijeme. Bez vanjskih upisa ili pageerror-a.
- UI artefakt `11702771384`: preuzet i SHA-256 potvrđen `49e9ed82b0f13d7596d5f48406fa411c2cbdc4e407ade61ff763fa5e29cb2a44`. Pregledani novi project-sync.json i dnevni audit 144 pregleda, bez nalaza.
- Android 34 emulator: 20 testova, 0 padova/grešaka/preskoka. Potvrđeno preuzetim JUnit XML-om iz artefakta `11702542204`; SHA-256 `b6f409d1d76cafb018ef5e028d17f17fff69d47ad0d9ef0c730888bcdc1d7d4d`.
- Javni APK stvarno preuzet: 24.411.772 B, SHA-256 `f5621e0ea97e627e4db60952ebfcd49dd40d22f3a46919535aeb7c53e5e387b3`.
- Manifest: `ba.spd.uss.vlake.debug`, versionCode 557, versionName 2.8.7-debug. Isti certifikat kao prethodni APK: SHA-256 `11fcd020c703053324ae26baf7a8207373711341f503277a90ec08a8468f286d`.
- Svih 73 web resursa u APK-u identično izvoru; bez ugrađenog OCR modela. Pages index, SW i server-panel JS javno preuzeti i identični izvoru.

## Granice provjere

Novi tok detaljno provjeren u browseru i testnim servisima; Android emulator potvrđuje standardne APK tokove, a provjera resursa identičan kod u APK-u. Fizički Xiaomi nije testiran. Produkcijski Supabase nije mijenjan i nova SQL migracija nije potrebna. Ako postojeća serverska politika odbija upis projekta, zapis ostaje za retry i članstvo se ne šalje. Raniji povremeni OPFS nalaz iz ISPORUKA_2_8_2.md nije proglašen riješenim.
