# US-SUME — Roadmap analize bugova i optimizacije

> Sistematičan pregled svih sekvenci aplikacije, raspoređen u 4 dijela.
> Analiza i popravke idu korak po korak, dio po dio.
>
> Glavni fajl: `index.html` (~26.000 linija, SPA) · `sw.js` (service worker) ·
> `android/` (WebView wrapper). Backend: Supabase. Karte: Leaflet + custom
> SQLite/OPFS čitač.

Status legenda: ⬜ nije početo · 🔄 u toku · ✅ završeno

---

## 🗺️ DIO 1 — Karta i offline karte (temelj prikaza)  🔄

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

### DIO 1 — nalazi
- _(u toku)_
