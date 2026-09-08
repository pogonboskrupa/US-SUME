# US-SUME — upute za rad na ovom repozitoriju

## Krajnji cilj: APK, ne webapp

**Konačna, isporučena verzija aplikacije mora biti APK fajl** (Android WebView
app u `android/`), ne samo GitHub Pages webapp. Webapp (`index.html` uživo na
Pages) je koristan za brz razvoj/test, ali korisnik u polju (šumar na terenu)
stvarno koristi **APK instaliran na telefonu** — često bez signala. Svaka
izmjena se smatra završenom tek kad:

1. Radi u APK-u (ne samo u browseru/webapp-u).
2. Radi **offline** — GPS snimanje vlaka/traga/doznake, lokalni queue i sync
   čim se pojavi internet, sve mora preživjeti potpuni gubitak signala.
3. Ne kvari ništa što je već izgrađeno (vidi listu mogućnosti ispod).

## Verzija — TRI mjesta, uvijek zajedno

Svaka izmjena koda mora sinhrono podići verziju na sva tri mjesta, inače APK
i webapp prikazuju različite verzije i teško je znati šta je stvarno na
uređaju:

- `index.html` → `const APP_VER = 'vX.Y.Z';` (~linija 4390-ish, traži `grep -n "const APP_VER"`)
- `sw.js` → `const APP_VERSION = 'X.Y.Z';` (bez `v` prefiksa)
- `android/app/build.gradle` → `versionCode` (+1 svaki put, cijeli broj) i `versionName "X.Y.Z"`

## APK build — assets se NE povlače sami

`android/app/src/main/assets/` **nije git-tracked** i mora se ručno
regenerisati prije svakog builda — inače APK sadrži staru (keširanu) verziju
web koda čak i kad `versionName` u `build.gradle` kaže da je nova.

- **PowerShell (Windows)**: `powershell -ExecutionPolicy Bypass -File android\build-apk.ps1`
  (pull + copy-assets + gradle build u jednom potezu; provjeri `-Branch` default
  u skripti prije pokretanja ako grana nije `claude/branch-072026-sa9wz0`).
- Ili ručno: `android/copy-assets.ps1` / `.sh` pa build kroz Android Studio.
- Kad se mijenja `AndroidManifest.xml` ili bilo koji `.java` fajl (nova
  dozvola, native most i sl.) — **treba pun rebuild u Android Studiju**, samo
  copy-assets nije dovoljan (Java se ne kopira, kompajlira se).

## Mogućnosti izgrađene do sada (ne smiju se pokvariti)

- **Offline-first sync**: `_OL` red čekanja (`static/js/offline-layer.js`) —
  sve upisi (vlake, tragovi, doznaka, projekti) rade lokalno prvo, pa se šalju
  na Supabase čim ima interneta. Idempotentno (klijentski UUID-ovi), sa
  retry/backoff i dedup.
- **GPS snimanje** (vlaka, trag, doznaka pojas) — radi bez signala, crash-
  recovery auto-save na 30s, wake lock, foreground service.
- **Tim/kolege**: vlake i doznaka projekti se dijele preko RLS-a i realtime
  kanala; dodatno postoji **share-code** sistem (šifra tipa RK70ABGH) za
  terenski profil bez članstva u projektu — radi i offline (redeem preko RPC-a
  kad se pojavi internet).
- **QR dijeljenje pojaseva** (doznaka) — potpuno offline, peer-to-peer preko
  kamere, bez servera uopšte (ni pošiljalac ni primalac ne trebaju internet).
- **Print/štampanje**: razmjera, format papira, legenda, sjever, mjerilo.
- **Doznaka — analiza stabala**: KML sa tačkama doznačenih stabala se učitava
  po odjelu (keš u localStorage `tvlake_doz_trees_data`), boji se po dosegu
  vitla (buffer vlaka) i automatski re-analizira kad se vlaka snimi/nacrta/
  uveze. Buffer radijus je JEDAN zajednički (`_syncBufRadiusEverywhere`) za
  Vlake alat + Doznaka buffer + analizu stabala — ne dodavati nove nezavisne
  buffer kontrole.
- **Doznaka — uvoz vlaka iz KML-a**: `dozVlakeLoadKml` pravi PUNE vlake (isti
  oblik objekta kao crtanje/snimanje — vidi `_routeToVlaka` obrazac), ne
  poseban "uvozni" tip. Svaki novi način kreiranja vlake mora pratiti isti
  obrazac polja (`nm/br/kr/color/pts/poly/sbId/projektId/...`).
- **Migracije**: `supabase/migrations/*.sql` postoje ali se **ne pokreću
  automatski** — svaku novu migraciju treba ručno pokrenuti u Supabase SQL
  Editoru (nema CI/migration runnera u ovom projektu). Nakon `ALTER TABLE`
  PostgREST keš šeme zna kasniti (`PGRST204 "could not find column"`) — riješi
  se sa `NOTIFY pgrst, 'reload schema';` ili Settings → API → Reload schema.
