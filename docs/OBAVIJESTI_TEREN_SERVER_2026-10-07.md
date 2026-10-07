# Obavijesti, Rad na terenu i server — v2.5.5

Korisnik prijavljuje nevidljive pozadinske obavijesti tokom preuzimanja
karte. Na fizičkom Xiaomiju nije reproduciran tačan zvuk/izgled. Potvrđeno
je da je v2.5.3 koristila DownloadManager sistemski kanal, čijim zvukom i
izgledom aplikacija ne upravlja. Konkretna OEM postavka ostaje nepoznata.

## Izmijenjeno

- Nova preuzimanja koriste jednu tihu Dendro Map obavijest: bijela vidljiva
  ikona, naziv karte, procenat i veličina, čekanje veze, završetak ili greška.
  Kanal LOW, bez zvuka/vibracije, bez ponovnog upozorenja pri osvježavanju.
  Dodir otvara Učitaj kartu; ako je potrebna prijava, zahtjev ostaje do
  završetka ulaska. Ako su obavijesti isključene, aplikacija pokazuje razlog
  i dugme za Android postavke, a napredak ostaje u aplikaciji.
- DownloadManager i dalje upravlja bajtovima i nastavkom prenosa. Njegove
  obavijesti za nove poslove su skrivene uz normalnu Android dozvolu;
  dataSync foreground servis samo prati status svake tri sekunde. Servis
  ne drži Activity/WebView i ne otkazuje prenos kada se ugasi pregled.
  Postojeći poslovi prethodne verzije zadržavaju svoju sistemsku postavku
  obavijesti; nisu restartovani niti su im brisani već preuzeti bajtovi.
- Završena karta se dodaje u Moje karte kroz postojeći potvrđeni uvoz kada
  aplikacija radi/ponovo se otvori. Notifikacija kaže „preuzeta“, ne obećava
  da je uvoz završen dok WebView nije obradio kartu.
- Napredak unutar aplikacije prikazuje % i MB/GB, uz jasnu poruku da se
  aplikacija može koristiti tokom preuzimanja. Ista poruka se ne upisuje
  ponovo u živo područje čitača ekrana ako se sadržaj nije promijenio.

## Terenski pregled

Pregledani stvarni tokovi lokalnog snimanja/oporavka, ručnog slanja,
prijema, doznake i map download native/JS veze. Pokrenuto:

- 100 JS grupa: sve prošle, uključujući slabu vezu, timeout, gubitak potvrde,
  dedup, promjenu naloga, lokalni red, doznaku i oporavak GPS-a.
- Pet sati ubrzanih GPS vremenskih oznaka, Chromium CPU4x, stvarni app JS,
  Leaflet i IndexedDB: 3.564 tačke vlaka i 1.723 tačke doznake sačuvane;
  svih 1.723 vraćene iz IDB-a; nula vanjskih upisa bez ručnog slanja.
  p95 obrade vlake 2,5 ms, doznake 9,8 ms; prebacivanje taba do 173 ms.
  Ovo nije fizički Redmi, stvarnih pet sati mjerenja, test baterije ili GPS
  prijema. Izvještaj: outputs/performance/field-five-hours.json.
- Posebna simulacija 3 km vlastitih + 2,4 km koleginih vlaka prošla.
- Šest dana doznake i pregled Učitaj kartu u browseru prošli; pet inline JS
  blokova bez sintaksnih grešaka.
- Android provjera proširena stvarnom objavom obavijesti preko foreground
  servisa: tekst/ikona/dodir, tihi kanal, čekanje veze, napredak i završetak,
  uz postojeći stvarni SQLite/IDB/WebView offline uvoz i oporavak.
  CI 37642301405 (v2.5.4) prošao JS/browser/SQL/build, ali novi Android
  test nije dobio vidljivu obavijest u roku 10 s; APK nije objavljen.
  Android zapis potvrđuje dozvoljen start servisa, bez izuzetka. U 2.5.5
  traži se FOREGROUND_SERVICE_IMMEDIATE umjesto podrazumijevane odgode
  Androida 12+, uz očuvanje istog testa vidljivosti. Konačni CI još čeka.

