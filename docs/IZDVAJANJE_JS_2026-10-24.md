# Izdvajanje glavnog inline JS bloka — mjerenja (grana `claude/inline-js-split`)

Cilj: brže pokretanje na slabom telefonu izdvajanjem dijela glavnog inline
`<script>` bloka (~1,8 MB, linije ~6180–43060 u `index.html`) u vanjske
fajlove. Svaki korak je zaseban commit i izmjeren prije/poslije.

## Mjerni alati

- **`_startupMjeri()`** (index.html, uz `_startupRestore`) — poslije `load`
  upiše `{di, dcl, load, restore, restoreSync}` (ms od početka navigacije) u
  `window._startupTiming`, u `localStorage tvlake_startup_zadnje`, u konzolu kao
  `[DENDRO-START] {...}` i u admin Debug → "Terenski rad" → "Zadnje pokretanje".
  Samo čita vrijeme; `_startupRestore` je dobio dvije vremenske oznake (`_t`,
  `_tSync`) i ništa drugo.
  - `di` = domInteractive: svi sinhroni skripti parsirani i izvršeni.
  - `dcl` = kraj DOMContentLoaded: + `defer` skripti + DCL handleri.
  - `restore` = početak `_startupRestore` (crtanje karte/projekata).
- **`tests/perf/startup.cjs`** — Playwright, stvarni `index.html` sa LOKALNOG
  HTTP servera (ne `page.route`: presretnut odgovor ne ide kroz HTTP keš pa V8
  code cache ne bi radio ni gdje u stvarnosti radi), 360×740, keširan profil,
  `navigator.onLine=false`, CPU 4×, vanjski zahtjevi odbijeni. Svako ponavljanje
  je nov profil: učitavanje 1 hladno, od 3. toplo. Sa CDP traceom i bez njega
  (`NOTRACE=1`) — trace sam dodaje `V8.CollectSourcePositions` (~200 ms), pa su
  glavne vremenske brojke iz mjerenja BEZ tracea, a raščlamba iz tracea.
- **`tests/android/startup-timing.sh`** — stvarni APK u CI emulatoru (API 34,
  WebViewAssetLoader): `pm clear`, pa 6 krugova `force-stop` + `am start -W`
  (nov proces = hladan start kao na terenu), čita `[DENDRO-START]` iz logcata.
  Krug 1 bez ikakvog keša, 2–6 topli. Poziva se iz `explorer-offline.sh`
  poslije testova, rezultat u artefaktu `Android-provjera-<sha>` →
  `startup-timing.txt` i u logu koraka. Bez keširanog profila (login ekran), pa
  `restore` tamo nije izmjeren — `di`/`dcl` jesu.
- **`tests/perf/split-analiza.cjs <od> <do>`** — AST (acorn) analiza: koja imena
  iz dijela koristi kod koji se izvršava SINHRONO tokom parsiranja.

## Korak 0 — baseline (commit sa instrumentom, prije ikakvog izdvajanja)

Desktop Chromium 153 (Playwright 1.63, sandbox), CPU 4×, 3 ponavljanja × 4
učitavanja; medijan, ms. Sirovi podaci: `docs/mjerenja/startup-baseline*.json`.

| | di | dcl | restore |
|---|---:|---:|---:|
| hladno (n=3), bez tracea | 1046 | 1122 | 1061 |
| toplo (n=6), bez tracea | 999 | 1072 | 1015 |
| hladno, sa traceom | 1148 | 1225 | 1164 |
| toplo, sa traceom | 1079 | 1133 | 1082 |

Raščlamba iz tracea (hladno, jedno učitavanje), glavna nit:

| skripta | EvaluateScript | od toga |
|---|---:|---|
| glavni inline blok (L6182) | ~283 ms | ParseProgram 161, CompileCode 94, ostalo izvršavanje top-levela |
| `static/libs/turf.min.js` (sinhrono u `<head>`) | ~155 ms | većinom CollectSourcePositions (artefakt tracea) |
| `leaflet.min.js` | ~32 ms | |

