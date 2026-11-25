# Snimanje traga — provjera tačnosti (v5.0.0)

Zahtjev: provjeriti tačnost snimanja traga, posebno kad se korisnik naglo
kreće u krugu do 10 m pa nazad, i napraviti ga što preciznijim.

## Kako je provjereno

Simulacija nad **stvarnim** kodom (`_addTragPoint` i sve što zove, izvučeno iz
`static/js/app/glavni.js`, isti harness kao `tests/js/trag-povratak.test.js`):

- hod 1 m/s, GPS fiks svake sekunde;
- šum ±0,5 m (dobar signal, tačnost 3 m) i ±1,5 m (krošnje, tačnost 5 m) po osi;
- 30 različitih šumova po scenariju;
- mjereno: snimljena dužina naspram stvarne i **promašaj**, tj. koliko je
  najdalja tačka stvarnog hoda udaljena od snimljene linije. To je oblik, ne
  samo dužina.

Ograničenje metode: simulirani šum je bijeli (svaki fiks nezavisan). Pravi GPS
šum je povezan (polako "pliva"), pa su brojke za ±1,5 m pesimistične. Na
telefonu nije provjereno.

## Nađene greške

### 1. Izlet u stranu pa nazad se brisao (glavni nalaz)

Primjer: korisnik ode 10 m u stranu od puta, vrati se i nastavi dalje. Na tragu
je od izleta ostajalo samo **3 m**, a od vrha izleta do nastavka puta crtala se
kosa linija preko šume.

Uzrok je u `_tragRetraceKorak`. Pri izlasku iz "povratka" funkcija
`_vlRetraceSkiniSiljak` skida oštar vrh na kraju linije, zamišljen kao GPS
odskok u trenutku okreta. Kod stvarnog izleta taj vrh je stvarni kraj izleta,
pa je brisan i on i tačka prije njega.

Ispravka: kad korisnik napušta snimljenu liniju **u stranu** (dalje od
koridora), a ne prolazeći pored vrha, vrh ostaje. Linija se nastavlja od mjesta
gdje je sišao (`izaZ`, `uStranu`). Skidanje šiljka ostaje samo za okret na
samom vrhu.

### 2. Zatvaranje malog kruga se proglašavalo povratkom

Na krugu Ø 6–10 m zadnji dio kruga prolazi kroz koridor od 6–9 m oko početka
kruga. Logika povratka je to čitala kao "hoda po već snimljenom" i taj dio nije
upisivala. Krug Ø 6 m je znao nestati skoro cijeli.

Ispravka: ulaz u povratak sada traži dvije stvari.

- **Dosljednost**: tačka smije biti X m iza vrha (duž linije) samo ako je od
  vrha pređeno bar toliko, uz 3 m tolerancije za GPS. Krug i presijecanje
  starijeg dijela traga "skoče" daleko iza vrha uz pomak od par metara, pa nisu
  povratak.
- **Smjer** (za tačke dalje od koridora iza vrha): kretanje mora biti više od
  120° suprotno od smjera linije (`_tragIdeUnazad`). Krug se zatvara krećući se
  naprijed, a bočni prilaz liniji nije povratak.

### 3. GPS šum je naduvavao dužinu (cik-cak)

Filtar od 3 fiksa je birao jedan stvarni fiks, onaj najbliži centroidu. Time je
GPS skok bio odbačen, ali bočni šum nije bio ništa manji. Na ±1,5 m šuma ravnih
70 m izlazilo je ~80 m (+14 %).

Ispravka: odbacuje se fiks najdalji od centroida (skok i dalje ne ulazi), a
preostala dva se usrednje. Ravnih 70 m sada izlazi ~73 m (+5 %), a krug se ne
izobličuje.

### 4. Kraj traga nije bio gdje korisnik stoji

- Zadnjih 2–4 m hoda se nikad nije upisivalo, jer se tačka upisuje tek uz
  dovoljan pomak.
- Ako je korisnik završio snimanje dok se vraćao istim putem (npr. krug pa
  20 m nazad), trag je završavao na okretu, 20 m od korisnika.

Ispravka: `_tragZavrsiVrh()` pri "Završi" i pri ručnoj pauzi dopisuje zadnju
poziciju. Tokom povratka to je tačka **na liniji** gdje korisnik stoji, pa nema
petlje. Inače je to zadnji neupisani fiks. Ispod 1,5 m se ne dodaje ništa (šum
u mjestu), a GPS skok se ne pamti.

## Rezultat (30 šumova po redu; prvi red je staro, drugi novo)

