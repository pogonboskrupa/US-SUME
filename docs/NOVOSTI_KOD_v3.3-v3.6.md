# Novosti u kodu — v3.3.x do v3.6.1 (2026-11)

Pregled izmjena koje mijenjaju KAKO kod radi (arhitektura, pravila, zamke).
Kozmetika i tekstovi su izostavljeni. Detalji su u commit porukama.

## 0. Prvo uraditi na serveru (ručno, Supabase SQL Editor)

Migracije se NE pokreću automatski. Redom:

| Migracija | Šta omogućava | Bez nje |
|---|---|---|
| `20261106_primljeni_podaci.sql` | slanje traga/poligona/KML-a kolegi iz iste šumarije (sandučić) | „Pošalji kolegi" javlja da server nema mogućnost |
| `20261107_primljeni_sifrom.sql` | slanje pod šifrom (bilo ko, 2 dana) | „Pošalji šifrom" ne radi |
| `20261108_sifra_vise_preuzimanja.sql` | istu šifru preuzima VIŠE korisnika do isteka | šifra ostaje jednokratna |

## 1. Pravila rada (promijenjena)

- **Release poslije svake izmjene** (od v3.5.9): ukinuto „samo na ažuriraj aplikaciju".
  I dalje: bump na sva tri mjesta (`APP_VER`, `sw.js APP_VERSION`, `build.gradle`
  versionCode +1 / versionName), push na `claude/inline-js-split`, pa tek kad
  `get_release_by_tag` pokaže APK prilog — javiti da je objavljeno.
- **Glavni JS je `static/js/app/glavni.js`**, ne `index.html`. Testovi čitaju izvor kroz
  `tests/js/_izvor.js` (Node) / `tests/browser/_izvor.py`. Browser testovi izvlače
  funkcije po imenu: kad funkcija dobije novu zavisnost, dodaj je u listu u fixture-u
  (najčešće `tests/browser/menu-tools.py`, `preferences-266.py`) — inače tiho
  `ReferenceError` unutar try/catch i test padne na nečem drugom.
- `static/js/layer-editor.js` NIJE dio `izvor()` — testovi ga čitaju zasebno.

## 2. Brzina na slabijim telefonima — šta je urađeno i zašto

Sve izmjereno kroz **Meni → Dijagnostika** (Long Animation Frames sa `fajl:pozicija`,
duge radnje po tabu, kašnjenje niti, vruće funkcije, IDB čitanja, koraci pokretanja).
Pozicija `glavni.js:NNNNNN` je **znakovni pomak**, ne red:
`node -e "s=require('fs').readFileSync('static/js/app/glavni.js','utf8');console.log(s.slice(0,N).split('\n').length)"`.
`Promise.resolve Xms @mjesto` znači: posao u NASTAVKU poslije `await` čiji je resolve na tom mjestu.

| Problem (izmjereno) | Rješenje | Gdje |
|---|---|---|
| Veliki tekst iz IndexedDB 340–400 ms (strukturno kloniranje stringa) | veliki zapisi se čuvaju kao **Blob**, čitaju `blob.text()`; stari se migriraju pri čitanju | `_kmlcSave/_kmlcGet`, `_KMLC_BLOB_MIN` |
| Oporavak traga: 56 000 poziva `_addTragPoint` zamrzava nit | rijetki fiksevi (`_nativeRijetko`) + predah | native replay |
| KML od 13 MB: hiljade poligona na karti | **culling grupa** `_kmlGrupa()` (od `_KML_CULL_MIN`=800 objekata): na kartu ide samo prikaz + rub **15 %**, u porcijama između frame-ova | `_KmlCullGroup` |
| KML sa 5578 TAČAKA = 5578 slojeva | **jedan canvas za sve tačke** `_kmlTackeKlasa()` (od `_KML_TACKE_MIN`=300 tačaka); projekcija jednom po zumu, 1 tačka/2 px ćelija, `pointer-events:none`; klik → `_kmlHitTest`, hover vlastiti; prati `zoom`/`zoomanim` (inače pomjeren pri pinch odzumiranju) | `_kmlTackeKlasa` |
| Parsiranje KML-a odjednom (split 13 MB, porcije od 20 velikih poligona → 165 ms) | `_kmlGrupaIzSadrzaja`: Placemark-ovi redom (`indexOf`), porcija ≤ 20 objekata **i** ≤ 48 KB, predah poslije 8 ms; **već od 100 KB** | rezultat identičan parsiranju odjednom (provjereno) |
| `applyKmlStyle` O(n²) (broj slojeva grupe računat po poligonu) | izračun jednom po sloju | `applyKmlStyle` |
| Prozirna ispuna hiljada poligona | veliki sloj bez prozirne ispune (klik i dalje kroz `_kmlHitTest`) | `applyKmlStyle` `_velik` |
| Primljeni podaci: svakih 20 s preuzet i parsiran cijeli sadržaj (212 ms) | prvo samo zaglavlja; sadržaj samo za nove stavke | `_primljeniSync` |
| Lista Granica crtana 8× pri startu (prozor zatvoren) | `rndGraniceModal` samo označi `_prljav`, crta pri `_openLayerSheet` | |
| Pokretanje: jedan blok 1,2 s (mikrozadaci async koraka u istom zadatku) | kritični koraci `_startupRestore` **svaki u svom zadatku** (`setTimeout 0`), isti redoslijed; Dijagnostika bilježi i `ukupno` po koraku. `_startupRestore._done` = kritični koraci GOTOVI (testovi čekaju na to); `_pokrenut` = zaštita od dvostrukog poziva | `_startupRestore` |
| DEM pločice odjednom | red pločica `_demPredah`, trigonometrija po redu | DEM slojevi |
| Glavna nit stalno kasni | automatski lagani prikaz (lagP95 > 180 ms) | render-health |
| KML LINIJE: uz svaku nevidljiva linija 20 px za klik (2× slojeva + široki potezi) | **uklonjeno** — klik hvata `_kmlHitTest` (TOL_LINE 20 px) | `_bindKmlPopup` |

