# DENDRO MAP — analiza koda u tri uzastopna dijela

Datum: 3.10.2026. Pregledana verzija: **2.1.7 / Android 487**.
Izvor: grana `CODEX-US-SUME-2026-10-01`, commit
`703d3d6acbf331abe5f3f6f88e6bd4adf401b1fa`.

Analiza je započeta **nakon završetka ranije traženih izmjena i potvrđene
objave APK-a 2.1.7**. Dijelovi se pregledaju i zapisuju redom 1 → 2 → 3.
Ovo je ciljani pregled glavnih tokova APK aplikacije, ne tvrdnja da je
pregledana svaka linija repozitorija ili dokaz rada produkcijske baze.
Flutter `doznaka/`, zasebni Python alati i kod van izvršnog puta APK-a nisu
obuhvaćeni kao zasebni proizvodi. Produkcijski podaci nisu mijenjani.

## Polazna provjera i već završene izmjene

- Lokalno i u CI-ju prolazi **76 JS testnih fajlova**; pet inline skripti ima ispravnu sintaksu.
- CI run `37100908878`, job `111140090410`: uspjeh. Browser provjere koriste stvarni Leaflet, DOMParser, SHP/DBF/proj4 i IndexedDB, uz lažan server.
- Sačuvano **83 PNG pregleda i jedan PDF**. Pregledani KML editor u oba moda, uski/vodoravni prikaz, koordinate i Server.
- Android build i SHA-256 poređenje **31 web resursa u APK-u**: uspjeh.
- Javni release `v2.1.7`, `app-debug.apk`, 21.663.365 bajta. Tag pokazuje gornji commit. Updaterov `/releases?per_page=1` vraća tu verziju.
- SHA-256 APK-a: `fdce2c3f2457731bf3769c7fcaa99c8c2caf5432804c81ce584e3ff7615b9ec3`.
- Ranije zadate popravke: paginirano preuzimanje i provjera potvrda/naloga; pregledniji KML editor s trajnim lokalnim nazivom/opisom/stilom; uklonjen Nastavi krak, jasniji povratak roditelju i evidentiranje pauze; veće koordinate i nadmorska visina.

Novi nalazi ispod **nisu automatski popravljani tokom analize**. P1 znači
visok prioritet zbog mogućeg gubitka rada/lažne potvrde; P2 označava kvar
u posebnom scenariju ili značajnu nedosljednost. Potvrđene reprodukcije
koriste stvarne izdvojene funkcije i kontrolisane zamjene zavisnosti.

## Dio 1/3 — lokalni podaci, GPS i oporavak

**Status: završen prije početka dijela 2.**

### Šta je pregledano

| Izvor / funkcije | Šta je provjereno |
| --- | --- |
| `index.html`: `_saveLocalVlake`, `scheduleVlakaSave`, `_flushAllPendingVlake`, `_sbFlushVlakaImpl` | Lokalna kopija, debounce i rezultat upisa reda |
| `stopRec`, `_nastaviOdTacke`, `toggleRecPause`, `vratiSeNaRoditelja` | Završetak, nastavak od tačke, pauza i povratak na roditelja |
| `_crashSaveVlaka`, `_crashSaveTrag`, `_crashCheck`, `_recoverVlakaSnapshot` | Snapshot, hladni start, potvrda oporavka i kvar pohrane |
| `_nativeBufUzmi`, `_nativeBufPotvrdi`, `_drainNativeGpsBuffer`, intervali pauze | Native → JS prijenos, deduplikacija i zadržavanje neobrađenog dnevnika |
| `_dozProcessGpsPoint` | Redoslijed trajnog upisa, pomjeranja geometrije i retry |
| `static/js/offline-layer.js` | Kritični upis, oštećen red, identitet operacija i deduplikacija |
| `static/js/field-store.js` | IndexedDB transakcije, migracija, potvrde, sesije i razdvajanje vlasnika |
| `static/js/field-tools.js`: backup/validate/import/merge | Kontrolna suma, granice kopije, obnova bez prepisivanja novijeg rada |
| `NativeGpsBuffer.java`, `GpsService.java` | Rotacija fajla, fsync, potvrda serije, restart servisa i wake lock |

### Šta je dobro

