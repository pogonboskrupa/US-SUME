# Pregled Doznake — 2.2.7, 4.10.2026.

Pregled je urađen sukcesivno kroz tri cjeline nad Android WebView aplikacijom (`index.html`), njenim lokalnim redom i GPS dnevnikom. Flutter direktorij nije proizvod koji ovaj APK pokreće. Nisu izvršavane produkcijske migracije ni upisi u Supabase.

## 1. Odjeli, projektanti i prikaz

Pregledano: `dozInit`, `dozLoadOdjeli`, lista/overview/skrivanje odjela, `dozSelectOdjel`, `dozLoadLayers`, automatsko povezivanje vlaka, članstva, statusi i detaljni panel.

Dobro: lista i detalj prvo prikazuju lokalni keš; mrežna greška ne zamjenjuje sačuvane podatke praznim nizom. GPS tačke se preuzimaju po stranicama; učitavanje provjerava nalog i generaciju. Statistika koristi zajednički izvor serverskih i neposlanih tačaka, dedup po vremenu u milisekundama, sortiranje i spojenu površinu pojaseva. Realtime trag kolege osvježava prikaz bez ponovnog centriranja karte.

Ispravljeno:

- Nastavak sporog otvaranja prethodnog odjela mogao je povezati njegove vlake/stabla s novim odjelom. Dodana provjera izabranog odjela, naloga i generacije poslije čekanja; povratak na listu poništava čekajuće učitavanje.
- Povezivanje preko substringa pogrešno je spajalo npr. odjel 105 s 5 ili projektom druge GJ. Sada se traži tačan broj i GJ, a više podudaranja zahtijeva ručni izbor.
- Promjena statusa mogla je ostati samo u memoriji kad je red za slanje pun. Status i pauziranje drugih aktivnih odjela sada zajedno idu u jedan atomski lokalni upis; tek poslije uspjeha mijenja se prikaz. Slanje ostaje ručno.
- Izbor projektanta i uvoz KML-a sada ostaju vezani za nalog i odjel/projekat u kojem je radnja otvorena.

Preglednost: pretraga po nazivu/GJ, identitet odjela i korisnika, GPS na vrhu, prečice do GPS-a/zona/vlaka/tima, odvojene kartice, veća polja i kontrast u Dnevnom modu. Brisanje lokalne zone dostupno je i prije slanja.

## 2. GPS, crtanje i geometrija

Pregledano: stabilizacija/start/watch, serijska obrada GPS tačaka, pauza/stop, trajni upis prije promjene geometrije, native dopuna, `FieldStore` i oporavak, GPS pojasevi i pokrivenost, crtanje plohe/granice, GeoJSON/KML izbor, bafer vlaka i doseg stabala.

Dobro: prethodna nezavršena GPS sesija provjerava se prije novog starta; ID odjela/naloga hvata se na startu. Serijski lanac čuva poredak; tačka se iscrtava tek poslije trajnog upisa. Stop čeka upis i završetak sesije; neuspjeh ostavlja mogućnost ponovnog pokušaja. Pauza se zatvara i pri stopu tokom pauze. Live geometrija se dopunjava inkrementalno; skuplje računice ograničene su intervalom i memoizacijom.

Ispravljeno: GPS odbacuje nevažeće koordinate, tačnost i vrijeme prije upisa. Površina koristi isti račun za pregled i sačuvanu geometriju; koordinate se računaju u odnosu na lokalni početak, a rupe u poligonu oduzimaju se od površine. Uvoz stabala/vlaka ne može završiti u drugom odjelu nakon čekanja čitanja fajla.

Ograničenja koja ostaju: procjena pokrivenosti GPS pojasom nije dokaz da je svako stablo doznačeno. Razmak između GPS sesija i dalje se procjenjuje prekidom dužim od pet minuta; baza nema potvrđen dodatni identifikator sesije u preuzetom tragu. Lokalni cache stabala nije serversko dijeljenje, a analiza dosega u Doznaci trenutno polazi od vlastitih povezanih vlaka. Nije prepravljana zajednička geometrijska arhitektura niti dodavana šema baze.

## 3. Čuvanje, slanje i izvoz

Pregledano: čuvanje zone/odjela, lokalni red i overlay neposlanih/obrisanih zona, brisanje zone/odjela, GPS batch slanje i retry, GPX, QR prijem/čuvanje/brisanje, lokalni keševi i povratak na listu. Pregledana je trenutna serverska verzija `field-store.js` i `offline-layer.js`, ne samo djelimična lokalna kopija.

