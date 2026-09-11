# US-SUME — tehnički kontekst i početno stanje

Datum pregleda: 2026-09-11. Repozitorij: `pogonboskrupa/US-SUME`.
Radna grana: `CODEX-US-SUME`. Pregledani početni commit:
`c780d3a51c162de4e0ce677b6892139263f2758f`.
Verzije: web `v1.1.7`, SW `1.1.7`, Android `1.1.7`, `versionCode 343`.

Ovo je ciljani početni pregled, NE kompletan audit 41.821 reda `index.html`,
sigurnosni certifikat niti potvrda rada na telefonu. Funkcionalni kod nije
mijenjan. Dokumentacija razlikuje potvrđeno ponašanje izvornog koda,
izolovane reprodukcije i historijske tvrdnje koje nisu ponovo provjerene.

## 1. Identitet i arhitektura — potvrđeno u kodu

Glavni proizvod je Dendro Map / US-SUME: HTML/JavaScript terenska GIS
aplikacija upakovana u Java Android WebView. Python CLI i Flutter doznaka
projekat su zasebne cjeline u istom repozitoriju, ne izvršno jezgro tog APK-a.

| Cjelina | Izvor / ulazne funkcije | Uloga |
|---|---|---|
| Glavni frontend | `index.html`, 41.821 red, 2.149.640 bajtova | UI, većina poslovne logike, CSS i globalno stanje; 5 nepraznih inline JS blokova |
| Biblioteke | zaglavlje `index.html`, `static/libs/` | Leaflet 1.9.4, proj4 2.9.0, Turf 6.5.0, Supabase JS `@2`, shapefile 0.6.6; CDN put i lokalni APK fallback |
| Pokretanje/prijava | `initAuth`, `_ulazNaKesu`, `showApp`, `_startupRestore` | Keširani profil omogućava rani ulazak; prava sesija se obnavlja u pozadini; restore čeka DOM |
| Offline podaci | `static/js/offline-layer.js`, `_OL`; `index.html` `_saveLocalVlake`, `_processOfflineQueue` | localStorage keševi i red operacija, oznaka vlasnika, dedup, retry i server sync |
| Projekti/vlake | `addV`, `_doCreateVlaka`, `sbFlushVlaka`, `_sbFlushVlakaImpl`, `loadProj` | Aktivni projekat, numeracija, crtanje/snimanje, lokalno spremanje i Supabase |
| GPS | `_vlakaProcessGpsPoint`, `_addTragPoint`, `_dozProcessGpsPoint` | Različiti tokovi vlake/traga/doznake; native bafer se dopunjava pri povratku |
| Crash recovery | `_crashSaveVlaka`, `_crashSaveTrag`, `_crashCheck`, `_nativeBufUzmi` | Snapshot na 30 s i dopuna iz native fajla; potvrđeni nedostaci ispod |
| Offline karte | `makeCachedTileLayer`, `_SQL_WORKER_SRC`, `sqlmapRestoreAll` | Cache Storage pločice; SQLite/MBTiles kroz worker, IndexedDB i OPFS |
| Doznaka | `dozSaveOdjel`, `dozVlakeLoadKml`, `_dozProcessGpsPoint` | Odjeli/projekti, granice, članovi, pojasevi, stabla i povezane vlake |
| Požari | `_poziDohvati`, `_poziLoad`, `_poziSazetak`, `_povArhServerSinkOpp` | FIRMS/GFW detekcije, keš, grupisanje i lokalna/dijeljena godišnja arhiva |
| Satelitski slojevi | `_s2KljucUcitaj`, `_s2TokenUzmi`, Wayback funkcije, SW routing | CDSE OAuth/WMS, historijski Esri slojevi; runtime dostupnost nije provjerena |
| Projektovanje puta | `static/js/road-design.js`, `rdFindRoute`, `rdValidateRoute`; `_routeToVlaka` | Pretraga trase preko ubrizganog DEM uzorka, nagib/dužina/zaokreti; rezultat postaje vlaka |
| Android | `android/app/src/main/java/ba/spd/uss/vlake/MainActivity.java`, `GpsService.java` | WebViewAssetLoader, životni ciklus, foreground GPS, native mostovi |
| Backend | `supabase/migrations/`, `supabase/functions/handle-registration-action/index.ts` | Auth, RLS, poslovne tabele, RPC i potpisani linkovi za odobrenje |
| Python | `main.py`, `geo/` | CLI udaljenost, azimut, nagib, površina i lokalni server; 45 testova |
| Flutter | `doznaka/`, `.github/workflows/build.yml` | Odvojen Forestry Tracker build iz Dart fragmenata; nije Java WebView APK |

