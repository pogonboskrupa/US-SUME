# Brzina DENDRO MAP — procjena za Redmi Note 13 Pro

Analiza od 03.10.2026, izmjerena verzija **2.2.1**. Kod: `5e8163dee7aa39382aca3b78ae7e82185019c758`.

## Zaključak za terenski rad

Za telefon klase Redmi Note 13 Pro očekujem dobar odziv na manjim projektima,
uz prethodno instaliranu kartu i ograničen broj istovremeno vidljivih slojeva.
To je procjena zasnovana na kodu i simulaciji opterećenja, bez mjerenja na
fizičkom telefonu. Postoje 4G i 5G varijante tog naziva; nisu identičan hardver.
Ne pripisujem im desktop rezultate kao njihove izmjerene brzine.

Simulirani manji projekat ima 100 vlaka i 10.000 tačaka. Veći scenariji imaju
500 vlaka / 50.000 tačaka i 100 vlaka / 100.000 tačaka. Broj tačaka i složenost
geometrije bolje opisuju teret od samog broja vlaka. Svi scenariji se crtaju
na stvarnom Leaflet Canvasu, kao vlastite vlake u aplikaciji.

Najvažniji potvrđeni nalaz: **prikaz 100.000 tačaka uspijeva, ali upis tog
skupa u lokalni keš vlaka ne uspijeva**. Generisani JSON ima približno 5,4 MB.
Ograničenje lokalnog keša važnije je od nekoliko desetina milisekundi pri
bojenju. Ovo je dokumentovan nalaz i preporuka narednog zahvata; arhitektura
čuvanja nije mijenjana u ovoj objavi.

## Kako je mjereno

- GitHub CI, `Linux-6.17.0-1022-azure-x86_64-with-glibc2.39`, Chromium `140.0.7339.16`.
- Izvorne funkcije boja projekta, spiska i `_saveLocalVlake`, stvarni Leaflet
  Canvas i podaci sa koordinatama/visinom. Prvih 40 stavki spiska prikazano,
  kao u aplikaciji; model i sortiranje ipak obrađuju sve stavke.
- Tri ponavljanja po scenariju; tabela prikazuje medijanu. Ukupno 36 izvršavanja.
- CPU 1× i usporavanje 4× preko Chromiuma. **4× nije emulacija Redmi procesora**,
  nego dodatna provjera kako se kod ponaša uz manje dostupnog procesorskog vremena.
- Online/offline mijenja stanje preglednika nakon učitavanja testne stranice.
  Nema stvarne mrežne usluge. Razlike u tabeli uključuju zagrijavanje i varijaciju
  izvršavanja; ne dokazuju da je neki mod inherentno brži.
- Učitavanje obuhvata parsiranje već dostupnog JSON-a, stvaranje polilinija,
  primjenu stila i spisak. Generisanje testnog JSON-a je izvan tog mjerenja.
- Kolone „+ prikaz“ čekaju dva `requestAnimationFrame` prolaza; to je vrijeme
  završetka radnje u ovom testu, **nije prosječni FPS tokom kontinuiranog pomicanja**.
- Pomak i zoom stvarno se izmjenjuju u svakom izvršavanju, bez ponavljanja istog
  položaja koje bi mjerilo radnju bez promjene.

Nisu mjereni puni hladni start APK-a, stvarni Supabase/RLS i slanje/preuzimanje,
pločice online ili SQLite karte, sve tekstualne labele, tematski poligoni,
fotografije, native most, RAM telefona, GPS fiks, rad sa ugašenim ekranom,
potrošnja baterije ili zagrijavanje. Zbog toga nema obećanja „app se otvara za
X sekundi“ niti potvrde stabilnog FPS-a na konkretnom telefonu.

## Izmjereno — CPU 1×

| Vlake / tačke | Mreža | Učitavanje + prikaz | Bojenje + prikaz | Spisak + prikaz | Pomak/zoom | Lokalni upis | Uspjeli upisi |
|---|---|---:|---:|---:|---:|---:|---|
| 100 / 10.000 | Online | 20.9 ms | 27.3 ms | 33.3 ms | 33.4 ms | 4.4 ms | 3/3 |
| 500 / 50.000 | Online | 59.2 ms | 38.9 ms | 33.2 ms | 33.3 ms | 22.5 ms | 3/3 |
| 100 / 100.000 | Online | 87.5 ms | 49.7 ms | 31.2 ms | 53.3 ms | 21.7 ms | 0/3 |
| 100 / 10.000 | Bez mreže | 16.5 ms | 30.4 ms | 33.4 ms | 33.4 ms | 4.8 ms | 3/3 |
| 500 / 50.000 | Bez mreže | 56.2 ms | 43.4 ms | 33.2 ms | 33.3 ms | 22.4 ms | 3/3 |
| 100 / 100.000 | Bez mreže | 81.5 ms | 51.6 ms | 32.2 ms | 66.6 ms | 21.9 ms | 0/3 |

## Izmjereno — CPU usporen 4×

| Vlake / tačke | Mreža | Učitavanje + prikaz | Bojenje + prikaz | Spisak + prikaz | Pomak/zoom | Lokalni upis | Uspjeli upisi |
|---|---|---:|---:|---:|---:|---:|---|
| 100 / 10.000 | Online | 54.9 ms | 51.3 ms | 30.2 ms | 33.1 ms | 18.2 ms | 3/3 |
| 500 / 50.000 | Online | 220.4 ms | 148.6 ms | 86.1 ms | 140.7 ms | 97.1 ms | 3/3 |
| 100 / 100.000 | Online | 353.4 ms | 191.4 ms | 84.7 ms | 249.7 ms | 99.7 ms | 0/3 |
| 100 / 10.000 | Bez mreže | 59.4 ms | 71.6 ms | 32.9 ms | 33.9 ms | 20.3 ms | 3/3 |
| 500 / 50.000 | Bez mreže | 226.2 ms | 132.4 ms | 68.6 ms | 152.6 ms | 96.9 ms | 3/3 |
| 100 / 100.000 | Bez mreže | 360.9 ms | 176.1 ms | 73.5 ms | 253.3 ms | 100.7 ms | 0/3 |

