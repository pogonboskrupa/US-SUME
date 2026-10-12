# Pregled Dendro Map aplikacije u četiri dijela

Zahtjev korisnika: 9. 10. 2026. Početna verzija: 2.7.0; izmjene: 2.7.1/code541.
Podjela je zapisana prije pregleda. Prva dva dijela su pregledana i popravljena
u okviru navedenih tokova; to nije tvrdnja da cijela aplikacija nema bugova.

| Dio | Obuhvat | Status |
| --- | --- | --- |
| 1. Karte i slojevi | Online/offline podloge, SQLite/MBTiles uvoz i preuzimanje, instalirane/omiljene karte, KML/SHP, oznake/fotografije, tematski GPKG i Sadnja, stilovi/vidljivost/obnova | Završeno; CI i APK 2.7.1 potvrđeni |
| 2. Projekti i vlake | Aktivni projekat, upravljanje projektima, vlastite/kolegine vlake, ručno crtanje, GPS/krakovi, brisanje, boje/outline/strelice/lager/baferi, trajno čuvanje | Završeno; CI i APK 2.7.1 potvrđeni |
| 3. Doznaka i teren | Odjeli/poligoni/pojasevi, GPS/pauza/oporavak, zajedničke granice/površine, lokacija i Explorer | Završeno i isporučeno u 2.7.2 |
| 4. Server i ostatak | Prijava/probni pristup, slanje/primanje/članstvo, red čekanja/mreža/RLS, Meni/postavke/upute, štampa/izvoz/ažuriranje | Završeno i isporučeno u 2.7.2; SQL dopuna brisanja nije primijenjena na produkciji |

Zajedničke funkcije provjerene su i regresijama drugih dijelova. Prednost imaju
terenski zapisi, lokalno čuvanje, razdvajanje naloga/projekata i ručno slanje.
Testni podaci i mrežne zamjene ne upisuju ništa u produkcijski Supabase.

## Dio 1 — Karte i slojevi

### Pregledano

- `index.html`: podloge/posljednja karta, SQLite slojevi/metadata i brisanje,
  upravljanje kartama/omiljene/stvarni thumbnail, KML stilovi i uklanjanje,
  fotografije i obnova, tematski registar/stilovi/vidljivost i Sadnja.
- `static/js/map-visibility.js`, `map-library.js`, `map-catalog.js`,
  `layer-editor.js`, `local-layer-import.js`: kategorije, listing/filteri,
  pojedinačni/grupni prikaz, editor, lokalni KML/SHP i trajno čuvanje.
- `offline-import.js`, `sql-document.js`, `native-offline-maps.js`,
  `map-downloads.js`: ograničeno čitanje/kopiranje, metapodaci, native izvor,
  stanje preuzimanja i uključivanje instalirane karte.

### Šta je dobro

- Velike SQLite/MBTiles karte imaju native/random-access tok i ograničene
  blokove čitanja; slika pregleda traži ograničen broj stvarnih pločica.
  Time se izbjegava učitavanje cijelog višegigabajtnog fajla u JS memoriju.
- KML/SHP sadržaj i GPKG zapis odvojeni su od izbora stila/vidljivosti;
  postoje zaštite od promjene naloga i neuspjelog trajnog uvoza.
- GPKG import se serijalizira, ima listing i zaseban podtab Sadnja. Stvarni
  korisnikov fajl zadržava izvorne klase/boje i razlikuje NULL od klase.
- Skriveni slojevi ostaju sačuvani; ponovni prikaz ne traži ponovni uvoz.

### Potvrđeni problemi i popravke

