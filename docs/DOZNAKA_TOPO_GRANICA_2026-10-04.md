# DENDRO MAP 2.3.1 — približna granica sa topo podloge

Korisnik traži online pomoć pri crtanju granice odjela za doznaku. Potvrdio
je da izvor treba biti topografska podloga u aplikaciji. Prepoznaju se debele
isprekidane crne/plave linije blizu približnog poligona.

## Upotreba i implementacija

1. Uključi Topo ili instaliranu topografsku kartu na kojoj vidiš granice.
2. Doznaka → novi odjel → nacrtaj približnu granicu, najmanje tri tačke.
3. Prepoznaj granicu · online. Postavke: crna/plava/automatski i 20/50/100m.
4. Zelena je prijedlog, plava ostaje tvoja granica. Pregledaj cijeli odjel.
5. Koristi predloženu granicu ili Zadrži ručnu. Završi vraća granicu u
   postojeći obrazac odjela; ništa se automatski ne šalje na server.

Novi modul radi i kao samostalni Web Worker. Čita trenutni raster layer
`_tiles`, bez ličnih vektora. Čeka pločice, odbija neučitan dio ručne granice
i nečitljiv cross-origin raster. Maksimum1,5MP, worker15s; native OCR koristi
postojeći online Play most. OCR uklanja tekstualne okvire, a geometrija se
dobija klasifikacijom RGB komponenti, PCA dužine/debljine, smjera u odnosu na
približne stranice, kontinuiteta ponavljanih crtica i provjere zatvorenog
jednostavnog poligona. Dvije pune boje zahtijevaju ručni izbor boje. Tanke
izohipse/pune ceste/nedostajuća strana se odbijaju. Nema velikog OCR modela
u APK-u i nema novih vanjskih upload servisa.

Capture georeferencija ostaje vezana za snimljeni zoom/pixel origin ako
korisnik kasnije pomjeri kartu. Ručni crtež i sačuvani odjeli se ne mijenjaju
tokom obrade. Prije rezultata/prihvata provjerava se online stanje, nalog,
projekat, odjel, tačke i raster izvor. Undo/potez/cancel/finish uklanjaju
prijedlog i gase worker. Offline crtanje/spremanje ostaje postojeći put.

## Granice prepoznavanja

Eksperimentalna pomoć, nije automatski dokaz stvarne granice odjela.
Podrazumijevani javni OpenTopoMap često nema šumarske granice. Isprekidani
putevi sličnog izgleda mogu biti kandidati; zato je vizualna potvrda obavezna.
Za gušću/nečitku kartu nacrtaj bliže i izaberi boju/manji koridor. Ako svi
dijelovi nisu jasni, sačuvaj ručno. Raster na veoma sitnoj razmjeri ne može
pružiti pouzdanu geometriju. Detektor ne izmišlja odsutnu granicu i ne radi
bez interneta, čak ni sa lokalnom topo kartom.

## Provjere

87 lokalnih JS fajlova prošlo; 13 novih raster/geometrijskih scenarija:
crna/plava, tanka/puna linija, nedostajuća strana, OCR maska, dvije boje,
udaljena linija, samopresijecanje, neučitane pločice, neispravni ulazi i
krivina i OCR crtice koje ne smiju izbrisati granicu. Browser test koristi stvarni Leaflet grid raster i pravi worker,
online gate, prihvati/zadrži/finish, zamrznute koordinate, zakasnjeli undo/
nalog, instaliranu plavu kartu i odbijanje pune ceste te šest responsive PNG.
U CI je prije APK builda.

CI 37206197933 na b3ac6e888af3c47c43c1707488b55baad5f05d66 uspješan:
87 JS fajlova, 11 browser skripti, Android build, SHA-256 47 web fajlova,
emulator potvrđuje zabranu OCR-a bez validiranog interneta, zatim objava
APK-a i sintetička analiza CPU1x/4x. UI artefakt239 PNG; pregledani Doznaka
320px dnevni / 568x320 tamni i čisti dvosmjer uz odjel pri 1:10.000.

Release v2.3.1 / versionCode501. Preuzet stvarni APK23.908.299 B (23,91 MB).
AndroidManifest.xml dekodiran: ba.spd.uss.vlake.debug / 2.3.1-debug / 501;
-debug je postojeći Gradle build suffix, web i objava su 2.3.1. Svih 47
repo web asseta u APK-u jednako udaljenom Git stablu, devet promijenjenih
web fajlova byte-identično lokalnom izvoru, 15 launcher PNG-a piksel-identično
2.3.0. GRANICE.kml ostao >10MB. Nema ugrađenog offline OCR modela.
Stvarni v2 signing cert jednak 2.3.0/2.2.9/2.2.8:
11fcd020c703053324ae26baf7a8207373711341f503277a90ec08a8468f286d.
APK SHA256 jednak release API digestu:
c10d1828780dc75dab0a15ddf8bdb5a6ff6252854b951eb055b3d7d778828ec5.
https://github.com/pogonboskrupa/US-SUME/releases/tag/v2.3.1

Tokom provjera popravljeno: inicijalizacija alata samo uz postojeći Doznaka
markup (offline event na minimalnom fixtureu), skaliranje rastera prema
odabranom koridoru pri većem zoomu i OCR interpunkcija. Test zakasnjelog
odgovora imao je Promise čekanje prije simuliranog odgovora; ispravljen,
zaglavljen CI 37205646511 otkazan. CI sada concurrency po grani i maksimalno
20min; jednokratni cancel korak i dodatna actions dozvola već uklonjeni.
Testni marker se vraća poslije čistih PNG-a kako klik provjera ostane važeća.

Bez fizičkog Xiaomi testa, produkcijskih podataka ili provjere na stvarnoj
šumarskoj topo karti; sintetički testovi provjeravaju mehanizam i integritet,
a ne procenat prepoznavanja u stvarnim odjelima.
