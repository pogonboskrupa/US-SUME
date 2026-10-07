# Upute za korištenje — v2.4.9

Upute su ugrađene u aplikaciju: **Meni → Upute za korištenje**. Ne trebaju
internet niti preuzimanje dodatnih slika. Izvor je `index.html` (help-modal),
a prikaz koristi postojeći `static/css/field-design.css`.

## Organizacija za korisnika

- **Prvi koraci:** priprema projekta/odjela, offline karte, GPS, razmjena,
  oznake, fotografije, navigacija, štampanje i najčešće poteškoće.
- **Vlake:** odmah vidljivi koraci za prvu GPS vlaku. Odvojene teme za krakove,
  povratak na roditelja, nastavak snimanja, dvosmjer, bafer, ručno crtanje i
  prepoznavanje s papirne karte. Shema T4/T4.1/T4.2 objašnjava numeraciju.
- **Doznaka:** odmah vidljivi koraci za prvi pojas. Izrada odjela, online pomoć
  pri granici, raspored ekipe po izohipsama, tumačenje površina, server/QR,
  posebne zone, povezane vlake i stabla. Shema četiri projektanta razlikuje
  viši/niži dio odjela. Primjer šest dana znači 48–72 snimanja uz 2–3 pojasa
  dnevno po projektantu; nije prognoza učinka niti stvarno mjerenje.
- **Simboli:** postojeći prikaz usklađen s podesivom granicom i čitljivošću.

Svaka tema otvara se dugmetom; dugi odlomci su zamijenjeni kratkim koracima
ili opisima. Koraci i glavni tekst su 14 px, dugmad najmanje 48 px. Dnevni i
tamni mod koriste boje aplikacije. Promjena taba vraća pregled na početak;
proširene teme mogu se otvoriti i tastaturom uz stanje `aria-expanded`.

## Provjera prema stvarnom kodu

| Tema | Provjereni izvor / ispravka |
|---|---|
| Nova/nastavak vlake | `_openVlakaPicker`, `_renderVlakaList`, izbor tačke za nastavak; uklonjen stari opis „Snimi direktno“ |
| Krak/roditelj | `vratiSeNaRoditelja`: automatska pauza prije povratka; uklonjen suprotan opis trenutnog nastavka |
| Granica doznake | obrazac koristi **Kreiraj projekat**, ne stari „Spremi odjel“; GeoJSON, KML poligoni i ručno crtanje |
| Snimanje pojasa | stvarni nazivi **Počni GPS / Zaustavi GPS**, pauza/nastavak; novi pojas pokrenuti na njegovom početku |
| Timski raspored | upute slijede korisnikov zahtjev: jedan iznad drugog po izohipsama, niže → više; dvije ekipe za terenske razloge |
| Površine | `DozBands.build`, `_dozComputeBands`, `_dozPokrivenost`: zajedničke granice za pogodne bliske paralelne tragove, inače konzervativni bafer; površine su procjene, ne potvrda završene doznake |
| Vanjski rub / bafer vlaka | vanjski rub je udaljenost od traga; bafer vlaka 80 m je ukupno 40 + 40 m |
| QR | odvojeni lokalni registar primljenih tragova; nije automatski server upis niti ulaz u statistiku pokrivenosti |
| Server | slanje svih projekata; prijem zona/pojaseva za otvoreni odjel; razlikuje lokalno čuvanje i potvrdu servera |
| Offline karta | direktno povezani Android fajl treba zadržati; kopiranje zavisi od izvora |

Izmjene su ograničene na upute, njihov izgled/preklapanje tema i verziju.
GPS, pohrana, server, geometrija i izračun površina nisu mijenjani.

## Validacija

- Svih 5 nepraznih inline JS blokova prolazi `node --check`.
- Prošlo svih 99 grupa postojećih JavaScript testova i šestodnevna simulacija.
- Proširena postojeća browser provjera `project-vlake-220.py`: svi tabovi,
  otvaranje tema tastaturom, 14 px koraci, bez horizontalnog izlaska,
  povratak skrola pri promjeni taba, sheme i rad uz isključenu mrežu.
- Pregled 320 × 568, 390 × 800, 568 × 320 i 800 × 600, dnevni/tamni mod;
  sačuvani PNG pregledi u `outputs/ui-preview/`, vizuelno pregledani Vlake
  (dnevni) i Doznaka (tamni) na 320 px.
- CI [37602046578](https://github.com/pogonboskrupa/US-SUME/actions/runs/37602046578)
  završio uspješno: svi browser testovi, probni SQL/RLS i 4 instrumentacijska
  testa na Android 14 emulatoru, bez padova/preskakanja.
- Konačni APK ima svih 60 web fajlova s identičnim hashovima izvornog koda,
  versionName 2.4.9-debug, versionCode 519, postojeći stabilni potpis.
  Veličina 24.071.423 B; SHA256
  `59a588d1450218b6df925d6ac462ca6e546a222b1173bfb08c35dc26ea6d255d`.
- [APK v2.4.9](https://github.com/pogonboskrupa/US-SUME/releases/download/v2.4.9/app-debug.apk)
  objavljen je s izvornog commita `e8e778afe22360c3513e56f53bf59532dc3194a8`;
  dostupan u Meni → Ažuriraj aplikaciju.
- Fizički Xiaomi i produkcijska Supabase baza nisu dio ove provjere.
