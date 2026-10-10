# Učitavanje SQLite karata — 2.4.8

Korisnik ponovo prijavljuje presporo prvo otvaranje .sqlitedb/.db i .mbtiles; ranije naveden fajl 1,5 GB na Xiaomi telefonu. Nema pristupa tom konkretnom fajlu niti fizičkom telefonu.

## Utvrđeni troškovi

Prethodni veliki import već je prikazivao sloj prije završetka OPFS kopije. Sama ta promjena ne izbjegava Chromiumovu pripremu Android content:// fajla, čitanje slike svake poređene indeksne ćelije, niti skeniranje cijele tabele bez indeksa poslije pronađene pločice.

MiniSqlite sada binarno pretražuje koordinatne ključeve bez image overflow stranica, otvaranje uzorkuje samo koordinate, a pretraga bez indeksa najprije provjerava koordinate i staje na pogotku. Odabire koordinatni indeks kada tabela ima više indeksa. Izvorna karta ostaje neizmijenjena.

Android dobija čitač OfflineMaps: ACTION_OPEN_DOCUMENT + trajna read dozvola, read-only ParcelFileDescriptor, Android SQLite kada putanja može biti otvorena, lokalni WebViewAssetLoader binarni odgovor. Android instrumentation je potvrdio da SQLite kanonizuje /proc/self/fd na privatnu putanju provider-a i ne može je ponovo otvoriti. Zato seekable dokument ostaje otvoren preko dozvoljenog FD-a: zaštićene putanje koristi postojeći sql.js SQLite engine sa malim read-only VFS dodatkom, blokovima od 64 KB i ograničenim 4 MB LRU kešom. VFS ne kopira bazu niti dopušta upis; podržava i normalizovane tiles view/map/images baze. Native Os.pread čita traženi blok; sinhroni binarni XHR postoji samo u SQL Worker-u. JS dobija samo mali opis fajla. Nema kopiranja cijelog fajla, učitavanja baze u RAM niti base64 pločica. Izvorni fajl mora ostati na telefonu na izabranom mjestu. Nepozicionirani izvor (npr. pipe) ili nedostupna trajna dozvola koristi provjerenu privatnu kopiju uz napredak. Uklanjanje iz aplikacije nikada ne briše izvorni dokument.

Metapodaci koriste postojeći IDB katalog; stare OPFS/IDB karte i web import zadržavaju svoj tok. Zadnji izbor pamti nativeId radi direktnog otvaranja bez čekanja cijelog kataloga. Zamjena validira novu bazu prije prepisivanja metapodataka; neispravna karta ne uklanja staru. Preimenovanje ponovno kreira Leaflet sloj sa novim imenom.

## Lokalna mjerenja

Stvarne SQLite baze sa mnogo zapisa i overflow slikama (test sqlmap-reading-248), desktop Node; broj 4 KB stranica koje su morale biti pročitane:

| Baza / operacija | 2.4.7 | 2.4.8 |
|---|---:|---:|
| WITHOUT ROWID, 1.024 slike po 32 KB, otvaranje | 35 | 11 |
| Ista baza, pločica broj 1.000 | 132 | 12 |
| Bez indeksa, 2.048 slika po 8 KB, prva pločica | 4.353 | 4 |
| Ista baza, pločica broj 2.000 | 4.353 | 254 |

Nije izračunata obećana sekundaža za telefon iz ovih mjerenja. Fajl bez koordinatnog indeksa i dalje može zahtijevati pregled mnogih koordinata; nismo mijenjali korisničku bazu radi dodavanja indeksa.

Browser test sa RMaps bazom proširenom nulama do 1,5 GB: sloj 102 ms, prva vidljiva pločica 160 ms, potpuna OPFS kopija 5.196 ms, pločica poslije offline ponovnog otvaranja 647 ms. Ovo provjerava veliki transfer i čuvanje, ne gustu stvarnu kartu niti fizički Xiaomi. Odvojeni test overflow baza pokriva čitanje stvarnih višestraničnih slika.