### Pokretanje, pohrana i prava

- `initAuth` čita `_OL.PROFILE`. Keširani korisnik nosi `_cachedStub`; to NIJE
  potvrđena online sesija. `showApp` blokira eksplicitno neodobren profil,
  uz izuzetak admina. `_startupRestore` je idempotentan i čeka DOMContentLoaded.
- `korak()` u `_startupRestore` hvata sinhrone greške; ne hvata automatski
  odbijene Promise rezultate. Ne tumačiti komentar o izolaciji svih koraka
  kao dokaz potpune async zaštite.
- `_checkDeviceUserSwitch` pri drugom korisniku poziva `_wipeAllLocalUserData`:
  briše lokalne karte/registre i filtrira red prethodnog korisnika. To je
  namjerna izolacija korisnika, ali može izgubiti nesinhronizovan rad.
- Vlaka ima `nm/br/kr/color/pts/poly/sbId/projektId/...`; `addPt` zapisuje
  tačku kao `{la, lo, al}`. Tragovi koriste nizove `[la, lo, alt, ts, acc]`.
  Ne prepravljati ove modele bez migracije i roundtrip testova.
- `_sbFlushVlakaImpl` prvo poziva `_saveLocalVlake`; `_OL` operacije su JSON
  u localStorage. Red sadrži `_qid`, `_uid`, payload i po potrebi broj pokušaja.
- `_processOfflineQueue` serijalizuje prolaze i obrađuje vlake, projekte,
  tragove, oznake, dnevni log, doznaku i arhivu požara. Nisu sve putanje
  potpuno offline-first: doznaka GPS pokušava server prije fallback buffera.
- Cache Storage je za pločice/shell; `tvlake_sqlmaps` IndexedDB v2 odvaja
  metapodatke `maps` od `mapBufs`; veće karte imaju OPFS put. Migraciju v2
  provjeravaju mock-testovi, ne pravi Android IndexedDB tokom ovog pregleda.
- `MainActivity` učitava appassets origin i izlaže `AndroidDownload`,
  `AndroidGps`, `AndroidShare`, `AndroidNet`, `AndroidNotif`. Vanjske navigacije
  preusmjerava u Android Intent. `NetBridge` ograničava početni HTTPS host na
  NASA/GFW, ima rokove i limit odgovora 12 MiB; redirects su uključeni.
- `GpsService` prikuplja GPS fiksove u `gps_native_buffer.jsonl`, koristi
  foreground notifikaciju i wake lock. `START_STICKY` je namjera oporavka
  servisa, NE garancija da OEM neće ubiti proces ili da neće biti prekida.
- Migracije 20260727/20260728 definišu `je_odobren`, restriktivne
  `zzz_odobren` politike i zaštitu povlaštenih kolona korisnika. Stvarne
  primijenjene politike u produkciji nisu pregledane; migracija u Git-u nije
  dokaz da je izvršena. RPC/SECURITY DEFINER zahtijeva zasebnu provjeru prava.
- `_poziLoad` razlikuje mrežni neuspjeh, keš i svjež odgovor, filtrira blizinu,
  grupiše detekcije i dopunjava arhivu. Projekcije površine i budućeg rasta
  nisu terenski izmjerena granica niti validiran model ponašanja požara.

