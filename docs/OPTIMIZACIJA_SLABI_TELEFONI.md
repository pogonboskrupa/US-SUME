# Optimizacija na slabijim telefonima — pregled (2026-11-03)

Stanje je provjereno nad v3.3.4. **Nije mjereno na stvarnom telefonu** (sandbox nema uređaj ni GPU); brojke
ispod su sa desktop Chromiuma uz CPU 4×/6× i softversko crtanje, pa pokazuju trošak glavne niti, ne GPU.

## Šta već postoji (ne mijenjati bez mjerenja)
- Lagani profil (`render-health.js`): ≤ 4 GB RAM ili ≤ 4 jezgre → manji tile budžet (buffer 2/1, SQL keš 72,
  3–4 istovremena čitanja), bez ukrasnih animacija i bez `backdrop-filter` (`html.render-lite *`).
- Od v3.3.4: **auto-detekcija trzanja** (tri trzava pomicanja → lagani prikaz, 30 dana) i ručni izbor
  Automatski/Lagani/Puni u Slojevima karte. Stari kriterij (RAM/jezgre) je propuštao telefone sa 8 jezgri i slabim GPU-om.
- Labele vlaka se sakrivaju tokom pomicanja/zuma (`vlakeLabels` pane), prewarm nižih zuma je isključen,
  `content-visibility:auto` na redovima lista, glavni JS izdvojen (HTML 561 KB), V8 code cache, turf lijeno.
- `map 'move'`: od v3.3.4 najviše ~8×/s (lite 5×/s) umjesto svaki frame.

## Izmjereno (desktop, CPU 6×, 390×800, DPR 2,5)
- Pokretanje (CPU 4×): `domInteractive` ≈ 0,80 s, spreman za rad ≈ 0,84 s, najduži zadatak ≈ 0,17 s.
- Pomicanje karte: 26 kompozitnih slojeva, od toga 4 preko cijelog ekrana (Leaflet canvas po panu).
  Glavna nit po frameu: JS ≈ 4 ms, stil+layout ≈ 3 ms (6×) — nije uzrok; dominira **Commit** (slojevi), što
  je GPU/kompozitor trošak i ne može se pouzdano reprodukovati bez uređaja.
- Uklanjanje `backdrop-filter` / `box-shadow` u softverskom Chromiumu ne mijenja mjerenje (30 fps stop),
  što znači samo da taj okoliš ne može razlučiti trošak blura — ne da blur nije skup na pravom GPU-u.

## Preostali kandidati (poredani po očekivanoj koristi / riziku)
1. **Mjerenje na uređaju** (novo u v3.3.5): Debug → Terenski rad → "Brzina prikaza" i "Zadnja pomicanja"
   (medijan/95. percentil ms po pomicanju; 16 = glatko, > 32 = trza). Prvo ovo, pa tek onda dalje.
2. Broj kompozitnih slojeva: svaki Leaflet canvas pane (vlake, tragovi/mjerenja, labele, DEM) je zasebna
   tekstura preko ekrana; spajanje `tragMsrLines` i `vlakeLines` smanjilo bi memoriju slojeva, ali dira
   klik-fallback (v3.101.0) — raditi samo uz mjerenje i testove klikova.
3. `box-shadow` (198 pravila) i `transition:all` (13) na trajno vidljivim kontrolama preko karte: zamijeniti
   specifičnim svojstvima. Mala dobit, nizak rizik.
4. Čitanje pločica iz velike MBTiles/SQLite karte (1,7 GB) ide kroz worker + OPFS; dekodiranje slike je na
   glavnoj niti. Provjeriti `_tileProf` (Debug HUD) na uređaju: ako je `decMax` visok, razmotriti manji obruč
   `_SQL_TILE_OBRUC` u laganom prikazu (1 → 0,5) — vraća prazne rubove pri brzom povlačenju.
5. Liste: 292 `innerHTML` dodjele; velike liste (vlake, tragovi, doznaka) se crtaju odjednom. Ako skrol
   lista ostane spor i u laganom prikazu, uvesti crtanje u komadima (kao tabela atributa, v1.8.7).

## Kako provjeriti na telefonu (5 minuta)
1. Slojevi karte → Brzina prikaza: Puni, pomjeraj kartu 20 s; zatim Lagani, isto.
2. Admin → Debug → Terenski rad: pročitaj "Zadnja pomicanja" za oba načina.
3. Pošalji brojke (npr. `48/90 ms` puni, `22/41 ms` lagani) — razlika pokazuje je li blur uzrok.
