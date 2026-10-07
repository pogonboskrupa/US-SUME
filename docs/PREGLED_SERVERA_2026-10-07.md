# „Pošalji na server“ — pregled grešaka i novih korisnika

Datum: 7.10.2026. Aplikacija: **2.4.7 / Android code517**. Grana:
`CODEX-US-SUME`; pregledana datotečna stabla lokalnog HEAD-a i GitHub commita
`decd0e82936ac987ff20c539e916194a91376649` identična su prije ovog pregleda.

**Potvrđen je uzrok koji može izazvati prijavljeni RLS tekst:** dodavanje
projektanta u projekat koji je još samo na telefonu. To nije dokaz da je
upravo taj slučaj nastao na korisnikovom uređaju. Za konačnu dijagnozu
konkretnog naloga potrebni su korak na kojem je greška nastala i stvarna
pravila iz Supabase baze. Nisu dostupni produkcijski logovi/prava baze.

Korisnikova ranija potvrda primjene probnog SQL-a zabilježena je u
`CODEX_CONTEXT.md`, §54. Ona nije nezavisna provjera trenutne funkcije u
bazi. Ne treba pretpostaviti da SQL nije pokrenut.

## Šta se zaista razmjenjuje

Jedno dugme u `static/js/server-panel.js`, `exchangeData()`, izvršava:

1. `serverPosalji()` — trajni red projekata, vlaka, doznaka odjela, zona,
   statusa i GPS tačaka pojasa. Otvara kapiju za slanje samo tokom zahtjeva.
2. `serverPreuzmiDijeljeno()` — vlastiti i dijeljeni projekti/vlake, uz
   preuzimanje geometrije po stranicama.
3. `_serverPreuzmiDoznaku()` — lista dostupnih odjela; članovi, zone i GPS
   tačke **odabranog odjela**, ako je odjel otvoren. Ne preuzima automatski
   geometriju svakog odjela na listi.

Prijem se pokušava i nakon neuspjelog slanja; panel prikazuje odvojene
statuse, pa djelimičan uspjeh nije isto što i potpuna razmjena.

Dodavanje kolege u `projekt_clanovi` **nije operacija ovog reda**. Funkcija
`confirmDodajClanove()` iz detalja projekta šalje neposredan INSERT.
Članstvo projekta vlaka i članstvo odjela doznake su odvojene tabele:
`projekt_clanovi` i `doz_project_members`. Članstvo u jednoj ne daje automatski
članstvo u drugoj. Tragovi, fotografije, dnevnik i tekstualne oznake nisu
dio ovog slanja; fotografije imaju poseban izričit tok dijeljenja.

## Potvrđeni problemi i prioritet

| Prioritet | Nalaz | Posljedica i dokaz |
|---|---|---|
| P1 | Dodavanje projektanta ne provjerava `_pendingSync` | `saveNovProjekt()` (index.html:9327) uvijek pravi lokalni projekat. `showProjektDetalji()` (9398) ipak nudi dodavanje; `confirmDodajClanove()` (9650) odmah radi INSERT. RLS zahtijeva da projekat već postoji i da je pozivalac vlasnik. PostgreSQL test dobiva baš `new row violates row-level security policy for table "projekt_clanovi"`; nakon slanja istog projekta članstvo prolazi. Novi korisnik češće ima samo takve nove projekte. |
| P1 | Greške pojedinih čitanja članstva zanemaruju se | `sbLoadProjekti()` (9051) ne provjerava error za `clanstva`, odgovor dijeljenih projekata i članove pojedinačnih projekata. Greška postaje prazan spisak. Zamjenjuje se projektni keš, može se deaktivirati odjel, a `_kvcPurgeStale()` (11026) briše keš vlaka kolega čiji je projekat tako nestao. Reprodukcija potvrđuje i brisanje keša, ne samo promjenu liste. Serverski redovi i neposlani vlastiti red ostaju. |
| P1 | Prijem ne potvrđuje pristup prije tumačenja praznog rezultata | `serverPreuzmiDijeljeno()` (6544) zahtijeva lokalne `sbUser/sbProfile`, ali ne odbija `_cachedStub` niti provjerava trenutni serverski gate. SELECT pod RLS-om može uredno vratiti `[]` bez greške. Funkcija to proglašava uspješnim prijemom nula projekata i uklanja lokalno članstvo. PostgreSQL potvrđuje prazan SELECT kada gate odbija nalog; JS test potvrđuje lažan uspjeh i promjenu članstva. Prazan rezultat može biti i legitiman, pa ga ne treba uvijek proglašavati greškom: potrebno je prvo potvrditi sesiju/pristup. |
| P2 | Uzrok prijema gubi se između funkcija i panela | `serverPreuzmiDijeljeno()` u catch vraća samo `{ok:false}` i opću poruku. Panel nema kod/tabelu/razlog. Neuspjelo slanje bez napretka u `serverPosalji()` upućuje na signal čak i za RLS odbijanje. Korisnik zato ponavlja mrežni pokušaj i kada treba riješiti članstvo/pristup. |
| P2 | RLS greške GPS tačaka doznake ostaju bez dijagnostike | `_dozPosaljiPojedinacno()` (38982) preskače odbijenu tačku, ali vraća `error:null` čak i kada su sve odbijene. Bafer i brojač čuvaju tačke, pa se slanje ne proglašava potpuno uspješnim, ali konkretan RLS razlog nije dostupan panelu Problemi. Serija od 100 odbijenih tačaka može napraviti 100 pojedinačnih pokušaja. |

