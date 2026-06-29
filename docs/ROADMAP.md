# US-SUME — Roadmap analize bugova i optimizacije

> Sistematičan pregled svih sekvenci aplikacije, raspoređen u 4 dijela.
> Analiza i popravke idu korak po korak, dio po dio.
>
> Glavni fajl: `index.html` (~26.000 linija, SPA) · `sw.js` (service worker) ·
> `android/` (WebView wrapper). Backend: Supabase. Karte: Leaflet + custom
> SQLite/OPFS čitač.

Status legenda: ⬜ nije početo · 🔄 u toku · ✅ završeno

---

## 🗺️ DIO 1 — Karta i offline karte (temelj prikaza)  ✅

Sloj na kojem se sve ostalo crta. Najviše performansnih/memorijskih rizika.

| Sekvenca | Ključne funkcije | Status |
|---|---|---|
| Online tile slojevi (Topo/Satelit/Karta/Google) | `makeCachedTileLayer` (~L8862), `TL` (~L9055), `_tileBmpCache` | ⬜ |
| Offline SQLite/OPFS čitač | `MiniSqlite` (~L20291), worker `_sqlWCall`, `queryTile`, `detectFmt`, `readMeta` | ⬜ |
| Renderiranje pločica | `_sqlmapCreateLayerW/Main`, `_wTileScheduleCall`, `_sqlDrawParentPlaceholder`, `_sqlPrewarm`, `_drawTileBytesC` | ⬜ |
| Upravljanje offline kartama | `sqlmapLoadFile`, `sqlmapRestoreAll`, `sqlmapToggle`, `sqlmapSetOpacity`, `sqlmapRemove`, `sqlmapShowDebug` | ⬜ |
| Download online karte za offline | `showOfflineModal` (~L19736) | ⬜ |
| Teren overlay (visina/nagib/hillshade) | `_elevHtml`, elevation/slope tile čitanje (~L9145–9217) | ⬜ |
| GeoJSON granice + skala + prebacivanje sloja | `_geojson*` (~L22332), `setLayerSqlite`, `_updMapScale` | ⬜ |

---

## 🔐 DIO 2 — Auth, projekti, sinkronizacija (okosnica podataka)  ⬜

| Sekvenca | Ključne funkcije | Status |
|---|---|---|
| Prijava/registracija | `sbLoadProfile` (~L4606), `showApp` (~L4669), `authShowLogin/Reg` | ⬜ |
| Supabase init + realtime | `sbInitData` (~L4993), `sbStartRealtime` (~L8217) | ⬜ |
| Projekti | `sbLoadProjekti` (~L5023), kreiranje/spremanje projekta | ⬜ |
| Offline red & auto-sync | `_OL` queue, `_processOfflineQueue` (~L4336), online/offline tranzicije | ⬜ |
| Kolege / odjeli / log | `sbLoadKolege`, `sbSaveOdjel`, `sbLoadOdjeli`, `sbLoadLog`, `sbSaveLogEntry` | ⬜ |
| Tekst-oznake i fotografije | `sbSaveTextLabels`, `sbUploadFoto`, `sbSaveFoto`, `sbLoadSharedFotos` | ⬜ |
| Admin panel | `adminLoadUsers` | ⬜ |

---

## 🛻 DIO 3 — Vlake + GPS snimanje (jezgro terenskog rada)  ⬜

| Sekvenca | Ključne funkcije | Status |
|---|---|---|
| Vlake CRUD | `sbLoadVlake` (~L6328), `sbFlushVlaka`, `sbDeleteVlaka`, `sbLoadKolegeVlake` | ⬜ |
| GPS engine snimanja | `togRec` (~L10975), `stopRec`, `toggleRecPause`, `watchPosition`/`onP`/`onPE` | ⬜ |
| UI snimanja + signal + notifikacije | `_updRecStatusBar`, `_updRecSignal`, `_startRecNotification`, `_nativeRecAction` | ⬜ |
| Precizna tačka | `_precizTacka`, `_precizCollect`, `_precizFinish` | ⬜ |
| Pozadinsko snimanje | Web Lock (`sw.js`), `GpsService.java`, SW ping | ⬜ |
| Nagib u stvarnom vremenu | `_calcRecentSlope` | ⬜ |

