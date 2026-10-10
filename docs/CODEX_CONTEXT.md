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


## 25. Slanje i preuzimanje vlaka u zajedničkom projektu — 2.1.1 / Android 481

Korisnik je izričito otvorio najnoviju granu `CODEX-US-SUME-2026-10-01`
i prijavio da druga vlaka ne stiže drugom projektantu u verziji 2.1.0.
Ovaj zadatak koristi taj izabrani izvor (`8887494`), umjesto historijske
radne grane 1.9.6 iz uvodnih uputa. Git clone nije dostupan zbog nedostupnog
proxyja; tačni izvorni fajlovi i testni resursi preuzeti su GitHub konektorom.
Lokalni Git snapshot služi za diff, nije kopija udaljene commit historije.

Potvrđeni klijentski propusti i popravke:
- Ručni pritisak ranije provjerava samo postojeći red, prije debounce upisa
  nove vlake. Sada čeka lokalno spremanje odgođenih vlaka i oporavlja vlake
  bez serverskog ID-ja prije otvaranja kapije slanja. Prazan red više ne
  onemogućava dugme; priprema može otkriti neposlanu lokalnu vlaku. Dupli tap,
  promjena naloga, oštećen red i puna memorija ne daju lažnu potvrdu slanja.
- Pregled/preuzimanje primljenih vlaka ranije isključuje vlastite projekte,
  pa vlasnik ne preuzima doprinos člana. Sada obuhvata vlasništvo i članstvo,
  uz isključenje vlastitih vlaka iz pregleda kolega.
- Ručno preuzimanje ranije samo sprema geometriju u keš. Sada istim odgovorom
  osvježava i aktivnu kartu, bez ponovnog upita.
- Učitavanje kolega ne filtrira autore po zastarjeloj lokalnoj listi članova:
  projekat i postojeći server RLS ostaju autoritet za čitanje. Sve stranice
  vlaka se preuzimaju prije primjene. Zakašnjeli odgovor ne precrtava drugi
  nalog/projekat niti noviji paralelni dohvat. Pad druge stranice zadržava
  raniju kartu/keš. Neuspjelo trajno keširanje ne javlja uspjeh preuzimanja.

Regresijska provjera `tests/js/server-dvije-vlake.test.js`: 14/14, sa
stvarnim izvornim funkcijama i lažnim serverom/kartom. Na izvornom 2.1.0
reproducirano: poslije prvog slanja T1, drugi pritisak prije debouncea ne
šalje T2; vlasnik ne preuzima vlake člana; ručno preuzimanje ne crta novu
vlaku u aktivnom projektu. Testovi pokrivaju i 201 vlaku kroz tri stranice,
pad stranice, promjenu naloga/projekta, paralelne odgovore i lokalnu kvotu.
Prolaze svih 70 JS testnih fajlova i sintaksa pet inline JS blokova.

Nema SQL migracije ni pristupa stvarnim podacima/proizvodnoj Supabase bazi.
Ovo nije potvrda stvarnih produkcijskih RLS pravila, WebSocket isporuke niti
ponašanja dva fizička Android telefona. APK nije izgrađen ni instaliran.
Commit koristi `[skip ci]` jer postojeći push workflow automatski objavljuje
APK, a ovaj zahtjev je popravka koda. Potreban je naknadni puni APK build iz
2.1.1 i terenska provjera: pošiljalac ručno pošalje T1 pa T2; primalac
osvježi panel Server i provjeri obje vlake na karti, kao vlasnik i kao član.

## 26. Server: zajednički pregled projekta — 2.1.2 / Android 482

Korisnik traži završetak popravke, jasniji Server, projekat/projektanta,
zajednički ispis svih vlaka sa dužinama, zatim izričito novu verziju za
ažuriranje unutar aplikacije. Taj posljednji zahtjev autorizuje puni APK
build i objavu kroz postojeći push workflow odabrane grane
`CODEX-US-SUME-2026-10-01`; ovaj commit nema `[skip ci]`.

`server-panel.js` i pripadajući CSS uvode početni tab Vlake projekta:
izbor dostupnog projekta, prijavljeni projektant, broj vlaka, zbir zasebnih
dužina, pregled i filter po projektantima, pretragu i paginaciju 60 redova.
Puni HTML ispis obuhvata sve vlake odabranog projekta i zbir po autorima,
nezavisno od pretrage/stranice/filtera. Iste oznake kod različitih autora
ostaju zasebne; isti serverski ID nakon preimenovanja ne duplicira red.
Geometrija bez dvije validne tačke nema lažnu nultu dužinu.

Ručni refresh preuzima sve dozvoljene vlake odabranog projekta, uključujući
vlastite sa drugih uređaja. Preuzimanje čuva lokalni debounce, queue i
aktivno GPS snimanje. Izbor projekta u Serveru sam ne mijenja aktivnu kartu.
Pregled ne šalje podatke automatski. Neposlane/stare kopije imaju vidljiv
status; postojeće kopije koje nedostaju u novom odgovoru se ne brišu.
Zadnje potpuno preuzimanje pamti se po nalogu/projektu, ne po globalnom
telefonu; neispravni metapodaci ne ruše panel. Red slanja pokazuje kontekst
projekta i autora, tekst i ključ u HTML-u su escapirani. Brojač Primljeno
uključuje i vlastite projekte, lokalne operacije ne povećavaju broj slanja.

Svi novi runtime resursi dodani su u SW i Android assets manifest.
Objava APK-a koristi postojeći fiksni debug potpis; release tag sada
izričito pokazuje commit koji je izgrađen umjesto default grane.
Prolazi 71/71 JS testnih fajlova, uključujući 23 provjere novog panela,
14 regresija slanja/preuzimanja, sintaksa pet inline blokova i tri modula.
Pripremljen je browser fixture za dva izgleda i četiri širine; Chromium
lokalno blokira sandbox i vizuelna provjera nije završena. Nema pristupa
produkcijskoj Supabase bazi, migracije ni instalacije na stvarni telefon.
Ishod GitHub APK builda/objave provjerava se odvojeno nakon pusha.

Potvrđeno 2026-10-02: workflow `37047479985`, job `110972380755`, uspješan.
Izgrađen commit `7bda9b0b5a7446af29a6eb32545d92c9e119a30e`, 71 JS
testnih fajlova i APK SHA-256 provjera 29 web resursa prolaze. Najnoviji
nedraft release `v2.1.2` sadrži `app-debug.apk` (21.617.963 bajta), stanje
`uploaded`; tag pokazuje tačan izgrađeni commit. APK SHA-256:
`b6201d75b3b3ab68a5a2de6b8b11580646299d05bb70aeae43a89d537b6d7edc`.
Native updaterov `/releases?per_page=1` vraća ovu objavu; korisnik može
pokrenuti Meni → Ažuriraj aplikaciju. Stvarna instalacija, vizuelni izgled
i saradnja na dva fizička telefona nisu potvrđeni ovom CI provjerom.

## 27. Štampa, Dnevni mod i glavni Meni — 2.1.3 / Android 483

Korisnik traži prilagodljiv opis gore u sredini štampanog lista umjesto
automatske šumarije, opis legende, bolji pregled štampe, popravku svijetlog
teksta u dnevnom prikazu i novi dizajn Menija s jasno vidljivim korisnikom,
logom, nazivom aplikacije i verzijom na dnu. Sve ide u isti naredni APK.

Štampa ima dva višeredna opisa (do 300 znakova) i opcionalno preimenovanje
standardnih simbola (do 80 znakova), uz očuvanje boje/crteža simbola. Opisi i
nazivi se pamte lokalno u postojećim postavkama; odjel/G.J. i dalje dolaze
iz aktivnog projekta. Šumarija se automatski više ne ispisuje u zaglavlju.
Datum ostaje, dugi naslov/opis/legenda se prelamaju. Vlastite stavke su
ograničene na 12 i dobile dostupno dugme uklanjanja. Veći pregled sklapa
postavke bez mijenjanja mjerila, formata ili podataka. Native PrintManager
i dimenzije lista/mjerilo ostaju postojeći tok.

Meni ima pet sekcija u karticama, stvarna dugmad sa postojećim akcijama i
ID-jevima za dozvole. Skroluju se samo sekcije, footer ostaje vidljiv:
ime/prezime iz profila prijavljenog korisnika, uloga/šumarija, centriran
postojeći logo `icon-192.png`, US ŠUME · Vlake i verzija. Otvaranje ponovo
provjerava nalog; stari profil drugog naloga ne prikazuje tuđe ime.
Postavka teme je preimenovana u Dnevni mod. Ispravljeni Lokacija/Izmjeri
u omotačima donje trake, ugašena GPS ikona, statusi i preostali svijetli
natpisi u statistici/slojevima/oznakama. Kontrole štampe prate obje teme.

Lokalno prolazi 72/72 JS testnih fajlova, pet inline blokova i sintaksa
field-design.js. Štampa sada ima 17 provjera, dodana je promjena identiteta
Menija kroz različite naloge. Browser fixture koristi stvarni HTML/CSS i
funkcije uz lažni projekat/kartu: Meni 320/390/768 i pejzaž 568×320 u dvije
teme, vidljiv footer, boje Lokacija/Izmjeri, opise, legendu i PDF. Pokreće se
na GitHub runneru prije APK-a jer lokalni Chromium blokira sandbox.
Stvarno štampanje/instalacija na fizičkom Android uređaju nisu potvrđeni.

APK 2.1.3 je objavljen: workflow `37049513747` uspješan, tag na
`e5408b23b86f272b0b5ab7742725e22faef2b39f`. Naknadno je ispravljen UTF-8
samo u browser fixtureu i dodata provjera naših slova/učitanog loga;
workflow `37049836057` za `f1d96b15e28cf121727e71face0675cca6373164`
takođe uspješan. Runtime APK resursi nisu promijenjeni tim testnim commitom.

## 28. Upravljanje projektima — 2.1.4 / Android 484

Na dodatni korisnikov zahtjev redizajnirani lista i detalj sekcije unutar
Menija. Pretraga odjela/G.J./vlasnika i filter svih/aktivnog/vlastitih/
dijeljenih projekata rade lokalno; zbirni pregled ostaje za cijeli skup.
Kartice kao dostupna dugmad imaju odjel, G.J., vlasnika, aktivni status,
broj glavnih vlaka/krakova, ukupnu dužinu, datum i površinu. ID prolazi
kroz escapirani data atribut, ne interpolaciju u JavaScript string.

Kartice običnog projektanta sada koriste isti zadnji dostupni zajednički
skup kao Server (uključujući preuzete vlake kolega). Model prihvata opcionalni
ID projekta bez mijenjanja izabranog projekta u Serveru ili na karti.
Offline detalj koristi isti skup; tačke su kopirane prije obogaćivanja
visina tako da pregled ne mijenja keš ili živo snimanje. Novi mrežni upiti
nisu uvedeni; admin/vodeći zadržavaju postojeće RPC agregate i filter šumarije.

Detalj ima istaknut odjel/G.J./vlasnika/dužinu, jasne postojeće akcije,
kartice osnovnih podataka/statistike/projektanata/radnih dana, čitljive
veličine slova i tabele sa horizontalnim skrolom. Stilovi su ograničeni
na PM modal, koriste obje teme i prilagođavaju se telefonu/pejzažu/tabletu.
Granice/geo podaci, podloge, dozvole i postojeći izvještaj ostaju isti.

Krakovi se grupišu po autoru i oznaci: dva projektanta sa T1 više ne
prikazuju isti krak dvaput u zajedničkoj tabeli.
Lokalno prolazi 73 JS testna fajla, uključujući osam novih regresija PM-a,
pet inline blokova i server-panel.js. Browser fixture proširen stvarnim PM
funkcijama i lažnim projektima, zajedničkim kešom i kartom: lista i detalj
na četiri veličine u obje teme, filteri i tabele; ostaju provjere Menija,
naših slova, Dnevnog moda i štampe/PDF-a. APK objavljuje postojeći workflow
po zahtjevu za ažuriranje unutar aplikacije. Stvarni telefoni/Supabase i
fizička štampa nisu testirani.

Potvrđeno 2026-10-02: prva browser provjera otkrila je postojeći skriveni
povratak iz detalja (prazan inline display ponovo aktivira CSS display:none).
Detalj sada izričito postavlja inline-flex; regresija i stvarni klik u
browseru prolaze. Popravka uključena prije prve objave APK-a 2.1.4.

Workflow `37052260164`, job `110988276766`, uspješan za commit
`8a41e1a2479a6a9b8e16ecd6f25d54204275df2d`: 73/73 JS testna fajla,
browser pregled Menija i projekata na četiri veličine u obje teme,
filteri/povratak, opisi štampe/PDF i provjera 29 APK web resursa.
Sačuvano 25 PNG pregleda i jedan PDF; vizuelno provjereni lista/detalj
projekata, oba moda i footer Menija. Fixture koristi lažne lokalne podatke
i zamjenu karte; ne potvrđuje stvarno crtanje geometrije ili native štampu.

Nedraft javna debug objava `v2.1.4` sadrži `app-debug.apk` (21.640.363
bajta), stanje uploaded. Tag pokazuje navedeni izgrađeni commit; native
updaterov `/releases?per_page=1` vraća ovu objavu. APK SHA-256:
`63a50be05efe308e810291649b54ea23a9cba2fc1fc1030074ce9c5fc1e86625`.
Android versionCode 484, postojeći fiksni debug potpis. Korisnik pokreće
Meni → Ažuriraj aplikaciju; instalacija i saradnja na dva fizička telefona
nisu potvrđene u ovom okruženju.

## 29. Provjera slanja vlaka/doznake i naziv DENDRO MAP — 2.1.5 / Android 485

Korisnik traži provjeru slanja nacrtanih i GPS snimljenih vlaka i pojaseva
doznake, naziv DENDRO MAP u Meniju i bolji dizajn dugmeta Vlake.
Slanje ostaje isključivo ručno preko Meni → Server → Pošalji na server.
Oba načina unosa vlake prolaze kroz addPt/scheduleVlakaSave/sbFlushVlaka i
upsert_vlaka → tabelu vlake. GPS pojas ide kroz trajni FieldStore dnevnik
i serije doz_track_points; obojeni poligon pojasa računa se iz tih tačaka
i granice odjela. Nacrtane zone šalju boundary_geojson u doz_area_markings.

Nađen i ponovljen problem hladnog pokretanja: brojač prije učitanog IDB-a
može prijaviti nula GPS tačaka i serverPosalji kaže da je sve već poslano.
Priprema sada čeka FieldStore.init i provjerava vlasnika nakon await-a;
greška dnevnika prekida slanje bez lažnog uspjeha. Djelimični uspjeh mjeri
i smanjenje broja GPS tačaka, jer je pojas u zbirnom brojaču jedna stavka.
Kod pune memorije nacrtana zona ne zatvara modal niti gubi geometriju ako
enqueue nije potvrdio upis; prikazuje poruku i ostavlja ponovni pokušaj.

Novi server-vlake-doznaka.test.js koristi izvorne funkcije, cijeli procesor
reda i lažni server/dnevnik. Deset provjera: oba načina unosa vlake preko
addPt, zona i 205 GPS tačaka jednim pritiskom, bez automatskih upisa;
hladni dnevnik, greška IDB-a, pad veze, RLS sa djelimičnim potvrdama,
izgubljen odgovor bez duplikata, promjena naloga, nova tačka tokom slanja,
legacy bafer/tuđi podaci i puna memorija zone. Na izvornoj 2.1.4 pada pet
ovih provjera; na 2.1.5 prolazi svih deset. Supabase je lažan: ne potvrđuje
trenutne produkcijske dozvole/RLS ili razmjenu na dva stvarna telefona.

Meni zadržava korisnika/logo/verziju, naziv i alt loga sada DENDRO MAP.
Glavni tab Vlake dobio identitet vlake/kraka, obrubljenu ikonu, čitljiv
natpis i zelenu odabranu ikonu u oba moda. Callback i notif-vlake ostaju
postojeći. Browser fixture sada koristi stvarnu gornju traku i SVG sprite,
provjerava klik/aktivno stanje/kontrast/veličinu dugmeta i novi naziv na
četiri veličine u dvije teme uz ranije provjere projekata/štampe.
Lokalno prolazi 74 JS testna fajla, pet inline blokova i Python sintaksa.
Objava i ishod GitHub APK/browser workflowa provjeravaju se nakon pusha.

Potvrđeno 2026-10-02: workflow `37054954895`, job `110997263293`, uspješan
za commit `e1b485b1a7a5872b1a9ec4b76362e8d656eb880c`. Prvi pregled je
provjeravao boju tokom postojećeg CSS prijelaza (180 ms); fixture sada čeka
konačnu boju. Runtime nije mijenjan tim testnim commitom. Prolaze 74/74 JS
fajla, browser provjere u oba moda/četiri veličine i SHA-256 provjera 29
resursa u APK-u. Sačuvana 33 PNG pregleda i jedan PDF; vizuelno pregledani
DENDRO MAP footer i aktivno/neaktivno dugme Vlake na telefonu u oba moda.

Javni nedraft debug release `v2.1.5` sadrži `app-debug.apk` (21.641.695
bajta), stanje uploaded; tag pokazuje izgrađeni commit. `/releases?per_page=1`
vraća v2.1.5, dostupnu preko Meni → Ažuriraj aplikaciju. Android versionCode
485 i postojeći fiksni debug potpis. SHA-256 APK-a:
`733255e7de3eab7206617f3309dc2f8f87aba70e71bf28b5d1d38da7e14b1faf`.
Stvarni telefoni, produkcijska Supabase baza/RLS i fizička štampa nisu
provjereni; nijedna produkcijska migracija ili instalacija nije izvršena.

## 30. Skrol Menija, navigacija, kamera i lokalni SHP uvoz — 2.1.6 / Android 486

Korisnik traži da se identitet/logo/verzija Menija vidi na kraju skrola,
bolji pregled Vodi me do odjela/lokacije, direktnu kameru bez galerije i
SHP podtab u Dodaj KML fajl. Footer sada ide unutar mdrop-scroll zajedno
sa sekcijama, zaglavlje ostaje iznad skrola; svaki novi otvor počinje od
vrha. Naziv DENDRO MAP, korisnik, logo i verzija ostaju u podnožju.

Navigacija ima zasebno zaglavlje i jedan skrol, jasna dva izbora polaska,
GPS status, upute za odredište i međutačke, pretragu sačuvanih ruta i
odvojene radnje prikaza/dijeljenja/brisanja. Brisanje i dalje traži potvrdu,
nazivi/ID ruta escapirani. Izračun rute, profil i sačuvani podaci ostaju
postojeći. Boje prate oba moda, dugmad imaju najmanje 44 px dodirne visine.

Uslikaj lokaciju direktno klikne capture=environment input nakon GPS
provjere, uz snapshot pozicije prije snimanja. Galerija input uklonjen.
Native WebChromeClient više nema fallback na galeriju pri odbijenoj dozvoli
ili nedostupnoj kameri: završi callback i javi razlog. Kamera i puna
rezolucija preko FileProvider-a ostaju postojeće. Obični file chooser sada
izričito postavlja EXTRA_ALLOW_MULTIPLE za prateće SHP fajlove.

Novi local-layer-import.js i modal imaju KML/SHP podtabove. Već uključene
shapefile/proj4 biblioteke čitaju stvarni SHP/DBF, grupišu prateće fajlove
po nazivu, čitaju PRJ i CPG, konvertuju u WGS84 KML, zadržavaju atribute,
nazive i unutrašnje rupe poligona. SHX/SBN/SBX/QIX se mogu izabrati uz
SHP, parser ne zahtijeva njihove indekse. Više SHP slojeva po odabiru je
podržano; svaki fajl do 32 MB i do 50.000 geometrija po sloju. Bez PRJ-a
GPS koordinate se prepoznaju, koordinate u metrima zahtijevaju izbor MGI
zone 5/6 ili odgovarajući PRJ; ne pretpostavlja se položaj. UTM PRJ koji
sadrži WGS84 pravilno se projektuje, ne proglašava GPS koordinatama.

Sloj se dodaje na Leaflet kartu tek nakon potvrđenog IDB upisa i malog
localStorage registra; time se veliki geometrijski sadržaj ne duplira u
localStorage. I stari inline KML i novi IDB sadržaj se obnavljaju offline.
Upisi su serijalizovani, dupli nazivi dobijaju broj i ne brišu prethodni
sloj. Promjena naloga prekida novi prikaz. Brisanje sadržaja čeka uspješan
upis registra; puna memorija ne može dati lažnu potvrdu. Terenska kopija
materijalizuje sav KML iz IDB-a i obnova ga vraća u IDB prije učitavanja.
Novi modul je u service-worker shellu i obaveznim Android assets.

Lokalno prolazi 75 JS testnih fajlova, svih pet inline skripti i Python
sintaksa browser fixture-a. Petnaest novih regresija koristi stvarni
binary SHP/DBF parser i proj4; persistence/failover testovi koriste lažne
IDB/DOM objekte. Browser provjere uključuju stvarni modal/CSS, Leaflet,
DOMParser i IndexedDB sa lokalnim SHP/DBF, uvoz/obnovu/backup i greške,
uz ranije Meni/projekti/štampa provjere. Workflow ishod, APK i slike se
provjeravaju nakon pusha. Produkcijska baza, GPS/rutiranje i fizička
Android kamera nisu testirani ovim lokalnim fixture-ima.

Dodatni zahtjev u istom radu: Server · vlake projekta preimenovan u
Pošalji na server. Uklonjen izbor projekta i tri zbirne kartice (vlake,
ukupna dužina, broj projektanata). Pregled prati aktivni dostupan projekat;
čitati drugi projekat za PM izvještaj ne mijenja kontekst. Bez aktivnog
projekta nema tihog izbora prvog drugog projekta. Zajednička lista i puni
ispis ostaju dostupni, uz pojedinačnu dužinu i jasno Šalje/Poslao ime.

Šta će biti poslano grupiše sve vlastite stavke po stvarnom odredištu,
uključujući nacrtane/GPS vlake, zone doznake i GPS tačke iz FieldStore-a.
Prikazuje projekat, ime pošiljaoca i vrstu/naziv; preko 40 stavki grupe
upućuje na paginirani Za slanje. I dalje se šalje cijeli vlastiti red iz
svih projekata; prikaz to izričito navodi. Otvaranje učitava hladni GPS
IDB bez mreže; ne prikazuje lažno prazan GPS dnevnik dok nije spreman.

Precizno vrijeme posljednjeg slanja na telefonu čuva se po nalogu tek
nakon potvrđene operacije/serije u _processOfflineQueue, sa odredištem i
imenom. Neuspjeh, promjena naloga, lokalno odbacivanje ili otvaranje panela
ne pišu vrijeme slanja. Djelimični uspjeh bilježi samo potvrđene stavke.
Posljednji prijem aktivnog projekta koristi već potvrđeni datum punog
serverskog preuzimanja, i kad lista nije mijenjana. Novi registar slanja
počinje od ove verzije: staro globalno vrijeme bez vlasnika se ne pripisuje
nalogu/projektu. Browser fixture proširen stvarnim Server pregledom na
četiri veličine u oba moda; JS regresije provjeravaju scope, grupe i
potvrde slanja kroz cijeli lažni serverski tok, uz prethodnih 75 fajlova.

Potvrđeno 2026-10-02: workflow `37059980041`, job `111013969207`,
uspješan za commit `1cf07611375ac39ff95f257fbc90076d850342e8`. Prolazi
75/75 JS testnih fajlova, oba browser fixture-a i SHA-256 provjera 30
APK web resursa, uključujući novi lokalni SHP modul. Sačuvano 75 PNG
pregleda i jedan PDF; pregledani skrol Menija/identitet, dnevna/tamna
navigacija, SHP podtab, novi Server i konvertovani poligon na Leaflet karti.
Server zadržava svoj položaj skrola između otvaranja, zato neke slike
prikazuju listu na dnu; prva slika pokazuje projekat i grupe za slanje.

Javni nedraft debug release `v2.1.6` sadrži `app-debug.apk` (21.663.663
bajta), uploaded. Tag pokazuje tačno izgrađeni commit, a updaterov
`/releases?per_page=1` vraća v2.1.6. Android versionCode 486; postojeći
fiksni debug potpis. SHA-256 APK-a:
`2a2874e481d2f078a5d5b9b778e5a4f9294d2b6e825381984f8672664acfde1e`.
Ažuriranje: Meni → Ažuriraj aplikaciju. Browser je provjerio capture input
i GPS snapshot; stvarni Android senzor/kamera i dozvole na fizičkom
telefonu nisu pokrenuti. Supabase/RLS i živo GPS/rutiranje nisu provjereni
ovim fixture-ima; produkcijska baza i uređaji nisu mijenjani.

## 31. Server, uređivanje KML-a i povratak na roditelja — 2.1.7

Web/SW/Android 2.1.7, versionCode 487. Preuzimanje vlaka i
članova/zona doznake ide do prazne stranice, s pomakom po stvarnom broju
redova. Kraća stranica više ne znači kraj ako je serverski max-rows manji
od traženog. Dostizanje sigurnosnog limita vraća grešku, ne nepotpun uspjeh.
Filtrirani prazan odgovor jednog projekta ne briše članstvo drugih.
Brisanje vlake traži vraćeni ciljani ID; nula redova ostaje u redu bez
lažnog vremena slanja. Ako je prethodno brisanje prošlo, ali je odgovor
izgubljen, ponavljanje ostaje nepotvrđeno i zahtijeva provjeru.

Doznaka provjerava nalog i generaciju odgovora prije zamjene prikaza/keša,
uključujući dodatni dohvat imena projektanata. Red drugog naloga ne
primjenjuje se na zone. Neuspješan trajni upis slojeva vraća stari keš.
Dugme Preuzmi doznaku potvrđuje listu dostupnih odjela i slojeve trenutno
otvorenog odjela; ako odjel nije otvoren, jasno traži otvaranje odjela za
slojeve. Ne tvrdi da je preuzelo sve zone svih odjela. Vrijeme potvrđenog
prijema doznake odvojeno je od prijema vlaka i vezano za nalog.

Zajednički KML/SHP editor: naziv i oznaka fajla, pregled linije, paleta,
prilagođena boja, debljina, vrsta linije, vidljivost, ispuna i šrafure.
Popup ima odvojene Naziv i opis / Stil fajla / Približi te atribute.
Naziv/opis lokalnog objekta mijenjaju odgovarajući Placemark u IDB KML-u:
novi sadržaj se potvrđuje prije zamjene registra i uklanjanja starog.
Geometrija i ostali atributi se čuvaju. Za server fajl tekst izričito kaže
da je izmjena naziva/opisa samo u tom prikazu; lični stil ostaje lokalno.
Stil lokalnog fajla se sada čuva i kroz popup, a povratak sa isprekidane
na punu liniju zaista uklanja Leaflet dashArray. Sačuvaj stil ne briše
registar još neučitanog lokalnog fajla. Nazivi tooltips su HTML-escaped.

Uklonjeni Nastavi krak i stari picker; postoje Lijevi/Desni krak i izbor
postojeće vlake. Vrati na [naziv roditelja] odmah čuva dijete, bira
roditelja i pauzira GPS. Sada otvara i historijski interval pauze, da
native bafer ne ubaci hodanje nazad po kasnijem pražnjenju. Nastavi navodi
aktivnu vlaku; završetak briše zaostale oznake povratka. Veći prikaz:
nadmorska visina 14 px, koordinate 12 px, uz prelamanje na uskom ekranu.

Regresije koriste stvarne funkcije uz lažan server/GPS: ograničenje stranice
na 40, greška kasnije stranice, promjena naloga tokom imena, nepotvrđeno
brisanje, dijete-roditelj-djed, pauza i očuvanje tačaka/registra. Browser
fixture proširen pravim Leaflet popupom, stilom i lokalnim DOMParser/IDB
čuvanjem naziva/opisa, obnovom i provjerom osam veličina/tema. Ishod CI-ja,
APK i vizuelni pregled bit će dopisani nakon izgradnje. Produkcijski
Supabase/RLS i fizički Android GPS nisu testirani ovim provjerama.

Potvrđeno 2026-10-03: finalni commit 2.1.7
`703d3d6acbf331abe5f3f6f88e6bd4adf401b1fa`, workflow `37100908878`, job
`111140090410` uspješan. 76 JS fajlova, browser provjere i provjera 31 APK
resursa prolaze. U toku provjere ispravljeno ponovno postavljanje popup
HTML-a, preklapanje s koordinatama i animacija pri uvozu; web/SW/Android
verzije su provjerene na 2.1.7. Sačuvano 83 PNG + PDF artefakta; vizuelno
pregledani ključni KML/Server prikazi i PDF.
Release v2.1.7 sadrži uploaded app-debug.apk, 21.663.365 bajta, code 487;
tag pokazuje finalni commit, updater vidi novu verziju. SHA-256:
`fdce2c3f2457731bf3769c7fcaa99c8c2caf5432804c81ce584e3ff7615b9ec3`.
Nakon objave započet je korisnikov odvojeni pregled u tri uzastopna dijela:
`docs/ANALIZA_KODA_2026-10-03.md`. Novi nalazi u tom izvještaju nisu
samoinicijativno popravljani.

## 32. Završen pregled koda u tri dijela — 2026-10-03

`docs/ANALIZA_KODA_2026-10-03.md` sadrži redom završene dijelove: lokalni
podaci/GPS, server/saradnja, karte/UI/ažuriranja. Za svaki su navedeni
pregledani tokovi, dobro ponašanje, problemi, preporuke i granice provjere.
`node docs/audit/reprodukcije.cjs` potvrđuje 9 nalaza nad stvarnim izdvojenim
funkcijama uz lažne zavisnosti. Argument 1, 2 ili 3 bira pojedinačni dio.
Skripta očekuje postojeće kvarove; nije dokaz da su popravljeni.

P1: A1 završetak vlake ignorira false potvrdu upisa i briše snapshot;
A2 nastavak od sredine odmah odsijeca ostatak; B1 23505 nekritički potvrđuje
ID zone; C1 drugi poziv `_localKmlSaveAll()` iz settera briše neučitan sloj;
C4 IDB kvar pune fotografije ostaje skriven iza poruke dodavanja.
P2: B2 početne liste projekata/članstva nisu paginirane (paginacija vlaka
ne pokriva te upite); B3 max-rows manji od 1000 može zaobići detekciju
postojeće GPS tačke; C2 cache.put odbijanje nije uhvaćeno; C3 stari rezultat
rute poništi novi izbor nakon otkazivanja. B1/B3 uticaj u produkciji zavisi
i od constraint-a baze. Kasnije SQL migracije zatvaraju raniji samoupis
članstva; stara politika nije prijavljena kao aktuelan kvar.

Funkcionalni kod nije mijenjan tokom ovog pregleda, prema uputi AGENTS.md.
Verzija ostaje 2.1.7 / 487. Produkcijski Supabase i fizički Android uređaj
nisu korišteni za reprodukcije. Izvještaj nije revizija svake linije niti
zasebnih Flutter/Python proizvoda u repozitoriju.


## 33. Jednostavniji Server, kolegine vlake i grupni prikaz — 2.1.8

Web/SW/Android 2.1.8, versionCode 488. Korisnik je izričito zadao ova tri
funkcionalna zadatka nakon analize; nalazi audita nisu paketno popravljani.

Server ima Primljeno / Poslano / Za slanje. Potvrđene stavke nose projekat,
projektanta, sadržaj, dužinu/broj GPS tačaka i vrijeme. Evidencija je odvojena
po nalogu i smjeru, do 500 malih zapisa, bez kopiranja geometrije. Prethodne
server kopije vlaka ostaju pregledne i bez nove evidencije; nepoznato vrijeme
je tako označeno. Detalji ranijih slanja ne izmišljaju se. Zona/GPS prijem
se bilježi nakon potvrde lokalnog keša, iz sirovog serverskog odgovora prije
miješanja neposlanih zona. Prikaz doznake grupiše GPS po projektantu. Ručni
režim slanja, puni ispis vlaka aktivnog projekta i izvoz kopije ostaju.
Detalji reda/greške i alati kopije su sklopivi da ne dupliraju glavni pregled.

Kolegine vlake u običnom i admin/vodećem prikazu dobijaju isti 24px dodirni
sloj i fallback najbliže vidljive linije kao vlastite. Popup prikazuje
projekat/projektanta, dužinu i bafer/približavanje, bez editovanja/brisanja
tuđeg rada. Nazivi se escapiraju. Bafer može biti za jednu odabranu vlaku;
zajednički prikaz uključuje kolege aktivnog projekta i izostavlja adminovu
duplu kopiju vlastitih vlaka. Hit-sloj prati geometriju i uklanjanje linije.

