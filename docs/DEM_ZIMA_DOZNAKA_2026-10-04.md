# DEM, zimski snimci USK-a i simulacija Doznake — 2.3.2

Procjena izvora i stvarnog koda aplikacije, 4.10.2026. Rezultati nisu mjerenje
na fizičkom Xiaomi telefonu niti provjera produkcijske Supabase baze.

## DEM: šta je potvrđeno

Aplikacija dekoduje Mapzen/Terrarium PNG pločice. Stvarni HTTP zahtjevi za
Bosansku Krupu (44.93, 15.87), na z12 i z14, vratili su 200 i zaglavlje
`x-amz-meta-x-imagery-sources: eudem/eudem_dem_5deg_n40e015.tif.tif`.
Pločice su posljednji put izmijenjene 16.11.2017. To je datum objekta na
serveru, a ne potvrđen datum mjerenja terena.

Dokumentacija servisa za EU-DEM navodi približno 30 m. Oko 45°N prikaz ima
oko 27 m/piksel na z12 i 6,8 m/piksel na z14. Sitniji prikaz na z14 je
interpolacija istog modela. Terrarium kodiranje 1/256 m takođe nije
vertikalna tačnost modela. Bez referentnih terenskih/LiDAR mjerenja nije
izmjerena stvarna greška visina u odjelima firme.

Podaci su korisni za orijentaciju, veće padine, okvirnu ekspoziciju i profil.
Ne rješavaju sitne jaruge, nasipe novih puteva niti pouzdanu strminu na
nekoliko metara. Za mjerilo 1:10.000 izvorni uzorak od 30 m predstavlja
oko 3 mm na papiru. DEM izohipse su izvedene procjene, a ne službene
kartografske linije. Izvorni EU-DEM nije automatski provjeren za cijelu BiH;
navedeno zaglavlje neposredno potvrđuje provjereno područje.

Copernicus GLO-30 je noviji javni izvor, takođe približno 30 m, ali DSM:
uključuje vegetaciju i objekte. Zvanična specifikacija apsolutne vertikalne
tačnosti <4 m (90% LE) odnosi se na proizvod, a ne na dokazanu grešku
šumskog tla u USK-u. Stvarni GeoTIFF za N44/E015 je dostupan bez ključa
(39.473.886 B), HTTP Range vraća 206, ali provjereni odgovor nema CORS
zaglavlje za WebView porijeklo. Pouzdana zamjena zahtijeva drugačiji
GeoTIFF/rasterski tok i lokalnu provjeru tla; zato nije proglašena
automatskim povećanjem preciznosti. Mapterhorn dokumentuje Terrarium WebP
512×512, ali njegovi provjereni tile/dokumentacijski endpointi ovdje su
vratili 403; nije usvojen kao osnovni izvor.

## Šta je popravljeno u obradi

- Transparentni pikseli i nevažeća Terrarium visina postaju NoData, a ne
  ogromna negativna visina ili izmišljena padina.
- Interpolacija ne prelazi preko NoData; susjed bez udjela u interpolaciji
  ne kvari tačan, validan uzorak.
- DEM grid koristi bilinearno očitavanje sa ispravnim polupikselom i
  susjednim pločicama na šavovima; posljednji red/kolona pokrivaju sjeverni
  i istočni rub. Degenerisane granice dobijaju najmanje 2×2 uzorka.
- Ekspozicija i nagib koriste metre i pravilne imenioce na rubovima.
  Razmak do susjeda približno je najmanje 30 m, umjesto derivacije nad
  prividnim detaljima z14. Ovo je numeričko poboljšanje, ne novi DEM izvor.
- Nagib je strogo >30%; NoData je providan i ne stvara izohipse.
- Pokvaren PNG/HTML keš ne blokira novi pokušaj; puna kvota ne prekida
  online prikaz. ImageBitmap i rezervni object URL uredno se zatvaraju.
  Offline preuzimanje provjerava dekodiranje i dimenzije, ne samo zaglavlje.
- Profil prvo koristi lokalni DEM; Open-Meteo ostaje rezerva. Nepotpuni
  odgovori/null/NaN ne postaju nule u profilu ili gridu. Snimljene GPS
  koordinate i njihove visine se ovim ne prepisuju.
- Katalog terena i projekat objašnjavaju izvor i ograničenje rezolucije.
  Postojeći cache naziv i offline paketi z12–z14 ostaju kompatibilni.

## Zimske satelitske slike bez ključa

