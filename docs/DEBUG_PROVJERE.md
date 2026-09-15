# DEBUG zapisi — šta je provjeravano i kako

Ovaj fajl je trajan zapis dijagnostičkih alata ugrađenih u aplikaciju. Nastao je
uz v1.5.4, kad su nagomilani zapisi u panelu **🛠 DEBUG** obrisani sa uređaja na
zahtjev korisnika — nalaz se čuva ovdje, u repozitoriju, umjesto u
`localStorage`-u jednog telefona.

**Šta je obrisano:** sadržaj (`localStorage` ključ `tvlake_admin_debug_v1`),
jednokratno, pri prvom pokretanju v1.5.4.
**Šta NIJE obrisano:** sama mašinerija (`_debugUpsert`, kartice u panelu). To su
terenski alati koji se pale tek kad se problem stvarno pojavi. Bez njih bi svaka
sljedeća prijava sa terena ponovo bila nagađanje — a projekat ima dokumentovanu
istoriju promašenih pretpostavki (v3.111.1 → v3.111.7, pet pokušaja na istom
render-bugu) koje je riješila tek mjerena dijagnostika.

---

## Zašto uopšte postoje

Sandbox u kojem se ovaj kod razvija **ne može dozvati nijedan vanjski server**
(dokumentovano u CLAUDE.md), **ne može kompajlirati Javu** (nema Android SDK) i
**nema pristup OPFS/IndexedDB stvarnog telefona**. Sve tri granice znače isto:
kad korisnik prijavi problem sa terena, ne postoji način da se on reprodukuje
odavde. Alat koji SAM kaže gdje je problem je zato jedina alternativa
nagađanju na daljinu.

---

## Zapisi koji su stajali u panelu

Svaki se zavodi pod svojim `id`-jem; novi pokušaj osvježava isti zapis.

### `pozari` — Požari: dohvat i filtriranje
- **Pokreće:** dugme „🔥 Pokreni novi debug požara" (`_adminDebugRunFire`), i
  „Provjeri izvore" u samom panelu Požari (`_poziProvjeriIzvore`).
- **Šta bilježi:** za svaki izvor (FIRMS arhive, FIRMS Area API, GFW) — način
  pristupa (native most `AndroidNet` ili browser `fetch()`), HTTP status ili tip
  greške, broj parsiranih redova, broj poslije filtera udaljenosti, stanje keša.
- **Šta je njime utvrđeno:** da FIRMS ne šalje CORS zaglavlja ni za arhivu ni za
  `/api/` rutu (v3.105.0). To je bio treći terenski test — dobra veza 215 KB/s,
  najmanji okvir, unesen MAP_KEY, i **svih pet izvora „odbijeno odmah"**. Tek taj
  ispis je opravdao pisanje native Java mosta; bez njega bi to bio preuranjen
  native kod bez dokaza da treba.
- **Način provjere:** korisnik pokrene dugme na stvarnom uređaju i pošalje ispis.
  Jedini pouzdan put — sandbox ne može dozvati `firms.modaps.eosdis.nasa.gov`.
- **Ishod:** riješeno. `AndroidNet` most zaobilazi CORS u APK-u; u webapp-u
  blokada ostaje i UI to otvoreno kaže umjesto da nudi MAP_KEY kao rješenje.
- **Zamka koju je otkrio:** „Provjeri izvore" radi SVOJ, potpuno odvojen dohvat
  i NE upisuje rezultat u `_poziPts`/`_poziEvts`. Zato „sve piše OK" dokazuje
  samo da mreža radi — ne i da je ono na ekranu svježe (v3.114.0).

### `sjeca-vjetroizvale` — Sječa / vjetroizvale: GFW dohvat
- **Pokreće:** dugme „🪵 Pokreni debug sječe" (`_adminDebugRunSjeca`).
- **Šta bilježi:** isto kao gore, ali za `gfw_integrated_alerts` SQL upit —
  sastavljeni URL, HTTP odgovor, broj alarma, prag grupisanja.
- **Šta je njime utvrđeno:** da integrisani sloj (a ne zaseban
  `umd_glad_dist_alerts`) ima dosljedna imena polja, i da DIST-ALERT jedini od
  GFW alarma pokriva BiH (~44.9°N) — ostali su tropski pojas.
- **Ishod:** riješeno, sloj radi uz GFW ključ koji postavlja admin (v3.124.0).

