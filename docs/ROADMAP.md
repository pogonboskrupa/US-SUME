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
  Cache cap 500→300.  Status: 🔄 (v3.2.7, test)