Dobro: zone koriste klijentski UUID za idempotentan retry; neuspjeli upis čuva geometriju za ponovni pokušaj. Neposlane zone ulaze u prikaz pored serverskih; obrisane zone iz reda ne vraćaju se nakon preuzimanja. GPS slanje zadržava nepotvrđene tačke i ne pretvara djelimičan uspjeh u potpuno slanje. QR je razmjena telefona bez servera.

Ispravljeno:

- Brisanje zone provjerava uspjeh upisa zahtjeva; kod pune memorije zona ostaje dostupna. Otkazivanje lokalnog inserta provjerava čitljivost/upis reda i vlasnika. Serverski zahtjev koristi uhvaćeni ID odjela.
- Brisanje odjela više ne čita promjenjivi odabir između četiri server zahtjeva; promjena odabranog odjela ne usmjerava naredno brisanje na drugi projekat. Aktivno GPS snimanje mora se prethodno završiti.
- GPX i QR ne izvoze zadnje snimanje drugog odjela/naloga pod imenom trenutnog. Izvoz uključuje neposlane tačke izabranog odjela, visinu iz preuzetih tačaka, ispravan XML naziv/GPX namespace i segmente poslije dužeg prekida.
- QR prijem provjerava koordinate i potvrđuje lokalni upis prije prikaza uspjeha. Primljeni pojas odmah se nacrta; kod brisanja se prvo potvrđuje pohrana izmjene.
- Naziv/note zone i nazivi projekata u opcijama više ne ulaze u HTML bez escape-a.

Ograničenja koja ostaju: brisanje odjela su četiri postojeća server zahtjeva, ne jedna transakcija. Pad kasnijeg zahtjeva može ostaviti djelimično brisanje; atomsko rješenje traži provjerenu DB funkciju/šemu i zaseban serverski zahvat. Produkcijski RLS, članstva, stvarni GPS i oporavak na fizičkom Redmi telefonu nisu potvrđeni ovim pregledom. Nije izvođena migracija niti korištena produkcijska baza.

## Dodatni zahtjevi: veličina APK-a i pamćenje izbora

Izmjeren APK 2.2.6: 65.143.787 B. OCR native biblioteke za četiri arhitekture zauzimale su 41.033.660 B; GRANICE.kml 13.250.101 B. Prethodni 2.2.3 bio je 21.740.659 B. Snimljeni korisnički podaci nisu dio APK-a.

Na zahtjev korisnika zamijenjen je ugrađeni ML Kit model manjim Google Play OCR zavisnostima. Manifest traži preuzimanje modela; prepoznavanje zahtijeva internet i u JS-u i na Android mostu, i kada je model već preuzet. Hladni model prijavljuje da treba sačekati preuzimanje pa ponoviti. Prikaz/uvoz već pregledane geometrije i terensko GPS snimanje ostaju dostupni bez veze. Potreban je uređaj s Google Play servisima.

Prikaz fotografija/tragova/tačaka/mjerenja/teksta pamti se po nalogu i ponovo primjenjuje nakon prijave/obnove podataka. Grupno skrivanje važi i za naknadno učitane tragove, uz zaseban pojedinačni izbor. Aktivno snimanje ostaje na svom vidljivom sloju. Brzo skrivanje referentne karte takođe se pamti po nalogu. KML već ima pohranu pojedinačne vidljivosti. Izbor online podloge više se ne prepisuje najnovijom lokalnom SQLite kartom; sporo učitavanje ne pregazi noviji korisnički izbor.

## Provjere

Lokalno: svih 85 JavaScript test fajlova prošlo; pet inline JS blokova i promijenjeni moduli imaju ispravnu sintaksu. Novi regresijski testovi provjeravaju hladan ponovni ulaz/preferencije po nalogu, online podlogu uz postojeću SQL kartu, spori odabir odjela, tačno povezivanje, rupe u površini, izvoz ispravnog odjela, atomsku promjenu statusa i zabranu OCR-a bez mreže. Postojeći offline test dodatno provjerava neuspjelo brisanje pri punoj memoriji.

Pripremljen browser test sa stvarnim Leaflet/Doznaka HTML-om za odabir, GPX/XML/segmente, reload prikaza i 16 PNG prikaza u dvije teme/četiri veličine. Android instrumentacijski test provjerava da se OCR odbija bez stvarnog interneta. CI provjerava da APK nema ugrađene OCR modele/native pipeline i da je manji od 30 MB. Rezultat builda i browser/Android provjera dopunjava se nakon izvršavanja; stvarno online čitanje preuzetim Google Play modelom nije mjereno na korisnikovom telefonu.
