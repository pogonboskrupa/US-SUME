# Prompt: doznaka i pojasevi (kako je riješeno u Dendro Map)

Kopiraj tekst ispod crte u drugi alat/AI.

---

Implementiraj modul **Doznaka** za terensku šumarsku aplikaciju (mobilni WebView/PWA, Leaflet, turf.js, Supabase, offline-first). Odgovaraj na bosanskom, tehničke termine ostavi na engleskom.

## 1. Šta je doznaka (domen)

Doznaka je označavanje stabala za sječu u **odjelu** (šumski odjel = poligon). Odjel se ne obilazi nasumično nego **paralelnim pojasevima**: svaki projektant hoda svojim koridorom kroz odjel i označava stabla koja pređe. Cilj aplikacije je da svi znaju:
- koji dio odjela je već pregledan (pokrivenost u % i ha),
- ko je koji pojas prešao,
- da li neko upada u tuđi pojas,
- da nijedan dio ne ostane neprijeđen ili pređen dvaput.

Podaci: **odjel** (granica iz KML-a/SHP-a), **članovi** odjela (projektanti, svako ima boju), **GPS tačke** po korisniku (`latitude, longitude, recorded_at`), **zone** (ručno nacrtani poligoni), **stabla** (KML tačke, opcionalno).

## 2. Snimanje pojasa (GPS)

- Projektant pritisne Start; `watchPosition` vraća fiksove. **Odbaci fiks sa tačnošću > 20 m.**
- Tačke se prvo upisuju LOKALNO (trajni bafer, localStorage/IndexedDB), pa tek onda u memoriju/na ekran; ako lokalni upis ne uspije, tačka se ne smije smatrati sačuvanom.
- Pauza/nastavak: pauza otvara interval `{start, end:null}`; pri nastavku se zatvara. Tačke iz native pozadinskog bafera se filtriraju po tim intervalima (po VREMENU tačke, ne po trenutnom stanju prekidača).
- Crash-recovery: snimak trase se piše na ~30 s; poslije ubijenog procesa nudi se oporavak i dopuna iz native bafera.
- Slanje na server je **ručno** (offline queue sa klijentskim UUID-ovima, idempotentno). GPS tačke idu u serijama od ~100 uz provjeru duplikata po vremenu.

## 3. Od GPS traga do pojasa (jezgro)

1. **Segmentacija traga.** Tačke po korisniku sortiraj po vremenu. Ako je razmak dvije uzastopne tačke > **5 min**, počinje novi segment (to je novi prolaz). Segment s < 2 tačke se odbacuje. Svaki segment je `turf.lineString` + `startedAt/endedAt`.
2. **Osnovni pojas = bafer.** Za svaki segment: `turf.buffer(line, R, {units:'meters', steps:4})`, gdje je **R = vanjski rub pojasa, zadano 20 m po strani** (korisnik bira u UI-ju; ukupna širina = 2R). Rezultat se **presiječe sa granicom odjela** (`turf.intersect(buffer, boundary)`) — pojas nikad ne izlazi iz odjela. Površina = `turf.area/10000` ha.
3. **Susjedni pojasevi se ne smiju preklapati.** Kad dva traga paralelno idu blizu, bafer se skraćuje na **pola razmaka između tragova** (granica pojasa leži na sredini između dvije linije):
   - Jednostavna varijanta: za srednju tačku traga nađi najbliži tuđi trag (`nearestPointOnLine`), `bufDist = min(R, razmak/2)`; tuđi tragovi daleko od tačke (bbox + margina 2R) se preskaču radi brzine.
   - **Bolja varijanta (koristi se prvo, `DozBands.build`)**: ako su tragovi približno paralelni, uradi to u lokalnim metarskim koordinatama:
     - projiciraj sve tragove u 2D (equirectangular oko centra odjela), odaberi osu `u` = smjer najdužeg traga (end−start), `v` = okomica;
     - svaki trag mora biti monoton po `u` (tolerancija 2 m), min. dužina 10 m; inače vrati `null` (pad na jednostavnu varijantu);
     - uzorkuj `u` na korak 10 m (+ početke/krajeve tragova); na svakoj stanici sortiraj aktivne tragove po `v`; ako su dva tragova bliža od 0,5 m (presjek/dupli trag) → `null`;
     - za svaki trag: donja granica = `v − min(R, razmak_do_donjeg/2)`, gornja = `v + min(R, razmak_do_gornjeg/2)`; ako nema susjeda, `v ∓ R`;
     - trag je „shared“ ako mu je susjed bliži od 2R; za takav trag poligon = prsten od donje i obrnute gornje granice (vraćeno u lon/lat), inače običan bafer;
     - svaki poligon se presiječe sa granicom odjela; rezultat nosi `joined: true` kad dijeli granicu sa susjedom.
   - Svaki pojas pamti `uid`, `polygon`, `areaHa`, `startedAt`, `endedAt`.