---

## 🌲 DIO 4 — Tragovi, Doznaka, Mjerenja, KML/Export (terenski alati + I/O)  ⬜

| Sekvenca | Ključne funkcije | Status |
|---|---|---|
| Tragovi (GPS putanje) | `_tragReg*`, `_tragovi*` (~L12100–12900), `togSnimTrag`, `sbFlushTrag`, GPX export | ⬜ |
| Doznaka — odjeli i slojevi | `dozInit`, `dozLoadOdjeli`, `dozSelectOdjel`, `dozLoadLayers`, `dozRenderMapLayers` | ⬜ |
| Doznaka — crtanje i markings | `dozStartDraw`, `dozAddDrawPoint`, `dozFinishDraw`, `dozConfirmSave`, `dozDeleteMarking` | ⬜ |
| Doznaka — GPS, KML izbor, članovi, status | `dozStartGPS`, `dozStartKmlSel`, `dozAddMember`, `dozSetStatus`, `dozExportGPX` | ⬜ |
| Mjerenja | `addTacka`, `msr*`, Izmjeri popup (~L7316), `showElevProfile` | ⬜ |
| KML/GeoJSON import/export | `pkml`, `pkmlStyled`, `loadKmlStyleFor`, `kmlPreuzmi/NaMail/Kopiraj` | ⬜ |

---

## Dnevnik nalaza i popravki

> Ovdje upisujemo bugove i optimizacije dok ih nalazimo, po dijelovima.

### DIO 1 — nalazi (analiza 2026-06-29)

🔴 **Visok**
- **D1-1 — Worker tile hang → trajni gubitak slota (zamrzavanje karte).**
  `_sqlWCall` namjerno NEMA timeout za `type:'tile'` (~L21005). Ako worker zaglavi
  na čitanju jednog tile-a (OPFS stall), callback nikad ne stigne → `_wTileScheduleCall`
  `finally` se ne izvrši → `_wTileActive` se ne smanji. Nakon 6 takvih cijeli red je
  zamrznut i karta prestaje učitavati. **Fix:** timeout za tile (~20s) koji resolve-a
  null i oslobađa slot.  Status: ✅ (v3.1.4)

🟠 **Srednji**
- **D1-2 — `sqlmapClearAll` ne čisti BMP cache ni throttle stanje.** Terminira worker
  (~L21697) ali ne zatvara `_sqlTileBmpCache` bitmape (GPU leak do eviction) niti
  resetuje `_wTileActive`/`_wTileStack` → in-flight promise-i nikad ne resolve-aju →
  slot leak. **Fix:** očistiti cache + resetovati throttle.  Status: ✅ (v3.1.4)
- **D1-3 — `sqlmapToggle` dozvoljava 2+ vidljive offline karte** (~L21617) →
  udvostručuje čitanja/memoriju (uzrok ranijeg UNSKO+UNSKO_2GB). `setLayerSqlite` je
  ekskluzivan, toggle nije. **Fix:** toggle sakrije druge baze (UX odluka).  Status: ✅ (v3.1.6, Opcija 1: samo jedna aktivna)
- **D1-4 — Online createTile prekriva zadržane pločice pri zoom-out** (~L8869) — isti
  bug popravljen za SQLite (neproziran canvas + zelena ispuna), ali za online slojeve.
  **Fix:** providan canvas, bez ispune.  Status: ✅ (v3.1.5)
- **D1-5 — Globalni crash-brojač briše SVE karte.** `_sqlCrashCheck` nakon 3 pada zove
  `_sqlIdbClearAll()` (sve karte) iako je samo jedna problematična. **Fix:** brojač po
  karti.  Status: ✅ (v3.1.4)

🟡 **Nizak**
- **D1-6 — Online BMP cache je FIFO, ne LRU.** Cache-hit (~L8878) ne osvježava poziciju
  (nema delete+set kao SQLite). **Fix:** delete+set na hit.  Status: ✅ (v3.1.5)