| Problem i posljedica | Izmjena | Dokaz |
| --- | --- | --- |
| KML šrafure koristile su SVG `url(#pattern)` i na zadanoj Canvas karti; Canvas nije mogao nacrtati takvu ispunu. | Mali ponovljivi Canvas uzorak za šest šrafura; boja i jačina dio ključa cache-a; bez prebacivanja svih objekata na SVG. Nepreuzet KML bez geometrije ne pokušava crtati stil. | Stvarni Canvas renderer, CanvasPattern i pročitani pikseli sa transparentnim razmacima; izmjena jačine stvara novi uzorak; serverski placeholder bez grupe ne ruši editor. |
| SVG pattern identitet zavisio je od indeksa u listi. Brisanje prvog i dodavanje novog sloja moglo je izmijeniti boju/šrafuru preostalog sloja. | Stabilan identitet Leaflet grupe; uklanjanje samo patterna obrisanog sloja. | Isti regresijski test pada na 2.7.0 upravo pri del/add; prolazi na 2.7.1. |
| Kasni IDB odgovor za fotografiju upisivao se prema promjenjivom indeksu; nakon brisanja mogao je popuniti susjednu fotografiju. Kasni fullscreen odgovor mogao je promijeniti novootvoreni pregled. | Upis u tačan sačuvani objekat, provjera naloga/prisustva i generacije pregleda; zatvaranje poništava kasni odgovor. Vlastita puna fotografija prvo se čita iz IDB i kada ima server ID. | Odgođeni odgovori nakon brisanja, promjena fotografije i zatvaranje stvarnog pregleda. |
| Metadata karte brisala se prije native uklanjanja; odbijeno uklanjanje moglo je izgubiti jedinu referencu. Prikazivao se uspjeh i poslije greške. | Native poziv prije IDB transakcije, zatvaranje baze u finally; UI prekida na grešci. Nakon uspjeha čisti se samo njen thumbnail, autoload/prefs, posljednji izbor i omiljena stavka. | Stvarni IDB i simulirani provider failure čuvaju katalog; uspjeh briše cilj, a postavke druge karte ostaju. |

### Kod i dizajn

U **Učitaj kartu → Moje karte** dodana je direktna zvjezdica omiljene karte,
44 × 44 px, s pristupačnim nazivom, stanjem i fokusom. Kartice koriste isti
kontrast oba moda. Native karta jasno piše **Povezana s fajlom** i objašnjava
čuvanje izvornog fajla, dok kopirana karta navodi da je sačuvana na telefonu.
Oba pregleda omiljenih koriste jednu zajedničku funkciju.

### Provjera

- Novi `tests/browser/audit-parts-271.py`: puni app, stvarni Leaflet/Canvas/SVG
  i IDB; mreža blokirana, CPU 4×; navedeni kvarovi i njihove popravke.
- `offline-preview-266.py`: pravi MBTiles, worker, stvarne pločice i obnova.
- `preferences-266.py`: stvarni lokalni/server KML i SHP iz IDB, stilovi,
  ispuna/vidljivost/bafer i obnova bez interneta.
- `load-map-233.py`: 26 prikaza učitavanja, day/dark i mali/široki ekrani.
- `thematic-files-266.py`: više uvoza, 3000 poligona, IDB reload, greške
  prostora/promjene naloga i 16 rasporeda.
- `thematic-source-268.py` sa stvarnim priloženim GPKG: **17.305 ćelija**, svih
  sedam vrsta i brojevi klasa podudarni SQLite izvoru; skrivanje/obnova/editor
  i QML fallback prošli. Originalni fajl nije dodat u repo niti APK.

### Ograničenja i preporuke

Prvi uvoz velikog fajla može uključivati fizičko kopiranje; nema dokaza da
svaki Android provider otvara 1,5–2 GB odmah. Native uklanjanje i IDB nisu jedna
zajednička transakcija: ispravljen je potvrđeni slučaj odbijenog provider poziva,
a moguć prekid između uspješnog native poziva i IDB upisa traži dodatni native
recovery pregled u dijelu 4. Stvarne dugotrajne mobilne/GitHub/Drive veze i
brisanje izvornog fajla na Xiaomi uređaju nisu testirani ovim browser testom.

## Dio 2 — Projekti i vlake

### Pregledano

- `index.html`: aktivacija i kontekst projekta, projektna lista/identiteti,
  numeracija/duplikati/hijerarhija, zajednički obračun, filtriranje/sortiranje,
  vlaka popup/bafer, lokalni redovi i brisanje, prikaz/cache/update kolega.
- `static/js/tab-data.js`: odvojeni lokalni pregledi po nalogu/projektu,
  paginacija, filter za slanje, lista kolega i navigacija.
