# Javni folder KARTA APP — v2.5.3

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
  SQLite/HTML/native bridge/IDB/Leaflet su stvarni. CI 37621884715 za v2.5.2 prošao: puni browser/JS/SQL skup i šest Android
  testova. Završna v2.5.3 provjerava i nestanak izvora tokom transfera:
  terminalno stanje se vraća UI-ju, ne ostaje stari napredak; neuspješan
  posao izvan foldera briše svoju djelimičnu kopiju. CI 37624238570 za v2.5.3 uspješan: 100 JS grupa, simulacija,
  puni browser/SQL skup i svih šest Android testova bez grešaka/preskakanja.
  Izvor d5a56b0721108bdd494576f58a72d600bf5e43f6.
- Fizički Xiaomi, puni DownloadManager transfer 2,14 GB na stvarnoj mreži,
  OEM pozadinska ograničenja i produkcijski Supabase nisu testirani.

## Objavljeni APK

- v2.5.3: https://github.com/pogonboskrupa/US-SUME/releases/download/v2.5.3/app-debug.apk
- 24,096,358 B (24.10 MB); SHA256 e3b686975868a4809df0e242c368dad80be4f308be97e45c77e8c9dfce68b364.
- Manifest ba.spd.uss.vlake.debug, 2.5.3-debug/523; isti stabilni certifikat
  SHA256 11fcd020c703053324ae26baf7a8207373711341f503277a90ec08a8468f286d.
- Svih 61 web assets potvrđeno SHA-256 poređenjem sa završnim izvorom.
- Probni Android transfer koristi malu kontrolisanu kartu. Javni izvor
  potvrđen zasebno Range/header/schema provjerom; puni 2,14 GB transfer na
  fizičkom telefonu nije izveden.
