# Dio 2 — ručno slanje i Supabase

Grana: CODEX-US-SUME-2026-10-01. Radna verzija: 2.0.1 / Android 471.
Prethodne lokalne izmjene prvog dijela su sačuvane. Slanje ostaje ručno.

## Obim

Pregledani su `serverPosalji`, `_processOfflineQueue`, provjere vlasnika,
serverske potvrde promjene statusa/zone, projekti i doznaka projekti, retry
klasifikacija, Supabase transport i postojeći testovi. Ovo je pregled
klijentskog koda; nisu pregledane produkcijske RLS politike i stvarna baza.

## Reproducirani i popravljeni propusti

| Problem | Dokaz prije izmjene | Ponašanje poslije |
|---|---|---|
| Nepoznat tip operacije | Procesor nije izvršio zahtjev, ali je uklonio operaciju jer je `err` ostao null | Operacija ostaje uz `UNSUPPORTED_OPERATION` i opis za pregled |
| Status doznake/sklanjanje zone bez potvrde | `{error:null,data:[]}` dovodio je do uklanjanja iz reda | UPDATE traži `select('id')`; mora se vratiti ciljani ID, inače `NO_CONFIRMATION` i zapis ostaje |
| Zakašnjeli odgovor kreiranja projekta nakon promjene naloga | Lokalni keševi novog korisnika mijenjani prije provjere vlasnika; moguć dodatni upis članstva | Vlasnik se provjerava odmah nakon odgovora, prije lokalnih promjena; isto za upis zone |
| Cijeli ručni ciklus nastavlja pod drugim nalogom | U testu tri prolaza, iako prvi mijenja nalog | Pamti se nalog koji je pokrenuo slanje; promjena zaustavlja dalje prolaze i daje jasnu poruku |

UPDATE s nula vraćenih redova ne govori je li uzrok RLS ili nepostojeći
zapis; aplikacija zato ne izmišlja uzrok. Zadržava operaciju radi provjere.
SELECT traži samo ID, ne puni sadržaj. Ako konfiguracija baze ne dopušta
potvrdu vraćenog reda, operacija ostaje lokalno, umjesto lažne potvrde.

## Testovi

`tests/js/rucno-drugi-dio.test.js`: 8/8 provjera nad izvornim funkcijama,
sa sintetičkim Supabase odgovorima. Prvih sedam je prije popravke dalo pet
padova i dva kontrolna prolaza. Dodatni test promjene naloga reproducirao
je tri prolaza umjesto jednog. Poslije izmjene svi prolaze.

`tests/js/server-rucno.test.js`: 50/50. Sintaksa pet inline JS blokova i
`git diff --check`: bez grešaka. Svih 62 JS testnih fajlova prolazi na završnom
stanju. Nema produkcijskih upisa, migracija ni APK builda.

## Otvoreni nalazi i granice

- Legacy potvrda INSERT konflikta `23505` za projekte i zone pretpostavlja
  da je klijentski ID već upisan. Za potpunu potvrdu treba provjeriti red i
  sadržaj pod istim vlasnikom, uključujući stvarne UNIQUE/RLS uslove. To nije
  riješeno ovim izmjenama.
- `_serverURed` ne prenosi pozivaocima neuspješan enqueue; treba zasebno
  provjeriti svaki UI put prije promjene ugovora te funkcije.
- DELETE vlake i dalje koristi postojeći idempotentni tok bez potvrde broja
  obrisanih redova; test na stvarnim RLS pravima ostaje potreban.
- Ručni tok čeka zauzet procesor najviše 60 s, dok transport može čekati duže.
  Za potpuno upravljanje završetkom potrebna je zajednička Promise potvrda
  aktivnog prolaza, uz testove refresh/rerun utrka.
- Serijalizacija velikog reda na glavnoj niti nije uklonjena. Popravke ovog
  dijela poboljšavaju tačnost potvrda i izolaciju naloga, ne predstavljaju
  izmjerenu optimizaciju brzine na Android uređaju.

Treći dio: offline karte, Android WebView/lifecycle i APK build.