Tragovi dobijaju Prikaži sve / Sakrij sve i zasebne kontrole fotografija
(vlastite i podijeljene), tragova, tačaka, mjerenja i tekstualnih oznaka.
Postavke fotografija/tačaka/mjerenja/oznaka pamte se po korisniku i primjenjuju
na nove/obnovljene markere. Tragovi koriste postojeći visible po zapisu,
uključujući hit-sloj i oznaku dužine. Aktivno GPS snimanje i aktivna izmjera
nisu sakriveni; podaci se ne brišu i ove radnje ne šalju ništa na server.
Skrivena sačuvana mjerenja isključena su i iz fallback klika.

Lokalno 76/76 JS fajlova i pet inline skripti prolaze. Proširene regresije
pokrivaju potvrde, naloge, projekte, doznaku, escaping i granicu evidencije.
Nova browser provjera server-map-218.py koristi pravi Leaflet/Turf za obični
i admin klik, fallback, bafer i grupnu vidljivost. CI/build/release ishod
slijedi nakon izgradnje. Nema produkcijskih upisa niti fizičke instalacije.

2.1.8 potvrđeno objavljena: workflow 37133223351, commit/tag
f219ea71186018ff4b7aecec4c2bca80ce73c70a, app-debug.apk 21.677.793 B,
SHA256 a241f1c03822f2275e13e12b1169158ec1d454e8492b08b11009fa972657c2d9.
CI browseri i izgradnja prošli. Pregledane slike uskog Dnevnog moda, Servera
i kolegine vlake s baferom. Dvije prethodne CI korekcije bile su samo fixture
(divIcon bez nedostajućeg PNG-a; test ne pita Leaflet za uklonjeni undefined sloj).

## 34. Preglednik Oznake i grupisani Server — 2.1.9

Web/SW/Android 2.1.9, versionCode 489. Korisnik je zadao preglednik sa
pojedinačnim i grupnim kontrolama, sortiranje, uklanjanje obavijesti o
učitanoj tematskoj karti i sažimanje Servera na posljednja tri projekta.

Oznake: Sve / Učitani fajlovi / Fotografije / Tragovi / Server fajlovi,
pretraga, sortiranje po odjelu, datumu, udaljenosti od SREDINE prikaza karte
(ne GPS položaja) ili nazivu. Grupe po odjelu razlikuju gospodarske jedinice.
Grupne radnje uključuju sve filtrirane rezultate, i nakon prve stranice.
Prikaz/sakrivanje, približavanje, uređivanje, izvoz lokalnog KML-a/traga,
fotografija i postojeće dijeljenje, potvrda pojedinačnog brisanja.
Server placeholder se preuzima samo izričitom radnjom. Podijeljena fotografija
se ovdje uklanja samo s telefona. Opisi fotografija/napomene su lokalni po
nalogu. Fotografije iz kamere pamte odjel/projekat u trenutku otvaranja kamere;
stare bez odjela/datuma ostaju označene kao nepoznate. Vidljivost pojedinačnih
fotografija radi i nakon grupnog skrivanja, odvojena po nalogu.

Usko popravljeni nalaz C1 audita: setter-i više ne pruniraju neučitane
lokalne fajlove. Brisanje prvo potvrđuje upis registra i uklanja samo odabrani
fajl, ne ostale neučitane. Greška upisa registra zadržava sloj/podatke.
Stabilan identitet i ponovna provjera naloga nakon potvrde brisanja.
Historijska reprodukcija docs/audit/reprodukcije.cjs opisuje 2.1.7 i nije
regresijski test za ispravljeni C1; novi test je tests/js/map-library.test.js.

Server: Primljeno/Poslano grupišu se po projektu ili datumu razmjene
(Europe/Sarajevo). Ista posljednja tri projekta po najnovijoj potvrđenoj
razmjeni u oba taba; grupe početno zatvorene, svi evidentirani redovi unutar
grupe dostupni proširenjem. Evidencija i dalje ima granicu 500 po smjeru.
Ne brišu se stariji projekti ni podaci. Klik vlake/zone/GPS pojasa koristi
stabilan identitet potvrde i lokalni keš geometrije, prikaže privremeno
istaknuti sloj na karti. Ne mijenja aktivni projekat niti prekida snimanje.
Zatvaranje pregleda/odjava uklanja taj sloj. Nedostajući keš daje jasnu poruku,
bez pogađanja druge vlake istog imena. GPS pojasevi odvojeni na prekidima >5min.
Lokalni Tragovi se i dalje ne šalju serveru; ovo ne mijenja protokol slanja.
Ukinut uspješni GPKG toast (uključujući restore), greške učitavanja ostaju.

Lokalno 77/77 JS test fajlova i pet inline skripti prošli. Nove regresije:
filtrirane grupne radnje preko 40 stavki, foto izolacija, C1 i quota,
brisanje uz promjenu naloga, tri projekta/dani/timezone/identiteti.
Browser map-library-219.py provjerava pravi Leaflet, filter/grupni prikaz,
KML uređivanje, Server proširenje i klik te osam veličina/tema.
CI/APK ishod slijedi nakon izgradnje. Produkcijski Supabase i stvarni Android
uređaj nisu korišteni za ove provjere.

2.1.9 potvrđeno objavljena: workflow **37151708190** (svi koraci uspješni),
release/tag v2.1.9 na **d535e0fc86917d73f074e7c32c794a6a7a2d10f3**.
app-debug.apk **21.694.789 B**, SHA256
**0eea77d11dfd032ac728ea45beae287373ab55e000b2b0912c657acd2f862cd6**.
Javni APK: https://github.com/pogonboskrupa/US-SUME/releases/download/v2.1.9/app-debug.apk
CI prošli 77 JS test fajlova, četiri browser skripte, build i SHA256 provjera
svih **34** web assets. UI artefakt **11284028702**, 108 PNG i print PDF.
Pregledani library-day-320-568, library-dark-568-320 i server-grouped-day-390.
Dva prethodna pokušaja stala su na starim browser očekivanjima: sadržaj
zatvorenih grupa je skriven; već otvorena grupa se pri sljedećoj temi ne
smije klikom zatvoriti prije provjere. Ispravke su samo u browser testu;
isti funkcionalni kod je prošao konačnu provjeru i izgradnju.
Nije testirana fizička instalacija na Androidu niti produkcijski Supabase.

## 35. Boje i zajednički pregled aktivnog projekta, Meni i upute — 2.2.0

Web/SW/Android 2.2.0, versionCode 490 (prelaz poslije 2.1.9).
Korisnik traži da postavke Boje vlaka za aktivni projekat odmah važe i za
vlastite i kolegine glavne/krake, zajednički numerički spisak s projektantom,
novi dizajn Snimi vlaku, ulaz Instalirane karte u Meniju i ažurirane upute.

Postavke su lokalne po korisniku/projektu (`tvlake_projekt_boje_v2_...`), sa
čitanjem legacy stilova kao osnovom. Promjena odmah stilizira već učitane
polilinije; primjenjuje se i nakon obnove/aktivacije/preuzimanja/realtime-a.
Izvorna boja/koordinate vlake i kolegini serverski podaci se ne prepisuju.
Glavne/kraci imaju odvojene boje; debljina/dash važe i za kolege. Bez aktivnog
projekta kontrole su onemogućene; greška memorije ne daje lažan uspjeh.
Zajednički spisak u Projekat tabu spaja serverski lokalni model i živi prikaz
kolega, razlikuje autore kod istog naziva, izostavlja adminovu duplu vlastitu
kopiju i sortira T1.2/T1.10/T2/T10 numerički. Svaki red ima projektanta,
dužinu i klik na kartu; duži spisak ima Prikaži još. Kolegina lista također
numerički sortira i ispisuje escapiranog projektanta na svakom redu.

Snimi vlaku je primarno dugme sa ikonom, opisom GPS snimanje i oznakom vlake,
uz isti postojeći tok biranja/snimanja. Instalirane karte otvaraju postojeći
Instalirane podtab prozora slojeva, bez dupliranja mehanizma karata.
Upute ažuriraju DENDRO MAP, pripremu terena, Boje i spisak, novi preglednik,
KML/SHP, ručno slanje/prijem, GPS doznaku, kameru, Dnevni mod i print opise.
Uklonjene pogrešne tvrdnje o automatskom slanju ručnih vlaka/GPS doznake.

Lokalno prošlo 78 JS test fajlova i pet inline skripti. Nova browser skripta
provjerava stvarni Leaflet stil vlastitih/koleginih linija, realtime, lokalne
preferencije na reloadu bez mreže, numeraciju, Snimi dugme, instalirani tab i
upute kroz 8 kombinacija veličine/teme. Fixture reload je lokalni test preferencija,
ne dokaz kompletnog startup-a APK-a. CI/APK ishod slijedi.

Nakon objave korisnik traži analizu brzine za Redmi Note 13 Pro (online/offline).
`tests/browser/performance-redmi.py` se izvršava POSLIJE objave APK-a i bilježi
realni Leaflet Canvas, aktualne boje/listu i _saveLocalVlake, 100/500 vlaka i
10k/50k/100k tačaka, 3 ponavljanja, CPU 1x/4x, navigator online/offline.
CPU 4x nije emulacija Redmi procesora. Ne mjeri GPS, backend, pločice, pun
startup, sve labele niti native most. Zaseban JSON artefakt služi kao dokaz,
a analiza mora navesti ove granice i ne izmišljati vremena stvarnog telefona.

### Završni kontrast i verzija 2.2.1

2.2.0 objavljena i sintetičko mjerenje završeno na workflow 37155897278.
Vizuelni pregled otkrio svijetle inline natpise Boje vlaka u Dnevnom modu.
Uska CSS ispravka koristi field-ink i čitljiv odabrani stil. Web/SW/Android
2.2.1, code 491. Browser dodaje provjeru istog kontrasta naziva i konteksta;
fixture i mjerenje čitaju stvarnu verziju iz izvora. Funkcionalni tokovi boja
i slanja nisu mijenjani ovom završnom ispravkom. Konačni CI ishod slijedi.

2.2.1 potvrđeno objavljena: workflow **37156338599**, svi koraci uspješni,
release/tag na **5e8163dee7aa39382aca3b78ae7e82185019c758**. APK
**21.707.777 B**, SHA256
**c044c74abc052e60632ee61e7f068089227f5bc40a28d0ad8d1b5e9b6deaecf8**.
https://github.com/pogonboskrupa/US-SUME/releases/download/v2.2.1/app-debug.apk
78 JS fajlova, pet browser skripti, 34 web assets SHA256 i APK build prošli.
UI artefakt **11285907703**; pregledan project-colors-day-320-568 i potvrđen
kontrast, prethodno pregledani spisak i horizontalne upute 2.2.0.
Prvi 2.2.0 CI zastao na zaostaloj vlaci T1 iz reda slanja osnovnog fixture-a;
izolacija testnog reda dala uspješan 37155897278. Funkcionalni kod boja ostao isti.

Analiza nakon objave: artefakt **11285492647**, svih 36 uzoraka u
`docs/performance/redmi-note-13-pro-2.2.1.json`, tumačenje u
`docs/ANALIZA_BRZINE_REDMI_NOTE_13_PRO_2026-10-03.md`. CPU 4x: učitavanje
10k tačaka 54.9/59.4ms online/offline, 50k 220.4/226.2ms, 100k 353.4/360.9ms.
Bez stvarne mreže/GPS-a/pločica/punog startup-a/native mosta/telefona. CPU4x
je usporavanje desktopa, nije emulacija Redmi procesora.
Važan potvrđen nalaz: generisani JSON 100k tačaka ~5.4MB, prikaz uspijeva,
_saveLocalVlake ne uspijeva ni u jednom ponavljanju (quota). 10k i 50k prolaze.
To nije univerzalni limit broja tačaka niti dokaz server greške; dokumentovan
prioritet preseljenja velikog lokalnog keša u IndexedDB, bez neodobrene migracije.
Fizički Android i produkcijski Supabase nisu korišteni.


## 36. Karte i nacrtani poligon odjela — 2.2.3

Korisnik traži raniju veličinu Snimi vlaku, unapređenje Instaliranih i
Omiljenih karata, crtanje poligona odjela u projektu i checkbox-e za
nagib strogo preko 30% i ekspoziciju ograničene na taj poligon u dnu taba.
Web/SW/Android 2.2.2, code 492. Odobrenje novih APK izdanja ostaje iz sesije.

Snimi: vraćen raniji markup/dimenzije i uklonjena proširena primarna kartica.
Karte: zajednički naslov/prozračan prikaz oba moda, Lokalni fajlovi i Slojevi
terena odvojeni u Instaliranim. Puni nazivi, aktivna karta, spremljena ali
neučitana karta i ponovni pokušaj kroz postojeći sqlmapRetryOne; nema novog
mehanizma uvoza. Broj keširanih pločica ne predstavlja kompletnu pokrivenost.
Omiljene: pristupačno dugme aktivacije i zasebno Uredi, aktivnost/dostupnost,
lokalni fajl nasuprot online podlozi, puni nazivi i responsive kartice.
Akcije preko stabilnih naziva/identiteta, ne inline imena u JavaScriptu.
Topo + Nagib se može dodati u favorite kao postojeći složeni prikaz.
Brisanje zajedničkog DEM keša traži potvrdu s opisom četiri pogođena sloja.

Novi static/js/project-terrain.js: poligon po nalogu/projektu u lokalnom
ključu tvlake_project_polygon_v1_<uid>_<pid>. NE šalje geometriju na server,
ne dodaje produkcijsku kolonu/migraciju. UI i upute jasno kažu da je lokalno.
Tapkanje karte, Vrati tačku, Sačuvaj, Odustani. 3–500 tačaka, koordinatne
provjere, odbijanje samopresjeka i degenerisanog poligona. Stara granica se
zamijeni tek nakon uspješnog upisa; quota ostavlja nacrt i stari zapis.
Promjena projekta/naloga, odjava i drugi alat otkazuju nacrt. Aktivno
snimanje/alat blokira ulaz. Vraća prethodno stanje doubleClickZoom.
Privremeno isključuje feature hit-test dok mapa prima tačke poligona.
Prikaz/sakrivanje granice, površina/tačke, Na karti, potvrđeno uklanjanje.
Nacrtana granica zamjenjuje automatski highlight; brisanje vraća postojeći.
Površina projekta i dalje poštuje ručni unos, zatim nacrtani poligon/KML.

Checkbox-i na kraju Projekat taba: Nagib preko 30%, Ekspozicija. Posebni
Canvas GridLayer slojevi u pane 260/261, ispod vlaka, sa stvarnim polygon
clip-om. Procenti iz elevacijskih gradijenata i geografske veličine piksela;
percent <=30 potpuno transparentan. Ekspozicija je smjer N/E/S/W niz padinu.
DEM je postojeći Terrarium/cache; dijeljeni decoded cache do 24 pločice,
prikaz do native zoom 14 kao postojeći teren. Granica nije izmijenjena
uključivanjem slojeva. Nedostajuća DEM pločica daje poruku o nepotpunom
terenu, ne lažno "ravno". Lokalna raster podloga sama ne sadrži DEM.
Preuzimanje terena nudi nacrtani poligon kao prvi obuhvat i paket sa
z12–14 za nagib/ekspoziciju. Brisanje/dopuna DEM-a invalidira novi cache.

Poligon ulazi u terensku sigurnosnu kopiju kao optional projectPolygon;
stare kopije su kompatibilne. Obnova validira, ne prepisuje noviji postojeći
poligon i uključena je u postojeći localStorage stage/rollback. Granica
se koristi i za provjeru pokrivenosti offline podloge aktivnog projekta.
Upute opisuju crtanje, lokalni status, prag >30% i preuzimanje DEM-a.
SW shell i Android required manifest uključuju oba nova modula.

Lokalno: 81 JS test fajl; novi testovi geometrije/procenata/smjerova,
kataloga i backup roundtrip-a, stare kopije i quota rollback-a. Inline i
novi browser fixture JS prošli syntax-check. Browser project-terrain-222.py
koristi pravi Leaflet, Terrarium PNG decode/Cache Storage, strogu masku
nagiba i polygon clip, tap/undo/cancel/quota, odvajanje projekta/naloga,
reload bez mreže i 24 prikaza kartica/projekta u obje teme/četiri veličine.
CI izvršava šest browser skripti prije APK-a; ishod slijedi. Stvarni Android
uređaj i produkcijski Supabase nisu korišteni za ove provjere.

Projektni nagib/ekspozicija isključuju odgovarajući globalni DEM sloj da
izvan poligona ne ostane globalno bojenje. Uključivanje općeg nagiba/ekspozicije
u Instaliranim ili Topo+Nagib isključuje odgovarajući projektni checkbox.
UI opisuje ovu zamjenu; geometrija i vlake ostaju iste.

2.2.2 je objavljena kroz CI 37158931360 (svi koraci uspješni), APK 21.740.571 B.
Prvi testni pokušaj 37158716053 imao je fixture activeTool=null umjesto
produkcijskog select; ispravljen fixture, bez izmjene funkcije crtanja.
Pregled PNG artefakta otkrio je CSS skupljanje redova omiljenih karata u
maloj visini ekrana. Završno izdanje 2.2.3/code 493 dodaje max-content
redove u skrolajućem gridu i uvijek vidljivo Uredi, bez naslijeđenog left.
Browser dodatno provjerava minimalnu visinu i cijeli sadržaj kartica te
vidljivost Uredi u obje teme/sve četiri veličine.

Završni CI 37159324242, commit a90d97cc3e17b6ebe52608b7d9d0a0a3a490eb7b:
81 lokalni JS test fajl + svih šest Chromium/Leaflet browser provjera
uspješni. PNG artefakt 11287002109 (24 nova prikaza) pregledan; omiljene
kartice se više ne skupljaju/odsijecaju i Uredi je vidljiv bez hover-a.
APK build i provjera sadržaja/SHA-256 web assets uspješni; GitHub v2.2.3
objavljen, app-debug.apk uploaded, 21.740.659 B (~20,73 MiB),
SHA-256 8b78107991485dcd7d586d6152dc5c7f94f22e8dd03eb51bb84fa8731b553a88.
Native updater čita releases?per_page=1 i vidi v2.2.3 kao prvo izdanje.
Nije izvršena fizička instalacija na telefon ni izmjena Supabase-a.


## 37. Referentna karta, T oznake i smjer vlaka — 2.2.4

Korisnik traži prepoznavanje vlaka na papirnoj topo karti samo uz T + broj,
brzo prikaži/sakrij; potvrdio crne/plave linije. Dodao popravku crtica/tačaka
i 1 strelicu do 300 m / 2 preko 300 m, dvosmjerno s razdvajanjem na polovini
(potvrda „da“). Web/SW/Android 2.2.4, code 494. Postojeće odobrenje APK izdanja.

static/js/reference-vlake.js + Android ReferenceOcrBridge.java, bundled
com.google.mlkit:text-recognition:16.0.1: OCR na uređaju bez slanja slike/
preuzimanja modela. Četiri rotacije slike, bbox vraćen u izvorne piksele.
Obavezna stroga oznaka T + pozitivan cijeli broj (bez nagađanja 7/I kao T/1);
spajanje T i broja samo blizu/u istom OCR redu. Prvo čitanje teksta, zatim
uklanjanje textbox-ova iz maske linija, filtriranje/join postojećeg skeleta.
Najbliži put uz oznaku; bez oznake i zatvorene konture nisu prijedlog.
Nejasne veze nisu automatski odabrane. Spisak izbora i Na karti; uvoz čuva
izvorni T broj, odbija postojeći broj u istom projektu i prvo potvrđuje lokalni
upis; quota vraća promjene u memoriji i zadržava rezultat, bez slanja.
Stari async OCR odgovor ne vrijedi za drugu sliku/projekat/nalog/poravnanje.
Ručna potvrda: upis T broja, dodir stvarnog natpisa, ponovno detektovanje.
Web bez native mosta nudi taj put, nema fallback uvoz neoznačenih linija.
Afino poravnanje se koristi i za detekciju/masku/pipetu.

Brzo dugme na karti skriva refKarte pane (aktivna + serverske učitane slike),
ne briše poravnanje/providnost; ponovno fitovanje poštuje skriveno stanje.
Novi učitani fajl uklanja stari rezultat/oznaku, stale onload ne zamijeni novi
fajl, blob URL se oslobađa. Ref otkrivene linije u posebnom neinteraktivnom
pane-u 625; oznake/kalibracija bez Leaflet canvas-a koji bi gutao klikove.

static/js/vlaka-direction.js: lokalna postavka prikaza po korisniku/projektu/
autoru+nazivu vlake, bez Supabase kolona/migracija. Auto poredi krajeve s
najbližim segmentom učitanih puteva (prostorni grid; do 250 m), ili lagerom/
krakom „na putu“. Bez pouzdanog puta nema izmišljenog auto smjera. Ručno
početak/kraj/dvosmjerno/sakrij, i za vlake kolega. Dvosmjerno: kratka vlaka
jedna ↔ na sredini, duža dvije spoljne strelice + ↔ mjesto razdvajanja.
Neinteraktivni SVG markeri uz liniju, obnova zoom/geometrija/sakrivanje,
lokalni prikaz smjera nije nova promjena geometrije ni serverski atribut.
Stil: crtice butt kapice (vidljiv ravni potez/gusta praznina), tačke 0.01px
round (stvarni krug), debljina/zoom prilagođeni CSS px.

Lokalno prošla 83 JS test fajla i svih 5 inline JS sintaksi. GitHub CI run
37184286191, commit 2dc3f6eb78868353a4a31626aafa124defa7cd8b: svi JS testovi,
svih 7 browser skripti, Android build/provjera asset SHA-256 i stvarni
Android OCR na emulatoru bez aktivne mreže prošli. Browser OCR je fixture;
instrumentacijski test odvojeno koristi stvarni ML Kit i crne T12/plave T3
natpise, provjerava broj i vraćene koordinate. 16 referentnih PNG prikaza,
pregledani dnevni panel 320x568 i brzo dugme 390x800. v2.2.4 objavljena
2026-10-04; APK 65.120.508 B,
SHA-256 52aac8e8d761966e7bd7dafd9499ec0e2c6043fdb5ceaa2645b05d5ea6c65c38.
Raniji CI pokušaji popravili su fixture pane, povrat funkcije iz evaluate,
otvoreni fixture panel i provjeru OCR riječi po redu; nisu preskočeni testovi.
Fizička korisnička karta/telefon i produkcijski Supabase nisu korišteni.
Nečitljiv rukopis i oznaka uz dvije linije traže provjeru.

## 38. Ručna oznaka referentne karte — završna 2.2.5

Konačna provjera našla presretanje dodira postojećim klikabilnim vlakama/
markerima pri ručnom označavanju natpisa T. Privremena CSS klasa
reference-marking isključuje hit-test Leaflet canvas/markera/interaktivnih
putanja samo dok se bira natpis. Završetak, Escape, skrivanje, nova slika i
poništavanje vraćaju normalne dodire. Browser test sada koristi stvarni
touchscreen.tap preko markera (bez map.fire), provjerava da marker ne dobije
klik tokom označavanja, a dobije ga poslije; provjerava i Escape.
Web/SW/Android 2.2.5, code 495. JS provjere referentne karte, smjerova i
projekata te Python sintaksa prošle. GitHub CI 37184791115 na
85c5c7a9c99684932a4358645c4ad6562eee5dd2 uspješan: svih 83 JS test fajla,
svih 7 browser skripti (uključujući stvarni dodir), 38 web asset SHA-256
provjera, Android build i stvarni instrumentacijski offline OCR. Sintetička
analiza brzine online/offline također prošla; nije mjerenje fizičkog Redmi
telefona. v2.2.5 objavljena 2026-10-04, latest /releases?per_page=1 vraća
v2.2.5 sa app-debug.apk (65.120.728 B). Artefakt preuzet i APK SHA-256 lokalno
izračunat te upoređen s GitHub Release digestom:
8c09fe04123bc39a2e432ece17c400b581caadfec3670281c35cac54c8dab99a.
https://github.com/pogonboskrupa/US-SUME/releases/tag/v2.2.5
Ažuriranje: Meni → Ažuriraj aplikaciju; postojeći isti debug potpis.
2.2.4 se ne prepisuje drugim APK-om istog broja verzije. Fizički telefon i
stvarna korisnička papirna karta nisu testirani; smjer je lokalna postavka
prikaza na telefonu, bez promjene serverske šeme.

Napomena za nastavak: lokalni workspace je djelimična rekonstrukcija, sa
nedostajućim ikonama/GRANICE.kml/putevima i nekim starijim kopijama biblioteka,
manifest.json i drugih helpera. Lokalni assets.py verify staje već na
icon-192.png; puni CI checkout je provjerio 38 fajlova. Ne zamjenjivati remote
baseline tim lokalnim kopijama. Direktna provjera preuzetog APK-a potvrdila
je prisustvo svih 35 eksplicitnih/lokalno pronađenih asset putanja, podudaranje
18 raspoloživih lokalnih izvora i novu verziju/klasu reference-marking;
autoritet za puni sadržaj ostaje CI SHA provjera i jednaki release/APK digest.


## 39. Projektantska razdjelnica, strelice projekta i outline — 2.2.6

Korisnik je pojasnio da „polovica“ nije 50% dužine: projektant odlučuje gdje
je bliži jedan ili drugi izlaz na put, samo ako vlaka ima dva izlaza. Ova
uputa zamjenjuje ranije tumačenje iz 37/38. Dodan izbor dodirom na vlaku i
GPS dugme „Dva izlaza na put · Razdjelnica ovdje“ na zadnjoj prihvaćenoj
tački; pauza onemogućava označavanje „ovdje“. Početak/kraj/Auto i dalje nude
jednosmjerni prikaz. Nema automatskog dvosmjera niti matematičke sredine.
Stari string both bez tačke više ne crta strelice dok projektant ne odabere
razdjelnicu. Korisnik izborom dva izlaza potvrđuje odgovarajući slučaj;
program ne nagađa drugi izlaz iz topografske blizine puta.

Smjer zapis ostaje u lokalnom korisnik/projekat/autor+naziv ključu v1,
ali both zapis sada ima split {la,lo,atM}. Tačka se projicira na geometriju,
atM razlikuje ponovni prolaz kroz isto mjesto, nastavak vlake ne pomjera
razdjelnicu na novu polovinu. Izbor s karte mora biti unutar 40 m i između
krajeva. Tokom snimanja dozvoljen kraj čeka nastavak prema drugom putu.
Map hit-test se privremeno isključuje klasom direction-picking; završetak,
Escape, drugi tab/projekat/nalog i uklanjanje vlake vraćaju normalne dodire.
Upis prvo potvrđuje localStorage, quota zadržava stari položaj/postavke.

Na samom dnu Projekta poslije poligona: Strelice prema putu, checkbox za
prikaži/sakrij, debljina 1–6 px, veličina 18–48 px, boja ili boja vlake/kraka,
broj Auto (1/2 preko 300 m) ili 1–8, izbor prikaza oznake razdjelnice,
lista vlastitih/koleginih vlaka za uređivanje i reset samo izgleda. Kod dva
izlaza najmanje po jedna strelica na svakoj strani; oznaka razdjelnice se ne
broji u količinu strelica. Postavke izgleda odvojene po nalogu/projektu u
ključu tvlake_direction_style_v1. Prikaz uključuje kolegine linije. Sve ove
postavke su lokalne; nema nove Supabase šeme/upisa i promjene geometrije.

Dodatni korisnički zahtjev: Boje vlaka → Dodaj outline. Opt-in checkbox,
projektno polje outline, bijela/crna prema relativnoj luminanciji glavne
boje. Ukupna debljina 1.14× glavne (14% proširenja, tj. 7% sa svake strane).
static/js/vlaka-outline.js dodaje drugi Canvas stroke prije glavnog s istim
dash/dot uzorkom/kapicama; SVG fallback zaseban neinteraktivni path prati
geometriju/stil i uklanja se s linijom. Ne dodaje zaseban Leaflet/GIS sloj.
Vlastite/kolegine vlake i kraci odmah dobijaju isti stil; nove linije također.
PWA i APK manifest uključuju novi modul. Upute dopunjene.

Web/SW/Android 2.2.6, code 496. Lokalno prošla 84 JS test fajla, 5 inline JS
sintaksi i module/Python sintakse. Pure testovi provjeravaju 20%/80%
razdjelnicu, stabilnost pri produžavanju/povratku, bez legacy sredine,
kontrast obruba i <15% širine. Novi browser test project-arrows-226.py
provjerava stvarni dodir preko markera, stale/cancel/quota, GPS nastavak,
projektne/naložne postavke, vlastite/kolegine strelice, stvarni SVG/Canvas
outline i 16 PNG prikaza. GitHub CI 37186507598 na
0f0533900eb78223327c19156d213306c099fafd uspješan: svih 84 JS test fajla,
8 browser skripti, build i svih 39 web asset SHA-256 provjera, Android offline
OCR instrumentacijski test te sintetička analiza brzine online/offline.
Pregledani PNG: projektne strelice day 320x568 i dark 390x800, popup day
320x568. Nove kontrole su čitljive i bez horizontalnog prelivanja.

v2.2.6 objavljena 2026-10-04; latest /releases?per_page=1 vraća v2.2.6 i
app-debug.apk 65.143.787 B. Preuzet CI artefakt, upoređeni svi 6 promijenjenih
web asset fajlova s lokalnim izvorima i izračunat APK SHA-256 koji je jednak
Release digestu:
c264df8804f97c733dfd37f71ec4fe391ac32494e2e8955316626c26902cc19e.
https://github.com/pogonboskrupa/US-SUME/releases/tag/v2.2.6
Meni → Ažuriraj aplikaciju, Android code 496, isti postojeći debug potpis.
Nije korišten fizički telefon, pravi GPS/putevi niti produkcijski Supabase.

Primijećen postojeći izgled izvan novih kontrola: metapodaci u gornjem dijelu
vlaka popupa u Dnevnom modu su presvijetli na bijeloj podlozi (PNG day 320).
Nije mijenjan taj postojeći stil u ovom zadatku; prema AGENTS korisnik bira
narednu zasebnu popravku. Nove kontrole smjera u istom popupu imaju dobar
kontrast.

## 40. Doznaka, pamćenje prikaza i manji APK — 2.2.7 (2026-10-04)

Korisnik tražio detaljan pregled/popravke Doznake, zatim objasnio da OCR
ne treba raditi bez interneta i tražio pamćenje skrivenih tragova/drugih
slojeva te izabrane instalirane podloge. APK 2.2.6 65.143.787 B, od čega
41.033.660 B četiri OCR native biblioteke. Zamjena na Google Play
play-services-mlkit-text-recognition 19.0.1, manifest ocr model download,
JS onLine i native validated network uslov. Nema modela u APK-u; prvi
put model preuzimaju Play servisi i može trebati ponoviti nakon preuzimanja.
Izričit korisnički zahtjev za OCR uz internet ima prednost nad općom
offline smjernicom; GPS, lokalni podaci, karte i uvoz prethodnog rezultata
ostaju offline.

map-visibility: grupni tragovi imaju trajni izbor po nalogu i individualne
izuzetke; hladna obnova se primjenjuje nakon autha i učitavanja podataka.
Prikaz novih/obnovljenih oznaka poštuje izbor, aktivno snimanje je zasebno.
Referentna karta quick-hide pamti se po nalogu. sqlmapRestoreAll ne bira
najnoviji SQL fajl preko spremljene online podloge; async odgovor ne
prepisuje noviji izbor. Topo+Granice čuva izbor i stanje granica.

Doznaka: stale select i član/file-picker context, tačan GJ/odjel link,
atomski lokalni red za statuse, čuvanje zone kad brisanje nije zapisano,
uhvaćeni odjel/nalog za brisanje; GPX/QR pravilnog odjela/naloga i neposlane
tačke, XML, visina, 5-min segmenti; validacija GPS/QR koordinata i upisa.
Površina oduzima rupe i koristi zajednički lokalni račun. GPS prvi,
pretraga odjela, identitet, prečice/kartice i čitljiviji day UI.
Pregled sve tri cjeline i ograničenja: docs/PREGLED_DOZNAKE_2026-10-04.md.
Važno: četiri postojeća brisanja odjela još nisu DB transakcija;
Doznaka analiza stabala trenutno koristi vlastite povezane vlake.
Nema produkcijske migracije/upisa. Lokalno 85 JS test fajlova i pet inline
sintaksi prošlo. Browser/native/build rezultati slijede u istoj bilješci.
Web/SW/Android 2.2.7, versionCode 497.