- `vlaka-outline.js` i relevantni tokovi `vlaka-direction.js`: kontrastni
  outline, projektne postavke, dvosmjer/strelice, prikaz vlastitih/koleginih
  vlaka i čišćenje nakon skrivanja.
- Ručno crtanje i GPS provjereni stvarnim gestama i ubrzanom dugom sesijom;
  lokalna obnova, pauza i filteri nisu zamijenjeni novom arhitekturom.

### Šta je dobro

- Numeričko sortiranje i identitet projektant/ID sprječavaju zabunu jednakih
  naziva. Boje projekta obuhvataju lične i kolegine vlake.
- Paginacija ograničava kartice na 60; pretraga i pregled rade lokalno.
- Dvosmjer se određuje projektnom odlukom, a ne automatskom polovinom;
  postavke strelica odvojene su po nalogu/projektu.
- GPS lokalni snapshot/IDB i ručni red slanja čuvaju tok pri prekidu mreže;
  stvarni ručni drag tok iz 2.7.0 ne dodaje tačke pri programskom pomjeranju.

### Potvrđeni problemi i popravke

| Problem i posljedica | Izmjena | Dokaz |
| --- | --- | --- |
| **Kritično:** Enter direktno zove potvrdu i zaobilazio je onemogućeno dugme/upis naziva. Promjenjiv indeks mogao je obrisati drugu vlaku. | Sama akcija zahtijeva tačan naziv; snapshot objekta/naziva/projekta/naloga; novi indeks traži prema objektu. Promjena cilja/naloga/projekta odbija akciju. Brisanje tokom GPS snimanja traži prethodni završetak. | Prazan/pogrešan Enter ne briše; promjena redoslijeda briše samo izabranu T2; promjena naloga i aktivno snimanje ne brišu. |
| Skrivanje projekta nije obuhvatalo kolegine polilinije/nazive; update ih je mogao ponovo prikazati. | Isti put vidljivosti za vlastite/kolegine slojeve i strelice, uključen nakon reload-a/update-a. | Stvarni slojevi/nazivi ostaju skriveni; ponovno prikazivanje/list klik otvara pravu vlaku i bafer. |
| Zamjena naziva kolegine vlake ostavljala je stare markere u globalnoj listi. | Uklanjaju se i reference na prethodne nazive prije nove liste. | Poslije update-a globalni broj naziva jednak stvarno važećem broju. |
| Sačuvani prikaz prethodnog projekta ostaje pri mrežnom kvaru. Numeracija, duplikati i zajednički obračun nisu provjeravali njegov projekt ID. | Potrošači filtriraju kolege po aktivnom projektu; stari prikaz se skriva bez brisanja podataka. | Projekat Q ne dobija brojeve, duplikate, obračun ni slojeve iz keša P. |
| Sporiji odgovor stare aktivacije mogao je kasnije uključiti realtime/približiti prethodni odjel. | Generacija aktivacije, nalog i projekt provjeravaju se nakon await i prije odgođenog zoom-a. | Preklop P → Q → P završava samo najnoviju aktivaciju. |
| Sortiranje/filteri bili su samo u memoriji; početno stanje je prepisivalo raniji izbor sortiranja. | Trajno ograničeno/validirano stanje po nalogu i projektu, uz naslijeđeni izbor sortiranja. | Stvarni reload vraća izbor; drugi projekat/nalog ima odvojenu pretragu. |
| Red kolegine vlake samo je približavao kartu; bafer ostajao bez istog ulaza kao lična vlaka. Link Projekti je skrolao sakriven panel; naziv nije bio escaped. | Jedinstven zoom/popup po identitetu; osvježena oznaka bafera; pristup tipkovnicom; pravi prelaz na Projekat i escaped naziv. | Enter na koleginoj kartici otvara detalje i stvarni Turf bafer; navigacija pokazuje Projekat; HTML naziv se ne izvršava. |

### Kod i dizajn

Vlake sada jasno navode broj rezultata i aktivni filter; dugme **Očisti
filtere** vraća cijelu listu bez gubitka izabranog sortiranja. Kartice kolega
imaju čitljivije ime/projektni kontekst i vidljiv fokus. Izričit klik
**Prikaži na karti** može ponovo uključiti skriveni projekat; taj izbor se pamti.