Sirovi CPU intervali i svih 36 uzoraka nalaze se u priloženom JSON-u. Kolona
lokalnog upisa kod neuspjeha mjeri pokušaj, **ne uspješno spremanje**.

## Online i bez interneta

**Bez interneta:** prikaz i obrada već učitanih vlaka nemaju potrebu za serverom.
Za podlogu karte treba prethodno instalirati odgovarajuću kartu; djelimični
keš online podloge pokriva samo ranije učitane pločice i nivoe zumiranja.
Brzina otvaranja stvarne SQLite/OPFS/IndexedDB karte zavisi od njenog formata,
veličine i memorije telefona i nije uključena u ove rezultate. GPS može raditi
bez mobilne mreže; vrijeme prvog fiksa zavisi od satelitskog prijema i asistencije,
a ne samo brzine aplikacije.

**Online:** lokalne radnje ostaju iste, a slanje/prijem i podloga dodatno čekaju
mrežu i server. Sljedeće je samo račun vremena prijenosa generisanog JSON-a,
bez kompresije, po formuli `bajtovi × 8 / bitovi_u_sekundi`. Nije mjerenje
slanja u app-u. Ne uključuje upite baze, mrežna kašnjenja, ponovne pokušaje,
pločice, fotografije ni dodatna polja stvarnog serverskog odgovora.

| Tačke | Generisani JSON | Pri 2 Mbit/s | Pri 5 Mbit/s |
|---|---:|---:|---:|
| 10.000 | 0.55 MB | 2.18 s | 0.87 s |
| 50.000 | 2.73 MB | 10.91 s | 4.36 s |
| 100.000 | 5.38 MB | 21.54 s | 8.62 s |

Ne može se zaključiti da će slanje projekta trajati toliko: kompresija i
slanje samo izmjena mogu smanjiti količinu, a slab signal i više zahtjeva
povećati čekanje. CPU mjerenje iz tabele treba posmatrati odvojeno od prijenosa.

## Šta je već dobro, a šta usporava

Dobro: Canvas za vlake, ograničen početni prikaz spiska na 40 redova, GPS
filtriranje razmaka i pojednostavljenje završenih snimaka, SQLite tile obrada
u workeru i red prioriteta bliže centru prikaza. Ovi elementi postoje u kodu;
benchmark neposredno provjerava Canvas i spisak, a ne cijeli SQLite/GPS tok.

Tereti: ponovljeno parsiranje/serijalizacija cijelog keša vlaka, sinhroni
`localStorage` upisi na glavnom threadu, računanje dužina i stilizacija velikog
broja polilinija, mnogo dodatnih oznaka/poligona i fotografija. Veliki glavni
HTML i obnova svih lokalnih slojeva mogu dodatno opteretiti hladni start;
njihova tačna cijena zahtijeva mjerenje APK-a na telefonu.

## Prioriteti narednih unapređenja

1. **Premjestiti veliki keš geometrije vlaka iz localStorage u IndexedDB** uz
   provjerenu migraciju, potvrdu upisa i očuvanje terenskih podataka. Čuvati
   male postavke u localStorage; ne oslanjati offline projekat na njegovu kvotu.
2. Čuvati izmijenjenu vlaku, umjesto serijalizacije svih vlaka pri svakoj promjeni;
   grupisati upise i odvojiti ih od kritičnih GPS radnji.
3. Mjeriti i potom ograničiti prikaz oznaka/slojeva na vidljivi dio karte,
   postupno učitavati velike KML/SHP skupove, koristiti umanjene fotografije.
4. Cache dužina i pripremljenog spiska invalidirati samo pri izmjeni geometrije,
   da promjena boje ne pokreće nepotrebno računanje svih dužina.

U stvarnom radu: aktivirati projekat, prikazivati potrebne slojeve, prije
terena instalirati kartu i provjeriti preuzete podatke; nakon upozorenja o
neuspjelom lokalnom upisu izvesti snimak prije zatvaranja. Broj 100.000 nije
univerzalna granica: JSON sadržaj i drugi ključevi dijele kvotu. U ovoj
simulaciji 10k i 50k prolaze, 100k ne prolazi, i online i offline.

## Dokazi i ponovljivost

- [CI provjera i mjerenje](https://github.com/pogonboskrupa/US-SUME/actions/runs/37156338599)
- `tests/browser/performance-redmi.py` — ponovljiv sintetički scenario.
- `docs/performance/redmi-note-13-pro-2.2.1.json` — svi uzorci, medijane i metoda.
- `_saveLocalVlake` u `index.html`, Canvas `_vlakeRenderer` i `_projektVlakeRender`.

Za potvrdu na firmnom telefonu: isti projekat i ista podloga, po tri hladna
pokretanja online i u avionskom modu uz uključen GPS, vrijeme do prikaza karte,
prve pozicije i završetka prijema, zatim bojenje/pomak i barem jedno produženo
snimanje sa ugašenim ekranom. Ta mjerenja mogu potvrditi ili promijeniti ovu
procjenu; nisu izvršena u cloudu.
