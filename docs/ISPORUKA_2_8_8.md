# Isporuka Dendro Map 2.8.8

[Preuzmi APK](https://github.com/pogonboskrupa/US-SUME/releases/download/v2.8.8/app-debug.apk).
Ažuriranje je dostupno i kroz **Meni → Ažuriranje aplikacije**.

## Izvještaj odjela

- Početni prikaz sada jasno nudi dvije odvojene metode: **Nacrtaj poligon** i **Izaberi poligon** iz sloja granica.
- Nakon potvrde nacrtanog ili izabranog poligona analiza terena počinje automatski. Više nije potreban dodatni pritisak na „Izračunaj teren“.
- Status pripreme, računanja, uspjeha i greške prikazan je u istom koraku. Kod greške ostaju sačuvani geometrija i dugme za ponovni pokušaj.
- Panel je pojednostavljen i prilagođen uskim ekranima, Dnevnom modu i tamnom prikazu.

## Projekcija doznake

- Plan poštuje minimalni prosječni učinak od **2 ha dnevno po projektantu**.
- Ako uneseni broj pojaseva ne postiže minimum, aplikacija automatski povećava efektivni dnevni tempo i jasno prikazuje unesenu i korigovanu vrijednost.
- Ako je cijeli odjel manji od minimalnog punog ekipnog dana, rezultat se prikazuje kao **dio radnog dana**, bez lažnog produžavanja plana.
- Rezultat prikazuje ostvareni prosjek u ha po projektantu dnevno.

## Potvrđena isporuka

- Source `cbb3364fa25af76905a21e272c0fa5a24d13ab0f`, tree `cd58bdcf1cccd3d81a8e6948404f2e79fb18b2b7`.
- [CI 38158596255](https://github.com/pogonboskrupa/US-SUME/actions/runs/38158596255), job `114526597284`: **SUCCESS**.
- Prošli su svi JavaScript testovi, izolovani PostgreSQL/RLS testovi, cijeli browser pregled, Gradle build i Android emulator za WebView/Explorer/OCR offline tokove.
- Posebni browser testovi provjerili su Izvještaj odjela i projekciju doznake na širinama 320, 390 i 800 px, u dnevnom i tamnom prikazu.
- Semantički testovi projekcije uključuju 48 ha i 4 projektanta: plan daje 6 dana i prosjek 2 ha po projektantu dnevno.
- APK: 24.417.276 B; SHA-256 `ae4ef3fc9dbe4c544cc46f5d76b08475d385cfa6db1fec17b4e17f7cc8d84091`.
- Manifest: `ba.spd.uss.vlake.debug`, versionCode 558, versionName 2.8.8-debug.
- APK v2 potpis je važeći i certifikat je isti kao u prethodnoj verziji: SHA-256 `11fcd020c703053324ae26baf7a8207373711341f503277a90ec08a8468f286d`.
- Svih 73 web resursa u APK-u identično je izvoru.

## Granice provjere

Novi tokovi provjereni su automatizovano u browseru, testnim servisima i Android emulatoru. Fizički Xiaomi nije korišten, a produkcijski Supabase nije mijenjan.
