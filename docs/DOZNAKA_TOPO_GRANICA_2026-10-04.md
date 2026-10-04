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

87 lokalnih JS fajlova prošlo; 12 novih raster/geometrijskih scenarija:
crna/plava, tanka/puna linija, nedostajuća strana, OCR maska, dvije boje,
udaljena linija, samopresijecanje, neučitane pločice, neispravni ulazi i
krivina. Browser test koristi stvarni Leaflet grid raster i pravi worker,
online gate, prihvati/zadrži/finish, zamrznute koordinate, zakasnjeli undo/
nalog, instaliranu plavu kartu i odbijanje pune ceste te šest responsive PNG.
U CI je prije APK builda. CI, objava i stvarni APK: u toku.

Bez fizičkog Xiaomi testa, produkcijskih podataka ili provjere na stvarnoj
šumarskoj topo karti; sintetički testovi provjeravaju mehanizam i integritet,
a ne procenat prepoznavanja u stvarnim odjelima.
