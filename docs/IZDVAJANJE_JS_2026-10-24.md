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

Emulator (CI) baseline: popuniti iz `startup-timing.txt` prvog CI runa sa
instrumentom.