Ove reprodukcije nalaze se u `tests/audit/server-247.cjs`. To je ručni audit
postojećeg lošeg ponašanja, **nije** regresijski test koji zahtijeva da buduća
ispravka zadrži bug. Aplikacijski kod nije mijenjan u ovom pregledu.

## Sedmodnevni pristup i RLS

Mjerodavna su dva nezavisna uslova:

- Pozivalac ima pristup aplikaciji: odobren/admin, ili nikad ranije odobren
  korisnik s važećim `probni_do`. To računa `public.je_odobren()`.
- Pozivalac smije traženu projektnu radnju: vlasnik dodaje članove; član
  vidi dijeljeni projekat i njegove vlake, ali ne može sam dodavati kolege.

`20260713_dijeljenje_popravka.sql` postavlja INSERT članstva kroz postojanje
projekta čiji je vlasnik `auth.uid()`. `20260727_pristup_odobrenje.sql` na
projektne/doznaka tabele dodaje restrictive `zzz_odobren`. Ona se AND-uje s
pravima vlasnika/člana, ne zamjenjuje ih. `20261005_probni_pristup_7_dana.sql`
mijenja centralni gate da prihvati probni rok, ali ne daje pravo upisa u
proizvoljan tuđi projekat.

Izolovana PostgreSQL 16 provjera, sa stvarnom migracijom dijeljenja i
probnog pristupa iz repoa, potvrdila je:

- Novi probni vlasnik može poslati projekat/vlaku i zatim dodati kolegu.
- Odobreni član i član u važećem probnom roku vide projekt i vlaku vlasnika.
- Član ne može sam širiti članstvo; neposlan projekt odbija članstvo.
- Vraćanje starog `je_odobren()` odbija novog probnog vlasnika i za postojeći
  projekat. SELECT je tada prazan, a INSERT dobiva 42501.
- Istekli probni član dobiva prazan SELECT. Nalog se ne briše; postojeći
  fixture potvrđuje da kasnije admin odobrenje vraća pristup.

**Ne pokretati staru konsolidovanu migraciju kao naslijepu popravku.**
Migracija 20260713 briše sve politike na projektnim tabelama, uključujući
naknadno dodane restrictive gateove; 20260727 ponovo uspostavlja stari
`je_odobren()` i automatski odobrava tada postojeće naloge. Redoslijed i
trenutno stanje baze zato su bitni. Ispravno rješenje mora biti usko, uz
zadržavanje vlasništva, članstva i probnog roka.

Dodatni nalaz čitanja koda: `Predaj projekat`, `_doTransferProjekt()`
(10372), pokušava promijeniti vlasnika direktnim UPDATE-om, što kasniji
`projekti_update WITH CHECK(korisnik_id=auth.uid())` zabranjuje. Na staroj
politici gdje prvi korak prođe stari vlasnik zatim više ne smije upisati
članstvo. Taj tok traži zasebnu atomarnu serversku operaciju; nije dokaz da
je korisnik upravo njega koristio. Ni taj problem nije popravljan ovim auditom.

## SocketException i slaba veza

SocketException označava problem mrežnog povezivanja/prenosa i nema isto
značenje kao PostgreSQL 42501. Sam tekst bez detalja ne razlikuje prekid
mobilne/Wi-Fi veze, zatvoren socket ili drugu smetnju prenosa.