CI 37188603263 objavio 2.2.7: APK 22.621.388 B, nema ugrađenog OCR modela,
39 asset SHA i browser/native mrežni uslov prošli. PNG Doznaka day320
pokazao tamno zaglavlje/tamne KPI kartice s day slovima. Dopunjene tematske
boje zaglavlja/KPI/članova/neaktivnih statusa i browser assertions. Završni
build 2.2.8/code498; ne prepisivati već objavljeni APK istim brojem verzije.

ZAVRŠENO 2.2.8: CI 37189273730 / 1abf830b7debac1d5e35bd809d4a0b2de4a0020a
uspješan. 85 JS test fajlova, 9 browser skripti, 39 asset SHA, build,
Android instrumentacijski uslov bez interneta i sintetička analiza brzine.
Statistika minmax kolone + na 320 px dvije; PNG day320/dark390 pregledani.
Release v2.2.8, latest API potvrđen, APK 22.622.560 B (22,62 MB), code498.
Preuzet CI APK, šest promijenjenih web asseta identično lokalnom izvoru,
GRANICE.kml ostao, nema ugrađenog OCR pipeline/modela. Izračunati SHA-256
jednak release digestu:
2b321b7af9d350ea1417dd342033ef92e57d87ab1968e570a40205b03069c4e0.
https://github.com/pogonboskrupa/US-SUME/releases/tag/v2.2.8
Nema fizičkog uređaja/GPS/produkcijskog Supabase testa; online čitanje
novim Play modelom nije instrumentacijski potvrđeno (testira se zabrana
bez validiranog interneta). Prvi model može tražiti čekanje i ponovni tap.

## 41. Nova DENDRO MAP ikona i terenski scenarij 5.400 m — 2.2.9

Korisnik dostavio novu šumsku Dendro map ikonu, zamjena svih brend resursa,
login JPEG → icon-512.png, pet Android gustoća/adaptive/round/fallback,
PWA/favicon/Menu/Apple/notifikacije. Novi icon-maskable.png u SW i Android
asset manifestu; master docs/DENDRO_MAP_ICON.png i android/generate-icons.py.
Nativni splash prethodno bez slike ostaje takav; samo promjena resursa/boje.
Web/SW/Android 2.2.9, versionCode499.

Korisnik traži provjeru 3 km vlastitih + 2,4 km kolege na osrednjem telefonu,
bez/slabog signala. tests/js/teren-5400.test.js: osam integritet scenarija,
756+604 tačke, offline GPS zapis/keš/red, restart/crash snapshot, 10 timeouta,
izgubljena potvrda upisa, ručno slanje/preuzimanje/idempotentnost, kolegin
offline keš i stvarni gate kvaliteta mreže. Prošlo i na assetima objavljenog
APK-a 2.2.8 i na sadašnjem izvoru. Mocks nisu produkcijski dokaz.
tests/browser/field-offline-5400.py dodan u CI PRIJE builda: Leaflet/Turf,
CPU1x/4x, 393x851, 1.360 i 5.410 tačaka, 24 ponavljanja i testni weak/dead
transport. CPU4x nije emulacija Redmi uređaja. Ne mijenjati GPS/server kod
samo zbog pregleda; stvarni telefon/baterija/background/prod nisu testirani.
Detalji: docs/TEREN_5400_I_IKONA_2026-10-04.md. CI/objava slijede.

Tokom rada korisnik tražio da Instalirane karte prvo prikazuju nagib,
ekspoziciju i ostale terenske slojeve kao slike. Pet ilustrativnih slikovnih
kartica ispred lokalnih karata, lokalni fajlovi sa stvarnim spremljenim
lm_thumb_* thumbnailom ili SVG fallbackom; šest lokalnih SVG-a u SW precache.
Postojeće radnje/checkbox/pamćenje izbora ostaju. Dopunjen postojeći browser
project-terrain-222.py za redoslijed, slike i day/dark responsive pregled.
Dodatna deveta integritet provjera: jedna vlaka 3 km / 751 tačka, odbijanje
GPS tačnosti 40m, označen 2-min GPS prekid i p95 obrade fiksa u Node cloudu.


ZAVRŠENO 2.2.9: CI 37193603513 na e26121a349f69e9ce83a6286bd93366d460df1cc
uspješan: 86 JS fajlova, 10 browser skripti, Android build, web asset SHA,
OCR offline network instrumentacija i sintetička analiza brzine. Teren
artefakt 11300107120: 9 integritet scenarija i 24 browser mjerenja.
CPU4x offline 1.360/5.410 tačaka: prikaz 23,6/34,6ms, upis 1,4/4,9ms;
requestAnimationFrame mjerenje nije FPS niti stvarni Redmi. Pregledani PNG
Instalirane day320/dark390. Release v2.2.9/API latest potvrđen, APK
23.878.221 B (23,88 MB), code499. Preuzet APK, 15 web fajlova byte-identično,
16 nativnih PNG-a piksel-identično, GRANICE ostao, nema OCR modela, stvarni
signing cert isti kao 2.2.8 (v2 signing block provjera).
APK SHA256: 5d3479e281f94d308a161f2e6c3dc061882d33bc5c117ece478c25abc19a673f.
https://github.com/pogonboskrupa/US-SUME/releases/tag/v2.2.9
Bez fizičkog uređaja/GPS/Xiaomi baterije i produkcijskog Supabase testa.

## 42. Server jednom radnjom, reorganizacija panela i dvosmjer — 2.3.0

Korisnik proširio zahtjev: jedno dugme slanje+prijem, pregledati/reorganizovati
Projekat i Vlake, jedan dvosmjer ↔ umjesto razdjelnice, položaj Na vlaci ili
Pored vlake (isključivo), sažeti snimanje bez precizne tačke/slobodnog pogleda.
Implementirano u postojećim server-panel/vlaka-direction/tab-data modulima i
HTML/CSS; 2.3.0/code500 u sva tri izvora. Dvosmjer u action-bar između desnog
kraka i pauze, baner bez praznog drugog reda. Projektantska tačka/stari ključevi
sačuvani. Server wrapper rezultat po koraku i nalogu, ručna write kapija samo
tokom slanja, prijem poslije zatvaranja kapije, živ lokalni rad zaštićen.
Doznaka prijem: dostupna lista odjela + trenutno otvoren odjel, izričito na UI.
Detalji: docs/DENDRO_SERVER_PROJEKAT_DVOSMJER_2026-10-04.md.
Lokalnih 86 JS fajlova prošlo; prošireni 4 postojeća browser pregleda. CI/objava
i provjera APK-a slijede. Bez fizičkog Android/prod Supabase testiranja.


ZAVRŠENO 2.3.0: CI 37203728695 na 2f8750bdb4f2fc4651098dafa106659716bf62b5
uspješan: 86 JS, 10 browser pregleda, Android build/SHA/OCR offline gate.
APK 23.890.289 B, code500, objavljen v2.3.0. Preuzet APK: sedam promijenjenih
web asseta identično HEAD prije novih 2.3.1 izmjena, GRANICE ostao, cert isti
11fcd020c703053324ae26baf7a8207373711341f503277a90ec08a8468f286d.
SHA256 0f9bb3239c578a36d41ee7fd29f882e0929e482bb9867903de423622901b3ce8.
Pregledani Server/Projekat/recording 320px i odjel+strelice 1:10.000 PNG.

## 43. Online prijedlog granice odjela sa aktivne topo karte — 2.3.1

Korisnik izričito potvrdio izvor: topografska podloga u aplikaciji, ne
referentna slika. Novi static/js/doznaka-boundary.js, worker samog modula,
Doznaka __boundary__ workflow dugme i mali status/prihvati/zadrži ručnu,
crna/plava/auto, koridor20/50/100m. Ugrađeni Topo ili trenutno uključena
lokalna raster karta; čita već prikazane tile slike/canvase, samo basemap,
nikad snimak vectora/ličnih vlaka ili javni OCR servis. Navigator/native
validated online gate i provjera poslije await. OCR postojećim Play mostom
isključuje natpise; detektor piksela klasificira odvojene debele izdužene
crtice uz sve stranice ručnog crteža. Tanke/pune/nepotpune/dvosmislene linije
ne daju automatsku granicu. Worker max1,5MP/15s, georeferencija zamrznuta pri
snimku. Bez novog modela/biblioteke ili native/Supabase migracije.
Ručne tačke ne mijenjaju se do eksplicitnog prihvata zelene geometrije;
Završi ostaje postojeće vraćanje granice u obrazac odjela. Potez/undo/cancel/
finish/izvor/identitet štite od zakasnjelog odgovora. Fajl je u SW i Android
manifestu, online-only pomoć uz offline-normalno crtanje.
2.3.1/code501 sva tri mjesta. 87 lokalnih JS fajlova prošlo (13 novih
geometrijskih scenarija), sva JS/inline/Python sintaksa. Novi stvarni Leaflet
raster/worker browser test u CI prije APK-a. Detalji:
docs/DOZNAKA_TOPO_GRANICA_2026-10-04.md. CI/objava slijede.
Korisnik pitao Xiaomi/Nova smeđi okvir ikone: source background tamnozelen
#002B18, foreground ranije scaled .42, nema smeđe u podešenoj pozadini.
Odgovoreno da veličinu objašnjava app padding, boju može launcher/theme;
bez screenshot/fizičkog uređaja uzrok nije potvrđen. Ikona nije ponovo
mijenjana samo na osnovu pitanja.


ZAVRŠENO 2.3.1: CI37206197933 na b3ac6e888af3c47c43c1707488b55baad5f05d66
uspješan (87JS,11browser,Android build,47assetSHA,emulator offline OCR gate,
36 sintetičkih CPU1x/4x scenarija poslije objave). UI239 PNG; pregledani
Doznaka day320/dark landscape i dvosmjer uz poligon1:10.000. Release v2.3.1
latest API potvrđen. Preuzet APK23.908.299B, nativeManifest dekodiran
ba.spd.uss.vlake.debug / 2.3.1-debug / code501. 47 svih repo web asseta prema
udaljenom Git stablu identično;9 izmijenjenih web fajlova lokalno identično;
15 launcher PNG-a identično2.3.0, GRANICE ostao, OCR bez velikog modela.
Stvarni cert isti kao prethodni, SHA256release:
c10d1828780dc75dab0a15ddf8bdb5a6ff6252854b951eb055b3d7d778828ec5.
https://github.com/pogonboskrupa/US-SUME/releases/tag/v2.3.1

Popravljen minimalni fixture/offline event bez Doznaka DOM-a, raster scale
sada po koridoru20/50/100m, OCR '---' ne maskira prave crtice. Browser test
zakasnjelog rezultata ispravljen (assignment Promise ranije čekao odgovor
prije simulacije), CI37205646511 otkazan. Budući workflow concurrency+20min,
jednokratni cancel/actionswrite uklonjeni. Testni red marker vrati se nakon
PNG-a. Bez fizičkog Xiaomi/produkcijskog Supabase/stvarne šumarske topo
karte; ne tvrditi postotak OCR/linijske uspješnosti ili brzinu pravog telefona.
Lokalni neki netaknuti fajlovi razlikuju se od udaljene rekonstruisane baze:
APK sva47 provjerenih asseta odgovara UDALJENOM branch stablu. I dalje samo
explicit modified paths na remote base tree, nikad široki git push.

## 44. DEM, potvrđena zima USK, spojeni pojasevi i pregled razmjene/štampe — 2.3.2

2.3.2/code502 sva tri mjesta. DEM na stvarnom uzorku Bos.Krupe iz
EUDEM izvora (AWS metadata, približno30m); bilinearno sa centrima piksela,
šavovima pločica i NoData, gradient sa30m stencilom, strogo >30%, potpuni
grid/OpenMeteo provjera, neispravan cache/decode/kvota i offline profil.
Ne tvrditi RMSE ili LiDAR kvalitet. Copernicus GLO30 COG39.47MB bezCORS,
Mapterhorn403; nije neprovjereno zamijenjen izvor. DemQuality modul uSW/APK.
WinterImagery modul: Esri metadata SRC_DATE, ne datum objave, ≤2m, online,
bounded pretraga i maska geoBoundaries USK. Stvarni Bihać14.01.2019,
WV03 native.31m/sampled.30m potvrđen HTTP/tile; ne tvrditi cijeliUSK
pokriven zimom. Sentinel2 stvarni Feb2026/10m preslab za pojedinačnevlake.
DozBands: susjedni paralelni izohipsni tragovi sa identičnom međugranicom,
obrezani odjelom. Dvosmisleni/ukršteni/udaljeni tragovi GPSfallback,
bez izmišljanja obrade rupa ili promjene GPS-a. Uklonjeno izbacivanje
vlastitih GPS tačaka kod kolege i širenje preko radijusa; granica u memo.
Proba4×6dana×2/3pojasa=60/12.060tačaka,57.08ha,49.65procjena,7.43ostatak,
0.00preklop. Jedan iznad drugog; alternativa2ekipepo2zasebna. PNG/PDF
outputs/doznaka-sixdays; Node i Leaflet isti obračun, CPU4x1.77s,
offline reload. Nije stvarni Xiaomi niti produkcijska doznaka.
Štampa: zajednički SVG lagera, privatna crvena puna, stvarni stilovi karte
i kolega u legendi, privremeni print editor po vidljivom sloju +Vrsta;
Zatvori/Reset vraća stilove, PDF provjeren. Server novi3akcenta, autora
i projekat u zatvorenoj grupi/stavci, stvarne potvrde i ista3projekta;
jedno dugme/nema novih slanja. Sourced izvještaj:
docs/DEM_ZIMA_DOZNAKA_2026-10-04.md. CI/APK provjera slijedi.

ZAVRŠENO 2.3.2: remote43178508823829c6b781edb1ddb9dcf660855c04,
CI37223342175/job111497896539success;90JS i15 stvarnih browser programa,
Android build +51assetSHA +manjiAPK +emulator offlineOCR gate,
analiza brzine poslije objave. Pregledani CI Server day/dark i štampaPDF.
APK23.947.824B (23.95MB), ba.spd.uss.vlake.debug/2.3.2-debug/code502.
Svih51webresursa jednako remoteGitTree b3e4262cb13cfe0ac528f2d7acedc514d9961c37;
izmijenjeni web fajlovi jednako lokalno;15launcherPNG nepromijenjeno,
GRANICE>10MB, nema velikogOCRmodela. Potpis cert11fcd020c703053324ae26baf7a8207373711341f503277a90ec08a8468f286d isti2.3.1.
Release/API prvi v2.3.2, digest istog preuzetogAPK-a:
d98a1b8389e06e3e672658da7d71a4ae5700e32bf41e6de4c6cfc3636e33e010.
https://github.com/pogonboskrupa/US-SUME/releases/tag/v2.3.2
Local484a23e različit remoteparent; ponovo samoexplicitpaths atopremote.
Bez fizičkogXiaomi/produkcijskogSupabase/mjerenjaLiDARgreške.

## 45. Učitaj kartu: novi raspored i pregled lokalnih karata — 2.3.3

2.3.3/code503 sva tri mjesta. Prva sekcija Menija dobila dva jasna podtaba:
Dodaj kartu / Moje karte. Jedan sistemski izbor više fajlova umjesto tri
dugmeta za isti picker; slikovni uvod, podržani raster formati, KML/SHP
prečica i jasna dva koraka. Sačuvane karte: horizontalni brzi pristup,
pretraga, stvarna keširana minijatura ili označena ilustracija, status
vidljivosti i čuvanja, veliko Prikaži na karti / Sakrij, sklopivi detalji,
prozirnost, redoslijed, informacije i eksplicitno brisanje uz potvrdu.
Zauzeće karata odvojeno od browser kvote prostora aplikacije; kvota nije
slobodna memorija telefona. Dnevni/tamni/landscape, 44px dugmad i mali ekran.

Pregled prije dodavanja: zaglavlje SQLite, veličina, format, neispravni
fajlovi preskočeni, potvrda blokirana tokom provjere ili bez valjanih
fajlova. Zaglavlje ne potvrđuje da baza sadrži raster: to provjerava engine.
Zakašnjela provjera ne nadjačava novi/otkazan izbor; kasna pretraga/popisi
ne prepisuju novije rezultate. UI broj uspjeha provjerava stvarno otvoreni
sloj jer postojeći sqlmapLoadFile interno hvata greške bez return rezultata.
Sačuvana a neotvorena karta sada koristi postojeći sqlmapRetryOne preko
IDB/OPFS umjesto zahtjeva za ponovnim izborom izvornog fajla. SQLite engine,
formati, baze i native kod nisu mijenjani; nema novih biblioteka/resursa.

Lokalno: 90JS programa + inline sintaksa; stvarni Leaflet/SQL.js Worker/
IndexedDB i sintetička MBTiles PNG karta, učitavanje i offline restart,
pretraga, prozirnost, z-index, skrivanje, odbijeno/potvrđeno brisanje,
SQLite bez raster tabela, neispravno zaglavlje i zakašnjeli izbor. Bez
vanjskih mrežnih poziva. 26 PNG na 320/390/568/800px u dva moda, pregledani
day390, dark320 i landscape pregled. Novi browser test u CI-u (ukupno16).
CI/APK provjera slijedi. Nije testirano na fizičkom Xiaomi uređaju.

ZAVRŠENO 2.3.3: remote b66c3a2c98a2f1eed7cd46d2ad7ca62dbaa1ffa0,
CI37229255029/job111515257513success (90JS,16browser,Android build,
51assetSHA,emulator offlineOCR gate,analiza brzine nakon objave).
CI26novihPNG; day390/dark320/landscape pregledani. APK23.962.716B,
ba.spd.uss.vlake.debug / 2.3.3-debug / code503; svih51webassetGitSHA
isto remote tree9ff3b8a72d9e0f094e721f3ab73c23ed72d1c684,
izmijenjeniwebfajloviisto lokalno,15launcherPNGisto2.3.2,GRANICEsačuvan.
CertSHA25611fcd020c703053324ae26baf7a8207373711341f503277a90ec08a8468f286d
isto2.3.2; SHA256preuzetogAPK-a istoReleaseAPI digest:
15fff7e3a51a923f0ae577a740ea84d42e6b1e67591f187fd406052f10e20b5d.
https://github.com/pogonboskrupa/US-SUME/releases/tag/v2.3.3
Objavljeno za Meni → Ažuriraj aplikaciju; fizički Xiaomi nije testiran.

## 46. Potvrda brisanja vlake i statusa odjela — 2.3.4

Korisnik prijavio NO_CONFIRMATION za ciljani odjel i brisanje vlake.
Reprodukovano kontrolisanim HTTP-om preko stvarnog Supabase JS SDK-a:
DELETE nakon izgubljenog odgovora vraća [] jer je red već obrisan; prethodni
procesor je svako [] smatrao greškom. Sada je DELETE ograničen ID-jem i
vlasnikom, a prazan uspješan odgovor prati SELECT id,korisnik_id. Odsustvo
potvrđuje konačno stanje; postojeći red/nepotpuni odgovor/neuspjelo čitanje
ne uklanjaju zahtjev. Prije potvrde odsustva auth.getUser provjerava stvarnu
prijavu vlasnika (jednom po prolazu); anonimni RLS [] uz keširani profil
ne potvrđuje brisanje. Tuđa vidljiva vlaka daje WRITE_FORBIDDEN. RLS ostaje
autoritet; odsustvo se potvrđuje u opsegu prijavljenog korisnika (politika
repoa daje vlasniku SELECT vlastite vlake), bez zaobilaženja prava.
sbDeleteVlaka koristi trajni red i tokom ručnog slanja, bez zasebnog
nepotvrđenog DELETE-a; vlasnik se provjeri poslije in-flight upisa. Novi
zahtjev nosi ime/projekat/vlasnika radi smislenog prikaza potvrde i greške.

Doznaka: dozSetStatus automatski pauzirao SVE aktivne odjele, uključujući
kolegine. Repo migracije20260611/20260713 doz_projects_update dozvoljavaju
isključivo created_by=auth.uid(). UI sada status mijenja samo kreatoru, a
pauzira samo njegove druge odjele. Član nastavlja snimati/slati pojaseve.
UPDATE ograničen kreatorom, potvrda zahtijeva ID i traženi status. Na praznu
mutaciju SELECT status/created_by: jednako željenom = završena operacija;
različito/tuđe/nedostupno = sačuvan zahtjev uz preciznu grešku. Migracija
legacy privremenog ID-ja sada obuhvata i payload.id upsert_doz_status.
Stari odbijeni status se NE briše automatski: u detaljima grešaka korisnik
može ukloniti samo taj zahtjev uz potvrdu koja jasno kaže da pojasevi/zone/
vlake ostaju. Odbijena potvrda i promjena naloga ga ne uklanjaju. Poruke
grešaka više nisu odsječene jednim redom. Nema produkcijske SQL migracije.

Lokalno90JS programa + inline sintaksa; novi browserserver-confirm-234
sa stvarnim Supabase klijentom i _OL, kontrolisanim PostgREST HTTP-om:
izgubljen odgovor nakon izvršenog DELETE-a, ponavljanje i SELECT odsustva,
RLS bez izmjene, tuđi vlasnik, anoniman keširani profil, 503 na čitanju, željeni/različiti/nedostupni
status, legacy ID, kreator/kolega i selektivno uklanjanje statusa uz očuvan
GPS bafer i zonu. Postojeći mock-lanci ažurirani za dodatni filter vlasnika,
bez slabljenja provjera. Novi test u CI (ukupno17browser). 2.3.4/code504 sva
tri mjesta. CI/APK provjera slijedi. Produkcijski Supabase i fizički Xiaomi
nisu testirani; ne tvrditi da su živa RLS pravila izmijenjena ili provjerena.

ZAVRŠENO 2.3.4: remote1eb11d8196ebf704d635bbf899c9804761bd2bff,
CI37275977639/job111652970113success (90JS,17browser,Android build,
51assetSHA,offlineOCR emulator,analiza brzine36ponavljanja). Novi HTTP test
prošao i lokalno sa stvarnom Supabase bibliotekom iz prethodnog APK-a
(rekonstruisana lokalna biblioteka ima drugi SHA; nisu mijenjane biblioteke).
APK23.966.552B, ba.spd.uss.vlake.debug/2.3.4-debug/code504. Svih51webasset
isto remoteTree a825f442117cc84d2bbfb7580b03c32ce79a766e; izmijenjeniweb
isto lokalno;15launcherPNGisto2.3.3,GRANICEsačuvan,nema velikogOCRmodela.
CertSHA25611fcd020c703053324ae26baf7a8207373711341f503277a90ec08a8468f286d
isto2.3.3. Preuzeti APK SHA256 jednak ReleaseAPI digest:
85eb009cc83fe777f70267e8a1b6137817888a7d9e2f4f764f1a5f59686b3e6d.
https://github.com/pogonboskrupa/US-SUME/releases/tag/v2.3.4
Korisnik ažurira i ponavlja Pošalji i primi. Stari zabranjeni status kolege
uklanja pojedinačno u detaljima grešaka; ne brisati cijeli red/bafer.

## 47. Mjerenja i tragovi — modal 2.3.5

Korisnik je tražio profesionalni izgled Meni → Mjerenja i tragovi te novu
verziju za ažuriranje. Četiri sitne pločice zamijenjene su karticama 2×2 sa
postojećim SVG ikonama, opisom i jedinicama; njihove postojeće radnje
Udaljenost/Površina/Nagib/Tragovi su sačuvane. Zaglavlje, aktivni projekat
(odjel/GJ), stanje snimanja GPS traga, brojači lokalnih sačuvanih mjerenja i
tragova i dvije prečice do postojećih tabova registra. Brojači izričito
navode svi projekti na uređaju; nije dodan pogrešan filter aktivnog projekta.
Nazivi preko textContent, bez HTML umetanja ili mrežnih zahtjeva. Samo
otvaranje/zatvaranje modala ne mijenja snimanje ili zapise.

Scoped field-design.css, Dnevni/tamni prikaz, 44px kontrole, ograničena visina
i zasebno skrolanje tijela uz stalno dostupno zatvaranje. Fokus, Tab ciklus,
Escape i povratak fokusa na vidljivi okidač/menu dugme. Modal nema nove
biblioteke/slike/animacije, ne obrađuje geometriju ili GPS tačke.

Lokalno prošlo svih90JS testova i inlineJS syntax; novi
tests/browser/measurements-235.py sa stvarnim markupom/CSS/funkcijama modala
i postojećom _tragoviSetTab, ali kontrolisanim navigacijskim pozivima. Osam
prikaza (320×568,390×800,568×320,800×600,oba moda), offline, četiri stara
alata/dva registra, prazni brojači, dugi/zlonamjerni nazivi, fokus/overlay,
stanje snimanja/pauze i očuvani registri pri otvaranju. Osam PNG u outputs.
Test dodan u CI (ukupno18browser). Web/SW/Android2.3.5/code505. CI/APK
provjera slijedi. Fizički Xiaomi nije testiran.

CI37284217727: prvi pokušaj prošao90JS/18browser/Android build/51asset,
ali emulator izašao137 na svc data disable prije testa. Drugi pokušaj
pokrenuo Android test, ali assertFalse(hasInternet) pao: emulator i nakon
Wi-Fi/mobile disable imao VALIDATED internet. Emulator37.2.12 može imati
virtualni Ethernet. CI fixture sada adb root + airplane mode + Wi-Fi/data
disable + ako postoji eth0, ip link set eth0 down. Testni assert i native
OCR uslov nisu oslabljeni/promijenjeni. Novi CI slijedi sa istim2.3.5/code505
koji još nije objavljen; nije mijenjan funkcionalni kod zbog CI problema.

ZAVRŠENO2.3.5: remote fca9faefff7712548744292d1ab88ca02d857208,
tree ab0d2a5ca49fbc4c0225264856dbf0f580e2299c. CI37286799402/
job111687501267success:90JS,18browser,Android build,51assetSHA,
stvarni Android offlineOCR test sa izolovanom mrežom,36ponavljanja analize
brzine. Ranija dva neuspjeha CI37284217727 nisu zaobiđena; ispravljena
je izolacija mreže fixturea i kompletan novi CI prošao.

Preuzeti APK outputs/app-debug-2.3.5.apk:23.974.488B (23,97MB),
ba.spd.uss.vlake.debug/2.3.5-debug/code505. Svih51webasset isto remote
tree; izmijenjeni web fajlovi isto lokalno. GRANICE sačuvan,15launcherPNG
isto2.3.4, bez velikog offlineOCRmodela. CertSHA256
11fcd020c703053324ae26baf7a8207373711341f503277a90ec08a8468f286d
isto2.3.4; APK SHA256 isti ReleaseAPI digest:
17ab5feeb10723b520a80e84b11fc76f95628a11de99f32dde64b8bf2df1ef40.
/releases?per_page=1 vraća v2.3.5 sa javnim app-debug.apk.
https://github.com/pogonboskrupa/US-SUME/releases/tag/v2.3.5
Korisnik ažurira preko Meni → Ažuriraj aplikaciju. Fizički Xiaomi nije
testiran. Nema izmjena produkcijskog Supabase-a.


## 48. Explorer navigacija i checkbox — 2.3.6 / code506

Korisnik traži Vodi me do tačke/lokacije iz vlastite pozicije, pro dizajn,
te checkbox za uključivanje/isključivanje Explorer prikaza. Oba ulaza
koriste isti novi static/js/explorer-navigation.js. Sačuvana tačka ili
jedan dodir cilja na karti pokreću GPS navigaciju; privremeni cilj ne
upisuje novu terensku tačku. Sačuvane rute imaju Explorer za krajnji cilj;
Pripremi rutu ostavlja postojeći planer/rutu/profil.

Explorer je 2D karta okrenuta prema kompasu/smjeru kretanja, korisnik niže
u vidljivom polju, uspravne kontrole i panel sa ciljem, zračnom udaljenošću,
smjerom, preciznošću/starosti GPS-a i dostupnim visinskim razlikama. Nije
3D teren/AR niti novo skretanje-po-skretanje rutiranje. Bez kompasa koristi
pouzdan smjer kretanja; bez signala/novog fixa ne izmišlja smjer/udaljenost.
Dolazak samo <=15m, preciznost<=15m, GPSfix mlađi5s. Offline radi GPS i
navigacija, za podlogu treba prethodno sačuvana karta.

Checkbox Explorer prikaz (dodirna površina>=44px) pamti samo izbor prikaza
u tvlake_explorer_view_v1, bez automatskog pokretanja GPS-a/cilja pri ulasku.
Isključen vraća sjever gore i gestu karte, cilj/GPS/terenski podaci ostaju.
Pregled privremeno oslobađa mapu; checkbox vraća praćenje. Adapter privremeno
omota mapPane i proširi viewport na dijagonalu kako rotacija ne otkriva
prazne uglove; obnavlja metode/gestu/DOM prije pregleda, alata, štampe,
promjene taba i završetka. Kontrole snimanja ostaju dostupne. Kamera max4Hz
uz pragove promjene; nepomični GPS ne pomjera kartu stalno. GPS obrada i
snimanje geometrije nisu izmijenjeni; automatski pan snimanja tokom aktivne
navigacije na karti prepušta se Exploreru/pregledu. Kasni OSRM/profil
odbačen nakon izbora novog cilja. Brisanje/preimenovanje aktivne tačke
održava cilj/index; potvrđena odjava gasi navigaciju.

Lokalno:90JS skupova i5inlineJSblokova sintaksa prošli. Novi browser test
sa stvarnim Leaflet/canvas/pločicama, offline, kontrolisani GPS/kompas,
8prikaza/6smjerova, oba ulaza, checkbox i pamćenje, tačne koordinate nakon
obnove, kontrole snimanja, slab/star GPS, dolazak, GPS kurs, tabovi, ruta,
zlonamjerni naziv, kasni OSRM/profil. Ranije u istom zadatku prošli
menu-tools.py i print-styles-232.py. CI dodan19.browser. Novi JS je u
SWshell i requiredAPKassets; web/SW/Android2.3.6/code506. Nema novih
biblioteka niti promjena nativeGPS/proizvodneSupabase baze. CI/APKprovjera
slijedi; fizički Xiaomi/kompas na uređaju nisu testirani.


ZAVRŠENO2.3.6: remote0580d572454e72f6d28124be52dde932af400b94,
treefe1c3ea3c591fd065c6a365074f1eb8de480534c. CI37312651657/
job111771592449success:90JS,19browser (uključujući Explorer offline sa
checkboxom),Android build/52assetSHA,stvarni Android offlineOCRtest,
36ponavljanja sintetičke online/offlineCPU1x/4xanalize. Bez preskočenih
obaveznih provjera/reruna.

Preuzeti APK outputs/app-debug-2.3.6.apk:23.999.077B (24,00MB),
ba.spd.uss.vlake.debug/2.3.6-debug/code506. Svih52webasset identično
remote tree; izmijenjeni webfajlovi identično lokalno. GRANICE sačuvan,
15launcherPNG isto2.3.5, bez velikog offlineOCRmodela. CertSHA256
11fcd020c703053324ae26baf7a8207373711341f503277a90ec08a8468f286d
isti za update. APK SHA256 i ReleaseAPI digest:
309e036dbbffe7f8b64cd5f533950bc286270307c1d561d6046685332654c71b.
/releases?per_page=1 vraća v2.3.6 sa javnim app-debug.apk iste veličine.
https://github.com/pogonboskrupa/US-SUME/releases/tag/v2.3.6
Korisnik ažurira Meni → Ažuriraj aplikaciju. Fizički Xiaomi/kompas na
uređaju nisu testirani; sintetička analiza nije mjerenje na telefonu.


## 49. Preklapanje Explorera i prozora — 2.3.7 / code507

Korisnik prijavio preklapanje modala, traži novi APK. Dodatno precizira:
Explorer samo kroz Vodi me do tačke/traga i Vodi me do lokacije iz Menija.
Nova kamera se ne pokreće otvaranjem app/GPS/snimanjem. Checkbox bez aktivnog
cilja ne aktivira navigaciju. Izbor se pamti, prikaz je vezan za cilj.
Nazivi akcija su Vodi me; Explorer checkbox ostaje samo u aktivnoj navigaciji.
Trag dobiva Vodi me u popupu/listi: najbliža važeća snimljena tačka prema
poznatoj poziciji, bez pozicije početak. Cilj je snapshot; nema izmjena traga,
vidljivosti registra ili upisa lažnih tačaka. Ovo nije rutiranje duž traga.

