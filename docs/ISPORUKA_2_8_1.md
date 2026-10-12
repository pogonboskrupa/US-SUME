# Dendro Map 2.8.1 — potvrđena isporuka

Datum: 2026-10-11. Radna grana: `CODEX-US-SUME`.

## Izmjene

- Doznaka: projekcija radnih dana za granicu projekta ili ručno odabrane odsjeke iz Granica. Širina 10/15/20 m ili vlastita; broj projektanata; dnevni broj prolaza **po projektantu**. Pojasevi slijede interpolirane DEM izohipse od nižeg prema višem. Najviši prati svoj prethodni pojas pri povratku, drugi dobijaju nove pojaseve uz kružni red. Praćenje troši dnevni prolaz, a obrađena površina se računa jednom. GPS ostaje prva radna sekcija; projekcija je odmah ispod.
- Pregled plana: dani, imena/boje projektanata, novi i praćeni pojasevi, površina, mapa i legenda. Parametri, boje, dan i prikaz čuvaju se po nalogu i projektu. Plan ne mijenja stvarne GPS tragove ni izvršenu doznaku.
- Foto postavke: promjena razmjere i osvježavanje primljenih slika poštuju pojedinačno/grupno Sakrij. Obnova nakon ponovnog pokretanja čuva prikaz svih pet grupa oznaka.
- Meni: Pošalji na server je prva stavka, izdvojena plavom bojom u tamnom i dnevnom modu. Upute za Doznaku su ažurirane.

## Dokaz isporuke

Izvor APK-a: `94ff900a19825bae223a4dd8a4ac8a63f592de88`, tree `c6d7e22e99c61db25732a95870d6eda8e38da8c3`.

- [Završni CI 38119500745](https://github.com/pogonboskrupa/US-SUME/actions/runs/38119500745): SUCCESS. Svi JavaScript testovi, tri PostgreSQL fixturea, cijeli browser skup, Android izgradnja, provjera sadržaja i analiza brzine prošli su.
- Android 34 emulator: **20 testova, 0 padova, 0 grešaka, 0 preskoka**, potvrđeno iz JUnit XML artefakta.
- Plan: 7 semantičkih DEM/raspored/površina testova; puni app sa PNG dekodiranjem, Workerom, stvarnim KML izborom i IDB obnovom, offline/cache, prekidom, odvajanjem naloga/projekta, šest rasporeda i provjerom kontrasta.
- Foto: dvije vlastite i jedna primljena slika, pet zoom ciklusa, dva restarta, pojedinačni/grupni prikaz; šest pregleda Menija i stvarni klik Servera. U izvještajima nema JS grešaka ni vanjskih upisa.
- Dnevni mod: 144 popunjena pregleda, bez nalaza kontrasta, JS grešaka ili vanjskih upisa.
- Browser simulacija: 3.000 m vlastitih + 2.400 m koleginih vlaka, 1.360/5.410 tačaka, CPU1x/4x, online/offline i slaba/mrtva mreža. Ovo nisu mjerenja na Xiaomi telefonu.
- UI ZIP SHA-256: `d8c28e2a40e5dee502f05a456fb693f0a8508e8cee381f3159be5adbdd2f8026`. Android ZIP: `c647c2f12d3ef14a3d0887fda7e097e3d1497f93b0e0dfa7a4438f082471201a`.

[Objava 2.8.1](https://github.com/pogonboskrupa/US-SUME/releases/tag/v2.8.1) · [javni APK](https://github.com/pogonboskrupa/US-SUME/releases/download/v2.8.1/app-debug.apk).

Stvarni javni APK je preuzet i pregledan: 24.367.767 B; SHA-256 `13c6917f183e2755e49c9b8b3f0d94c284577680a2a1bd43f3b596a1cdaf217e`, jednak GitHub asset digestu. Paket `ba.spd.uss.vlake.debug`, versionCode **551**, versionName **2.8.1-debug**. Certifikat SHA-256 `11fcd020c703053324ae26baf7a8207373711341f503277a90ec08a8468f286d` jednak prethodnom 2.8.0 APK-u. **Svih 72 web resursa** u preuzetom APK-u imaju identičan SHA-256 kao izvor.

Endpoint koji koristi native updater `/releases?per_page=1` vraća `v2.8.1`, `app-debug.apk`, isti SHA i javni URL. GitHub Pages index/sw takođe su upoređeni bajt po bajt sa završnim izvorom. Nova Supabase migracija nije potrebna za ove izmjene; produkcijska baza nije mijenjana.

## Granice provjere

Projekcija je procjena dnevnog učinka, bez automatskog odbitka već izvršene doznake, odmora, prilaza, vremenskih uslova ili različitog obima posla po pojasu. DEM je približno 30 m; razmak pojaseva na promjenjivom terenu je približan. Nedostajući DEM ne daje izmišljene izohipse. Fizički Xiaomi, stvarni GPS u šumi, produkcijska Supabase pravila i instalacija na korisnikovom telefonu nisu testirani ovim postupkom.
