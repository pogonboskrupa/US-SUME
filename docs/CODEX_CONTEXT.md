# US-SUME — tehnički kontekst i početno stanje

Datum pregleda: 2026-09-11. Repozitorij: `pogonboskrupa/US-SUME`.
Radna grana: `CODEX-US-SUME`. Pregledani početni commit:
`c780d3a51c162de4e0ce677b6892139263f2758f`.
Verzije: web `v1.1.7`, SW `1.1.7`, Android `1.1.7`, `versionCode 343`.

Ovo je ciljani početni pregled, NE kompletan audit 41.821 reda `index.html`,
sigurnosni certifikat niti potvrda rada na telefonu. Funkcionalni kod nije
mijenjan. Dokumentacija razlikuje potvrđeno ponašanje izvornog koda,
izolovane reprodukcije i historijske tvrdnje koje nisu ponovo provjerene.

**Napomena (v1.5.6+)**: sekcija Požari i Projektovanje šumskog puta su od
verzije v1.5.6 uklonjene iz ove aplikacije i izdvojene u posebnu app —
opisi i nalazi o njima ispod su historijski (opisuju stanje PRIJE izdvajanja),
kod na koji upućuju više ne postoji u ovom repozitoriju.

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
| Satelitski slojevi | `_s2KljucUcitaj`, `_s2TokenUzmi`, Wayback funkcije, SW routing | CDSE OAuth/WMS, historijski Esri slojevi; runtime dostupnost nije provjerena |
| Android | `android/app/src/main/java/ba/spd/uss/vlake/MainActivity.java`, `GpsService.java` | WebViewAssetLoader, životni ciklus, foreground GPS, native mostovi. `NetBridge`/`AppNotifBridge` su otkako je Požari izdvojena NEISKORIŠTENI iz JS-a (namjerno netaknuti, vidi CLAUDE.md) |
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
- Od v1.3.2 projekcija požara koristi zaseban `pozariPovrsPane` između
  referentne karte i markera požara. Klik na pojas otvara detalje požara
  direktno na karti, a dnevni replay kumulativno prikazuje samo tačke i
  procijenjenu geometriju odabranog požara; ostali požari se ne filtriraju.
- Od v1.3.3 admin DEBUG ima zaseban zapis za GFW smetnje vegetacije. Bilježi
  period, referencu, prisutnost ključa, native/browser put, HTTP status,
  veličinu i očišćeni isječak greške, broj primljenih/filtriranih/grupisanih
  alarma i korištenje lokalnog keša. Vrijednost API ključa se ne zapisuje.
- v1.3.4 popravlja GFW `HTTP 422`: `gfw_integrated_alerts` je raster-only
  dataset i ne prihvata raniji GET SQL bbox bez geometrije. Aplikacija sada
  šalje POST JSON (`sql` + zatvoren GeoJSON Polygon od 32 segmenta za 50 km),
  kroz browser ili prošireni Android native most.
- v1.3.5 uključuje satelitske tačke požara po zadanom (ručno isključivanje se
  i dalje poštuje), zadržava svaku tačku vidljivom i grupu s više detekcija
  označava jednim glavnim trokutom. Popup trokuta prikazuje period požara i
  pokreće dnevni replay direktno na karti. Kartica „Operativni incident“ i
  njeni lokalni zapisi su uklonjeni. Admin DEBUG sada bilježi broj tačaka,
  trokuta, grupa s periodom od–do te stanje i broj koraka simulacije.
- v1.3.6 dodaje lifecycle debug koji razlikuje novi WebView dokument od običnog
  povratka iz pozadine i blokira paralelno otvaranje iste SQLite karte. Požarne
  tačke se crtaju jednim Canvas rendererom umjesto stotinama DOM elemenata,
  postojeći sloj se pri povratku u tab ponovo koristi, a Turf projekcije imaju
  ograničen cache koji preživljava mrežno osvježavanje. DEBUG Požari mjeri
  dohvat, filtriranje/keš, grupisanje, crtanje i naknadnu obradu zasebno.

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
| rec-bar | 15 | 0 |
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

## 7. Terenska provjera i startup podloga — v1.1.9