## Server — ponovo potvrđeno, odvojeno od popravke obavijesti

Ponovljeno svih sedam reprodukcija iz tests/audit/server-247.cjs na
trenutnom kodu. One dokazuju greške; prolazak reprodukcije nije potvrda
ispravnog ponašanja. Raniji nalazi i dalje važe:

1. **P1:** dodavanje kolege u neposlan projekat ide direktno na server i
   može dobiti RLS 42501. Prvo treba potvrditi slanje roditeljskog projekta.
2. **P1:** sbLoadProjekti može zanemariti grešku čitanja članstva, prihvatiti
   je kao prazan spisak i ukloniti lokalni pregled zajedničkog projekta i
   keš koleginih vlaka. Potrebna je zamjena keša tek nakon potpunog prijema.
3. **P1:** prijem na keširanoj/nepotvrđenoj sesiji može pogrešno tumačiti
   prazan RLS rezultat kao uspješan prijem. Potrebna je potvrda sesije i
   pristupa prije mijenjanja lokalnog članstva.
4. **P2:** konkretni kod/uzrok greške ne prolaze svuda do panela; pojedinačne
   RLS greške doznake ostaju bez jasne dijagnostike.

Dobro: ručni režim slanja, trajni red, čuvanje neposlanog vlastitog rada,
paginacija vlaka, zaštita odgovora nakon promjene naloga i dedup potvrde
pokriveni su prolaznim testovima. Tragovi/fotografije nisu automatski dio
projektnog slanja; doznaka preuzima geometriju odabranog odjela, ne svih.
Produkcijski Supabase nije mijenjan ni testiran ovim pregledom. Nema novog
SQL-a koji korisnik treba izvršiti. Serverske funkcije nisu mijenjane jer
je ova ispravka namijenjena obavijestima, uz traženi pregled ostalog rada.
Detalji: PREGLED_SERVERA_2026-10-07.md.

## Preporučeni redoslijed sljedećih nadogradnji

1. Pouzdan prijem: potvrda sesije i čuvanje posljednje potpune lokalne
   kopije projekta pri grešci; odvojiti „nema podataka“ od „pristup odbijen“.
2. Članstvo: sigurno slanje projekta prije dodavanja projektanta i jasan
   status „projekat još nije poslan“; potvrda upisanog članstva.
3. Razmjena: naziv projekta/stavke i razumljiv razlog uz svaki neuspjeh,
   bez stotina ponavljanih RLS pokušaja za GPS tačke.
4. Terenska kontrola prije izlaska: karta dostupna offline, aktivni odjel,
   neposlane stavke i vrijeme posljednjeg uspješnog prijema na jednom mjestu.
5. Provjera na fizičkom Redmi Note 13 Pro: puni transfer 2,14 GB, gašenje
   ekrana, slaba mreža, prekid aplikacije i stvarna potrošnja baterije.

## Dopuna korisnikovog zahtjeva — Rad na terenu

- Ostali korisnici sada imaju RAD NA TERENU kao prvu stavku Menija, iznad
  Dnevnog moda. ŠPD i administrator zadržavaju svoj tab. Lokalni alati
  dostupni svim prijavljenim profilima; nisu proširene serverske dozvole.
- Preglednije zaglavlje s imenom, šumarijom i aktivnim projektom, te nova
  Explorer kartica: izbor odredišta, nastavak navođenja i checkbox koji
  pamti uključivanje perspektive. Ranije pravilo ostaje: Explorer uz cilj
  navigacije. Opcionalno pitanje o slobodnom Exploreru čeka odgovor.
- Proširen browser test provjerava običnog projektanta, redoslijed Menija,
  checkbox i nastavak stvarne Explorer kamere, dnevni/tamni mod i širine
  320/390/800 px. Lokalno prošao; prikazi outputs/ui-preview/rad-na-terenu-255-*.