STAC Earth Search v1 je stvarno vratio scene Sentinel-2 L2A za zimu
2025/2026. Primjer koji obuhvata dio USK-a:
`S2A_33TWK_20260218_1_L2A`, snimljen 18.2.2026, cloud_cover 7,41% za
cijelu scenu. RGB rezolucija je 10 m; to nije kvalitet za pojedinačna
stabla ili uske vlake, niti procenat oblaka garantuje čistu konkretnu šumu.
Nije dodat nepouzdan javni TIFF proxy ili nezaštićeni tuđi API ključ.

Esri Wayback konfiguracija, metapodaci i stvarna JPEG pločica kod Bihaća
vraćaju HTTP 200 i CORS `*`, bez ključa. Provjera najnovije godišnje verzije
za godine 2014–2026, na četiri tačke:

| Lokacija | Potvrđen zimski datum u pregledanim verzijama | Napomena |
| --- | --- | --- |
| Bihać, 15.868 / 44.815 | 14.1.2019 | WV03; SRC_RES 0,31 m; SAMP_RES 0,30 m u provjerenom metapodatku |
| Bosanska Krupa, 15.87 / 44.93 | nije pronađen | noviji primjer 22.9.2025; 0,31 m |
| Ključ, 16.779 / 44.534 | nije pronađen | primjer 27.9.2018; 0,31 m |
| Bosanski Petrovac, 16.368 / 44.555 | nije pronađen | primjer 5.7.2018; 0,31 m |

Datumi u tabeli ne opisuju cijele općine ni cijeli kanton. Nije pregledan
svaki piksel ni svaka mjesečna verzija. Datum objave arhive nije datum
akvizicije; prethodno dugme „Zima” pogrešno je nazivalo zimsku objavu
zimskim snimkom. Nova pretraga „Zima · USK” provjerava SRC_DATE za sredinu
karte i traži potvrđenu zimu sa izvornim/uzorkovanim pikselom do 2 m.
Pretraga je ograničena i mrežno nedostupni rezultati jasno se razlikuju od
„nije pronađen”. Uspješan mozaik ograničen je granicom USK-a; susjedni dio
mozaika može imati drugi datum, a odsustvo lišća/snijega treba vizuelno
provjeriti. Stari snimak nije potvrda današnjeg stanja šume.

Granica prikaza: geoBoundaries gbOpen BIH ADM2, Una-Sana Canton, Wikimedia
Commons / Public Domain, godina granice 2013. To je približna regionalna
granica za masku, a ne katastarska granica.

## Doznaka: nalaz i način provjere

Korisnik je precizirao: projektanti redovno rade **jedan iznad drugog**;
dvije ekipe po dva koriste se samo kada to traže orografija/jaruge ili
veličina odjela. Glavna simulacija koristi četiri u jednoj ekipi;
alternativna je odvojena i u svakoj ekipi radi se jedan iznad drugog.

Šest dana, svaki projektant dnevno 2/3/2/3/2/3 pojasa: 15 po osobi,
60 ukupno, 12.060 GPS tačaka. Izmišljeni krivudavi odjel: 57,0756 ha;
sintetički monotoni uspon sa bočnim promjenama padine 415–679 m i
27–45% nagiba. Pojasevi slijede izohipse; snimanje je pauzirano pri
prelasku na viši pojas. Površine su tlocrtne, ne površina nagnutog tla.
Ovo nije produkcijski projekat, stvarno odrađena doznaka ili zvaničan
plan za sječu.

Stvarni kod je imao dva važna problema: globalno sužavanje/uvećavanje
bafera samo prema jednoj tački na sredini i uklanjanje dijelova vlastitog
GPS traga kada je kolega blizu. Uvećavanje preko korisnikovog bafera i
izostavljanje GPS tačaka uklonjeni su. Granica je dio ključa keša, pa
uređena granica ne koristi staru površinu. Daleki tragovi preskaču se samo
ako ne mogu suziti bafer; izračunata površina time se ne mijenja.
Popup pojasa pokazuje stvarni dan i raspon vremena rada (Europe/Sarajevo),
umjesto datuma kreiranja cijelog projekta. Ukupno je geometrijska unija
obrezana na odjel, a GPS površina označena kao procjena.