Dijagnostika od v3.6.0 prikazuje i **„Slojevi po vrsti"** (`o.slojeviPo`: vrsta · pane → broj)
— da se odmah vidi ko pravi višak slojeva.

**Pravilo za novi kod:** ništa što može imati stotine/hiljade elemenata ne ide kao
jedan Leaflet sloj po elementu bez culling-a ili zajedničkog canvasa. Klik na sitne
objekte rješava `map.on('click')` fallback (`_kmlHitTest`, vlake po udaljenosti), ne
nevidljivi „hit" sloj po objektu.

## 3. KML/SHP — prikaz i stil

- **Popup objekta** (`_layerPopupHtml`, `layer-editor.js`): zaglavlje u boji sloja, pločice
  mjera (`_layerMjere`: površina+obim / dužina / koordinate), opis, atributi, akcije
  Približi · Naziv i opis · Stil fajla · **Sakrij** (cijeli fajl, `_kmlPopSakrij` → `togK`).
- **Podprikaz**: Stil fajla / Naziv i opis zamjenjuju osnovne podatke (`_kmlPopMod`,
  klase `le-mod-edit`/`le-mod-style`), dugme Nazad. ID-jevi `uid-nm`, `uid-edit`,
  `uid-name-in`, `uid-desc-in`, `uid-style` su nepromijenjeni.
- **Stil prema sadržaju** (`_kmlGrpVrste`): samo tačke → boja, veličina (`ptR` 2–14 px),
  vidljivost; poligoni → linija + ispuna; mješovito → oboje. `ptR` se čuva u lokalnom
  storeu, `saveKmlStyles` i server slojevima. Pregled geometrije uklonjen.
- Bijela tačka centra (`#map-center-dot`) z-index 450 (ispod panela), skrivena dok je
  popup otvoren (`body.popup-otvoren`, osim tokom crtanja).

## 4. Dijeljenje podataka (Primljeni podaci)

- Sandučić `primljeni_podaci` (ista šumarija, briše se kad primalac sačuva lokalno).
- Šifra (8 znakova, 2 dana): od v3.5.7 **više korisnika** (migracija 20261108).
  Klijent više ne zove `potvrdi_preuzimanje_sifrom`; isti korisnik istu šifru ne preuzima
  dvaput (lokalni id `sifra_<ŠIFRA>_…`).
- „Na karti" više ne pravi kopiju sloja pri svakom kliku: stavka pamti `lokalno` (ime
  uvezenog sloja) i drugi klik ga samo prikaže.

## 5. Ostalo

- **Meni → Ažuriraj aplikaciju**: zlatna kartica (`#menu-azuriraj`, pravila u
  `navigation-design.css` — tamo `!important` boja svih stavki; slabije pravilo nema efekta).
  Nova verzija → `_menuAzurOznaci` (oznaka NOVO, tačka na dugmetu Meni).
- Prebacivanje računa admin ↔ Nedim Ćehić jednom tipkom; Dijagnostika za Azru Ćehić.
- Trag: slike (KMZ), GPS stabilizacija u pozadini.
- Doznaka: ekipa u odjelu, Dodaj projektanta na vrhu.
- Offline karta: pločica koje nema u fajlu → uvećan roditeljski sloj umjesto sive rupe.
- CI: runner `ubuntu-24.04` (Playwright ne podržava 26.04); job limit 45 min.

## 6. Testovi dodani u ovom periodu

`kml-tacke-canvas.py` (5578 tačaka = 1 canvas, hover/klik/zum/stil), `kml-stil-po-vrsti.test.js`,
`primljeni-podaci.test.js` (šifra za više korisnika, bez duplih kopija), `startup-restore.test.js`
(koraci u zasebnim zadacima), `day-all-panels-275.py` (+ meni sa oznakom NOVO),
`perf-dijagnostika`, `sqlmap-roditelj`, `doznaka-ekipa`, `racuni-dijagnostika`.
Lokalno: `UI_CHROMIUM=/opt/pw-browsers/chromium-1243/chrome-linux64/chrome`; `kml-50000.py`
lokalno pada samo na vremenu (spor sandbox), na CI-ju prolazi.