Utvrđen uzrok: layout Explorera uzimao samo map rect, zanemarivao action-bar,
rec-banner/rec-bar. Footer z1800 pokrivao snimanje/donju traku, a mjerenja/
GPS/kratki prozori imali odvojen životni ciklus. Novi layout rezerviše stvarne
rects donjih traka. Pri malom prostoru sažeti footer (udaljenost/checkbox/stop),
bez sudara s trakom; puni prikaz se vraća kad ima prostora. Ekstremno malo
polje sakrije pozicioni puck ako bi prekrio kontrole. Overlay/popup privremeno
sakrije HUD i obnovi običnu mapu (metode/gestu), čuva cilj/izbor/GPS, pa vraća
navigaciju tek kad su svi prozori zatvoreni i Karta vidljiva. MutationObserver
prati postojeće overlay roots/roditelje; ResizeObserver rezervisane trake.
Nema posmatranja cijelog DOM subtree niti novih poziva u GPS obradi.
Guide/Mjerenja zatvaraju kratke GPS/Izmjeri popupove. Ne otkazuje se snimanje
ili nečiji nacrt radi uklanjanja preklapanja.

Lokalno90JS skupova/5inline syntax prošli. Browser launch lokalno blokiran
sandbox socket/setsockopt pravilom; test se nije izvršio, nema lažnog lokalnog
prolaza. Nova tests/browser/overlays-237.py provjerava stvarni markup traka,
24kombinacije rasporeda/snimanje-pauza/modovi,6prozora, nested prozore,
čuvanje cilja, checkbox, tab/stop, navigaciju do traga i sačuvanu geometriju.
CI uključen prije APK builda, uz postojeći Explorer/regresijski skup (20browser).
Web/SW/Android2.3.7/code507. CI/APKprovjera slijede. Fizički Xiaomi nije testiran.

CI37328696203 test je reproducirao i drugi sudar:320×568, pauzirano snimanje,
footer273.8px ody100.3, headerdo130px. Prvobitni prag240px bio premalen za
puni portrait footer uz pauzu. Sažeti raspored sada kad je slobodno polje
<400px portrait/<280px landscape. APK nije objavljen jer browser provjera
pala prije builda. Ispravka i ponovni CI slijede.


Završena provjera preklapanja2.3.7: remote8697fe1dcbb6917ff959c6a3be8a1ed40dd574e1,
tree10567de4c9ac2ea49b1e6af57f518d202c3c15cf,CI37329500118/job111828681998success.
90JS/20browser/Android build i offlineOCR/52assetSHA/36perf. Releasev2.3.7
app-debug.apk24.004.473B,digest471dcba6cc8e221a03a71a321b2f08f88137ebf600f16555f4486799ce1e5a63.
Release metadata provjerena; APK nije dodatno preuzet jer je korisnik za vrijeme
CI-ja zatražio sljedeći upgrade (2.3.8). Fizički Xiaomi nije testiran.

## 50. Explorer 3D perspektiva i probni pristup — 2.3.8 / code508

Novi zahtjev: pogled ispred u3D i7dana od registracije za novog korisnika;
po isteku čekanje odobrenja, bez automatskog brisanja. Aktivni task uključuje
prethodnu popravku preklapanja i završni novi APK.

Explorer sada CSS3Dperspektiva48° uz projekciju/inverziju stvarnih Leaflet
koordinata, heading gore i korisnika niže u slobodnom polju. Veći viewport
izračunat iz inverzije uglova, bez praznih uglova. Ovo je perspektiva ravne
kartografske podloge; nije novi DEMmesh/izmišljeni reljef/ARkamera. Tačnost
ciljeva/GPS-a ostaje ista; stop/pregled/modal obnavljaju običnu mapu. Nema
novih velikih biblioteka/modela. Novi unit test projekcije i browser assert
upoređuju matematički ekran sa stvarnim DOMmarkerom u šest smjerova.

Probni pristup: static/js/access-policy.js koristi serverom postavljen
probni_do; prvo_odobren_at razlikuje opozvani nalog od novog. Rok isključiv:
now>=probni_do blokira. Admin/odobreni nastavljaju. Bez kolone/modula ostaje
postojeće čekanje, nema klijentskog otključavanja stare baze. Pokretanje,
recheck, nadogradnja sesije, provjera opoziva, odjava poštuju isto pravilo.
Timer/visibility pauziraju aktivnu vlaku/trag/doznaku po isteku (bez brisanja
snapshot/registara/naloga), čuvaju sesiju za adminovo naknadno odobrenje.
Novi APK ne poziva stari destruktivni check_own_pending_expiry. Admin UI više
ne piše brisanje; prikazuje kraj probnog roka i sačuvan zahtjev.

supabase/migrations/20261005_probni_pristup_7_dana.sql: atomarna/idempotentna,
probni rok sidri na auth.users.created_at+7dana, štiti created_at/probni_do/
prvo_odobren_at od klijentskog produženja. je_odobren uključuje važeći probni
rok uz postojeće RLS/članstva/uloge. Obje stare funkcije brisanja neutralizovane
za stare APK/admin pozive; admin_get_all_users zadržava povratni potpis i sve
zahtjeve. Postojeći čekatelji dobijaju samo preostali dio izvornog roka, ne
novih7dana od migracije. Opozvani ne dobijaju probni rok. SQL nije primijenjen
na produkcijsku bazu: nema Supabase/adminSQL alata ili kredencijala u ovom
okruženju. Aktiviranje servera zahtijeva SQL Editor vlasnika baze. Ne tvrditi
da7dana radi u produkciji samo zbog promjene APK-a. Server je autoritet za
mrežni pristup; klijentski offline timer koristi sat uređaja/keš zaštićenog
roka i nije sigurnosna zaštita protiv uređaja kojim napadač upravlja.

Lokalno92JS skupova/5inlineJSsyntax prošli. Novi accessbrowser test stvarnog
gate/timera/recheck, pauza bez brisanja, naknadno odobrenje/opoziv. CI21browser.
Novi PostgreSQL16service isključivo testna baza; tests/sql/probni-pristup-238.sql
primjenjuje stvarnu migraciju dvaput, provjerava RLS pod authenticated,
važeći/istekli/opozvani nalog, pokušaj produženja datuma/samoodobrenja, stare
RPCpozive bez brisanja, naknadno odobrenje/adminpregled svih zahtjeva.
AccessPolicy uSWshell/requiredAPKassets. Web/SW/Android2.3.8/code508.
CI/APKprovjera slijede; fizički Xiaomi i produkcijska Supabase nisu testirani.

Prvi CI238 37332202726/job111837842818:92JS prošli; stvarna SQL migracija i
RLS/protected rok/bezbrisanja scenariji prošli do admin liste. SQLfixture je
nepotpuno imitirao auth.users (nedostaje last_sign_in_at, postojeća Supabase
kolona). Dopunjena testna tabela; produkcijska migracija nije mijenjana.
Nijedan browser/APK korak nije izvršen u ovom neuspjelom pokušaju.

### Završna provjera i isporuka 2.3.8 — 2026-10-05

Finalni kod d7f1cc752b88db0f70a87a5d719121e18cc62663; tree
cijelost web sadržaja potvrđena kroz GitHub tree i stvarni APK. CI
37332567063/job111839507922 SUCCESS:92JS skupova, PostgreSQL16 stvarna
migracija dvaput +RLS/protected rok/istek/opoziv/bezbrisanja/adminodobrenje,
21browser provjera, 24 rasporeda preklapanja, 8 Explorer pregleda i 6smjerova
sa stvarnim DOMmarkerom u 3Dperspektivi, Android izrada i 1instrumentation
mrežniuslovOCR test, 53SHA256assets, 36sintetičkih perf ponavljanja.
Raniji CI37332464645 sa istim proizvodnim kodom je otkazan radi dodavanja
obaveznog SQL uputstva u release bilješku; kompletan finalni CI nije otkazan.

Preuzet artifact11355141993, provjeren stvarni APK:
outputs/app-debug-2.3.8.apk, 24.006.916bytes (~22,89MiB).
SHA256 c35fabcff697dc2812b8782df7a6ac50e4a9506e0107381006488991ed3fb66e.
CertSHA256 11fcd020c703053324ae26baf7a8207373711341f503277a90ec08a8468f286d.
Binary AndroidManifest ba.spd.uss.vlake.debug/2.3.8-debug/code508.
53webassets identična finalnom remoteGitTreeu, izmijenjeni webassets i
lokalnom kodu; GRANICE>10MB sačuvan, offlineOCRmodel ne postoji.
15launcherPNG identična prethodnom stvarnom APK2.3.6. Releasev2.3.8
asset24.006.916/digest identični preuzetom i provjerenom APK-u; Meni
Ažuriraj aplikaciju koristi objavljeni release. U release opisu eksplicitna
jednokratna SQLaktivacija probnogpristupa.

UIartifact11355146630 (~16,35MB) preuzet i pregledane stvarne CI slike
Explorerday390×800 i recordingpausedday320×568: nagnuta kartografska
perspektiva, čitljiv GPS/cilj/checkbox, kompaktan footer iznad snimanja.
Testna topografska podloga je kontrolisani raster, ne stvarni DEMreljef.
Fizički Xiaomi nije testiran. Produkcijski Supabase SQL nije izvršen jer
nema administrativne veze u ovom okruženju. Potrebno jednom pokrenuti
supabase/migrations/20261005_probni_pristup_7_dana.sql u SQL Editoru;
APK sam ne otključava sedmodnevni rad/stare serverske funkcije brisanja.


## 51. Explorer ostaje standardan — 2.3.9, 2026-10-05

Korisnik prijavio da 2.3.8 ne uključuje 3D i prikazuje običnu kartu. Stvarna
integracijska greška: Explorer overlaySelector obuhvata [role=dialog], a
stalni #dlg-sheet ima display:block i transform:translateY(100%) i kad nije
otvoren. getClientRects().length>0 i visibility!=hidden zato uvijek true;
blocked ostaje true, paint vraća običnu kameru i sakriva navigaciju. Stari
browser testovi nisu uključivali cijeli DOM (posebno taj zatvoren dijalog).
Prolaz 2.3.8 izolovanih scenarija nije bio dokaz ove stvarne integracije.

shown sada zahtijeva stvarni pravougaonik koji presijeca ekran. Otvoren
modal i dalje suspenduje kameru; transitionend/cancel osvježavaju provjeru
kad zatvoreni sheet izađe iz ekrana. Novo body childList praćenje otkriva
naknadno dodane dijaloge ažuriranja, bez subtree praćenja GPS/Leaflet DOM-a.
Atributi se i dalje prate samo na prozorima/trakama i njihovim roditeljima.

Checkbox Explorer 3D uključuje nagnutu perspektivu odmah, i dok se čeka
prvi fix ili je GPS pozicija zastarjela. U čekanju centar je trenutna karta
ili zamrznuta prethodna kamera, a naslov kaže ČEKAM GPS. Bez svježeg GPS-a
nema oznake TI, udaljenosti ili dolaska. Svježi fix vraća stvarno praćenje;
pregled/stop/tab/modal i checkbox vraćaju originalne Leaflet interakcije.
48° perspektiva i geografska projekcija nisu mijenjane. Terenski podaci,
GPS snimanje/filteri, SQL/trial pravila i podloge nisu mijenjani.

Novi tests/browser/explorer-239.py koristi CI Chromium, CI stvarni Leaflet,
cijelo tijelo i CSS index.html, sve statične dijaloge, točan proizvodni
Explorer getPosition/getCompass adapter. Auth/GPS/kompas su kontrolisani,
bootstrap ostalih servisa nije izvršen; nema produkcijskih zahtjeva.
Provjerava stari pogrešan predicate na stvarno zatvorenom dlg-sheet,
aktivaciju prije GPS-a, stvarni DOMmarker vs projekcija u 4 veličine,
animirano zatvaranje/naknadni dialog, gubitak GPS-a i checkbox/stop.
To nije test na fizičkom Xiaomiju niti punom stvarnom Supabase loginu.
U CI dodan prvi browser korak (ukupno22). Web/SW/Android2.3.9/code509.
Lokalni Chromium je ranije blokiran sandbox socket pravilima; ne ponavljati
stale permission launch. Relevantna browser/Android provjera ide na CI.
Provjera i APK objava slijede; ne tvrditi isporuku prije uspješnog CI/APK-a.

Lokalno92JS i5inline sintaksi prošli. Browser239 proširen i na stvarni
switchTab (ostale auth/snimanje hooks kontrolisane), da se zatvore stvarni
početni tab paneli i provjere granice navigacije uz stvarnu action-bar traku.

CI37336482087/job111852728618 zaustavio objavu: novi test sa stvarnim
switchTab je uhvatio pomak DOMmarkera ~15px pri resize na320×568. Stvarni
bug: measure mijenja depth/size, a world.transform ostaje na staroj dubini
ako camera.y/zoom/GPS nisu promijenjeni. Sada measure ažurira CSStransform,
a revision kamere prisiljava novi anchor i kad y ostane isti. Test nije
olabavljen; zahtjev <3px ostaje. Raniji CI37335873115 je otkazan radi
jačeg testa taba/rasporeda, nije objavio APK. Proizvodni2.3.9 još nije objavljen.

Dodana Android instrumentation ExplorerNavigationTest: lansira stvarnu
MainActivity i njen hardverski WebView, čita kompletan APK index.html i
proizvodni JS (bez rezanja skripti), sve uz ugašenu emulator mrežu. Kontrolisan
ulaz authUI i GPS senzor, stvarni switchTab/onP/getPosition/Leaflet/3Dmatrix,
zatvoren i animirani dijalog/checkbox/stop; provjera <3px DOMgeografije i
neizmijenjenih registara. Ovo je emulator, nije fizički Xiaomi.
CI connectedDebugAndroidTest sada treba izvršiti2 instrumentacije; nema
novih runtime biblioteka/assets/Supabase migracija/izmjena native produkcije.

CI37338061983/job111857774666:92JS/SQL/22browser/53assets/Android APK build
prošli; dvije Android instrumentacije započele16:11:26UTC i nisu završile.
Job prekoračio20min i otkazan; APK nije objavljen. Nema dokaza da je taj
native test prošao. Dodat kompletan proizvodni browser bootstrap test
(explorer-full-239.py, svi stvarni JS blokovi, kontrolisan authUI/GPS,
vanjska mreža blokirana i GRANICE za ovaj test mali fixture). Ukupno23.
Native test uklanja ActivityScenario/runOnMainSync čekanje UIidleness;
koristi stvarnu Activity sa lifecycle signalom i asinhroni UIpost+5srok.
@Test90s i gradle180s sprečavaju neograničeno čekanje. Logcat i JUnitreport
se čuvaju kao artifact na uspjeh/neuspjeh. Ne preskakati Explorer provjeru
radi zelenog CI-ja; prvo dobiti konkretan rezultat/zapis i popraviti uzrok.

CI37342337991/37342809445: kompletan proizvodni bootstrap, 3D prije GPS-a,
stvarni onP i <3px DOMprojekcija potvrđeni kroz test. Evaluacija koja vraća
Leaflet marker ili map pokušava serijalizirati cijeli ciklični graf aplikacije
i Playwright javlja uništen executioncontext; mutirajuće testne evaluacije
sada završavaju void0. Kontrolne boolean/JSON evaluacije ostaju iste, nema
olabavljenja niti izmjena proizvodnog GPS koda. Native marker eval isto void0.

CI37343121439/job111874916980:92JS/SQL/23browser/build/53assetSHA prošli.
Native faza nije pokrenula testove: emulator-runner izvršava svaku script
liniju u zasebnom sh procesu, pa cd android nije preživio i gradle je prijavio
repo root bez settings.gradle. Popravka: jedan bash tests/android/explorer-offline.sh
sa gradle -p android, istim offline uslovom, timeout180s i logcat artefaktom.
Za stvarni WebView test izabran API34/google_apis (Android14/moderna JS podrška);
novi test uslovno odobrava POST_NOTIFICATIONS na33+. Produkcija/minSDK/GPS
nije mijenjana. Nema dokaza da API29 engine uzrokuje bug; ovo je izbor
reprezentativnije platforme za trenutne telefone. APK još nije objavljen.

CI37344207039/job111878587027:92JS/SQL/23browser/Androidbuild/53SHA prošli.
Android14/WebView113.0.5672.136: Explorer test istekao na prvoj JS evaluaciji
dok se APK stranica još učitavala (RESUMED16:59:35.7, test fail42.0, prvi
paint8.62s/console SW47.2). OCR offline prošao. Uveden native getProgress==100
+ tačan APK URL signal (rok30s) prije JS evaluacije, bez zamjene proizvodnog
WebViewClient/assetLoader-a. JS uslovi/5s callback/90s ukupno ostaju.
Diag artifact11360436331 sadrži stvarni logcat i JUnit2test/1failure/0skipped.
APK nije objavljen prije uspješne Explorer instrumentacije.

## 52. Višesatni teren i boja Preglednika — 2.4.0 / code510

Zahtjev: pet sati naizmjeničnih vlaka i rada u aplikaciji, od toga sat
doznake, uz nestajanje mobilnih podataka; zatim nova verzija za ažuriranje
u aplikaciji i žućkast donji dio Preglednika oznaka.

Native dopuna vlake je obrađivala cijeli bafer bez predaha za UI. Sada
svakih 16 fikseva vraća event loop i provjerava nalog/sesiju/aktivnu vlaku.
Promjena tokom predaha prekida prolaz bez potvrde journala. Trajni upis,
GPS filteri, historijske pauze i ručno slanje ostaju autoritet.

Doznaka je za svaku dopunjenu tačku crtala statistiku i dva puna prolaza
visinskog profila. Prikaz sada spaja pozive u jedan animation frame,
preskače skriven dokument/profil; računica uspona obrađuje samo nove visine.
Nova ili skraćena serija resetuje memo. Originalne visine i izvozi ostaju puni.
Regresija sa 1800 fikseva: 1 canvas crtanje umjesto 1799, bez gubitka tačaka.

Novi field-five-hours.test.js simulira četiri puta 30 min vlake i 30 min
čitanja/računica, zatim 60 min doznake sa pauzom i slabim GPS-om. 3600
fikseva vlake ->3564 prihvaćena; 1800 fikseva doznake ->1723 prihvaćena.
Nema automatskih serverskih upisa. To je Node sa kontrolisanom pohranom,
GPS-om i Leafletom, nije mjerenje baterije ni pravog telefona.
Četiri nove regresije padaju na prethodnom kodu. Test panela tragova je
normalizovao CRLF pri čitanju izvora (Windows fixture je tražio samo LF).

Novi browser field-five-hours.py izvršava puni proizvodni bootstrap,
stvarni Leaflet/Canvas i IndexedDB uz CPU4x, kontrolisane GPS vremenske
oznake i blokirane vanjske zahtjeve. Dodan u CI prije objave APK-a.
CPU4x nije emulacija konkretnog Redmi modela; pet sati vremenskih oznaka
nije pet sati stvarnog rada. CI/browser/Android rezultat treba dopisati
poslije izvršenja. Lokalni browser launch odbijen spawn EPERM; nije prošao.
ADB nema povezanog telefona. Baterija, zagrijavanje i Xiaomi OEM ubijanje
procesa nisu potvrđeni. Produkcijski Supabase nije mijenjan.

Preglednik dobiva zasebnu folder sekciju: topla žuta #f3dfa2, svijetle
kartice, tamna slova i dugmad najmanje44px. Pretraga, kategorije, grupne
radnje, uređivanje i paginacija koriste iste postojeće identitete/pozive.
Oba prikaza (dnevni/tamni) zadržavaju istu boju foldera.


## 2026-10-05 — Explorer 2.3.9 završen i APK potvrđen

CI37345450553/job111882751205 završen SUCCESS. Objavljeni izvor
a8168b2d9e887b91d1956d6fb40cde3d27ab24a9. Prošli92JS grupe, testna
PostgreSQL migracija/RLS,23browser provjere (uključuje kompletan stvarni
JS bootstrap sa onP), Android build,53webassetSHA i oba Android testa.
Native report: Android14/API34, WebView113.0.5672.136,2tests/0failures/
0errors/0skipped. Explorer13.777s, OCR0.104s. Cijeli APK/proizvodni
MainActivity/WebView/DOM/JS; kontrolisan authUI/GPS/kompas, mreža isključena.
Provjereni početni3D bez GPS-a, svježi onP/oznaka/udaljenost, stvarni
DOMmarker naspram projekcije <3px, dialogpause/resume, checkbox i stop,
neizmijenjeni vlake/tačke/tragovi registri. Native progress je prešao100
u17:08:15.595 prije JS; nema preskočenih testova ni oslabljenih uslova.
36 analiza brzine prošle u CI-ju; nisu fizička mjerenja Redmi telefona.

Preuzet stvarni CI APK i poređen sa javnim release assetom v2.3.9:
https://github.com/pogonboskrupa/US-SUME/releases/download/v2.3.9/app-debug.apk
24,008,156B (24.01MB), SHA256
1cf52ce2f1361ef6f2ccba1a525702ccd2fd000d4b7d100f677aa27b9f8785c9.
Paket ba.spd.uss.vlake.debug;2.3.9-debug/code509. CertSHA256 identičan238:
11fcd020c703053324ae26baf7a8207373711341f503277a90ec08a8468f286d.
53assets identični remote izvoru, GRANICE>10MB očuvan, bez offlineOCRmodela,
15launcherPNG identični238. Lokalni verify_apk_239.py i verify_native_239.py
prošli; release veličina/digest/commit odgovaraju preuzetom APK-u. Artifact
APK11360766710, Android11360412163, UI11360118443, teren11359948802.
Potpis/paket omogućuju ažuriranje postojeće debug aplikacije kroz Meni.

Popravljen stvarni blokator: zatvoren dlg-sheet je display:block ali izvan
viewporta; stari shown ga je smatrao otvorenim i gasio perspektivu. Sada
se provjerava vidljivi pravougaonik, završetak transform animacije i novi
dialog. Kamera se uključuje bez GPS-a bez lažnih metrika; resize osvježava
depth/transform/anchor revision. 48° nagnuta Leaflet karta, bez DEMmesha
i bez novih runtime biblioteka. Explorer samo tokom vođenja do cilja,
checkbox izbor pamćen. Fizički Xiaomi/GPU/senzori nisu testirani.
Supabase trial SQL status ostaje kao238: pripremljen/testiran, nije
primijenjen na produkciji; ovaj zadatak ne mijenja serverska pravila.

## 2026-10-06 — v2.4.0 / code510: prvi uvoz velikih SQLite karata

Korisnik je precizirao: oko 40 s traje PRVI uvoz .sqlitedb/.db od 1,5 GB.
Stari sqlmapLoadFile prvo je čekao kompletnu OPFS kopiju, zatim otvarao
SQLite i računao dodatnu dijagnostiku. Novi tok čita potrebne SQLite
stranice iz izvornog File objekta i prikazuje sloj prije završetka kopije.
Posebni offline-import.js worker kopira u blokovima od 4 MB, odvojeno od
workera za pločice. Banner prikazuje napredak i traži da app ostane otvoren.
Prikaz nije potvrda trajnosti: saved postaje true tek nakon zatvaranja,
provjere veličine OPFS fajla i uspješne IDB transakcije. Završetak čuvanja
ne mijenja podlogu koju je korisnik u međuvremenu odabrao.

Zamjena koristi jedinstveni fizički naziv: prethodni IDB zapis i prethodna
kopija ostaju dok nova kopija nije potvrđena. OPFS naziv je u metapodacima
i zadnjem izboru; restore, preimenovanje i brisanje koriste taj naziv.
Prekid/brisanjem tokom uvoza zaustavlja se copy worker, čeka čišćenje i
sprečava naknadno objavljivanje obrisane karte. Greška kvote ostavlja
trenutni izvorni prikaz samo za sesiju i čuva ranije sačuvanu kopiju.
Fajl se ne učitava cijeli u RAM. Manje karte zadržavaju postojeći SQL.js tok.
Ovo skraćuje čekanje na PRIKAZ; ne uklanja fizičko kopiranje 1,5 GB.

Lokalno: sintaksa svih inline blokova i modula; postojeće 92 JS grupe i
nova offline-import grupa (7 scenarija) prošle. Novi CI test koristi
stvarni proizvodni bootstrap/Leaflet/worker/OPFS/IDB i sintetičku RMaps
bazu proširenu nultim bajtovima do 1.500.000.000 B. Mjeri prvi sloj,
vidljivu pločicu, cijelu kopiju i offline ponovno otvaranje; nije fizički
Redmi benchmark niti velika baza s mnogo različitih pločica. Dodatni
Android test koristi stvarni APK/MainActivity/WebView bez interneta,
21 MB File iz iste male testne baze i ponovo učitava stranicu iz APK-a.
CI, APK i izmjerena vremena još nisu potvrđeni; dopuniti poslije provjere.


## 54. Usklađen Preglednik oznaka — 2.4.1 / code511

Korisnik je primijenio probni SQL, zatim zatražio manji kontrast između
gornjeg i donjeg dijela Preglednika. Primjena SQL-a je korisnikova potvrda,
nije nezavisna produkcijska provjera.

CSS dobiva lokalnu, jedinstvenu toplu paletu: tamni maslinasto/sivi panel
#282e25 i donji dio #33382b; dnevni krem panel #f6f3e9 i pješčani #eee7d3.
Kartice, filteri, oznake i fokus prate tu paletu. Nema jarke žute površine
uz tamnoplavo zaglavlje. Tekst ostaje kontrastan. Funkcije Preglednika
nisu mijenjane. Postojeći browser test prati paletu oba režima.

Objavljeni v2.4.0 u međuvremenu cilja f1c3dff, koji donosi offline uvoz
karata sa zasebnim workerom i Android provjerom. Njegove promjene su
usklađene u CODEX-US-SUME sa sačuvanim terenskim doradama c4482b2; nijedna
druga grana nije mijenjana. CI izvršava i field-five-hours i offline-import.
SQL/produkcijski server nisu mijenjani ovom doradom; potvrđeni nalaz429
ostaje zaseban zadatak. CI i APK objavu dopuniti rezultatom nakon završetka.


## 55. Brži prvi prikaz i završetak otvaranja karte — 2.4.2 / code512

Novi zahtjev tokom builda 2.4.1: karta djeluje sporije i prikazuje dug
pozadinski uvoz. sqlmapLoadFile je čekao cijeli _sqlImportSave iako je
sloj već dodan; birač/batch je zato ostao u fazi otvaranja. Sada vraća
kontrolu poslije otvaranja, dok zaseban job pouzdano objavljuje kopiju.
Traka jasno kaže da je karta otvorena i da sprema kopiju za naredni start.

MiniSqlite worker koristi FileReaderSync za male SQLite stranice iz File-a,
uz postojeći async fallback i OPFS sync put. Posebni copier koristi 16MB
blokove preko FileReaderSync, a bez podrške ostaje na 4MB async blokovima.
Provjerava tačan broj pročitanih bajtova. Ne učitava cijelu kartu u RAM.
Obje operacije i dalje rade izvan UI niti. Nalog/podaci GPS nisu dirani.

Regresije: stvarni MBTiles/RMaps fajlovi pročitani sync putem bez async
poziva; 21MB copier čita dva ograničena bloka i čuva sve bajtove; Android
WebView i 1,5GB browser test traže da se otvaranje završi PRIJE završetka
zadržane kopije. Copy/quota/cancel/atomic publish provjere ostaju.
Mjerenja CI treba dopisati. Brzina nije potvrđena na fizičkom Xiaomiju;
punih 1,5GB mora biti kopirano prije trajnog ponovnog otvaranja.

Dodatna provjera miješanih verzija: stvarne izdvojene funkcije slanja iz
2.3.8, objavljene2.4.0 i radne2.4.2, zajednički lažni Supabase, ukupno6vlaka
+615GPS tačaka; sve potvrđeno bez duplikata. To nije test tri APK-a ni
produkcijskog RLS-a. Članstvo projekta vlaka i članstvo odjela doznake su
odvojene tabele; recentni odobreni članovi ne trebaju identične verzije.
Stariji APK bez probnog AccessPolicy može lokalno blokirati neodobrenog
korisnika iako server daje probni rok; takav APK treba ažurirati.


## 56. ŠPD i administratorski Teren — 2.4.3 / code513

Korisnik je proširio zadatak: značajno unaprijediti Teren za ŠPD US ŠUME,
a adminu zamijeniti Obavještenja tabom Teren. Uklonjeni su tab i Meni
prečica Obavještenja; stari tab odabir postavke vodi na Teren. Admin vidi
Teren i može koristiti lične tačke, fotografije, tragove i mjerenja.
Projektna prava/RLS nisu proširena. Ostali projektantski tabovi zadržavaju
postojeće uslove; role UI je i dalje deterministički nakon promjene profila.

Teren dobiva lokalni radni pregled GPS svježine, podloge i snimanja,
sekcijsku navigaciju, GPS/kopiranje uz koordinatnu karticu, veće kontrole,
pretragu svih vrsta zapisa i paginaciju20. Stvarni indeks tačke se čuva
nakon sortiranja/pretrage. Novo imenovano zapažanje hvata poziciju i nalog
PRIJE dijaloga, ponovo provjerava nalog prije spremanja i koristi postojeći
lokalni _createTacka. Ugrađene prečice dužina/površina koriste postojeće
mjerenje. Kartice/tekst prate Dnevni mod. Novi JS/CSS su u SW i APK manifestu.

Nema novih serverskih poziva ni automatskog dijeljenja/slanja. Dashboard
radi lagano na GPS renderu i postojećem5s otkucaju; nema novog intervala.
Paginacija/pretraga ne mijenjaju originalne nizove. Testovi provjeravaju
identitet, paginaciju, promjenu naloga tokom zapažanja i stari GPS.
Novi puni browser test: ŠPD/admin/projektant,320/390/800px, oba moda,
imenovana tačka, površina, bez vanjskih upisa. CI rezultat tek dopisati.


## 57. Završna vizuelna provjera Terena — 2.4.4 / code514

Korisnik je ponovo odobrio objavu nakon odbijenog GitHub update_ref poziva.
0901b4ef je objavljen na CODEX-US-SUME; CI37495958703 potvrđuje95JS,
PostgreSQL i sve browser provjere, uključujući puni Teren. Prvi vizuelni
pregled PNG-a pokazao je slab kontrast zelenog/žutog GPS teksta u dnevnom
modu. Tamnije boje prate iste pragove kvalitetâ, a bar ostaje indikator.
Naslov glasi Pregled terenskog rada umjesto poruke Spremno sa nepoznatim
GPS-om/podlogom. Browser provjerava kontrast teksta>=4.5 za6/18/40m i čeka
kraj poruke potvrde prije screenshots. Potrebni završni CI/APK rezultat
ovog izdanja dopisati nakon završetka. Produkcijski server nije mijenjan.


## 58. Završena objava 2.4.4 — 2026-10-06

Korisnik je izričito ponovio odobrenje nakon drugog odbijenog update_ref.
CODEX-US-SUME i release v2.4.4 ciljaju b38e3ffc98519ab5b6a3519ca5c3dc9c1173778a.
CI37503395807 je success:95JS, PostgreSQL/RLS, browser Teren/role/kontrast,
petosatni ubrzani teren,1.5GB offline import, ostali browser testovi,
APK SHA assets i Android instrumentacija3testa/0failure/0error.
Vizuelno pregledani dnevni390px i adminski tamni320px PNG: neutralan naslov,
tamniji čitljiv GPS tekst/statusi, Teren umjesto Obavještenja.

APK code514/versionName2.4.4-debug, ba.spd.uss.vlake.debug,24,037,000B.
SHA2564000d9c410cd9ef3750a74f99dec6205cf1efb43a11404d2d0b5330e5c8ec46e.
CertSHA25611fcd020c703053324ae26baf7a8207373711341f503277a90ec08a8468f286d.
Preuzeti APK dodatno provjeren:56Git blobova odgovara commit-u, GRANICE očuvan.
Updaterski releases?per_page=1 vraća v2.4.4, draftfalse/prereleasetrue.