Novi DozBands gradi zajedničke granice za susjedne paralelne pojaseve:
linija između projektanata ista je za obje susjedne površine i sve se
obrezuje na odjel. Ne popunjava udaljene praznine preko širine bafera;
ukršteni, prekratki i dvosmisleni tragovi ostaju konzervativni GPS baferi.
Sačuvane GPS tačke se ne pomjeraju. Testovi obuhvataju izohipse, rupe u
odjelu, preklapanje, promjenu granice i očuvanje originalnih GPS podataka.

Glavna proba: **57,08 ha odjel, 49,65 ha procijenjeno pokriveno, 7,43 ha
preostalo**, preklop između projektanata 0,00 ha (numerički 2,58e-8 ha).
A: 13,06 ha, B: 11,74 ha, C: 11,74 ha, D: 13,10 ha; po 15 pojaseva.
Rub odjela koji nije obuhvaćen tragovima ostaje jasno neobrađen.
Alternativne dvije ekipe: 48,07 ha pokriveno, 9,01 ha preostalo;
razdvojeni dijelovi kod zamišljene jaruge nisu lažno popunjeni.

Stvarni Leaflet prikaz 60 pojaseva/12.060 tačaka, cloud Chromium CPU4x:
1.769 ms prvog rendera, iste površine kao Node, offline reload prolazi.
To nije mjerenje na fizičkom telefonu niti garancija za 4G/GPS uslove.
Slika: outputs/doznaka-sixdays/poligon-doznaka.png i PDF istog naziva.

## Štampa i pregled razmjene

Znak lagera je jedna SVG definicija koju koriste karta i legenda; prethodna
legenda imala je drugi, crveni znak. Granica sa privatnim posjedom u
pregledu i PDF-u uvijek je crvena puna linija. Vidljivi KML slojevi mogu se
označiti kao privatna granica kroz Vrsta. Ostale stvarne boje, debljine,
crtice/tačke, outline i razlike kolega preuzimaju se sa karte. Uredi →
Izgled linija u štampi mijenja stil stvarne karte i legende za trenutni
pregled; Zatvori vraća izvorni izgled, bez izmjene geometrije i GPS podataka.
Nazivi/opisi legende ostaju zasebno sačuvani. Browser provjera pravi PDF,
provjerava stvarne SVG linije i vraćanje stilova na 320px/landscape-u.

Pošalji na server: plava primljena, zelena potvrđeno poslana i jantarna
neposlana kategorija, kartice projekta sa imenima projektanata prije
proširenja, jasna potvrda/smjer i odvojeni projekat/autor/vrijeme unutar
stavke. Jedno dugme Pošalji i primi ostaje. Prikaz je samo lokalna
historija potvrda, posljednja tri projekta, ne novi automatizam slanja.
Dnevna/tamna tema i mali/landscape ekran provjereni u stvarnom browseru.

## Reprodukcija

`node tests/simulation/doznaka-sixdays.js` i isto sa `--teams` generišu
stvarni obračun, GPS podatke i GeoJSON. `python
tests/simulation/plot-doznaka-sixdays.py` (ili `--teams`) generiše PNG,
PDF i dnevni CSV u outputs. Test `doznaka-sixdays-232.py` provjerava
stvarni Leaflet i iste površine pri reloadu bez mreže, CPU usporen 4×.
To je emulacija opterećenja, a ne mjerenje fizičkog Redmi Note 13 Pro.

DEM analitički test provjerava poznate ravnine na z12–z14, rubove,
NoData, bilinearne šavove i pokrivenost grida. Browser test dekoduje pravi
PNG, provjerava popravak keša, kvotu, offline čitanje, stvarni datum iz
metapodataka i masku USK. Servisi su mockovani u regresijskim testovima;
navedena istraživanja javnih izvora su stvarni HTTP odgovori.

## Izvori

- https://registry.opendata.aws/terrain-tiles/
- https://github.com/tilezen/joerd/blob/master/docs/data-sources.md
- https://github.com/tilezen/joerd/blob/master/docs/attribution.md
- https://registry.opendata.aws/copernicus-dem/
- https://dataspace.copernicus.eu/explore-data/data-collections/copernicus-contributing-missions/collections-description/COP-DEM
- https://earth-search.aws.element84.com/v1/
- https://dataspace.copernicus.eu/explore-data/data-collections/sentinel-data/sentinel-2
- https://s3-us-west-2.amazonaws.com/config.maptiles.arcgis.com/waybackconfig.json
- https://github.com/vannizhang/wayback-core#readme
- https://www.geoboundaries.org/api/current/gbOpen/BIH/ADM2/
