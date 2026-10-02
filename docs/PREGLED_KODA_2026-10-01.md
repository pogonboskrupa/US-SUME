# Pregled koda — 1. oktobar 2026.

Grana: `CODEX-US-SUME-2026-10-01`. Polazište: `0eba708` (1.9.6).
Prethodna popravka: `c6b4715` (1.9.7). Ovaj nastavak: 1.9.8 / Android 468.

## Obim i nivo dokaza

Sistematski pregled izvršnih tokova APK-a: inventar mrežnih upisa i njihovih
pozivalaca u `index.html`, lokalna pohrana/red (`offline-layer.js`), mrežni
rokovi (`reliable-fetch.js`), Service Worker, obnova karata, GPS i native
bafer, korisničke uloge i serverska funkcija za odobrenje. Pregledani su i
build/workflow ulazi, Python geometrijski moduli i zasebni preview/Flutter
ulazi radi razgraničenja onoga što APK stvarno izvršava.

Ovo nije tvrdnja da je svaki red monolita ručno provjeren ili da je cijeli
repo bez grešaka. Minificirane biblioteke nisu predmet potpunog audita.
Produkcijska baza, primijenjene RLS politike i rad na Android uređaju nisu
provjereni. Historijske SQL migracije ne dokazuju stanje produkcije.

## Potvrđeni i popravljeni propusti

| Nalaz | Posljedica | Popravka / provjera |
|---|---|---|
| Ponovna lokalna obrada vlaka pri neuspjelom pozadinskom osvježavanju | Čitanje velikog keša i dva poziva obrade/prikaza već prikazanih vlaka | 1.9.7: pozadinski tok koristi osvježavanje bez lokalnog restore-a; prvi ulazak zadržava offline obnovu |
| Raniji uspješni uzorci drže mrtvu vezu otvorenom | Novi pokušaji i nakon uzastopnih mrežnih padova | 1.9.7: dva uzastopna pada zatvaraju automatski mrežni pristup; neuspjela proba zatvara svoj prozor |
| `saveNovProjekt` direktno radi INSERT na dobroj vezi | Kreiranje projekta zaobilazi ručno slanje | 1.9.8: lokalni UUID, trajni red prije prikaza uspjeha; isti ID pri slanju i ponavljanju |
| `sbLoadProjekti` zamjenjuje listu serverskim rezultatom bez neposlanih projekata | Nestaje neposlani projekat i poništava se aktivni odabir | 1.9.8: obnova neposlanih projekata iz reda, filtriranje vlasnika/obrisanih ID-jeva prije validacije aktivnog projekta |
| Migracija keša stabala kopira pa briše isti ključ kada `_tempId === realId` | Lokalni keš stabala nestaje nakon uspješnog ručnog slanja doznake | 1.9.8: migracija ključa samo kada se ID stvarno mijenja; legacy migracija ostaje podržana |
| Poruka na vlaci obećava slanje čim bude veze | UI opisuje staro automatsko ponašanje | Poruka sada upućuje na Meni → Server |

Novi regresijski test prije popravke reproducirao je direktni INSERT i
brisanje keša stabala (3 pada, 1 kontrolni prolaz). Poslije popravke svih
5 provjera prolazi, uključujući stvarni tok osvježavanja projekata.

## Slanje na server — potvrđeno ponašanje

| Putanja | Okidač / odluka |
|---|---|
| Vlake, projekti, odjeli šumarije, doznaka/zone/status/GPS bafer | Trajni lokalni red; `serverPosalji` otvara slanje na pritisak korisnika |
| Pokretanje, povratak signala, povratak u prvi plan | Pozivi procesora bez otvorenog ručnog slanja završavaju bez slanja reda |
| Minutni interval | Održavanje sesije/kanala i preuzimanje; ne pokreće sam slanje reda |
| Tragovi, dnevnik, tekstualne oznake | Lokalna pohrana; stari tipovi ovih operacija izuzeti iz reda za slanje |
| Fotografije | Lokalno; direktno slanje postoji za izričito dijeljenje kolegama |
| Dijeljenje kretanja | Zaseban, korisnički uključeni režim s periodičnim broadcastom lokacije |
| Članovi projekta, share kodovi, administracija, globalni stilovi i referentne karte | Direktne serverske radnje iz odgovarajućih korisničkih komandi; nisu automatsko slanje terenskog reda |