Na debug APK-u v1.1.8 potvrđeno je oko **15 s** do prikaza ranije učitane
SQLiteDB karte od približno **950 MB**, jednako online i u avionskom režimu.
Za vrijeme čekanja bila je vidljiva samo siva podloga i indikator. To potvrđuje
da preostalo vrijeme pripada otvaranju velike lokalne baze, a ne mrežnom CDN-u.

U v1.1.9 `_restoreLastMap` odmah dodaje laganu Topo podlogu, zatim otvara
SQLite u workeru i zamjenjuje podlogu tek kada je baza spremna. Indikator je
pomjeren na vrh da ne blokira korištenje karte. Online će Topo biti vidljiv
odmah; u avionskom režimu zavisi od toga postoje li odgovarajuće Topo pločice
u service-worker cache-u. Sama SQLite karta od 950 MB i dalje može trebati oko
15 s za otvaranje — ova izmjena uklanja sivu/neupotrebljivu početnu fazu, ali
ne tvrdi da je 950 MB baza otvorena trenutno.

## 8. Požarni prikaz — v1.2.0

- Svaki novi ulazak u sekciju `Požari` resetuje samo vidljive požarne slojeve;
  podaci, keševi i postavka obavještenja se ne brišu. Nema automatskog dohvata
  dok korisnik ne izabere prikaz.
- Dugme `Prikaži sve` na vrhu uključuje aktivne FIRMS detekcije, heatmap,
  okvirni smjer, projekciju/prognozu, tekuću godinu, lokalnu historiju,
  dostupne arhivske godine te EFFIS opožarene površine i FWI. Obavještenja se
  ne uključuju automatski jer zahtijevaju svjestan izbor i sistemsku dozvolu.
- Aktivni požari zadržavaju postojeću narandžasto-crvenu paletu po starosti.
  Detekcije i arhivske površine tekuće godine koriste 12 boja po mjesecima;
  sve ranije godine koriste istu prigušenu boju.
- Verzije: web/SW `1.2.0`, Android `versionCode 346`, `versionName 1.2.0`.

## 9. Ručno ažuriranje — v1.2.1

- U glavnom meniju, neposredno iznad odjave, nalazi se `🔄 Ažuriraj aplikaciju`.
  Web verzija pokreće provjeru Service Workera i osvježava aplikaciju.
- APK može provjeriti je li novija verzija objavljena i otvoriti CODEX GitHub
  build, ali Android ne dopušta tihu samostalnu instalaciju novog APK-a.
  Korisnik i dalje ručno potvrđuje preuzimanje i instalaciju.

## 10. GitHub Pages prijava — v1.2.2

- GitHub Pages URL mora biti `https://pogonboskrupa.github.io/US-SUME/`;
  mala slova u putanji vraćaju 404.
- `doLogin()` sada hvata i startup grešku prije normalne obrade prijave, pa
  korisnik dobija poruku umjesto neaktivnog dugmeta.

## 11. Požari — zapamćen prikaz (v1.2.3)

- Ulazak u sekciju Požari više ne gasi checkbox-e niti uklanja slojeve.
  Posljednje uspješno učitane detekcije vraćaju se iz lokalnog keša odmah,
  uključujući offline, pa se tek zatim mogu osvježiti mrežom.
- Godišnji prikaz i opožarene površine prikazuju sezonu mart–novembar;
  januar, februar i decembar se ne crtaju niti se nude u legendi.

## 12. Slab signal — v1.9.7 (2026-10-01)

Na zahtjev korisnika rad se nastavlja na novoj grani
`CODEX-US-SUME-2026-10-01`, od `0eba708`, umjesto historijske radne grane.

- Potvrđeno testom: pozadinski `sbLoadVlake` na neuspješan dohvat ponovo
  čita lokalne vlake i serverski keš te dvaput poziva obradu/prikaz vlaka.
  `_reloadCoreData` sada koristi osvježavanje bez obnove lokalnog keša;
  mrežni neuspjeh zadržava postojeće objekte i prikaz. Prvi ulazak i dalje
  obnavlja lokalne podatke, a uspješan dohvat primjenjuje serverske izmjene.
- Dva uzastopna mrežna pada zatvaraju automatski mrežni pristup i kada
  postoje raniji uspješni uzorci. Neuspjela proba odmah zatvara svoj prozor.
  Povremena proba i povratak veze ostaju podržani.
