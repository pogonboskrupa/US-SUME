# Učitavanje SQLite karata — 2.4.8

Korisnik ponovo prijavljuje presporo prvo otvaranje .sqlitedb/.db i .mbtiles; ranije naveden fajl 1,5 GB na Xiaomi telefonu. Nema pristupa tom konkretnom fajlu niti fizičkom telefonu.

## Utvrđeni troškovi

Prethodni veliki import već je prikazivao sloj prije završetka OPFS kopije. Sama ta promjena ne izbjegava Chromiumovu pripremu Android content:// fajla, čitanje slike svake poređene indeksne ćelije, niti skeniranje cijele tabele bez indeksa poslije pronađene pločice.

MiniSqlite sada binarno pretražuje koordinatne ključeve bez image overflow stranica, otvaranje uzorkuje samo koordinate, a pretraga bez indeksa najprije provjerava koordinate i staje na pogotku. Odabire koordinatni indeks kada tabela ima više indeksa. Izvorna karta ostaje neizmijenjena.

Android dobija čitač OfflineMaps: ACTION_OPEN_DOCUMENT + trajna read dozvola, read-only ParcelFileDescriptor, Android SQLite kroz /proc/self/fd, lokalni WebViewAssetLoader binarni tile odgovor. JS dobija samo mali opis fajla. Nema kopiranja cijelog fajla, učitavanja baze u RAM niti base64 pločica. Izvorni fajl mora ostati na telefonu na izabranom mjestu. Nepozicionirani izvor (npr. pipe) ili nedostupna trajna dozvola koristi provjerenu privatnu kopiju uz napredak. Uklanjanje iz aplikacije nikada ne briše izvorni dokument.

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

Prošlo 98 lokalnih JS grupa, sintaksa svih pet inline blokova, stvarni browser LoadMap (uvoz, restart, kontrole, neispravni fajlovi, brisanje), veliki OPFS import i uklanjanje tokom čuvanja. Android instrumentation uključuje novu provjeru direktnog content:// fajla 1,5 GB, normalizovanog MBTiles view/map/images sa 1.024 slike, zadnju pločicu, preimenovanje, offline reload, neispravnu zamjenu, pipe fallback i očuvanje izvornog dokumenta. Izbor/grant je kontrolisan u testu; treba provjeriti i stvarni Android DocumentsUI/Nova/Xiaomi provider na uređaju.

Android build i instrumentation rezultat bilježi se nakon CI provjere; APK se objavljuje samo ako provjere prođu.