Zapažanja koja određuju plan:
- Inline blok se kompajlira NA GLAVNOJ NITI (`notStreamedReason: 'inline
  script'`); vanjske skripte se "streamaju" — parsiraju u pozadinskoj niti dok se
  čitaju. Ta dobit NE zavisi od V8 code cachea, pa je realna i u APK-u ako
  WebView streama odgovore iz `shouldInterceptRequest`.
- `v8.compile` za inline blok nema `consumedCacheSize` ni na 3. učitavanju —
  inline skripti ionako ne dobijaju code cache.
- Gruba cijena: ~250 ms parse+compile za 1,8 MB ⇒ ~14 ms na 100 KB (desktop,
  4×). Jedan "mali" dio od ~85 KB daje očekivano ~12 ms — ISPOD šuma `dcl`
  (±30–100 ms ovdje, ±300 ms na telefonu). Korak 2 zato mjeri i vrijeme glavne
  niti za inline blok iz tracea (manji šum) i iz toga izvodi cijenu po KB.

Emulator (CI, API 34 x86_64, stvarni WebView kroz WebViewAssetLoader, bez
keširanog profila → login put), `docs/mjerenja/emulator-*.json`:

| run | kod | `main` | `di` | `dcl` | `main`/`di` |
|---|---|---:|---:|---:|---:|
| 307 (6 krugova, bez `main`) | baseline | — | 664 | 683 | — |
| 308 (12 krugova) | baseline + instrument v2 | 69 [55–86] | 578 [521–668] | 587 | **12 %** |
| 309 (12 krugova) | korak 2 (Tematska karta defer) | 109 [73–289] | 811 [708–1130] | 832 | **13 %** |

(medijan toplih krugova 2–12, [raspon])

## Korak 2 — Tematska karta u `static/js/app/tematska-karta.js` (defer)

- Izdvojeno 82 KB (4,7 % bloka), linije `_TEM_RAMP` … kraj filtera tabele.
  `split-analiza.cjs` je našao da `showApp → _checkDeviceUserSwitch →
  _fieldArchiveKeys / _wipeAllLocalUserData` tokom parsiranja čita
  `_TEM_REG_KEY`, `_TEM_NAME_KEY`, `_TEM_THEME_KEY` — ti ključevi su ostali u
  glavnom bloku. (Na tom putu stoji `await DOMContentLoaded`, pa bi vjerovatno
  prošlo i bez toga, ali zaštita košta ~400 B i ne zavisi od tog `await`-a.)
- Desktop A/B naizmjenično u istoj sesiji (`docs/mjerenja/korak2/`):

| | base | split | Δ |
|---|---:|---:|---:|
| glavni blok na glavnoj niti (trace, n=12) | 270 | 253 | **−17** |
| `di` (bez tracea, n=20) | 1024 | 976 | −48 |
| `dcl` (bez tracea, n=20) | 1094 | 1070 | −24 (IQR se preklapa) |
| `restore` (bez tracea, n=20) | 1039 | 1012 | −27 |
| ukupno EvaluateScript (trace) | 492 | 488 | −4 |

  Cijena je linearna sa veličinom (~0,2 ms/KB na glavnoj niti uz 4×).
  Ukupno izvršavanje skripti se gotovo ne mijenja: top-level izdvojenog fajla
  se i dalje izvršava na glavnoj niti prije DCL; pomjera se samo parse/compile.
- **Emulator: dobit se ne može ni potvrditi ni opovrgnuti.** Očekivano ~3–5 ms
  (4,7 % od `main` ~70–110 ms), a razlika između DVA CI runnera je ~40–60 %
  (u runu 309 je i `main` sporiji iako je blok manji). Upoređuju se samo omjeri
  unutar istog runa.

## Raščlamba `di` u stvarnom WebView-u (instrument v3, run 310, kod koraka 2)

Medijan toplih krugova (n=11), ms; `docs/mjerenja/emulator-split-v3-run310.json`:

| dio | ms | udio u `di` 846 |
|---|---:|---:|
| `re` — zadnji bajt `index.html` (2,4 MB) stigao kroz WebViewAssetLoader | 527 | **62 %** |
| `head` — prvi inline skript u `<head>` izvršen | 561 | (≈ `re` + par ms) |
| `doMain` — od `<head>` do glavnog bloka (leaflet, proj4, supabase, CSS/markup…) | 152 | 18 % |
| `main` — glavni inline blok | 110 | 13 % |
| `poslije` — ostatak dokumenta i kasniji sinhroni skripti | 37 | 4 % |
| skripte do `di`: 40 dohvata, unija vremena dohvata | 234 | (paralelno sa parsiranjem) |

Na desktopu (`tests/perf/startup.cjs`, 4×) isti `re` je ~60–90 ms. U APK-u
dokument stiže ~6× sporije nego što bi stigao sa lokalnog servera, i parser
prvi `<script>` u `<head>` izvrši tek kad je stigao CIJELI fajl — dakle
dominantan trošak pokretanja u APK-u je dostava 2,4 MB HTML-a kroz
`shouldInterceptRequest`, ne kompajliranje JS-a.

## Zaključak poslije koraka 2

U stvarnom WebView-u glavni inline blok nosi ~12–13 % od `domInteractive`.
Gornja granica dobiti CIJELOG plana (kad bi se izbacio sav blok, što nije
moguće — dobar dio koda `initAuth`/`showApp` doseže sinhrono) je ~70–110 ms na
CI emulatoru; procjena 0,5–1 s nije potkrijepljena. Prema pravilu 5 plana:
korak 3 (izdvajanje ostatka) se NE radi na osnovu ovih podataka.

Novi kandidat koji su mjerenja otkrila (nije urađen, traži odluku): smanjiti
trošak dostave `index.html` u APK-u. Hipoteze za provjeru u ISTOM CI runu:
(1) assets su u APK-u deflate-komprimovani pa ih Java inflate-uje pri svakom
pokretanju — `androidResources { noCompress 'html','js','css' }` u
`build.gradle` (bez Java izmjene); (2) manje bajtova u samom HTML-u — JS koji
se ne izvršava tokom parsiranja kao `defer` fajl ne blokira prvi `<script>`
(ovo je ISTO izdvajanje, ali sa drugim, mnogo većim razlogom: bajtovi, ne
compile). Obje se mjere poljem `re` instrumenta v3.

## Korak 3 (izmijenjen): cijeli glavni blok u `static/js/app/glavni.js`, sinhrono na istom mjestu

Hipoteza 1 (`noCompress`) je otpala bez mjerenja — `build.gradle` već ima
`noCompress "html", "js", "css", …`. Hipoteza 2 (bajtovi HTML-a) je testirana
premještanjem CIJELOG bloka (1709 KB) u vanjski fajl na isto mjesto, bez
`defer`: semantika identična (jedan skript → jedan skript), `index.html`
2271 KB → 561 KB.

Desktop A/B naizmjenično (CPU 4×, 16 učitavanja po strani): `di` 1128 → 882
(−22 %), `dcl` 1255 → 991, `restore` 1177 → 921, glavni blok na glavnoj niti
392 → 230 ms (vanjski fajl se streama).

Emulator, stvarni WebView (`docs/mjerenja/emulator-blok-run312.json`, 12 krugova):

| | inline (run 310) | vanjski blok (run 312) | promjena |
|---|---:|---:|---:|
| `re` HTML stigao | 527 | 163 | −69 % |
| `head` prvi skript | 561 | 367 | −35 % |
| `di` | 846 | 551 | −35 % |
| `dcl` | 873 | 566 | −35 % |
| `doMain` (ne zavisi od izmjene → mjera brzine runnera) | 152 | 117 | −23 % |

Uz korekciju na brzinu runnera (`doMain`) dobit do `di` je ~15–35 %, a pad `re`
(−69 %) prati smanjenje HTML-a na 25 % — efekat je daleko iznad šuma između
runnera. `fdStart` (291) > `re` (163): WebView prvi skript iz `<head>` traži
tek kad stigne CIJELI HTML, pa je svaki bajt HTML-a na kritičnom putu.
**Zadržano i objavljeno u v3.2.4.**