Finalna 1.5GB sintetička karta: sloj81ms, prva pločica116ms, puna kopija10742ms,
offline restart356ms; kopija tačne veličine, sigurno brisanje tokom uvoza.
Pet sati ubrzanih oznaka CPU4x:3564vlaka/1723doznaka, IDB vraća1723/1723,
p95vlaka1.2ms/doznaka4.6ms, najveći prelazak taba102.9ms,0vanjskih upisa.
Ovo nije pet sati baterije/termike niti fizičko mjerenje Xiaomija. ADB nema uređaja.
Produkcijski Supabase nije dodatno provjeravan/mijenjan; nalaz429 ostaje zaseban.
Ovaj završni zapis je sačuvan lokalno poslije objave, bez nove CI/objave istog APK-a.


## 59. Uklonjeni Vozilo i Tvoj obilazak iz Terena — 2.4.5 / code515

Po izričitom zahtjevu korisnika uklonjene su obje kartice iz Terena za ŠPD
 i admina: Vozilo i cijeli gornji Tvoj obilazak (statusi/prečice). Tab sada
počinje karticom pozicije. Uklonjeno je osvježavanje nepostojećih statusa
iz terrain-workspace modula i nepotrebni poziv rendera kartice vozila.
Postojeća korisnička tačka imena Vozilo ostaje obična sačuvana tačka;
zahtjev uklanja UI opciju, ne briše terenske podatke.
Postojeći browser test potvrđuje odsustvo oba bloka i poziciju prve
kartice za oba profila. Snimanje traga, GPS, kompas, pretraga, imenovana
zapažanja i mjerenja ostaju funkcionalni. Nema serverskih promjena.
CI uspješan: https://github.com/pogonboskrupa/US-SUME/actions/runs/37508515822
Commit: 68089fd927c220818ed6023a113f8a80ad924de1; izmjene samo CODEX-US-SUME.
Browser provjere oba profila i oba načina boja prolaze; slike 390 px ŠPD
i 320 px admin pregledane, prva kartica je pozicija, bez oba uklonjena bloka.
Android XML: 3 testa, 0 grešaka/padova. APK assets: svih 56 Git blobova
odgovara ovom commit-u, GRANICE.kml očuvan. Paket ba.spd.uss.vlake.debug,
versionName 2.4.5-debug / versionCode515, potpis identičan ranijim izdanjima.
APK 24.032.876 B; SHA256:
0841ac4324466c09bae17daf80ddf2f9d39924631db1abec13202f2f97104468
Release https://github.com/pogonboskrupa/US-SUME/releases/tag/v2.4.5
Updaterski /releases?per_page=1 potvrđuje v2.4.5 i app-debug.apk.
Lokalni izlaz: outputs/app-debug-2.4.5.apk; slike Teren-dnevni-2.4.5.png
i Teren-admin-2.4.5.png. Završni zapis je lokalno dopisan poslije objave.

## 60. Detaljniji ŠPD korisnički profil — 2.4.6 / code516

Zahtjev korisnika obuhvaćen ličnim ŠPD profilom iz Menija i zaglavlja Terena.
Meni dobiva ŠPD prečice za profil, Teren i Moje zapise; naziv konteksta po ulozi.
ŠPD Meni skriva Upravljanje projektima i projektnu provjeru Spremno za teren,
jer taj profil nema projekat za tu provjeru; kopija zapisa dostupna je u novom
profilu. Elementi se ponovo prikazuju po promjeni na druge uloge.
Profil prikazuje identitet, dostupni pristup ili tačan probni rok, brojeve tačaka,
tragova, mjerenja i fotografija na telefonu, aktivnu lokalnu kartu i status kopije,
broj projekata učitanih šifrom, GPS/vezu/snimanje/dijeljenje i red slanja.
Prečice vode u tačne postojeće liste (pretraga resetovana), fotografije koriste
Preglednik oznaka sa filterom Fotografije. Tu su Dnevni mod, postojeći izvoz
_exportFieldRecovery za sigurnosnu kopiju zapisa, PIN, ažuriranje i ŠPD upute.
Kopija nema raster karte; nije obećana provjera pokrivenosti lokalne karte.

Novi spd-profile.js/css su u SW i required Android assets. Nema novog timera,
automatskog GPS/snimanja/dijeljenja ili mrežnog upita. Pregled je vremenski označen
i ručno se osvježava; prati online/offline i povratak u aplikaciju. Status pristupa
koristi postojeći AccessPolicy. Profil je samo za trenutni odobreni/probni ŠPD nalog;
promjena korisnika, uloge, odjava ili istek probnog roka zatvara i čisti prikaz.
Modal ima trap fokusa/Escape i inert pozadinu. Učitani projekti u Terenu prate
boje oba moda, duža imena se lome, prazna lista daje jasnu uputu. Uklonjeni Vozilo
i Tvoj obilazak nisu vraćeni. Projektna prava/produkcijski Supabase nisu mijenjani.

Lokalno 96 JS skupova prolazi; svih 5 inline JS blokova sintaktički ispravno.
Puni browser test prolazi na lokalnom Edge-u, s lažnim serverom: ŠPD/admin/projektant,
320/390/800px, oba moda, profil/rok/pripadnost nalogu, prečice, pretraga i mjerenje;
0 vanjskih upisa. Slike profila dnevni390/tamni320 i postavke vizuelno pregledane.
CI i APK rezultat dopisati nakon objave. Fizički Redmi nije testiran.


## 2026-10-07 — Preglednik oznaka: mirniji kontrast — 2.4.7 / code517

Korisnik traži ujednačen dizajn tamnog zaglavlja i žućkastog donjeg pregleda.
Osnova je posljednja objavljena2.4.6, commit90979eed, CODEX-US-SUME.
Paleta je lokalno ograničena na preglednik: bliske sivozelene površine,
neutralni folderi, prigušene oznake KML/fotografija/GPS/servera. Donja
ml-folder-area prati istu paletu uz blažu razliku kartica i grupnih redova.
Dnevni mod ima svijetlu paletu. Kategorije se prelamaju bez bočnog skrola,
kontrole najmanje44px, vidljiv fokus, Na karti blago istaknuto.
KML editor nasljeđuje paletu samo unutar preglednika. Normalni/sekundarni
tekst najmanje5.06:1u tamnom i4.93:1u dnevnom modu.

Promjena samo CSS/prezentacijski markup (data-category i SVG folder),
bez promjene modela, slanja, čuvanja ili geometrije.2.4.7/code517 na3mjesta.
Lokalni browser preglednik prošao8kombinacija320/390/568/800px i day/dark
sa grupnim radnjama preko paginacije, sortiranjem, foto i KML editorom.
Sintaksa5inlineblokova OK. APK/CI rezultat dopisati nakon objave.

Prvi rad je počeo iz prethodne radne grane CODEX-US-SUME-2026-10-01
i pripremio2.4.1, prije nego je završna provjera otkrila noviji CODEX-US-SUME
sa2.4.6. Ispravljeno: dizajn prenesen na aktualni kod bez gubitka novijih
izmjena. Raniji release2.4.1 treba vratiti na izvorni APK iz uspješnogCI37485155170
i izvorni target/bodya2e668618a365574134bbf56085caa8e18637bb9.
Ne koristiti novi dizajn u tom starom izdanju; konačna objava je2.4.7.

CI37574648644 je zaustavljen jer field-five-hours.py hardkodira stare
žute nijanse. Provjera ažurirana na novu neutralnu paletu bez slabljenja
GPS/IDB/bez-upisa uslova; lokalni puni5h/CPU4x test prolazi.
Izvorni2.4.1 APK iz CI-ja preuzet i potvrđen SHA256da312d1447061f7799fccfe1840f0044edbebc0f3216fbeb39b5456cf8a6beb7.
Direktni binary upload kroz cloud proxy vraća Bad Content-Length; metadata
ranije objave vraćena, asset čeka obnovu. Jednokratni korak u CI-ju
preuzima originalni artifact i provjerava tačanSHA prije upload-a;
ukloniti poslije uspješne obnove. Produkcijski Supabase nije mijenjan.


Obnova starog2.4.1 završena u CI37574969641 prije JS testova.
GitHub release dodatno provjeren: targeta2e668618a365574134bbf56085caa8e18637bb9,
app-debug.apk24,021,344B i digestda312d1447061f7799fccfe1840f0044edbebc0f3216fbeb39b5456cf8a6beb7
identični originalnomartifactu. Jednokratni workflow korak i actions:read
scope uklonjeni; workflow vraćen identično prethodnoj2.4.6 verziji.
Cleanup commit[skipci] ne mijenja aplikacijske resurse ni verziju;
izrada2.4.7 iz cbacaf577b721449aedc89417e09c5b2ae99b0c1 nastavlja.


## Završena objava Preglednika — 2.4.7, 2026-10-07

CI37574969641 izcbacaf577b721449aedc89417e09c5b2ae99b0c1:96JS grupa,
PostgreSQL/RLS testna baza, sve browser provjere (uključuju novi izgled
i puni5h/CPU4x teren), APK build i58assetSHA provjera prošli.
Android14/API34, stvarni MainActivity/WebView,3testa/0grešaka/0preskočenih:
Explorer21.566s, offlineSQLite11.546s, OCRoffline0.234s.
Job je FAILED samo na kreiranju Release-a403 Resource not accessible by
integration: tag bi pokazivao commit sa privremenim workflow korakom.
Release kreiran na očišćenom stablud012440625d9b6f12b95c3df30f2ee4cbddbfa80,
sa istim aplikacijskim resursima; sourceAPK ostaje cbacaf577b721449aedc89417e09c5b2ae99b0c1.
Objava već provjerenog APK-a završena zasebnimCI37576008962SUCCESS.
Jednokratni publish job/input uklonjeni; workflow opet identičan2.4.6.

JavniAPKpreuzet i identičan artefaktu:24,055,016B (~24.06MB),
SHA2563b00b46a7eed60fa44c7ebe1a2ba815aeb45654f135eb4e0456a57ba9f26fd0c.
Paketba.spd.uss.vlake.debug,2.4.7-debug/code517, certSHA256
11fcd020c703053324ae26baf7a8207373711341f503277a90ec08a8468f286d.
Sva58webasseta identična2.4.6 osim index/sw/novogCSS/JS preglednika.
15launcherPNG i GRANICE>10MB očuvani, nema offlineOCRmodela.
Updaterski /releases?per_page=1 potvrđuje v2.4.7/app-debug.apk.
https://github.com/pogonboskrupa/US-SUME/releases/download/v2.4.7/app-debug.apk
Fizički Xiaomi nije testiran; produkcijski Supabase nije mijenjan.
Aktualni worktree /workspace/US-SUME-current, grana CODEX-US-SUME.
Stariji /workspace/US-SUME je sačuvan sa njegovim nepoznatim/untracked
fajlovima i starom granom; naredni rad početi od aktualnog worktree-a
i provjeriti najnoviji Release i branch ref PRIJE izbora verzije.

## Detaljan pregled Servera — 2026-10-07, aplikacija ostaje 2.4.7

Novi zahtjev: provjeriti slanje/prijem, naročito nove korisnike; prijavljeni
SocketException i `new row violates row-level security policy for table
"projekt_clanovi"`. Ovo je pregled, ne aplikacijska/produkcijska popravka.
Nalazi: docs/PREGLED_SERVERA_2026-10-07.md. Remote CODEX-US-SUME decd0e8 i
lokalni HEAD imali su isti tree192a51af prije pregleda; najnoviji Release2.4.7.

Reproducirano: confirmDodajClanove ne provjerava _pendingSync i neposlani
projekat dobiva isti42501; nakon INSERT-a projekta isti član prolazi.
sbLoadProjekti zanemaruje greške članstva/dijeljenih projekata, zamjenjuje
keš, deaktivira aktivni dijeljeni projekat i _kvcPurgeStale briše kolegine
vlake iz lokalnog keša. serverPreuzmiDijeljeno dopušta _cachedStub i prazan
RLS SELECT tumači kao uspješnu nultu listu, bez potvrde serverskog pristupa.
Catch prijema vraća samo ok:false; pojedinačni GPS fallback prešuti42501
u error:null iako tačke ostaju u baferu. Ovo nisu riješeni bugovi.

SQL test sa stvarnim politikama20260713 + restrictive je_odobren i
migracijom20261005: važeći probni vlasnik/član radi, neposlani/tuđi projekt
odbija članstvo; vraćen stari gate blokira probnog korisnika i SELECT
vraća[]; istekao član također dobiva[]. §54 već bilježi korisnikovu potvrdu
probnog SQL-a; stanje produkcijske funkcije nije nezavisno provjereno.
Ne pokretati staru konsolidovanu migraciju naslijepo:20260713 briše
naknadne restrictive politike;20260727 vraća stari gate i grandfathering.

Supabase koristi WebView fetch/reliableFetch. Eksplicitni Java tretman
SocketException je u GitHub APK updateru, ne projektnoj sinhronizaciji;
bez loga/tačnog ekrana ne zaključivati koji se prenos prekinuo.

Isporučeno: read-only supabase/dijagnostika_server_20261007.sql (pravila,
funkcije, triggeri, brojevi novih naloga bez e-maila/tajni),
tests/audit/server-247.cjs (7 namjernih reprodukcija postojećih problema,
izvan regresijskog tests/js skupa), tests/sql/server-clanstvo-247.sql
(isključivo prazna lokalna baza; uvozi stari probni fixture).
14 relevantnih postojećihJS grupa prošlo; oba PostgreSQL fixturea
prošla u izolovanomPG16 containeru bez mreže; dijagnostika radi i bez
probni_do kolone. Browser server-confirm-234 prošao sa stvarnim Supabase
klijentom i kontrolisanimHTTP, UI_CHROMIUM=/usr/bin/chromium.
Fizički Xiaomi/mobilni signal/produkcijski Supabase nisu provjereni.
Nema izmjene runtimea, verzije, workflowa, releasea ili produkcijskih podataka.

### Dopuna: SQL ispis dostavljen od korisnika, 2026-10-07

Korisnik dostavio svih8 projektnih/doznaka politika i4 definicije:
je_odobren, je_clan_projekta, je_doz_clan, korisnici_probni_rok_zastita.
Prikazane politike odgovaraju očekivanim pravilima i imaju restrictive
zzz_odobren. Gate već prihvata važeći probni_do uz prvo_odobren_at IS NULL;
članstvo prepoznaje vlasnika/kreatora i članove, trigger-funkcija odgovara
migraciji. Hipoteza starog gatea ovim ispisom nije potvrđena. Nije potrebna
izmjena prikazanih funkcija ili politika na osnovu dostupnih rezultata.
Ovo nije nezavisno izvršen produkcijski test niti provjera profilnih
redova, aktivnog probnog triggera, ciljanog projekta/vlasnika ili JWT
identiteta pri grešci. Ne proglašavati sedmodnevni pristup svakog naloga
provjerenim i ne tvrditi da je aplikacijski pending-project bug dokazano
uzrok korisnikovog incidenta bez tog konteksta. Aplikacija ostaje2.4.7.

Naknadni profilni SELECT iz SQL Editora: svih20 prikazanih naloga trenutno
odobren=true, probni_do=null, prvo_odobren_at upisan. NULL roka nije
problem kod odobrenih; gate dopušta pristup tim profilima kada je JWT
identitet odgovarajući. Nema osnove za SQL izmjenu probnog roka/odobrenja
iz ovog ispisa. Nisu poznati pogođeni nalog/projekat/korak ni stanje u
trenutku ranije greške; zatraženo jedno pojašnjenje (ime, odjel/projekat,
dodavanje/predaja ili Pošalji i primi). Nastaviti provjerom ciljane sesije
i server-projekta/vlasnika, ne tražiti ponovo iste funkcije/profilni spisak.
Dokumentovati samo zbirni nalaz; imena i redovi korisnika nisu potrebni
u repozitoriju. SQL/runtime/Release nisu mijenjani.

Korisnik zatim identificirao pogođeni nalog i potvrđuje: projekat
vjerovatno nije bio poslan i vlaka je već bila napravljena; sada sve radi.
Aktivni incident smatra se prestalim prema toj potvrdi, bez nezavisnog
dokaza izvorne sesije/server-logova. To odgovara reproduciranom pending
projektnom toku; ne tražiti dalje iste SQL rezultate niti uvoditi SQL
izmjene. Snimanje vlake prije slanja je normalan podržani offline rad;
članstvo zahtijeva prethodno potvrđen serverski projekat. Nedostajuća
_pendingSync zaštita dodavanja kolege ostaje neimplementirana popravka.
Ovim pregledom runtime nije mijenjan; APK ostaje2.4.7.

## 2026-10-07 — ponovno ubrzanje SQLite karata / v2.4.8 (518)

Aktuelni zadatak je isključivo sporo učitavanje SQLiteDB/MBTiles. Server incident je korisnik potvrdio kao riješen; nisu mijenjani server ni produkcijski SQL. Detalji i mjerljivi troškovi: `docs/UCITAVANJE_SQLITE_2026-10-07.md`.

MiniSqlite pretražuje ključeve binarno bez nepotrebnih BLOB-ova i zaustavlja skeniranje na pronađenoj pločici. APK ima zaseban read-only SAF/Android SQLite tok (`OfflineMaps.java`, `native-offline-maps.js`); source fajl ostaje na izabranom mjestu, a Android pamti read dozvolu. Samo izvori bez direktnog pristupa koriste privatnu kopiju. Legacy OPFS/IDB restore ostaje. Nova baza se validira prije zamjene stare; remove briše referencu/kopiju, nikada original. Verzije web/SW/Android su 2.4.8/518. Lokalno 98 JS grupa i relevantni stvarni browser testovi prolaze; native instrumentation/build u CI su sljedeća obavezna provjera prije isporuke.

Android test je dokazao da /proc/self/fd SQLite otvor vodi nazad na nedostupnu privatnu provider putanju i tada je prvi pristup kopirao fajl. Seekable zaštićeni dokumenti sada se čitaju preko istog FD-a i read-only SQL.js VFS-a (vendor dodatak `openReadOnlyFile`, `sql-document.js`, Os.pread binarni blokovi), bez kopije i uz 4 MB LRU. Pokriva normalizovani MBTiles, za razliku od MiniSqlite ograničenja na tiles tabele. Pri zamjeni se nova baza prvo otvara pod privremenim nazivom, validira i tek zatim aktivira. Native cilj testa bez kopije ostaje obavezan, nije ublažen. Lokalna nova VFS provjera čita 64 KB za 1,5 GB probnu bazu i oko 1,43 MB za zadnju pločicu normalizovane 34 MB baze; readonly upis odbijen.

Završeno i objavljeno v2.4.8/518: CI 37598268848 na source 0dae134b79a2c14a3c3df434b735062fbd2d65bb success; 99 JS grupa, puni browser skup, 4 Android offline testa (0 grešaka). Native 1,5 GB content:// proba otvorena za 3.070 ms bez kopije, normalizovani MBTiles/rename/reload/neispravna zamjena/pipe/original svi potvrđeni. Kontrolisani URI/grant i sintetički fajlovi; fizički Xiaomi nije testiran. APK 24.083.687 B, SHA-256 6dd857625a5079bae0afd870045414ea53d2ab93e732ad27272e1695a0874f70, isti debug cert, 60 assets provjereno. Detalji u izvještaju. Ponovo izabrati original kroz Učitaj kartu za novi direktni FD tok; stari OPFS importi ostaju. Završna dokumentacija ne mijenja APK ni zahtijeva ponovno izvršavanje punog CI-ja.

## 2026-10-07 — v2.4.9: razumljive upute za Vlake i Doznaku

- Korisnik traži jednostavne upute s naglaskom na vlake i doznaku. Ugrađeni
  help-modal je prepisan prema stvarnim kontrolama; brzi početak je odmah
  vidljiv, dodatne teme se proširuju. Dodane lokalne SVG sheme krakova i
  četiri projektanta po izohipsama. Upute ne traže mrežu.
- Ispravljeni zastarjeli nazivi i suprotni opisi povratka s kraka. Razlikuju
  procjenu pokrivenosti od stvarno završene doznake, ukupnu širinu bafera od
  vanjskog ruba, QR lokalni pregled od servera, odjel doznake od aktivnog
  projekta vlaka i lokalno spremanje od potvrđenog slanja.
- Izgled u postojećem field-design.css: 14 px tekst/koraci, dnevni i tamni
  mod, teme kao dugmad s aria-expanded, promjena taba vraća skrol. Nema
  promjena GPS/pohrane/servera/geometrije.
- Lokalno prošlo 99 JS grupa, 5 inline sintaksnih provjera, simulacija šest
  dana i prošireni project-vlake-220.py (svi help tabovi, tastatura, mali
  ekrani, offline pristup). Dokument: UPUTE_KORISTENJE_2026-10-07.md.
- Web/SW/Android 2.4.9, versionCode 519. CI 37602046578 uspješan (99 JS
  grupa, svi browser testovi, probni SQL/RLS, 4 Android 14 instrumentacijska
  testa bez padova). Izvor e8e778afe22360c3513e56f53bf59532dc3194a8.
- APK v2.4.9 objavljen za postojeći in-app updater; provjeren paket
  ba.spd.uss.vlake.debug, 2.4.9-debug/519, stabilni certifikat i svih 60
  assets hashova. Veličina 24.071.423 B, SHA256
  59a588d1450218b6df925d6ac462ca6e546a222b1173bfb08c35dc26ea6d255d.
  Link: https://github.com/pogonboskrupa/US-SUME/releases/download/v2.4.9/app-debug.apk
  Fizički Xiaomi/produkcijski Supabase nisu testirani; poslovni tokovi nisu
  mijenjani ovim zadatkom.

## 2026-10-07 — v2.5.0 (520): Skini kartu / Unsko_2021-2031

- Korisnik daje Drive folder 16oB-Fu0oZLd7gH45O25UhsnGK5cp525_ i traži
  opciju Skini kartu u Učitaj kartu. Read-only Drive listanje identificira
  jedini fajl „Karta Unsko”, ID 1rVmI9heO_Y8eV-IrGkcGH3ajhEIZ-Kny,
  1.567.670.272 B; anyone/reader dozvola. Nisu mijenjani naziv/dozvole/fajl
  na Driveu. Naziv kartice u aplikaciji je Unsko_2021-2031.
- Kartica ima Skini kartu, veličinu, upute za Googleovu potvrdu velikog fajla
  i povratak na Odaberi fajlove; izvorni folder ostaje dodatni link.
  Javni download endpoint vraća HTTP 200 HTML „Virus scan warning” sa
  download-form. Nije preuzet cijeli 1,57 GB fajl niti zaobiđena potvrda.
- Preuzimanje obavlja Drive/preglednik; APK klik koristi postojeći Android
  ACTION_VIEW handler bez zamjene WebView stranice, web link novi tab s
  noopener/noreferrer. Bez mreže status objašnjava da preuzimanje treba vezu;
  postojeći lokalni uvoz ostaje dostupan. GPS/server/SQLite tok nije mijenjan.
- Lokalno prošlo 99 JS grupa, 5 inline sintaksi i prošireni load-map-233.py:
  tačan link, novi tab, očuvana aplikacija, offline poruka, stvarni SQLite
  uvoz/reload/brisanje i mali ekrani u oba moda. Android OfflineImportTest
  proširen monitorom vanjskog Intent-a (blokira stvarno otvaranje Drivea;
  kontrolisan navigator.onLine, emulator ostaje offline), stanje WebView-a
  i učitana karta ostaju sačuvani. CI 37607948974 uspješan: 99 JS grupa,
  puni browser skup, probni SQL/RLS i 4 Android 14 instrumentacijska testa
  (bez grešaka/preskakanja). Izvor 938406f78dda83f6d1fabbbe4cc0b9be150c823b.
- APK v2.5.0 objavljen: https://github.com/pogonboskrupa/US-SUME/releases/download/v2.5.0/app-debug.apk
  Potvrđeni package ba.spd.uss.vlake.debug, 2.5.0-debug/520, isti stabilni
  certifikat i svih 60 assets hashova. Veličina 24.075.715 B; SHA256
  cafe2b08134ae50be3eed18876a738095613082f46cc852b779edf57f784295b.
  Dostupan u Meni → Ažuriraj aplikaciju. Fizički Xiaomi, stvarno skidanje
  cijelog 1,57 GB fajla na telefonu i produkcijski Supabase nisu testirani.

## 2026-10-07 — v2.5.1: Unsko karta se sama preuzima i dodaje
- Korisnik je zamijenio v2.5.0 vanjski Drive/ručni import: samo Skini kartu,
  nakon završetka dostupna u Mojim kartama. Nova MapDownloads native/JS
  funkcija rješava javnu Drive potvrdu, Android DownloadManager pozadinski
  posao/napredak/nastavak, app-owned fajl i postojeći native atomski import.
  OfflineMaps otvara preuzetu SQLite bazu direktno, bez druge kopije.
- Potvrđen stvarni HTTP 206 Range 0–15 i SQLite header izvornog fajla od
  1.567.670.272 B; cijeli fajl nije preuzet u cloudu. Novo je ograničeni
  native downloader; nema promjena produkcijskog servera/SQL-a.
- Lokalno 100 JS grupa, simulacija, 5 inline sintaksi, LoadMap browser suite
  prošli. Novi MapDownloadsTest: kontrolisani transport, stvarni APK/native
  file/SQLite/IDB/WebView/Leaflet, restart i offline tile/delete/invalid HTML.
  CI 37610697691 uspješan: 100 JS grupa, browseri, SQL/RLS i 5 Android
  instrumentacijskih testova bez grešaka/preskakanja. Prvih 64 KB javnog
  fajla potvrđuje stvarni MBTiles schema; puni GET prihvata AndroidDownloadManager
  user agent bez cookies (pročitan samo header, ne cijeli fajl).
- Objavljen APK v2.5.1: https://github.com/pogonboskrupa/US-SUME/releases/download/v2.5.1/app-debug.apk
  24.087.350 B, SHA256 dfb2df911029d25fcf848db1e1eda5e41fc8e2ac7721a9ba890b020318af3fda.
  Izvor 9796c6bd1e7af89bdec2c1c73157a767c64193d3; manifest
  ba.spd.uss.vlake.debug, 2.5.1-debug/521, isti stabilni certifikat i svih
  61 assets hashova. Puni DownloadManager transfer/fizički Xiaomi i produkcijski
  Supabase nisu testirani. Detalji docs/PREUZIMANJE_UNSKO_2026-10-07.md.

## 2026-10-07 — v2.5.2: dostupne karte iz javnog foldera KARTA APP
- Novi javni folder 1iOjb0jeu6IYAx9XG-w8UfDeaZ-Bpm2H0 potvrđen anonimnim
  svježim GET-om, uključujući Dalvik user agent. KARTA_špd.mbtiles,
  ID 1mExFpUJgOAROwPSumemnnbzFH74GWHXv, 2.144.841.728 B; Range/header i
  metadata/tiles schema potvrđeni. Cijeli fajl nije preuzet u cloudu.
- MapDownloadCatalog daje živu/cached listu podržanih raster fajlova direktno
  iz tog foldera. ID/name/size/parent se provjeravaju; ne izvršava se Drive
  script, nema API ključa/Google prijave u APK-u. Svaki izvor ima svoj
  downloader/status/cancel/retry. Novi fajlovi vidljivi nakon otvaranja ili
  Osvježi; sačuvan popis odmah, offline karte u postojećem katalogu.
- Instalacije su serijalizirane i čuvaju istoimene/preimenovane lokalne
  karte. Stari Unsko posao/reference v2.5.1 se migriraju bez brisanja.
  Googleov javni JSON/HTML pregled nije stabilan API; promjena strukture
  može blokirati osvježavanje, ali ne briše sačuvane karte/popis.
- Lokalno 100 JS grupa, simulacija, 5 inline sintaksi i LoadMap browser
  prošli. Novi Android parser/folder controller testovi; CI/APK u toku.
  Detalji docs/FOLDER_KARATA_2026-10-07.md. Fizički Xiaomi, puni transfer i
  produkcijski Supabase nisu testirani; Drive dozvole/fajlovi nisu mijenjani.

- CI v2.5.2 37621884715 uspješan i APK objavljen. Završna v2.5.3/523
  uključuje uočeni slučaj nestanka izvora tokom transfera: native status
  uvijek vraća i završene/otkazane poslove izvan foldera, da JS ne zadrži
  stari napredak. Failed neinstalirani posao izvan foldera otkazuje se i
  uklanja svoju parcijalnu kopiju. Proširen stvarni Android/controller test
  i JS provjera. CI 37624238570 uspješan: svi JS/browser/SQL testovi i šest
  Android instrumentacijskih testova bez grešaka/preskakanja. Objavljen APK:
  https://github.com/pogonboskrupa/US-SUME/releases/download/v2.5.3/app-debug.apk
  24,096,358 B, SHA256 e3b686975868a4809df0e242c368dad80be4f308be97e45c77e8c9dfce68b364; izvor
  d5a56b0721108bdd494576f58a72d600bf5e43f6. Manifest
  ba.spd.uss.vlake.debug/2.5.3-debug/523, stabilni certifikat i svih 61 assets
  hashova provjereni. Puni 2,14 GB mrežni transfer i fizički Xiaomi nisu
  testirani; javni fajl potvrđen anonimnom Range/header/schema provjerom.

## 2026-10-07 — v2.5.4: tihe obavijesti preuzimanja i ponovni terenski pregled
- Korisnik prijavljuje nevidljive obavijesti. Novi MapDownloadService prati
  DownloadManager kroz zajednički singleton katalog, daje jedan tihi LOW
  kanal/progres/dodir za pregled karata. Novi DM poslovi su notification-hidden;
  starim poslovima se ne mijenjaju bajtovi ni status. Vidljiv razlog ako su
  Android obavijesti isključene. Proširen stvarni instrumentacijski test.
- 100 JS grupa, pet inline sintaksi, LoadMap browser, 5h CPU4x simulacija,
  3+2,4 km simulacija i šest dana doznake prošli. Sedam audit reprodukcija
  potvrđuje da raniji P1/P2 server problemi još postoje; nisu prepravljani
  funkcionalni serverski tokovi. Nema produkcijskog SQL-a ili mjerenja na
  telefonu. Nalazi/preporuke: OBAVIJESTI_TEREN_SERVER_2026-10-07.md.
- Web/SW/Android 2.5.4/code524. Android test pao; APK nije objavljen, vidi završnu 2.5.6.

## 2026-10-07 — v2.5.5: Rad na terenu za ostale korisnike + Explorer
- Korisnik je proširio zadatak tokom CI-ja: ostalim profilima dodati Teren
  u Meni, prvo i iznad Dnevnog moda, poboljšati sekciju i uključiti Explorer.
  Menu entry vidljiv za projektante/vodeće; ŠPD/admin zadržavaju svoj tab.
  Lokalni alati, novi projektni kontekst i Explorer kartica. Ranije pravilo
  Explorer samo uz odredište zadržano; pitanje o slobodnom modu čeka odgovor.
- CI 37642301405 v2.5.4 nije objavio APK: novi test čekanja obavijesti
  nije prošao (10 s). FGS start dozvoljen; sada FOREGROUND_SERVICE_IMMEDIATE
  izbjegava Android 12+ podrazumijevanu odgodu prikaza. Pri otkazivanju se
  ne šalje lažna završna obavijest za prazan spisak. Isti test se ponavlja.
- Teren browser provjerava i običnog projektanta, redoslijed, Explorer
  navođenje/checkbox i male ekrane u oba moda. Android završna obavijest nije prošla u 2.5.5; objava je završena u 2.5.6 ispod.

## 2026-10-07 — v2.5.6: završna obavijest preživljava gašenje servisa
- CI v2.5.5 37643608548 potvrdio je vidljivost, tihi kanal, čekanje veze
  i 50% napretka. Pao je tek završni prikaz nakon skidanja; APK nije objavljen.
- Završetak servisa sada ide na glavnoj niti: prvo odvajanje obavijesti,
  zatim završni prikaz i stopSelfResult. Provjera startId čuva noviji posao.
  Raniji poziv stopSelfResult prije odvajanja mogao je ukloniti obavijest.