## 2. Pet prioritetnih nalaza

### R1 — VISOK: nepouzdan oporavak vlake nakon prekida

Izvori: `index.html:11730` `_crashSaveVlaka`, `:11762` `_crashCheck`,
`:11822` poziv `saveV`, `:11826` brisanje snapshota; `addPt` i `addV`.

- `saveV` nema definiciju u pregledanom aplikacijskom kodu; jedini poziv je
  u `_crashCheck`. Postojeći `gps-bg-buffer.test.js` ga mockuje kao uspješan
  no-op (`saveV: async () => {}`), pa ne otkriva problem integracije.
- Izolovan Node VM test stvarnog `_crashCheck`, uz uspješno mockovano
  kreiranje vlake i bez izmišljenog `saveV`, dobio je poruku
  `saveV is not defined`; crash snapshot je ipak obrisan. Tačke ostanu u
  memoriji tog testa, ali trajno spremanje tim putem nije potvrđeno.
- `_crashSaveVlaka` čita `p.elev`, dok `addPt` piše `p.al`. Reprodukcija s
  visinama 600/610 dala je `null/null` u snapshotu. Recovery također upisuje
  `elev`, a ne standardni `al`.
- `snapV.projektId` se sprema, ali recovery ga ne primjenjuje na novu vlaku.
  `addV()` može otvoriti dijalog i završiti kasnije ili bez kreiranja;
  `_crashCheck` ga ne čeka prije pristupa `vlake[newI]`. Posljedice tih grana
  treba pokriti integracijskim testovima, ne pretpostaviti ispravan rezultat.
- Dodatno: Java `GpsBridge.drainNativeBuffer` briše fajl prije JS potvrde
  trajnog upisa, čak i poslije uhvaćenog IOException. `_nativeBufUzmi` na
  neispravan JSON vraća `[]`. Prekinut posljednji JSONL red može zato oboriti
  parsiranje cijelog spojenog niza. To je statički rizik, ne Android repro.

Preporuka: prvo siguran read/ack oporavak, očuvanje snapshota na grešku,
standardni model visine/projekta i test sa stvarnim kreiranjem/spremanjem.

### R2 — VISOK: red može nepovratno izgubiti operacije

Izvori: `static/js/offline-layer.js:44,103,127` (`save`, `enqueue`,
`bumpRetry`); `index.html:5530` `_processOfflineQueue`; `:6481` wipe.

Na 501. operaciji najstarija se izbacuje; nakon pet nemrežnih grešaka
operacija se briše. Postojeći testovi to eksplicitno potvrđuju. `_OL.save`
i `enqueue` ne vraćaju pozivaocu potvrdu uspješnog trajnog upisa; puna kvota
daje toast, ne pouzdanu transakciju. Promjena korisnika filtrira prethodni red.
`_retryOrphanVlake` ublažava dio slučajeva za vlake bez `sbId`, ali ne vraća
sve odbačene izmjene/brisanja/arhivske operacije. Ne tvrditi da nestane baš
svaki lokalni objekat: potvrđen je gubitak operacije u redu.

Preporuka: trajni registar neuspjelih operacija, izvoz/oporavak i eksplicitna
potvrda upisa; ne automatsko odbacivanje nesinhronizovanog rada.

### R3 — VISOK: viseći zahtjev može blokirati sinhronizaciju

Izvori: `index.html:5291` `_processOfflineQueue`, Supabase fetch adapter
oko `:5053`, `:38532` `_dozProcessGpsPoint`, `:39293` `dozSaveOdjel`.