- **D1-7 — Race: dupli createTile za isti coord** može procuriti prvu bitmapu (druga
  prepiše u cache bez close). Rijetko.  Status: ✅ (v3.1.6, `_bmpCacheSet` helper)

**DIO 1 ZAVRŠEN** ✅ — svih 7 nalaza riješeno (v3.1.4–v3.1.6).

#### Naknadni nalaz (teren, v3.1.7)
- **D1-8 — RMaps/SQLiteDB karte nisu dobivale prewarm → prazne pločice pri
  zoom-out.** `_sqlPrewarm` je izlazio ako `meta.bounds` ne postoji, a rmaps format
  čita samo minzoom/maxzoom iz `info` tabele (nema bounds). Zato je multi-level
  placeholder pri zoom-out nalazio prazan cache → prazne pločice (specifično za
  SQLiteDB, ne mbtiles). **Fix (v3.1.7):**
  - `_sqlPrewarm` fallback na trenutni pogled karte kad nema `meta.bounds`.
  - Novi `_sqlPrewarmRegion` (engine-agnostičan: worker ili main-thread).
  - Novi `_prewarmView` na `moveend/zoomend` — puni 3 niža zoom nivoa za trenutni
    pogled, pa zoom-out svuda ima placeholder piramidu (svi formati).
  Status: ✅ (v3.1.7)
- **D1-9 — Overview tile-ovi se evictovali → placeholder piramida nestaje.** LRU je
  izbacivao i pregledne (z≤12) tile-ove kad se napuni cache pri visokim zoomovima,
  pa je zoom-out opet ostajao bez placeholdera. **Fix (v3.1.8):** `_sqlTileBmpEvict`
  čuva z≤12 tile-ove od evictiona; cache 400→500.  Status: ✅ (v3.1.8)
- **D1-10 — SW update se nije primjenjivao automatski → testiranje stare verzije.**
  Update je tražio ručni klik na "Ažuriraj" toast; korisnik je mogao testirati staru
  keširanu verziju. **Fix (v3.1.8):** auto-`skipWaiting` kad nema aktivnog snimanja
  (recOn/_tragOn/_dozGpsOn) → automatski reload na najnoviju verziju.  Status: ✅ (v3.1.8)
- **D1-11 — Pojedinačne pločice ostaju trajno prazne nakon timeout-a.** Ako čitanje
  pločice istekne (D1-1 timeout), `done(null,canvas)` označi je gotovom i Leaflet je
  nikad ne traži ponovo → trajno prazna. **Fix (v3.1.9):** retry na `error:'timeout'`
  do 3x (ponovni zahtjev na vrh LIFO stoga); genuine null (nema u bazi) → odmah done
  bez retry-a.  Status: ✅ (v3.1.9). NAPOMENA: ako pločice ostaju prazne i nakon ovoga,
  uzrok je genuine null (lookup vraća null / gap u bazi) — provjeriti 🔬 Test na praznoj
  pločici.
- **D1-12 — 512×512 pločice iscrpe GPU memoriju → prazne pločice (PRAVI KORIJEN).**
  🔬 Test je otkrio da UNSKO SQLiteDB ima 512×512 pločice. Keširane kao 512 bitmape =
  1MB svaka (4× više); cache 500 → ~500MB GPU → telefon iscrpi GPU backing → pločice
  ostanu prazne ("kad zumiram dođe pa nestane"). Test je svejedno nalazio podatke (read
  radi) — problem čisto memorijski. **Fix (v3.2.0):** `createImageBitmap` s
  `resizeWidth/Height:256` u `_drawTileBytesC` i prewarmu — dekodira odmah na 256
  (prikazujemo na 256 ionako) → 4× manje GPU memorije, bez gubitka kvalitete. Fallback
  na puni decode ako resize opcije nisu podržane.  Status: ✅ (v3.2.0)
  - **v3.2.1 dopuna:** `createImageBitmap` resize opcije neki WebView-i TIHO ignorišu
    (vrate 512 bez greške) → fix nullified. Sada GARANTOVANO smanjenje preko offscreen
    canvasa (`_decodeTileBmp`: ako bitmapa > 256, nacrtaj na 256 canvas pa re-encode).
    Verzija dodana u 🔬 Test izvještaj radi potvrde koju verziju korisnik gleda.