- Regresijski testovi nad izvornim funkcijama: prije izmjene pet padova,
  poslije izmjene `slab-signal.test.js` 32/32. Ovo potvrđuje uklanjanje
  nepotrebnog rada, ne trajanje zamrzavanja na stvarnom uređaju.
- Web/SW/Android verzija 1.9.7, Android versionCode 467. APK nije izgrađen
  niti instaliran; potreban je terenski test slabog signala na novom APK-u.

## 13. Pregled ručnog slanja — v1.9.8

Na korisnikov zahtjev za širim pregledom i uz odobren sljedeći push,
`saveNovProjekt` sada uvijek čuva projekat u redu prije potvrde uspjeha.
Osvježavanje projekata vraća neposlane iz reda prije validacije aktivnog
projekta, a potvrda doznake čuva keš stabala kada UUID ostaje isti.
Detalji, testovi i otvoreni nalazi: `docs/PREGLED_KODA_2026-10-01.md`.
Slanje terenskog reda ostaje ručno; pozadinsko preuzimanje nije ukinuto.

## 14. Ručno slanje i offline odziv — v1.9.9 (2026-10-01)

Korisnik je razjasnio cilj: ručno slanje ostaje; prioritet su brzina i
zamrzavanje na osrednjim uređajima bez interneta. Automatsko slanje nije cilj.

- `_retryOrphanVlake` je pri svakom init-u ponovo obrađivao sve vlake bez
  server ID-a, čak i identične već spremljenim operacijama. Svaki flush
  serijalizuje cijeli lokalni registar, keš i queue. Sada jedan pregled reda
  pronalazi identične operacije; one se ne prepisuju i zadržavaju blocked/retry
  status. Novija geometrija/metapodaci i vlake bez operacije se i dalje čuvaju.
- Oporavak prepušta glavnu nit između vlaka; nakon pauze ponovo provjerava
  vlasnika, prisutnost i brisanje vlake. Ovo ne odgađa izvorni terenski upis:
  radi se o naknadnom oporavku već lokalno sačuvanih podataka.
- Ručno slanje GPS serije na privremenom server/SQL kvaru više ne prelazi na
  stotinu pojedinačnih pokušaja niti nastavlja ostale serije. Nepotvrđene
  tačke ostaju u baferu. Pojedinačni put ostaje za FK/RLS greške; prekida se
  ako server tokom tog puta postane nedostupan.
- Regresije: 40 identičnih vlaka bez ponovnog flush-a, novija geometrija i
  metapodaci, promjena korisnika/brisanje tokom pauze, oštećen red; 220 GPS
  tačaka i privremeni pad daju jedan serijski pokušaj, nula pojedinačnih,
  nepromijenjen bafer. Ručni režim ostaje pokriven postojećim testovima.
- Verzije: web/SW/Android 1.9.9, versionCode 469. Nije izvršen Android build,
  instalacija ni mjerenje na telefonu. Ovo uklanja konkretan nepotreban rad,
  ne dokazuje da su svi uzroci zamrzavanja uklonjeni. Sinhroni localStorage
  velikih GPS registara i native disk sync ostaju kandidati za profiliranje.

## 15. Prvi dio pregleda — 2.0.0 / Android 470

Korisnik traži pregled i testiranje u tri cjeline, počevši od lokalnog rada.
Popravljena su dva reproducirana propusta pri padu lokalnog upisa: doznaka
više ne pomjera memorijsku geometriju prije potvrde bafera; završavanje traga
ne briše crash snapshot niti gasi snimanje kad registar nije sačuvan.
Oporavak doznake crta jednu liniju umjesto jednog sloja po segmentu.
Detalji i preostali rizici: docs/PREGLED_DIO_1_OFFLINE_2026-10-01.md.

## 16. Drugi dio pregleda — 2.0.1 / Android 471

Ručno slanje: nepoznate operacije se zadržavaju uz objašnjenje; UPDATE
statusa/zone zahtijeva potvrđen ciljani ID; zakašnjeli odgovor projekta/zone
ne mijenja lokalne podatke novog naloga. Cijeli ručni ciklus se zaustavlja
pri promjeni vlasnika. Osam novih regresijskih provjera prolazi.
Obim i otvoreni nalazi: docs/PREGLED_DIO_2_RUCNO_SUPABASE_2026-10-01.md.