- IndexedDB potvrda dolazi na `transaction.oncomplete`, a ne samo nakon zahtjeva za upis. Neispravna legacy migracija zadržava original.
- Doznaka prvo trajno čuva tačku. Pri kvaru pohrane ne pomjera liniju/statistiku i baca grešku; retry se izvršava prije sljedeće tačke. Ovo nije ista greška kao A1.
- Native bafer rotira aktivni fajl u pending; potvrda zahtijeva SHA-256 tačno pročitane serije. `append` koristi `FileDescriptor.sync()`.
- JS prvo čuva preuzetu native seriju pa potvrđuje native fajl. Neispravni redovi se izdvajaju za oporavak, a završna potvrda čeka pohranu aktivnih potrošača.
- Pauze se provjeravaju po vremenu GPS tačke, uključujući popravljeni povratak na roditelja. Test 2.1.7 potvrđuje dijete → roditelj → djed bez rezanja tačaka tokom samog povratka.
- Offline red razlikuje projekat, korisnika i ID vlake; oštećen red se ne prepisuje praznim pri kritičnom upisu.
- Backup ima kontrolnu sumu i provjeru vlasnika. Kopija izričito isključuje rasterske podloge i fotografije; obnova nije potpuna kopija cijelog telefona.

### Šta nije dobro

**A1 · P1 · Završetak vlake može lažno potvrditi čuvanje i ukloniti snapshot.**

Lokacije: `index.html:18076` (`stopRec`), `index.html:10590`
(`_sbFlushVlakaImpl`). `stopRec` odmah briše crash snapshot, zaustavlja
snimanje, zatim poziva `sbFlushVlaka(...).then(() => ...)`. Callback ne
provjerava rezultat `false`, koji flush vraća kada enqueue ne uspije.

Reprodukcija: završiti snimanje uz simulirani neuspjeli flush. Stvarni
`stopRec` ukloni snapshot, postavi `recOn=false` i prikaže „T1 sačuvana”.
Ako istovremeno nisu uspjeli ni lokalni cache upisi, noviji rad može ostati
samo u RAM-u i nestati nakon zatvaranja. Prethodni trajni zapisi ne moraju
nestati; problem je lažna potvrda i uklonjena dodatna zaštita.

Preporuka: sačekati i provjeriti potvrdu trajnog upisa prije čišćenja
snapshot-a i prikaza uspjeha; pri grešci zadržati mogućnost ponavljanja.

**A2 · P1 · Nastavak od srednje tačke odmah briše ostatak vlake.**

Lokacije: `index.html:17359` (`_pickNastaviVlaka`), `index.html:17390`
(`_nastaviOdTacke`). UI traži tačku od koje se nastavlja, ali ne kaže da će
ostatak biti uklonjen. Funkcija radi `slice(0, ptIdx+1)` i zakaže čuvanje
prije `togRec()`, bez potvrde i bez očuvanja odrezanog dijela u tom toku.

Reprodukcija: vlaka s pet tačaka, izbor druge tačke → ostanu dvije tačke,
izmjena je zakazana za čuvanje čak i kada zamjena GPS starta ne pokrene
snimanje. Za izbor posljednje tačke nema odsijecanja.

Preporuka: odvojiti „nastavi od kraja” i „skrati pa nastavi”; za skraćivanje
prikazati broj/dužinu uklonjenog dijela, tražiti potvrdu i omogućiti povrat.

### Dokazi i granice

Pokrenuto: `node docs/audit/reprodukcije.cjs 1` — oba nalaza potvrđena.
Relevantne postojeće regresije: `offline-layer`, `offline-kriticni-upis`,
`offline-prvi-dio`, `field-upgrade`, `gps-bg-buffer`, `doznaka-gps` i
`server-povratak-217`; uključene u prolaz 76/76 prije objave. Dijagnostička
skripta očekuje postojeći kvar, nije test da je kvar popravljen.
Nije izvršeno ubijanje procesa, nestanak napajanja ili cjelodnevno GPS
snimanje na fizičkom Android telefonu.

## Dio 2/3 — server, pristup i saradnja

**Status: završen nakon dijela 1, prije početka dijela 3.**

### Šta je pregledano