Queue handler ima direktne `await` pozive bez lokalnog timeouta/abort-a.
Globalni Supabase fetch adapter postavlja `cache: no-store`, ne rok.
Izolovana reprodukcija s Promise zahtjevom koji se ne razriješi ostavlja
`_syncInProgress=true`; naredni poziv postavlja samo `_syncRerun=true`.
Ovo dokazuje ponašanje na takvom transportu, ne mjeri rok stvarne mreže.
Doznaka GPS stavlja tačku u sync buffer tek u catch grani poslije inserta;
postojeći live snapshot nije isto što i potvrđen pending upis za server.

Preporuka: lokalno durable enqueue prije zahtjeva, ograničen transport,
idempotentni retry. Sam Promise.race bez zaustavljanja zahtjeva može ostaviti
kasni upis u letu — obavezno testirati izgubljen odgovor i duplikate.

### R4 — VISOK, uslovan na konfiguraciju: CDSE client secret na klijentima

Izvori: `supabase/migrations/20260910_sentinel2_kljucevi.sql`,
`index.html:12942–13012` `_s2KljucKesUcitaj`, `_s2KljucUcitaj`, `_s2TokenUzmi`.

RLS SELECT je dozvoljen svakom odobrenom korisniku; kod čita `client_secret`
i sprema ga u localStorage. Skrivanje admin polja ne čini tajnu nedostupnom
odobrenom klijentu. Ako je pristup konfigurisan, kompromitovan/izgubljen
uređaj ili zloupotreba odobrenog naloga izlaže zajednički pristup. Nisu
čitane stvarne vrijednosti niti je potvrđeno da je produkcija konfigurirana.

Preporuka: server-side razmjena/posredovanje s provjerom korisnika i kvotama;
rotaciju planirati s vlasnikom ako se potvrdi postojeća izloženost.

### R5 — VISOK za isporuku: build put ne odgovara novoj radnoj grani

Izvori: `android/build-apk.ps1` parametar Branch i checkout/pull;
`android/gradlew`, `.github/workflows/build.yml`, `android/app/build.gradle`.

- PowerShell build po defaultu prelazi na `claude/branch-072026-sa9wz0`.
  Bez eksplicitne grane može napraviti APK bez naših izmjena.
- Gradle wrapper JAR nije tracked/prisutan. `sh android/gradlew --offline
  --version` pada sa `ClassNotFoundException: org.gradle.wrapper.GradleWrapperMain`.
  Nije se stiglo do kompajliranja Android koda. Java 17 postoji; nema `adb`
  ni samostalne `gradle` komande. Instalirani Android SDK nije potvrđen.
- Workflow pod imenom Build Android APK gradi Flutter `doznaka/`, NE
  `android/` WebView. Nema automatizovanog test workflowa u pregledanoj grani.
- Release potpis nije konfigurisan u build.gradle; debug ima `.debug`
  applicationIdSuffix. FileProvider authority je fiksan, što je kandidat za
  konflikt paralelne instalacije debug/release; nije testirano na uređaju.

Preporuka: reproducibilan WebView build vezan za tačan commit/granu i postojeći
potpis. Ne deinstalirati korisnikovu aplikaciju radi zaobilaženja potpisa bez
backup-a: to može obrisati jedinu kopiju terenskog rada.

## 3. Dodatni rizici i nepoznanice

- Održavanje/performance — SREDNJI: veliki `index.html` i zajednički globalni
  scope otežavaju integracijske provjere. `sqlmapRestoreAll` redom učitava sve
  nepriskočene karte, ne samo aktivnu. Struktura potvrđena; stvarno trajanje
  i memorija na korisnikovom telefonu nisu izmjereni. Prvo pribaviti postojeći
  red `⏱` iz Offline karte, posebno dio `PRIJE poziva`, pa odlučiti o popravci.
- Arhiva požara — SREDNJI: `_povArhServerSinkOpp` postavlja jednokratnu
  zastavicu prije provjere konekcije i ne vraća je na grešku; `.limit(50000)`
  bez paginacije nije dokaz kompletnosti server rezultata. Serverov stvarni
  maksimalni broj redova nije provjeren. Potrebni retry/reconnect i pagination testovi.