Prošlo 99 lokalnih JS grupa, sintaksa svih pet inline blokova, stvarni browser LoadMap (uvoz, restart, kontrole, neispravni fajlovi, brisanje), veliki OPFS import i uklanjanje tokom čuvanja. Android instrumentation uključuje novu provjeru direktnog content:// fajla 1,5 GB, normalizovanog MBTiles view/map/images sa 1.024 slike, zadnju pločicu, preimenovanje, offline reload, neispravnu zamjenu, pipe fallback i očuvanje izvornog dokumenta. Izbor/grant je kontrolisan u testu; treba provjeriti i stvarni Android DocumentsUI/Nova/Xiaomi provider na uređaju.

Prvi Android build prošao, ali native test ispravno odbio tvrdnju o nekopiranju: SQLite nije mogao ponovo otvoriti provider putanju, pa je pokrenuo kopiju. Popravka je gore opisani FD/VFS put, a cilj testa (bez kopije) nije ublažen. Lokalni stvarni 1,5 GB fajl: otvaranje + pločica 17–22 ms uz 65.536 pročitanih bajtova; normalizovani MBTiles od 34.197.504 B: zadnja pločica + metapodaci 4 ms uz 1.429.504 pročitana bajta. To su desktop Node mjerenja. Provjerena zabrana upisa, kratko čitanje i LRU limit. Android build i instrumentation rezultat nakon popravke bilježi se nakon CI provjere; APK se objavljuje samo ako provjere prođu.

Puni browser/SQL Worker/SQL.js VFS tok sa kontrolisanim Android bridge-om i binarnim endpointom: otvaranje 1,5 GB 245 ms, po jedan blok od 64 KB pri uvozu i offline ponovnom otvaranju. Nema OPFS import posla, original ostaje, katalog/zadnja karta pamte nativeId, terenski podaci nepromijenjeni. Ovo odvojeno provjerava stvarni sync XHR Worker tok; provider i Android dozvola su kontrolisani. Android test ostaje završna provjera pravog native endpointa.

## Završni Android rezultat i APK

CI `37598268848`, kod commit `0dae134b79a2c14a3c3df434b735062fbd2d65bb`: success. 99 JS grupa, kompletne browser provjere i probna PostgreSQL baza prošli. Android 14 emulator bez interneta: 4 instrumentation testa, 0 grešaka. Novi native test otvorio je 1,5 GB content:// dokument za **3.070 ms**, bez kopije; potom provjerio normalizovani MBTiles, zadnju pločicu, preimenovanje, offline reload, odbijanje neispravne zamjene uz očuvanu staru kartu, pipe kopiju i očuvan original. Izbor URI/grant je kontrolisan; stvarni FD/Os.pread, WebViewAssetLoader, Worker, SQL.js i Leaflet su proizvodni. Velika RMaps baza proširena je nulama; gušći normalizovani MBTiles test ima 1.024 stvarne overflow slike. Ovo nije mjerenje fizičkog Xiaomi telefona niti korisnikove konkretne karte.

Objavljen v2.4.8 (Android 2.4.8-debug, code 518), 24.083.687 B. APK preuzet iz artefakta; SHA-256 identičan release assetu: `6dd857625a5079bae0afd870045414ea53d2ab93e732ad27272e1695a0874f70`. Svih 60 web assets odgovara izvoru. Iz binary AndroidManifest potvrđeni package `ba.spd.uss.vlake.debug`, versionCode 518 i versionName; potpisna v2/v3 certifikata imaju postojeći SHA-256 `11fcd020c703053324ae26baf7a8207373711341f503277a90ec08a8468f286d`. APK je instaliran i testiran samo na CI emulatoru, ne na korisničkom telefonu. Release: https://github.com/pogonboskrupa/US-SUME/releases/tag/v2.4.8 .

Za novi direktni način ponovo odabrati original .sqlitedb/.mbtiles kroz Učitaj kartu nakon updatea; postojeće OPFS kopije rade kroz unaprijeđeni MiniSqlite. Zadržati povezani fajl na telefonu; pomjeranje/brisanje originala traži ponovno povezivanje. Ne deinstalirati aplikaciju radi ažuriranja. Vendor sql-wasm.js ima mali `openReadOnlyFile` dodatak vezan za njegov FS; buduća zamjena te biblioteke mora prenijeti dodatak i ponoviti `sql-document.test.js` i native instrumentation.