Ručni režim slanja ne znači da je aplikacija bez mrežnog saobraćaja:
preuzimanje podataka, obnova sesije, pločice i realtime prijem i dalje postoje.

## Otvoreni nalazi za ciljanu narednu provjeru

1. **Android glavni thread i disk:** `GpsService.onLocationChanged` poziva
   `NativeGpsBuffer.append`, koji radi `FileDescriptor.sync()` pod zajedničkim
   lockom. Registracija listenera nema poseban looper. Spor disk ili veliki
   native read/ack pod istim lockom mogu zadržati glavni thread. Ovo je rizik
   iz koda, ne izmjeren ANR. Potrebno je mjerenje na telefonu prije promjene
   načina trajnog GPS zapisivanja.
2. **Količina lokalnih podataka:** više registara i GPS bafer i dalje koriste
   sinhroni JSON/localStorage. Testovi čuvaju semantiku i rukovanje kvotom;
   ne dokazuju da je višesatni snimak dovoljno brz na konkretnom telefonu.
3. **Ponovno spajanje live dijeljenja:** `_sendLivePos` na nespreman kanal
   poziva `sbStartRealtime`, koji gasi postojeće kanale i live dijeljenje.
   To je odvojen tok od ručnog slanja. Treba provjeriti nastavak korisnički
   uključenog dijeljenja na promjenjivom signalu.
4. **HTML serverske stranice odobrenja:** Edge funkcija umeće ime/prezime i
   šumariju u HTML bez eksplicitnog escaping-a. Potrebno ciljano očvršćavanje
   izlaza i zasebna provjera prije produkcijskog deploymenta.
5. **Build nove grane:** `codex-webview.yml` push i job uslov prihvataju samo
   staru `CODEX-US-SUME`. Push na ovu novu granu sam neće proizvesti APK.
   Workflow nije mijenjan niti pokrenut u ovom zadatku.

## Izvršene provjere

- Svih **59 JavaScript testnih fajlova** prošlo je bez pada.
- `slab-signal.test.js`: **32/32**; `pregled-rucnog-slanja.test.js`: **5/5**.
- Sintaksa **6 inline blokova** (`index.html` + `static/map.html`) i
  **3 samostalna JS modula** provjerena preko Node VM parsera.
- `git diff --check`: bez grešaka.
- Pripremljen `tests/browser/manual-server.cjs`: stvarna stranica, sintetički
  korisnik, presretnuti vanjski HTTP/WebSocket pozivi, kreiranje/obnova/ručno
  slanje projekta. **Nije izvršen**: Playwright paket postoji, Chromium
  izvršna datoteka nedostaje; pokretanje je stalo prije otvaranja stranice.
- Python testovi **nisu izvršeni**: pytest nije instaliran niti dostupan u
  offline uv kešu. Python kod nije mijenjan.
- Android nije kompajliran, APK nije instaliran, migracije nisu pokretane.

## Terenska provjera preostala nakon novog APK-a

Na istom telefonu i sa istim lokalnim kartama: potpuno bez signala, slab
signal koji dolazi/odlazi, GPS snimanje i ručno slanje. Provjeriti odziv
karte/dugmadi, očuvanje snimka, zadržavanje neposlanog projekta i stabala.
Ako sve ostane zamrznuto, snimiti Android ANR/logcat i stanje memorije;
trenutni testovi ne utvrđuju jedinstven uzrok tog simptoma na uređaju.