### Provjera

- Novi full-app test: brisanje/Enter, izmjena redoslijeda/naloga, keš drugog
  projekta, kasne aktivacije, kolegini slojevi/update/bafer, reload/filteri,
  navigacija i 6 day/dark rasporeda na 320/390/568 px bez horizontalnog preljeva.
- `project-vlake-220.py`: boje, vlastite/kolegine vlake, numerički redoslijed,
  projektant/identitet i 24 snimka prikaza.
- `server-map-218.py`: obični/admin pregled, direktni/fallback klik i stvarni
  Turf bafer, grupni prikaz i odvajanje naloga; 8 snimaka prikaza.
- `project-arrows-226.py`: projektantov dvosmjer, touch/poništenje/promjena
  cilja/kvota, produženje GPS vlake, stilovi naloga/projekta, SVG/Canvas outline.
- `field-five-hours.py`: **ubrzanih 5 h**, stvarni puni app/Leaflet/IDB,
  CPU 4×, 3564 prihvaćene tačke vlaka i 1723 Doznake; svih 1723 vraćeno iz
  IDB nakon restarta; **0 vanjskih upisa**. Vrijeme je simulirano, ne stvarni
  petosatni rad/baterijski test.
- Svih **100 JS testnih grupa** i pet inline JS blokova prošli su lokalno.
  Novi test uključen je u završni CI prije Android builda.

### Ograničenja i preporuke

Nema novog testiranja produkcijskih projekata/članstva/RLS niti fizičkog
Xiaomi telefona. CPU 4× ne predstavlja tačno mjerenje Redmi Note 13 Pro.
Za dio 4 prioritet su potvrde brisanja/slanja pri prekidu mreže, popunjena
memorija i recovery svih zajedničkih upisa. Ne treba masovno razdvajati veliki
`index.html` tokom ove ispravke; izdvajati funkcije tek uz ove regresije.

## Završni zapis

Izmijenjeni funkcionalni fajlovi: `index.html`, `static/js/tab-data.js`,
`static/css/field-design.css`; verzije `index.html`, `sw.js` i
`android/app/build.gradle`. Novi full-app test, prilagođene dvije izdvojene
JS testne pripreme i zajednička browser priprema, dodatak CI workflow-u.

