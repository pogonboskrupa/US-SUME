# Dio 3 — karte, Android WebView i APK build

Datum: 2. oktobar 2026. Grana: CODEX-US-SUME-2026-10-01.
Verzija radnog koda: web/SW/Android 2.0.2, versionCode 472.

## Potvrđeni nalazi

### Offline SQLite/MBTiles karta

`sqlmapRestoreAll()` štiti od paralelnog restore-a i ponovnog učitavanja sloja. Brzi OPFS put pokušava zadnju kartu prije skupog IndexedDB popisa. Ako SQLite restore padne, vraća se obična podloga.

Bitmap keš je sada ograničen na 300 objekata. Detaljni tile-ovi izbacuju se prvi, a pregledni tek kao krajnja mjera. Time se sprječava neograničen rast memorije pri pomjeranju i učitavanju više karata.

### Android WebView

`MainActivity` koristi `WebViewAssetLoader`, ponovno koristi WebView tokom GPS snimanja i ne pauzira WebView dok snimanje traje. `GpsService` koristi native JSONL bafer sa rotacijom, SHA-256 tokenom i acknowledge korakom.

ANR, OEM battery manager i cijena `FileDescriptor.sync()` nisu mjerljivi bez Android uređaja i logcata.

### APK assets/build

Dodan je jedinstveni `android/assets-manifest.json`, Python alat za atomarnu pripremu i SHA-256 provjeru APK-a, Gradle `syncWebAssets` task vezan na `preBuild`, stroge Linux/PowerShell kopije i CI provjera stvarnog APK sadržaja.

Zastarjeli fajl iste verzije sada se odbija bajt-po-bajt provjerom.

## Testovi

- Svih 62 JavaScript testnih fajlova prolazi.
- `tests/android/test_assets.py`: 6/6 prolazi.
- `tests/js/karte-treci-dio.test.js` prolazi.
- 5 inline JS blokova, `git diff --check` i `bash -n android/copy-assets.sh` prolaze.

## Build stanje

Službeni Gradle 8.4 wrapper JAR je vraćen i SHA-256 provjeren (`0336f591bc0ec9aa0c9988929b93ecc916b3c1d52aed202c7381db144aa0ef15`). JAR je dodat u radno stablo i više nije razlog blokade. Lokalni build je zatim stao prije Gradlea jer okruženje ne može razriješiti `services.gradle.org` (`UnknownHostException`) za distribuciju Gradle 8.4. Na mašini/CI-ju sa mrežom ili keširanom distribucijom treba ponoviti `assembleDebug`.

## Preostali rizici

- Nema mjerenja hladnog starta i pomjeranja velike SQLite karte na stvarnom osrednjem Android telefonu.
- `FileDescriptor.sync()` pri svakom GPS fiksu može uticati na odziv; potrebno je Android profiliranje.
- `onDestroy()`/OEM lifecycle zahtijeva test sa pozivom, zaključavanjem ekrana, swipe iz recent apps i prekidom napajanja.

## Naknadna potvrda — v2.0.3

Nakon oporavka oštećenog `index.html` i ispravke runtime assets manifesta,
lokalni `gradlew clean assembleDebug` je uspješan. `android/assets.py verify`
je SHA-256 provjerio svih 22 spakovana web fajlova. APK nije instaliran ni
terenski testiran na stvarnom Android uređaju.