- Android hardening — za dodatni pregled: uključeni file/universal file access,
  mixed content i cleartext; native mostovi proširuju posljedice eventualnog
  XSS-a. Vanjske navigacije jesu ograničene; nije demonstrirana eksploatacija.
- Supabase CDN zavisnost `@2` nije tačno pinovana; lokalna kopija i mrežna
  verzija mogu se razlikovati. Ne mijenjati bez kompatibilnosti/offline testa.
- Nisu provjereni produkcijski RLS, stvarni korisnici, potpis instaliranog APK-a,
  puni Android lifecycle, OEM battery manager, stvarna kvota/evikcija pohrane,
  mrežni CORS i satelitski endpointi, realne granice/KML/SHP podaci ni UI na telefonu.
- Historijske tvrdnje `CLAUDE.md` o ranijim Playwright/terenskim rezultatima
  nisu ponovljene ovim pregledom. Npr. opća tvrdnja o pouzdanom crash recoveryju
  ima konkretne izuzetke iz R1; ne prenositi je kao garanciju.

## 4. Izvršene provjere

Node `v24.19.0`, Python `3.12.14`, Java OpenJDK `17.0.20`.
Svaki JS test fajl izvršen je u zasebnom Node procesu (rok 60 s), bez mrežnih
upisa. Python testovi su čista geometrija. Aplikacija nije pokrenuta s pravom
Supabase sesijom; nisu pokretane migracije, workflowi, deployment ni instalacija.

| JS test fajl u tests/js | Prošlo | Palo |
|---|---:|---:|
| admin-korisnici | 30 | 0 |
| auth-offline-first | 17 | 0 |
| boje-nagiba | 12 | 0 |
| dem-contours | 7 | 0 |
| dem-terrarium | 5 | 0 |
| dlg-overlay | 9 | 0 |
| gps-bg-buffer | 13 | 0 |
| kml-click | 14 | 0 |
| loc-popup-trag | 5 | 0 |
| map-restore-indicator | 12 | 0 |
| offline-layer | 13 | 0 |
| pozari-arhiva | 40 | 0 |
| pozari | 195 | 0 |
| rec-bar | 15 | 0 |
| road-design | 13 | 0 |
| sentinel2 | 20 | 0 |
| sqlmap-idb-split | 16 | 0 |
| startup-restore | 7 | 0 |
| tile-bloburl | 9 | 0 |
| ugladi | 18 | 0 |
| vlake-list | 8 | 0 |
| vlake-nagib | 29 | 0 |
| wayback | 10 | 0 |
| **Ukupno** | **517** | **0** |

Python: **45 prošlo**, 0 palo. Početni direktni poziv nije imao pytest;
izolovano `uv --with` okruženje je zatim uspješno pokrenulo testove.
Sintaksa: svih **5 nepraznih inline JS blokova** prolazi Node `vm.Script`;
to nije browser E2E niti provjera svih referenci na funkcije.
Dodatne izolovane Node VM reprodukcije R1/R3 su izvršene nad izvučenim
stvarnim funkcijama, sa sintetičkim podacima i stubovima — bez novog test
fajla u ovom dokumentacijskom commitu.

### Komande za ponavljanje (iz korijena repozitorija)

```bash
git branch --show-current
git status --short
for f in tests/js/*.test.js; do node "$f" || exit 1; done
PYTHONDONTWRITEBYTECODE=1 uv run --with pytest --with geographiclib --with rich --no-project python -m pytest -q -p no:cacheprovider tests
```

Syntax-only provjera (ne izvršava aplikaciju ili mrežne pozive):

```bash
node - <<'JS'
const fs = require('fs'), vm = require('vm');
const html = fs.readFileSync('index.html', 'utf8');
let count = 0;
for (const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)) {
  if (/\bsrc\s*=/.test(m[1]) || !m[2].trim()) continue;
  new vm.Script(m[2]); count++;
}
console.log(count + ' inline blokova: sintaksa OK');
JS
```