- **D1-13 — done() se ne pozove ako keš-dekod zaglavi → trajno prazne pločice (PRAVI
  KORIJEN, potvrđeno debug-om).** Debug na v3.2.1: BMP cache 69/500, SQLite reads
  aktivno=0 queue=0 (worker IDLE), a 🔬 Test nalazi podatke → dakle NIJE memorija ni
  čitanje. `_decodeTileBmp` je radio canvas round-trip (`createImageBitmap(canvas)`)
  PRIJE `done()`; ako taj korak zaglavi/padne u WebView-u, `done()` se nikad ne pozove
  → pločica trajno "loading" (prazna), worker idle, podaci postoje. **Fix (v3.2.2):**
  nacrtaj plain `createImageBitmap(blob)` na 256 i pozovi `done()` ODMAH; keširanje
  (256 snapshot canvasa) zasebno best-effort. Sigurnosni timeout (8s) garantuje done().
  Status: ✅ (v3.2.2)
- **D1-14 — Zoom-out: pločice "nestanu" jer niži nivo nije prewarmovan na vrijeme.**
  Nakon v3.2.2 (skrol radi), zoom-in pa zoom-out još pokazuje praznine jer
  `_prewarmView` (placeholder za niži nivo) kasni (500ms debounce, uski raspon).
  **Fix (v3.2.3):** debounce 500→200ms, raspon curZ-1..curZ-4 (dvostruki zoom-out),
  bounds prošireni (pad 0.3), nivoi se pune od najbližeg (curZ-1) nadolje. Eviction
  zaštita z≤12→z≤13.  Status: ⚠️ djelimično (v3.2.3) — zoom-out i dalje ostavlja prazne.
- **D1-15 — Zoom-out ostavlja pločice TRAJNO prazne iako podaci postoje (RENDER bug).**
  🔬 Test na praznoj pločici nakon zoom-out: "TILE PRONAĐEN" (z14, podaci OK), worker
  idle → čitanje radi deterministički, ali Leaflet pri zoom-out ne iscrta te pločice.
  **Fix (v3.2.4):** nakon smiraja zoom-out, `layer.redraw()` forsira ponovni zahtjev
  svih pločica — keširane se iscrtaju odmah (sinhron cache-hit, bez treperenja), prazne
  se ponovo učitaju.  Status: ❌ POVUČENO (v3.2.5) — pogoršalo (još manje pločica);
  redraw pravi više churn-a → više use-after-close (vidi D1-16).
- **D1-16 — Use-after-close race na ImageBitmap → prazne pločice pri zoom-out (PRAVI
  KORIJEN).** `.close()` (dodan za GPU memoriju u D1-2/D1-7/D1-9) zatvarao je bitmapu
  dok je DRUGI createTile poziv upravo crta iz cache-a (pri zoom in/out ima puno
  createTile churn-a). Zatvaranje usred `drawImage` → prazna pločica. To što je D1-15
  redraw POGORŠAO (više churn-a → više zatvaranja usred crtanja) potvrđuje uzrok; test
  nalazi podatke jer čitanje je OK — problem je čisto zatvaranje bitmape. **Fix (v3.2.5):**
  uklonjen `.close()` iz `_bmpCacheSet`, `_sqlTileBmpEvict`, `_tileBmpEvict` — GC oslobađa
  bitmape (male su, 256px, cache ograničen). D1-15 redraw povučen.  Status: ⚠️ djelimično.