## 17. Treći dio pregleda — 2.0.2 / Android 472

Tile bitmap cache ima tvrdu granicu. Dodan je manifest assets, atomarna Python priprema, Gradle `syncWebAssets` prije `preBuild`, stroge kopije i SHA-256 provjera APK-a. Svih 62 JS + 6 Python assets provjera prolaze. Wrapper JAR je vraćen i provjeren; lokalni build je sada blokiran nedostupnom Gradle 8.4 distribucijom (`UnknownHostException`).

## 18. Oporavak zadnjeg commita — 2.0.3 / Android 473

Otkriveno je da je `index.html` u commitu 2.0.2 sadržavao umetnutu poruku
alata o skraćenom izlazu i da je zbog toga nedostajala većina aplikacijskog
koda. Vraćena je posljednja cjelovita verzija i ponovo su primijenjene
provjerene izmjene iz pregleda 1–3: rad bez mreže, ručno slanje, trajni GPS
upis, oporavak traga/doznake, zaštita promjene naloga i ograničen bitmap keš.
PowerShell priprema assets-a više nema znak koji Windows PowerShell pogrešno
tumači bez UTF-8 BOM-a. `.well-known` ostaje u web repozitoriju, ali nije u
APK manifestu jer Androidov `aapt` izostavlja skrivene direktorije. Iz
`PUTEVI/` se pakuje samo korišteni `putevi.geojson`; izvorni shapefile s
dijakritičkim nazivom nije runtime asset i `aapt` mu je mijenjao ime. Python
paket `geo/` i zasebni Flutter izvor `doznaka/` također nisu WebView runtime
assets i više se ne umeću u APK. Čisti `assembleDebug` je uspješan; Python
alat je zatim SHA-256 provjerio svih 22 runtime fajlova u APK-u. Prolaze svih
63 JS testnih fajlova, 51 Python provjera i sintaksa pet inline JS blokova.
APK nije instaliran niti testiran na stvarnom telefonu.

## 19. Slab signal, GPS prikaz i primljeni podaci — 2.0.4 / Android 474

Slaba izmjerena veza sada zaustavlja pozadinske HTTP/Realtime tokove i
učitavanje pločica; lokalni rad nastavlja odmah. Ručna mrežna radnja otvara
ograničen prozor, a periodična proba provjerava oporavak veze. Slanje terenskih
podataka ostaje ručno. Keširana pločica ili roditelj prikazuju se bez čekanja;
rok obuhvata i tijelo odgovora. Iskrcana pločica odbacuje zakašnjeli odgovor.
GPS doznaka koristi Canvas i linije do 128 segmenata, ne zaseban sloj po fiksu.

Panel „Pošalji podatke na server” prikazuje nove/ažurirane vlake drugih članova
projekata čiji je vlasnik drugi projektant. Ručno osvježavanje provjerava
članstvo i preuzima podatke u postojeći geometrijski keš. Odvojeni sažetak ima
najviše 200 stavki, izolovan je po nalogu i dostupan offline. Realtime izmjene
se grupišu prije upisa; zakašnjeli odgovor ne prelazi na novi nalog.

Prolazi svih 65 JS testnih fajlova, 51 Python test, sintaksa pet inline blokova i obje browser
provjere. Simulacija Chrome CPU 4×: 40 vlaka / 32.000 tačaka lokalno dostupno
za 1,8 s; 1.500 GPS segmenata koristi 12 slojeva umjesto 1.500. Slaba veza daje
nula pozadinskih zahtjeva u provjeri; pregled preuzetog projekta radi offline
i ne šalje podatke. Lokalni assembleDebug uspješan; SHA-256 svih 22 runtime
fajlova u APK-u potvrđen. Ovo nisu mjerenja na stvarnom telefonu niti provjera
produkcijskih Supabase prava. Offline podloge moraju biti ranije uvezene ili
keširane. Nema migracije baze.

## 20. Terenski upgrade — 2.0.5 / Android 475

