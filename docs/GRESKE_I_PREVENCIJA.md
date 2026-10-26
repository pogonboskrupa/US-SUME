# Riješene greške i kako ih spriječiti — vodič za budući rad

Sažetak klasa grešaka koje su se u ovom projektu stvarno desile (detalji i
brojke su u `CLAUDE.md`, ovdje je operativna lista: **simptom → uzrok →
pravilo**). Pročitati prije svake veće izmjene.

---

## 1. Proces: CI, testovi, release

| Greška | Uzrok | Pravilo |
|---|---|---|
| CI pao 3× zaredom (#293–#295), releasei v3.1.2–v3.1.4 nikad objavljeni | Browser testovi (`preferences-266.py`, `menu-tools.py`) izvlače iz `index.html` samo **ručno nabrojane funkcije**. Funkcija je dobila novu zavisnost (`_kmlGrpClick`, `_bufSirinaOk`…), test je dobio tihi `ReferenceError` u `try/catch` | Nova zavisnost funkcije → `grep -rn "ime_funkcije" tests/browser/` i dopuni liste `names`. **Prije push-a pokreni SVE browser testove iz `codex-webview.yml`, ne samo nove** |
| Tvrdnja "release će se pojaviti" bez provjere | CI nije pogledan | Nakon push-a provjeri run (`mcp__github__actions_list` → `get_job_logs` sa `return_content:true`). Release nastaje samo uz zelen CI |
| Push bez bump-a verzije | CI bi pod istim tagom prepisao APK, telefon ne nudi update | Bump na **sva tri mjesta** (`index.html APP_VER`, `sw.js APP_VERSION`, `build.gradle` versionCode+1 i versionName). Push samo na izričito "ažuriraj app" |
| Java greške otkrivene tek u CI-ju | Sandbox nema Android SDK | `BuildConfig` ne postoji od AGP 8 bez `buildFeatures`; svaki `org.json` poziv u `try/catch` u ISTOJ metodi ili `throws JSONException`; `opt*` ne bacaju. CI je jedini kompajler |
| Test "prošao iz pogrešnog razloga" | Asercija o veličini umjesto o pokrivenosti; podaci degenerisani (kolinearne tačke, timestamp 1970.); async test u sinhronom runneru; dijeljeni globali među testovima | Dokaži da test **pada na starom kodu**; piši invarijante (monotonost, pokrivenost), ne konkretne vrijednosti; testove sa mutiranjem globala vrti striktno redom |

**Redoslijed prije svakog commita:** sintaks-provjera svih `<script>` blokova →
relevantni `node tests/js/*.test.js` → relevantni `tests/browser/*.py`
(`UI_CHROMIUM=/opt/pw-browsers/chromium-1194/chrome-linux/chrome`) → bump (samo
uz "ažuriraj") → commit sa **uzrokom** u poruci.

---

## 2. Offline-first i teren (najskuplje greške)

- **`navigator.onLine` laže `true` na mrtvoj vezi** → pozivi VISE umjesto da
  padnu. Svaki mrežni poziv: `_fetchT(url, ms)` / `_withTimeout`. Odluke o mreži
  idu kroz `_mrezaProbaj`/`_mrezaSila`, ne kroz `onLine`.
- **`AbortSignal.timeout` ne postoji na starom WebView-u (<103)** → rok tiho
  nestaje. Koristiti `AbortController` + `setTimeout` (kako radi `_fetchT`).
- **Pokretanje nikad ne čeka mrežu**: keširan profil → `showApp()` odmah.
  `_appEntered` se postavlja samo u `showApp()`. Provjera sesije:
  `sbUser && !sbUser._cachedStub`. Sigurnosna mreža se okida i na
  `window.onerror`/`unhandledrejection`.
- **Startup dira DOM koji još ne postoji** (`showApp()` zove se dok se markup
  parsira) → sav startup rad kroz `_startupRestore()` sa `try/catch` po koraku;
  funkcije pri startu čitaju element tek poslije `if (!el) return`.
- **Odjava ne smije zaključati offline prijavu**: provjera ide kroz
  `tvlake_offline_cred_v1` (SHA-256 sa solju), koji odjava NE briše.
- **Izmjereno stanje veze živi 10 min** — izričita prijava briše stare uzorke
  (`_netUzorci=[]`) prije pokušaja, inače lažno "nema interneta".
- **Tihi `catch {}` na upisima terenskih podataka** = gubitak bez poruke.
  Kritični upisi (trag, mjerenja, crash snimak, QR pojas) idu kroz
  `_localSetKriticno`, javljaju se **jednom po snimanju**, ne po tački.
- **localStorage kvota ~5 MB** (`navigator.storage.estimate()` je NE mjeri).
  Teške stvari u IndexedDB.
- **Supabase vraća `{error}`, ne baca** — svaki `const {data} = await sb…` čiji
  rezultat ide u keš mora provjeriti `error`, inače se keš prepiše praznim.

## 3. GPS snimanje

- Native bafer se prazni i na **hladnom startu** (`_crashCheck`), ne samo na
  `visibilitychange`.
- Prozori pauze: svaki **stop zatvara** (`_pauziZavrsi`), svaki **start
  resetuje** (`_pauziResetuj`) — otvoren interval gasi replay sljedeće sesije.
- Dijeljeni crash tajmer se gasi tek kad **ni vlaka ni trag** ne snimaju
  (`_crashStopIfIdle`, poziva se POSLIJE spuštanja vlastite zastavice).
- Povratak istim putem: odluka po **položaju prema snimljenoj liniji**, ne po
  uglu zaokreta. Jedan "lijep" scenario nije dokaz — petljaj kroz 40+ šumova.
- Ne dodavati `addLatLng` u petlji za niz tačaka (kvadratno) — gradi liniju odjednom.
- Vrući put (`_scheduleOvlRnd`, `updOvl`, GPS fiks): ništa što crta DOM koji
  niko ne gleda; memoizacija po potpisu.

## 4. Leaflet / karta

- **Canvas pane iznad drugog guta sve klikove.** Svaki canvas renderer je jedan
  `<canvas>` preko cijele karte; Leaflet ga **nikad sam ne uklanja**. Novi sloj
  u pane sa z-index > 400 → ili proximity fallback u `map.on('click')`
  (`_kmlHitTest`, `_msrHitTest`, `_guideHitTest`) ili `divIcon` umjesto
  `circleMarker`. Čišćenje: `_oslobodiPaneRenderer(ime)` + `delete
  map._paneRenderers[ime]`.
- Novi `*HitTest` u `map.on('click')` → stub u `tests/browser/server-map-218.py`.
- **Odgovor 200 OK nije slika** (WMS `ServiceException` XML) → provjeri
  `Content-Type` prije keširanja/`img.src` (`jeSlika`). Siva mreža preko karte
  = slomljene slike u gornjem lijevom uglu ćelije 256 px.
- **Blob URL se revoke-uje tek na `tileunload`**, nikad na `onload`.
- Veliki KML: **jedan listener na grupu** (`_kmlGrpClick`), lazy tooltip,
  `getElementsByTagName` umjesto `querySelector` po Placemarku. Nikad
  `bindTooltip`/`_bindKmlPopup` po tački.
- Novi `TL[key]`/`_OVL[key]` → `iconSvg` ×2, `map2id`/`map2row`, `_CMGR_ROWS`.
- Sandbox ne može provjeriti nijedan vanjski server; tile sloj mora gracefully
  pasti na praznu pločicu, a URL provjeriti Playwright `page.route()` mockom.

## 5. JavaScript zamke u ovom fajlu

- **Dvije funkcije istog imena** — zadnja tiho pobjeđuje (`_hexToRgb`). Test
  `boje-nagiba.test.js` čuva uniknost imena.
- **Pozicija u DOM-u ≠ indeks u nizu** — svaki red nosi `data-vi`/originalni
  indeks; sortirane/grupisane liste nikad ne vežu podatak za redni broj.
- **DOM polje nije baza** (`#p-povrsina`) — izvor istine je `_projekti`.
- **Regex unutar `_SQL_WORKER_SRC` template stringa** — udvostruči backslash
  (`\\s`), i **nikad backtick u komentaru** unutar tog stringa.
- **`const` nije hoistovan** (`TL` blok vs. keš konstante); `let` + pozivi prije
  deklaracije = TDZ → `var` ili `try/catch`.
- **Nezatvoren `<div>`** sakrije sve iza sebe, bez greške → `dom-struktura.test.js`
  poslije svakog brisanja markupa.
- **Globalno `.lbl {display:block}`** — ne imenovati nove klase `lbl`.
- **`Number(null) === 0`** — prazno je `NaN` (`_temNum`), ne najniža klasa.
- **`Math`/sort stringova**: brojčano sortiranje imena `T1, T1.1, T10` kroz
  `Intl.Collator('bs',{numeric:true})`.
- **Escape**: `_escHtml` ne escape-uje apostrof — korisnički tekst u `onclick`
  ide kroz `_jsAttr`. SVG u dugmadima samo sa dvostrukim navodnicima.
- **Sed zamjene nisu idempotentne** ("istorija"→"historija" → "hhistorija");
  grep poslije. Preimenovanje localStorage ključa **traži migraciju**.
- Playwright: `page.evaluate(() => map.setView(...))` bez `{}` vraća Leaflet
  objekat i daje zbunjujuću grešku "Execution context destroyed". `setContent`
  daje `about:blank` origin gdje `localStorage` baca — služi preko `http://127.0.0.1`.

## 6. Sync i server

- Slanje je **ručno** (Meni → Server). Novi upis zajedničkih podataka ide kroz
  `_serverURed` ili `_OL` red, nikad direktno. Na server idu samo vlake
  projekta, projekti i doznaka — tragovi, dnevnik, oznake i foto ostaju lokalno.
- Svaki upis mora biti **idempotentan** (klijentski UUID, 23505 = uspjeh) jer je
  izgubljen odgovor najčešći kvar slabe veze.
- Brisanje neposlanog uklanja i stavku iz reda (`_redUkloni`), inače "vaskrsne".
- RLS: nova tabela → RESTRICTIVE politika `zzz_odobren`; `SECURITY DEFINER`
  funkcija sama zove `je_odobren()`. U tuđi red `korisnici` se ne piše iz klijenta.
- Migracije se **ne pokreću automatski** — ručno u SQL Editoru, pa
  `NOTIFY pgrst, 'reload schema';`. Upiti na `korisnici` sa `select('*')`.

## 7. Android / WebView

- Nikad `setLayerType(LAYER_TYPE_HARDWARE)`, nikad `LOAD_CACHE_ELSE_NETWORK`.
- `adjustResize` ne radi uz edge-to-edge → padding `ime()` na `FrameLayout` omotaču.
- Autofill: PIN polja `type="text"` + `.pin-maska`, ne `type="password"`.
- `WebView.onPause()` se preskače dok traje snimanje.
- `.java`/`AndroidManifest.xml` izmjena = pun rebuild (copy-assets ne prenosi Javu).
- `android/app/src/main/assets/` nije git-tracked; fiksan debug keystore je
  obavezan za update preko postojeće instalacije.

## 8. Dijagnostički metod koji se isplatio

1. **Ne nagađaj peti put.** Kad se prijava ponovi poslije popravke: prvo
   provjeri da li je popravka stigla do korisnika (deploy run, SW keš, broj
   verzije u Meniju).
2. **Izoluj Playwright reprodukcijom** sa stvarnim Leafletom iz `static/libs` i
   mjeri **piksele/DOM stanje**, ne okom po screenshotu.
3. **Položaj i razmak simptoma** govore uzrok (slomljena ikonica u uglu ćelije
   256 px = ne-slika, ne spoj pločica).
4. **Ako ne možeš reprodukovati** (OPFS, pravi GPS), ugradi mjerenje koje samo
   kaže gdje je vrijeme (`⏱` red u statusu) — ali mjeri cijeli interval koji
   korisnik vidi, ne samo funkciju.
5. **Asercija o veličini ne zamjenjuje aserciju o pokrivenosti**; test koji
   prolazi mora i da pada na starom kodu.
6. **Promjena boje nije samo boja**: provjeri providnost i pozadinu.
7. Screenshot hvata ono što brojke ne (dvostruko brojanje, prazna kvačica).

## 9. Kontrolna lista prije "ažuriraj app"

- [ ] Sintaks-provjera `<script>` blokova
- [ ] Svi relevantni JS testovi + **svi** browser testovi iz workflowa
- [ ] Novi testovi padaju na starom kodu
- [ ] Zavisnosti izvučenih funkcija u `tests/browser/*.py` ažurirane
- [ ] Bump na sva tri mjesta (Z 0→9, pa Y+1; versionCode +1)
- [ ] Offline put provjeren (radi bez signala, preživi restart)
- [ ] Commit sa uzrokom; push na `claude/elegant-mayer-4lxj53`
- [ ] **Provjeri CI run do kraja** i da je Release `vX.Y.Z` objavljen
- [ ] Ako se dira `.java`/manifest ili migracija — reci korisniku da treba pun
      rebuild / ručno pokretanje SQL-a