| Izvor / tok | Šta je provjereno |
| --- | --- |
| `serverPosalji`, `_processOfflineQueue` | Ručno pokretanje, priprema, promjena naloga, djelimični uspjeh i zadržavanje grešaka |
| `_syncVlakaOperation` | Insert/update, revizije, izgubljeni odgovor, novija izmjena u redu |
| `serverPreuzmiDijeljeno`, `_vlakePreuzmiStranice`, `_serverPrimijeniMojeVlake` | Projekti/članstva, sve stranice vlaka, očuvanje vlastitog neposlanog rada |
| `dozLoadOdjeli`, `dozLoadLayers`, `_dozUcitajTacke`, `_dozPrimijeniRed` | Odjeli, članovi, zone, GPS pojasevi, keš i kasni odgovori |
| `_dozUpisiZonu`, `_dozPosaljiKomad`, `_dozPosaljiPojedinacno`, `_sendDozTrackPoint` | Potvrde zona, duplikati GPS-a, serije i RPC rezervni put |
| `static/js/reliable-fetch.js` | Rokovi, prekidi, spora veza, čitanje tijela i ponavljanje upisa |
| `static/js/server-panel.js` | Odredište, pošiljalac, status/dužina vlake i vrijeme potvrđenog prenosa |
| SQL migracije 20260611, 20260619 unique, 20260713, 20260727, 20260728, 20260730, 20260911 | Vlasništvo/članstvo, odobrenje, kasnije zakrpe pristupa i idempotentni GPS RPC |

### Šta je dobro

- Slanje vlaka i doznake ostaje izričito ručno. Automatski GPS/online okidači ne otvaraju kapiju za slanje.
- Nacrtane i GPS vlake prolaze kroz isti upis geometrije. Noviji neposlani red dobija server ID/reviziju nakon potvrde starijeg zahtjeva.
- Stvarni konflikt revizije zadržava lokalnu izmjenu. Izgubljeni odgovor vlake poredi se sa sadržajem server reda prije proglašavanja konflikta.
- Brisanje vlake, brisanje zone i status odjela traže vraćeni ciljani ID. Nepoznata operacija ostaje kao greška, ne nestaje iz reda.
- Čitanje vlaka, članova/zona otvorenog odjela i GPS tačaka je paginirano; greška kasnije stranice ne proglašava djelimičan skup potpunim.
- Doznaka odbacuje kasni odgovor prethodnog naloga/odjela, uključujući naknadni dohvat imena projektanata.
- Panel prikazuje projekat, autora, dužinu, lokalno čekanje i potvrđeni prijem. Ručno preuzimanje doznake pokriva listu odjela i slojeve trenutno otvorenog odjela; ne preuzima odjednom slojeve svih odjela.
- Transport ograničava zastoj, prati napredak tijela odgovora i ne ponavlja sam proizvoljne upise.
- Novije SQL migracije zatvaraju raniji samoupis korisnika u tuđi doznaka odjel i dodaju serversko odobrenje. Stara politika iz 20260713 **nije prijavljena kao aktuelna rupa**, jer je 20260727 izričito zamjenjuje. Primjena tih migracija u produkciji nije provjerena.

### Šta nije dobro

**B1 · P1 · Greška 23505 nije dovoljan dokaz uspješnog upisa zone.**

Lokacija: `index.html:37107`, `_dozUpisiZonu`; sličan obrazac postoji u
`insert_projekt` i `insert_doz_project` granama procesora reda.
Svaka `23505` uz poslani ID pretvara se u `{data:{id:payload.id},error:null}`
bez čitanja postojećeg reda i provjere vlasnika, projekta ili sadržaja.
23505 znači kršenje nekog UNIQUE pravila, ne nužno da je isti upis ranije uspio.

Reprodukcija: lažni server vrati 23505 za drugo UNIQUE pravilo, bez reda
pod klijentskim ID-jem. Funkcija nakon samo jednog upita vrati uspjeh i taj
neprovjereni ID. Procesor takav rezultat može ukloniti iz reda i označiti
potvrđenim. Da li konkretno drugo UNIQUE pravilo postoji u produkcijskoj
šemi nije utvrđeno; pogrešno prihvatanje odgovora u klijentu jeste potvrđeno.

Preporuka: na konflikt pročitati red pod očekivanim identitetom i potvrditi
isti sadržaj/vlasništvo; inače zadržati operaciju kao konflikt.

**B2 · P2 · Spiskovi projekata i članstava još nisu potpuno paginirani.**

Lokacije: `index.html:36660`, `dozLoadOdjeli`; `index.html:6477`,
`serverPreuzmiDijeljeno` (članstva/vlastiti/dijeljeni projekti).
Paginacija vlaka i slojeva ne rješava početne upite za projekte i članstva:
oni se čitaju jednim zahtjevom. Kada broj zapisa pređe serverski max-rows,
uspješan odgovor može biti samo prvi dio liste.