Na zahtjev „ODRADI 1” uveden je lokalni `tvlake-field-journal` IndexedDB
dnevnik (`static/js/field-store.js`). Doznaka svaki prihvaćeni fix upisuje u
pending, geometriju sesije i mali opis sesije u JEDNOJ transakciji. UI se
pomjera tek nakon complete; podržani WebView koristi strict durability.
Nema serijalizacije cijelog GPS bafera niti live niza po fiksu. Vlaka i trag
zadržavaju postojeću pohranu/native zaštitu i snapshot na 30 s — nisu masovno
migrirani. Serijski commit sprječava preklop live/native callbacka; neuspjela
tačka se ponavlja prije novije. Završetak čeka upis u letu i ne gasi snimanje
ako završetak nije potvrđen. Zakašnjeli startup recovery ne prepisuje živi
snimak. Tačke i potvrde slanja su odvojene po vlasniku; manual sync ostaje.

Stari GPS bafer se prenosi, ponovo čita i provjerava prije brisanja originala.
Oštećen original ostaje netaknut. Stabilni legacy identiteti i receipts
sprječavaju ponovno slanje potvrđenih tačaka iz stare kopije/arhive. Aktivna
sesija vraća pune koordinate, visine i vremena; legacy snapshot čuva oznaku
nepoznatog vremena umjesto izmišljanja. Journal ostaje pri promjeni naloga,
ali drugi nalog ga ne vidi niti šalje. Nema produkcijske SQL migracije.

Meni i Projekat imaju „Spremno za teren / sigurnosna kopija”:
- provjera projekta, granica, lokalnih podataka/kolega i outbox-a;
- ograničena iscrpna Cache Storage provjera odabranog obuhvata i zoom-a,
  najviše 2048 pločica, bez mreže; drugi zoom nije time potvrđen;
- SQLite podloga se navodi kao otvorena, ali metapodaci nisu dokaz odsustva
  rupa, zato se ne daje lažno zeleno „spremno”; obuhvat vlaka bez granice je
  također nepotpuna potvrda;
- stalni status snimanja kroz tabove: tačnost GPS-a, trajanje, tačke,
  potvrđen upis/greška, veza i broj stavki za ručno slanje;
- JSON izvoz s SHA-256 i lokalna obnova samo istog naloga, bez prepisivanja
  postojećih ID-jeva. Uključuje projektne vlake/kolege, doznaka keš/GPS sesije,
  red za slanje, tragove/mjerenja i lokalni KML/GeoJSON naloga. Doznaka može
  uključiti povezani projekat vlaka. Stari tragovi/mjerenja bez projektId se
  pridružuju po GJ/odjelu; novi ga pamte eksplicitno. Rasteri, fotografije i
  referentne slike su jasno ISKLJUČENI i čuvaju se zasebno. Uvoz ima limit
  30 MB, potvrdu korisnika i preflight kopiju; nema automatskog slanja.

Provjere: svih 66 JS testnih fajlova (10 novih ciljanih provjera), tri browser
skripte, 51 Python test i sintaksa. Stvarni Chromium IndexedDB + CPU 4×:
1200 sintetičkih tačaka s vremenskim oznakama šest sati snimanja, nula upisa
starog velikog bafera; simulirani QuotaExceededError ne pomjera liniju,
naknadni oporavak vraća 1202 tačke. Provjerena i obnova na čistom profilu,
ponovljeni uvoz, vlasnička izolacija, oštećena kopija i zabrana ponovnog
stavljanja potvrđenih tačaka u outbox. Ovo nije šest sati rada na stvarnom
Android telefonu, logcat/ANR mjerenje, gubitak fizičkog napajanja niti
produkcijska Supabase provjera. To ostaje terenski korak provjere APK-a.

### Dopuna 2.0.6 / Android 476

Završna provjera obnove normalnog projekta pokazala je da `loadProj()` vraća
samo formulare, ne vlake. Uvoz sada odmah crta samo nedostajuće vlake iz
kopije, bez mreže i bez zamjene novijih objekata u memoriji. Dodana je provjera
geometrije normalnog projekta u čistom profilu i ponovljenog uvoza.

## 21. Pregled podataka po tabovima — 2.0.7 / Android 477

Korisnik je izabrao upgrade broj 2. Novi `static/js/tab-data.js` koristi samo
lokalne podatke: nema novih mrežnih zahtjeva ni automatskog slanja. Aktivni
projekat je vidljiv u panelima, dok je zasebni odjel doznake jasno označen
kao povezan ili zaseban; navigacija ne mijenja odjel niti zaustavlja GPS.