| Scenarij | Šum | Stvarno m | Snimljeno ø m | Promašaj ø m | Promašaj max m |
|---|---|---|---|---|---|
| Krug Ø10 pa dalje | ±0.5 | 101 | 99 → **100** | 2.2 → **1.5** | 3.4 → **3.1** |
| Krug Ø10 pa dalje | ±1.5 | 101 | 106 → **105** | 3.5 → **1.7** | 9.2 → **3.1** |
| Krug Ø10 pa nazad 20 m | ±0.5 | 91 | 82 → **88** | 1.5 → **0.5** | 2.5 → **0.7** |
| Krug Ø10 pa nazad 20 m | ±1.5 | 91 | 88 → **94** | 2.2 → **1.1** | 6.1 → **1.5** |
| Krug Ø6 pa nazad 20 m | ±0.5 | 79 | 60 → **74** | 2.6 → **0.8** | 4.8 → 4.9 |
| Krug Ø6 pa nazad 20 m | ±1.5 | 79 | 61 → **75** | 3.8 → **2.4** | 6.0 → 6.0 |
| Izlet 10 m u stranu i nazad | ±0.5 | 90 | 72 → **86** | 6.9 → **1.7** | 8.7 → **2.5** |
| Izlet 10 m u stranu i nazad | ±1.5 | 90 | 81 → **87** | 7.0 → **2.9** | 10.1 → 10.1 |
| Okret 10 m nazad pa naprijed | ±0.5 | 90 | 69 → 69 | 1.9 → **1.3** | 3.1 → **2.5** |
| Okret 10 m nazad pa naprijed | ±1.5 | 90 | 79 → **73** | 1.8 → **1.5** | 2.9 → 3.0 |
| Ravno 70 m | ±0.5 | 70 | 69 → 69 | 1.8 → **1.4** | 3.0 → 3.2 |
| Ravno 70 m | ±1.5 | 70 | 79 → **73** | 2.0 → **1.7** | 4.3 → **3.9** |

Kod "Okreta" snimljena dužina je namjerno manja od stvarne. Hod nazad po već
snimljenom (kraći od 30 m) ne upisuje se dvaput, da ne nastane petlja. Ta
odluka je iz v1.9.2 i nije mijenjana.

## Šta ostaje, i zašto

- **Krug manji od ~8 m** se i dalje ponekad djelimično izgubi (max promašaj
  ~5–6 m). To je na granici onoga što GPS razlikuje: krug Ø 6 m i okret uz GPS
  pomak od 3–6 m u stranu (pravi terenski slučaj iz v1.9.1) izgledaju isto.
  Sužavanje koridora bi vratilo petlje pri okretu.
- **Izlet od 10 m pod krošnjama (±5 m)**: u 1 od 30 šumova vrh izleta se
  izgubi. Ovo je isti razlog, jer je izlet tek dva puta veći od greške GPS-a.
- **Kratak hod nazad se ne broji u dužinu** (vidi gore) osim zadnjeg dijela
  pri "Završi".
- **Oporavak poslije ubijenog procesa usred povratka** završava trag na
  okretu. Snimak (`_crashSaveTrag`) ne nosi stanje povratka, pa se kraj ne
  dopisuje.

## Šta nije mijenjano (provjereno da je ispravno)

- Prag tačnosti fiksa (`_tragAccPrag`): na početku samo ≤ 12 m, poslije
  3× najbolja tačnost u zadnjih 60 s.
- Brzinska kapija od 35 m/s.
- Auto-pauza poslije 2 min mirovanja. Hod nazad se računa kao kretanje.
- Pojednostavljenje pri čuvanju (`_rdpSimplify`, 0,8 m). Udaljenost se mjeri do
  odsječka, ne do beskonačne prave, pa vrh izleta koji se presavija nazad ostaje.
- Dug povratak (> 30 m) se snima kao nov hod.

## Testovi

`tests/js/trag-povratak.test.js` ima 16 testova (8 novih), nad stvarnim kodom.
Novi testovi pokrivaju izlet 10 m, krug Ø 10 i Ø 8, krug pa nazad, "Završi"
usred povratka, "Završi" u mjestu, usrednjavanje, GPS skok i presijecanje
starog traga.

Provjereno je da 6 novih testova pada na kodu prije ove izmjene. Dva prolaze i
na starom kodu jer čuvaju ponašanje koje mora ostati: "Završi" u mjestu ne
dodaje šum, a GPS skok ne ulazi u trag. Svih 8 starih testova i dalje prolazi.
