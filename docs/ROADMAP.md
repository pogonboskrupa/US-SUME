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
