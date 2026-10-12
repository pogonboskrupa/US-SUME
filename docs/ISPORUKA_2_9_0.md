# Isporuka Dendro Map 2.9.0

Optimizacija pokretanja i snimanja na sporijim telefonima. Ažuriranje kroz
**Meni → Ažuriraj aplikaciju** čim CI objavi release `v2.9.0`.

Napomena o broju: 2.8.10 je trebao biti 2.9.0 po šemi iz CLAUDE.md (Z ide
0→9). Updater poredi segmente numerički, pa je 2.8.10 i dalje ispravno bio
noviji od 2.8.9; od ove verzije šema je ponovo poštovana.

## Mjerenje (Chromium 360×740, bez mreže, keširan profil, CPU usporen 4×)

| | prije | poslije |
|---|---:|---:|
| `load` (app spreman) | 3,7–4,0 s | 2,3–2,6 s |
| ukupno blokirano pri startu | 2,1–2,4 s | 1,55–1,66 s |
| snimanje traga, 10 s bez novih fiksova | 0,89–0,93 s posla | 0,64 s |

Ovo nije mjerenje fizičkog telefona; CPU 4× je zamjena za slabiji uređaj.

## 1. turf.min.js se ne učitava pri pokretanju

604 KB biblioteke je sinhrono u zaglavlju blokirao parser (~200 ms izvršavanja
+ čekanje parsera) pri SVAKOM startu, a treba tek za doznaku, izvještaj odjela,
uglačavanje i editor slojeva. Sad se učitava u pozadini kad pokretanje završi
(`requestIdleCallback`, rok 2,5 s). Do tada je `window.turf` Proxy: ako ga
sinhroni kod dotakne ranije, biblioteka se učita sinhrono iz lokalnog fajla baš
tada — isti trošak kao ranije, samo kasnije, i nijedan od ~40 poziva ne dobije
`undefined`. UMD omotač sam postavi `globalThis.turf` i zamijeni Proxy.
Workeri (`importScripts`) nisu dirani.

## 2. Ukrasni pulsevi u lite profilu

Indikatori snimanja/GPS-a su imali beskonačne animacije; `abPuls*`/`trnPuls`
animiraju `box-shadow` i iscrtavaju na glavnoj niti u svakom frame-u satima
tokom snimanja. U lite profilu (≤4 GB RAM, `lowRam`) stanje nosi boja, ne
pokret. Spinneri učitavanja ostaju.

## 3. GPS fiks — provjereno, bez izmjene

Pojedinačni fiks (`onP`) je ~6 ms (p95 ~15 ms pod 4×). Jedini dugi zastoj
(140–400 ms) je jednokratan pri startu snimanja: prvi sloj u pane-u
`tragMsrLines` pravi canvas veličine karte. Nije periodičan, pa nije mijenjan.