Reprodukcija doznake: u kešu tri odjela, server ograničen na dva; funkcija
vrati `true` i sačuva samo dva odjela. Nijedan server red se tim čitanjem
ne briše, ali treći nestane iz offline liste. Slično ograničenje na
članstvima može sakriti projekte i njihove vlake iz zajedničkog preuzimanja.

Preporuka: paginirati i početne liste uz stabilan redoslijed; zamijeniti
keš/članstvo tek nakon potvrde cijelog skupa.

**B3 · P2 · Provjera GPS serije pretpostavlja serverski limit od 1000 redova.**

Lokacija: `index.html:38826`, `_dozPosaljiKomad`.
Upit provjerava postojeće tačke sa `.limit(5000)`, ali nepotpun odgovor
prepoznaje samo kada ima najmanje 1000 redova. PostgREST može imati niži
max-rows. Tada neke postojeće tačke izgledaju kao nove i šalju se ponovo.
Ovaj grupni tok radi SELECT pa INSERT; ne koristi zaključavanje GPS RPC-a.

Reprodukcija: tri postojeće tačke u vremenskom prozoru, server vrati samo
prve dvije; zadnja postojeća tačka ponovo se ubacuje, a oba ID-ja serije
potvrđuju kao završena. Stvarno nastajanje duplikata zavisi i od UNIQUE
zaštite produkcijske tabele. Bez nje geometrija/statistika može dobiti
ponovljene tačke; sa njom serija može pasti i preći na pojedinačni put.

Preporuka: paginirana provjera ili atomski serverski upis s jedinstvenim
identitetom tačke. Provjeriti i dva istovremena uređaja, jer SELECT+INSERT
sam po sebi nije atomska zaštita od duplikata.

### Dokazi i granice

Pokrenuto: `node docs/audit/reprodukcije.cjs 2` — sva tri nalaza potvrđena
nad stvarnim funkcijama. Relevantne regresije iz prolaza 76/76:
`server-rucno`, `server-komunikacija`, `server-dvije-vlake`,
`server-vlake-doznaka`, `doznaka-offline`, `server-primljeno`,
`server-povratak-217`, `slab-signal`, `reliable-fetch` i `pregled-rucnog-slanja`.

Nisu izvršeni produkcijski SELECT/INSERT/DELETE, migracije ili dijeljenje
projekta živim korisnicima. RLS, aktivni constraint-i, stvarni max-rows i
prijem na drugom fizičkom telefonu ostaju za integracijsku provjeru.
Fotografije idu kroz zasebno izričito dijeljenje; tragovi/dnevnik/tekstualne
oznake su lokalni prema trenutnoj politici aplikacije, pa njihovo odsustvo
iz ručnog slanja nije samo po sebi serverski bug.

## Dio 3/3 — karte, KML/SHP, interfejs i ažuriranja

**Status: završen nakon dijela 2. Sva tri dijela su završena.**

### Šta je pregledano

| Izvor / tok | Šta je provjereno |
| --- | --- |
| `static/js/local-layer-import.js`, `pkml`, `pcs` | KML/SHP/DBF/PRJ/CPG, projekcije, višedijelne geometrije, rupe poligona i upis prije prikaza |
| `_localKmlSaveContent`, `_localKmlRestore`, `_localKmlSaveAll`, KML setteri | IndexedDB sadržaj, registar, nepotpuna obnova i naknadno uređivanje |
| `static/js/layer-editor.js`, popup i hit-test | Naziv/opis/stil, trajnost, tooltip escaping i dohvat objekta preko drugih canvas slojeva |
| `static/js/field-design.js`, CSS, `_stp*` | Dnevni mod, meni/podnožje, koordinate, vlastiti opis štampe i legenda |
| `_guideStart`, `_guideFinish`, `_guideCancel`, čuvanje/prikaz ruta | GPS početak, mrežni rezultat, otkazivanje i lista ruta |
| `startLocPhoto`, `onLocPhotoSelected`, `_saveFotos`, `_restoreFotos` | Kamera, vezivanje pozicije, thumbnail i trajnost pune slike |
| `sw.js`: `_tileRespond` | Keš pločica, mrežni odgovor i neuspješan asinhroni upis |
| `MainActivity.java`: WebView, kamera i `UpdateBridge` | Interni/vanjski URL, dozvola kamere, GitHub verzija, nastavak APK preuzimanja i instalater |
| `android/assets.py`, `codex-webview.yml` | Usklađene verzije, potrebni resursi, provjera stvarnog sadržaja APK-a i release |

