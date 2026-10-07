# Unsko_2021-2031 — automatsko preuzimanje, v2.5.1

Korisnik je zamijenio zahtjev iz v2.5.0: nema Drive uputa niti ručnog uvoza
nakon skidanja. Dugme u Učitaj kartu pokreće Android preuzimanje i automatski
dodaje kartu u postojeći katalog Moje karte. Izvorni Drive fajl nije mijenjan.

## Tok

- Fiksni javni izvor Karta Unsko, ID `1rVmI9heO_Y8eV-IrGkcGH3ajhEIZ-Kny`,
  1.567.670.272 B. Lokalni naziv je Unsko_2021-2031.sqlitedb.
- MapDownloads provjerava bounded HTML potvrdu za veliki fajl; prihvata samo
  očekivani ID, HTTPS Google hostove i GET formu na poznatom download endpointu.
  Range 0–15 provjerava SQLite magic i veličinu prije stvarnog skidanja.
- Android DownloadManager čuva fajl u app-owned external files Downloads/
  offline-maps, nastavlja nakon mrežnog prekida i radi izvan životnog ciklusa
  WebView-a. ID posla, lokacija i stanje završetka su u SharedPreferences.
  UI ima napredak, čekanje veze, otkazivanje, retry i Prikaži kartu.
- Završetak provjerava tačnu veličinu i header. JS koristi postojeći atomski
  _sqlmapLoadNative: raster schema i tile provjera prije zamjene stare karte,
  metapodaci u IndexedDB. Baza se čita direktno; nema drugog GB kopiranja niti
  prebacivanja fajla u JS Blob/ArrayBuffer.
- Re-entry prati posao. Ready se instalira po završetku obnove karata;
  nativeId u katalogu sprečava duplu instalaciju poslije pada između commit-a
  kataloga i potvrde, uključujući preimenovanu kartu. Instalirana karta se
  ne forsira pri svakom ulasku; poštuje postojeći izbor podloge.
- Brisanje uklanja app-owned preuzeti fajl, nikad korisnikove SAF originale.
  Izvor s promijenjenom veličinom ili Google quota/permission problemom
  završava greškom za ponovni pokušaj; HTML nije prihvaćen kao karta.
- Preuzimanje je Android funkcija; browser prikazuje dostupnost u APK-u,
  bez obećanja da cross-origin browser download može biti automatski uvezen.

## Provjere

- Živi javni izvor: HTTP 206, Content-Range bytes 0-15/1567670272, SQLite
  header potvrđen. Prvih 64 KB potvrđuje metadata i tiles tabele stvarnog
  MBTiles formata. GET bez Range, s AndroidDownloadManager user agentom,
  vraća HTTP 200, punu Content-Length i isti header (pročitano samo zaglavlje).
  Cijeli 1,57 GB download nije obavljen u cloud radnom prostoru.
- Lokalno: svih 100 JavaScript grupa i simulacija doznake prošli; svih pet
  inline skripti sintaktički valjano. load-map-233 browser test prošao:
  jedno dugme, bez Drive taba/uputa, offline gate, napredak, pause/cancel,
  postojeći pravi SQLite worker/IDB tok i mali ekrani u oba moda.
- Novi Android MapDownloadsTest koristi kontrolisani transport, stvarne
  app-owned SQLite fajlove, MainActivity/WebView/HTML/Leaflet/native bridge/
  IndexedDB. Provjerava automatsko dodavanje, restart posla/JS, offline tile,
  bez duple kopije, brisanje, odbijanje HTML-a i ograničen izvor.
  To nije mjerenje stvarnog Android DownloadManager transfera cijelog GB fajla.
- CI 37610697691 uspješan: 100 JS grupa, cijeli browser skup, probni SQL/RLS,
  pet Android 14 instrumentacijskih testova (0 failures/errors/skipped).
  automaticDownloadInstallOfflineReloadAndDelete prošao na stvarnom APK-u
  uz kontrolisani transport. Svih pet testova zajedno: 65,575 s.
- Izvor APK-a: 9796c6bd1e7af89bdec2c1c73157a767c64193d3.
  APK: https://github.com/pogonboskrupa/US-SUME/releases/download/v2.5.1/app-debug.apk
  24.087.350 B; SHA256 dfb2df911029d25fcf848db1e1eda5e41fc8e2ac7721a9ba890b020318af3fda.
  Manifest ba.spd.uss.vlake.debug, 2.5.1-debug/521; svih 61 web assets hashova
  odgovara izvoru. Isti certifikat kao v2.5.0 — ažuriranje preko instalacije.
- Fizički Xiaomi, puni download na stvarnoj mreži, stvarni DownloadManager
  transfer, Android OEM pozadinska ograničenja i produkcijski Supabase nisu
  testirani. Ne deinstalirati postojeću aplikaciju radi ažuriranja.