Supabase ide kroz WebView `fetch` i `reliableFetch`, a ne kroz native
UpdateBridge. Eksplicitni Java tretman SocketException u `MainActivity.java`
(696) pripada **ažuriranju APK-a s GitHuba**. Zbog toga treba znati na kojem
ekranu se greška pojavila; native poruka ažuriranja nije dokaz greške
projektnog servera. I WebView saobraćaj može imati mrežni prekid.

Transport ima rok bez napretka od 15 s, produžen prema veličini slanja
(dodatno najviše 120 s), obnovu roka pri prijemu bajtova i ukupno ograničenje
od 5 min po pozivu. Mrežni pad zaustavlja prolaz reda; ista operacija ostaje
lokalno. `navigator.onLine=true` ne dokazuje da server zaista radi.

## Šta je dobro

- Red čuva neposlane vlake/projekte/zone i na RLS grešci; nakon više
  odbijanja stavka se blokira za ručni pokušaj, ne briše se automatski.
- Mrežna greška razlikuje se od koda 42501; JWT 401/PGRST301 ima poseban
  pokušaj osvježavanja sesije. RLS zabrana ne tretira se kao istek tokena.
- Vlake imaju provjeru ID-ja/revizije/sadržaja nakon izgubljenog odgovora;
  postojeći testovi pokrivaju stvaran konflikt i oporavak bez duplikata.
- Prijem vlaka je paginiran; potpuni rezultat traži sve stranice prije
  zamjene geometrije. Prijem vlastitog rada štiti živu/neposlanu vlaku.
- Kombinovani panel čuva odvojene statuse slanja/prijema i sprječava
  dvostruki pritisak da započne paralelnu razmjenu.
- Doznaka GPS ide u trajni bafer i serije; zone/GPS koriste odvojene
  politike i ne treba zaobilaziti ta pravila radi uklanjanja poruke.

## Provjere izvršene

- **14 postojećih JS grupa:** server-komunikacija, server-panel,
  server-primljeno, server-rucno, server-dvije-vlake, server-vlake-doznaka,
  server-povratak-217, rucno-drugi-dio, slab-signal, reliable-fetch,
  fetch-rok, access-policy, offline-layer, offline-oporavak-brzina — prošle.
- **7 audit scenarija** u `tests/audit/server-247.cjs` — reproducirani.
- `tests/sql/server-clanstvo-247.sql` u svježem izolovanom PostgreSQL 16
  containeru bez mreže — prošao; uvozi i postojeći probni RLS fixture.
- `tests/browser/server-confirm-234.py`, Chromium, stvarni vendored Supabase
  klijent/PostgREST zahtjevi prema kontrolisanom HTTP servisu — prošao:
  izgubljen odgovor brisanja, potvrda stanja, RLS/503/nepostojeći red,
  migracija ID-ja i statusi vlasnika/kolege. Nije produkcijski Supabase.
- `supabase/dijagnostika_server_20261007.sql` — izvršen bez greške u
  fixtureu; sadrži samo SELECT i radi i bez kolone `probni_do` u profilu.

Prolazni testovi postojećih tokova ne poništavaju dodatne reproducirane
probleme. Fizički Xiaomi, stvarni mobilni signal i konkretan nalog/pravila
produkcijske baze **nisu provjereni**.

## Prvi koraci i redoslijed popravki

1. **Privremeno:** novi projekat prvo uspješno poslati kroz „Pošalji i
   primi“, pa zatim kao vlasnik dodati kolegu. Kolega potom pokreće prijem.
   Ovo pomaže za neposlan projekt; ne rješava istekli/odbijeni pristup.
2. Izvršiti **samo dijagnostiku** `supabase/dijagnostika_server_20261007.sql`
   u SQL Editoru i provjeriti definiciju `je_odobren`, politike članstva,
   restrictive gateove i probni trigger. Skripta ništa ne mijenja i ne
   traži PIN, token ili e-mail.
3. Prva aplikacijska popravka: zaštititi dodavanje člana dok projekat nije
   potvrđen na serveru; jasno prikazati što treba prvo poslati. Potom
   uvesti provjeru svih grešaka čitanja članstva i zadržati keš na grešci.
4. Prije prijema provjeriti važeću sesiju i serverski pristup; kada je
   pristup valjan, stvarno prazna lista i opoziv članstva ostaju legitimni.
5. Sačuvati i prikazati grešku po fazi/tabeli/kodu, uključujući GPS bafer;
   odvojiti prekid mreže, probni rok, članstvo i konflikt.

Ovo je isporuka pregleda, dijagnostike i reprodukcija. Runtime aplikacije,
RLS u produkciji, podaci i APK nisu mijenjani; verzija ostaje 2.4.7.