- Isti Android test dodatno provjerava ugašen servis i zadržanu završnu
  obavijest bez ongoing zastavice. CI 37682600563 uspješan: 100 JS grupa, puni browser/SQL skup i šest
  Android testova, uključujući stvarnu tihu obavijest. Objavljen APK:
  https://github.com/pogonboskrupa/US-SUME/releases/download/v2.5.6/app-debug.apk
  24,108,420 B; SHA256 8c03fd927caf218097dea8303f2e3efefb9cd567ba8cf49d0d9d710b51e27f26.
  Izvor 69af8bdc2384b61c1bce7f1d7f9ae337e1fea55b, manifest
  ba.spd.uss.vlake.debug/2.5.6-debug/526, isti certifikat i svih 61 assets
  potvrđeni. Dostupan u Meni → Ažuriraj aplikaciju. Fizički Xiaomi, puni
  mrežni download i produkcijski Supabase nisu testirani.

## 2026-10-08 — v2.5.7: naziv Šumski mod
- Na korisnikov zahtjev, Moja lokacija sada prikazuje „Šumski mod“ umjesto
  „Šumski“. Isti prekidač i GPS filtriranje. Web/SW/Android 2.5.7/code527.
- Prikaz na 320 px i pet inline sintaksi prošli. CI 37730783935 uspješan:
  JS/browser/testni SQL i šest Android testova bez grešaka/preskakanja.
- Objavljen APK: https://github.com/pogonboskrupa/US-SUME/releases/download/v2.5.7/app-debug.apk
  24.108.424 B; SHA256 6d884ef7edf1fc381cb2125fc6a6e73ff12a366f01a060e3c471e4555c498a84.
  Izvor 2314e7c92123077c3fbff7dba5e14b4d9a7ed619; manifest
  ba.spd.uss.vlake.debug/2.5.7-debug/527, isti potpis i svih 61 assets
  potvrđeni na preuzetom APK-u. Fizički telefon nije testiran.

## 2026-10-08 — v2.5.8: Moje karte sa stvarnim isječkom
- Korisnik traži vizuelnu nadogradnju i obaveznu APK objavu za update u Meniju.
  Karte sada imaju veći isječak preko cijele kartice, naziv/stanje i odvojene
  kontrole. Pregled je JPEG 320×180 iz stvarne pločice, sačuvan lokalno.
- Android OfflineMaps i SqlDocument u metadata dodaju _preview XYZ iz već
  pročitanog uzorka; MiniSqlite uzima jednu koordinatu indeksa. Nema cijelog
  skeniranja velikog fajla zbog isječka. Generisanje ide serijski u pozadini,
  ne blokira završetak uvoza. Dupli zahtjevi se spajaju, stari handle se
  provjerava prije upisa; placeholder je izričito ilustracija.
- Lokalno: svih 100 JS grupa, pet inline sintaksi i LoadMap browser prošli.
  Provjereni stvarni pikseli/dimenzije, jedan dohvat za tri paralelna poziva,
  sačuvan offline preview i širine/dnevni/tamni mod. Read-only VFS test
  dodatno potvrđuje da koordinata isječka vraća stvarnu raster pločicu.
- Android test preuzimanja proširen stvarnim native preview/Canvas prikazom.
  Web/SW/Android 2.5.8/code528. CI 37732308857 uspješan: sve JS/browser/SQL provjere i šest Android
  testova, uključujući native isječak u Mojim kartama. Fizički Xiaomi nije
  testiran. Novi preview sačuvanih karata bez otvorenog handle-a nastaje
  kada se karta otvori; već sačuvan isječak radi bez otvaranja fajla.

- APK v2.5.8 objavljen: https://github.com/pogonboskrupa/US-SUME/releases/download/v2.5.8/app-debug.apk
  24,112,784 B; SHA256 a126295aebcfdbed5a956109f1d85ebbc9a456fc12297377916a6990b3a05013. Izvor
  1ebe49a4f63df7e9c3dd2dd2362568de38f55eaa. Manifest
  ba.spd.uss.vlake.debug/2.5.8-debug/528, isti certifikat i svih 61 assets
  potvrđeni; ažuriranje dostupno kroz Meni → Ažuriraj aplikaciju.

## 2026-10-08 — v2.5.9: Drive quota prepoznata prije skidanja
- Korisnik javlja „nepotpuna/neispravna“ nekoliko sekundi nakon Skini kartu.
  Direktni javni fajl 1mExFpUJgOAROwPSumemnnbzFH74GWHXv provjeren anonimno:
  Range 0–15 vraća SQLite/206, ukupno 2.144.841.728 B, dok puni GET vraća
  HTML/200 od 2.040 B „Google Drive - Quota exceeded“. Isto za Dalvik i
  AndroidDownloadManager. Google navodi do 24h čekanja; nije potvrđena
  puna dostupnost fajla niti izvršen transfer 2,14 GB.
- Raniji preflight provjeravao je samo Range i zatim pokretao downloader
  nad HTML odgovorom. Sada se provjerava puni GET: prvih 16 bajtova i
  veličina, HTML potvrda/quota/pristup i odbijanje neočekivanog 206.
  Ne preuzima se cijela karta tokom preflighta. DM zadržava nastavak, uz
  identity/no-cache zaglavlja. Nema zaobilaženja Drive ograničenja.
- Poznata Drive greška prolazi do aplikacije. Stari završeni HTML poslovi
  također dobijaju tačan quota razlog. Novi test reprodukuje uspješan
  Range i blokiran full GET, dugi size >2 GB, 16-byte čitanje, djelimičan
  odgovor i HTML iz starog posla. JS downloader i pet inline sintaksi prošli.
- Web/SW/Android 2.5.9/code529. CI 37740789291 uspješan: JS/browser/SQL i sedam Android testova. Fizički telefon i
  puni download nisu testirani, javni fajl je sada blokiran na Googleu.

- APK v2.5.9 objavljen: https://github.com/pogonboskrupa/US-SUME/releases/download/v2.5.9/app-debug.apk
  24,114,116 B; SHA256 585aa6a7f11b235d5c8c12577d7e5f5184e898e6ccd4e7fe256d517f9ebd1df6. Izvor
  68fba48a5ce2939b8ae0dfbec97e64be183b9dd8. Manifest
  ba.spd.uss.vlake.debug/2.5.9-debug/529, isti certifikat i svih 61 assets
  potvrđeni; ažuriranje dostupno kroz Meni → Ažuriraj aplikaciju.

## 2026-10-08 — v2.6.0: Karte prije terenskih alata u Meniju
- Na zahtjev korisnika cijela sekcija Karte i slojevi sada je prva redovna
  sekcija Menija, odmah zatim Rad na terenu. RAD NA TERENU ostaje prije
  Dnevnog moda u svojoj sekciji; postojeće dozvole i ŠPD prečice očuvane.
- Read-only GitHub Pages API potvrđuje source CODEX-US-SUME-2026-10-01,
  / (root); anonimni HTTP GET s no-cache vraća APP_VER v2.4.1. Stara
  verzija u Chromeu dolazi iz stare objave, nije samo browser cache.
  Pages postavke nisu mijenjane; za novo web izdanje source treba biti
  CODEX-US-SUME / (root). Lokalni terenski podaci nisu brisani.
- Lokalno prošli Teren browser (ŠPD/admin/projektant), Menu tools (osam
  kombinacija širina i tema), Teren JS i pet inline sintaksi.
- Web/SW/Android 2.6.0/code530. CI 37742689245 uspješan: svi JS/browser/SQL testovi i sedam Android testova. Fizički telefon nije testiran.

- APK v2.6.0 objavljen: https://github.com/pogonboskrupa/US-SUME/releases/download/v2.6.0/app-debug.apk
  24,114,116 B; SHA256 ccc95253505f61da495f498c34b1245fec23b1abfaeb828db155a019fb6cf9fb. Izvor
  acbbe87e0510b135d351d4648073afa3ba54d5e2. Manifest
  ba.spd.uss.vlake.debug/2.6.0-debug/530, isti certifikat i svih 61 assets
  potvrđeni. Updater releases?per_page=1 vraća v2.6.0.

## 2026-10-08 — v2.6.1: KML iz javnog foldera KARTA APP
- Na zahtjev korisnika KML dio Dodaj KML / SHP dobija katalog istog
  javnog foldera 1iOjb0jeu6IYAx9XG-w8UfDeaZ-Bpm2H0: pretraga, naziv,
  veličina, Osvježi i Preuzmi i dodaj / Prikaži. Naknadne KML stavke
  pojavljuju se pri otvaranju ili osvježavanju; nije potreban novi APK
  za svako dodavanje fajla. KML se prepoznaje po nastavku ili Drive MIME.
- Anonimni folder potvrđuje Granice odjela (13.532.522 B, KML MIME, bez
  nastavka) i KAMIONSKI PUTEVI.kml (396.070 B). Metadata potvrđena i Drive
  konektorom. Javni full GET trenutno vraća Drive quota za oba fajla;
  puna ispravnost njihovog XML-a nije potvrđena. Folder/podaci nisu mijenjani.
- KmlDownloads native bridge čita samo ovaj katalog, provjerava Google
  potvrdu/quota, puni odgovor, veličinu i XML/KML bez DTD. Download ide van
  UI threada, max32 MB/240s transfer. WebView dobija lokalni streaming URL,
  ne višemegabajtni evaluateJavascript string. Privremeni fajl se uklanja
  nakon potvrđenog IDB uvoza; finalni sloj ostaje u postojećem registru.
- _driveSource metadata čuva izvor atomskim početnim upisom; Prikaži koristi
  postojeći sloj i stil, radi offline, bez ponovnog skidanja/dupliranja.
  Čuvaju se zaštita naloga, SHP/lokalni uvoz i zaštita istog naziva.
- Lokalno svih 100 JS test grupa i browser Menu tools prošli: 8 širina/tema,
  kontrolisani Drive katalog/pretraga/import/IDB/dedup/offline/quota i
  naknadno dodan fajl. Novi native test odbija HTML/partial/truncated/DTD/
  strani izvor; postojeći APK/WebView test proširen stvarnim lokalnim URL-om,
  KML bridge uvozom i offline reloadom.
- Prvi Android CI 37745667727: KML/WebView import i offline reload prošli,
  jedan novi validator test otkrio prihvatanje neispravnog XML-a. Validator
  sada izričito broji otvaranja/zatvaranja i odbija DTD pri čitanju bajtova,
  nezavisno od razlika Android pull parsera. Ponovni CI 37747136444 prošao: svih osam Android testova.
- Web/SW/Android 2.6.1/code531. CI 37747136444 uspješan: JS/browser/SQL i osam Android testova. Fizički telefon nije testiran; uvoz stvarnih javnih KML fajlova nije potvrđen zbog Drive quota.

- APK v2.6.1 objavljen: https://github.com/pogonboskrupa/US-SUME/releases/download/v2.6.1/app-debug.apk
  24,129,080 B; SHA256 6ce6dec189205342a2d62ba6985e8f4f2b7dae7e29fa8031e3af2abefea40fdf. Izvor
  e8b5d7c64d364540ada5c88744e39925b7545809. Manifest
  ba.spd.uss.vlake.debug/2.6.1-debug/531, isti certifikat i svih 61 assets
  potvrđeni. Updater releases?per_page=1 vraća v2.6.1.

## 2026-10-08 — v2.6.2: ŠPD karta sa GitHub Releases
- Na zahtjev korisnika novi raster download koristi tačno javni asset
  pogonboskrupa/KARTE, v1.0.0/KARTA_spd_GitHub.mbtiles. U aplikaciji naziv
  ostaje Unsko_2021-2031; katalog prikazuje GitHub i veličinu. KML katalog
  ostaje u javnom Drive folderu KARTA APP. KARTE repo nije mijenjan.
- GitHub API potvrđuje 1.982.578.688 B i objavljeni digest
  9065c71297f00b4e845909e98496eaa517b79ca362483c7b6b701f03ce5bfdd4.
  Anonimni Range vraća 206, puni GET 200 sa tačnom veličinom i SQLite
  zaglavljem; prvi 64 KiB potvrđuju metadata/tiles i unique tile_index.
  Cijeli fajl nije preuzet: puni SHA256 i integrity_check nisu provjereni.
- Native preflight čita samo 16 B, odbija HTML, djelimičan odgovor,
  pogrešno zaglavlje/veličinu i strane redirect hostove. DownloadManager
  dobija trajni GitHub asset URL, ne privremeni potpisani CDN URL, radi
  obnove pristupa nakon pauze. Postojeći progress/obavijesti, pozadinski
  download i automatsko dodavanje u Moje karte ostaju na istom putu.
- Novi source ID odvaja GitHub fajl od starih Drive partial fajlova.
  Legacy Drive poslovi/sačuvane karte ostaju dostupni, ne reinterpretiraju
  se kao GitHub bajtovi. Katalog ove karte ne zahtijeva Drive ni prijavu.
- Lokalno prošlo svih 100 JS test grupa, pet inline sintaksi i LoadMap
  browser: stvarne pločice, worker/IDB, offline restart, neispravni fajlovi,
  promjena izbora i brisanje. Novi Android test provjerava puni preflight,
  ograničeno čitanje, stabilni URL i odbijanje loših izvora. Postojeći
  WebView/DownloadManager test sada koristi stvarni mali MBTiles fixture
  sa TMS koordinatama; legacy Drive i KML provjere zadržane.
- Web/SW/Android 2.6.2/code532. CI 37757939724 uspješan: 100 JS grupa,
  SQL fixture, browser provjere i devet Android testova bez grešaka/preskoka.
  Android API34 emulator bez interneta potvrdio je MBTiles download lifecycle,
  obavijesti, uvoz, stvarne pločice/preview, offline reload, brisanje i KML.
  Fizički telefon i cijeli javni download od 1,98 GB nisu testirani.
- APK v2.6.2 objavljen:
  https://github.com/pogonboskrupa/US-SUME/releases/download/v2.6.2/app-debug.apk
  24.130.400 B; SHA256
  6954cc10582512f131791c4f0dfca24b817def0dbc80f2e60033a845cb7b2347.
  Izvor e52441fd097b96de19d3be3f0b4a278173ae3de7. Provjeren stvarni
  manifest ba.spd.uss.vlake.debug/2.6.2-debug/532, isti certifikat i svih
  61 web assets. APK hash/veličina odgovaraju objavljenom Release assetu;
  updater releases?per_page=1 vraća v2.6.2 sa app-debug.apk.

## 2026-10-08 — v2.6.3: Više GitHub karata i period 2010–2020
- Na zahtjev korisnika raster katalog sada čita objavljene release assets
  samo iz pogonboskrupa/KARTE. Pri otvaranju/Osvježi pojavljuju se dodatne
  podržane SQLite karte, bez novog APK-a za svaku buduću kartu. Nacrti i
  nedovršeni uploadi se preskaču. KML/Drive katalog nije mijenjan.
- Tag stara_verzija prikazuje Unsko_2010-2020; postojeći v1.0.0 zadržava
  Unsko_2021-2031 i isti ID ranijeg download posla. Trenutni period je
  prvi, stari drugi. Kartice prikazuju GitHub, veličinu i naziv objave.
- Source metadata sada trajno čuva javni URL i naslov objave uz ID asseta.
  Stari v2.6.2 i Drive upisi dekodiraju se kompatibilno. Svaki transfer
  ima zaseban ID/progress i automatski uvoz; nema zamjene bajtova ili
  brisanja postojeće karte kad se dodaje druga karta u katalog.
- Katalog se dohvaća van UI threada, bez mreže pri konstrukciji aktivnosti
  ili servisa; offline/rate limit zadržava sačuvani popis. Paginacija je
  ograničena na tri stranice/300 karata i 4 MB po odgovoru; nepotpuni ili
  neispravni odgovori ne zamjenjuju popis. Izvori i redirecti ograničeni
  su na release assets ovog repoa i zvanični GitHub CDN. SQLite preflight
  provjerava puni odgovor/veličinu i čita samo 16 B, ne cijelu kartu.
- Prilikom početne provjere stara_verzija je još draft bez assets; kod
  ne objavljuje niti mijenja korisnikov KARTE release. Pravo preuzimanje
  stare karte provjerit će se nakon njene javne objave; puni fajl i
  fizički telefon nisu testirani.
- Lokalno svih 100 JS grupa, inline sintakse i LoadMap browser prošli.
  Native testovi prošireni za oba perioda, nacrte, budući asset, odbijanje
  stranog izvora, kompatibilan stari ID, cached katalog i recovery posla
  offline; stvarni APK/WebView MBTiles test koristi novi dinamički source.
- Web/SW/Android 2.6.3/code533. CI 37760530513 uspješan: svih 100 JS
  grupa, SQL fixture, browser provjere i deset Android testova bez grešaka
  ili preskoka. Stvarni API34 WebView sa malim MBTiles fixtureom potvrdio
  je novi dinamički source, uvoz stare karte, obavijesti, tile/preview,
  offline reload i brisanje; parser/cache/recovery oba perioda potvrđeni.
- APK objavljen:
  https://github.com/pogonboskrupa/US-SUME/releases/download/v2.6.3/app-debug.apk
  24.132.712 B; SHA256
  301bf38d2e3ca976a16186ab1acd3a86dd56bde0506c11d055e0b2b3407f9617.
  Izvor b84e62753003d0d63ddb327e0d69101cb159bcf2. Stvarni manifest
  ba.spd.uss.vlake.debug/2.6.3-debug/533, isti certifikat i svih 61 web
  assets potvrđeni; digest/veličina odgovaraju Release assetu, updater
  releases?per_page=1 vraća v2.6.3. Na završnoj provjeri stara_verzija
  još draft bez assets; pojavit će se nakon korisnikove javne objave.
  Cijela javna stara karta i fizički telefon nisu testirani.

## 2026-10-08 — v2.6.4: Velike karte preko mobilnih podataka
- Korisnik prijavio Čekam internet uz uključene/dopuštene mobilne podatke.
  Kod je već imao setAllowedOverMetered(true), ali sve STATUS_PAUSED
  razloge prikazivao kao nedostajući internet. AOSP DownloadInfo.java,
  getRequiredNetworkType, dodatno nameće UNMETERED preko maksimalne ili
  preporučene veličine čak i uz allowMetered; DownloadThread to prijavljuje
  QUEUED_FOR_WIFI. Bez loga korisnikovog telefona konkretan reason nije
  potvrđen. Sistemske postavke/limiti telefona nisu mijenjani.
- GitHub rasteri sada koriste MapHttpTransfer, app-owned native HTTP stream
  u postojećem foreground MapDownloadService, van UI threada. Koristi
  dostupnu Android INTERNET mrežu bez uslova NOT_METERED/Wi-Fi. Dva workera,
  buffer64 KiB, long size/progress, disk checkpoint i djelimični wakelock
  tokom transfera. Ne učitava cijelu kartu u WebView/RAM; naziv/automatski
  uvoz, preview, offline registry i KML put zadržani.
- Stanje native posla i stabilni GitHub URL zapisani prije pokretanja.
  Prekid/process recovery nastavlja Range/If-Range samo s poznatim jakim
  ETag-om; provjerava Content-Range, početak/ukupnu/punu preostalu veličinu.
  Puni 200 sigurno zamjenjuje partial, novi ETag veže se tek nakon upisa
  i sync novog zaglavlja; nepotvrđen/strani/neispravan odgovor odbija se.
  Partial bez validatora počinje od nule umjesto miješanja revizija.
  Otkazivanje generacijom onemogućava naknadno stvaranje/upis fajla.
  Recovery potpuno upisanog fajla završava i bez interneta, ako se proces
  prekinuo između zadnjeg sync upisa i commit završnog stanja.
- Raniji pauzirani GitHub DownloadManager poslovi prelaze na novi put:
  partial prvo dobija novi UUID, pending handoff se sačuva, zatim se stari
  sistemski posao ukloni. Recovery handoffa nakon prekida je idempotentan.
  Stari Drive poslovi zadržani; oni izričito dopuštaju MOBILE|WIFI i metered.
- Bridge networkAvailable čita stvarne Android capabilities; JS ne blokira
  mobilni internet zbog zastarjelog navigator.onLine. Pauze u kartici i
  obavijesti koriste stvarnu poruku (veza/server/Wi-Fi), ne uvijek internet.
- Lokalno prošlo 100 JS grupa, pet inline sintaksi i LoadMap browser.
  Android WebView test simulira native mobilnu vezu uz onLine=false.
  Četiri nova native testa obuhvataju stream malog stvarnog MBTiles fajla,
  offline početak, prekinuti body, Range recovery, 200/reviziju, pogrešan
  range, cancellation race i čuvanje/recovery starog partial handoffa.
- Prvi CI 37769360020: proizvodni APK kompajliran, Android test build
  stao na sukobu lokalnog latch naziva sa inherited Response.closed
  boolean poljem. Testni naziv ispravljen; puni native testovi ponovljeni.
- Web/SW/Android 2.6.4/code534. CI 37770637372 uspješan na izvoru
  aa0f285b7736a65e92b324b42d5cf37a2ec21ef3: 100 JS grupa, browser/SQL/
  teren/performance provjere i svih 14 Android testova bez grešaka ili
  preskoka. Četiri nova transfer testa i stvarni WebView MBTiles uvoz
  potvrđeni na API34 emulatoru; native mreža u testu simulirana.
- APK objavljen:
  https://github.com/pogonboskrupa/US-SUME/releases/download/v2.6.4/app-debug.apk
  24.139.532 B; SHA256
  7391af496c81d539bb1268e7a1689b0b2f7240f1fe1905793e98232604feba0c.
  Stvarni manifest ba.spd.uss.vlake.debug/2.6.4-debug/534, isti potpisni
  certifikat i svih 61 web assets potvrđeni; veličina/digest odgovaraju
  objavljenom assetu. Updater releases?per_page=1 vraća v2.6.4 sa APK-om.
  Fizički Xiaomi, stvarna SIM/mobile mreža i cijeli javni fajl nisu testirani.

## 2026-10-08 — v2.6.5: Brisanje oznaka i zasebne offline karte
- Korisnik ne može obrisati tekst oznake iz editora; tražio provjeru sličnih
  mjesta i posebno izdvajanje offline karata u Podloge i slojevi.
- Potvrđeno u kodu: label_id iz starog server/cache zapisa može biti string,
  dok ga inline onclick emitira bez navodnika kao broj (ili neispravan JS za
  nebrojčani ID). Strict lookup onda ne nalazi oznaku pri brisanju/uređivanju.
  ID se sada poredi kao string, a dugmad dobijaju closure s izvornim ID-em,
  bez interpolacije u JavaScript. Nema migracije/brisanja starih oznaka.
- Brisanje traži vidljivu potvrdu; sprječava dupli klik/promjenu naloga tokom
  potvrde. Primarni _OL.LABELS zapis mora uspjeti prije izmjene liste/markera.
  Dodavanje/edit imaju isti uslov; neuspjeh pri upisu čuva oznaku i editor.
  Legacy ogledalo tvlake_textlabels ostaje kompatibilno. Oznake ostaju lokalne;
  prazna sačuvana lista ne vraća stare server oznake pri ponovnom ulasku.
- Pregledana slična dugmad: tačke/fotografije koriste indekse/numeričke
  timestampove, KML/SHP već potvrđuje lokalni upis. U sačuvanoj ruti popup je
  pogrešno koristio nedefinisani t umjesto r; ispravljen ID i Vodi me, uklonjen
  native confirm iz list/popup brisanja u korist zajedničkog _dlgConfirm.
  Ruta ne prijavljuje uspješno brisanje ako localStorage upis ne uspije.
- sqlmapConfirmDelete sada nakon potvrde traži isti uhvaćeni layer objekat;
  promjena indeksa liste tokom čekanja ne briše susjednu kartu.
- Novi podtab Offline u Podloge i slojevi: samo sačuvane raster karte;
  puni nazivi, postojeći thumbnail ili jasno označena ilustracija lokalnog
  fajla, status aktivna/sačuvana/neotvorena, siguran naziv kroz data atribut,
  otvaranje odgođenih karata i pristup Učitaj/skini/Upravljaj. Online podloge
  i keš ostaju u Karte, DEM u Instalirane. Zajednički localRows ima active:false
  za odgođene zapise, da abecedno ranija odgođena karta ne pretekne aktivnu.
- Novi stvarni Leaflet/browser test: broj/string/nebrojčani ID, edit, odustajanje,
  brisanje i pravi page reload, puna kvota, promjena naloga, popup rute,
  promjena indeksa tokom potvrde, odgođene/aktivne/prazne offline karte i
  16 rasporeda u Dnevnom/tamnom modu (320/390/568/1200). Dodan u puni CI.
  Lokalno 100 JS grupa i pet inline sintaksi prošli; instalirane/omiljene,
  DEM i projekat browser te Menu/KML/SHP browser također prošli.
- Reprodukcija na starom stvarnom deleteTextLabel kodu (lokalni 40cb400):
  string label_id uz inline broj ostavlja oznaku i ne uklanja marker.
- Web/SW/Android 2.6.5/code535. CI 37780669121 uspješan na izvoru
  467f1299b68613ef6242f42be949b76fb0a3ecb8: svih 100 JS grupa, SQL testna
  baza, sve browser/teren/performance provjere i 14 Android testova bez
  grešaka/preskoka. Novi browser test koristi stvarni editor, dijalog,
  Leaflet i trajni _OL zapis; SQL layeri simulirani za indeks/recovery.
- APK objavljen:
  https://github.com/pogonboskrupa/US-SUME/releases/download/v2.6.5/app-debug.apk
  24.146.416 B; SHA256
  54cf1b6f4d7395bf1072f490bfbe741f659c30424d3acbec3cdc5616a1a8c7f7.
  Stvarni manifest ba.spd.uss.vlake.debug/2.6.5-debug/535, isti potpisni
  certifikat i svih 61 web assets potvrđeni; veličina/digest odgovaraju
  objavljenom assetu. Updater releases?per_page=1 vraća v2.6.5 sa APK-om.
  Pages sada koristi CODEX-US-SUME/root; živi sw.js potvrđuje 2.6.5.
  Fizički Xiaomi i produkcijska Supabase baza nisu testirani niti mijenjani.


## 2026-10-08 — v2.6.6: Tematski fajlovi, raster pregledi i trajni izbori
- Korisnik prijavio nestajanje GPKG prikaza/tabova i preklapanje u modalu;
  zatražio listing i kontrolu više fajlova, stvarne offline slike i pamćenje
  izbora pri ponovnom pokretanju. Novi APK izričito zatražen.
- Tematski modal ima stalnu glavu/tabove/footer, zaseban skrol i jedan editor
  izabranog fajla. Listing svih sačuvanih GPKG (uključujući neotvorene zapise),
  pojedinačni/grupni prikaz, tabela, zoom i potvrđeno uklanjanje. Višestruki
  import ide serijski; veliki MiniSqlite scan daje UI-u vrijeme za crtanje.
  Import ne pomjera kartu. Draft/fokus/skrol ostaju pri pozadinskom učitavanju.
- Novi fajl se objavljuje tek nakon potvrđenog IDB i registra. Greška prostora
  ne pravi lažni uspjeh; legacy sadržaj se ne briše prije potvrđene migracije.
  Registar čuva i neotvorene fajlove, restore sprječava duplikate/obrisani fajl
  i zakašnjelo objavljivanje nakon promjene naloga.
- Raster pregled uzima stvarne lokalne pločice; bijeli/transparentni/ravni
  uzorak se preskače. Najviše 24 čitanja, bez skeniranja cijele baze ili mreže;
  320x180 JPEG i negativni cache. Ista slika u Offline, Instalirane i Omiljene,
  široke kartice, jasno označena ilustracija kad sadržaj nije dostupan.
- Offline izbor pamti izričito sakrivanje (last_map none), providnost i zIndex
  po fajlu; odgođeni restore ne gazi noviji izbor. Isključeni nagib se ne vraća
  preko stale quick-map zapisa. Podtab slojeva i filter/pretraga/sort preglednika
  se pamte. Bafer pamti zajedničku širinu, boju i providnost.
- KML save spaja postojeće server overrides i ne gazi ih placeholderima.
  Server KML/SHP loader čuva ispunu, pattern, opacity i tag; stil se spušta
  kroz SHP GeoJSON grupe na stvarne poligone. Preuzeti server KML/SHP vraćaju
  se iz IDB bez mreže, sa stilom i vidljivošću, dedup i provjerom naloga.
  Lokalni KML/SHP, fotografije/tragovi/tačke/grupni prikaz, projekat/poligon,
  smjerovi i map-center već imaju trajnu pohranu; postojeći tokovi sačuvani.
- Tri nova browser testa koriste stvarni Leaflet, IDB, MiniSqlite i SQL.js
  worker: 3000 GPKG poligona/više fajlova, quota/account/legacy/race slučajevi,
  16 rasporeda; raster pločice i reload sa providnošću/redoslijedom/sakrivanjem;
  lokalni/server KML i stvarni SHP/DBF sa punim stilom nakon reload-a bez mreže.
  Proširen library test za novi JS kontekst/isti store i odvojene naloge.
- Lokalno prošlo svih 100 JS grupa, pet inline sintaksi i novi browser testovi.
  Produkcijska Supabase baza nije mijenjana. Fizički Xiaomi i stvarna karta
  od 1,85 GB nisu testirani; raster slike u testu su sintetičke pločice.
- Web/SW/Android 2.6.6/code536. Build i objava u provjeri.
- Prvi CI 37826656349 stao u doznaka-sixdays fixture-u: izdvojeni Doznaka
  blok nije sadržavao novi buffer helper, pa direktni setTimeout referencira
  nepostojeću funkciju i prekida ostatak inicijalizacije testnog bloka.
  Obnova bafera premještena u osigurani startupRestore korak nakon spremnog
  DOM-a/provjere naloga; produkcijski i izdvojeni tokovi ne zavise od redoslijeda.
- Drugi CI 37827480995: Doznaka i svi novi testovi prošli; project-terrain
  fixture nije uključivao novi stvarni _loadmapThumbData helper za Omiljene.
  Fixture dopunjen istom funkcijom iz aplikacije (bez zamjenskog mocka).
- Treći CI 37828390570: svi web/teren testovi i APK build/assets prošli;
  13/14 Android testova prošlo. Download test je očekivao JPEG od stare
  1x1 jednobojne PNG pločice, koju novi pregled pravilno preskače kao praznu.
  Android MBTiles fixture sada ima 256x256 raster s linijama (isti koordinatni
  redovi/schema); native uslov provjerava v3 cache. Ista fizička baza uključena
  i u browser preflight stvarnog SQL workera/pregleda. Proizvodni kod ne mijenjan.

### 2026-10-08 — potvrđen 2.6.6 APK i Doznaka GPS kontrole (2.6.7)

- CI 37830420608/source4f222931 završio uspješno. 2.6.6/code536 APK:
  24.171.180 B, SHA256 81a99adee24c8c9da7e3bc0079fd884dc45e0131e09d3056aa3a37ec0e78ab72.
  Lokalno provjeren binary manifest, stabilni potpis
  11fcd020c703053324ae26baf7a8207373711341f503277a90ec08a8468f286d,
  61 sadržajnih web hashova prema tačnom 2.6.6 izvoru i XML svih 14 Android
  testova (0 grešaka/padova/preskakanja). Release s APK-om javno dostupan.
- Dodatni korisnički zahtjev: Počni GPS u Doznaci otvara kontrolni prozor
  nakon stabilizacije/starta postojećeg watch-a. Odjel/projektant, status,
  dužina, vrijeme bez pauze, broj tačaka i preciznost; Pauza/Nastavi i Završi.
  Skloni/Prikaži kartu/Escape ne prekidaju snimanje. Traka snimanja otvara
  isti prozor bez drugog watch-a; njeno Završi poziva dozStopGPS direktno.
- GPS pohrana ostaje postojeći FieldStore dnevnik: tačka tek nakon trajnog
  upisa, stop čeka red/retry/finish. Prozor blokira dupli završetak i pauzu
  tokom završavanja, ostaje otvoren za retry ako trajni finish ne uspije.
  Uspješan stop gasi UI timer; novo snimanje vraća tačan status i nakon pauze.
  Crash oporavak također otvara kontrole. Nema automatskog slanja na server.
- Prikaz koristi iste day/dark boje i zaseban dijalog izvan Doznaka panela,
  pa se može skloniti radi prikaza karte. Kontrolni tasteri min44px, skrol
  na niskom ekranu, fokus kruži unutar prozora; Explorer ga već prepoznaje
  kroz postojeći role=dialog/aria-modal nadzor. Upute ažurirane za ove kontrole.