Build procedura za budući odobreni zadatak (NIJE izvršena ovim pregledom):

1. Provjeri čistu granu `CODEX-US-SUME`, tačan commit i postojeći potpis APK-a.
2. Osiguraj Android SDK 34, JDK 17 i ispravan Gradle wrapper/alat. Trenutni
   checkout nema wrapper JAR; to je konkretan blocker reprodukcije.
3. Iz korijena `bash android/copy-assets.sh`, pa u `android/` pokreni
   `./gradlew assembleDebug` nakon rješenja wrappera. Ne koristiti install task.
4. Alternativno na Windowsu eksplicitno navedi granu:
   `powershell -ExecutionPolicy Bypass -File android\build-apk.ps1 -Branch CODEX-US-SUME -BuildType debug`.
   Skripta radi fetch/checkout/pull i čisti generisani assets direktorij;
   ne pokretati je usred lokalnih nezavršenih izmjena.
5. Provjeri sadržaj assets-a i usklađenost verzija prije i nakon builda.
   Native izmjene trebaju pun rebuild. Debug i release nisu zamjenjivi.

Push dokumentacije na CODEX-US-SUME ne odgovara `deploy.yml` push filteru
(`main`, `claude/**`). Build workflow je samo workflow_dispatch. Ne mijenjati
te filtere niti pokretati workflow u ovoj fazi.

## 5. Obim čitanja i plan

Pročitan cijeli `CLAUDE.md`; AGENTS.md nije postojao u početnom checkoutu.
Pročitan cijeli offline-layer, build-apk.ps1, copy-assets.sh, build.gradle,
Android README, oba GitHub workflowa i docs/MODULARIZACIJA.md. Pregledani
su navedeni segmenti index.html (auth/startup, wipe, save/queue, crash,
native replay, doznaka, satelitski ključevi, požari i SQLite restore),
Android setup/most/GPS buffer dijelovi, odabrane RLS migracije, testni
harnessi, Python/Flutter ulazi i road-design parametri/pretraga.
Ostatak UI-ja, svi import/export tokovi, sve migracije, native kamera/share
detalji, minificirane biblioteke i cjelokupan Flutter kod nisu linijski auditirani.

Naredni zadaci, tek poslije korisnikovog izbora:

1. **Zaštita oporavka i podataka (R1/R2):** crveni regresijski testovi koji
   koriste stvarni model vlake, pad spremanja, punu kvotu, >500 stavki,
   prekid JSONL reda i promjenu korisnika; zatim mali ciljano odobreni fix.
2. **Pouzdan offline sync (R3):** durable enqueue, transportni rokovi,
   idempotentnost i reconnect; potvrditi da kasni odgovor ne duplicira upis.
3. **Kontrolisana APK isporuka i sigurnosna provjera (R4/R5):** reproducibilan
   WebView build/test gate, postojeći potpis i test na telefonu; read-only
   potvrda RLS/config stanja pa zasebno odobreno uklanjanje client secreta s uređaja.

Prvo R1: dodatna provjera je već pokazala konkretan kvar na najskupljem
scenariju — spašavanju snimka s terena. Modularizacija dolazi postepeno,
tek kad stabilizujemo te tokove; 41k redova samo po sebi nije razlog za rewrite.

## 6. Promjene nakon početnog pregleda — v1.1.8

Ovaj odjel opisuje kod pripremljen na `CODEX-US-SUME` nakon početnog audita.
Raniji nalazi R1–R5 ostaju historijski dokaz početnog stanja.

### Brži prvi prikaz karte

- `index.html` sada učitava ključne biblioteke iz lokalnog `static/libs`, a
  Google font je neblokirajući dodatak. Početak više ne čeka CDN timeout.
- `_startupRestore` pokreće `sqlmapRestoreAll` odmah nakon prikaza početnog
  taba; SQL worker koristi lokalni sql.js bez CDN pokušaja.