### Šta je dobro

- SHP uvoz koristi prateći DBF/PRJ/CPG, validira koordinate i traži izbor projekcije kada je ne može utvrditi. Pretvaranje čuva atribute, višedijelne geometrije i rupe poligona; `pkml` obilazi sve Polygon/LineString/Point elemente jednog Placemark-a.
- Lokalni uvoz potvrđuje IDB sadržaj i registar prije prikaza; istovremeni uvozi su serijalizovani i isti nazivi dobijaju različite ključeve. Novi editor naziva/opisa prvo potvrđuje novi sadržaj, zatim mijenja referencu.
- KML tekst se escapira, prelazak isprekidana → puna linija čisti dashArray; popup se prilagođava raspoloživoj visini i koordinatama. Browser provjere 2.1.7 pokrivaju pravi Leaflet i obnovu iz IDB-a.
- Dnevni mod ima zasebne boje teksta/polja. Podnožje Menija je u toku skrolanja; browser provjere pokrivaju korisnika, logo, verziju i uske ekrane. Nije potvrđen novi kvar tih prikaza u pregledanim fixture-ima.
- Vlastiti opis štampe, opis legende i nazivi simbola imaju ograničenje dužine i lokalno čuvanje. Simboli vlaka koriste stvarne boje; izrađen i pregledan PDF.
- Kamera u APK-u obrađuje `capture` preko `ACTION_IMAGE_CAPTURE`, uz dozvolu i FileProvider. Nema rezervnog otvaranja galerije u tom toku; GPS pozicija hvata se prije otvaranja kamere.
- Vodi me jasno označava zračnu liniju kada ruta putem nije dostupna. Pretraga sačuvanih ruta ne briše listu i escapira prikazane nazive/ID-jeve.
- Native updater čita i prerelease objave, poredi verziju stvarno instaliranog paketa, nastavlja djelimično preuzimanje i provjerava očekivanu veličinu. Build dodatno SHA-256 poredi web resurse u stvarnom APK-u. Potvrđeno je da release API vraća 2.1.7.

### Šta nije dobro

**C1 · P1 · Uređivanje učitanog KML-a može obrisati drugi lokalni sloj.**

Lokacije: `index.html:24324` (`_localKmlSaveAll`), `24356`
(`_localKmlRestore`), `24447` (`_kmlSaveTag`); isti obrazac imaju naziv,
vidljivost i dio settera ispune. Obnova preskoči sloj čiji IDB sadržaj nije
uspjela pročitati. Setteri zatim pozovu `_localKmlSaveAll()` s podrazumijevanim
`prune=true`: sve što trenutno nije u `kmlLs` izbace iz registra i obrišu mu
IDB sadržaj. Sam `saveKmlStyles()` koristi sigurniji `false`, ali naknadni
poziv settera poništi tu zaštitu.

Reprodukcija: registar sadrži A i B, A je učitan, čitanje B simulirano
privremeno ne uspije. Registar još čuva oba. Promjena oznake A ukloni B iz
registra i pozove brisanje njegovog sadržaja, iako korisnik nije brisao B.
Sličan rizik postoji dok asinhrona obnova još nije završena.

Preporuka: promjena stila/naziva ne smije uklanjati druge stavke. Brisanje
vezati isključivo za izričito izabrani sloj, uz potvrdu uspješnog upisa registra.

**C2 · P2 · Greška čuvanja pločice ostaje neobrađena.**

Lokacija: `sw.js:89`, `_tileRespond`. `cache.put()` vraća Promise, ali se
poziva bez `await`, `.catch()` ili vezivanja za `event.waitUntil`. Obični
`try/catch` ne hvata njegovo naknadno odbijanje; komentar da se puna memorija
tiho preskače ne odgovara izvršavanju.

Reprodukcija: mreža vrati dobru pločicu, `cache.put` odbije sa
`QuotaExceededError`; odgovor korisniku uspije, a proces prijavi neobrađeno
odbijanje. Pločica nije sačuvana za offline rad. Test ne dokazuje rušenje
browsera ili cijele aplikacije. Bez produženja trajanja događaja ni uspješan
pozadinski upis nema izričitu zaštitu od gašenja Service Worker-a.

Preporuka: obraditi odbijanje i pratiti završetak keširanja preko `waitUntil`
ili odgovarajućeg await toka, uz zadržavanje prikaza uspješno preuzete pločice.

**C3 · P2 · Stari odgovor Vodi me može poništiti novi izbor rute.**