4. **GPS tragovi ostaju cjeloviti**: blizina tuđeg pojasa nije razlog da se brišu tačke vlastitog traga; preklop rješava geometrija.

## 4. Pokrivenost (pređena površina)

- Pokrivenost je **spojena geometrija** (`turf.union` svih pojaseva), NIKAD zbir površina — isti dio pređen dvaput ili preklop dvojice projektanata inače daje > 100 %.
- Izlaz: `poKorisniku{uid: ha}` (union pojaseva tog korisnika), `ukupnoHa` (union svih), `preklopHa = max(0, zbir − ukupno)` (prikaži zasebno).
- Postotak = `ukupnoHa / površina odjela`. Prikaži: % pokrivenosti, ha unutar granice, broj zona, dužinu traga, preklop.
- Sve skupe računice (tragovi, pojasevi, union) **memoizuj** po potpisu ulaza (tragovi + granica + R) jer se zovu 2–3 puta po osvježavanju; tokom snimanja ih ograniči (npr. provjera najviše svakih 5 s) jer je `nearestPointOnLine` po tački O(n²).

## 5. Upozorenje „prelaziš u tuđi pojas“

Na GPS fiks (najviše svakih 5 s, upozorenje najviše svakih 15 s): izračunaj udaljenost do najbližeg vlastitog traga i do najbližeg tuđeg. Ako je tuđi trag **bliži od vlastitog i bliže od 25 m**, broji uzastopne pogotke; na **3. zaredom** pokaži toast „Prelazite u pojas: <ime>“ i crveni marker (nestaje za 30 s). Jedan loš fiks ne smije okinuti upozorenje.

## 6. Prikaz na karti i UI

- Svaki član ima fiksnu boju (paleta po indeksu u listi članova). Pojas: ispuna ~0,18 providnosti + linija 1,5 px u boji korisnika. Klik na pojas → popup: ime, „Procjena površine pojasa“, „Zajednička granica sa susjednim pojasom“ ili „Procjena iz GPS bafera“, datum i vrijeme rada.
- Naglasi da je površina **procjena** (GPS bafer), ne izmjera.
- Pregled odjela (traka): % pokrivenosti, ha, zone, trag, preklop. Lista odjela se filtrira po statusu.
- Redoslijed panela u odjelu: GPS snimanje → Pregled → Projektanti → Projekcija → Zone → Vlake → Stabla → Postavke (širina pojasa, stil poligona, sklopljeno) → QR dijeljenje.
- Zone: korisnik crta poligone (npr. „ne dozna se“); klijentski UUID pri upisu da izgubljen odgovor ne napravi duplikat.
- Stabla: KML tačke po odjelu; boje se po dosegu vitla (bafer vlaka). Buffer radijus je JEDAN zajednički za sve alate.

## 7. Projekcija (planiranje pojaseva)

Odvojena od stvarne doznake: plan pojaseva (broj projektanata, širina) računa se u web workeru nad granicom odjela i čuva lokalno; ne miješa se sa stvarnim tragovima.

## 8. Dijeljenje i offline

- Pojas/trag se može predati kolegi **QR kodom, potpuno offline** (kamera → kamera, bez servera); primljeni pojas se odmah trajno sprema (nema drugog izvora).
- Server: RLS po članstvu u odjelu; GPS tačke u tabeli sa tačkom + `recorded_at`; PostgREST vraća max 1000 redova pa tačke čitaj stranicama.
- Supabase greške se VRAĆAJU kao `{error}`, ne bacaju: nikad ne prepisuj offline keš praznim odgovorom kad je došlo do greške.

## 9. Testovi koje napiši

- bafer presječen granicom odjela; dva paralelna traga na 30 m → granica na 15 m, bez preklopa; tragovi na 100 m → puni R;
- presjek/dupli trag → pad na jednostavnu varijantu;
- isti dio pređen dvaput → pokrivenost se ne udvostručuje; `preklopHa` tačan za dvojicu;
- razmak > 5 min → dva segmenta; fiks s tačnošću > 20 m se odbacuje;
- upozorenje tek na 3. uzastopni pogodak; pauza ne propušta tačke iz pauze pri replay-u native bafera.