- Novi browser test koristi stvarni Doznaka kod/Leaflet/FieldStore IndexedDB,
  sintetičke GPS fikseve bez mreže: početak, pauza bez tačaka/bez povećanja
  trajanja, nastavak, slab signal, sklanjanje/nastavak snimanja/reopen,
  keyboard, 8 rasporeda, neuspjeli finish/retry i zaštita od duplog stopa,
  stop usred pauze, drugi pojas, stop iz zajedničke trake, reload šest trajnih
  tačaka. Produkcijski GPS/Supabase i fizički telefon nisu korišteni.
- Web/SW/Android 2.6.7/code537. Završna provjera i APK objava u toku.
- Lokalno 2.6.7 prošlo svih 100 JS grupa, Doznaka šestodnevna simulacija,
  pet inline sintaksi, novi GPS modal browser test, Doznaka restore, overlay
  test, preferences i thematic-files; puni offline app test sa CPU4x i ubrzanih
  pet sati: 3564 prihvaćena fiksa vlake, 1723 doznake i 1723 vraćene iz IDB,
  bez mrežnih upisa. Ovo nije mjerenje baterije niti fizičkog Redmi telefona.
- Konačna potvrda: CI 37832465966/source9b59bbb706a8868f36dde4d63b87a0e277ec57fd
  uspješan. Objavljen v2.6.7/code537 APK 24.181.100 B; SHA256
  0d61a2d3a6236303977cb30533432d305f76071a12f2ad5e48c6d0db0041ed8c.
  Preuzet stvarni CI APK i Android XML: svih 14 testova prošlo, bez skipova.
  Binary manifest paket ba.spd.uss.vlake.debug / 2.6.7-debug / 537; stabilni
  certifikat kao 2.6.6, svih 61 web resursa identični tačnom lokalnom izvoru.
  Release digest/veličina poklapaju build; updater releases?per_page=1 vraća
  v2.6.7 s javnim app-debug.apk. Release opis dopunjen stvarnim izmjenama.

### 2026-10-09 — stvarni USK_SADNJA_7_VRSTA_PROCJENA_V3.gpkg (2.6.8)

- Korisnik već ima 2.6.7 i prilaže konkretan GPKG; traži ispravan prikaz ovog
  fajla i novo ažuriranje. Izvornik od 20.271.104 B ostaje samo u lokalnom
  attachment prostoru; nije dodat u javni repo, CI, niti u APK resurse.
- SQLite read-only quick_check OK. Jedan WGS84 MultiPolygon sloj odsjeci:
  17.305 feature-a / 17.352 poligonska dijela; sedam REAL kolona vrsta.
  Tabele teme/legenda i QGIS layer_styles nose ljubičastu paletu, raspone
  50–59,9 / 60–69,9 / 70–79,9 / 80–89,9 / 90–100 i tekstualna značenja.
- Stvarni baseline u browseru: geometrija se učita bez greške, ali tema nije
  odabrana, metapodaci se ignorišu; izbor lužnjaka pogrešno pravi pet kvantila
  i zeleno-crvenu skalu nad ocjenama 50–57,1, a 16.978 NULL ćelija ostaje sivo.
- Uvoz sada čita isključivo male teme/legenda/layer_styles tabele (limit1000
  zapisa, yield64); audit/model/ulazne tabele ne skenira. XML QML je podataka
  parser bez izvršavanja/preuzimanja; podržan graduated SimpleFill fallback.
  Provjera polja, numeričkih raspona i hex boja prije primjene. Poštuje izvorne
  raspone/boje/tekst legende, uklanja NULL/out-of-range iz crtanja i hit-test-a.
  Novo učitavanje bira ugrađenu zadanu temu Bukva, alfa210/255. Izbor korisnika
  (uključujući Bez teme), ručni overrides, jačina i vidljivost imaju prednost.
- Procjena_i_ogranicenja je informativni tekst, više se ne nudi kao dodatna
  kategorijska tema. Pop-up koristi naziv ćelije i duge napomene u čitljivom
  punom redu; opis/ograničenja iz teme se prikazuju kao escaped tekst.
  Color-only editor čuva izvorne opsege/praznine i labels; izmjena granica pravi
  ručne klase, Vrati zadano vraća izvorne klase. Sve se vraća iz IDB izvornika.
- Lokalni test priloženog fajla: svih 17.305 feature-a; nezavisni Python SQLite
  brojevi svake vrste/klase identični JS prikazu. Prikazane ćelije: bukva14850,
  jela11644, smrča4801, kitnjak15156, lužnjak327, kesten4223, javor10572.
  Skrivene NULL/out-of-range ćelije bez stroke/fill/interaktivnosti; ostale
  vidljive. Provjereno 7 tema, 8 rasporeda, QML-only fallback, edit/reset boja,
  stvarni popup, reload teme/boja/jačine/skrivanja i Bez teme; bez mreže.
- Novi CI browser test generiše sintetički MultiPolygon GPKG s istom shemom
  sedam vrsta/metapodataka (granične vrijednosti, NULL, vrijednosti izvan
  raspona, praznine). GPKG_REAL omogućava lokalnu provjeru stvarnog attachmenta
  bez njegove objave. Prošlo svih100 JS grupa, pet inline sintaksi i postojeći
  thematic-files test (3000 feature-a/IDB/kvote/16 rasporeda); tematska29/29.
- Web/SW/Android 2.6.8/code538. Završni Android build/objava u toku.
  Fizički Xiaomi i GPS/produkcijska Supabase baza nisu testirani ni mijenjani.

- Konačna potvrda 2.6.8: CI 37898776541/source3794f74cd1c3ba5a852f8a05e9c367a601f8f063
  uspješan, uključujući novi sintetički GPKG test i sve regresije. Objavljen
  v2.6.8/code538 APK 24.188.268 B; SHA256
  e557384c88009ed6420bce0273974c6c72b1c412c492ecf096a021596f9ea5c8.
  Preuzet stvarni CI APK i Android XML: svih 14 testova prošlo, bez skipova.
  Binary manifest ba.spd.uss.vlake.debug / 2.6.8-debug / 538, isti stabilni
  certifikat 11fcd020c703053324ae26baf7a8207373711341f503277a90ec08a8468f286d.
  Svih 61 web resursa identični izvoru. Release digest/veličina poklapaju APK;
  updater releases?per_page=1 vraća v2.6.8 i javni app-debug.apk. Release opis
  dopunjen konkretnim GPKG izmjenama. Javni Pages index.html i sw.js su 2.6.8.

### 2026-10-09 — poseban podtab za procjenu sadnje (2.6.9)

- Korisnik traži poseban podtab unutar Tematske karte samo za priloženi
  USK_SADNJA_7_VRSTA_PROCJENA_V3.gpkg. Dodan stalni Sadnja · 7 vrsta podtab,
  s praznim stanjem/uputom za taj konkretni fajl i otvaranjem sačuvanog fajla.
  Identitet je tačan naziv fajla (case insensitive); drugi GPKG-ovi se ne
  pojavljuju u njegovim karticama, pickeru ili brojaču. Iz liste fajlova
  dugme ovog fajla direktno otvara novi podtab.
- Sedam vrsta bira se pristupačnim dugmadima (jedan aktivan izbor). Koristi
  postojeću klasifikaciju, legendu, jačinu, editor, zoom, tabelu i vidljivost,
  bez dodatne kopije geometrije/podataka. Izbor i stilovi ostaju u postojećem
  registru/IDB; obični Tema i stil podtab zadržava univerzalne kontrole.
- Tri podtaba imaju fiksni grid bez preklapanja na malim ekranima. Provjereno
  stvarnim fajlom 17.305 ćelija, svih sedam dugmadi/SQLite brojeva, 8 rasporeda
  novog podtaba u day/dark modu i 8 rasporeda editora. Drugi GPKG ne ulazi u
  podtab; hide/reload, ulaz iz listinga, uklanjanje ciljnog fajla i prazno
  stanje prošli. Postojeći thematic-files test prošao (3000 poligona, IDB,
  greške prostora/naloga, 16 rasporeda), svih100 JS grupa i pet inline sintaksi.
- Web/SW/Android 2.6.9/code539. Završni APK build/objava u toku. Originalni
  attachment nije u repou/CI/APK-u; CI test i dalje generiše sintetički fajl.
  Fizički telefon i produkcijski Supabase nisu testirani ni mijenjani.

- Konačna potvrda 2.6.9: CI 37900476733/source dfa64e9c8fca887cdf1ca79ee50a3474b0d60984
  uspješan. Objavljen v2.6.9/code539 APK 24.192.080 B; SHA256
  46cb54c49723060ce8487da9a0a8069ba7c5ff7772d37b39e9b16c9e55ff9225.
  Preuzet stvarni CI APK i Android XML: svih14 testova prošlo, bez skipova.
  Binary manifest ba.spd.uss.vlake.debug / 2.6.9-debug / 539; certifikat
  11fcd020c703053324ae26baf7a8207373711341f503277a90ec08a8468f286d
  isti kao prethodne verzije. Svih61 assets identični tačnom izvoru; release
  veličina/digest poklapaju APK. Updater releases?per_page=1 vraća v2.6.9
  i javni app-debug.apk. Release opis dopunjen izmjenama podtaba; javni Pages
  index.html je 2.6.9 i sadrži Sadnja podtab.

### 2026-10-09 — ručno crtanje bez samostalnog produženja i GPS kontrole Doznake (2.7.0)

- Korisnik prijavljuje završni segment oko200 m prema jugu pri ručnom crtanju
  i traži GPS kontrole Doznake na karti, na mjestu kontrola snimanja vlake.
- Uzrok reproduciran: ručni Crtaj i stariji Vuci slušaju Leaflet move, koji
  se emituje i tokom inercije nakon puštanja prsta, GPS/programskog pan-a,
  zoom-a i resize-a. Novi test nad stvarnim Leaflet-om pada na starom move
  kodu već kod produženja nakon mouseup-a. Oba toka sada slušaju samo drag;
  otkačivanje koristi isti događaj. Tačka i Undo zadržavaju postojeći tok.
  Manual panel i Doznaka kontrole uključeni u zaštitu od propagacije
  klikova/touchstart/scroll na kartu.
- Doznaka kontrole premještene unutar glavnog prikaza, u kompaktan banner
  iznad karte; bez full-screen backdrop-a ili blokiranja karte/fokus-trap-a.
  Počni GPS/ponovno otvaranje prelazi na Kartu. Prikazani odjel, projektant,
  aktivno/pauza stanje, dužina, vrijeme i signal; Pauza/Nastavi i Završi.
  Dok je otvoren, banner vlake, obična donja akcijska traka i dupli rec-bar
  su sklonjeni. Sklanjanje vraća trake i nastavlja isti GPS watch; završetak
  i dalje čeka trajnu potvrdu, ne mijenja session/IDB/filtere/slanje.
- Prošao novi browser test manual-draw-270 (miš i CDP touch, CPU4x, inercija,
  simulirani200 m južni pomak, resize/zoom, finish, tačka/Undo, stariji Vuci).
  GPS test potvrđuje Karta/poziciju unutar main-a, skrivene duple trake i
  slobodnu kartu, osam day/dark rasporeda, pauzu/nastavak, minimiziranje,
  ponovni ulaz, neuspjeli trajni finish/retry, stop u pauzi i IDB reload.
  Prošlo svih100 JS grupa, pet inline sintaksi, Doznaka restore i overlay
  test. Puni app test: CPU4x, ubrzanih5 h, 3564 prihvaćene tačke vlaka i1723
  doznake, svih1723 vraćeno iz IDB, bez mrežnih upisa. Ovo nije fizički telefon
  ni mjerenje baterije; produkcijski Supabase nije korišten/mijenjan.
- Web/SW/Android 2.7.0/code540. Završni APK build/objava u toku.

- Konačna potvrda 2.7.0: CI 37921217459/source
  1d33653848005a5ba9ad1388a279b9a4fb3ac928 uspješan. APK 24.192.288 B,
  SHA256 f817f1188647749c897acf4b9519a6b8767cd1d8d83804c77ad68cbb1a082e16.
  Stvarni preuzeti APK: ba.spd.uss.vlake.debug / 2.7.0-debug / code540;
  stabilni certifikat 11fcd020c703053324ae26baf7a8207373711341f503277a90ec08a8468f286d.
  Svih61 web resursa identični izvoru; release digest i veličina poklapaju se.
  Android XML:14 testova,0 grešaka/padova/preskakanja. Updater popis vraća
  v2.7.0 s javnim app-debug.apk. Pages uspješno objavljen s 2.7.0 i drag fixom.

### 2026-10-09 — pregled u četiri dijela, popravke dijelova 1 i 2 (2.7.1)

- Korisnik izričito traži podjelu u fajl prije pregleda i kompletne popravke
  prva dva dijela (bugovi/kod/dizajn). Podjela i detaljni nalazi u
  docs/APP_PREGLED_4_DIJELA.md. Dijelovi3/4 ostaju planirani.
- Karte: stvarni zadani Leaflet Canvas nije crtao SVG url šrafure; dodan
  mali ponovljivi CanvasPattern sa jačinom; nepreuzet KML bez grupe se ne
  stilizuje prije preuzimanja (regresijski pokriveno). SVG identitet grupe umjesto
  indeksa uklanja koliziju pri del/add (novi test pada na2.7.0). Kasne pune
  fotografije vezane za objekat/nalog/pregled, ne promjenjiv indeks. Native
  odbijeno uklanjanje ne briše IDB metadata; baza se zatvara, UI ne prijavljuje
  lažni uspjeh; uspjeh čisti samo ciljane prefs/thumbnail/last/fav. Moje karte
  imaju direktnu zvjezdicu44px i razlikuju povezan od kopiranog fajla.
- Vlake: Enter nije provjeravao upisan naziv, pa je zaobilazio deaktivirano
  dugme za brisanje. Akcija sada provjerava tačan naziv i snapshot
  objekta/naloga/projekta; promjenjiv indeks ne mijenja cilj; GPS mora biti
  završen. Skrivanje projekta obuhvata kolegine linije/nazive i update, a
  stari keš drugog projekta ne utiče na brojeve/duplikate/STD. Generacija
  aktivacije štiti await i odgođeni zoom. Stari markeri naziva ne ostaju u
  globalnoj listi. Kolegina kartica otvara isti popup/bafer, tipkovnica radi.
  Sort/filter/search trajni po nalogu/projektu; sažetak i Očisti filtere;
  Projekti link zaista otvara tab, naziv escape.
- Novi full-app CPU4x browser test audit-parts-271 pokriva stvarni Canvas/SVG,
  IDB/native refusal/cleanup, foto race, Enter/scope/reorder, kolege hide/
  update/bafer, P→Q→P kasne aktivacije, restart/filtere/naloge i6layouta.
  Prošlo100 JS grupa/5inline sintaksi, MBTiles pregled, KML/SHP restart,
  26loadmap/24projekat prikaza, kolege/admin/Turf, strelice/outline, tematski
  višeuvozni3000poligona i stvarni korisnikov GPKG17.305ćelija/svih7vrsta.
  Ubrzanih5hCPU4x:3564vlaka/1723Doznaka tačaka,1723IDBrestore,0vanjskihupisa.
  OriginalniGPKG nije u repou/APK-u; fizički telefon/produkcijskiSupabase
  nisu testirani. Web/SW/Android2.7.1/code541; završni CI/APK slijedi.

- Konačna potvrda 2.7.1: CI 37925233858/source
  3750ade6ca7ca5652dcd33852f00368f803ca452 uspješan. Preuzet APK 24.200.540 B;
  SHA256 c747ec5a1c7209c9fed55d72e06b541abb8038cf975b7726196bce4d9b9cb6f3.
  Android XML: 14 testova, 0 grešaka/padova/preskakanja. Manifest:
  ba.spd.uss.vlake.debug / 2.7.1-debug / code541, isti certifikat
  11fcd020c703053324ae26baf7a8207373711341f503277a90ec08a8468f286d.
  Svih 61 assets identični izvoru; release digest/veličina podudarni. Updater
  vraća prvi v2.7.1 s app-debug.apk; četiri izmijenjena javna Pages fajla
  SHA256 poređenjem odgovaraju izvoru. Zapis dijelova 1/2 dopunjen isporukom;
  dijelovi 3/4 ostaju planirani.


## 9. 10. 2026 — završetak pregleda dijelova 3/4, 2.7.2 / code542

Na izričit zahtjev korisnika pregledani i popravljeni Doznaka/Teren, server,
pristup i ažuriranje; obuhvat, nalazi i ograničenja su u
[APP_PREGLED_4_DIJELA.md](APP_PREGLED_4_DIJELA.md).
GPS finish/back ostaje na odjelu ako IDB upis ne uspije; ne mijenja se odjel
tokom snimanja. QR kamera poništava kasne streamove. Geometrijski memo
prepoznaje korekciju koordinata/vremena i bez promjene broja tačaka.
GPS serije i pojedinačni put potvrđuju stvarne tačke prije ACK-a; projekat,
Doznaka odjel/zona potvrđuju traženi sadržaj i vlasnika čak i pri 23505.
Prijem i provjera odobrenja imaju dodatne zaštite od promjene odjela/naloga.
Native UpdateBridge provjerava Content-Range i GitHub SHA-256 kada postoji.
**Novi SQL potreban samo za brisanje cijelog odjela:**
`supabase/migrations/20261009_doz_atomic_delete.sql` — autorizovana jedna
transakcija za kreatora/aktivnog managera. Nije primijenjen na produkciji.
Bez njega brisanje se sigurno zaustavlja; nema povratka na četiri DELETE-a.
Novi puni browser test/JS test, izolovani PostgreSQL rollback test i dvije
Android provjere sadržaja/raspona.

Konačna potvrda 2.7.2: CI 37933659942/source
`2c3d1313ebf81eaa2734b8c5d8a09482f8ef37d6` uspješan. 101 JS grupa,
PostgreSQL testovi, puni browser skup i 16 Android emulator testova bez
grešaka/padova/preskakanja. Preuzet APK: 24.209.980 B, SHA-256
`28945c54de77ad9a725770862697484deb46f9636e55b79ab91eb9aa55bcce05`;
paket `ba.spd.uss.vlake.debug` / 2.7.2-debug / code542. Svih 61 web assets
identično izvoru i isti stabilni certifikat kao 2.7.1. Release digest i
veličina podudarni; updater prvi vraća v2.7.2/app-debug.apk. Pet javnih
Pages fajlova identično izvoru; Pages CI 37933659357 uspješan. Sva četiri
dijela pregleda završena. SQL brisanja nije primijenjen na produkciji;
fizički telefon, baterija i produkcijska baza ostaju neprovjereni.

## 9. 10. 2026 — jednostavniji Pošalji na server (2.7.3 / code543)

Na zahtjev korisnika pojednostavljen prikaz Servera. Kraći header, tri
kompaktna taba redom Za slanje / Poslano / Primljeno; Za slanje je početni
tab pri prvom ulazu ili promjeni naloga. Manje obojenih površina i duplih
opisa; jedan istaknut Pošalji i primi. Aktivni projekat i prijavljeni
projektant ostaju jasno vidljivi, cilj i autor svake stavke u grupama.
Vremena zadnje razmjene, ispis projekta i sigurnosna kopija sklopljeni su
ispod glavnog pregleda. Status razmjene ima kratak sažetak i proširive
korake; greška/RLS ostaje vidljiva u sažetku i kada su koraci sklopljeni.
Otvoreni detalji razmjene ostaju otvoreni pri osvježavanju. Slanje, ACK,
offline dnevnik, RLS, grupisanje tri projekta/dani i prikaz na karti koriste
postojeće tokove; nema SQL dopune za ovaj dizajn.

Lokalno: svih 101 JS grupa, 5 inline sintaksi; browser menu-tools i
server-design (19 PNG, 320px/landscape/dan/tamni mod, upozorenje i toggle),
stvarni kontrolisani Supabase HTTP server-confirm i puna audit-parts-272
regresija. Testne pretpostavke početnog taba i sklopljenih vremena
ažurirane da provjere novi korisnički tok. Produkcija nije korištena.
Web/SW/Android 2.7.3/code543; CI/APK identitet dopuniti poslije builda.


Dopune istog još neobjavljenog 2.7.3 na posljednje zahtjeve:
- Raster SQLiteDB/MBTiles/GPKG podloge ostaju na uređaju pri promjeni naloga;
  `_wipeAllLocalUserData` više ne poziva `sqlmapClearAll`. Privatni KML,
  fotografije i terenski zapisi ostaju odvojeni/arhivirani po korisniku.
  Logout resetuje startup generaciju; stari odgođeni restore ne prelazi u novi nalog.
- Projektanti se dedupliciraju po ID-u, uključujući vlasnika u članovima.
  Tuđi vlasnik ne preuzima ime trenutnog profila; broj članova i predaja koriste isti tim.
- Tastatura Vlaka u postojećem dijalogu/listu: brojevi, T/ABC/BH slova, tačka,
  brisanje i pomjeranje kursora; fizička tastatura ostaje upotrebljiva.
  Zakašnjelo zatvaranje starog dijaloga ne uklanja overlay novog.
- Kompaktne slike i kartice offline podloga, uklonjeni traženi opisni blokovi.
  Teren redom pozicija/sunce/azimut; poligon i teren zadnji u Projektu.
  Veliko crveno dugme brisanja; postojeće potvrde ostaju.
- Jedinstveno uklanjanje svih slojeva vlake (lager, outline preko Leafleta,
  strelice, oznake, nagib, wpts), uključujući spajanje i čišćenje kolega.
  Ispravljen sudar globalne crvene `.r` klase s ćelijama statistike; neutralni pregled.
- Štampa: vlaka/krak podrazumijevano 1.4/1.2 px, jedna isprekidana linija bez
  outlinea. Ostaju podesivi boja/debljina/crtice. DEM >30% već vidljive maske
  pretvaraju se u crvene SVG poligone za štampu (rupe ostaju prazne; bez
  izmišljene geometrije ili novog preuzimanja). Izvorni stil i raster se vraćaju.
- Admin aktivnost: zaseban zapis stvarnog UI/GPS rada, minutni ritam slanja,
  opažanje offline vezano za vlasnika. Nema označavanja aktivnosti samom prijavom.
  `supabase/migrations/20261009_app_user_activity.sql` mora korisnik izvršiti
  u Supabase SQL Editoru da server čuva/pokazuje aktivnost; produkcija nije dirana.
  Migracija je idempotentna; samo vlastiti zapis preko RPC-a, pregled samo admin.

Lokalno: 103 JS grupe; novi puni device-workflow test sa stvarnim Leafletom,
SQLite workerom/IDB rasterom, istim i drugim nalogom, hladnim restartom,
tastaturom, markerima i admin datumom; print test generiše PDF i provjerava
SVG poligone/vraćanje; pravi izolovani PostgreSQL test aktivnosti. Završni
CI/APK dokaz dopuniti nakon builda. Fizički telefon i produkcijska baza nisu testirani.

Posljednja dopuna istog builda: poruka nove verzije je cijela klikabilna,
ima jasnu akciju Ažuriraj i zasebno zatvaranje; otvara isti postojeći tok
Menija/AndroidUpdate. APK provjera koristi objavljeni GitHub release s APK
assetom, umjesto Pages verzije koja može stići prije završetka builda.
Meni → Baterija i automatsko pokretanje: standardno Android izuzeće, Xiaomi/
Redmi/POCO autostart ekran s rezervnim putem u postavke ove aplikacije,
plus prečica za OEM Baterija → Bez ograničenja. Korisnik potvrđuje postavke;
Android ne nudi pouzdano čitanje autostarta i UI ne tvrdi da je uključen.
Tri nova emulator testa provjeravaju stvarni package URI i fallback pri
nepostojećoj/zabranjenoj OEM Activity, bez otvaranja stvarnih dozvola.
Debeli segmentni nagib vlake privremeno se skriva pri štampi, da ostane
samo jedna tanka isprekidana linija. Projektni DEM nagib uključuje legendu.

Dodatna lokalna provjera: 104 JS grupe (novi test otkriva samo objavljeni
APK i preskače draft/nedovršen asset), 5 inline sintaksi, device-workflow
uključuje punu aplikaciju pri promjeni print razmjere, skrivanje/vraćanje
segmentnih nagiba, klik/zatvaranje poruke verzije i sva tri native dugmeta
preko kontrolisanog mosta. Print/PDF provjera ponovo uspješna.

Prvi CI 37963777309: JS/SQL i puni device-workflow uspješni; zaustavljen na
staroj pretpostavci offline-preview o širokoj sličici (ratio >1.6), koju je
korisnikov zahtjev za manjim karticama zamijenio kvadratom 84px. Test sada
provjerava kompaktne dimenzije u svih 8 rasporeda; provjere stvarnih raster
piksela, keša i obnove ostaju. Ponovljeni CI mora proći prije isporuke.

Preostali browser skup lokalno provjeren do kraja nakon dopune izdvojenog
Server/Leaflet fixturea stvarnom `_removeVlakaMapLayers` zavisnošću. Test
preglednika bira novi tab Primljeno prije širenja grupe; test projekta
provjerava novi traženi redoslijed s poligonom na dnu. Pozitivne provjere
stvarnog bafera, mapa, boja, GPS doznake i terenske 5400m simulacije ostaju;
sve prošle. CI 37964494791 namjerno prekinut radi ovih fixture dopuna;
isporuku određuje naredni puni CI, ne prekinuti build.

Aktivnost dodatno veže opaženi nalog kroz `app_record_activity_for_user`:
server provjerava da je isti kao auth.uid, pa promjena JWT sesije tokom
slanja ne pripisuje opažanje drugom korisniku. Postojeća osnovna funkcija
ostaje kompatibilna; novi klijent koristi provjereni wrapper. Lokalni JS i
izolovani SQL test uključuju ID naloga i odbijanje pogrešnog identiteta.


Konačna potvrda isporuke 2.7.3: CI 37965559455/source
`a724b6ef423ba29a4fd40c2d73657dcfb3c7dc1f` uspješan. 104 JS grupe,
izolovani SQL probni pristup/brisanje/aktivnost, puni browser skup i 19
Android emulator testova bez padova, grešaka ili preskakanja. Preuzet APK
24.222.776 B (24,22 MB), SHA-256
`b8ea4e0263303979861ed7917dda5a5eddc96779aca4b9ad92719dad4f2951a9`;
`ba.spd.uss.vlake.debug` / 2.7.3-debug / code543. Svih 64 web assets
podudarno izvoru. Stabilni certifikat ostaje
`11fcd020c703053324ae26baf7a8207373711341f503277a90ec08a8468f286d`.
GitHub release v2.7.3 (408169014), app-debug.apk digest/veličina identični;
updaterov releases?per_page=1 prvi vraća v2.7.3 s uploaded APK-om. Pages
37965557728 uspješan; šest provjerenih javnih fajlova identično izvoru.
SQL 20261009_app_user_activity.sql korisnik mora izvršiti u Supabase SQL
Editoru; produkcija nije mijenjana. Aktivnost se bilježi tek nakon SQL
primjene i ažuriranja klijenata; prethodna istorija rada nije rekonstruisana.
Fizički Xiaomi, OEM autostart i baterija nisu testirani; emulator provjerava
package URI, odabir Xiaomi puta i fallback pri zabranjenom/nedostupnom ekranu.
APK je objavljen i provjeren za ažuriranje postojeće CODEX debug instalacije.


### 2.7.4 — kontrast, navigacija, štampa i prvi pogled rasterske karte

Zahtjev korisnika: jači Dnevni mod, kontrole ispod koordinata, uklanjanje
Spremno za teren/sigurnosna kopija, kraći izbor Vodi me, jedna tanka linija
vlake u štampi, odziv štampe i centriran prvi pogled karte do 1:50.000.
Pregled stvarnih computed stilova otkrio svijetla imena/uspone/nagibe na
bijelom i tamne stare kartice sa tamnim tekstom. Tamniji dnevni tonovi,
usklađene stare površine i kontrole; test kontrasta teksta >=4.5 na glavnim
tabovima i 19 prozora/pregleda (fake podaci, vanjski upisi blokirani).
ResizeObserver mjeri visinu nv-badge; zoom/slojevi/izbor razmjere imaju
8 px razmaka i kad se koordinate prelome, na 320/390/568/1280 px.
Uklonjeni oba ulaza i cijeli modal pripreme. KML izvoz i postojeći
programski backup/restore podataka sačuvani; nema brisanja korisničkih podataka.
Vođenje zadržava oba toka i sačuvane rute, uz dvije kratke opcije.

Legenda vlake/kraka više ne umnožava SVG uzorke za svaku koleginu boju;
jedan tanki uzorak, stvarne boje linija ostaju na karti. Stil štampe ne
uključuje outline i ne radi vraćanje/primjenu identičnog stila na svaki
pomak. DEM >30% maska obrađuje se izvan UI threada u lokalnom Workeru,
sekvencijalno po pločici; i prazne maske su keširane. PDF čeka dovršetak;
zatvaranje otkazuje posao i vraća izvor. CPU4 test guste maske: 22 poslova,
10 poligona, 55 otkucaja UI tajmera, kontrole dostupne tokom obrade. To
nije reprodukcija stvarnog prijavljenog zastajkivanja na Xiaomi telefonu.

Prvi uvoz/izbor rasterske SQLiteDB/MBTiles/GPKG karte centriran na njen
bounds (fallback center), zoom daje razmjeru najviše 1:50.000. Posljednji
kadar čuva se u postojećim uređajskim sqlmap prefs po karti i globalno.
Print privremeni kadar ne prepisuje posljednji terenski položaj. Stvarni
IDB/raster test potvrđuje centar/razmjeru i hladni restart zadnjeg kadra,
uz toleranciju jednog projekcijskog piksela. Nova karta ne ostavlja sve
stare rastere uključene paralelno. Nije mijenjan Supabase niti server tok.
Verzije web/SW/Android 2.7.4, Android code544; APK/CI dokaz slijedi.

Lokale prije objave: 104 JS grupe i inline sintaksa uspješni; puni CI
browser skup izvršen lokalno, uključujući nove day-layout/print-responsive
provjere. Testni izrezi ažurirani za novu zavisnost auto-pogleda i kraći GPS
status; SHP/KML uvoz, stvarni raster/IDB, pravila boja i outline i štampa
ponovo provjereni. field-design.cjs: 320/360/412/768 px, tema se pamti,
promjena teme ne zaustavlja snimanje, red ostaje identičan i nema JS grešaka.
SQL/native kod nisu mijenjani; puni build ih ipak ponovo provjerava.


Konačna potvrda isporuke 2.7.4 (provjera 10.10.2026): CI
37974491481, source `76103c4409fad4e8c1981e24e584864cc027ada7`,
sve faze uspješne: JS, izolovani SQL, puni browser skup, build, 19 Android
emulator testova (0 failures/errors/skipped), objava i analiza brzine.
Preuzet APK 24.227.396 B (24,23 MB), SHA-256
`bfafbc86ac4932dbd3dfbe7172729293eeceba0b7848d1ee9b7a6e2d5604bcd7`;
manifest ba.spd.uss.vlake.debug / 2.7.4-debug / code544. Svih 65 web assets
podudarno lokalnom izvoru. Certifikat prethodne instalacije sačuvan:
`11fcd020c703053324ae26baf7a8207373711341f503277a90ec08a8468f286d`.
Release v2.7.4 (408233386), uploaded app-debug.apk, isti digest i veličina;
updaterov releases?per_page=1 vraća v2.7.4 na prvom mjestu. Pages
37974490036 uspješan s istim source SHA; javni index.html, sw.js,
field-design.js/CSS, print-slope.js i novi worker identični izvoru.
APK: https://github.com/pogonboskrupa/US-SUME/releases/download/v2.7.4/app-debug.apk
Fizički Xiaomi i prijavljeno zastajkivanje na njemu nisu direktno testirani;
provjera odziva je browser CPU4 simulacija, uz zasebne Android emulator provjere.
Produkcijski Supabase nije mijenjan.


## 2.7.5 — dnevni kontrast, dnevnik projekta, Granice i dvosmjer (10.10.2026)

Zahtjevi korisnika: provjera Dnevnog moda na admin/projektant panelima;
ispravna pripadnost dnevnika projektu; uklanjanje vremenske trake i tematske
karte iz Podloge i slojevi; premještanje dodatnih slojeva u Granice; klikom
odabrani dvosmjer završene ručne vlake/kraka. Potvrđen izvor novih KML:
pogonboskrupa/KARTE → Releases, korisnik je već objavio Granice odjela i
Kamionski putevi. Verzije: index/SW 2.7.5, Android code545.