### `map-startup` — Učitavanje offline karte
- **Pokreće:** samo od sebe, pri svakom pokretanju sa SQLite/MBTiles kartom.
- **Šta bilježi:** vrijeme po koraku — `list()`, `load-opfs`/`load-idb` po imenu
  karte, kreiranje Leaflet sloja, i **razmak PRIJE poziva** (auth/startup gate).
- **Šta je njime utvrđeno, u tri kruga:**
  1. v1.1.5 — `list()` je pri svakom pokretanju deserijalizovala buffere od
     stotina MB iz istog IndexedDB zapisa. Buffer je izdvojen u zaseban
     `mapBufs` store.
  2. v1.1.6 — korisnik je i dalje prijavio „desetak sekundi". Dodato mjerenje po
     koraku umjesto četvrtog nagađanja.
  3. v1.1.7 — dijagnostika je **šutjela**, jer je mjerila pogrešan interval:
     štopericu je palila tek pri ulasku u `sqlmapRestoreAll()`, a indikator
     „Učitavam kartu…" se pali mnogo ranije, u `_restoreLastMap`. Cijeli
     auth/startup razmak je bio nevidljiv. Popravljeno mjerenjem od trenutka
     kad se indikator upali.
- **Način provjere:** `tests/js/map-restore-indicator.test.js` (16 testova) —
  vještački `performance.now()` koji raste +1000 ms po pozivu, bez stvarnog
  čekanja; provjerava da spor slučaj upiše TAČNO jedan red sa imenom koraka i
  imenom karte, a brz ne upiše ništa.
- **Ishod:** zapis se sam briše kad je startup brz i bez greške
  (`_mapLoadDiagFinish`) — u panelu ostaje samo kad stvarno ima šta prijaviti.
- **Otvoreno:** ako se javi ponovo, ispis sad razlikuje „sporo unutar SQLite
  čitanja" od „sporo PRIJE nego se SQLite dotakne". Te dvije stvari traže
  potpuno različite popravke i do v1.1.7 su izgledale identično.

### `app-lifecycle` — Zašto se karta ponovo učitava
- **Pokreće:** samo od sebe, kad se app vrati iz pozadine ili se WebView ponovo
  učita.
- **Šta bilježi:** je li bio hladan start, je li service worker preuzeo kontrolu,
  je li `sessionStorage` zastavica reload-a postojala.
- **Šta je njime utvrđeno:** v3.111.4 — `sw-reloaded` je bio boolean koji se
  postavi poslije PRVOG `controllerchange` i nikad se ne resetuje, pa je svaki
  sljedeći reload tiho preskočen. Korisnik koji drži tab otvoren cijeli dan je
  ostajao zaglavljen na verziji iz prvog reload-a, i svaka popravka je izgledala
  kao „nije popravljeno". Zamijenjeno vremenskim pragom od 5 s.
- **Ishod:** riješeno.

### `local-quota` — Lokalni upis nije uspio
- **Pokreće:** `_localSetKriticno` kad `localStorage` odbije upis.
- **Šta bilježi:** koji ključ, puna kvota naspram druge greške, šta je izgubljeno.
- **Zašto postoji:** `_tragRegSave` i `_msrRegSave` su imali goli `catch(e) {}` —
  kad kvota pukne, snimljeni tragovi i mjerenja se NISU sačuvali, bez ijednog
  znaka korisniku. Trag se ne može ponovo prehodati.
- **Način provjere:** `tests/js/offline-kriticni-upis.test.js` (17) nad stvarnim
  kodom, uklj. test koji grepa CIJELI `index.html` da nijedan upis u te ključeve
  više ne guta grešku — invarijanta, ne konkretna vrijednost. **Provjereno da
  pada na kodu prije popravke.**
- **Rizik je izmjeren, ne pretpostavljen:** tačka traga ~51 B, sat snimanja
  ~72 KB, terenski dan od 6 h ~433 KB; uz queue koji čuva iste tačke još jednom,
  ~6 terenskih dana do ~5 MB kvote.
- **Ishod:** riješeno. Zapis se pojavi samo ako se kvar stvarno desi.