Pretraga, sort, filter neposlanih vlaka, stranica i položaj panela pamte se
po korisniku/projektu tokom otvorene sesije. Nije trajna postavka nakon
restarta. Veće liste vlaka, kolega i reda slanja crtaju po 60 kartica na
stranici (nije virtualni beskonačni scroll). Hijerarhijski redoslijed krakova
i stvarni `data-vi` indeks su očuvani; izbor s karte otvara odgovarajuću
stranicu ako vlaka nije skrivena pretragom/filterom. Kartice razlikuju lokalne
izmjene u redu od potvrđene serverske kopije. Kolege imaju lokalnu pretragu
po nazivu vlake/imenu. Panel Server ima Za slanje / Primljeno / Problemi;
problematične operacije ostaju i u redu za slanje, ništa se ne odbacuje.
Brojači i primljeni feed ostaju ograničeni na trenutnog korisnika/članstvo.

Provjere: svih 66 JS testnih fajlova, 51 Python test i četiri browser skripte.
Novi `tests/browser/tab-data.cjs` testira 240 vlaka/180 vlaka kolega, 60 DOM
kartica, izbor druge stranice, pretragu i povratak položaja, izolaciju stanja
projekata, neposlanu izmjenu već potvrđene vlake, filtre server panela i tuđi
red. Chromium s CPU 4× prikazuje stranicu za približno 28–72 ms (sintetički mali
tragovi, ne mjerenje fizičkog telefona); pregled ne pravi vanjske zahtjeve.
Regresijske provjere ručnog slanja, slabog signala, IndexedDB GPS oporavka i
sigurnosnih kopija su očuvane. Novi modul je u SW shellu i obaveznim Android
assetima. Pravi srednjerangirani Android i produkcijski Supabase nisu testirani.

## 22. Dizajn za teren — 2.0.8 / Android 478

Korisnik je odabrao broj 3 iz prethodnog prijedloga: čitljivost, dodirne
površine i dnevni prikaz. `static/css/field-design.css` je zaseban sloj nad
postojećim izgledom, bez prepisivanja navigacije ili GPS/pohrana/sync koda.
Tekst navigacije je 11.5–12 px (prethodno 10.5 px), dodirna visina 56 px;
osnovna dugmad i dijalozi imaju najmanje 48 px. Kartice, statusi, pretraga i
sažeci imaju čitljiviji tekst i ujednačene rubove. Akcije ostaju tekstualno
označene Snimi / Pauza / Nastavi / Završi, bez premještanja ili novih radnji.
Traka aktivnog snimanja ostaje dostupna; vrh je usklađen s višom navigacijom.

U Meni → Teren dodano je dugme „Dnevni prikaz za sunce”. Tamni prikaz ostaje
zadani; izbor se pamti kao postavka uređaja `tvlake_field_theme_v1` i primjenjuje
prije prvog crtanja. JS modul `field-design.js` ne pristupa projektu, GPS-u,
redu slanja ni mreži. Puna memorija ne ruši promjenu teme, nego upozori da
postavka nije trajno upisana. Dnevna tema koristi svijetle površine i tamni
tekst, semantičke statuse i jasno označene radnje; ne mijenja rastere, boje
vlaka ili geometriju. Nema novih fontova, slika, mrežnih biblioteka ili filtera
nad kartom. Oba fajla su u SW shellu i obaveznim APK runtime assetima (27).

Provjere: svih 67 JS testnih fajlova, 51 Python test, inline sintaksa i pet
browser skripti. Novi unit test provjerava lokalnu postavku/obnovu, ARIA stanje,
nepoznatu vrijednost i punu memoriju. Browser provjerava 320/360/412/768 px,
obnovu teme nakon reload-a, kontrast boje naslova i primarnog dugmeta, dodirne
visine, modale i odsustvo horizontalnog prelijevanja. Promjena teme ne gasi
simulirano aktivno snimanje, ne mijenja red niti pokreće vanjske zahtjeve.
Vizuelno pregledane screenshot slike listi vlaka/projekata/doznake i panela
Server/Spremno za teren. Dnevni prikaz nije provjeren na fizičkom telefonu
pod suncem; stvarni Android GPS i produkcijski Supabase ostaju neprovjereni.

## 23. KML vlake vezane za projekat — 2.0.9 / Android 479