- **Nagib vlaka (preklopnik na karti)**: checkbox u 🗄 Slojevi karte → Dodatni
  slojevi, funkcija `_vlNagibToggle`. Boji SVE trenutno vidljive vlake bojom po
  strmini (`_gradeColor`/`_updateSteepOverlay`, ista skala kao admin "Analiza
  nagiba"). NAMJERNO je snapshot na klik, ne prati GPS uživo — ne kačiti ga u
  `rndList()` ni GPS hot-path (`_vlakaProcessGpsPoint`), usporilo bi snimanje.
  Dijeli `v._steepPolys` sa admin analizom (`_pmNagibAnaliza`/`_nagibAnalysisStop`
  u modalu nadzora) — zadnji poziv pobjeđuje, bezopasno u rijetkom preklopu.
- **Panel Požari (v3.103.1, iz Menija od v3.103.2)**: detekcija sa satelita (NASA FIRMS), prijava požara
  sa terena, opožarene površine i indeks opasnosti (Copernicus EFFIS), hitni
  brojevi. Detekcije se povlače kao **PODACI (CSV), ne kao rasterski sloj** —
  prva verzija je bila WMS slika i ostala je PRAZNA kod korisnika, a iz prazne
  karte se ne vidi da li nema požara (najčešći i ISPRAVAN ishod), je li pao
  endpoint ili nema CORS-a. Podaci daju jednoznačan odgovor ("0 detekcija u
  krugu 150 km"), udaljenost/azimut od korisnika, popup sa vremenom i FRP-om,
  rade na svakom zumu i keširaju se za offline. `_poziLoad`/`_poziParseCsv`.
  **"Provjeri izvore" (`_poziProvjeriIzvore`) je alat za teren** — testira
  svaki izvor i ispiše HTTP status/CORS grešku, jer se iz razvojnog okruženja
  nijedan vanjski server ne može dozvati. Prijava požara je obična tačka
  (`_createTacka`) — namjerno, jer tačke već imaju offline rad, sync i
  dijeljenje. Test: `tests/js/pozari.test.js`.
- **Požari — "najbolji mogući podaci" (v3.104.0)**: korisnik je sa STVARNOG
  telefona (pravi internet, ne sandbox) prijavio da su sva 4 FIRMS arhivska
  CSV izvora "blokiran (CORS/mreža)". Istraženo (WebSearch, jer sandbox ne
  može dozvati `firms.modaps.eosdis.nasa.gov` ni za dokumentaciju): NASA-in
  arhivski CSV server (`/data/active_fire/.../csv/...`) je napravljen za
  wget/curl direktan preuzimanje, ne za browser `fetch()` — vrlo vjerovatno
  NE šalje `Access-Control-Allow-Origin` zaglavlje, pa ga ISPRAVNO
  konfigurisan browser odbija bez obzira na mrežu. **`fetch()` namjerno NE
  razlikuje CORS blok od mrtve mreže** (obje bacaju istu generičku
  `TypeError` — sigurnosno pravilo browsera), pa se to ne može pouzdano
  utvrditi iz JS-a; poruke u `_poziDohvati`/`_poziProvjeriIzvore` to sada
  eksplicitno objašnjavaju umjesto da pogađaju jedno od dvoje.
  Promjene:
  - **Svi izvori paralelno i SPOJENI** (`Promise.all`, bilo je redom-dok-
    jedan-ne-uspije) — VIIRS S-NPP/NOAA-20/NOAA-21 i MODIS imaju RAZLIČITE
    prelete, uzimanje samo prvog znači svjesno odbacivanje detekcija koje su
    OSTALI vidjeli. I brže javlja grešku (~15s umjesto do 60s).
  - **Grupisanje u požare** (`_poziGrupisi`, prag `_POZ_GRUPA_M`=1500m): isti
    požar vide RAZLIČITI sateliti/preleti — bez grupisanja "12 aktivnih
    detekcija" zvuči kao 12 požara umjesto 1 praćenog. Lista/sažetak/toast
    sad broje POŽARE (`_poziBrojRijecPozar`, muški rod — zaseban od
    `_poziBrojRijec` jer sklonidba mijenja i pridjev, ne samo imenicu).
  - **Vremenski okvir 24h/48h/7d** (`_poziOkvir`/`_POZ_OKVIRI`) — FIRMS iste
    izvore objavljuje u tri prozora, korisnik bira.
  - **"Novo od zadnje provjere"** (`_poziOznaciNove`, `localStorage
    tvlake_pozari_vidjeno`) — ključ požara (zaokružene koordinate) se pamti
    između učitavanja; forester na terenu odmah vidi ŠTA je novo bez da
    upoređuje ručno.
  - **Opcioni FIRMS MAP_KEY** (`_poziMapKey`/`_poziApiUrl`, `localStorage
    tvlake_pozari_mapkey`) — korisnik se SAM besplatno registruje na
    `firms.modaps.eosdis.nasa.gov/api/map_key/` (samo email, aplikacija taj
    email nikad ne vidi ni ne šalje) i zalijepi ključ u panelu. Dodaje Area
    API kao PETI, bbox-scoped izvor na DRUGAČIJOJ ruti servera (`/api/` vs
    `/data/`) — moguće da ima drugačiju CORS politiku od arhive.
  - **Vjetar kod najbližeg požara** (`_poziVrijeme`/`_poziOsvjeziMeteo`,
    Open-Meteo — ISTI API/pattern već dokazano CORS-prijateljski u ovoj app
    za N.V./elevaciju) + `_poziVjetarPrijeti` upozorenje kad vjetar duva OD
    požara KA korisniku (meteorološka konvencija: `wind_direction` je smjer
    ODAKLE vjetar duva, vatra ide u suprotnom). **Namjerno se NE kešira za
    offline** — prikazati JUČERAŠNJI smjer vjetra kao trenutan bi bilo opasno
    pogrešno usred stvarnog požara; bez mreže kartica se jednostavno ne
    prikaže.
  - **Namjerno NIJE dodato**: procjena izgorjele površine u hektarima iz broja
    detekcija — VIIRS/MODIS piksel je "vreo piksel", ne stvarna granica
    požara, i app već ima ISPRAVAN, precizniji alat za to (EFFIS opožarene
    površine, `_OVL.opozareno`). Umjesto toga grupa nosi `spanM` (najveća
    udaljenost između dvije detekcije u grupi) — geometrijska činjenica iz
    GPS koordinata, ne izmišljen broj.
- **Paralelno NIJE uvijek brže — na izgladnjeloj vezi je gore** (v3.104.1):
  drugi terenski test (sa MAP_KEY-em, VPN-om i vezom od ~1.4 KB/s, okvir "7
  dana") dao je 1× "blokiran" + 4× `signal timed out`. To je bio dokaz da
  v3.104.0 paralelizacija ima naličje: arhivski FIRMS CSV-ovi su izvozi za
  CIJELU Evropu (7-dnevni ide u megabajte), pa četiri istovremena preuzimanja
  dijele istu mrvicu propusnosti i **nijedno** ne stigne prije isteka —
  redom bi barem jedno prošlo. Zato sada:
  - Kad MAP_KEY POSTOJI, dohvaća se **samo** bbox Area API (krug oko
    korisnika, djelić veličine), a arhive se preskaču; ako ključ padne,
    arhive ostaju kao rezerva (`_poziDohvati` → `_poziDohvatiArhive`).
    Provjereno u browseru: bez ključa 4 arhive/0 API, sa ključem 0 arhiva/1
    API, sa neispravnim ključem 1 API + 4 arhive (rezerva radi).
  - Timeout za arhive podignut na 30s (veliki fajlovi), API ostaje 20s.
  - **Tip kvara se sada razlikuje i prevodi** (`_poziGreskaTxt`): `TypeError`
    → "odbijeno odmah (CORS ili nema mreže)", `TimeoutError`/`AbortError` →
    "nema odgovora na vrijeme (veza visi)". To su različiti problemi sa
    različitim rješenjima, a ranije je kroz UI curila sirova engleska poruka
    `signal timed out` iz `AbortSignal.timeout()`.
  - `_poziSavjet` bira savjet prema tipu kvara (sve isteklo → skrati okvir na
    24h, isključi VPN, unesi MAP_KEY; sve odbijeno → CORS/nema mreže objašnjenje),
    umjesto da uvijek ispisuje isti tekst o CORS-u.
- **Native HTTP most `AndroidNet` — CORS se NE može zaobići iz JS-a** (v3.105.0):
  treći terenski test je bio presudan — dobra veza (215 KB/s), najmanji okvir
  (24h), unesen MAP_KEY, i **svih pet izvora "odbijeno odmah"**, uključujući
  `/api/` rutu. Time je potvrđeno: FIRMS ne šalje CORS zaglavlja ni za arhivu
  ni za Area API, a CORS je pravilo BROWSERA koje JavaScript ne može zaobići
  nikakvim trikom (proxy servisi su tuđi serveri — nepouzdani i nisu rješenje
  za alat na koji se oslanja neko na terenu).
  - **U APK-u rješenje postoji**: native Java HTTP poziv nema CORS. Dodan je
    `MainActivity.NetBridge` (`webView.addJavascriptInterface(..., "AndroidNet")`,
    isti obrazac kao `AndroidGps`/`AndroidShare`). JS strana:
    `_nativeNetDostupan`/`_nativeNetFetch`/`_nativeNetOdgovor`, a
    `_poziDohvatiJedan` prvo proba most pa tek onda `fetch()`.
  - **Most NIJE opšti proxy** — samo `https` i samo `*.modaps.eosdis.nasa.gov`.
    Bez tog ograničenja bi bilo koji JS na stranici (uključujući nešto ubačeno
    kroz uvezeni KML/GeoJSON) mogao preko native sloja dohvatiti bilo šta,
    zaobilazeći sve zaštite koje browser inače nameće. Novi izvor koji treba
    most = novi unos u `dozvoljenHost`, svjesno i namjerno.
  - Tijelo se prenosi kao **Base64** (`Base64.NO_WRAP` → `atob` + `TextDecoder`)
    jer bi CSV sa navodnicima/prelomima reda/dijakritikom razbio ubacivanje u
    JS; svaki string koji ide u `evaluateJavascript` se escape-uje (`jsStr`).
  - **U web verziji (GitHub Pages) blokada OSTAJE** — tamo `AndroidNet` ne
    postoji pa se koristi stari `fetch()` put. `_poziSavjet` to sad i kaže
    otvoreno umjesto da nudi MAP_KEY kao rješenje (terenski test je dokazao
    da ključ ne pomaže protiv CORS-a). "Provjeri izvore" u prvom redu ispiše
    **način pristupa** (native vs browser) — bez toga se ne može znati koji
    je put uopšte testiran.
  - **Traži pun rebuild u Android Studiju** (mijenjan je `.java`) — sam
    `copy-assets` NE prenosi Javu, vidi pravilo o APK buildu gore.
  - Test: `tests/js/pozari.test.js` (JS polovina mosta — Base64/UTF-8,
    odbijanje, istek kad native strana zanijemi). Java se iz sandboxa ne može
    kompajlirati (nema Android SDK-a), pa je provjerena strukturno.
- **Global Forest Watch kao DRUGI SERVER za iste detekcije (v3.106.0)**: GFW
  preuzima NASA VIIRS podatke i servira ih sa `data-api.globalforestwatch.org`,
  koji ima SVOJU CORS politiku. Pošto je GFW-ova vlastita karta browser-app
  koja zove baš taj API, postoji realna šansa da prolazi tamo gdje NASA-in ne
  prolazi — i to je JEDINI razlog dodavanja (nije "više podataka", nego DRUGI
  PUT do istih). `_poziGfwUrl`/`_poziParseGfwJson`/`_poziGfwKljuc`.
  - Traži besplatan ključ sa GFW naloga, šalje se kao **`x-api-key` zaglavlje**.
    Vlastito zaglavlje u browseru okida **CORS preflight (OPTIONS)** — ako ga
    GFW ne odobri, pada i prije upita. U APK-u ne smeta (native most nema CORS),
    pa `_poziDohvatiJedan` sad prima `opts.headers` i prosljeđuje ih i native
    mostu (`NetBridge.fetchText` četvrti parametar, JSON sa zaglavljima) i
    `fetch()`-u. `data-api.globalforestwatch.org` je dodan u `dozvoljenHost`.
  - Parser je **pluggable** (`opts.parser`/`opts.provjera`) jer FIRMS vraća CSV
    a GFW JSON; sve ostalo (native/fetch put, mjerenje, prevod greške) je isto
    pa se ne duplira. GFW tačka se svede na ISTI oblik kao FIRMS (`la/lo/dt/
    sat/conf/frp/noc/rez`) da grupisanje/keš/prikaz ne moraju znati porijeklo.
  - **FRP je `NaN`, ne 0** — GFW u ovom pogledu ne vraća snagu požara, a 0 bi
    značilo "izmjereno nula", što nije isto kao "nije izmjereno".
  - **NAMJERNO NISU dodati GFW alarmi za sječu (GLAD-L/GLAD-S2/RADD)**, koliko
    god zvučali kao savršena stvar za šumariju: GLAD-L pokriva samo pojas
    30°N–30°S, GLAD-S2 samo Amazon, RADD samo vlažne trope. **Bosna je na
    ~44.9°N — daleko van svih.** Dodati ih značilo bi trajno prazan sloj iz
    kojeg se ne vidi je li mirno ili je pao izvor — tačno ona greška zbog koje
    je rasterski sloj iz v3.103.0 i bačen. Jedini GFW alarm sa GLOBALNOM
    pokrivenošću je **DIST-ALERT** (sve vegetacijske smetnje, ne samo šuma) —
    on bi pokrivao BiH i vrijedan je kandidat, ali je zaseban proizvod (nije
    "požar") pa nije nabacan uz ovu izmjenu.
  - Sažetak sad IMENUJE izvor kad je samo jedan ("Global Forest Watch") umjesto
    da broji ("1 izvor") — sa terena je važnije znati KOJI je server prošao.
    Sklonidba: `_poziBrojRijecIzvora` (1 izvor / 2+ izvora).
- **Udaljenost do požara i klik-navigacija (v3.106.1)**: dva stvarna bug-a sa
  ekipe koja testira na terenu.
  - **Udaljenost je tiho padala na centar karte** kad GPS nema fix
    (`_poziRefTacka` fallback) — za alat o BEZBJEDNOSTI to nije samo manje
    precizno, nego aktivno POGREŠNO: korisnik je mogao ranije pomjeriti/
    zumirati kartu bilo gdje (drugi odjel, drugi kraj karte), pa bi "5 km"
    prikazano na osnovu centra karte moglo biti kilometrima pogrešno u odnosu
    na stvarnu udaljenost. `_poziToggle(true)` sad, ako `lastP` (GPS fix) još
    ne postoji, pokreće GPS (`startGPS()`, ISTI watch koji koristi 📍 dugme na
    karti — `fabLokacija`) i tiho ponovo učita čim stigne prvi fix
    (`_poziCekajGps`, poll na 500ms / odustani nakon 15s, isti obrazac kao
    `fabLokacija`). Dok se čeka, `_poziMeta.refGps` je `false` i `_poziSazetak`
    to NAPADNO ispisuje ("⚠ od centra karte, ne tvoje pozicije") umjesto tihe
    fusnote — ranije je to pisalo SAMO u popup-u pojedinačnog markera, ne i u
    statusnoj liniji/listi/toast-u gdje ga korisnik prvo vidi.
  - **Klik na požar u listi nije vidljivo navigirao nigdje** — `_poziZoom`
    je pomjerao `map.setView(...)`, ali #pozari-panel je OTVOREN PREKO CIJELE
    KARTE (isti obrazac kao Doznaka/Vlake), pa je karta iza njega SAKRIVENA.
    Korisnik klikne, ništa se vidljivo ne desi, i mora ručno otići na Kartu da
    provjeri je li se uopšte nešto pomjerilo. Sad `_poziZoom` prvo zove
    `switchTab('karta')` (isti obrazac kao `_poziPrijavi`), pa TEK POSLIJE
    (unutar `setTimeout` — `switchTab('karta')` sam zove `map.invalidateSize()`
    poslije 50ms jer je karta bila `display:none` i Leaflet ne zna svoju pravu
    veličinu) pomjera pogled i otvara popup markera.
  - Provjereno u browseru (Playwright): klik na požar mijenja aktivni tab na
    "Karta" i centrira TAČNO na koordinate požara; GPS mock koji "uhvati"
    fix poslije 1.5s pokazuje upozorenje prije toga i ispravnu udaljenost
    (5.16 km, ne udaljenost od stare pozicije karte) poslije. 3 nova testa u
    `tests/js/pozari.test.js` (52 ukupno) za `_poziSazetak` upozorenje.
- **Podtab Sječa/vjetroizvale, markeri grupisanja, upozorenja (v3.107.0)**:
  - **Podtabovi u panelu** (`_poziPodtab`/`_poziPostaviPodtab`, `localStorage
    tvlake_pozari_podtab`): "🔥 Požari" i "🪵 Sječa / vjetroizvale". Sječa je
    ZASEBAN satelitski proizvod (smetnja vegetacije), ne požar — ali dijeli
    kontekst "šta se dešava u mojoj šumi", pa dijeli panel umjesto da traži
    svoj tab u traci (koja je puna). `_poziRenderPanel` sad samo crta traku
    podtabova i delegira na `_poziSadrzajHtml`/`_sjeSadrzajHtml`.
  - **Sječa koristi `gfw_integrated_alerts`, NE `umd_glad_dist_alerts`
    zasebno** — integrisani sloj objedinjuje GLAD-L, GLAD-S2, RADD i
    **DIST-ALERT**, a DIST-ALERT je JEDINI od njih sa globalnom pokrivenošću
    (ostali su tropi; BiH je na ~44.9°N). Imena polja su mu dosljedna
    (`gfw_integrated_alerts__date`/`__confidence`), dok dokumentacija za
    zaseban DIST-ALERT dataset miješa `umd_glad_landsat_alerts__*` polja.
    Traži isti GFW ključ kao požari. `_sjeUrl`/`_sjeParse`/`_sjeLoad`.
  - **Parametri grupisanja se RAZLIKUJU po proizvodu**: VIIRS piksel je 375 m
    (prag 1500 m), DIST-ALERT je 30 m (prag `_SJE_GRUPA_M`=300 m). Zato su
    `_poziGrupisi(pts, pragM)` i `_poziOznaciNove(grupe, kljuc, preciznost)`
    parametrizovani. **`_poziEvtKljuc` preciznost je bitna**: podrazumijevanih
    100 (~1.1 km) bi za sječu spojilo dvije sječine na 400 m u isti ključ i
    druga nikad ne bi bila "nova" — zato sječa koristi 1000 (~110 m).
  - **Površina se procjenjuje SAMO za sječu, ne za požare**: DIST-ALERT piksel
    od 30 m označava stvarno izmijenjenu vegetaciju pa `broj × 900 m²` ima
    smisla kao "≈ X ha"; VIIRS piksel je "vreo piksel", ne izgorjela površina,
    i tamo takva računica ostaje NAMJERNO izostavljena (v3.104.0).
  - **Markeri grupisanja na karti**: lista je odavno pokazivala "1 požar, 6
    detekcija", ali karta je i dalje crtala 6 pinova jedan preko drugog. Sad
    grupa ima JEDAN marker sa brojem (`.poz-mk-grupa`), a pojedinačni pikseli
    ostaju kao sitne tačke (`.poz-mk-mala`) — broj kaže koliko puta je viđen,
    tačke pokazuju stvarni doseg (piksel je podatak, ne smije se sakriti).
    Sječa ima kvadratne markere (`.sje-mk*`) da se razlikuje od požara i kad
    su boje slične. `_poziZoom`/`_sjeZoom` sad koriste `g._mk` (referenca
    zakačena pri crtanju) umjesto traženja po indeksu u nizu.
  - **Upozorenje na nov požar** (`_poziNotifToggle`, prag 10/25/50 km,
    provjera na 15 min, `show-pozar-notification` u `sw.js`). **Dometu se ne
    laže**: radi dok je aplikacija pokrenuta (i u pozadini dok je Android ne
    ugasi), NE kad je potpuno zatvorena — CLAUDE.md već dokumentuje da OEM
    battery manager ubija cijeli proces, pa bi obećanje "javićemo ti i ugašeno"
    bilo lažno. UI to kaže otvoreno. `_POZ_NOTIF_SEEN` pamti za šta je već
    javljeno da isti požar ne zvoni pri svakom osvježavanju.
  - Provjereno u browseru: 16 detekcija → 2 požara, marker sa "12", 16 sitnih
    tačaka; sječa 3 alarma → 2 grupe; notifikacija poslana ka SW-u sa tačnim
    naslovom/tijelom; klik na alarm prebacuje na Kartu i centrira. 61 test.
  - **Zamka pri Playwright testiranju**: `p.evaluate(() => map.setView(...))`
    BEZ vitičastih zagrada vraća Leafletov map objekat, koji Playwright
    pokušava serijalizovati (cikličan, sa DOM čvorovima) i pukne uz poruku
    "Execution context was destroyed, most likely because of a navigation" —
    koja navodi na pogrešan trag (nema nikakve navigacije). Uvijek pisati
    `() => { map.setView(...); }`. Usput: app NAMJERNO reloada stranicu kad
    SW preuzme kontrolu (v3.111.4: vremenski prag 5s po tabu, ne "najviše
    jednom ikad" — vidi zamku "Više verzija zaredom u istoj kartici" ispod),
    pa test treba sačekati `sessionStorage.getItem('sw-reloaded-at')` da
    postoji prije mjerenja.
- **Trake udaljenosti u listi požara (v3.108.0)**: lista se RAŠČLANJUJE na tri
  trake (`_POZ_TRAKE` — do 20 km / 20–40 km / preko 40 km), ne filtrira —
  požar na 90 km je i dalje u krugu od 150 km i ostaje vidljiv, samo pod
  zaglavljem "Preko 40 km" da ne konkuriše vizuelno onome na 5 km. `_poziEvts`
  je već sortiran po udaljenosti pa se svaka traka izdvaja jednim filter-om;
  `onclick="_poziZoom(i)"` MORA nositi ORIGINALNI indeks iz `_poziEvts` (ne
  poziciju unutar trake) — ista klasa greške kao dokumentovano "Pozicija u
  DOM-u NIJE indeks u nizu" gore, ovdje pokrivena testom koji namjerno miješa
  redoslijed traka da uhvati baš tu zamku. Svaka traka prikazuje do
  `_POZ_PO_TRACI`=6 požara pa "…i još N", a brojka u zaglavlju ("Preko 40 km
  (12)") uvijek broji SVE u toj traci, ne samo prikazane.
- **Sort/filter liste požara + suženje radijusa na 100 km (v3.110.0)**: na
  eksplicitan zahtjev dodan je `_POZ_SORTOVI` izbor iznad liste — "Bliže prvo"
  (zadano), "Dalje prvo", "Novije prvo" (`_poziSort`/`_poziPostaviSort`,
  `localStorage tvlake_pozari_sort`). **Trake udaljenosti (v3.108.0) imaju
  smisla SAMO za "bliže prvo"** — taj sort ih zadržava nepromijenjene jer je
  `_poziEvts` već rastuće sortiran po udaljenosti; ostala dva načina namjerno
  prikazuju RAVNU listu bez traka (kapa `_POZ_LISTA_MAX`=18, "…i još N") jer bi
  sortiranje po vremenu miješalo bliske i daleke požare pa bi podjela na trake
  bila zbunjujuća. `_poziListaHtml` u sva tri slučaja pravi NOVI poredak nad
  kopijom parova `{g,i}` — `i` (indeks koji `onclick="_poziZoom(i)"` nosi)
  ostaje ORIGINALNI indeks u `_poziEvts`, isti princip kao kod traka. Uz to je
  `_POZ_RADIUS_KM` sužen sa 150 na 100 km (eksplicitan zahtjev) — utiče na sve
  što ga čita (`_poziFilterBlizu`, tekst "krug X km" u statusu/toastu/karticama)
  bez posebne izmjene na tim mjestima jer svi čitaju istu konstantu.
- **Blokirajuća poruka PRIJE pokušaja je gora od greške POSLIJE pokušaja**
  (v3.108.1): podtab Sječa je pri uvođenju (v3.107.0) sakrivao CIJELI prekidač
  i sadržaj iza teksta "za ovaj sloj treba GFW ključ" ako ključ nije unesen —
  korisnik ne bi mogao ni pokušati dok ne ode do drugog podtaba. `_sjeLoad` je
  već imao ISPRAVNO ponašanje (`_sjeMeta.greska='nema-kljuca'` kad se prekidač
  uključi bez ključa) — blokada iznad njega je bila suvišan DRUGI gate koji je
  samo dodavao trenje. Uklonjen: prekidač je sad UVIJEK vidljiv (isti obrazac
  kao Požari), a nedostatak ključa se prikazuje kao obična, čitljiva greška
  TEK kad korisnik stvarno pokuša — sa uputstvom šta uraditi, ne sirovim
  internim kodom `'nema-kljuca'` (taj sentinel se prevodi u `_sjeSadrzajHtml`,
  ne procuri u UI). Isti princip kao Požari-jev `_poziProvjeriIzvore`: pusti
  korisnika da proba, objasni šta je pošlo po zlu tek ako pođe.
- **Panel bez svog taba u traci MORA imati dugme Nazad** (v3.103.2): Požari se
  otvaraju iz Menija (`switchTab('pozari')` u `.mdrop-item`), a ne iz `#tab-bar`
  — traka je već puna sa 7 tabova i požari nisu svakodnevni alat kao Vlake/
  Doznaka. Posljedica: `switchTab` označava aktivni tab tako što traži
  `.tab-btn` čiji `onclick` sadrži `switchTab('<tab>')`, pa kad tog dugmeta nema
  **nijedan tab nije istaknut** — korisnik ostane u panelu bez očitog povratka
  (mora pogoditi da klikne Karta). Zato `#pozari-panel` ima u zaglavlju dugme
  `switchTab('karta')` (`#ic-nazad`). Svaki NOVI panel koji se otvara iz Menija
  umjesto iz trake treba isto dugme.
- **Slojevi karte (v3.103.0)**: Konture (izohipse) i Pokrivenost zemljišta
  (ESA WorldCover — zamijenio EOX Sentinel-2 na istom mjestu u layer-sheetu,
  vidi `TL['🌍 Sentinel']`). Konture su BESPLATNE mrežno
  — crtaju se iz VEĆ preuzetog Terrarium DEM-a (`_getTerrariumTile`/`_TERR_CACHE`,
  isti keš kao Nagib/N.V./Ekspozicija), marching-squares u `_drawContours`/
  `_msCellSegments`. WorldCover i EFFIS slojevi su WMS servisi (bbox `GetMap`, ne XYZ
  predložak) — `makeCachedTileLayer(cacheName, L.TileLayer.WMS)` (drugi
  parametar, opcion) daje im ISTU keš/timeout/retry logiku kao Topo/Satelit/
  Karta. Test: `tests/js/dem-contours.test.js`.
- **Vremenska traka — Esri World Imagery Wayback (v3.111.0)**: na zahtjev "kao
  Google Earth, da mogu vraćati snimak" — Google sam nema besplatan API bez
  ključa za istorijske snimke, ali Esri javno i bez ključa nudi ISTO: arhivu
  prošlih verzija SVOJE World Imagery podloge (ista koju app već koristi kao
  "🛰 Satelit"), unazad do 2014, novi release otprilike mjesečno. Bitno za
  korisnika: ZIMSKI snimak (bez lišća na lišćarima) mnogo jasnije pokazuje
  četinare, šumske puteve i prosjeke nego ljetni — dugme "🌨 Zima" u pikeru
  skače na najnoviji zimski release (`_wbNajblizaZima`, mjesec 12/01/02).
  **NIJE dnevni snimak za bilo koju tačku svijeta** — mozaik se ažurira po
  dijelovima svijeta u različitim intervalima, pa izabrani datum znači "ovo
  je bilo najnovije dostupno u tom release-u", ne garantovano baš taj dan na
  tvojoj lokaciji — status ispod pikera to izričito piše, ne samo datum.
  - Config JSON (`waybackconfig.json`, `s3-us-west-2.amazonaws.com`, javan,
    bez ključa — potvrđeno uživo prije ožičavanja, ne nagađano kao GFW
    prognoza koja je odbijena) daje listu release-a; svaki već nosi PUN tile
    URL template (`{level}/{row}/{col}` = standardni Web Mercator XYZ), ne
    treba ručno slagati URL. Datum je ugniježđen u `itemTitle`
    ("World Imagery (Wayback 2026-08-05)"), NIJE poseban JSON field — prvi
    regex pokušaj (`/\((\d{4}...)\)/`, tražio `(` NEPOSREDNO prije datuma) je
    promašio jer je stvarni format "(Wayback DATUM)" — datum prati "Wayback "
    razmak, ne otvorenu zagradu. Uhvaćeno testom (`tests/js/wayback.test.js`)
    prije push-a, ne na terenu.
  - Wayback PRIVREMENO zamjenjuje bazni sloj (`_wbHideBase`/`_wbRestoreBase`)
    dok je uključen — NAMJERNO ne dira `_saveLastMap`/`_activeLayerKey` stanje
    trajno, jer bi inače ponovno otvaranje app-a moglo tiho pokazati snimak iz
    2019. umjesto trenutnog stanja. Isti `_wbTileLayer` (jedna instanca) mijenja
    URL preko `.setUrl()` kad korisnik promijeni datum — ne pravi se nova
    instanca po datumu.
  - CORS na `wayback.maptiles.arcgis.com` NIJE bilo moguće potvrditi iz
    sandboxa (isti domen-egress limit kao za svaki nov mrežni sloj — vidi
    zamke ispod) — ista ArcGIS Server infrastruktura kao već dokazano radeći
    `server.arcgisonline.com`, razumna pretpostavka, ali treba potvrdu na
    uređaju. `makeCachedTileLayer` (isti obrazac kao Topo/Satelit) već tretira
    pali fetch kao praznu providnu pločicu, ne rušenje.
  - Novi keš bucket `tvlake-wayback-v1` — dodat u `_CMGR_ROWS` (Upravljanje
    keširanim kartama) i u `sw.js` routing (`_tileRespond`), isti obrazac kao
    svaki dosadašnji tile host. Config JSON se NE kešira u Cache Storage —
    ima svoj `localStorage` keš (`_wbUcitajReleases`, offline-first isti
    obrazac kao FIRMS detekcije) jer je to lista release-a, ne pločica.
- **Heatmap gustine detekcija u Požarima (v3.112.2)**: na zahtjev "kao na
  firemap.live" — dodatak ispod postojećih markera/grupa, NE zamjena (zamjena
  bi pokvarila `_poziZoom`-ov klik-iz-liste-otvara-popup mehanizam, `g._mk`,
  koji je već pokriven testovima). NAMJERNO NIJE učitano sa CDN-a (npr.
  Leaflet.heat) — cijela ova sesija je potrošena na probleme sa vanjskim
  mrežnim izvorima (FIRMS/GFW/EFFIS), pa je isti vizuelni efekat napisan
  direktno u `_PoziHeat` (`L.Layer.extend`, ~90 linija) bez ijedne nove mrežne
  zavisnosti. Tehnika je standardna (ista koju interno koristi Leaflet.heat/
  simpleheat.js): svaka tačka crta mek radijalni "blob" na pomoćni canvas s
  NISKOM providnošću (`globalAlpha` podrazumijevano 0.15, ne 1) — preklapajući
  blobovi se PRIRODNO zbrajaju (`source-over` kompozicija), pa gušće mjesto
  (učestale detekcije istog požara) ispadne zasićenije. Alfa kanal se onda čita
  piksel-po-piksel i prevodi u boju preko 256-bojne palete (plava→zelena→
  žuta→crvena).
  **Dvije stvarne greške uhvaćene Playwright reprodukcijom PRIJE push-a** (ne
  nagađane, izmjereno slikom):
  1. Podrazumijevani `globalAlpha=1` po tački — svaki blob je bio odmah
     potpuno neproziran, pa preklapanje nije imalo šta da zbraja (usamljena
     tačka je izgledala identično "vruće" kao gust klaster). Ispravljeno na
     0.15 podrazumijevano.
  2. Paleta boja je bila OBRNUTA (`addColorStop(1 - stop, ...)`) — gušći
     klaster je ispadao PLAVI (hladno), a usamljene tačke ŽUTE/NARANDŽASTE
     (toplije) — potpuno suprotno namjeri. Uzrok: pogrešna pretpostavka da
     `getImageData`/canvas gradient trebaju flip oko Y ose; oba idu u ISTOM
     smjeru (red 0 = vrh = alfa 0), flip nije bio potreban.
  Test reprodukcije: lokalni Leaflet + izvučen `_PoziHeat` iz `index.html`,
  40 nasumičnih tačaka na jednoj lokaciji (gust klaster) + 3 razdvojene
  usamljene tačke, mjereno EKRANOM prije i poslije svake izmjene — tek treći
  screenshot je pokazao ispravan rezultat (crven/vruć klaster, blijedo plave
  usamljene tačke). Prekidač "🔥 Prikaži i kao heatmap" se pojavljuje samo
  dok je uključen glavni prekidač "Prikaži detekcije", `_poziHeatOn`/
  `_poziHeatSet` čuvaju izbor u `localStorage` (`tvlake_pozari_heat`).
- **Heatmap boja → svijetlo narandžasta + okvirni pravac širenja požara
  (v3.112.3)**: dva dijela istog zahtjeva.
  - **Heatmap paleta** promijenjena sa rainbow (plava→zelena→žuta→crvena) na
    monohromatsku svijetlo narandžastu skalu (`#fed7aa`→`#fdba74`→`#fb923c`→
    `#f97316`, isti Tailwind orange-200→600 raspon koji app već koristi za
    "🔥" akcente drugdje u Požarima) — na eksplicitan zahtjev korisnika, čisto
    stilska izmjena, tehnika (blob/alpha/paleta-lookup) iz v3.112.2 je
    nepromijenjena.
  - **Okvirni pravac širenja** (`_poziSmjerAzuriraj`/`_poziSmjerToggle`/
    `_poziSmjerOn`, `localStorage tvlake_pozari_smjer`) — NOVI prekidač u
    kartici vjetra ("🧭 Prikaži okvirni pravac širenja"), crta isprekidanu
    liniju + strelicu od najbližeg požara u smjeru kuda vatra TEŽI da ide.
    **Namjerno NIJE nazvano "prognoza"** — UI eksplicitno piše "Nije
    prognoza širenja — samo pravac kuda vatra TEŽI da ide (uzbrdo i niz
    vjetar)", jer stvarna prognoza širenja požara zahtijeva vlažnost goriva,
    vrstu vegetacije, temperaturu i puno više od dva ulaza; ovo je gruba
    heuristika od dva postojeća, već tačna izvora podataka.
    - **Dva ulaza, oba VEKTORSKI usrednjena** (`_poziSmjerBlend`, atan2 nad
      zbirom sin/cos komponenti — sprječava 0°/360° bug obične aritmetičke
      sredine, npr. prosjek 350° i 10° mora biti ~0°/360°, ne 180°):
      1. **Vjetar** — već postojeći `_poziMet.kodPozara.vjetarSmjer` (Open-
         Meteo, isti izvor kao postojeća kartica vjetra). Meteorološka
         konvencija je smjer ODAKLE vjetar duva, pa se za smjer ŠIRENJA
         koristi suprotan ugao (`+180 % 360`) — isti princip kao već
         dokumentovani `_poziVjetarPrijeti` iz v3.104.0.
      2. **Nagib terena (ekspozicija)** — NOVA funkcija `_poziAspektNaTacki`,
         ponovo koristi POSTOJEĆU Terrarium DEM infrastrukturu
         (`_getTerrariumTile`/`_terrariumDecodeTile`, isti keš kao Nagib/N.V./
         Ekspozicija/Konture) na zoom 12 (dovoljno za grub pravac, ne treba
         fina rezolucija profila puta) — vatra teži da ide UZBRDO (suprotno
         od `_gradeColor`/`_makeDemCanvasLayer` NIZBRDO konvencije, isti
         `atan2(-dzdx,dzdy)` obrazac, samo +180°).
    - **Udaljenost projekcije skalirana brzinom vjetra**
      (`Math.min(0.4 + vjetarMs*0.25, 2.5)` km) preko `turf.destination`
      (već učitana zavisnost u app-u, ista funkcija koja se koristi za
      buffer operacije drugdje) — jači vjetar = duža strelica, kapa na 2.5 km
      da se ne rasteže preko cijele karte na olujnom vjetru.
    - Radi SAMO za najbliži požar (`_poziEvts[0]`, lista je već sortirana po
      udaljenosti u zadanom "Bliže prvo" sortu) i SAMO kad postoji vjetar
      podatak za baš taj požar (`_poziMet.naj === g` provjera) — bez oba
      ulaza (nema DEM pločice, nema vjetra) sloj se tiho ne crta, ne baca
      grešku.
    - Poziva se iz istih mjesta gdje se već crta/briše heatmap (`_poziRender`,
      `_poziOsvjeziMeteo`, `_poziToggle(false)` čisti sloj pri isključivanju
      panela) — isti obrazac kao `_poziHeatLayer`.
    - **Verifikovano Playwright reprodukcijom PRIJE push-a** (izvučene stvarne
      `_termLon2x`/`_termLat2y`/`_terrariumDecodeTile`/`_poziAspektNaTacki`/
      `_poziSmjerBlend`/`_azimutSmjer` iz index.html, sintetički DEM koji
      raste ka istoku [uzbrdo=90°] + sintetički vjetar iz sjevera [gura vatru
      ka jugu=180°]): izračunati spoj je tačno 135° (JI/jugoistok, prosjek
      90° i 180°), a screenshot pokazuje liniju/strelicu koja stvarno ide
      dolje-desno (jugoistočno na karti sa sjeverom gore) — geometrija
      potvrđena, ne samo broj. 4 nova testa za `_poziAspektNaTacki` (ravno→
      null, nedostaje pločica→null, teren raste istočno→uzbrdo≈90°, teren
      raste južno→uzbrdo≈180°) + 3 za `_poziSmjerBlend` (prost prosjek,
      0°/360° wraparound, identični pravci) u `tests/js/pozari.test.js`
      (88 testova ukupno u tom fajlu).
- **Heatmap narandžasta paleta bila je NEVIDLJIVA na stvarnom terenu
  (v3.112.4)**: korisnik je odmah poslije v3.112.3 prijavio "nema oznake
  površine u narandžastoj boji" — ekran je pokazivao samo marker grupe i
  strelicu pravca širenja, bez ikakve heatmap mrlje, iako je (potvrđeno
  preko AskUserQuestion) prekidač "Prikaži i kao heatmap" bio uključen. Prije
  nagađanja napravljena Playwright reprodukcija (izvučen `_PoziHeat` iz
  index.html, simulirana topo podloga — zeleno/braon konturne linije,
  identičan princip kao ranije za grid-lines/tile-bloburl bugove): canvas se
  UREDNO nalazi u `demOverlay` pane-u i piksele ispravno računa — kod NIJE
  bio slomljen. Problem je bio ČISTO VIZUELNI kontrast: `_redraw()` crta
  svaku tačku sa `globalAlpha` podrazumijevano 0.15 (namjerno nisko od
  v3.112.2 — usamljena detekcija treba biti blijeda, "usijanost" dolazi tek
  preklapanjem). Dok je paleta bila rainbow (v3.112.2), najniža gustoća je
  bila PLAVA — hladan ton na toploj zeleno/braon topo podlozi ima prirodan
  kontrast čak i na 15% providnosti. Kad je paleta promijenjena na svijetlo
  narandžastu (v3.112.3, na eksplicitan zahtjev), isti 15% providnosti daje
  blijedu narandžastu na već zeleno/braon/bež pozadini — boje se stapaju,
  praktično nevidljivo, i to gore što su stvarne detekcije na terenu
  RIJETKO piksel-na-piksel preklopljene (grupišu se u isti "požar" unutar
  1500m praga, ali na tipičnom zumu to je razmak od desetina do stotina
  piksela, pa se alfa ne penje visoko preklapanjem).
  Popravka: podrazumijevani alfa podignut sa 0.15 na 0.4 (I DALJE ispod pune
  neprozirnosti — gušći klaster i dalje izgleda "vruće" jače od usamljene
  tačke, samo je usamljena tačka sada stvarno vidljiva). Paleta boja NIJE
  mijenjana (korisnik je eksplicitno tražio svijetlo narandžastu) — problem
  nije bila boja sama po sebi nego kombinacija te boje sa niskim alfa na
  toploj podlozi. Verifikovano sa tri varijante uporedo na istoj simuliranoj
  topo podlozi (trenutno stanje/alfa 0.15 vs alfa 0.4 vs alfa 0.45+zasićenija
  paleta) — alfa 0.15 je bio jedva vidljiva mrlja, alfa 0.4 jasno vidljiva
  narandžasta mrlja iste (svijetle) palete.
  **Pouka**: promjena BOJE vizuelnog sloja se ne može ocijeniti izolovano od
  PROVIDNOSTI i pozadine na kojoj se prikazuje — ista providnost koja je
  dobro funkcionisala sa jednom paletom (kontrastna boja) može biti potpuno
  neupotrebljiva sa drugom (boja bliska pozadini), čak i kad je kod
  identičan. Kad korisnik traži promjenu SAMO boje, provjeriti da li nova
  boja i dalje ima dovoljan kontrast na stvarnoj pozadini prije nego se
  proglasi gotovim — ovdje to nije urađeno prije v3.112.3 push-a (Playwright
  test iz v3.112.2 je koristio drugu paletu, pa test "prošao" ne znači da
  je nova kombinacija boja/alfa provjerena).

- **Projekcija opožarene površine (v3.113.0)**: na zahtjev "pretpostavi koji
  dio je izgorio na osnovu starijih požara, npr. ako požar gori duži vremenski
  period". Ovo je NAMJERNO odstupanje od odluke iz v3.104.0 (koja je odbila
  procjenu hektara iz BROJA detekcija) — i razlika je suštinska: ne množi se
  broj piksela nekim faktorom, nego se koristi GEOMETRIJA i VRIJEME stvarno
  izmjerenih vrelih piksela. `_poziOpozGeom`/`_poziOpozProjekcija`/
  `_poziOpozAzuriraj`, prekidač `_poziOpozToggle` (`localStorage
  tvlake_pozari_opoz_proj`), vlastita kartica iznad EFFIS kartice.
  - **Dva sloja geometrije, oba obavezna**: (1) unija baferovanih piksela
    (bafer = POLA senzorske rezolucije, `p.rez` 375 m VIIRS / 1000 m MODIS) —
    garantuje da nijedna detekcija ne ostane van poligona; (2) concave hull
    odozgo, koji popuni stvarno zatvorenu unutrašnjost gustog požara.
  - **Convex hull se NE koristi nigdje** — popuni sve udubine. Izmjereno na
    požaru u obliku luka (front koji obilazi vrh brda): convex 1145 ha,
    stvarna projekcija 214 ha. Na 24 razbacane detekcije convex tvrdi 3559 ha
    naspram 259 ha stvarno viđenog. To je tačno onaj izmišljeni broj zbog
    kojeg je v3.104.0 odbila procjenu površine.
  - **Bug uhvaćen SCREENSHOT-om, ne brojkama**: prva verzija je koristila SAMO
    concave hull. Unit test "concave < 0.5 × convex" je PROŠAO — ali iz
    pogrešnog razloga: na luku concave daje uzanu krpu oko dva zbijena kraja i
    ostavi desetak detekcija po sredini luka POTPUNO VAN poligona. Poligon koji
    ne pokriva ono što je satelit izmjerio je gori od nikakvog. Vidjelo se tek
    na slici. Popravka je korak (1) gore, a test koji bi to uhvatio je dodat
    (`turf.booleanPointInPolygon` za SVAKU detekciju — dva testa, za lučni i
    za razbacani slučaj). Pouka: asercija o VELIČINI ne zamjenjuje aserciju o
    POKRIVENOSTI.
  - **Vremenska podjela**: detekcije starije od `_POZ_FRONT_MS` (6 h) u odnosu
    na najnoviju u toj grupi = "vjerovatno već izgorjelo" (tamni poligon
    unutar narandžastog). Kad požar nema vremenskog raspona (viđen u jednom
    preletu), `staro` je `null` i UI to KAŽE umjesto da nacrta lažni sloj.
  - **`interactive:false` je obavezan** na oba poligona — inače bi novi canvas
    pane pojeo klikove svemu ispod (dokumentovana zamka iz v3.101.0). Brojke
    zato idu u popup markera grupe (`pozariPane`, iznad) i u karticu panela,
    ne u klik po poligonu. Provjereno Playwright-om: klik na marker i dalje
    prolazi (1 od 1).
  - **Ovo NIJE zamjena za EFFIS "Opožarene površine"** — to je mjerena granica
    i ostaje ispod u panelu; ova projekcija popunjava rupu dok EFFIS (koji
    kasni danima) još nema ništa. Kartica to izričito piše.
  - Testovi: 12 novih u `tests/js/pozari.test.js` (100 ukupno), nad STVARNIM
    turf-om iz `static/libs/turf.min.js`.
- **Projekcija — trake starosti i prikaz površine (v3.113.1)**: na zahtjev
  "unaprijedi trenutnu sekciju, posebno površina koja je opožarena i njen
  prikaz". Binarna podjela iz v3.113.0 ("front ≤ 6 h" / "sve ostalo") je na
  požaru koji gori danima gurala SVE osim zadnjih 6 h u jednu tamnu mrlju — a
  baš je tu informacija koju forester traži (gdje je vatra bila juče, a gdje
  prekjuče). Sada `_POZ_STAROST` definiše četiri trake (≤6 h / 6–24 h / 1–3
  dana / starije), svaka sa svojom geometrijom i bojom.
  - **Starost je RELATIVNA na najnoviju detekciju U TOJ GRUPI**, ne na
    trenutno vrijeme — "1–3 dana" znači isto bez obzira kad korisnik otvori
    kartu, i ne mijenja se dok app stoji otvorena.
  - **Crta se od najstarije ka najnovijoj** (starije dolje): mjesto koje je
    gorjelo i prekjuče i jutros čita se kao aktivno, što je i tačno.
  - **Detekcija bez upotrebljivog `dt` ide u NAJSTARIJU traku**, ne ispada —
    izmjerena je, pa mora biti u projekciji (pokriveno testom).
  - **`ukupno` NIJE zbir traka** nego njihova spojena geometrija: kad isto
    mjesto gori više puta, zbir bi istu površinu brojao dvaput. Test to čuva.
  - **`_poziProj` memoizuje po grupi** (`g._proj`, `undefined` = nije računato,
    `null` = nema projekcije i ne pokušavaj ponovo). `_poziRender` se zove na
    svaki meteo/GPS/toast događaj, a geometrija je najskuplji dio; grupe se pri
    svakom učitavanju grade nanovo (`_poziOznaciNove` pravi nove objekte) pa
    keš prestaje važiti sam od sebe. **Popupi se grade u `_poziRender` PRIJE
    nego `_poziOpozAzuriraj` izračuna projekcije** — zato popup zove
    `_poziProj(g)`, a ne sirovo polje `g._proj` (bilo bi prazno na prvom
    crtanju).
  - **Legenda ide na KARTU, ne samo u panel** — panel prekriva cijelu kartu,
    pa kad korisnik gleda poligone ne vidi nikakvo objašnjenje nijansi.
    Ubačena je u postojeći `#dem-legend` (`_demLegendUpdate`), čime automatski
    nasljeđuje sakrivanje van Karte u `switchTab` i izuzeće iz `@media print`.
    **Rani izlaz `if (!showEkspo && !showNv) return;` je morao biti uklonjen** —
    inače se legenda požara ne bi pojavila kad su DEM slojevi isključeni;
    vidljivost se sad odlučuje na kraju, po tome je li išta sastavljeno.
    `_poziLegendaTrake` vraća samo trake koje su STVARNO nacrtane, uvijek u
    istom redoslijedu (najnovija → najstarija).
  - **Kvadratić u legendi ide PUNOM bojom i sa svijetlim okvirom**: prvi
    pokušaj je preslikavao providnost sa karte (`opacity: t.op + 0.25`) i
    najtamnija traka (`#292524`) je NESTALA na tamnoj podlozi legende — red je
    izgledao kao tekst bez oznake. Uhvaćeno na screenshotu, ne u testu.
    Providnost je stvar karte (da se vidi teren ispod); u legendi je bitan samo
    identitet boje.
  - **`_poziPovrsTxt`** — < 10 ha jedna decimala, 10–1000 ha cijeli broj, preko
    toga km² (100 ha = 1 km²). `213.80266 ha` lažira preciznost koju procjena
    iz satelitskih piksela nema.
  - Površina se sad vidi i **u listi požara** (`_poziRedHtml`) — ranije je za
    poređenje "koji je od ovih velik" trebalo otvarati marker po marker.
  - Testovi liste su morali dobiti `_poziOpozOn: () => false` u sandboxu —
    tiču se traka/indeksa, ne geometrije. 10 novih testova (110 ukupno).
- **Tempo napredovanja i produženje na 1–7 dana (v3.113.2)**: na zahtjev
  "prikaži... s obzirom na prosjek napredovanja koliko će površine izgorjeti
  za 1,2,3 do 7 dana". `_poziTempo`/`_poziPrognoza`/`_poziPrognozaHtml`.
  - **Tempo je NAGIB LINEARNE REGRESIJE kroz (vrijeme, kumulativna površina),
    NE `ukupno / trajanje`.** Ovo je suština: već PRVA detekcija nosi cijeli
    senzorski piksel (~11 ha kod VIIRS-a) koji se pojavio odjednom i nije
    "narastao". Naivno dijeljenje taj početni skok pripisuje rastu i naduvava
    tempo — kod kratko posmatranog požara i višestruko (test: požar koji je
    skočio na 100 ha pa rastao 2 ha/h daje naivno 12 ha/h, regresija tačno 2).
  - **Kumulativna kriva dolazi BESPLATNO iz traka starosti** — `ukupno` se
    ionako gradi unijama, samo se sada akumulira od NAJSTARIJE ka najnovijoj
    (stvarni redoslijed rasta) i bilježi `{h, ha}` na svakoj traci. Jedini
    dodatni trošak je `turf.area` po traci. Vrijeme tačke je `tMax` trake
    (najnovija detekcija u njoj) — trenutak kad je požar dosegao tu površinu.
  - **Odbija se kad nema osnove**, i to se KAŽE umjesto praznog prostora:
    < 2 tačke u vremenu (sve detekcije iz istog perioda), raspon < 6 h
    (`_POZ_TEMPO_MIN_H` — prekratak uzorak), ili nagib ≤ 0 (ne raste, nema šta
    produžavati). Svaki slučaj ima svoju poruku sa razlogom.
  - **Upozorenje stoji IZNAD brojeva, ne kao fusnota ispod** — brojka "za 7
    dana ≈ 424 ha" se pamti i prepričava, pa uslov pod kojim vrijedi mora
    stići do čitaoca prije nje. Tekst izričito kaže da nije model ponašanja
    požara i da ne zna za vjetar, gašenje, prepreke ni za to je li požar već
    ugašen.
  - **NAMJERNO se ne crta na karti** — produžena površina je čista
    ekstrapolacija; poligon na karti bi se čitao kao izmjeren podatak, pored
    trake starosti koje to stvarno jesu. Ostaje kao brojevi u kartici.
  - 9 novih testova (119 u `pozari.test.js`), uključujući onaj koji čuva baš
    regresiju naspram naivnog `ukupno/trajanje`.
- **Projekcija i prognoza — DVA nezavisna prekidača (v3.117.1)**: na terenu je
  screenshot pokazao zbunjujuće preklapanje krugova/poligona uz komentar "nejasno
  ovo duplo prikazivanje" — jedan checkbox ("Prikaži projekciju na karti") je
  uključivao ODJEDNOM i trake starosti NA KARTI i tabelu "za 1–7 dana" u
  kartici, bez načina da se zadrži jedno bez drugog.
  - Razdvojeno na `_poziOpozOn`/`_poziOpozToggle` (isto kao prije — trake
    starosti na karti + razrada po trakama u kartici) i NOV
    `_poziPrognOn`/`_poziPrognToggle` (`localStorage
    tvlake_pozari_prognoza_prikaz`) — kontroliše SAMO tabelu "Ako nastavi ovim
    tempom" u kartici. Prognoza se i dalje NIKAD ne crta na karti (v3.113.2
    odluka ostaje), pa `_poziPrognToggle` namjerno NE zove `_poziOpozAzuriraj`
    — samo `_poziRenderPanel()`.
  - Podaci (`_poziProj`, memoizovano po grupi) se računaju čim je BAR JEDAN od
    dva prekidača uključen (`(_poziOpozOn() || _poziPrognOn()) && _poziOn`) —
    geometrija i tempo dijele istu projekciju, razlika je samo šta se od toga
    PRIKAZUJE. Sadržaj kartice je zato razdvojen u `opozSazetak`/`prognSazetak`,
    svaki punjen samo kad njegov prekidač zove.
  - **Provjereno Playwright-om nad STVARNIM markupom** (izvučen tačan blok
    generisanja sadržaja + `kart`/`prekidac` iz index.html, sve 4 kombinacije
    uklj/isklj): DOM stanje oba checkbox-a (`.checked`) potvrđeno tačno u sve
    4 kombinacije. Napomena iz te provjere: 📈 emoji u headless Chromium-u bez
    color-emoji fonta zna izgledati kao mala zelena kvačica pored teksta —
    lako se pobrka sa DRUGIM checkbox-om na screenshotu; provjera DOM stanja
    (`.checked`), ne izgleda piksela, je razriješila da je to samo font
    fallback, ne bug.
  - 4 nova testa u `tests/js/pozari.test.js` (154 ukupno) — nezavisnost
    localStorage ključeva i da `_poziPrognToggle` ne baca kad
    `_poziOpozAzuriraj` uopšte nije u sandboxu (dokaz da ga ne zove).
- **Trake starosti — šira paleta, ne samo tamnija (v3.117.2)**: na terenu
  prijavljeno "ovako slične boje... bitno da bude svjetla boja" uz screenshot
  gdje se krugovi/poligoni traka jedva razlikuju. Python HSL analiza stare
  skale (`_POZ_STAROST`: `#fb923c→#c2410c→#7c2d12→#292524`) je pokazala PRAVI
  uzrok: nijansa (hue) se kretala u rasponu od svega 15° (27°→12°), a
  zasićenost je prema kraju kolabirala ka sivom (96%→6.5%) — razlika između
  traka se svodila GOTOVO ISKLJUČIVO na zatamnjenje, najteži kanal za oko da
  razdvoji, pogotovo kroz providnost/preklapanje na karti. Skala JESTE bila
  strogo monotona po svjetlini (postojeći test to čuva), ali monotona
  svjetlina ≠ međusobno razlučive boje.
  - Nova paleta širi raspon nijanse (32°→12°) i drži zasićenost visoko do
    kraja umjesto da se gasi u sivo, uz eksplicitan zahtjev da najsvježija
    traka bude vidljivo SVIJETLA:
    `_POZ_STAROST` (poligoni projekcije na karti): front `#fed7aa` (bilo
    `#fb923c`), 6–24h `#fb923c` (bilo `#c2410c`), 1–3 dana `#c2410c` (bilo
    `#7c2d12`), starije `#292524` (nepromijenjeno — već dovoljno različito).
    `_POZ_MK_STAROST` (markeri/lista/legenda): front `#fdba74`, 6–24h
    `#fb923c`, 1–3 dana `#c2410c`, starije `#292524` (nepromijenjeno).
  - **Front NIJE ista nijansa u ova dva niza, namjerno**: tri Playwright
    provjere PRIJE finalnog izbora (izolovana repro, izvučen stvaran CSS/
    marker markup, ne nagađanje):
    1. **Čitljivost teksta na markeru** — grupa markera nosi BIJELI podebljani
       broj preko boje. Najsvjetliji kandidat (`#fed7aa`, ista nijansa kao
       poligonski front) je na screenshotu ispao PREBLIJED — broj postaje
       teško čitljiv. `#fdba74` (jednu nijansu tamnije) je ostao jasno svijetao
       ALI sa dovoljno kontrasta za bijeli tekst — zato marker koristi
       `#fdba74`, a poligon (bez teksta preko sebe) zadržava svjetliji `#fed7aa`.
    2. **Vidljivost poligona na topo podlozi** — direktna primjena pouke iz
       v3.112.4 (promjena boje se ne smije ocijeniti izolovano od providnosti/
       pozadine): renderovan `#fed7aa` na opacity 0.55/0.65/0.75 preko
       simulirane zeleno-braon topo teksture. Postojeći opacity 0.55 (bez
       izmjene) je već jasno vidljiv i na najsvjetlijoj boji — bez potrebe za
       podizanjem providnosti.
    3. **Kombinacija ispune + linije** — Leaflet crta `fillOpacity` i
       stroke/`color` kao DVA odvojena sloja (linija na punoj neprozirnosti);
       repro je to vjerno simulirao (odvojeni `.fill`/`.stroke` div) i
       potvrdio da rub ostaje jasno definisan sa oba kandidata za liniju.
  - **Prsten pulsa (`pozPuls` CSS keyframes) usklađen sa novim markerom** —
    `rgba(249,115,22,...)` (`#f97316`, stara boja) → `rgba(253,186,116,...)`
    (`#fdba74`, nova) — crveni/tamniji prsten oko svjetlijeg markera bi
    izgledao kao druga kategorija svježine, a nije.
  - **Postojeći test "svjetlije = svježije" (v3.113.3) je prošao BEZ izmjene
    testa** — asercija provjerava STROGO OPADAJUĆI zbir RGB komponenti, ne
    hardkodovane hex vrijednosti, pa je automatski potvrdila da nova paleta
    ostaje monotona po svjetlini. Ovo je primjer zašto je vrijedno pisati
    invarijantu umjesto konkretne vrijednosti — test je odmah bio koristan za
    SASVIM drugu paletu bez ijedne izmjene.
- **Boja markera nosi STAROST, ne pouzdanost (v3.113.3)**: na zahtjev
  "unaprijedi prikaz požara". Do tada je boja markera bila `_poziPouzdanost`
  (crveno = visoka pouzdanost senzora), pa je požar od prije četiri dana bio
  jarko crven, a onaj koji gori SADA sa slabijim signalom žut — **tačno
  obrnuto od hitnosti**. Pouzdanost gotovo nikad ne mijenja odluku na terenu,
  starost je mijenja uvijek. `_POZ_MK_STAROST`/`_poziMkStarost`.
  - Pouzdanost NIJE izgubljena — ostaje kao TEKST u listi (desna kolona) i u
    popup-u. Samo više ne troši najjači vizuelni kanal (boju).
  - **Ista paleta u listi i na karti**: tačka lijevo u redu liste je ranije
    bila boja pouzdanosti — sad je boja starosti, ista kao marker. Inače bi
    ista paleta na dva mjesta značila dvije različite stvari.
  - **Referenca je SADA** (koliko je detekcija stara), dok trake projekcije
    mjere u odnosu na najnoviju detekciju TOG požara. Različite reference, ali
    obje daju isti mentalni model "svjetlije = skorije", što je jedino što
    korisnik stvarno gradi.
  - **Zamka koju test čuva**: `(Date.now() - NaN)/3600000` je `NaN`, a
    `NaN <= 6` je `false`, pa bi `.find` vratio PRVU traku i detekcija bez
    upotrebljivog vremena bi na karti izgledala kao da gori upravo sada.
    `_poziMkStarost` zato eksplicitno šalje nepoznato vrijeme u NAJSTARIJU
    traku.
  - **Test "svjetlije = svježije" je uhvatio stvarnu grešku u paleti**: prvi
    izbor za "starije" (`#44403c`, zbir RGB 192) bio je SVJETLIJI od "1–3
    dana" (`#7c2d12`, 187) — skala nije bila monotona pa bi "tamnije = starije"
    imalo izuzetak. Zamijenjeno sa `#292524` (114), što je usput ista boja kao
    najstarija traka projekcije. Asercija o monotonosti svjetline je jeftin
    način da se ovakav promašaj ne provuče.
  - **Marker grupe raste sa brojem detekcija** (24→36 px, kapa da ne prekrije
    susjedne požare) — "koliko je ovo veliko" se vidi prije nego se pročita broj.
  - **Nova legenda "🔥 Detekcije (starost)"** u istom `#dem-legend` elementu —
    boja bez ključa je gora od nikakve boje, korisnik bi i dalje pretpostavljao
    pouzdanost. `_poziLegendaMarkeri` vraća samo starosti koje na karti stvarno
    postoje. `_poziToggle(false)` mora zvati `_demLegendUpdate()`, inače
    legenda ostane kad se požari isključe.
  - **"aktivan front" se više ne tvrdi za požar koji odavno nije viđen**:
    trake projekcije su relativne na njegovu najnoviju detekciju, pa je kod
    požara zadnji put viđenog prije 4 dana najnovija traka i dalje pisala
    "≤ 6 h (aktivan front)" — što jednostavno nije tačno. Sad u tom slučaju
    piše "najnovije viđeno".
  - Prsten `pozPuls` animacije prebačen sa crvene na narandžastu — crveni
    prsten oko narandžastog markera je izgledao kao druga kategorija, a nije.
  - 11 novih testova (130 u `pozari.test.js`).
- **Detekcije se nisu osvježavale bez obavještenja (v3.114.0)**: sa terena je
  stigla prijava "požar se već prikazao na firemap.live a na našoj app ga
  nema". Dijagnostika kroz pitanja (ne nagađanje) je isključila sve očito:
  APK (dakle native most, nema CORS-a), MAP_KEY unesen (dakle brzi bbox Area
  API, ne spore arhive), "Provjeri izvore" javlja uspjeh, požar bliži od 50 km
  (unutar 100 km) i svjež, a **drugi požari su se uredno prikazivali** — dakle
  dohvat, parsiranje, filter i crtanje rade.
  - Pravi uzrok: **osvježavanje se uopšte nije dešavalo**. `_poziNotifTimerStart`
    je startovao SAMO iz grane `if (_poziNotifOn())` (pri pokretanju i u
    `_poziNotifToggle`), a obavještenja su podrazumijevano ISKLJUČENA. Ko ih
    nema uključena dobio bi podatke **jednom, pri pokretanju app-a**, i nikad
    više dok ručno ne pritisne "Osvježi". Šumar koji drži app otvorenu cijeli
    dan tako nikad ne vidi požar koji je NASA objavila sat vremena kasnije.
  - **Pouka**: "Provjeri izvore" (`_poziProvjeriIzvore`) radi SVOJ, potpuno
    odvojen dohvat i NE upisuje rezultat u `_poziPts`/`_poziEvts`. Zato
    "sve piše OK" dokazuje samo da mreža radi — ne i da je ono na ekranu
    svježe. Kod sljedeće slične prijave to razlikovati odmah.
  - Popravka: `_poziAutoTreba()` (sloj požara UKLJUČEN **ILI** obavještenja
    uključena) + `_poziAutoSync()` koji usklađuje JEDAN timer sa tim stanjem.
    Jedan timer namjerno, ne dva — dva bi na istom uređaju dohvaćala dvaput
    zaredom iste podatke.
  - **Interval 10 min** (`_POZ_AUTO_MS`, bio 15): bitno je koliko brzo
    primijetimo NASA-inu OBJAVU, a ne koliko brzo satelit prođe — objava kasni
    do par sati i dolazi u nepredvidivom trenutku.
  - **Otkucaj u pozadini se preskače** (`document.hidden`) — ne troši podatke
    dok app nije na ekranu; nadoknađuje se pri povratku.
  - **Najveći stvarni dobitak je `_poziOsvjeziAkoJeStaro()`** (prag
    `_POZ_STALE_MS` = 5 min), zakačen na `visibilitychange` (povratak u prvi
    plan) i na otvaranje panela u `switchTab('pozari')`. Šumar izvadi telefon
    ili otvori panel → odmah svježe stanje, umjesto čekanja do sljedećeg
    otkucaja. Tiho (`_poziLoad(true)`), bez toasta, da povratak u app ne
    bljesne porukom.
  - `_poziStatusSet` već zove `_poziRenderPanel()`, pa se lista sama iscrta kad
    tihi dohvat stigne — nije trebalo dodatno ožičenje.
  - 11 novih testova (141 u `pozari.test.js`). **Zamka pri pisanju testa**:
    `let _poziNotifTimer` je samostalna deklaracija (ne `const`), pa je
    `extractConst` ne hvata — bez ručnog dodavanja u sandbox
    `_poziNotifTimerStop` puca na `ReferenceError` pri prvom čitanju.
- **Osvježavanje samo dok je sekcija otvorena + vidljiva svježina (v3.114.1)**:
  korisnik je na v3.114.0 tražio "neka se ovako ponaša samo po uključenju
  požari sekcije".
  - `_poziAutoTreba()` sada gleda `_activeTab === 'pozari'` umjesto `_poziOn`.
    Razlog je dobar: **sloj ostaje uključen danima**, pa je timer u v3.114.0
    kucao i dok je korisnik odavno na Vlakama ili Doznaci — trošio podatke i
    bateriju, a rezultat niko ne gleda. Kad se sekcija otvori, svježe stanje
    ionako stiže odmah preko `_poziOsvjeziAkoJeStaro()`.
  - **Obavještenja su jedini izuzetak** i moraju ostati u uslovu — njihova
    cijela svrha je da jave DOK ne gledaš; bez toga bi ih ova izmjena tiho
    pokvarila.
  - `_poziAutoSync()` se zato zove na SVAKU promjenu taba u `switchTab`, ne
    samo pri ulasku u sekciju — inače timer nikad ne bi stao pri izlasku.
  - **Vidljiva svježina** (`_poziSvjezinaHtml`, prag `_POZ_STARO_MS` = 30 min):
    cijeli bug zbog kojeg je v3.114.0 nastala bio je NEVIDLJIV — podaci stari
    satima, a to je pisalo sitnim sivim slovima usred rečenice sa još pet
    podataka. Sada svježina ima svoj red, a preko praga postaje žuto
    upozorenje sa pozivom na "Osvježi". Bolje jedan suvišan pritisak nego
    gledanje jučerašnjeg stanja u uvjerenju da je današnje.
  - **"N novih od zadnje provjere"** (`_poziNoviHtml`): poslije TIHOG
    automatskog osvježavanja se inače ne vidi da se išta promijenilo — nov
    požar se samo pojavi negdje u listi. Koristi postojeći `g.nov` iz
    `_poziOznaciNove` (koji upisuje skup viđenih pri svakom učitavanju, pa se
    brojka prirodno resetuje na sljedećem osvježavanju) i postojeću sklonidbu
    `_poziBrojRijecNovih` (1 novi / 2 nova / 5 novih).
  - 9 novih testova (150 u `pozari.test.js`); postojeći testovi automatskog
    osvježavanja su prepisani sa `_poziOn` na `_activeTab` semantiku.

## Pozadinsko snimanje (trag/vlaka) kad se izađe iz aplikacije

- **Native bafer se NIJE praznio pri hladnom startu (v3.115.0)** — najskuplja
  posljedica cijelog pozadinskog snimanja. `GpsService` uredno nastavi pisati
  fiksove u `gps_native_buffer.jsonl` i kad OEM battery manager ubije CIJELI
  proces usred snimanja (foreground servis + `START_STICKY` + wake lock — sve
  je to radilo). Ali JEDINI pozivalac `_drainNativeGpsBuffer()` bio je
  `visibilitychange`, a **ponovno otvaranje app-a poslije ubijenog procesa je
  HLADAN START: stranica se učita već vidljiva, pa taj event nikad ne opali.**
  Sve prikupljeno dok je app bio mrtav ostajalo je u fajlu i bilo TRAJNO
  obrisano pri sljedećem `startRecording()` (`clearBuffer` u `GpsService`) —
  dakle tačno onaj period zbog kojeg native bafer uopšte postoji.
  - Popravka: `_nativeBufUzmi()` (jedno destruktivno čitanje, sortirano) +
    poziv iz `_crashCheck()`. Bafer se uzima **JEDNOM** i usmjerava u obje
    grane oporavka (trag i vlaka mogu snimati istovremeno).
  - **Trag** ide kroz `_addTragPoint(..., p.t)` da vrijede isti filteri
    (tačnost, speed-gate, auto-pauza) i da tačke nose STVARNI historijski
    timestamp — bez toga speed-gate cijeli period vidi kao jedan skok i odbije
    sve (ista zamka koju već opisuje komentar uz `_tragLastT` u `_crashCheck`).
  - **Vlaka** se dopunjava tačkama novijim od `snapV.ts` (vrijeme snimka), jer
    tačke u crash-snapshotu NEMAJU vlastiti timestamp. Snimak se piše na 30 s,
    pa se time hvata i onih do 30 s prije nego je proces ubijen.
  - Ako korisnik ODBIJE oporavak, bafer se svejedno pročita (dakle obriše) —
    pripada baš toj prekinutoj sesiji i ne smije iscuriti u sljedeće snimanje.
  - Toast kaže koliko je tačaka došlo iz pozadine ("… (12 iz pozadinskog
    snimanja)") — bez toga korisnik ne zna je li rupa popunjena ili ne.
  - Test: `tests/js/gps-bg-buffer.test.js` (13 testova). **Provjereno da pada
    na starom kodu** prije nego je proglašen dobrim.
  - **Zamka pri pisanju tog testa**: `_crashCheck` REBIND-uje `_tragPts`/
    `_tragOn` (to su parametri sandbox funkcije), pa se unutrašnje stanje ne
    može posmatrati izvana — mock `_addTragPoint` zato bilježi u DIJELJENI niz,
    a `_tragOn` se čita kroz getter koji vraća sama sandbox funkcija.
- **`onTaskRemoved` + `android:stopWithTask="false"` (v3.115.0)**: kad korisnik
  izbaci app iz "recent apps" usred snimanja, servis mora nastaviti. Oba sloja
  su namjerno tu, ne jedan: dio OEM ROM-ova ignoriše manifest atribut, a
  `onTaskRemoved` NAMJERNO ne zove `super` (podrazumijevana implementacija zna
  zaustaviti servis zajedno sa taskom) i preventivno obnavlja foreground
  notifikaciju + wake lock — bez vidljive notifikacije Android smije ugasiti
  servis kao "obični" pozadinski.
- **Traži pun rebuild u Android Studiju** (mijenjani `.java` i
  `AndroidManifest.xml`) — sam `copy-assets` NE prenosi ni Javu ni manifest.

## Donja traka — #action-bar (Karta) i #rec-bar (svi paneli)

- **`#action-bar` postoji SAMO na Karti** (`_updFabVisibility`:
  `ab.style.display = (onKarta && !hideBars) ? 'flex' : 'none'`). To je namjerno
  — sadrži alate nad kartom (Snimi vlaku, Tragovi, Izmjeri, Lokacija) i mijenja
  se u modove snimanja (krak L/D, Pauza, Završi, Vrati se; `trag-mode`).
- **`#rec-bar` — traka snimanja na SVIM panelima (v3.116.0)**: prije nje je čim
  bi korisnik otišao sa Karte na Vlake/Projekat/Doznaku snimanje NESTAJALO iz
  vidokruga — ni indikacije da nešto snima, ni načina da se pauzira/završi bez
  vraćanja na Kartu. Traka nosi tri stvari koje su tada jedine bitne: šta se
  snima, koliko je snimljeno, i Pauza/Završi.
  - **Pravilo vidljivosti** (`_recBarSync`): prikaži kad išta snima, OSIM kad
    smo na Karti i `#action-bar` već pokriva taj tip. **Pojas doznake je
    izuzetak** — `#action-bar` ga ne pokriva ni na Karti (u `!inRec` grani nema
    doznaka kontrola), pa je traka tamo jedini način da se vidi i zaustavi.
  - **Prioritet vlaka → trag → doznaka, a ostali se BROJE** u natpisu
    (`(+2)`). Bez toga bi korisnik završio ono što traka pokazuje i mislio da
    je gotov, dok drugo snimanje i dalje troši bateriju.
  - **Završi PRVO prebaci na svoj ekran pa tek onda završi** (`switchTab` +
    `setTimeout`) — dijalozi završetka (ime vlake, spašavanje traga, sync
    pojasa) pripadaju svom ekranu i ne smiju iskočiti na tuđem panelu.
  - **`_recBarSync()` se zove PRIJE ranih `return`-a u `_updFabVisibility`** —
    ta funkcija izlazi ranije baš u modovima snimanja, pa bi traka inače
    ostala neosvježena tačno kad je najpotrebnija.
  - **Preklapanje sadržaja**: traka je `position:fixed` (isti obrazac kao
    `#action-bar`), pa bi prekrila zadnji red panela koji se skroluje. Rješeno
    JEDNIM pravilom `body.recbar-on #main { padding-bottom: 54px; }` umjesto
    nabrajanja svakog panela — djeca `#main`-a su `height:100%` pa se skupe
    zajedno sa content boxom roditelja. Klasa se stavlja SAMO kad je traka
    stvarno vidljiva, pa se na Karti `#main` ne mijenja i Leaflet ne treba
    dodatni `invalidateSize()` (tab switch ga ionako već zove).
  - **Novi element u donjem dijelu ekrana mora ući i u `@media print`**
    pravilo koje skriva `#action-bar` — inače iskoči na štampi.
  - U sprite-u **nema `#ic-play`**; za "Nastavi" se koristi znak `▶`, isto kao
    `ab-pauza-ico` u `#action-bar`.
  - Testovi: `tests/js/rec-bar.test.js` (15) — težište na tome da se ostala
    snimanja broje i da se Pauza/Završi rutiraju na ISPRAVAN tip.

## Zamke specifične za dodavanje NOVOG mrežnog sloja karte

- **Sandbox ne može provjeriti NIJEDAN vanjski tile server** — čak ni
  `tile.opentopomap.org`/`tiles.maps.eox.at` (postojeći, uredno rade na
  telefonu) vraćaju `HTTP 000` odavde; `curl -sS "$HTTPS_PROXY/__agentproxy/
  status"` pokaže `connect_rejected` za SVAKI novi domen (allowlist je uzak i
  ne znači da servis ne radi). Jedini domen koji je do sada odgovarao je
  `elevation-tiles-prod.s3.amazonaws.com`. Zaključak: nemoguće je uživo
  potvrditi da je WMS layer-name/endpoint tačan prije nego korisnik proba na
  telefonu — zato svaki takav sloj mora imati graceful failure (postojeći
  `makeCachedTileLayer` već tretira pali fetch kao "prazna providna pločica",
  ne rušenje) i jasan komentar u kodu da endpoint treba terensku potvrdu.
  Umjesto uživo provjere, testirati END-TO-END kroz Playwright `page.route()`
  presretanje (mock 200 odgovor) — potvrđuje da app GRADI ispravan URL (bbox,
  layer-name, format), ne da server stvarno postoji.
- **Novi `TL[key]` ili `_OVL[key]` mora ući na SVA mjesta koja CLAUDE.md već
  navodi za postojeće slojeve** (`iconSvg` ×2, `map2id`/`map2row`, `_CMGR_ROWS`,
  `layer-opt` dugme) — ALI ako se KLJUČ ne mijenja (samo sadržaj ispod njega,
  kao kod WorldCover zamjene za Sentinel), sva ta mjesta koja čitaju ključ kao
  string ostaju netaknuta; mijenjaju se samo VIDLJIVI tekstovi (dugme, sub-
  labela) i `_CMGR_ROWS` red (id/name/cache/host). Provjeriti prije nego se
  ključ mijenja: da li je ijedan JS `const TL = {...}` blok definisan PRIJE
  keš-konstante koju referenciše (JS `const` nije hoistovan — vidi kako su
  `_WC_CACHE`/`CachedWCover` morali biti pomjereni ISPRED `const TL = {`).

## Poznate zamke (naučeno na stvarnim bugovima)

- **Tanka siva linija na granici pločica — WMS TILING SEAM na EFFIS sloju,
  ne baza karte** (v3.111.8): poslije v3.111.7 (koje je uklonilo DEBELE
  slomljene-slike linije) korisnik je i dalje prijavio TANJU sivu liniju.
  Umjesto da se nagađa peti put, korisnik je zamoljen da ISKLJUČI dodatne
  slojeve jedan po jedan — gašenje "Opožarene površine"/"Indeks opasnosti"
  (`_OVL.fwi`/`_OVL.opozareno`, oba idu na `maps.effis.emergency.copernicus.eu`)
  je linije ODMAH uklonilo. Ovo je DIREKTAN, empirijski dokaz izvora, ne
  Playwright pretpostavka — obje su OPCIONE, PODRAZUMIJEVANO ISKLJUČENE
  overlay kartice (`_ovlState.fwi/opozareno = false`), pa je "sve linije
  nestaju kad ih isključiš" bio i validan trenutni workaround.
  Uzrok: EFFIS/GWIS (GeoServer-baziran) renderuje SVAKU WMS GetMap pločicu
  NEZAVISNO — stilizovani (bojom klasifikovani) slojevi kao FWI ili konture
  opožarenih površina imaju anti-aliasing na ivici koji se ne poklapa sa
  susjednom, nezavisno renderovanom pločicom, čak i uz `transparent:true`.
  Pokušana popravka: dodat `tiled:true` u WMS parametre za oba sloja —
  GeoServer-ov standardni signal serveru da renderuje sa ISTIM tile-grid
  poravnanjem koje traži klijent (isti obrazac kao GeoServer WMS-C/gutter
  podešavanja). Nije bilo moguće potvrditi na stvarnom EFFIS serveru iz
  sandboxa — ako ni ovo ne pomogne, ostavljanje ova dva prekidača isključenim
  (već podrazumijevano stanje) je legitiman trajni workaround, jer izohipse/
  baza karte/ostali slojevi NISU pogođeni.
  poslije PRVOG reload-a** (v3.111.4): korisnik je tri puta zaredom prijavio
  ISTI render-bug (mreža linija na karti) poslije tri različite popravke
  (v3.111.1/v3.111.2/v3.111.3), svaki put "opet isto"/"i dalje ima" — iako je
  treća popravka (v3.111.3) provjereno bila ISPRAVNA i live na GitHub Pages
  (potvrđeno preko `actions_list`/`list_workflow_runs`: deploy je uspješno
  završen za tačan commit koji korisnik testira). Uzrok NIJE bio u popravci
  nego u SW auto-update mehanizmu: `sw-reloaded` je bio boolean koji se
  postavi na `'1'` NAKON PRVOG `controllerchange` i nikad se ne resetuje u
  toj sesiji taba — svaki SLJEDEĆI `controllerchange` (a njih ima tačno
  onoliko koliko je verzija objavljeno dok je tab otvoren) je tiho preskočen.
  Service worker ISPOD je i dalje uredno napredovao na najnoviju verziju, ali
  stranica U MEMORIJI (HTML/CSS/JS) je ostajala zaglavljena na verziji iz
  PRVOG reload-a — bez ijednog vidljivog znaka da postoji razlika, jer
  `showUpdateToast()` iskoči SAMO dok traje snimanje (GPS/trag/doznaka), ne i
  u ovom "tihom" putu. Rezultat: korisnik koji drži tab otvoren cijeli dan
  dok stižu popravke ostaje zauvijek jednu (ili više) verziju iza, i svaki
  test ispada "nije popravljeno" bez obzira koliko puta se stvarno popravi.
  Riješeno zamjenom booleana VREMENSKIM pragom (`sw-reloaded-at`, 5s) —
  sprječava pravu petlju (dva reload-a odmah jedan za drugim), ali dozvoljava
  SVAKI sljedeći reload kad su verzije razmaknute minutama/satima, što je
  stvarni obrazac rada na ovom projektu (više popravki u istoj sesiji).
  **Pouka**: kad se ista prijava ponovi i poslije popravke koja djeluje
  ispravno u kodu, PRIJE nagađanja o kodu provjeriti da li je popravka uopšte
  STIGLA do korisnika — `mcp__github__actions_list` (`list_workflow_runs` za
  `deploy.yml`) potvrđuje da li je deploy za taj tačan commit uspio, a ako
  jeste, sljedeća sumnja ide na SW/keš isporuku na klijentu, ne na sadržaj
  popravke.
- **Vidljiva mreža/šahovska tabla preko CIJELE karte, na SVAKOJ podlozi**
  (v3.111.2 → pravi uzrok nađen u v3.111.3): korisnik je prijavio linije "kao
  ispisani meridijani" — pravilna mreža vodoravnih i uspravnih linija preko
  cijelog ekrana, na SVIM podlogama UKLJUČUJUĆI offline SQLite/MBTiles karte
  (dakle nije mogao biti nijedan mrežni/WMS sloj — zajednički imenilac je bio
  LEAFLET-OV TILE RENDERING SAM PO SEBI, ne izvor pločica).
  - **v3.111.2 (NEDOVOLJNO)**: uklonjen `.leaflet-tile { image-rendering:
    pixelated }` — razumna prva pretpostavka (isključuje browser-ovo glačanje
    između pločica), ali korisnik je poslao screenshot i prijavio "opet isto"
    — mreža je i dalje bila tu.
  - **v3.111.3 (POTVRĐEN pravi uzrok)**: umjesto nagađanja treći put,
    napravljena je IZOLOVANA Playwright reprodukcija — lokalni Leaflet
    (postojeći `static/libs/leaflet.min.js`, isti fajl kao APK fallback) +
    stvarni `makeCachedTileLayer` izvučen iz `index.html` + stvarne CSS
    definicije, sa dvobojnim (crvena/plava) lažnim pločicama preko lokalnog
    HTTP servera i magenta pozadinom iza tile-pane (da se BILO KAKAV razmak
    vidi eksplicitno) — mjereno piksel-po-piksel dekodiranjem PNG-a (ne
    okom po screenshotu, koji chat-alat sam skalira i može UNIJETI lažne
    linije kompresijom/resize-om). Rezultat: 45 magenta piksela tačno na
    granici dvije pločice kad `.leaflet-tile-container` I `.leaflet-tile-pane`
    oba nose `will-change: transform` — svaka pločica se promoviše u ZASEBAN
    compositor layer, i bilinearno uzorkovanje na ivici te teksture pokupi
    providnu/pozadinsku boju umjesto susjedne pločice. Uklanjanjem
    `will-change` SA TA DVA SELEKTORA (ne i sa `.leaflet-map-pane`/
    `.leaflet-proxy`/`.leaflet-zoom-animated`, koji ostaju GPU-ubrzani za
    glatko panovanje/zumiranje) nestaje 0/9625 piksela na granici u istom
    testu, potvrđeno na DPR 1/2.75/3 i poslije simuliranog panovanja.
  - Pouka za sljedeći put: kad se render-bug ne da lako dijagnosticirati
    pogledom, a postoji LOKALNA kopija biblioteke (vidi `static/libs/`),
    napraviti izolovanu Playwright reprodukciju sa lažnim (kontrastnim)
    pločicama i PIKSELIMA, ne nagađati redom koji CSS red "izgleda sumnjivo"
    — druga pretpostavka (v3.111.2) je bila stvarna ali NEDOVOLJNA promjena,
    i bez piksel-tačne provjere bi treći pokušaj opet bio nagađanje.
  - **v3.111.4 (deploy provjeren, ali korisnik i dalje "opet isto")**: prije
    daljeg nagađanja provjereno preko `mcp__github__actions_list`
    (`list_workflow_runs` za `deploy.yml`) da je deploy za v3.111.3 stvarno
    uspio i da korisnik (potvrđeno preko broja verzije u Meniju) STVARNO
    gleda tu verziju — dakle popravka sa v3.111.3 JESTE live, a linije SU I
    DALJE tu. Ovo je važno razlikovati od ranijih "opet isto" javljanja gdje
    je uzrok bio isporuka (v. zamku "Više verzija zaredom u istoj kartici"
    gore), ne sadržaj popravke.
  - **v3.111.5 (i dalje NEPOTVRĐENO na stvarnom uređaju)**: pošto je izolovana
    Playwright reprodukcija (softverski renderovan Chromium bez pravog GPU-a)
    potvrdila da je `will-change` mehanizam uklonjen, a stvarni Android
    telefon i dalje pokazuje mrežu, zaključak je da REALAN GPU/drajver ima
    DODATNI ili DRUGAČIJI mehanizam koji sandbox ne može reprodukovati.
    Dodano: `backface-visibility:hidden` uklonjen i sa `.leaflet-tile` (i on
    je, nezavisno od will-change, poznat kao trigger za promociju u zaseban
    compositor layer na nekim GPU-ima), plus `outline:1px solid transparent`
    — poseban, dobro dokumentovan trik iz Leaflet zajednice (GitHub issue
    #3575) za hairline razmake koji dolaze od Blink layout sub-piksel
    zaokruživanja, DRUGAČIJI mehanizam od GPU compositor-slojeva riješenog u
    v3.111.3. Isključeno testom da GOOGLE MAPS na ISTOM telefonu NEMA ovaj
    problem — dakle nije hardver/ekran/OS-podešavanje, nego nešto specifično
    za Leaflet-ov raster-tile pristup (Google Maps koristi WebGL/vektorske
    pločice, ne DOM `<img>` rastere). Ako i OVO ne pomogne, sljedeći korak
    nije još jedna CSS pretpostavka nego drugačija dijagnostika (npr. screen
    recording sa terena, ili razmatranje da se ukloni blob-URL pristup u
    `createTile` u korist direktnog `img.src = url`, jer blob: URL-ovi na
    nekim Android Chrome verzijama dobijaju vlastitu compositor promociju
    NEZAVISNO od CSS-a, što bi objasnilo zašto sandbox (koji ne pravi tu
    promociju) ne vidi bug koji stvaran telefon vidi).
  - **v3.111.6 (drugačiji mehanizam, ne još jedna CSS pretpostavka)**: v3.111.5
    NIJE pomogao ("i dalje isto") — screenshot je i dalje pokazivao MALE
    "slomljene slike" ikonice (sivi kvadrat sa oblakom/planinom) u istim
    relativnim pozicijama kao u PRETHODNOM screenshotu, dosljedno kroz više
    javljanja. To je bio trag da problem NIJE kozmetički CSS razmak nego
    STVARNI gubitak sadržaja pločice. Uzrok pronađen u `createTile`: sve tri
    grane (mrežni uspjeh, keš pogodak, zamućeni roditelj-fallback) su zvale
    `URL.revokeObjectURL(u)` ODMAH na `img.onload` — razumno na prvi pogled
    ("slika je gotova"), ali Leaflet REUSE-uje `<img>` tile elemente
    (`keepBuffer`, zoom in pa out — vidi napomenu u kodu), pa prikazana
    pločica ostaje u DOM-u i van ekrana. Ako mobilni browser pod pritiskom
    memorije (uobičajeno na telefonu, rijetko na desktopu sa mnogo RAM-a)
    odluči da ODBACI dekodiranu bitmapu i kasnije je PONOVO dekodira iz
    `src`-a (npr. kad se pločica vrati u vidno polje ili promoviše u novi
    compositor layer), a blob URL je već revoke-ovan, dekodiranje TRAJNO
    puca — otud slomljena ikonica, i to specifično SPORADIČNO (zavisi koje
    su pločice trenutno van ekrana kad memorija zafali), što objašnjava zašto
    su iste ikonice viđene u istim OKVIRNIM pozicijama kroz više javljanja.
    Ovo je i objasnilo zašto NIJEDNA CSS izmjena (v3.111.2/.3/.5) nije
    pomogla — uzrok nije bio kompozitorski razmak nego stvaran gubitak
    slikovnih podataka. Riješeno: blob URL se čuva na `img._blobUrl` i
    revoke-uje se TEK na `tileunload` (kad Leaflet stvarno napusti pločicu,
    van `keepBuffer` opsega) ili kad se ISTOM img elementu dodijeli NOVI blob
    (retry), preko `setSrc()` helpera — nikad prije. Test:
    `tests/js/tile-bloburl.test.js`, izvlači stvarni `makeCachedTileLayer` i
    provjerava da revoke NIKAD ne prethodi tileunload-u/zamjeni, i da retry
    ne curi memoriju (stari blob se ipak revoke-uje, samo kasnije).
    **Zamka pri pisanju OVOG testa**: testovi mutiraju STVARNE Node globals
    (`global.URL`/`fetch`/`caches`/`document`) jer je to ono što
    `makeCachedTileLayer` referencira — obrazac "pokreni sve testove pa čekaj
    na kraju" (koji koriste drugi test fajlovi sa `new Function` sandbox-om
    za PRAVU izolaciju) bi ovdje značio da kasniji test svojim `makeEnv()`
    pozivom prepiše globals dok je raniji test još u letu — testovi ovdje
    zato idu striktno redom, svaki čeka svoj kraj prije sljedećeg.
- **Odgovor 200 OK koji NIJE slika = slomljena pločica = siva MREŽA preko
  karte** (v3.111.7 — konačan uzrok mreže linija, poslije pet promašenih
  pokušaja): ključni trag je bio POLOŽAJ malih "slomljena slika" ikonica na
  korisnikovim screenshot-ovima — one su tačno u GORNJEM LIJEVOM UGLU svake
  ćelije mreže, a razmak ćelija je (uz DPR uređaja) tačno 256 CSS px. Dakle
  linije NISU spojevi pločica podloge (kako su pretpostavljale sve CSS
  popravke v3.111.2/.3/.5), nego IVICE SLOMLJENIH SLIKA jednog sloja PREKO
  karte: browser za `<img>` čiji se sadržaj ne može dekodirati crta ikonu
  slomljene slike u gornjem lijevom uglu i vidljivu kutiju — 256px do 256px
  = mreža preko cijelog ekrana. Zato se vidjelo na SVAKOJ podlozi (uklj.
  offline MBTiles) — jer je krivac bio OVERLAY iznad njih, a ne podloga.
  - Uzrok u `createTile`: svaki `r.ok` odgovor je tretiran kao slika. WMS
    server sa POGREŠNIM imenom sloja/endpointom klasično vraća **200 OK sa
    XML ServiceException** (ne 404!) — a EFFIS (`_OVL.fwi`/`_OVL.opozareno`)
    i WorldCover su upravo takvi, NIKAD PROVJERENI endpointi (CLAUDE.md to
    izričito piše od v3.103.0). Taj XML je pretvaran u blob, upisivan u KEŠ
    i dodjeljivan `img.src` → slomljena slika po pločici, i to TRAJNO jer se
    otrovan zapis servirao iz keša i offline. `_ovlState` se čuva u
    localStorage i vraća pri svakom pokretanju → problem "uvijek tu".
  - Popravka: `jeSlika(r)` provjerava `Content-Type` prije nego odgovor
    postane slika (prazan CT se DOPUŠTA — neki tile serveri ga ne šalju, a
    pogrešan sadržaj u praksi uvijek dolazi kao text/xml ili text/html);
    ne-slika se ne kešira i ne postaje `img.src`. Keš se usput ČISTI: zapis
    koji nije slika se briše pri prvom nailasku (otrovani zapisi upisani
    starijim verzijama nestaju sami).
  - Uz to: `_wbTileLayer` (Vremenska traka) je konstruisan sa PRAZNIM URL
    predloškom dok korisnik ne izabere datum — `fetch('')` dohvata SAMU
    STRANICU (HTML, 200 OK!), što bi kroz isti put dalo istu slomljenu
    mrežu. Sad `createTile` odmah odustane ako je URL prazan.
  - **Pouka**: kad se render-bug opire CSS popravkama, pogledati DA LI ima
    ikonica slomljene slike i GDJE su — položaj (gornji lijevi ugao ćelije)
    i razmak (256 CSS px) odmah razlikuju "spoj pločica" od "pločica čiji
    sadržaj nije slika". I: nikad ne pretpostaviti da je `r.ok` ⇒ slika.
  - Test: `tests/js/tile-bloburl.test.js` (XML/HTML odgovor se odbija, prazan
    Content-Type se dopušta, otrovan keš zapis se briše, prazan URL ne dira
    mrežu).
- **"Script error." bez linije/poruke = maskirana cross-origin greška**
  (v3.111.1): korisnik je na webapp-u (browseru) prijavio crveni baner "JS
  GREŠKA: Script error. (linija 0)" odmah pri otvaranju. `window.onerror`
  prima `message='Script error.'` i `lineno=0` (bez pravog fajla/linije/poruke)
  kad greška nastane UNUTAR `<script src="...">` sa DRUGOG porijekla
  (cdnjs.cloudflare.com/cdn.jsdelivr.net za Leaflet/proj4/Turf/Supabase/
  Shapefile) BEZ `crossorigin="anonymous"` atributa — ovo je namjerno
  sigurnosno ponašanje browsera (sprječava curenje sadržaja tuđeg skripta), ne
  bug u app-u. Postojeći `_libErr`/`onerror="..."` na tim `<script>` tagovima
  hvata samo MREŽNI neuspjeh učitavanja (404, prekinuta konekcija) i tad pada
  na lokalni `appassets.androidplatform.net` fallback (radi SAMO u APK-u, ne
  na webapp-u) — ne hvata grešku KOJA SE DESI DOK se već preuzeta biblioteka
  izvršava (npr. djelimično/oštećeno preuzimanje na slaboj vezi koje browser
  ipak tretira kao "uspješno učitano"). Ta druga vrsta greške ide na
  `window.onerror`, i bez `crossorigin` atributa detalji su POTPUNO skriveni —
  ni iz konzole na terenu se ne bi vidjelo ništa korisno. Dodano: svih 5 CDN
  `<script>` tagova sada ima `crossorigin="anonymous"` (cdnjs/jsdelivr su
  standardni javni CDN-ovi dizajnirani baš za ovo, isti obrazac kao SRI —
  siguran, dobro dokumentovan zahtjev, za razliku od institucionalnih API-ja
  poput FIRMS/GFW/EFFIS koji NISU pravljeni za proizvoljno cross-origin
  učitavanje) — sljedeći put će `window.onerror` dobiti STVARNU poruku/liniju.
  `window.onerror` handler uz to sad prepoznaje baš OVAJ obrazac
  (`m==='Script error.' && !l`) i dodaje kratko objašnjenje ("vjerovatno
  prekinuto učitavanje eksterne biblioteke... Osvježi stranicu") umjesto da
  ostavi korisnika sa neupotrebljivim sirovim tekstom — isti princip kao
  `_poziGreskaTxt` za mrežne greške u Požarima. Nije bilo moguće reproducirati
  iz sandboxa (ni CDN ni `appassets.androidplatform.net` nisu dostižni odavde,
  Playwright reprodukcija je pokazala SAMO artefakte sandbox mrežnog
  ograničenja, ne stvaran uzrok) — ako se ponovi, sljedeći baner će reći
  TAČNO koja biblioteka i koja linija.
  - **v3.112.1**: korisnik je ponovo prijavio isti baner i isključio VPN da
    testira — desilo se opet, pa VPN NIJE (jedini) uzrok. Na eksplicitan
    zahtjev ("neka bude u konzoli a ne ovdje") crveni baner preko cijelog
    ekrana je uklonjen — `window.onerror` sad samo zove `console.error(...)`
    (ista poruka/objašnjenje, samo bez UI prekida). Terenski test na uređaju
    bez pristupa DevTools-u ovo neće moći vidjeti, ali korisnik je eksplicitno
    tražio da mu prestane smetati u polju; dijagnoza ostaje moguća naknadno
    preko USB debugginga ili `remote://inspect` ako se ponovi.
- **Android WebView nema `window.Notification`** (v3.107.1): korisnik je na
  STVARNOM telefonu, pri uključivanju "Javi mi kad se pojavi nov požar", dobio
  "Ovaj uređaj ne podržava obavještenja". Uzrok: `'Notification' in window`
  je `false` na mnogim OEM WebView verzijama — JS Notifications API (`new
  Notification(...)`) tu jednostavno nije implementiran, ISTA zamka koja je
  već davno riješena za GPS snimanje (`GpsService` u Javi koristi
  `NotificationManager` direktno, ne ide kroz `window.Notification`). Rasterski
  reflex "znači notifikacije ne rade u WebView-u" bio bi pogrešan — Android
  sasvim normalno prikazuje prave notifikacije, samo ne kroz TAJ JS API.
  Rješenje je isti obrazac kao `AndroidGps`/`AndroidNet`: nova native klasa
  `MainActivity.AppNotifBridge` (`webView.addJavascriptInterface(...,
  "AndroidNotif")`) sa `NotificationManagerCompat` + vlastitim kanalom
  (`IMPORTANCE_HIGH`, za razliku od GPS-ovog `IMPORTANCE_LOW` — upozorenje na
  požar MORA upasti u oči, GPS snimanje je namjerno tiho). JS strana
  (`_poziNotifNativnoDostupan`/`_poziNotifToggle`/`_poziNotifProvjeri`) prvo
  proba `AndroidNotif.show(naslov, tijelo)`, i SAMO ako mosta nema (webapp na
  GitHub Pages) pada na stari `window.Notification` put. `POST_NOTIFICATIONS`
  dozvola se već traži pri prvom pokretanju app-a (`requestPermissions()`),
  pa native put ne mora ništa dodatno pitati. **Traži pun rebuild u Android
  Studiju** (mijenjan `.java`). Test: `tests/js/pozari.test.js` (mock
  `AndroidNotif`, provjera da web `Notification`/service worker put NIJE
  dotaknut kad je native dostupan — SW poziv namjerno baca u testu ako se
  ipak pozove).


- **WebView JS dijalozi**: `MainActivity` ima override za `onJsAlert` i
  `onJsConfirm` (naslov = ime app-a). `onJsPrompt` NIJE override-ovan — za
  unos teksta koristi postojeći `_dlgPrompt`/`_dlgConfirm` (HTML dijalozi u
  index.html), ne native `prompt()`.
- **`WebView.onPause()` pauzira geolocation** — `MainActivity.onPause()` ga
  namjerno PRESKAČE dok traje snimanje (`isRecordingActive` preko GpsBridge).
  Ne "popravljati" to nazad; bez toga pozadinsko snimanje umire.
- **`LOAD_CACHE_ELSE_NETWORK` nikad ne koristiti** — servira ustajale Supabase
  odgovore i offline i online. Cache mode je `LOAD_DEFAULT` + Supabase klijent
  ima `cache:'no-store'` fetch. Ne dirati ni jedno ni drugo.
- **Pokretanje je OFFLINE-FIRST — nikad ne čekati mrežu da se odluči šta
  prikazati** (v3.100.0). Ovo je najčešće prijavljivan bug s terena, vraćao se
  u više oblika: login ekran preko uredno prijavljenog korisnika na slabom
  signalu. Uzrok je uvijek isti obrazac: `navigator.onLine` na terenu laže
  `true` na mrtvoj vezi (OS-S4), pa mrežni poziv ne padne nego **VISI** — a
  startup logika koja čeka njegov ishod stoji s njim. Pravilo: ako postoji
  keširani profil (`_OL.PROFILE`), `initAuth()` ulazi u app **odmah**
  (`showApp()`), a prava Supabase sesija se dohvaća tiho u pozadini
  (`_upgradeToOnlineSession()`). Iz toga slijedi:
  - `_appEntered` se postavlja na **jednom jedinom mjestu** — u `showApp()`,
    tek POSLIJE gate-a odobrenja. Nijedna auth putanja ne smije dizati login
    ekran ni zvati `showApp()` drugi put kad je ta zastavica `true` (drugi
    poziv = dupli restore svih slojeva karte).
  - `sbUser` iz keša nosi `_cachedStub: true` — po tome se zna da prava sesija
    još nije dobijena. Svaka provjera "imamo li sesiju" mora glasiti
    `sbUser && !sbUser._cachedStub`, ne samo `sbUser`.
  - Tajmer-sigurnosne mreže (npr. onaj koji forsira login ako se ništa ne
    prikaže) moraju biti **sporije** od najsporijeg legitimnog offline puta —
    inače baš one izazovu bug koji treba spriječiti (bio 2000ms vs legitimnih
    4500ms → v3.99.3).
  - Testovi: `tests/js/auth-offline-first.test.js` izvlači STVARNI `initAuth`
    iz `index.html` i pušta ga nad mockovima (mreža koja visi, opoziv pristupa,
    nema keša...). Pokrenuti ga pri svakoj izmjeni auth/startup toka.
- **Sigurnosna mreža više NE vodi na login (v3.117.0)** — zadnji preostali put
  kojim se login ekran mogao pojaviti bez signala. Tajmer na 6 s postoji da
  korisnik ne ostane na praznom ekranu ako `initAuth()` nikad ništa ne odluči,
  ali je bezuslovno dizao login. Podizanje praga (2000→6000 ms u v3.99.3) je
  smanjilo vjerovatnoću, **ali nije uklonilo uzrok**: dovoljno je da initAuth
  zbog sporog uređaja, hladnog starta WebView-a ili greške ne stigne do svoje
  grane u roku, i korisnik sa savršeno ispravnim keširanim profilom dobije
  login preko sebe. **Nijedan rok nije dovoljno velik da to garantovano ne
  dođe** — zato se rok više i ne pokušava "dobro podesiti".
  - Novi red prioriteta u tajmeru: već u app-u (`_appEntered`) → ne diraj
    ekran; postoji keširani profil → pusti ga UNUTRA offline; login **samo**
    ako se nemamo na šta osloniti.
  - `_ulazNaKesu()` je JEDNO mjesto za ulazak na kešu — koriste ga i sigurnosna
    mreža i `goOfflineOrLogin` u `initAuth`. Ranije je svaka putanja ponavljala
    isti niz koraka (stub korisnik, profil, `_setOfflineMode`, `showApp`) pa su
    se lako razilazile: jedna bi zaboravila `_cachedStub`, druga offline oznaku.
  - Keš se čita SVAKI put iznova, ne prima kao zapamćena vrijednost — pozivaoci
    su razmaknuti sekundama, a profil je u međuvremenu mogao biti osvježen.
  - Profil bez `id` se NE prihvata (korumpiran keš ne smije "otključati" app).
  - Tajmer je u `<script>` bloku 4, a `_appEntered`/`_ulazNaKesu` u bloku 5 —
    radi jer klasične skripte dijele isti globalni leksički opseg, ali su
    pozivi svejedno pod `typeof` provjerom i `try/catch` (blok 5 teoretski može
    ne izvršiti se).
  - `_provjeriOpozivOdobrenja` je usput dobio `_withTimeout(..., 8000)` —
    Supabase poziv bez roka na mrtvoj vezi VISI zauvijek, a kako se
    `_lastOdobrenCheck` postavlja PRIJE poziva, provjera bi prestala raditi do
    sljedećeg pokretanja.
  - Testovi: 7 novih u `tests/js/auth-offline-first.test.js` (15 ukupno),
    **provjereno da padaju na starom kodu**.
- **Autofill na dijeljenim uređajima**: login polja imaju `autocomplete="off"`
  i PIN se NE pre-popunjava — sprječava prijavu pod tuđim nalogom.
- **Sintaks-checker** (regex nad `<script>` blokovima) se zbuni ako komentar
  sadrži doslovno `<script>` — u komentarima pisati "JS blok".
- **Canvas pane iznad drugog "pojede" sve klikove** (v3.101.0): karta je
  `preferCanvas:true`, a svaki Leaflet canvas renderer je JEDAN `<canvas>` preko
  CIJELE karte koji sam hvata DOM klik pa tek onda traži svoj sloj pod prstom.
  Uvezeni KML/SHP se crta u podrazumijevanom canvas-u (`overlayPane`, z-index
  400), vlake u svom (`_vlakeRenderer`, pane `vlakeLines`, **također 400** ali
  kasnije u DOM-u = iznad). Čim u projektu postoji makar JEDNA vlaka — bilo gdje
  na svijetu, geometrija nije bitna — gornji canvas pokupi svaki klik i
  `layer.on('click')` na KML sloju nikad ne opali: uvezeni KML izgleda "mrtav"
  (hover tooltip radi, klik ne radi). Isto važi za `tragMsrLines` (410) čim se
  nacrta trag/izmjera. Zato vlake odavno imaju proximity fallback u
  `map.on('click')`, a od v3.101.0 ga ima i KML (`_kmlHitTest` → `_kmlOpenPopup`,
  koristi Leafletov `_containsPoint` gdje postoji + piksel-tolerancije za prst).
  **Novi interaktivni canvas pane = novi sloj koji krade klikove svemu ispod** —
  ili mu daj vlastiti fallback, ili ga ne pravi. Test:
  `tests/js/kml-click.test.js` (izvlači STVARNI `_kmlHitTest` iz index.html).
- **Pokretanje dira DOM koji JOŠ NE POSTOJI** (v3.102.2) — najskuplja posljedica
  offline-first ulaza. `showApp()` se iz keširanog profila zove ODMAH, dok se
  tijelo dokumenta još parsira: skripta ide do ~33857. linije, a `#mjtrg-panel`
  je u markupu tek na ~35138. `switchTab('karta')` je taj element čitao bez
  provjere → `TypeError`, a `showApp()` nije imao `try/catch` — pa se SVE ispod
  te linije preskakalo: `sqlmapRestoreAll` (offline SQLite karte),
  `_localKmlRestore`, `_restoreTacke`, `_restoreFotos`, `_tragRegLoad`,
  `_msrRegLoad`, `_refRepoLoad`, `_temRestore`, `_kmlcInit`, `loadProj`,
  `sbInitData`, `_processOfflineQueue`. Korisnik je to prijavio kao "ponekad ne
  mogu aktivirati učitane karte" — karte su bile uredno na uređaju, samo ih
  niko nije pokupio. Izmjereno nad stvarnim pokretanjem: stari kod obnovi **0**
  sačuvanih KML slojeva, novi **1**. Pravila koja iz toga slijede:
  - Sav startup rad koji dira DOM ide kroz **`_startupRestore()`** — čeka
    `DOMContentLoaded` ako `document.readyState === 'loading'`, idempotentan je,
    i **svaki korak ima vlastiti `try/catch`** (pad jednog ne obara ostale).
  - Novi korak obnove se dodaje SAMO tamo, kroz `korak('ime', () => …)`.
  - Funkcije koje se zovu pri pokretanju ne smiju čitati `.style` elementa bez
    provjere postojanja — pola panela u `switchTab` je tu provjeru već imalo,
    pola nije.
  - Test: `tests/js/startup-restore.test.js` (7 testova; nad starim kodom pada 6).
- **Offline karta se NIKAD ne briše sama** (v3.102.2): `_sqlCrashCheck` je poslije
  3 prekinuta učitavanja TRAJNO brisao SQLite kartu (IDB + OPFS). Ali marker
  "učitavam" ostaje i kad app ubije OEM battery manager, kad korisnik zatvori
  app usred učitavanja ili kad ponestane RAM-a — ništa od toga ne znači da je
  karta neispravna, a brisao se fajl od više stotina MB koji offline nema odakle
  vratiti. Sada se karta samo isključi iz AUTOMATSKOG učitavanja
  (`tvlake_sqlmap_skip_autoload`), vidi se u listi offline karata i vraća
  dugmetom "Pokušaj ponovo" (`sqlmapRetryOne`).
- **Karta ne smije ostati bez podloge**: `_restoreLastMap` namjerno preskoči tile
  sloj kad je zadnja aktivna bila SQLite (da nema bljeska Topo-a) i računa na
  `sqlmapRestoreAll`. Ako taj restore ne uspije, bez `_sqlEnsureBaseLayer()`
  ostaje siva praznina i prazna lista karata — nema se šta ni aktivirati.
- **Dvije funkcije istog imena — zadnja tiho pobjeđuje** (v3.102.1): fajl ima
  ~1430 `function` deklaracija u jednom `<script>` bloku; deklaracije se
  hoistuju pa kasnija bez ikakve greške zamijeni raniju. Tako je string-verzija
  `_hexToRgb` (vraća `"r,g,b"` za `rgba()`) gazila niz-verziju (`[r,g,b]`), pa
  je `const [r,g,b] = _hexToRgb(c)` destrukturirao PRVA TRI ZNAKA stringa i
  `_gradeColor` je vraćao boje tipa `#0aNaN34`. **Canvas neispravnu boju ne
  prijavi nego je tiho ignoriše i zadrži prethodnu** — segmenti "Analize
  nagiba" su dobijali boju nasumične druge vlake, bez ijedne poruke u konzoli.
  Sad su to `_hexToRgb` (niz) i `_hexToRgbCsv` (string). Test
  `tests/js/boje-nagiba.test.js` čuva i skalu boja i pravilo "nijedno ime
  funkcije se ne smije pojaviti dva puta".
- **Mrežni poziv bez roka na terenu VISI, ne pada** (v3.102.1): `navigator
  .onLine` laže `true` na mrtvoj vezi (OS-S4), pa `await fetch(...)` bez
  `signal` nikad ne završi — "Profil" se otvori i ostane prazan zauvijek
  (izmjereno: stari kod visi i poslije 20 s, novi vrati `null` za 12 s i
  pređe na DEM fallback). Za svaki poziv van uređaja koristiti `_fetchT(url,
  ms, opts)`; catch/fallback grane koje već postoje onda rade svoj posao.
  Za Supabase pozive (nisu `fetch()`, nemaju `signal`) koristiti `_withTimeout
  (promise, ms)` — isti razlog, npr. periodični sync na 60s (`sb.auth.getSession()`).
- **Tab labela mora odgovarati sadržaju, sadržaj se ne premješta radi labele**
  (v3.102.3): "Postavke" tab je nekad zvučao kao opšta prikazna podešavanja, a
  sadržavao je samo admin email obavještenja o registraciji — preimenovan u
  "Obavještenja". NIJE premješteno obratno (stil linija/boje vlaka iz Projekat
  taba tamo) jer je taj tab vidljiv **samo adminu** (`isAdm` gate) — premještanje
  bi svakodnevne alate sakrilo od svih projektanata koji nisu admin. Prije
  premještanja bilo čega u tab, provjeriti ko ga uopšte vidi.
- **Panel taba bez zadane širine se na telefonu ne raširi** (v3.102.1):
  paneli su flex-djeca `#main`-a; bez pravila šire se koliko im sadržaj traži,
  pa je ispadalo nasumično (Korisnici 305px, Tragovi 341px, a pored njih virio
  komad karte). Svaki NOVI tab-panel mora ući u `@media (max-width:580px)`
  pravilo za punu širinu. Pažnja: pravilo mora biti **iza** definicije samog
  `#id`-a u fajlu — inače ga ta kasnija definicija (iste specifičnosti)
  pregazi, što se i desilo `#doznaka-panel`-u.
- **Pozicija u DOM-u NIJE indeks u nizu** (v3.102.0): lista vlaka se crta
  sortirano i hijerarhijski (`rootVlake` sort + `renderWithChildren` gura
  krakove ispod roditelja), a `vlake[]` je redoslijed nastanka/dolaska sa
  servera — poklope se samo slučajno. `selI()` je ranije tražio red po poziciji
  (`idx === i`) pa je označavao SUSJEDNU vlaku: korisnik vidi istaknuto "T1.1",
  a `actI` (Uredi/Briši/Dodaj tačku) radi nad "T1". Sada svaki red nosi
  `data-vi` i traži se `#vl .vrow[data-vi="N"]`. **Svaka nova lista koja se
  sortira ili grupiše mora nositi indeks na elementu** — nikad ne vezivati
  podatak za redni broj u DOM-u. Test: `tests/js/vlake-list.test.js`.
- **DOM polje nije baza podataka** (v3.102.0): `_projPovrsinaHa()` je površinu
  čitao ISKLJUČIVO iz skrivenog `#p-povrsina`, koje puni samo
  `_applyProjektFields` (aktiviranje projekta). Kad se do aktivnog projekta
  dođe drugim putem (obnova iz keša pri pokretanju, realtime izmjena s drugog
  uređaja, aktivacija iz modala nadzora), polje ostane prazno pa su "Površina",
  "Gustoća mreže" i m/ha bedž pokazivali "—" iznad kartice na kojoj piše
  42.50 ha. Izvor istine je zapis u `_projekti`, DOM polje je samo prikaz.
- **UI keševi nisu izvor istine**: `_dozVlakeIdxs` i slični nizovi indeksa su
  samo za prikaz liste — svaka analiza/izračun mora raditi svjež filter nad
  `vlake[]` (bug "Osvježi analizu ne vidi nove vlake").
- **Trajne UI postavke** idu u localStorage sa `tvlake_` prefiksom (postojeći:
  `tvlake_doz_hidden_odjeli`, `tvlake_doz_boundary_style`,
  `tvlake_doz_trees_style`, `tvlake_doz_trees_data`) — isti obrazac
  get/set + restore pri otvaranju panela.
- **Splash/drawable resursi**: bitmap u density-generičkom `drawable/` folderu
  se crta u "px kao dp" veličini — fiksirati prikaznu veličinu u layer-list
  XML-u (`android:width/height`), ne oslanjati se na veličinu PNG-a.
- **Adaptivna ikonica aplikacije** (`mipmap-*/ic_launcher_foreground.png`):
  sadržaj MORA stati unutar "safe zone" kruga (dijagonala okvira crteža ≤ 61%
  platna, idealno ≤ 60% zbog margine) — inače je različiti launcheri (krug/
  skvirkl/zaobljeni kvadrat) sijeku nekonzistentno, izgleda drugačije na
  različitim telefonima. Pozadina ide isključivo kroz `ic_launcher_background`
  boju u `values/colors.xml` (trenutno bijela) — foreground PNG ne smije imati
  pozadinu popunjenu do ivice, samo providan crtež. Izvor grafike:
  `drawable/splash_logo.png` (zeleni crtež na bijeloj kartici, providna
  pozadina) — od njega se izvlači sam "ink" (linija crteža), ne od starog
  `ic_launcher_foreground.png` (imao je zelenu popunjenu do ruba, bez marže —
  otud "zelen vrh/bjelkasto dno" izgled na nekim telefonima, popravljeno u
  v3.81.0). Legacy `ic_launcher.png`/`ic_launcher_round.png` (fallback za
  starije launchere) su odvojeno generisani flattened PNG-ovi (bijela
  pozadina + centriran crtež), ne oslanjaju se na OS maskiranje.
  Od v3.91.0 se crtež izvlači SAMO iz gornjeg dijela splash_logo.png (satelit +
  krug + jelke), BEZ dvoreda teksta ispod — puni grb sa tekstom je na 48dp
  (stvarna veličina ikonice na telefonu) bio nečitljiv, čitao se kao mutna
  mrlja. Tekst ostaje na splash ekranu (drawable/splash_logo.png se ne mijenja,
  koristi se samo dio njegovog sadržaja za mipmap ikonice), gubi se samo sa
  ikonice na početnom ekranu.
- **v3.92.0 "Dendro Map" rebrend — nova ikonica i login logo**: korisnik je
  dao gotovu grafiku `docs/DENDRO_MAP_source.jpg` (2816×1536 mockup: zlatni
  grb — kompas/planine/jelka/pin/valovi — na tamnozelenoj zaobljenoj kartici,
  natpis "DENDRO MAP" + "ŠPD Unsko sanske šume d.o.o." ispod) i tražio da to
  postane i app ikonica i slika na login ekranu. Postupak (ponoviti isto ako
  se master grafika ponovo mijenja):
  - Grb (bez teksta, bez kartice/border-a) izvučen iz mockupa preko
    `scipy.ndimage.label` connected-component analize nad "gold" maskom
    (prag boje), NE prostim bounding-box crop-om — mockup ima svoj zlatni
    border oko kartice koji bi automatski pravougaoni crop pokupio zajedno s
    grbom. Border je jedna velika povezana komponenta (obuhvata skoro cijelu
    karticu) — izbaci se po labelu; sitni ostaci (< 150px, npr. antialiasing
    fragment gornjeg ruba border-a) izbace se i filterom po veličini
    komponente. Rezultat: providan PNG, samo "ink" (isti princip kao ranije
    za splash_logo.png, ovdje automatizovano jer izvor NIJE bio čist crtež na
    jednobojnoj pozadini nego prezentacijski mockup s bordurom i tekstom).
  - `ic_launcher_background` promijenjen sa bijele (`#FFFFFF`, v3.81.0) na
    `#42523C` — tamnozelena uzorkovana medijanom piksela iz praznine između
    grba i teksta na mockupu (`np.median`, ne mean — paper-texture zrnavost u
    JPEG-u vuče mean previsoko). Namjerna promjena: novi brend je DIZAJNIRAN
    kao zlatno na tamnozelenom, bijela pozadina bi to osiromašila. Safe-zone
    pravilo (≤ 60% dijagonale) i "bez teksta na ikonici" pravilo iz v3.81.0/
    v3.91.0 i dalje važe nepromijenjeno — samo se boja pozadine i sam crtež
    mijenjaju.
  - `icon-192.png`/`icon-512.png` (PWA manifest, `sw.js` notifikacije) su isto
    regenerisani iz istog grba/boje radi konzistentnosti — inače bi Android
    notifikacija (koristi `icon-192.png`) i home-screen ikonica pokazivale
    različit brend.
  - Login logo (`index.html`, `.auth-logo-box img`, inline
    `data:image/jpeg;base64,...`) zamijenjen punim lockup-om (grb + oba reda
    teksta), izrezanim direktno iz mockupa uz malu marginu oko zlatnog
    border-a kartice — na login ekranu (veći prikaz, 115px) tekst je čitljiv
    pa se ne izbacuje kao kod ikonice. Ovo je JEDINO mjesto u `index.html` s
    `src="data:image/jpeg;base64,"` — sigurno za regex/string zamjenu bez
    parsiranja HTML-a.
  - `drawable/splash_logo.png` (nativni Android splash prije nego se WebView
    učita) i `colorSplash` (`#376638`) NISU dirani — korisnik je tražio samo
    "ikonu aplikacije i početnu sliku kod logina", što je login-ekran logo,
    ne native splash. Ako se i splash treba rebrendirati, to je odvojena,
    eksplicitno tražena izmjena.
- **Neodobrena registracija ističe za 7 dana** (`20260730_isticanje_
  registracije.sql`) — automatski se briše (korisnici + auth.users) ako admin
  ne odobri na vrijeme. Kolona `prvo_odobren_at` (nikad se ne resetuje nazad na
  NULL) razlikuje "čeka PRVO odobrenje" (briše se) od "opozvan nakon što je
  ranije bio odobren" (NE briše se) — obje imaju `odobren=false`, pa **nikad
  ne filtrirati čišćenje samo po `odobren`**, uvijek i po `prvo_odobren_at IS
  NULL`. Nema pg_cron-a (projekat namjerno bez CI/scheduled infrastrukture) —
  čišćenje se okida iz `admin_get_all_users()` (svaki put kad admin otvori tab
  Korisnici) i iz `check_own_pending_expiry()` (svaki put kad korisnik na
  ekranu "Čeka se odobrenje" klikne "Provjeri ponovo").
- **Ikonice glavne trake** (`#tab-bar`, Meni + 7 tabova) su od v3.83.0 crtane
  inline SVG (`.tbi` CSS klasa), ne emoji — emoji izgleda različito na svakom
  OEM-u/verziji Androida, nekad i kao prazan kvadratić. `stroke="currentColor"`
  znači da ikonica prati boju dugmeta identično tekstu (zelena pri aktivnom
  tabu preko `.tab-btn.active`, ili trajna amber/ljubičasta/zelena za
  Korisnici/Postavke/Teren preko inline `style="color:..."`) — **ne** hardkodovati
  boju u SVG-u, pokvario bi se taj mehanizam. Veličina je `em`, ne `px` — prati
  `font-size` dugmeta pa automatski postaje manja na mobilnom breakpointu bez
  posebne media-query grane. Emoji verzija (za vraćanje ako ustreba):
  `docs/BACKUP_traka_ikonice_emoji.md`.
- **Ikonice dugmadi u panelima** (v3.84.0): isti razlog i isti mehanizam, ali
  preko **SVG sprite-a** odmah iza `<body>` (65 `<symbol id="ic-...">`), pa se
  koristi `<svg class="ic"><use href="#ic-NAZIV"/></svg>`. Zamijenjeno je 398
  mjesta unutar `<button>` elemenata; emoji u toastovima, dijalozima i
  naslovima sekcija je NAMJERNO ostao. **SVG u dugmadima ne smije imati
  jednostruke navodnike ni backtick** — dio dugmadi se gradi u JS stringovima
  (`'...'` / `` `...` ``), pa bi ih to prekinulo; sve definicije koriste samo
  dvostruke navodnike. Mapiranje emoji→ikonica i postupak vraćanja:
  `docs/BACKUP_ikonice_dugmadi.md`.
- **Ikonica koja se čita iz mape/objekta (`neka_mapa[key]`) je automatska
  provjera preskočila** — lovila je samo doslovne `'...'` stringove sa emojijem,
  ne i indirektne lookup-e. Baš zbog toga je dugme za promjenu podloge karte
  (`layer-switch-btn`, `setLayer()` u index.html) gubilo ikonicu i vraćalo se na
  emoji čim korisnik izabere Topo/Satelit/Karta/Google — popravljeno u v3.91.0
  (`iconSvg[key]` umjesto starog `icons[key]` + `textContent`). Kod dodavanja
  NOVOG tile sloja u `TL` objektu, novi ključ mora ući i u `iconSvg` (dva mjesta:
  startup restore + `setLayer()`) i u `map2id`/`map2row`/`_CMGR_ROWS`, inače mu
  aktivni highlight, MB bedž ili offline keš pregled tiho ne rade.
- **Pristup firme se provjerava NA SERVERU, ne u JS-u**: od
  `20260727_pristup_odobrenje.sql` postoji `je_odobren()` (admin je implicitno
  odobren) i **RESTRICTIVE** politika `zzz_odobren` na svim tabelama s
  podacima. Restrictive politike se I-uju s postojećim permissive politikama,
  pa se nova tabela štiti dodavanjem te politike — **ne** prepisivanjem
  postojećih. `SECURITY DEFINER` funkcije zaobilaze RLS, pa svaka nova mora
  **sama** pozvati `je_odobren()` na početku. Gate u `showApp()` je samo UX.
- **`korisnici` ima trigger `korisnici_zastita`**: RLS ne zna ograničiti
  kolonu, pa se `odobren`/`is_admin`/`je_vodeci`/`sumarija`/`login_email`/`id`
  vraćaju na staru vrijednost pri UPDATE-u i prisilno gase pri INSERT-u (osim
  za admina i service_role). Zato **nikad ne pisati u TUĐI red `korisnici`** iz
  klijenta — to je nekad radio backfill boje kolega i baš zbog njega je tabela
  morala imati široku UPDATE politiku (= svako se mogao sam promovisati u
  admina). Boja bez zapisa se računa iz `_bojaZaId(id)`.
- **Uloge se ne izvode iz imena**: "vodeći projektant" je kolona
  `korisnici.je_vodeci` (postavlja je samo admin preko `admin_set_vodeci`).
  Regex nad imenom postoji još samo kao fallback za keš od prije migracije.
- **Nove kolone u upitima na `korisnici`**: koristiti `select('*')`, ne
  nabrajanje — migracije se pokreću ručno, pa eksplicitno traženje kolone koja
  još ne postoji obori cijeli upit (PostgREST vraća grešku).
- **GPS snimanje prekinuto telefonskim pozivom (ili sličnim)**: WebView-
  preživljavanje + native GPS bafer (`GpsService`, vidi `_drainNativeGpsBuffer`
  u index.html) štite od Activity-only uništenja (swipe iz recent apps), ali
  NE od OEM "battery manager"-a (Xiaomi/Samsung/Huawei i sl.) koji ubiju
  CIJELI proces — foreground servis i sve — kad procijene da app treba stati,
  klasično baš kad stigne poziv. Jedina prenosiva odbrana je izuzeće od Doze/
  App Standby (`GpsBridge.hasBatteryOptExemption/requestBatteryOptExemption`,
  `_checkBatteryOptHint` u index.html, pita se jednom pri prvom startu bilo
  kojeg snimanja) — OEM-specifične "autostart/protected apps" postavke se ne
  mogu tražiti programski.

## Kandidati za čišćenje (nisu hitni)

- ~~`copy-assets` kopira `forwarder.png`/`FORVARDER IKONA.png`~~ — riješeno:
  sve tri copy-assets skripte (`.sh`/`.ps1`/`build-apk.ps1`) sad kopiraju samo
  `forwarder.svg`, koji je jedini stvarno referenciran u index.html.
- ~~`_escHtml` definisan dva puta~~ — riješeno: uklonjena starija (nepotpuna,
  bez quote-escaping-a) definicija na ~8696, ostala jedna kod ~14820.
- ~~Neiskorišteni fajlovi u repou~~ — riješeno: `Gemini_Generated_Image_*.png`
  i `images (4).jpeg` obrisani (nigdje referencirani).

## Konvencija za svaku izmjenu

1. Sintaks-provjera svih `<script>` blokova u `index.html` (Node `new Function()` na svaki blok).
2. `node tests/js/offline-layer.test.js` ako izmjena dotiče offline sync.
3. Podigni sve tri verzije (vidi gore). Izmjene samo dokumentacije (ovaj fajl,
   README) ne traže bump verzije.
4. Commit poruka na bosanskom, objašnjava UZROK ne samo šta je promijenjeno.
5. Push na `claude/branch-072026-sa9wz0` (PR #30 se sam ažurira).