- Pri pokretanju se obnavlja samo aktivna offline karta. Ostale sačuvane karte
  su odgođene dok ih korisnik ne izabere, umjesto serijskog učitavanja svih
  velikih MBTiles/SQLite fajlova prije prvog korisnog prikaza.
- `tests/browser/codex-startup.cjs` pokriva sintetički IndexedDB/MBTiles
  scenario, ali nije izvršen jer ovom okruženju nedostaje Playwright Chromium.
  Poboljšanje treba potvrditi cold-start mjerenjem stvarnog APK-a.

### Očuvanje podataka i sync

- `static/js/offline-layer.js` više ne reže red na 500 operacija i ne briše
  operaciju poslije pet neuspjeha. Ostaje blokirana za ručni retry/izvoz.
- Vlake i doznaka projekti prvo dobijaju lokalni zapis/UUID pa tek onda
  pokušavaju server. `static/js/reliable-fetch.js` ograničava čekanje odgovora
  i njegovog tijela, bez automatskog ponavljanja upisa.
- Sync vlake veže server ID/reviziju na novije lokalne operacije, prepoznaje
  konflikt i utrku duplog inserta. Server red više ne prepisuje izmjenu koja
  još čeka sync.
- Doznaka GPS ide prvo u lokalni bafer. Migracija
  `supabase/migrations/20260911_codex_gps_idempotent.sql` je pripremljena, ali
  **nije izvršena**; dodaje RLS-respecting idempotentni RPC uz klijentski
  fallback dok RPC ne postoji.
- Promjena korisnika arhivira lokalne terenske zapise po vlasniku prije
  čišćenja prikaza, a queue se ne briše. Offline karte se ne arhiviraju zbog
  veličine i izolacije korisnika; po potrebi se ponovo uvoze.

### GPS oporavak i Android

- Crash snapshot vlake čuva `al`, projekt i krak, te se briše tek nakon
  potvrđenog lokalnog upisa.
- `NativeGpsBuffer.java`, `GpsService.java` i `MainActivity.java` uvode
  read/ack: native fajl se ne briše dok JavaScript prvo ne upiše sirovi
  journal. Oštećen red ne odbacuje zdrave redove.
- WebView zabranjuje file/universal-file pristup, mixed content i cleartext
  HTTP; FileProvider koristi `applicationId`, a GPS broadcast je paketni.
- Android kod nije kompajliran ni testiran na uređaju u ovom okruženju.
  Promjene traže puni APK build i lifecycle test na telefonu.

### Sentinel i build

- Uklonjeni su CDSE OAuth/WMS kod, UI, SW ruta i cache manager za svježi
  Sentinel-2 snimak. Pri pokretanju se brišu stari klijentski secret i cache.
  Preostali sloj `🌍 Sentinel` je javni ESA WorldCover, bez ključa.
- Historijska migracija `20260910_sentinel2_kljucevi.sql` ostaje radi historije.
  Nije pokrenuta destruktivna migracija za server tabelu/funkciju.
- Verzija je usklađena: web/SW `1.1.8`, Android `versionCode 344` i
  `versionName 1.1.8`.
- `android/build-apk.ps1` prihvata samo `CODEX-US-SUME`; bootstrap provjerava
  službeni Gradle 8.4 wrapper checksum. Manualni workflow
  `.github/workflows/codex-webview.yml` gradi Java WebView APK, ali nije
  pokrenut niti je APK objavljen.

### Provjere v1.1.8

Svih 24 `tests/js/*.test.js` fajlova prolazi (**516 provjera, 0 padova**),
Python **45/45**, pet inline i četiri izdvojena JS fajla prolaze sintaksnu
provjeru, a manifest XML parser. Nisu provjereni produkcijski Supabase, nova
migracija, Android kompilacija/instalacija, background lifecycle ni stvarna
brzina cold starta.