### `net-test` — Test veze (ručni)
- **Pokreće:** dugme „📶 Testiraj vezu sada" (`_netTestSada`).
- **Šta bilježi:** stvaran Supabase poziv (isti put kojim ide sync) — trajanje,
  uspjeh, i razliku između isteka („veza visi") i odbijanja.
- **Zašto ne „ping":** ping na tuđi server ne dokazuje ništa o sync-u. Ovo je
  jedini zahtjev koji ta sekcija sama napravi, i to tek na izričit klik — na
  vezi od ~1.4 KB/s svaki sintetički zahtjev otima propusnost onome što
  korisnik stvarno čeka.
- **Ishod:** alat, ne problem. Ostaje.

---

## Kartice koje se uvijek iscrtavaju (nisu „zapisi")

### Terenski rad — `net-debug-card`
Izmjereno stanje veze, medijan odziva, broj neuspjelih, dubina reda za sync,
zauzeće `localStorage`-a, broj offline karata — i `navigator.onLine` **ispisan
pored toga, crvenom kad se razilazi sa mjerenjem**, baš da se laž VIDI.

Mjeri se **pasivno**, iz saobraćaja koji app ionako pravi (`reliableFetch` je
jedina tačka kroz koju prolazi sav Supabase saobraćaj). Nema periodičnog pinga.

- **HTTP 500 se broji kao ISPRAVNA veza** — bajtovi su protekli, buni se server.
- **Prekid koji je tražio pozivalac se NE broji kao loša veza.**
- **`navigator.storage.estimate()` NE mjeri `localStorage` kvotu** — prijavljuje
  origin kvotu (GB), dok `localStorage` nezavisno staje na ~5 MB. Zato
  `_lsZauzetoKB()` mjeri direktno.
- **Provjera:** `tests/js/net-kvalitet.test.js` (19) nad stvarnim kodom i
  stvarnim `reliable-fetch.js`, plus Playwright reprodukcija sva tri stanja.

### Klikovi na karti — `klik-debug-card`
Broj canvasa u požarnom pane-u i je li sloj požara stvarno prikazan. Kad canvas
postoji a sloj NIJE prikazan, to je blokada — kartica to kaže crvenim i nudi
dugme „Oslobodi klikove".

- **Uzrok dokazan Playwright reprodukcijom nad stvarnim Leafletom**, ne nagađan:
  (1) samo izmjerena površina → klik radi; (2) + jedna tačka u `pozariPane` →
  klik mrtav; (3) tačka uklonjena sa karte → **i dalje mrtav**, canvas zaostao;
  (4) renderer uklonjen → klik radi.
- **Leaflet NIKAD sam ne ukloni canvas renderer** kad nestane zadnji sloj koji ga
  koristi. Taj canvas je jedan element preko cijele karte na z-indexu 645.
- **Provjera:** `tests/js/pozari-canvas-klik.test.js` (24) nad stvarnim kodom.
  Provjereno da padaju na starom kodu.
- **Ograničenje koje je v1.4.8 ostavila svjesno, a v1.5.4 zatvorila:** dok su
  tačke požara STVARNO prikazane, njihov canvas je legitiman i klik na mjerenje
  ispod nije prolazio. Otkad su tačke i opožarena površina uvijek uključene, to
  je prestalo biti rijedak slučaj — zato mjerenja sad imaju proximity fallback
  (`_msrHitTest`), isti obrazac koji vlake i KML imaju od v3.101.0.

---

## Provjereno a NIJE bug

Zavedeno da se ne troši vrijeme na ponovnu istragu:

- **1805 `function` deklaracija — nijedno duplo ime.** Zamka iz v3.102.1
  (`_hexToRgb` u dvije verzije, kasnija tiho gazi raniju) je čista.
- **Nema `localStorage` ključa koji se čita a nigdje ne piše**, osim četiri
  namjerna (pišu se preko konstanti, dva su samo za migraciju iz v3.125.0).
- **`_loadOdsjeciSQLite` ima `fetch` bez roka** iznad offline IDB fallbacka —
  klasičan OS-S4 obrazac, ali je **mrtav kod**: bucketi su obrisani sa Storage-a
  i funkcija se namjerno više ne poziva. Kandidat za brisanje, ne za popravku.
- **~60 tihih `localStorage.setItem` poziva** nose UI postavke (sort, filter,
  providnost) gdje je gubitak bezopasan i tišina ispravna.

---

## Pravilo za ubuduće

Kad se ista prijava ponovi i poslije popravke koja u kodu djeluje ispravno,
**prije nagađanja o kodu provjeriti je li popravka uopšte STIGLA do korisnika**
(`actions_list` → `list_workflow_runs` za taj tačan commit). Ako jeste, sljedeća
sumnja ide na service worker / keš isporuku na klijentu, ne na sadržaj popravke.

I: dijagnostika koja šuti nije dokaz da je sve u redu — može mjeriti pogrešan
interval (vidi `map-startup`, v1.1.7). Prije nego se šutnja protumači kao
uspjeh, provjeriti ŠTA tačno alat mjeri.