- **D1-17 — Keširane PRAZNE bitmape → prazne pločice (POTVRĐENO Debug PRO-om).** Debug PRO
  ispis: `Cache bitmap test: 256x256 crta=PRAZNO(zatvorena?)`. Uzrok: `createImageBitmap(canvas)`
  (u `cacheFromCanvas` i `_decodeTileBmp`) u ovom WebView-u vraća PRAZNU bitmapu →
  keširane prazne bitmape → cache-hit crta ništa → prazna pločica. `createImageBitmap(blob)`
  radi savršeno (🔬 Test). **Fix (v3.2.7):** keširaj ISKLJUČIVO `_decodeBlobBmp` (iz blob-a,
  s resize opcijom za memoriju, fallback na punu); uklonjen svaki `createImageBitmap(canvas)`.
  Cache cap 500→300.  Status: ✅ (v3.2.7 — Debug PRO: crta=OK, cache bitmape sad važeće)
- **D1-18 — Leaflet ne pravi pločice za dio ekrana (stale veličina) → velike praznine
  (PRAVI KORIJEN, potvrđeno Live HUD-om).** Live HUD: `pločice 12: ✅12 ⬛0` a ekran pun
  praznina → praznine NISU prazne pločice nego pločice koje Leaflet NIKAD ne napravi.
  Leaflet zadrži staru (manju) veličinu kontejnera (mobilni address-bar/UI paneli mijenjaju
  visinu bez window-resize eventa) pa učita pločice samo za gornji/lijevi dio. **Fix
  (v3.2.9):** ResizeObserver na #map → `map.invalidateSize()` na promjenu veličine; HUD
  pokazuje "treba~N ima:M ⚠️PREMALO"; ručno dugme "🔄 Osvježi veličinu karte".
  Status: ⚠️ djelimično (v3.2.9) — ResizeObserver nije uhvatio init-stale veličinu.