U detaljima projekta dodano je „Uvezi vlake (KML)”. Ciljni projekat i korisnik
zaključavaju se pri otvaranju; dopušteni su vlastiti projekti i članstvo, ne
pregledni nalozi. KML LineString/MultiGeometry i gx:Track postaju normalni
lokalni objekti vlaka s projektom, tačkama/visinama, brojem, krakom i stranom.
Postojeći klik/popup/Edituj i editor geometrije ostaju isti kao za snimane
vlake. GPX kompatibilnost je zadržana. Poligoni se više ne upisuju pri samom
pregledu fajla: granice imaju odvojeni postojeći „Dodaj KML fajl” tok.

Pregled ne mijenja podatke; odustajanje i zakašnjelo čitanje iz prethodnog
modala ne preusmjeravaju uvoz. Nazivi su normalizovani i jedinstveni u
projektu, uključujući batch; T5.1 zahtijeva T5, a ugniježđeni krak svog
roditelja. XML nazivi se escapiraju. Neispravne KML koordinate ne smiju
tiho spojiti preostale tačke preko preskočenog dijela. Za telefon je uvoz
ograničen na 20 MB, 1000 linija i 200000 tačaka; prevelik fajl se odbija,
ne skraćuje. Cijeli uvoz se prvo trajno lokalno snimi; puna memorija
odustaje bez dodavanja na kartu/red. Slanje ostaje isključivo ručno.
Red i keš se pripremaju jednim batch zapisom, bez ponovnog serijalizovanja
svih GPS tačaka za svaku pojedinu liniju. Ako red ne stane u memoriju,
trajna lokalna kopija ostaje i poruka ne tvrdi da je pripremljen za slanje.

Preimenovanje sada ažurira i postojeću neposlanu operaciju za istog
korisnika/projekat, umjesto da stari naziv kasnije napravi dupli red.
Editor i Doznaka čuvaju identitet vlake/korisnika preko async dijaloga.
Roditeljsko preimenovanje ne preimenuje automatski sve potomke (postojeće
ponašanje); krakovi imaju zasebno preimenovanje u editoru.

Provjere: 68 JS testnih fajlova, 51 Python test, pet inline JS blokova,
browser testovi KML/ručno slanje/tabovi/slab signal/dizajn. Novi browser
test stvarno bira KML fajl, provjerava ciljni projekat uprkos drugom aktivnom,
roditeljski krak, popup/editor, preimenovanje bez stare queue stavke,
punu memoriju, promjenu korisnika, escaping, prefiksirane namespaceove,
MultiGeometry/gx:Track, zakašnjeli FileReader i obnovu nakon reload-a.
Lokalni debug APK je izgrađen i svih 27 runtime assets SHA-256 provjereno.
Pravi Android birač fajlova, GPS i produkcijski Supabase nisu testirani.

## 24. Vidljivija Android ikona — 2.1.0 / Android 480

Na zahtjev korisnika povećan je samo unutarnji grb (~10.2% linearno), bez
redizajna, raster obrade, promjene boja, vanjskog okvira ili login/splash
grafike. Manifest koristi nove `ic_launcher_visible` i `round_visible`
resurse. Android 8+ adaptivna maska zadržava postojeću zelenu pozadinu;
foreground XML proširuje postojeći providni bitmap simetrično za 5.5dp
na 108dp platnu. Android 7 ima zaseban 48dp fallback s 53dp grbom, zelenom
podlogom i očuvanim ovalnim okvirom za roundIcon. PWA PNG ikone nisu
mijenjane; ovaj zahvat odnosi se na instaliranu Android aplikaciju.

Novi Node test čita stvarne PNG alpha piksele u pet density varijanti i
provjerava da povećani grb (uz rub piksela/interpolaciju) stane u centralni
66dp sigurni krug i da dijagonala crteža ostane <=61% platna. Provjerava i
manifest/XML veze i odvojeni fallback. Browser preview upoređuje stare/nove
kružne, zaobljene i kvadratne maske, uključujući prikaz na 48px; to je
simulacija, ne Android launcher screenshot. Prolazi 69 JS testnih fajlova,
Gradle debug build i SHA-256 provjera svih 27 web runtime assets u APK-u.
Nije izvršena instalacija niti provjera na stvarnim Android launcherima.