Lokacija: `index.html:30038`, `_guideFinish`, i `29989`, `_guideCancel`.
Poslije čekanja OSRM-a/profila nema identiteta zahtjeva niti provjere da li
je korisnik otkazao tok i započeo novi. Stari poziv nastavlja, poziva
`_guideCancel(true)` nad novim stanjem i crta/čuva staru rutu.

Reprodukcija: završetak rute čeka odgovor; korisnik otkaže i započne novi
izbor. Dolazak starog odgovora ugasi novi izbor, obriše njegove tačke i
prikaže prethodnu rutu. Ne briše ranije sačuvane rute.

Preporuka: generacija zahtjeva i prekid na otkazivanje; poslije svakog await-a
provjeriti pripada li odgovor još aktivnom toku, prije promjene UI-ja ili pohrane.

**C4 · P1 · Neuspješan upis pune fotografije ostaje skriven.**

Lokacije: `index.html:11745`, `onLocPhotoSelected`; `12124`, `_saveFotos`;
`12135`, `_restoreFotos`. Thumbnail/metapodaci se čuvaju u localStorage,
a puna obrađena slika u IDB. Upis pune slike se ne čeka, greška se guta kroz
`.catch(() => {})`, a korisnik dobije „Foto dodano na mapu”.

Reprodukcija: thumbnail uspije, IDB upis odbije zbog kvote. Prikazuje se
poruka uspjeha bez upozorenja. Poslije uklanjanja RAM stanja i obnove ostane
samo thumbnail; puna slika je `null`. Fotografija koja nije podijeljena
nema ni server kopiju. Ovo ne dokazuje brisanje originala iz korisnikove
galerije; nalaz se odnosi na kopiju koju čuva aplikacija.

Preporuka: potvrditi upis i provjeriti čitljivost pune slike prije konačne
potvrde, a pri neuspjehu zadržati podatke za ponavljanje i jasno javiti problem.

### Dokazi, preporuke i granice

`node docs/audit/reprodukcije.cjs 3` potvrđuje sva četiri nalaza; pokretanje
bez argumenta potvrđuje svih devet iz tri dijela. Skripta namjerno očekuje
postojeće kvarove i ne ulazi u redovni skup regresijskih testova.
Raniji uspješan skup 76/76 uključuje `meni-kamera-shp`, `stil-kml-meni`,
`kml-click`, `kml-import` i `apk-auto-update`; prolaz tih testova ne pokriva
ovdje novootkrivene scenarije.

Dodatna poboljšanja, bez tvrdnje o potvrđenom kvaru: ograničenje veličine
sirovog KML-a i ukupnog broja koordinata radi memorije; provjera release
digest-a u updateru uz postojeću provjeru veličine i Android provjeru potpisa;
jasna potvrda trajnog upisa sačuvanih ruta. SHP već ima granicu 32 MB po
fajlu i 50.000 objekata, što nije isto što i ukupna granica memorije.

Nisu testirani stvarna kamera/OEM dozvole, instalacija preko korisnikove
postojeće verzije, prekid napajanja tokom APK preuzimanja, fizičko punjenje
memorije ni stvarni OSRM/GPS na terenu. Pregled WebView postavki nije potpuna
sigurnosna revizija svih native mostova.

## Evidencija završetka i preporučeni redoslijed

| Dio | Status | Potvrđeni nalazi |
| --- | --- | --- |
| 1 — lokalni podaci/GPS | Završen prvi | A1, A2 |
| 2 — server/saradnja | Završen drugi | B1, B2, B3 |
| 3 — karte/UI/ažuriranja | Završen treći | C1, C2, C3, C4 |

Ukupno **9 nalaza: 5 P1 i 4 P2**, potvrđenih kontrolisanim reprodukcijama
klijentskog ponašanja. Produkcijski uticaj B1/B3 zavisi i od aktivne šeme,
ograničenja i zaštita baze, kako je navedeno uz te nalaze.

Predloženi prioritet popravki: A1/C1/C4 (trajnost terenskog rada), A2
(nenajavljeno skraćivanje), B1 (potvrda server upisa), B2/B3 (potpunost i
GPS duplikati), C3/C2 (kasni odgovori i keš). Prema `AGENTS.md`, izbor
naredne funkcionalne popravke pripada korisniku; ovaj commit dodaje izvještaj
i dijagnostiku, bez promjene aplikacije. Objavljena verzija ostaje **2.1.7**.