Dnevni tekst koristi tamnu boju i svijetle površine i u ugniježđenim
prozorima: stvarni GPKG klasni prikaz/tabela/kolone/popup, KML i karte,
admin korisnici/projekti, snimanje, doznaka, navigacija, štampa, autentikacija.
Boje geometrije, rastera i paleta ostaju. Onemogućena dugmad nisu aktivirana.
Novi browser test day-all-panels-275.py provjerava 144 stanja za obje uloge,
sa popunjenim dnevnicima, KML/photo/tragovima i stvarnim sintetičkim GPKG.

Dnevnik sada filtrira projektId i autora; novi lokalni zapisi sadrže ID
projekta/korisnika/šumariju/GJ. Stari zapisi bez ID-a prikazuju se samo kad
odjel/GJ/šumarija jednoznačno odgovaraju projektu i projektant pripada timu.
Dvosmisleni zapisi nisu obrisani niti pogrešno pripisani. Brisanje dnevnika
briše samo aktivni lokalni projekat; nema poziva za globalno brisanje servera.
Admin detalji, statistika, PDF/KML dnevnika koriste isti projektni filter.
Novi dnevnici kolega i dalje se ne šalju serveru; jasno označeno u prikazu.
Nema produkcijske migracije ili promjene Supabase podataka.

Vremenska traka: uklonjeni UI, runtime, SW rute/asset i winter-imagery.js.
DEM i keš/offline testovi ostaju. Tematska karta je u vlastitoj sekciji Menija;
njen jedini file picker je unutar tog modala. Granice sadrže postojeće
prekidače puteva/granica/nagiba vlaka i katalog javnih GitHub KML assets.
Native KmlDownloads koristi postojeći strogo ograničen GitHub transport,
odvojene kataloge Drive/GitHub, validaciju veličine i XML-a, bez UI thread
preuzimanja. Nakon uvoza KML ostaje u postojećem trajnom lokalnom spremištu
korisnika; prikaz/sakrivanje/stilovi ostaju u pregledniku oznaka.

Dvosmjer: u popupu završene vlake jasno dugme Odredi/Pomjeri dvosmjer,
korisnik bira tačku. Prije nje smjer ide ka početku, poslije ka kraju;
jedan ↔ znak na tački. Bez automatskog postavljanja na polovinu.
Testirana završena ručna vlaka i krak s tačkom na 20% odnosno 80%.

Lokalno prošlo 104 JS grupe i puni workflow browser skup, uključujući
3.000 m svojih + 2.400 m koleginih vlaka, 1.360/5.410 tačaka, CPU1x/4x,
online/offline i mrtvu/slabu mrežu. Novi emulator test provjerava GitHub KML
katalog/preuzimanje/sačuvani fajl bez produkcijske mreže.
Stvarni javni fajlovi provjereni read-only: KAMIONSKI.PUTEVI.kml 396.070 B,
SHA256 d3122a19db88f01102f9f6e988116d3ebbf0e8e20fa3452de83a56c60c91cb14;
GRANICE.kml 13.250.101 B,
SHA256 758d1847c0f138622fedba50950b507f9981581a1d621372dd2fa5999774200c.
Veličine/digest podudarni objavljenim GitHub assets. Fizički Xiaomi nije
korišten; APK/emulator i objavu još treba potvrditi završnim CI rezultatom.

Završna lokalna potvrda: 144 stanja × širine 320/390/1280 px, 0 slabih
kontrasta, 0 JS grešaka i 0 vanjskih upisa. Stvarni javni KML uvoz i offline
ponovno otvaranje kroz postojeći parser/spremište: 83 stavke puteva i
2.759 stavki granica. Native transport u toj browser provjeri je zamijenjen
fixture mostom; stvarni javni bajtovi i digest provjereni odvojeno.


Konačna potvrda isporuke 2.7.5 (10.10.2026): CI 38032665499 uspješan,
source 70138d2b652899e2358d7db2f00db38e74951439; JS, izolovani SQL,
puni browser skup, native build, svih 64 web assets i manji APK, 20 Android
emulator testova (0 failures/errors/skipped), uključujući novi GitHub KML
native test, objava i analiza brzine. CI izvještaj dnevnog kontrasta: 144
stanja, 0 nedostataka i 0 JS grešaka. Pages 38032665121 uspješan; javni
index/SW/CSS/local-layer-import/vlaka-direction bajtovi identični izvoru.
Preuzet javni APK 24.225.984 B (24,23 MB), SHA256
727fb96bd3664a3377841e017a8eacc84226f2252fba52618878e2cdee2ce7ce.
Manifest ba.spd.uss.vlake.debug / 2.7.5-debug / code545. Certifikat sačuvan:
11fcd020c703053324ae26baf7a8207373711341f503277a90ec08a8468f286d.
Release v2.7.5 (408758748), asset app-debug.apk (627272775), uploaded,
veličina i digest podudarni lokalno preuzetom APK-u. Updaterov
releases?per_page=1 vraća v2.7.5 na prvom mjestu.
APK: https://github.com/pogonboskrupa/US-SUME/releases/download/v2.7.5/app-debug.apk
Fizički Xiaomi i produkcijski Supabase nisu testirani/mijenjani.

10.10.2026 — 2.7.6 / Android code546: novi projekat Doznaka odmah nudi
Ucrtaj na karti ili Izaberi iz sloja, prije unosa GJ/odjela. Korisnik je
izričito precizirao: SAMO ručni izbor, bez atributa fajla. Klik na opciju
otvara kartu, pojedinačni dodiri biraju/uklanjaju poligone; moguće više
odsjeka. Dodatna Lista poligona nudi geometrijsku površinu, izvor, položaj
i grupni izbor samo poligona u trenutnom prikazu. Nema čitanja atributa
GJ/odjel/odsjek, pretrage po atributima niti automatskog upisa naziva.
GJ/odjel upisuje korisnik. Grupni izbor ograničen na 300, listanje prvih
80 uz približavanje karte/ručni izbor na karti.
Union susjednih/preklopljenih poligona i površina rade u offline workeru
s postojećim lokalnim Turf-om; odvojeni dijelovi ostaju MultiPolygon,
rupe se čuvaju. Nema produkcijske SQL promjene ili upisa u Supabase.
Unos GJ nakon izbora ne briše granicu/odjel. Odustajanje od novog crteža
ili izbora vraća prethodnu granicu i trajnu vidljivost/stil sloja.

Granice → Prikaz slojeva: prekidači sada upravljaju istim GitHub KML
grupama kao Preglednik oznaka, prozirnost upravlja preuzetim granicama.
Izvor sačuvan u importu i vraćen pri IDB restore; podržani ranije
preuzeti GitHub slojevi iz 2.7.5. Stari ugrađeni prikaz se uklanja kad
stvarni GitHub sloj postoji, radi uklanjanja duplih linija. Kontrole bez
preuzetog odgovarajućeg sloja su neaktivne, s porukom za preuzimanje.
Preuzimanje pokrenuto iz novog projekta vraća na popunjeni obrazac,
uz provjeru da nalog nije promijenjen.
Upute u aplikaciji prepisane za novi redoslijed kreiranja, preuzimanje,
ručni izbor više odsjeka bez atributa i kontrole GitHub slojeva.

Lokalno: svih 105 JS grupa prošlo. Nova puna browser provjera: stvarni
KML parser/IDB, skriveni izvor, ručni map klik za dva odsjeka uz worker
union, površina bez dvostrukog brojanja, udaljen poligon nije ponuđen,
bez automatskog unosa GJ/odjela, crtanje prije unosa GJ, cancel i offline
enqueue bez vanjskih upisa, restart vidljivosti/prozirnosti/boje.
Dnevni kontrast preglednika prošao na 390 i 320 px. Stvarni javni
GRANICE.kml 13.250.101 B s 2.759 poligona: uvoz, ručni izbor, worker,
površina 3,24138 ha provjereni lokalno, bez korištenja atributa.
Širi browser skup prošao (tematske karte, prefs/IDB, manual draw CPU4x,
Doznaka šest dana/četiri člana/60 pojaseva, GPS kontrole, offline restore,
server/lageri/print, granica OCR, navigacija, bafer kolege, slaba mreža).
Stari test strelica jednom pao na vremenu klika prije završetka map
animacije; ciljano ponovno pokretanje prošlo bez promjene implementacije.
Native transport u browser provjerama je izolovan; ne tvrditi da je
fizički Xiaomi ili produkcijski Supabase testiran. APK/emulator/objavu
potvrditi završnim CI rezultatom ispod.

Konačna potvrda 2.7.6 (10.10.2026): CI 38035204574 uspješan, izvor
 e31bd9c1751bbfb629263beb59ed01b727758180. Svih 105 JS grupa, izolovani
SQL, puni browser skup s novim ručnim izborom bez atributa, native build,
65 assets, 20 Android emulator testova (0 failures/errors/skipped), objava
i analiza brzine prošli. CI audit: 144 prikaza, 0 slabih kontrasta,
0 JS grešaka, 0 vanjskih upisa. Pages 38035204658 uspješan; javni
index/SW/new-boundary-module/local-layer-import/CSS identični izvoru.
Preuzet javni APK 24.240.822 B (24,24 MB), SHA256
5688d9a286cada2ced3feab635c774a53d07412ce2d8027164af6ec67fe057ea;
manifest ba.spd.uss.vlake.debug / 2.7.6-debug / code546. Certifikat isti:
11fcd020c703053324ae26baf7a8207373711341f503277a90ec08a8468f286d.
Release v2.7.6 (408784579), app-debug.apk (627356388), uploaded;
veličina/digest podudarni. Updater releases?per_page=1 vraća v2.7.6 prvo.
APK: https://github.com/pogonboskrupa/US-SUME/releases/download/v2.7.6/app-debug.apk
Fizički Xiaomi i produkcijski Supabase nisu testirani/mijenjani.

## 2.7.7 / Android547 — KML, vlastito članstvo i Izvještaj odjela

Na zahtjev korisnika: KML/SHP kartice imaju stvarni vektorski pregled,
pregledniji urednik boje/debljine/isprekidanosti/vidljivosti obruba i boje/
jačine ispune. Granice i Kamionski putevi su jasno razdvojeni. Stvarna
ispuna 0% ostaje klikabilna na Canvas/SVG; rupe poligona nisu klikabilne.
Klik daje čitljive podatke HTML-tabele iz fajla (sigurno kao tekst), površinu/
dužinu, opis i uređivanje naziva/stila. Stilovi se pamte putem postojećeg
IDB/local/server mehanizma; nested SHP geometrije se pravilno obrađuju.

Član može ukloniti kolegin projekat sa svog spiska Vlaka i Doznake.
Briše se isključivo vlastito članstvo, uz potvrdu ciljanog reda i provjeru
RLS praznog odgovora. Greška/izostanak potvrde čuva spisak i lokalni keš.
Snimanje/slanje i neposlani podaci blokiraju izlazak radi očuvanja rada.
Projekat i svi timski podaci ostaju vlasniku i drugim članovima. Povratak
traži da vlasnik ponovo doda člana. Postojeće DELETE-own-member politike
iz 20260713_dijeljenje_popravka.sql podržavaju ovo; nova SQL migracija se
ne uvodi i produkcijska baza nije mijenjana.

Poligon odjela i teren uklonjeni iz Projekat panela. Meni → Izvještaj
odjela je odvojena sekcija: nacrt granice sa undo/cancel/validacijom ili
ručni izbor više odsjeka iz preuzetog sloja Granice odjela. Ne koristi
atribute za automatski izbor/naziv; Doznaka obrazac se ne mijenja. Stari
poligon aktivnog projekta može se preuzeti u novi izvještaj; stari zapisi
ostaju za kompatibilnost sa štampom. Shared union Worker i izbor privremeno
prikazuju skriveni izvor pa vrate prethodni stil/vidljivost na završetku.

DEM report Worker računa šest razreda isključivo u procentima: 0–<10,
10–<20, 20–<30, 30–<40, 40–<50, ≥50; površina u ha i udio cijelog poligona;
četiri ekspozicije S/I/J/Z; raspon/prosjek visina, prosjek/maksimum nagiba,
pokrivenost uzorcima. WebMercator ground-scale, centralne derivacije sa
susjednim pločicama, četiri poduzorka rubnih ćelija, rupe/MultiPolygon.
Nedostajući uzorci nisu ravni teren. DEM je Mapzen/EU-DEM procjena oko 30 m
na USK, ne geodetsko mjerenje. Z12 se po potrebi smanjuje za velika područja;
ograničenje 160.000 ćelija / 81 pločica, tri paralelna dohvata, obrada van UI niti.
Karta: obojeni razredi, linije među razredima, izbor ekspozicije/samo granice,
prikaži/sakrij. Izračun i izbori se čuvaju lokalno po korisniku i vraćaju
pri pokretanju; već izračunat rezultat radi bez mreže, novi izračun radi
iz DEM keša ili online. Prekid/odjava terminiraju Worker, završavaju Promise
bez starog tajmera koji bi ubio novu obradu. Kvota ne briše staru granicu.

Zadnja prijava korisnika: „AbortError: Failed to fetch” pogrešno prikazivano
kao „Korisnik nije pronađen”. Lookup mrežna/timeout greška sada daje jasnu
poruku o vezi i ponovnom pokušaju, DB greška zasebnu serversku poruku;
„Korisnik nije pronađen” samo kad RPC uspije i ne vrati email. Ručno tražena
prijava smije probati vezu poslije izmjerenog slabog signala. Nema promjene
provjere PIN-a, prava pristupa niti offline bypass-a nakon izričite odjave.

Lokalno: KML editor full-app (Canvas/SVG, rupa, HTML-info, putevi/stilovi,
6 prikaza/kontrast, IDB restart, Vlake/Doznaka own-membership/RLS/socket/
unsent guard) prošao. Novi report full-app: stvarni Terrarium PNG dekoder,
worker union i DEM worker, višestruki ručni izbor bez Doznaka mutacije,
map overlay/linije, 6 prikaza, IDB restart, offline cache, cancel novog
Workera, quota očuvanje i izdvojeni nalozi prošli. DEM core test provjerava
pragove, četiri smjera, površine/rupe/disjoint/nedostajuće uzorke i visine.
Auth core test razlikuje fetch/Abort/timeout, missing user, RLS, pogrešan PIN,
ručni weak-signal retry i siguran keš. Audit 144 prikaza: 0 kontrastnih/JS/upis
grešaka; prefs/KML/SHP IDB, Doznaka selection276 i legacy terrain222 prošli.
67 assets uključuju novi report i DEM Worker. Upute ažurirane za sve tokove.
APK/emulator/objava će biti potvrđeni rezultatima CI-ja ispod; fizički Xiaomi
Redmi Note 13 Pro i produkcijski Supabase nisu testirani/mijenjani.
Završna provjera izvještaja: DEM pane je iznad KML overlay-a (445), pa
izračun ostaje vidljiv i uz punu KML ispunu; pointer-events:none ostavlja
klik izvornim geometrijama. Crtanje privremeno sakrije GPS alatnu traku i
tabove, a cancel/save vrate prethodni prikaz; novi puni browser test prošao.
Svih 107 JS grupa i sintaksa pet inline blokova/static JS prošli lokalno.
CI 38051624882 stao prije APK-a na zastarjelom device-workflow273 assertu
koji je tražio project-polygon na dnu Projekta. Taj assert i raspored u
project-vlake220 usklađeni su s korisnikovim premještanjem u Meni; oba puna
ciljana testa prošla lokalno. App kod je ostao isti. Završni CI ponoviti.
CI 38052011809 prošao JS/SQL/browser i build/67 SHA assets, ali Android
20 testova: 19 prošlo, 1 pao na završnoj obavijesti preuzimanja. MBTiles je
već instaliran, stvarna sličica prikazana; obavijest ostala „Čekam internet”.
Android stopForeground(DETACH) asinkrono ponovo objavljuje posljednji
ServiceRecord foreground snapshot. Sada prije detach-a startForeground
prima istu završnu obavijest, pa odgođeno uklanjanje flag-a ne može vratiti
stari napredak. Postojeći puni test i dalje traži završni tekst, ugašen servis,
bez ongoing flag-a, offline tile/reload/delete; kriteriji nisu oslabljeni.
Završna isporuka v2.7.7: CI 38052922997, izvor
 e3828ddc77a78914d9eb877246d4f5fceadeb418; svi koraci uspješni, uključujući
107 JS grupa, izolovani SQL, browser provjere, 20 Android API34 emulator
 testova (0 failure/error/skipped), 67 web assets SHA i analizu brzine.
Pages 38052922905 uspješan. Javni Release v2.7.7 / app-debug.apk,
24.280.851 B, SHA256
502a2a0e0ca20f69e340373e224fcf245937d9ebbe494499314423534240c3de.
Preuzeti javni APK: ba.spd.uss.vlake.debug, 2.7.7-debug/code547, svih67
asset hash-eva identično izvoru. Potpis kao prethodni APK:
11fcd020c703053324ae26baf7a8207373711341f503277a90ec08a8468f286d.
Supabase produkcija i fizički Xiaomi nisu mijenjani/testirani.
Korisnik zatim traži isključivo vizuelni PLAN ikona: Meni/Karta/Projekat/
Vlake i Snimi vlaku/Tragovi/Lokacija, plus sličice Menija. Prijedlog tek
poslije APK isporuke; ikone NE mijenjati prije korisnikovog izbora.


## 2026-10-10 — 2.7.8 / Android 548: odobrene ikone i rad vodećeg projektanta

Korisnik je odobrio sve slike prijedloga navigacije/Menija isporučene uz 2.7.7.
Implementirane su lokalne SVG ikone gornjeg/donjeg bara i 24 stavke Menija,
sa šest različitih kartografskih sličica. Kompaktni barovi, zelena aktivna
kartica i čitljiv dnevni/tamni prikaz. SVG i CSS su u SW precache-u i Android
manifestu assets (69 fajlova); ne zahtijevaju internet. Dinamičko dugme Dnevni
mod zadržava istu SVG ikonu poslije promjene prikaza. Launcher logo nije mijenjan.

Korisnik je izričito potvrdio da vodeći radi svoje projekte i projekte u koje
je dodan, kao ostali projektanti. `isReadOnly()` više ne blokira vodećeg,
Projekat/Vlake/Doznaka su vidljivi, učitavanje i offline keš koriste vlasništvo
ili članstvo. Vodeći se može dodati kao kolega i u Vlake i u Doznaku.
`Meni → Izvještaj šumarije` otvara odvojene RPC agregate projekata vlaka i
doznaka njegove šumarije; iz njega se otvara sedmični/mjesečni učinak.
Izvještaj ne prepisuje `_projekti`, aktivni ID ni radni keš. Tuđi nadzorni
projekat nema Aktiviraj. Zakasnjeli RPC se zanemaruje nakon promjene naloga,
šumarije ili ponovnog otvaranja običnog spiska. Automatsko otvaranje nadzora
pri prijavi je uklonjeno. Admin i ŠPD terenski nalog zadržavaju svoje uloge.
Upute dopunjene za vodećeg. Produkcijski Supabase i RLS nisu mijenjani.

Lokalno: 107 JS skupova prošlo, pet inline JS blokova sintaksno ispravno;
`navigation-design-278.py`: lokalni SVG stvarno nacrtani, 12 mobilnih/tablet
prikaza 320/390/800 px, dnevni kontrast, vlastiti/dijeljeni projekti, izdvojeni
nadzor, odbacivanje druge šumarije i starih nadzornih projekata iz offline
keša, promjena četiri uloge, zakasnjeli RPC. `day-all-panels-275.py`:
144 prikaza, nula slabih kontrasta. Device workflow, KML editor i Izvještaj
odjela prošli s pravim Leaflet/Canvas/IDB i lažnim servisima; nula vanjskih
upisa i JS grešaka. APK build/Android emulator i objava slijede kroz CI;
pravi Xiaomi i produkcijska baza nisu testirani. Python geo pytest se nije
pokrenuo jer pytest nije instaliran; geo kod nije mijenjan.

Isporuka 2.7.8 završena: source `e4f48df5cdb2eb7329f7e867ec9c856100a49c14`,
tree `2a042b45568d1d9419bb782961ca9c8112dfda65`, CI `38056881156` SUCCESS,
Pages `38056880850` SUCCESS. Android emulator: 20 testova, 0 grešaka,
0 padova i 0 preskočenih. Preuzet javni release APK: 24.305.608 B,
SHA-256 `cfc146b2578742d3841b899259db99d045ba4ff9ca2bd47a9d9907c8857a0d06`.
Binary manifest potvrđen: `ba.spd.uss.vlake.debug`, `2.7.8-debug`, code 548.
Certifikat ostaje `11fcd020c703053324ae26baf7a8207373711341f503277a90ec08a8468f286d`;
69 assets u stvarnom APK-u odgovara source-u. Javni SVG na Pages identičan
lokalnom. CI JSON potvrđuje nove ikone/četiri uloge/12 prikaza, KML editor,
izvještaj odjela i 144 dnevna prikaza bez kontrastnih grešaka; nula JS grešaka
ili vanjskih upisa. Fizički Xiaomi i produkcijska baza nisu testirani.
Release: https://github.com/pogonboskrupa/US-SUME/releases/tag/v2.7.8
APK: https://github.com/pogonboskrupa/US-SUME/releases/download/v2.7.8/app-debug.apk
Ažuriranje kroz Meni → Ažuriraj aplikaciju; updater koristi releases listu,
a ne /latest, jer su APK izdanja označena kao prerelease.

## 2026-10-10 — 2.7.9 / Android 549: granice samo za poligon i izvještaj na karti

Korisnik traži checkbox Samo za poligon za učitane Granice odjela. Dodan
u Podloge i slojevi → Granice i u stil svakog prepoznatog fajla granica s
poligonima (lokalni/server/GitHub). Postavka je privatna, čuva se uz stil i
lokalni registar, ne mijenja originalnu geometriju ni uobičajeni `vis` izbor.
Granice se privremeno prikazuju tokom ručnog crtanja ili izbora odsjeka za
Doznaku/Izvještaj; potvrda i odustajanje ponovo ih sakrivaju. Isključivanje
opcije vraća običnu vidljivost. Kamionski putevi zadržavaju svoj prikaz.
KML klik tokom crtanja granice Doznake dodaje jednu tačku umjesto info popupa.

Izvještaj odjela ima klikabilan poligon i jasnije kontrole prikaza, sakrivanja
te potvrđenog trajnog brisanja. Raster/linije ostaju bez presretanja klikova;
hit poligon koristi jedan ponovo korišten SVG renderer ispod radnih slojeva.
Proximity izbor vlaka i mjerenja ima prednost nad izvještajem. Izbor/crtanje
odsjeka privremeno isključuje hit poligon izvještaja. Transparentna ispuna,
rupe i više odsjeka zadržavaju geometriju, DEM rezultat i površine.
Legenda nagiba/ekspozicije: udio površine i iste boje kao raster, povlačenje
naziva, pomjeranje tastaturom, minimiziranje/proširivanje, gašenje i ponovno
uključivanje u izvještaju. Položaj i izbori pamte se po nalogu; kartica je
ograničena vidljivim dijelom karte iznad donjeg bara. Upute dopunjene.

Lokalni puni browser test izvještaja proširen stvarnim klikovima na SVG/KML,
povlačenjem legende bez pomjeranja karte, vlaka unutar izvještaja, šest
prikaza 320/390/800 px u oba moda, izbor/odustajanje/ručno crtanje Doznake,
restart svih izbora/rezultata, trajno brisanje bez brisanja KML-a i DEM
offline/worker prekid. Nema JS grešaka ni vanjskih upisa. KML editor i izbor
odsjeka prošli; 144 dnevna prikaza bez slabog kontrasta, navigacija i četiri
uloge prošli. Pet inline blokova sintaksno ispravno; 69 assets pripremljeno.
Produkcijska baza nije mijenjana; fizički Xiaomi nije testiran. APK/CI
isporuka i provjera javnog fajla slijede.

Prvi CI 38071338797 stao u novom browser testu ručnog crtanja Doznake:
pozicija poznatog KML poligona nakon restarta bila je izvan vidljive karte,
pa stvarni klik nije mogao biti izvršen. Test sada čeka vidljiv banner,
postavlja kartu na fixture odjel i ponovo računa piksel; stvarni klik i
assert jedne tačke ostaju. Funkcionalni kod nije mijenjan; APK nije bio
objavljen. Ponovljeni lokalni puni test prošao. CI se ponavlja.
Ponovljeni CI 38071856159 prošao puni novi izvještaj, izbor odsjeka,
KML editor i četiri uloge. Stao kasnije u historijskom izdvojenom fixture-u
menu-tools: KML popup sada čita stanje crtanja granice Doznake, a fixture
nije učitavao taj modul. Dodani su window defaulti null/false, tako da ne
prave duplu let deklaraciju u testovima koji uvezu stvarni Doznaka kod.
Fixture dodatno bilježi stack JS greške. Produkcijski kod nije mijenjan.
Menu, kolegine vlake/server, oznake, projekti/teren, referentna karta,
strelice, Doznaka restore/GPS kontrole i 5.400 m online/offline CPU1x/4x
prošli lokalno s dopunjenim fixture-om. APK još nije objavljen; puni CI
se ponavlja s istim funkcionalnim izvorom.

Isporuka 2.7.9 završena: source `33600f58f17f59b022783088a20e162dbae4c1ea`,
tree `741a8809bf551cdf5ed729b101466e89f53847fd`, CI `38072592178` SUCCESS,
Pages `38072592014` SUCCESS. Svi JS/SQL/browser/build/Android koraci prošli.
Preuzet javni release APK: 24.317.508 B, SHA-256
`ec78f270c020b76b84d47893e88b246da8aa1c1b95b9a75077fc1b7e28138df9`.
Binary manifest: `ba.spd.uss.vlake.debug`, `2.7.9-debug`, code 549.
Potpis ostaje `11fcd020c703053324ae26baf7a8207373711341f503277a90ec08a8468f286d`.
Svih 69 web assets u preuzetom APK-u identično je izvoru. Preuzet JUnit:
20 Android testova, 0 failure/error/skipped. CI JSON potvrđuje novi izvještaj
(279), KML editor (277), četiri uloge/navigaciju (278) i svih 144 dnevna
prikaza (275), bez JS grešaka/slabog kontrasta/vanjskih upisa. Lokalni
artefakti su u outputs/279-apk i outputs/279-ci; ne pratiti ih Gitom.
Produkcijska baza nije mijenjana; fizički Xiaomi nije testiran.
Release: https://github.com/pogonboskrupa/US-SUME/releases/tag/v2.7.9
APK: https://github.com/pogonboskrupa/US-SUME/releases/download/v2.7.9/app-debug.apk
Ažuriranje kroz Meni → Ažuriraj aplikaciju; javni APK dostupan bez prijave.


## 2026-10-10 — 2.8.0 / code 550: stil vlaka u Meniju i trajna biblioteka uređaja

Korisnik traži da Granice odjela i Kamionski putevi ostanu na uređaju nakon
jednog preuzimanja, uz postavke/vidljivost, te novi Meni → Stil i boja vlaka
odmah ispod Stil linija. Boje i smjerovi premješteni iz Projekta u novi
modal. Naziv: Smjer izvlačenja DS (drvni sortimenti). Zajednički stil po
nalogu za postojeće/buduće dostupne projekte, poseban odjel/projekat i
povratak na zajednički. Stari posebni stilovi ostaju do eksplicitnog
Ujednači (potvrda). Uređivanje prikaza drugog projekta ne aktivira ga;
ručni dvosmjer uređuje se tek u aktivnom projektu. Geometrija, server boja,
GPS i postojeći pojedinačni smjerovi nisu mijenjani. Pregled linije/kraka,
outline i strelice, dnevni/tamni stil, kontrola za zatvaranje pri skrolanju.

Potvrđen bug: _wipeAllLocalUserData pri promjeni naloga uklanjao je cijeli
_LOCAL_KML_KEY. Sada javni github-kml-* registri/content reference i stil/
vis/onlyPolygon ostaju na uređaju. Privatni KML, GeoJSON, .gpkg registri,
rute i aktivni projekat/polja/dnevnik idu u potvrđenu postojeću arhivu
naloga PRIJE čišćenja. IDB .gpkg sadržaj se više ne briše pri promjeni
naloga. Povratak vlasnika spaja privatni registar s aktuelnim javnim,
čuva oba sloja pri istoimenom konfliktu, vraća njegov aktivni projekat.
Rasterske karte/favoriti/uređajne postavke već preživljavaju odjavu i
promjenu naloga; njihovo eksplicitno brisanje ostaje. Nema produkcijske
migracije. Korisnik je ranije izričito odobrio build/isporuku ažuriranja;
novi zahtjevi su nastavak iste autorizovane implementacije.

Lokalni testovi: svi postojeći JS skupovi prošli, projektne boje proširene
na 10 semantičkih provjera. Puni novi style-library-280: zajednički i
posebni stilovi, svoje/kolegine vlake, 12 uskih/tablet dnevnih/tamnih
prikaza s kontrastom i skrolanjem, stvarni IDB KML restart, nalog A → B → A,
javni KML bez ponovnog preuzimanja, izolacija/vraćanje ličnog KML i aktivnog
projekta, zajednički stil bez brisanja pojedinačnog smjera. Sačuvani su
favoriti i opći stil. Prošli device-workflow-273, preferences-266,
project-vlake-220, project-arrows-226 i navigation-design-278. CI uključuje
novi puni browser test i outputs/280. Upute unutar app ažurirane.
Fizički Xiaomi i produkcijski Supabase nisu testirani. Build/release dokaz
slijedi nakon CI; ne proglašavati APK objavljenim prije provjere.

Dopuna provjere: posebni novi stilovi čuvaju samo izmijenjene osobine, pa
odjel s posebnom bojom i dalje nasljeđuje zajedničku debljinu linije i
neizmijenjene postavke strelica. Puni test to izričito potvrđuje. Ponovljeni
komplet JS i inline sintaksa prošli. Dnevni audit: 144 prikaza, 0 slabog
kontrasta; KML editor pun test prošao. Novi modal koristi 12 PNG prikaza,
bez vanjskih upisa. Tok odjave u novom testu stvarno potvrđuje Odjavi se
bez slanja kada postoje neposlane stavke; nije zaobiđen korisnički dijalog.


Isporuka potvrđena 2026-10-10 18:32 UTC: izvor aa9f8225dbf857b87897f3334f0a77e711c774aa,
stablo 7c7d439f1afd325a93a2c5b81ddd1dc33dc7ebf9. CI 38074429230, pokušaj 2,
job 114281231551 SUCCESS: svi JS/SQL/browser koraci, svih 20 Android testova
bez greške i preskakanja, analiza brzine i javni release. Prvi pokušaj:
ExplorerNavigationTest eval/until na liniji 83 nije dobio JS callback u 5 s;
log prikazuje spor OpenGL render i preskočene frameove na hladnom emulatoru.
Ponovljeni ISTI kod i ISTI testovi prošli su (Explorer 17.688 s). Nije
mijenjan timeout, proizvodni Explorer niti preskakan test. ZIP + metadata
četiri izvještaja prvog pokušaja sačuvani i hash-provjereni u
outputs/280-first-attempt prije uklanjanja njihovih CI kopija kako bi
upload-artifact v4 mogao ponovo koristiti imena. Ponavljanje poslije
uočenog pada, ne dodatno nepotrebno proširenje testova.
Pages 38074428633 SUCCESS; javni index i SW pokazuju 2.8.0. Release v2.8.0,
asset 628692349, javno preuzet APK 24,331,708 B:
https://github.com/pogonboskrupa/US-SUME/releases/download/v2.8.0/app-debug.apk
SHA256 59f75e0828867b3e4afdf101cbccb1fcf7e8fe578ecc6a40b2eb3ec4072b87bb.
Provjereno svih 69 APK web resursa naspram radnog stabla; binarni manifest
ba.spd.uss.vlake.debug / code550 / 2.8.0-debug; stabilni certifikat
11fcd020c703053324ae26baf7a8207373711341f503277a90ec08a8468f286d.
API releases?per_page=1 vraća v2.8.0 s APK-om: postojeći Meni → Ažuriraj
aplikaciju može pronaći novu verziju. Bez produkcijskih DB upisa i bez
fizičkog Xiaomi mjerenja. Android dokaz outputs/280-android-passed;
sažetak outputs/280/release-proof.json. Ova dopuna mijenja samo dokumentaciju.