- **D1-19 — Leaflet zaglavljen na pogrešnoj (manjoj) veličini → velike praznine
  (KONAČNO POTVRĐENO Live HUD-om: `ekran 369x641` a stvarni ~1900px).** Leaflet
  inicijaliziran prije nego se layout (#map flex:1) smirio → `getSize()=641`, učita
  pločice samo za taj dio, ostatak prazan. ResizeObserver nije pomogao (init-stale, bez
  promjene). **Fix (v3.3.1):** SAMOIZLJEČENJE — `setInterval(1500)` + rane provjere
  upoređuju `map.getSize()` sa stvarnim `clientWidth/Height`; na neslaganje →
  `invalidateSize()`. Garantovan oporavak ≤1.5s bez obzira na uzrok.  Status: ❌ pogrešan
  trag — Debug PRO v3.3.2/3.3.3 pokazao DOM=Leaflet=641 (veličina TAČNA), nije stale.
- **D1-20 — Leaflet nakon zoom-a napravi NEPOTPUN grid (9 umjesto 22 pločice) → veliki
  prazan dio (PRAVI KORIJEN, potvrđeno Debug PRO-om).** Debug PRO v3.3.3: 22 pločice sve
  256x256, sve s sadržajem, ispravno poredane, z12 TILE PRONAĐEN, cache OK — sve zdravo
  KAD se popuni. Ali odmah nakon zoom-out Leaflet napravi premalo pločica (HUD pokazao
  ima:9 treba:12) jer `_update` odradi dok je zoom transform još u prelazu; ostane prazno
  dok navigacija/🔄 ne dopuni. **Fix (v3.3.4):** na `zoomend` (debounce 350ms) ako grid
  ima manje pločica nego što viewport traži → `layer.redraw()` (dopuni). Sada SIGURNO jer
  su D1-16/17 uklonili prazne keš bitmape i use-after-close.  Status: ❌ POVUČEN (v3.3.5)
  — zoomFill redraw je dao "12 pločica sa sadržajem ali ekran prazan" (HUD zelen, karta
  prazna); redraw u krivom trenutku ostavi pločice nevidljivima. Debug PRO dopunjen
  DOM-dijagnostikom (opacity/isConnected/tile-pane transform) da otkrije zašto su
  content-pločice nevidljive.  Status: 🔄 dijagnostika (v3.3.5)
- **D1-21 — Pločice sa sadržajem NEVIDLJIVE: fadeAnimation ostavlja inline opacity=0
  (PRAVI KORIJEN).** Debug PRO v3.3.4: 12 pločica, 256x256, ISPRAVNO poredane preko
  viewporta, sve s sadržajem, cache OK — a ekran prazan. Jedino objašnjenje: opacity.
  Karta je imala `fadeAnimation:true` → Leaflet postavlja INLINE `style.opacity` na
  pločice tokom fade-a; naš `transition:none !important` ih ostavi zaglavljene na
  opacity 0 (inline nadjačava CSS `.leaflet-tile{opacity:1}`). **Fix (v3.3.6):**
  `fadeAnimation:false` — Leaflet ne dira opacity, pločice odmah pune.  Status: ✅ (v3.3.6 —
  Debug PRO potvrdio op=1, pločice vidljive). GLAVNI bug nevidljivih pločica RIJEŠEN.
- **D1-22 — Pri intenzivnom skrolu+zoom pločice nakratko nestaju (blago, transient).**
  Sporo offline čitanje + Leaflet izbaci pločice izvan keepBuffer-a prije nego nove
  stignu. **Fix (v3.3.7):** keepBuffer 4→6 (zadrži više pločica oko ekrana tokom
  interakcije).  Status: ✅ djelimično (v3.3.7 — op=1, karta većinom puna).
- **D1-23 — Keširaj 256px CANVAS umjesto ImageBitmap (resize-opcija takođe daje prazne
  bitmape).** Debug PRO v3.3.7: `crta=PRAZNO` opet — `createImageBitmap(blob,{resizeWidth})`
  u ovom WebView-u takođe tiho vraća praznu bitmapu (kao createImageBitmap(canvas) ranije).
  Jedino pouzdano: čisti `createImageBitmap(blob)` + `drawImage`. **Fix (v3.3.8):** keširamo
  256px offscreen CANVAS (crtan drawImage-om koji RADI) — uvijek važeći; drawImage prihvata
  canvas svuda. Debug PRO: sken SVIH keširanih (broj praznih/zatvorenih).  Status: ✅ (v3.3.8 —
  SKEN: canvas=89 bitmap=0, 0 grešaka; 8 "praznih" su NISKI zoom z2-z9 overview tile-ovi
  gdje je karta sitna tačka = uglavnom providni = normalno/bezopasno). Keš na radnim
  zoomovima (12-15) potpuno važeći.
- **Debug alati:** 📋 Kopiraj Debug PRO dugme (v3.3.9) — kopira ispis u clipboard.
  Profilacija tile pipeline-a (v3.4.1): mjeri red čekanja / čitanje / dekodiranje / ukupno.
- **D1-25 — SPOROST: OPFS čitanje 100ms/pločica (profilacija dokazala).** Profil v3.4.1:
  Čitanje (worker SQLite/OPFS) avg=100ms max=294ms = USKO GRLO (dekodiranje samo 27ms,
  red 27ms). Uzrok: MiniSqlite čita 4KB stranice preko `file.slice().arrayBuffer()` —
  asinhrono, ~25ms po stranici. **Fix (v3.4.2):** OPFS **SyncAccessHandle** — sinhrono
  `read()` (mikrosekunde/stranica) u workeru; fallback na File ako nije podržano. Glavna
  razlika u brzini naspram native (AlpineQuest). Sync handle se zatvara na `close`.
  Status: 🔄 (v3.4.2, mjeriti profil ponovo).
- **D1-24 — createImageBitmap(blob) ponekad prazna slika (11 praznih z14/z15 u SKEN-u).**
  Profil/SKEN: i čisti createImageBitmap(blob) zna dati providnu sliku → fale pločice.
  **Fix (v3.4.2):** `_canvasOpaque` provjeri dekodirano; ako prazno → Image() fallback
  (pouzdaniji). Profil broji `praznih→Image`.  Status: 🔄 (v3.4.2)

> NAPOMENA: Dubinski bugovi (D1-13 done(), D1-16 use-after-close, D1-17 prazne keš bitmape,
> D1-1 timeout) bili su STVARNI i riješeni. Live HUD/Debug PRO presudno otkrili da je
> finalni preostali simptom bio nepotpun Leaflet grid nakon zoom-a (ne veličina).