Završni CI [37925233858](https://github.com/pogonboskrupa/US-SUME/actions/runs/37925233858)
uspješan; izvor `3750ade6ca7ca5652dcd33852f00368f803ca452`.
Preuzet stvarni APK i Android XML: **14 testova, 0 grešaka/padova/preskakanja**.
Svih **61 web resursa** u APK-u identični izvoru. Binary manifest:
`ba.spd.uss.vlake.debug`, `2.7.1-debug`, `versionCode 541`.
Certifikat isti kao ranije:
`11fcd020c703053324ae26baf7a8207373711341f503277a90ec08a8468f286d`.

APK **24.200.540 B** (24,2 MB); SHA256:
`c747ec5a1c7209c9fed55d72e06b541abb8038cf975b7726196bce4d9b9cb6f3`.
Release digest i veličina podudarni preuzetom APK-u. Updater popis vraća
`v2.7.1` s javnim APK-om; ažuriranje kroz **Meni → Ažuriraj aplikaciju**.

[Preuzmi APK 2.7.1](https://github.com/pogonboskrupa/US-SUME/releases/download/v2.7.1/app-debug.apk).
Javni Pages `index.html`, `sw.js`, `tab-data.js` i `field-design.css` provjereni
SHA256 poređenjem sa tačnim novim izvorom. Fizički telefon nije testiran.
Dijelovi 3 i 4 nisu označeni kao završeni ovim radom.


## Nastavak — dijelovi 3 i 4

Zahtjev korisnika: 9. 10. 2026. Pregled počinje na potvrđenoj 2.7.1.
Dio 3: Doznaka, poligoni/pojasevi i članovi, GPS/pauza/završetak/oporavak,
terenski pregled, lokacija i Explorer. Dio 4: ručna razmjena, potvrde upisa i
brisanja, red i neuspjela mreža, razdvajanje naloga/projekata, pristup,
postavke/upute/štampa/izvoz i native ažuriranje. Produkcijska baza nije testna
baza; lokalne reprodukcije ne smiju slati stvarne podatke.
Nalazi, promjene i isporuka dopunjavaju se tokom rada.

## Dio 3 — Doznaka i teren (2.7.2 / code542)

### Pregledano i šta je dobro

Pregledani su tokovi `dozSelectOdjel`, `dozLoadLayers`, GPS start/pauza/stop,
QR kamera/razmjena, zone/poligoni, tragovi, obračun površine i pojaseva u
`index.html`; moduli `field-store.js`, `doznaka-bands.js`,
`doznaka-boundary.js`, `terrain-workspace.js` i `explorer-navigation.js`.
Provjereni su prikaz GPS kontrola, obnova i izvoz odjela.

- FieldStore zapisuje tačku, sesiju i red slanja zajedno u IDB transakciji;
  potvrde se čuvaju odvojeno. Sam povrat mreže ne šalje terenski rad.
- Susjedni monotoni pojasevi koriste sredinu kao zajedničku granicu, uz
  obrezivanje na odjel. Preklop se računa unijom, bez uklanjanja GPS tačaka.
- Prepoznavanje granice radi samo online, zadržava ručni poligon i traži
  prihvatanje prijedloga; promjena karte/naloga poništava stari rezultat.
- Explorer je vezan za aktivno navođenje; kontrole ostaju ravne, kamera
  vraća Leaflet interakcije nakon isključivanja i poštuje otvorene modale.
- Teren koristi lokalne registre, paginaciju i provjerava nalog poslije
  čekanja na unos zapažanja. Ne dodaje mrežne zahtjeve za terenski pregled.

### Šta nije bilo dobro i šta je popravljeno

| Potvrđen problem | Popravka / provjera |
| --- | --- |
| Povratak na listu čistio je odjel i slojeve prije završetka trajnog GPS upisa. Greška pri završetku mogla je ostaviti snimanje bez konteksta/kontrola. | Povratak čeka završetak; neuspjeh ostavlja odjel i GPS kontrole. Pravi IDB test: pad, pauza, ponovni završetak i restart. |
| Promjena odjela tokom aktivnog ili pauziranog GPS snimanja prikazivala je drugi kontekst dok se snimao prvi. | Drugi odjel se ne otvara dok snimanje nije završeno; kasna navigacija provjerava nalog i odjel. |
| Isti broj tačaka i zadnji datum mogli su zadržati stari geometrijski memo nakon korekcije koordinata ili unutrašnjeg prekida. | Potpis uključuje koordinate i vrijeme svih tačaka; test mijenja geometriju i prekid bez promjene broja/zadnjeg vremena. |
| Kasna dozvola kamere mogla je pokrenuti skeniranje poslije zatvaranja ili prepisati drugi zahtjev i ostaviti stream aktivan. | Generacija i nalog/odjel; kasni stream se zaustavlja, zatvaranje čisti video/frame, promjena naloga prekida skeniranje. Test koristi prave sintetičke MediaStream trackove. |

### Dizajn i provjera

Doznaka sada ima odvojenu karticu **GPS dnevnik · ovaj odjel**, s brojem
vlastitih GPS tačaka i izmjena odjela/zona koje čekaju slanje, statusom
učitavanja dnevnika i dugmetom **Pošalji i primi**. Boje prate Dnevni/tamni
mod; nema tvrdnje da je nešto poslano samo zato što je lokalni spisak prazan.

Puni app/Leaflet/IDB, CPU4×, bez produkcijskih upisa: novi
`tests/browser/audit-parts-272.py`; postojeći GPS controls (8 rasporeda),
Doznaka restore (16 prikaza), Teren, Explorer i online prepoznavanje granice.
Simulacija 4 projektanta × 6 dana: 60 pojaseva, 12.060 tačaka, pokrivenost
49,645 ha, izračunati preklop približno 0; prikaz oko 2,21 s na desktop
Chromium CPU4×. Nije mjerenje stvarnog Xiaomi telefona niti stvarni DEM odjel.

## Dio 4 — Server i ostatak (2.7.2 / code542)

### Pregledano i šta je dobro

Pregledani su ručno `serverPosalji`, procesor trajnog reda, upis/revizija i
brisanje vlake, dohvat vlastitih/koleginih projekata, GPS serije i rezervni
put, Doznaka upis/brisanje odjela/zona, `server-panel.js`, `offline-layer.js`,
prijava/keš/probni timer/opoziv, Meni/postavke/upute, štampa/GPX i native
`MainActivity.UpdateBridge` preuzimanje/instalacija.

- Vlake koriste provjeru sadržaja/revizije; konflikt ne odbacuje lokalni rad.
- Red odvaja vlasnika/projekat, čuva odbijene izmjene i razlikuje privremeni
  pad servera od RLS-a. Oštećen red se ne prepisuje praznim redom.
- Primanje čita sve stranice, ne prepisuje živo snimanje/debounce i čuva
  zadnji keš ako mreža padne. Pregled potvrda odvaja Poslano/Primljeno.
- Probni pristup ima serversku zaštitu roka i lokalni timer koji pauzira,
  bez brisanja zahtjeva ili lokalnih GPS podataka. PostgreSQL test prolazi.
- Štampa vraća originalne stilove, koristi isti lager i crvenu punu privatnu
  granicu; custom opisi i izvoz su escapirani. Stvarni Leaflet/PDF test prolazi.

### Šta nije bilo dobro i šta je popravljeno

| Potvrđen problem | Popravka / provjera |
| --- | --- |
| GPS serija se cijela označavala poslanom čim insert nije imao grešku, bez vraćenih tačaka. Jednaki zapisi unutar serije nisu bili deduplicirani. | ACK samo tačaka koje server vrati ili već postoje; jedna logička tačka može potvrditi dvije lokalne kopije. Nepotvrđene ostaju u dnevniku. |
| Pojedinačni void RPC/rezervni insert nisu provjeravali postojanje tačke prije ACK-a. | Čitanje prirodnog ključa korisnik/projekat/vrijeme/koordinate; rezervni insert traži vraćenu tačku. FK/RLS greška ostaje vidljiva u ishodu. |
| Konflikt 23505 na novom projektu, odjelu ili zoni tretiran je kao uspjeh bez provjere vlasnika/projekta/sadržaja. | Zajednička potvrda inserta i ciljanog reda; konflikt prihvaćen samo ako traženi sadržaj odgovara serveru. 22P02 ne izbacuje ispravan UUID zbog neke druge neispravne kolone. |
| Prijem starog odjela nakon promjene izbora mogao je zamijeniti globalne slojeve novog odjela. | Loader provjerava izabrani odjel prije i poslije await-a; razmjena prikazuje da je odjel promijenjen i traži ponovni prijem. |
| Brisanje odjela išlo je kroz četiri odvojena zahtjeva: moguć djelimičan gubitak cijelog tima. | Jedan autorizovan transakcijski RPC, blokada dok postoje vlastiti neposlani podaci i provjera tačne potvrde. Bez RPC-a nema brisanja djece. SQL test dokazuje rollback, pristup/istekao rok, kreatora/aktivnog managera i odvajanje projekata. |
| Kasna provjera odobrenja prethodnog naloga mogla je zamijeniti profil novog naloga. | Snimljen vlasnik i provjera `sbUser.id`/`data.id` prije zamjene profila/keša. Regresija u punoj aplikaciji. |
| Nastavak APK preuzimanja prihvatao je 206 bez provjere Content-Range; jednaka veličina nije dokaz ispravnog sadržaja. | Provjera početka/ukupne dužine prije append-a i SHA-256 novog/već preuzetog APK-a kada GitHub objava ima digest. Neispravan dio se uklanja i ne šalje instalaciji. Dvije nove Android provjere. |

### Server dizajn i obavezna serverska dopuna

Tri koraka razmjene sada zadržavaju razumljivu poruku: nedostaje potvrda,
RLS/pristup, nedostaje projekat, prekid veze ili promijenjen odjel. Tehnički
kod i detalji pojedinačne stavke ostaju dostupni u **Za slanje**.

**SQL za sigurno brisanje cijelog odjela:**
`supabase/migrations/20261009_doz_atomic_delete.sql`. Pripremljen i testiran
na izolovanom PostgreSQL-u; **nije izvršen na produkcijskom Supabaseu**.
Dok ga admin ne primijeni, aplikacija zaustavlja brisanje cijelog odjela s
jasnom porukom; slanje/primanje, GPS i zone rade bez ovog dodatka.
SQL ne mijenja postojeće RLS politike niti briše podatke pri instalaciji.

### Provjere, granice i preporuke

- 101 grupa JS regresija, pet inline JS blokova i relevantne browser provjere.
  Testne zamjene ažurirane su da vrate stvarne potvrde/profil/izabrani odjel;
  ranija pretpostavka „23505 uvijek znači uspjeh” više se ne koristi.
- Stvarni Supabase JS/PostgREST nad kontrolisanim HTTP servisom:
  izgubljen odgovor, RLS/503, nedostajući cilj, migracija ID-ja i statusi.
- 5 h ubrzanog GPS rada, CPU4×, bez mreže: 3.564 prihvaćene tačke vlake,
  1.723 Doznake i svih 1.723 vraćeno iz IDB. GPS p95: vlaka 3 ms,
  Doznaka 15,7 ms; promjena taba oko 365 ms. Bez stvarnog telefona,
  Android mosta, baterije i višesatnog fizičkog mjerenja.
- Preporuka: mjerenje na stvarnom Redmi Note 13 Pro s ugašenim ekranom,
  slabim signalom i lokalnom kartom od ~2 GB; zatim produkcijska potvrda
  članstva/RLS na posebnom testnom odjelu. Ne koristiti radne odjele za probe.
- Native fajl i IDB katalog i dalje nisu jedna zajednička transakcija;
  sljedeći korak je oporavak prekinutog uklanjanja, opisan u dijelu 1.
- Offline odobrenje koristi prethodno potvrđeni profil i sat uređaja;
  trenutni opoziv na serveru ne može stići bez veze. RLS ostaje autoritet online.
- Starija GitHub objava bez digesta ima provjeru veličine/raspona i Android
  provjeru potpisa; SHA-256 je dodatna provjera kada objava sadrži digest.

### Isporuka

Verzija **2.7.2 / Android code542** izgrađena, objavljena i provjerena
9. 10. 2026. Izvor: `2c3d1313ebf81eaa2734b8c5d8a09482f8ef37d6`.
[CI 37933659942](https://github.com/pogonboskrupa/US-SUME/actions/runs/37933659942)
uspješan: 101 JS grupa, PostgreSQL probni pristup i rollback brisanja,
puni browser skup i **16 Android emulator testova; 0 grešaka, padova ili
preskakanja**.

Preuzet stvarni Actions APK, ne samo lokalni build:

- Paket: `ba.spd.uss.vlake.debug`, verzija `2.7.2-debug`, code542.
- Veličina: **24.209.980 B (24,21 MB)**.
- SHA-256: `28945c54de77ad9a725770862697484deb46f9636e55b79ab91eb9aa55bcce05`.
- Certifikat isti kao prethodni APK: SHA-256
  `11fcd020c703053324ae26baf7a8207373711341f503277a90ec08a8468f286d`.
- Svih **61 web fajlova** u APK-u identično izvoru; web/SW/Android verzije
  usklađene. Release asset ima istu veličinu i digest kao preuzeti APK.
- Javni Pages `index.html`, `sw.js`, `server-panel.js`, `offline-layer.js`
  i `field-design.css` identični izvoru. Pages CI 37933659357 uspješan.
- Prvi rezultat endpointa koji koristi updater provjeren kao `v2.7.2`,
  s javnim `app-debug.apk` za **Meni → Ažuriraj aplikaciju**.

[Preuzmi APK 2.7.2](https://github.com/pogonboskrupa/US-SUME/releases/download/v2.7.2/app-debug.apk).
SQL za brisanje cijelog odjela i dalje treba primijeniti administrator;
APK ne izvršava produkcijske migracije. Fizički telefon i produkcijski
Supabase nisu testirani niti mijenjani.
