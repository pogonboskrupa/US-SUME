# Isporuka Dendro Map 2.8.10

Nastavak rada na stabilnosti slabijih telefona (2.8.9). Ažuriranje kroz
**Meni → Ažuriraj aplikaciju** čim CI objavi release `v2.8.10`.

## Uzroci i popravke

- **Hardverski sloj na cijelom WebView-u** (`setLayerType(LAYER_TYPE_HARDWARE)`
  od prve verzije `MainActivity`, bez zabilježenog razloga). WebView već crta
  kroz hardverski ubrzan prozor; dodatni View sloj tjera cijeli sadržaj kroz još
  jednu ekransku GPU teksturu. Na slabijem GPU-u to je dodatni pritisak upravo
  na resurs čiji nedostatak daje prazne dijelove panela/karte. Uklonjeno.
- **Pad WebView renderera rušio je cijelu aplikaciju.** Na telefonima sa malo
  RAM-a Android ubija renderer proces; bez `onRenderProcessGone` (API 26+)
  WebView tada ruši cijeli app proces. Sada se pravi novi WebView i stranica se
  ponovo učita; GpsService/NativeGpsBuffer rade dalje, a `_crashCheck` vraća
  snimanje. Najviše 3 obnove u 2 minute (zaštita od petlje).
- **`_renderRecover` (2.8.9) je pri memorijskom pritisku praznio redove
  pločica i zatvarao bitmape.** Red drži *vidljive* pločice — `_odustani` ih je
  razrješavao sa `null` pa su ostajale prazne do sljedećeg pomaka karte, a
  `close()` je kršio pravilo D1-16 (use-after-close daje praznu pločicu).
  Sada se samo prazni keš i smanjuju limiti.

## Provjera

- Sintaksa svih JS blokova `index.html`, svi `tests/js/*.test.js`.
- Browser: `slow-render-289` (CPU 6×, 4 GB profil, pritisak memorije — sada
  provjerava da vidljive pločice ostaju u redu), `load-map-233`,
  `day-all-panels-275`, `department-report-277`.
- Java dio (onRenderProcessGone, bez hardverskog sloja) provjerava CI Gradle
  build i Android 14 emulator; fizički slabiji telefon nije bio dostupan.
