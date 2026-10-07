# Javni folder KARTA APP — v2.5.2

Korisnik je otvorio novi folder za buduće karte. Mail vlasnika nije potreban
aplikaciji: preuzimanje je anonimno, bez Google prijave, API ključa ili
kredencijala ugrađenih u APK. Folder i pojedini fajlovi moraju dozvoliti javni
pristup/preuzimanje. Nisu mijenjane Drive dozvole niti sadržaj korisnika.

- Folder: https://drive.google.com/drive/folders/1iOjb0jeu6IYAx9XG-w8UfDeaZ-Bpm2H0
- Potvrđena karta: KARTA_špd.mbtiles, ID 1mExFpUJgOAROwPSumemnnbzFH74GWHXv,
  2.144.841.728 B. Anonimni svježi GET foldera vraća HTTP 200, javni JSON
  payload i ovaj fajl. Potvrđeno i s Dalvik user agentom. Ranija prijava
  bila je dok folder još nije bio dostupan; nakon promjene pristupa/cache
  osvježenja potvrđen je javni pregled.
- Range 0–65535 vraća HTTP 206, ispravnu veličinu/header i metadata/tiles
  schema MBTiles baze. Cijeli 2,14 GB fajl nije preuzet u cloudu.

## Aplikacija

Dostupne karte čita javni folder pri otvaranju Učitaj kartu ili pritisku
Osvježi. Prvo prikaže sačuvani popis, potom osvježi mrežni popis. Nove karte
iz tog foldera ne traže novi APK. Direktno se nude .mbtiles, .sqlitedb,
.sqlite, .db i rasterski .gpkg fajlovi; nema rekurzivnog učitavanja podfoldera.

MapDownloadCatalog dekodira samo JSON iz Googleove javne stranice, ne
izvršava skripte. Ograničeni HTTPS hostovi, bounded 4 MB odgovor, provjera
roditeljskog foldera, ID-a, naziva i dužine. Nazivi u UI su textContent.
Google nema obećan stabilan javni folder API bez ključa; promjena njegovog
HTML/payload formata može prekinuti osvježavanje. Greška zadržava sačuvani
popis i offline karte; ne prihvata se login/nepotpun popis kao prazan folder.
Ovo nije obećanje podrške za neograničeno veliki javni Drive pregled.

Svaka karta ima nezavisni Android DownloadManager posao, napredak, čekanje
veze, otkazivanje/retry i Prikaži kartu. Poslovi/references se pamte po
Drive ID-u; izvorni veličina/naziv se čuvaju za aktivni posao. Header i puna
veličina se provjeravaju prije transfera i po završetku. Postojeći native
SQLite import validira raster i zapisuje metapodatke atomskim putem, bez
kopiranja GB fajla u JS ili stvaranja dodatne lokalne kopije.

Instalacije su serijalizirane, transferi mogu biti paralelni. Istoimena
lokalna karta se ne prepisuje: dodaje se razlikovni nastavak. Potvrda
instalacije i ponovni ulazak koriste nativeId, pa se preimenovana karta ne
uvozi ponovo. Poslovi/stare instalacije v2.5.1 Unsko_2021-2031 ostaju očuvani;
stari izvor se više ne nudi novim korisnicima izvan novog foldera.
Uklanjanje fajla s Drivea ne briše offline kartu s telefona. Zamjena već
instaliranih bajtova istog Drive ID-a nije automatski update karte.

## Provjere

- Lokalno: 100 JS grupa i simulacija doznake, pet inline sintaksi; LoadMap
  browser test: više/novi/uklonjeni izvori, tekstualni nazivi, individualni
  pause/cancel, pravi SQLite worker/IndexedDB uvoz/reload/delete i oba moda
  na malim ekranima. Poslije manje izmjene cached-first refresh-a ponovljen
  test modula; ista browser provjera se ponavlja u CI-ju na završnom izvoru.
- Android MapDownloadsTest proširen za folder controller/restart, odbijanje
  izvora izvan foldera, generičku Drive potvrdu, Unicode i long veličine,
  escaped JSON bez izvršavanja skripti. Transfer je kontrolisana fixture,
  SQLite/HTML/native bridge/IDB/Leaflet su stvarni. CI/APK provjera u toku.
- Fizički Xiaomi, puni DownloadManager transfer 2,14 GB na stvarnoj mreži,
  OEM pozadinska ograničenja i produkcijski Supabase nisu testirani.
