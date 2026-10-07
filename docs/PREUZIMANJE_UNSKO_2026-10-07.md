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
  header potvrđen. Preuzeto samo 16 bajtova binarnog fajla; cijeli 1,57 GB
  download nije obavljen u cloud radnom prostoru.
- Lokalno: svih 100 JavaScript grupa i simulacija doznake prošli; svih pet
  inline skripti sintaktički valjano. load-map-233 browser test prošao:
  jedno dugme, bez Drive taba/uputa, offline gate, napredak, pause/cancel,
  postojeći pravi SQLite worker/IDB tok i mali ekrani u oba moda.
- Novi Android MapDownloadsTest koristi kontrolisani transport, stvarne
  app-owned SQLite fajlove, MainActivity/WebView/HTML/Leaflet/native bridge/
  IndexedDB. Provjerava automatsko dodavanje, restart posla/JS, offline tile,
  bez duple kopije, brisanje, odbijanje HTML-a i ograničen izvor.
  To nije mjerenje stvarnog Android DownloadManager transfera cijelog GB fajla.
- CI/izgrađeni APK: provjera u toku. Fizički Xiaomi, puni download na stvarnoj
  mreži, Android OEM pozadinska ograničenja i produkcijski Supabase nisu testirani.
