# Isporuka Dendro Map 2.8.9

[Preuzmi APK](https://github.com/pogonboskrupa/US-SUME/releases/download/v2.8.9/app-debug.apk).
Ažuriranje je dostupno i kroz **Meni → Ažuriranje aplikacije**.

## Stabilan prikaz na sporijim telefonima

- Uzrok nestajanja dijelova prikaza bio je zbir velikog broja zadržanih pločica,
  dekodiranih offline canvas pločica i dodatnih GPU/compositor slojeva. Jači
  telefon je taj pritisak prikrivao, dok je Android WebView na slabijem uređaju
  mogao odbaciti teksture ili privremeno ne iscrtati dio panela.
- Aplikacija sada čita stvarnu količinu RAM-a i Androidov `lowRam` signal.
  Uređaji sa 4 GB RAM-a ili manje automatski koriste stabilni profil sa manjim
  bufferom, ograničenim dekodiranim kešom i manjim brojem paralelnih čitanja.
- Na jačim uređajima ostaje puni prikaz, ali su i tamo uklonjene ranije
  pretjerane vrijednosti keša.
- Android `onTrimMemory` i `onLowMemory` sada oslobađaju samo izvedene bitmap
  pločice i traže ponovno iscrtavanje. Projekti, izvorni offline fajlovi, GPS
  snimci i korisničke postavke se ne brišu.
- U stabilnom profilu uklonjeni su skupi blur, zoom animacija i rizično
  preskakanje sadržaja koje je moglo ostaviti dio panela praznim.

## Izvještaj odjela

- Potvrda nacrtanog ili izabranog poligona odmah pokreće obračun nagiba i
  ekspozicije; više nije potreban dodatni klik na „Izračunaj teren“.
- Ako nema interneta, geometrija ostaje sačuvana i obračun se automatski nastavlja
  nakon povratka veze. Prolazna greška ima ograničen automatski ponovni pokušaj.
- Granice razreda 10/20/30/40/50% sada su interpolirane konture koje prate
  teren i boju višeg razreda, umjesto pravougaonih linija.
- Stari pravougaoni keš rezultata se prepoznaje i ne vraća u novi prikaz.

## Potvrđena isporuka

- Source `c3d05cef36b4bd7cfd38cfd31f648f1e58a7be19`, tree
  `48434548521268bd8cdc6880c36673cdf2d21444`.
- [CI 38207913962](https://github.com/pogonboskrupa/US-SUME/actions/runs/38207913962),
  job `114675415169`: **SUCCESS** iz prvog pokušaja.
- Prošlo je svih 109 JavaScript testova, probni PostgreSQL/RLS paket, cijeli
  browser regresijski paket, Gradle build i Android 14 emulator.
- Poseban test slabijeg uređaja korišten je na 360×740 px, DPR 3, profilu 4 GB
  RAM-a i CPU usporenju 6×. Poslije simuliranog pritiska memorije karta, gornja
  i donja traka i aktivni panel ostali su vidljivi.
- Terenska simulacija obuhvatila je 3,0 km vlastitih i 2,4 km koleginih vlaka,
  online/offline režim i CPU 1×/4×. Dnevni audit je provjerio 144 prikaza.
- Javni APK: 24.427.031 B; SHA-256
  `ac8c133df19ad33ccc1e57c871ec6c21ca8051b242be04f78d5034e00a445940`.
- APK sadrži versionCode 559 / versionName 2.8.9-debug i nove module
  `render-health.js` i `department-report-worker.js`.
- In-app release API vraća v2.8.9 kao prvi rezultat, a GitHub Pages kopije četiri
  ključna izmijenjena resursa identične su izvoru.

## Granice provjere

Novi tokovi provjereni su automatizovano u browseru, testnim servisima i Android
emulatoru. Fizički Xiaomi 15 niti sporiji fizički telefon nisu bili dostupni,
a produkcijski Supabase nije mijenjan.
