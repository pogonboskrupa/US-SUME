# Pregled aplikacije u tri cjeline — dio 1

Datum: 1. oktobar 2026. Grana: CODEX-US-SUME-2026-10-01.
Radni kod: 2.0.0 / Android 470, uključujući prethodne lokalne popravke 1.9.9.
Podjela je plan pregleda i testiranja, ne fizičko razdvajanje aplikacije.

1. Lokalni rad: vlake, tragovi, GPS doznaka, lokalna pohrana i oporavak.
2. Ručno slanje: queue, Supabase, greške i potvrde. Slanje ostaje ručno.
3. Karta/Android/build: offline karte, WebView lifecycle, native servis, APK.

## Potvrđeni nalazi i izmjene prvog dijela

| Nalaz | Reprodukcija | Izmjena |
|---|---|---|
| Doznaka mijenja liniju i statistiku prije trajnog upisa | Pad `_dozBufferTrackPoint` ostavlja tačku u memoriji; ponovno procesiranje iste tačke odbija filter udaljenosti, bafer ostaje prazan | Upis GPS tačke prethodi promjeni dužine, statistike, izvoznog niza i linije |
| Završavanje traga zanemaruje neuspjeh `_tragRegSave` | Puna pohrana: `_tragOn=false`, potvrda uspjeha i brisanje crash snimka iako registar nije spremljen | `_tragRegAdd` vraća null i povlači novi zapis iz memorijskog registra; `fabSnimTrag` završava sesiju tek nakon uspješnog upisa |
| Oporavak doznake pravi zaseban sloj za svaki segment | 5.000 tačaka daje 4.999 poziva `L.polyline` | Jedna linija s svih 5.000 tačaka, ista zelena boja oporavljenog dijela; novi segmenti i dalje imaju boju brzine |

Kod ne odgađa trajni terenski upis radi brzine. Ne uključuje automatsko
slanje. Pri neuspjelom završavanju traga snimanje ostaje aktivno, prethodni
crash snapshot se ne briše; korisnik dobija poruku da oslobodi prostor i
ponovi završavanje. Ovo nije garancija spremanja u fizički punu pohranu:
noviji dio u memoriji i dalje zavisi od oslobađanja prostora/izvoza.

## Testovi i granice dokaza

`tests/js/offline-prvi-dio.test.js` izvršava stvarne izvučene funkcije s
lažnom pohranom i mapom. Prije popravke reproducirane su greške; poslije:
- pad trajnog upisa ne mijenja GPS liniju/statistiku;
- ponavljanje iste tačke nakon oporavka pohrane stvarno sprema tačku;
- neuspješan završetak traga čuva aktivni snimak i crash snapshot;
- sljedeći uspješan završetak sprema jedan trag bez duplikata;
- 5.000 tačaka oporavka daje jedan sloj, bez izbacivanja koordinata.

Sintaksa pet inline JS blokova prolazi. Svih 61 lokalnih JS testnih fajlova
prošlo je i nakon ovih izmjena. Testovi koriste lažne servise; broj slojeva
je provjeren, trajanje zastajkivanja na telefonu nije izmjereno. APK nije
izgrađen/instaliran, produkcijski Supabase nije kontaktiran.

## Preostali rizici za ciljane nastavke

- GPS bafer i live snapshot se i dalje cijeli serijalizuju u localStorage
  po prihvaćenoj tački: cijena raste s dužinom snimanja. Potrebno profiliranje
  i zatim provjerena migracija na inkrementalnu pohranu, ne samo odgoda upisa.
- Live doznaka callback pomjera `_dozLastLiveFixTs` prije uspješne obrade.
  Native replay se ravna i prema toj oznaci; treba zaseban integracijski test
  neuspjelih live upisa, kasnijih uspješnih fiksova i ponovne native dopune.
  Popravka redoslijeda unutar `_dozProcessGpsPoint` sama ne dokazuje taj tok.
- Oštećeni JSON i nepotpuni crash snapshot trebaju širi recovery test;
  trenutni dijalog pretpostavlja `pts` niz za vlaku i trag.
- Native `FileDescriptor.sync()` i replay velikog bafera pripadaju trećem
  dijelu; dosad nema Android ANR/logcat mjerenja.

Ovo je završen prvi ciljani prolaz, ne potvrda da je cijela lokalna pohrana
bez grešaka. Drugi i treći dio još nisu završeni.
