// =====================================================================
// Testovi za POŽARE — parsiranje FIRMS CSV-a, filter po udaljenosti,
// normalizacija pouzdanosti i poruke koje korisnik vidi.
// Pokretanje:  node tests/js/pozari.test.js
// ---------------------------------------------------------------------
// Zašto ovaj test postoji: prva verzija sloja požara (v3.103.0) bila je
// rasterski WMS i kod korisnika je ostala PRAZNA — a iz prazne karte se ne
// može zaključiti da li nema požara (najčešći i sasvim ispravan ishod!), da
// li je pao endpoint ili nema CORS-a. Zato se od v3.103.1 detekcije povlače
// kao PODACI i svaki ishod ima jasnu poruku. Ovi testovi čuvaju upravo to:
// da parsiranje radi na oba FIRMS formata (VIIRS i MODIS imaju RAZLIČIT
// raspored kolona), da filter po udaljenosti ne propušta tuđe požare, i da
// "nema požara" nikad ne izgleda kao greška.
//
// Testira se STVARNI izvorni kod — funkcije se izvlače direktno iz index.html.
// =====================================================================
'use strict';
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const HTML = fs.readFileSync(path.join(__dirname, '../../index.html'), 'utf8');

function extractFn(name) {
  const re = new RegExp('function ' + name + '\\(');
  const start = HTML.search(re);
  assert.ok(start >= 0, 'nije nađena funkcija ' + name + ' u index.html');
  let fstart = HTML.indexOf('function', start);
  // "async function" — bez ovoga bi se "async " prefiks odsjekao pri
  // izvlačenju i unutrašnji await bi pukao van async konteksta.
  if (HTML.slice(Math.max(0, fstart - 6), fstart) === 'async ') fstart -= 6;
  let i = HTML.indexOf('{', fstart), depth = 0;
  for (; i < HTML.length; i++) {
    if (HTML[i] === '{') depth++;
    else if (HTML[i] === '}') { depth--; if (depth === 0) return HTML.slice(fstart, i + 1); }
  }
  throw new Error('nezatvorena funkcija ' + name);
}

// dst() je jednolinijska deklaracija u index.html — uzmi je doslovno
const SRC_DST = HTML.match(/function dst\(la1,lo1,la2,lo2\)\{[^\n]*\}/)[0];
const SRC = [
  SRC_DST,
  extractFn('_poziParseCsv'),
  extractFn('_poziPouzdanost'),
  extractFn('_poziFilterBlizu'),
  extractFn('_poziBrojRijec'),
  extractFn('_poziSatelit'),
  extractFn('_poziStarost'),
].join('\n');

const api = new Function('_POZ_RADIUS_KM',
  SRC + '\nreturn { _poziParseCsv, _poziPouzdanost, _poziFilterBlizu, _poziBrojRijec, _poziSatelit, _poziStarost };')(150);

let pass = 0, fail = 0;
// Sinhroni test. Ako fn vrati Promise, prebaci ga u red za asinhrone (inače bi
// odbijeno obećanje tiho "prošlo" — test bez zuba je gori od nikakvog testa).
const _async = [];
function t(name, fn) {
  try {
    const r = fn();
    if (r && typeof r.then === 'function') { _async.push({ name, p: r }); return; }
    pass++; console.log('  ✔ ' + name);
  }
  catch (e) { fail++; console.log('  ✘ ' + name + '\n      ' + e.message); }
}

// ── v3.104.0: grupisanje u požare, MAP_KEY Area API, vjetar-prijeti-mi ──────
// Zašto ovo postoji: korisnik je sa STVARNOG telefona prijavio da su sva 4
// FIRMS arhivska CSV izvora "blokiran (CORS/mreža)" — fetch() iz browsera ne
// razlikuje CORS blok od mrtve mreže (isto baca generičku TypeError), pa se
// paralelno umjesto redom-dok-jedan-ne-uspije PROBAJU SVI (brže javlja grešku,
// spaja sve što UPSJE), dodaje se opcioni MAP_KEY (druga ruta servera), i
// višestruke detekcije ISTOG požara (različiti sateliti/preleti) se grupišu —
// inače "12 aktivnih detekcija" zvuči kao 12 požara umjesto 1 praćenog.
function extractConst(name) {
  const re = new RegExp('const ' + name + '\\s*=\\s*[\\s\\S]*?;'); // stani na PRVI ';' (ne na ';\n' — dosta linija ima komentar iza ';')
  const m = re.exec(HTML);
  assert.ok(m, 'nije nađena const ' + name + ' u index.html');
  return m[0];
}
const SRC2 = [
  SRC_DST,
  extractConst('_POZ_GRUPA_M'),
  extractConst('_POZ_BAZA'),
  extractConst('_POZ_IZVORI'),
  extractConst('_POZ_OKVIRI'),
  extractFn('_poziPouzdanost'),
  extractFn('_poziSatelit'),
  extractFn('_poziOkvir'),
  extractFn('_poziOkvirNaziv'),
  extractFn('_poziUrl'),
  extractFn('_poziGrupisi'),
  extractFn('_poziGrupeBlizu'),
  extractFn('_poziEvtKljuc'),
  extractFn('_poziOznaciNove'),
  extractFn('_poziApiUrl'),
  extractFn('_poziGfwUrl'),
  extractFn('_poziParseGfwJson'),
  extractFn('_poziBrojRijecPozar'),
  extractFn('_poziBrojRijecNovih'),
  extractFn('_poziBrojRijecIzvora'),
  extractFn('_poziVjetarPrijeti'),
  extractFn('_poziGreskaTxt'),
  extractFn('_nativeNetDostupan'),   // _poziSavjet pita je li APK ili browser
  extractFn('_poziSavjet'),
].join('\n');

function makeStore() {
  const m = {};
  return { getItem:k => (k in m ? m[k] : null), setItem:(k,v) => { m[k]=String(v); }, removeItem:k => { delete m[k]; } };
}
function makeApi2(store) {
  const keys = ['localStorage', '_POZ_SEEN_KEY', '_POZ_OKVIR_KEY', '_POZ_RADIUS_KM'];
  const vals = [store, 'seen', 'tvlake_pozari_okvir', 150];
  return new Function(...keys,
    SRC2 + '\nreturn { _poziOkvir, _poziOkvirNaziv, _poziUrl, _poziGrupisi, _poziGrupeBlizu, ' +
    '_poziEvtKljuc, _poziOznaciNove, _poziApiUrl, _poziGfwUrl, _poziParseGfwJson, _poziBrojRijecPozar, _poziBrojRijecNovih, _poziBrojRijecIzvora, ' +
    '_poziVjetarPrijeti, _poziGreskaTxt, _poziSavjet };'
  )(...vals);
}

console.log('\n_poziGrupisi — više detekcija ISTOG požara postaju JEDAN događaj:');

t('detekcije unutar _POZ_GRUPA_M se spajaju u jednu grupu', () => {
  const api2 = makeApi2(makeStore());
  const pts = [
    { la:44.910, lo:16.200, dt:'2026-09-03T11:22:00Z', sat:'N', conf:'h', frp:12.7 },
    { la:44.911, lo:16.201, dt:'2026-09-03T13:00:00Z', sat:'1', conf:'n', frp:8.0  }, // ~140m dalje, isti požar
  ];
  const g = api2._poziGrupisi(pts);
  assert.strictEqual(g.length, 1, 'dvije bliske detekcije = JEDAN požar');
  assert.strictEqual(g[0].broj, 2);
  assert.strictEqual(g[0].sateliti.length, 2, 'oba satelita zabilježena');
});

t('udaljene detekcije (>_POZ_GRUPA_M) ostaju ODVOJENI požari', () => {
  const api2 = makeApi2(makeStore());
  const pts = [
    { la:44.910, lo:16.200, dt:'2026-09-03T11:00:00Z', sat:'N', conf:'h', frp:5 },
    { la:45.300, lo:16.150, dt:'2026-09-03T11:00:00Z', sat:'N', conf:'h', frp:5 }, // ~43km dalje
  ];
  const g = api2._poziGrupisi(pts);
  assert.strictEqual(g.length, 2);
});

t('grupa pamti najpouzdaniju detekciju i maksimalni FRP', () => {
  const api2 = makeApi2(makeStore());
  const pts = [
    { la:44.910, lo:16.200, dt:'2026-09-03T11:00:00Z', sat:'N', conf:'l', frp:3.0 },
    { la:44.910, lo:16.200, dt:'2026-09-03T12:00:00Z', sat:'1', conf:'h', frp:22.5 },
  ];
  const g = api2._poziGrupisi(pts);
  assert.strictEqual(g[0].conf, 'h', 'zadržava najvišu pouzdanost, ne posljednju');
  assert.strictEqual(g[0].frpMax, 22.5);
});

t('span (raspon) grupe od jedne tačke je 0, od dvije > 0', () => {
  const api2 = makeApi2(makeStore());
  const jedna = api2._poziGrupisi([{ la:44.91, lo:16.20, dt:'2026-09-03T11:00:00Z', sat:'N', conf:'h', frp:5 }]);
  assert.strictEqual(jedna[0].spanM, 0);
  const dvije = api2._poziGrupisi([
    { la:44.910, lo:16.200, dt:'2026-09-03T11:00:00Z', sat:'N', conf:'h', frp:5 },
    { la:44.912, lo:16.202, dt:'2026-09-03T11:05:00Z', sat:'1', conf:'h', frp:5 }
  ]);
  assert.ok(dvije[0].spanM > 0);
});

console.log('_poziGrupeBlizu — udaljenost i sortiranje na grupama:');

t('sortira grupe po udaljenosti od reference', () => {
  const api2 = makeApi2(makeStore());
  const grupe = [{ la:45.30, lo:16.15, pts:[] }, { la:44.90, lo:16.15, pts:[] }];
  const r = api2._poziGrupeBlizu(grupe, { la:44.88, lo:16.15 });
  assert.ok(r[0].d < r[1].d);
});

console.log('_poziOznaciNove — "novo od zadnje provjere" preživljava dva učitavanja:');

t('prvi put SVE je novo, drugi put ISTI požar više nije nov', () => {
  const store = makeStore();
  const api2 = makeApi2(store);
  const g = [{ la:44.910, lo:16.200, pts:[] }];
  const prvi = api2._poziOznaciNove(g);
  assert.strictEqual(prvi[0].nov, true);
  const drugi = api2._poziOznaciNove(g);
  assert.strictEqual(drugi[0].nov, false, 'isti požar iz prošlog pregleda nije "nov"');
});

t('sasvim nov požar (druga lokacija) OSTAJE nov i kad stari nestane', () => {
  const store = makeStore();
  const api2 = makeApi2(store);
  api2._poziOznaciNove([{ la:44.910, lo:16.200, pts:[] }]);
  const drugi = api2._poziOznaciNove([{ la:45.500, lo:16.900, pts:[] }]);
  assert.strictEqual(drugi[0].nov, true);
});

console.log('Vremenski okvir (24h/48h/7d):');

t('_poziOkvir vraća 24h kad ništa nije sačuvano ili je sačuvana vrijednost neispravna', () => {
  const store = makeStore();
  const api2 = makeApi2(store);
  assert.strictEqual(api2._poziOkvir(), '24h');
  store.setItem('tvlake_pozari_okvir', 'nepostojeci');
  assert.strictEqual(api2._poziOkvir(), '24h');
});

t('_poziUrl mijenja SAMO sufiks vremenskog okvira, ne i izvor', () => {
  const api2 = makeApi2(makeStore());
  const izv = { pref:'suomi-npp-viirs-c2/csv/SUOMI_VIIRS_C2_Europe_' };
  assert.ok(api2._poziUrl(izv, '24h').endsWith('_Europe_24h.csv'));
  assert.ok(api2._poziUrl(izv, '7d').endsWith('_Europe_7d.csv'));
});

t('_poziOkvirNaziv daje čitljivo bosansko ime', () => {
  const api2 = makeApi2(makeStore());
  assert.strictEqual(api2._poziOkvirNaziv('48h'), '48 sati');
  assert.strictEqual(api2._poziOkvirNaziv('7d'), '7 dana');
});

console.log('_poziApiUrl — bbox oko referentne tačke, MAP_KEY u putanji:');

t('bbox okružuje referentnu tačku (zapad<istok, jug<sjever)', () => {
  const api2 = makeApi2(makeStore());
  const u = api2._poziApiUrl('MOJKLJUC', '24h', { la:44.88, lo:16.15 });
  assert.ok(u.includes('/MOJKLJUC/'), 'ključ mora biti u putanji: ' + u);
  const dijelovi = u.split('/');
  const dani = dijelovi.pop();
  const bboxStr = dijelovi.pop();
  const [w, s, e, n] = bboxStr.split(',').map(Number);
  assert.ok(w < e, 'zapad mora biti manji od istok');
  assert.ok(s < n, 'jug mora biti manji od sjever');
  assert.strictEqual(dani, '1', '24h okvir → 1 dan');
});

t('7d okvir traži 7 dana', () => {
  const api2 = makeApi2(makeStore());
  const u = api2._poziApiUrl('K', '7d', { la:44.88, lo:16.15 });
  assert.ok(u.endsWith('/7'));
});

console.log('Bosanska množina za GRUPISANE požare (muški rod, drugačija sklonidba od detekcija):');

t('1 aktivan požar / 2-4 aktivna požara / 5+ aktivnih požara', () => {
  const api2 = makeApi2(makeStore());
  assert.strictEqual(api2._poziBrojRijecPozar(1), '1 aktivan požar');
  assert.strictEqual(api2._poziBrojRijecPozar(2), '2 aktivna požara');
  assert.strictEqual(api2._poziBrojRijecPozar(5), '5 aktivnih požara');
  assert.strictEqual(api2._poziBrojRijecPozar(11), '11 aktivnih požara');
  assert.strictEqual(api2._poziBrojRijecPozar(21), '21 aktivan požar');
});

t('"N izvora" — 1 izvor, ne "1 izvora"', () => {
  const api2 = makeApi2(makeStore());
  assert.strictEqual(api2._poziBrojRijecIzvora(1), '1 izvor');
  assert.strictEqual(api2._poziBrojRijecIzvora(4), '4 izvora');
  assert.strictEqual(api2._poziBrojRijecIzvora(11), '11 izvora');
});

t('"N novih" — 1 novi, 2-4 nova, 5+ novih (bug: prije je pisalo "1 novih")', () => {
  const api2 = makeApi2(makeStore());
  assert.strictEqual(api2._poziBrojRijecNovih(1), '1 novi');
  assert.strictEqual(api2._poziBrojRijecNovih(2), '2 nova');
  assert.strictEqual(api2._poziBrojRijecNovih(5), '5 novih');
});

console.log('Global Forest Watch — drugi server za ISTE VIIRS detekcije:');

// Zašto GFW uopšte: detekcije su iste (GFW preuzima NASA VIIRS), ali server je
// tuđi i ima svoju CORS politiku — jedini razlog dodavanja je DRUGI PUT do
// istih podataka. NAMJERNO nisu dodati GLAD/RADD alarmi za sječu: GLAD-L radi
// samo 30°N-30°S, RADD samo u vlažnim tropima, a Bosna je na ~44.9°N.
t('_poziGfwUrl: bbox oko korisnika i datum od kojeg se traži su u SQL-u', () => {
  const api2 = makeApi2(makeStore());
  const u = api2._poziGfwUrl('24h', { la:44.88, lo:16.15 });
  assert.ok(u.startsWith('https://data-api.globalforestwatch.org/dataset/nasa_viirs_fire_alerts/latest/query/json?sql='), u.slice(0,90));
  const sql = decodeURIComponent(u.split('sql=')[1]);
  assert.match(sql, /FROM results/);
  assert.match(sql, /alert__date >= '\d{4}-\d{2}-\d{2}'/);
  assert.match(sql, /latitude >= 43\./,  'južna granica oko 44.88 - 1.35°');
  assert.match(sql, /latitude <= 46\./,  'sjeverna granica');
  assert.match(sql, /LIMIT/);
});

t('_poziGfwUrl: 7d traži stariji datum nego 24h', () => {
  const api2 = makeApi2(makeStore());
  const d = u => decodeURIComponent(u.split('sql=')[1]).match(/alert__date >= '([\d-]+)'/)[1];
  const a = d(api2._poziGfwUrl('24h', { la:44.88, lo:16.15 }));
  const b = d(api2._poziGfwUrl('7d',  { la:44.88, lo:16.15 }));
  assert.ok(b < a, '7d mora ići dalje u prošlost: ' + b + ' vs ' + a);
});

t('_poziParseGfwJson: GFW JSON se svede na ISTI oblik tačke kao FIRMS CSV', () => {
  const api2 = makeApi2(makeStore());
  const p = api2._poziParseGfwJson(JSON.stringify({ data: [
    { longitude:16.20, latitude:44.91, alert__date:'2026-09-03', alert__time_utc:'11:22:00', confidence__cat:'h' },
    { longitude:16.05, latitude:44.80, alert__date:'2026-09-03', alert__time_utc:'0234',     confidence__cat:'n' }
  ]}));
  assert.strictEqual(p.length, 2);
  assert.strictEqual(p[0].la, 44.91);
  assert.strictEqual(p[0].conf, 'h');
  assert.ok(p[0].dt.endsWith('T11:22:00Z'), 'dobiveno: ' + p[0].dt);
  assert.ok(p[1].dt.endsWith('T02:34:00Z'), '"0234" bez dvotačke mora dati 02:34, dobiveno: ' + p[1].dt);
  assert.strictEqual(p[0].rez, 375, 'VIIRS rezolucija za grupisanje');
});

t('_poziParseGfwJson: FRP je NaN (GFW ga ne vraća), ne 0 — 0 bi značilo "nema snage"', () => {
  const api2 = makeApi2(makeStore());
  const p = api2._poziParseGfwJson('{"data":[{"longitude":16.2,"latitude":44.9,"alert__date":"2026-09-03","confidence__cat":"h"}]}');
  assert.ok(Number.isNaN(p[0].frp));
});

t('_poziParseGfwJson: smeće/HTML/prazno ne ruši parser', () => {
  const api2 = makeApi2(makeStore());
  assert.deepStrictEqual(api2._poziParseGfwJson(''), []);
  assert.deepStrictEqual(api2._poziParseGfwJson('<html>403</html>'), []);
  assert.deepStrictEqual(api2._poziParseGfwJson('{"greska":"nema kljuca"}'), []);
});

console.log('Native most (APK) — jedini put oko CORS-a:');

// Terenski dokaz: dobra veza (215 KB/s), okvir 24h, unesen MAP_KEY → svih pet
// izvora "odbijeno odmah". CORS je pravilo browsera; u APK-u zahtjev ide kroz
// Java sloj koji ga nema. Ovdje se testira JS polovina tog mosta.
const SRC3 = [
  extractFn('_nativeNetDostupan'),
  extractFn('_nativeNetOdgovor'),
  extractFn('_nativeNetFetch'),
].join('\n');

function makeNet(androidNet) {
  const sandbox = {
    AndroidNet: androidNet,
    atob: (b64) => Buffer.from(b64, 'base64').toString('binary'),
    TextDecoder,
    setTimeout, clearTimeout,
    _NET_ceka: {}, _netSeq: 0,
  };
  const keys = Object.keys(sandbox);
  return new Function(...keys,
    'let _netSeq2=0;' + SRC3 + '\nreturn { _nativeNetDostupan, _nativeNetOdgovor, _nativeNetFetch, _NET_ceka };'
  )(...keys.map(k => sandbox[k]));
}

t('bez AndroidNet objekta most se ne koristi (webapp put ostaje netaknut)', () => {
  assert.strictEqual(makeNet(undefined)._nativeNetDostupan(), false);
  assert.strictEqual(makeNet({})._nativeNetDostupan(), false, 'objekat bez fetchText ne valja');
  assert.strictEqual(makeNet({ fetchText(){} })._nativeNetDostupan(), true);
});

t('Base64 tijelo se dekodira u ISPRAVAN UTF-8 (dijakritika u CSV-u)', async () => {
  let zadnji = null;
  const api3 = makeNet({ fetchText(id) { zadnji = id; } });
  const p = api3._nativeNetFetch('https://firms.modaps.eosdis.nasa.gov/x', 1000);
  const csv = 'latitude,longitude,naziv\n44.9,16.2,Bosanska Krupa — šuma';
  api3._nativeNetOdgovor(zadnji, 200, Buffer.from(csv, 'utf8').toString('base64'), null);
  const r = await p;
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.text, csv, 'dijakritika mora preživjeti prenos');
});

t('greška sa native strane odbija obećanje, ne visi', async () => {
  let zadnji = null;
  const api3 = makeNet({ fetchText(id) { zadnji = id; } });
  const p = api3._nativeNetFetch('https://firms.modaps.eosdis.nasa.gov/x', 1000);
  api3._nativeNetOdgovor(zadnji, 0, '', 'UnknownHostException: nema DNS-a');
  await assert.rejects(p, /UnknownHostException/);
});

t('ako native strana NIKAD ne odgovori, obećanje ipak istekne (ne visi zauvijek)', async () => {
  const api3 = makeNet({ fetchText() { /* namjerno tišina */ } });
  const p = api3._nativeNetFetch('https://firms.modaps.eosdis.nasa.gov/x', 20);
  await assert.rejects(p, e => e.name === 'TimeoutError');
});

t('odgovor za nepoznat/već obrađen id se ignoriše (nema duplog resolve-a)', () => {
  const api3 = makeNet({ fetchText() {} });
  api3._nativeNetOdgovor('nepostojeci', 200, '', null);   // ne smije baciti
});

console.log('Razlikovanje kvarova (sa terena: 1× "odbijeno odmah" + 4× "veza visi"):');

t('TypeError = odbijeno odmah, TimeoutError = veza visi — NE ista poruka', () => {
  const api2 = makeApi2(makeStore());
  const a = api2._poziGreskaTxt({ name: 'TypeError', message: 'Failed to fetch' });
  const b = api2._poziGreskaTxt({ name: 'TimeoutError', message: 'signal timed out' });
  assert.match(a, /odbijeno odmah/);
  assert.match(b, /veza visi/);
  assert.notStrictEqual(a, b, 'dva različita kvara ne smiju davati istu poruku');
});

t('sirova engleska poruka iz browsera ("signal timed out") se NE prikazuje korisniku', () => {
  const api2 = makeApi2(makeStore());
  const txt = api2._poziGreskaTxt({ name: 'TimeoutError', message: 'signal timed out' });
  assert.ok(!/signal timed out/.test(txt), 'dobiveno: ' + txt);
});

t('AbortError se tretira kao istek, ne kao nepoznata greška', () => {
  const api2 = makeApi2(makeStore());
  assert.match(api2._poziGreskaTxt({ name: 'AbortError' }), /veza visi/);
});

console.log('_poziSavjet — savjet prati TIP kvara, ne samo činjenicu da ga ima:');

t('sve isteklo → savjetuje 24h okvir, VPN i MAP_KEY (ne tvrdi da je CORS)', () => {
  const api2 = makeApi2(makeStore());
  const s = api2._poziSavjet('VIIRS: nema odgovora na vrijeme (veza visi) · MODIS: nema odgovora na vrijeme (veza visi)');
  assert.match(s, /24 sata/);
  assert.match(s, /VPN/);
  assert.ok(!/CORS blokada nego/.test(s) || /nije CORS/.test(s), 'ne smije tvrditi da je CORS');
});

t('sve odbijeno odmah u BROWSERU → kaže da je CORS i da APK radi, i NE obećava MAP_KEY', () => {
  const api2 = makeApi2(makeStore());   // bez AndroidNet → web verzija
  const s = api2._poziSavjet('VIIRS: odbijeno odmah (CORS ili nema mreže)');
  assert.match(s, /CORS/);
  assert.match(s, /APK/);
  // Terenski dokaz: sa unesenim MAP_KEY-em API ruta je odbijena JEDNAKO kao
  // arhiva, pa savjet "unesi ključ" ovdje ne smije stajati — bio bi laž.
  assert.ok(!/MAP_KEY/.test(s), 'ne smije nuditi ključ kao rješenje CORS-a u browseru');
});

t('miješano → savjet pokriva oboje', () => {
  const api2 = makeApi2(makeStore());
  const s = api2._poziSavjet('A: odbijeno odmah (CORS ili nema mreže) · B: nema odgovora na vrijeme (veza visi)');
  assert.match(s, /dio/i);
});

console.log('_poziVjetarPrijeti — meteorološka konvencija (smjer ODAKLE vjetar duva):');

t('vjetar iz smjera požara (u odnosu na mene) → prijeti', () => {
  const api2 = makeApi2(makeStore());
  // Požar je SJEVERNO od mene (azimut od požara ka meni = jug = 180°).
  // Vjetar duva IZ smjera sjevera (0°) → nosi vatru ka jugu (180°) → ka meni.
  assert.strictEqual(api2._poziVjetarPrijeti(180, 0), true);
});

t('vjetar duva u SUPROTNOM smjeru → ne prijeti', () => {
  const api2 = makeApi2(makeStore());
  // Isti geometrijski slučaj, ali vjetar duva IZ juga (180°) → nosi ka sjeveru,
  // dakle OD mene, nazad ka požaru.
  assert.strictEqual(api2._poziVjetarPrijeti(180, 180), false);
});

t('granica ±45° se poštuje', () => {
  const api2 = makeApi2(makeStore());
  assert.strictEqual(api2._poziVjetarPrijeti(180, 44), true);   // 180-(44+180)=44° unutra
  assert.strictEqual(api2._poziVjetarPrijeti(180, 46), false);  // 46° van granice
});


// Pravi FIRMS formati — VIIRS i MODIS NEMAJU isti raspored kolona
const CSV_VIIRS = `country_id,latitude,longitude,bright_ti4,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_ti5,frp,daynight
BIH,44.9100,16.2000,331.5,0.45,0.42,2026-09-03,1122,N,VIIRS,h,2.0NRT,289.1,12.7,D
BIH,44.8000,16.0500,305.2,0.51,0.48,2026-09-03,234,N,VIIRS,n,2.0NRT,280.4,3.4,N`;

const CSV_MODIS = `latitude,longitude,brightness,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_t31,frp,daynight
44.9500,16.1000,330.1,1.1,1.0,2026-09-03,1015,Terra,MODIS,78,6.1NRT,291.0,21.5,D`;

console.log('_poziParseCsv — oba FIRMS formata:');

t('VIIRS: parsira sve redove sa koordinatama', () => {
  const p = api._poziParseCsv(CSV_VIIRS);
  assert.strictEqual(p.length, 2);
  assert.strictEqual(p[0].la, 44.91);
  assert.strictEqual(p[0].lo, 16.20);
  assert.strictEqual(p[0].conf, 'h');
  assert.strictEqual(p[0].frp, 12.7);
});

t('MODIS: kolone su na DRUGIM pozicijama, i dalje se čitaju ispravno', () => {
  const p = api._poziParseCsv(CSV_MODIS);
  assert.strictEqual(p.length, 1);
  assert.strictEqual(p[0].la, 44.95);
  assert.strictEqual(p[0].conf, '78');       // MODIS daje broj, ne slovo
  assert.strictEqual(p[0].frp, 21.5);
});

t('acq_time "234" (bez vodeće nule) → 02:34 UTC, ne 23:40', () => {
  const p = api._poziParseCsv(CSV_VIIRS);
  assert.ok(p[1].dt.endsWith('T02:34:00Z'), 'dobiveno: ' + p[1].dt);
});

t('dan/noć zastavica', () => {
  const p = api._poziParseCsv(CSV_VIIRS);
  assert.strictEqual(p[0].noc, false);   // D
  assert.strictEqual(p[1].noc, true);    // N
});

t('prazan ulaz / smeće ne ruši parser', () => {
  assert.deepStrictEqual(api._poziParseCsv(''), []);
  assert.deepStrictEqual(api._poziParseCsv(null), []);
  assert.deepStrictEqual(api._poziParseCsv('<html>404</html>'), []);
});

t('CSV bez latitude kolone se odbija (nije FIRMS)', () => {
  assert.deepStrictEqual(api._poziParseCsv('a,b,c\n1,2,3'), []);
});

console.log('_poziFilterBlizu — samo ono što je stvarno blizu:');

t('udaljeni požar (Grčka) se odbacuje, blizak zadržava', () => {
  const pts = [
    { la: 44.91, lo: 16.20 },   // ~5 km od Bos. Krupe
    { la: 38.10, lo: 23.70 }    // Grčka, ~900 km
  ];
  const r = api._poziFilterBlizu(pts, { la: 44.88, lo: 16.15 });
  assert.strictEqual(r.length, 1);
  assert.ok(r[0].d < 10000, 'zadržan mora biti onaj blizu, d=' + r[0].d);
});

t('sortirano po udaljenosti — najbliži prvi', () => {
  const pts = [{ la: 45.30, lo: 16.15 }, { la: 44.90, lo: 16.15 }, { la: 45.10, lo: 16.15 }];
  const r = api._poziFilterBlizu(pts, { la: 44.88, lo: 16.15 });
  assert.deepStrictEqual(r.map(x => Math.round(x.d / 1000)), [2, 24, 47]);
});

t('nema detekcija u okolini → prazan niz (ne greška)', () => {
  const r = api._poziFilterBlizu([{ la: 38.1, lo: 23.7 }], { la: 44.88, lo: 16.15 });
  assert.deepStrictEqual(r, []);
});

console.log('_poziPouzdanost — VIIRS slova i MODIS brojevi na isto:');

t('VIIRS l/n/h', () => {
  assert.strictEqual(api._poziPouzdanost('h').rang, 3);
  assert.strictEqual(api._poziPouzdanost('n').rang, 2);
  assert.strictEqual(api._poziPouzdanost('l').rang, 1);
});

t('MODIS 0-100 → isti rangovi', () => {
  assert.strictEqual(api._poziPouzdanost('85').rang, 3);
  assert.strictEqual(api._poziPouzdanost('60').rang, 2);
  assert.strictEqual(api._poziPouzdanost('20').rang, 1);
});

t('svaka pouzdanost ima boju u hex formatu', () => {
  ['h','n','l','85','20','', 'xyz'].forEach(c =>
    assert.match(api._poziPouzdanost(c).boja, /^#[0-9a-f]{6}$/i, 'za "' + c + '"'));
});

console.log('Poruke koje korisnik vidi:');

t('bosanska množina: 1 / 2-4 / 5+', () => {
  assert.strictEqual(api._poziBrojRijec(1),  '1 aktivna detekcija');
  assert.strictEqual(api._poziBrojRijec(2),  '2 aktivne detekcije');
  assert.strictEqual(api._poziBrojRijec(4),  '4 aktivne detekcije');
  assert.strictEqual(api._poziBrojRijec(5),  '5 aktivnih detekcija');
  assert.strictEqual(api._poziBrojRijec(11), '11 aktivnih detekcija');  // ne "11 aktivna"
  assert.strictEqual(api._poziBrojRijec(21), '21 aktivna detekcija');
  assert.strictEqual(api._poziBrojRijec(22), '22 aktivne detekcije');
});

t('kodovi satelita se razvijaju u imena', () => {
  assert.strictEqual(api._poziSatelit('N'), 'Suomi-NPP');
  assert.strictEqual(api._poziSatelit('1'), 'NOAA-20');
  assert.strictEqual(api._poziSatelit('Terra'), 'Terra');
  assert.strictEqual(api._poziSatelit(''), '—');
});

t('starost podatka: "upravo" za svjež, sati/dani za stariji', () => {
  const now = Date.now();
  assert.strictEqual(api._poziStarost(now), 'upravo');
  assert.strictEqual(api._poziStarost(now - 30 * 60000), 'prije 30 min');
  assert.strictEqual(api._poziStarost(now - 5 * 3600000), 'prije 5 h');
  assert.ok(/dana$/.test(api._poziStarost(now - 4 * 86400000)));
});

console.log('Sječa/vjetroizvale (GFW integrisani alarmi) i grupisanje po pragu:');

// GLAD/RADD ne pokrivaju Bosnu (tropi), pa se koristi integrisani sloj koji
// uključuje DIST-ALERT — jedini sa globalnom pokrivenošću. Piksel je 30 m
// (ne 375 m kao VIIRS), pa i prag grupisanja i ključ "viđenog" moraju biti finiji.
const SRC5 = [
  SRC_DST,
  extractConst('_POZ_GRUPA_M'),
  extractConst('_SJE_RADIUS_KM'),
  extractConst('_SJE_OKVIRI'),
  extractFn('_poziPouzdanost'),
  extractFn('_poziSatelit'),
  extractFn('_poziGrupisi'),
  extractFn('_poziEvtKljuc'),
  extractFn('_sjeUrl'),
  extractFn('_sjeParse'),
  extractFn('_sjePouzdanost'),
  extractFn('_sjeFilterBlizu'),
  extractFn('_sjeBrojRijec'),
].join('\n');
const api5 = new Function('localStorage', '_SJE_OKVIR_KEY',
  SRC5 + '\nreturn { _sjeUrl, _sjeParse, _sjePouzdanost, _sjeFilterBlizu, _sjeBrojRijec, _poziGrupisi, _poziEvtKljuc };'
)(makeStore(), 'tvlake_sjeca_okvir');

t('_sjeUrl gađa gfw_integrated_alerts (ne GLAD/RADD — oni ne pokrivaju BiH)', () => {
  const u = api5._sjeUrl('30d', { la:44.88, lo:16.15 });
  assert.match(u, /dataset\/gfw_integrated_alerts\/latest\/query\/json/);
  const sql = decodeURIComponent(u.split('sql=')[1]);
  assert.match(sql, /gfw_integrated_alerts__date >= '\d{4}-\d{2}-\d{2}'/);
  assert.match(sql, /latitude >= 44\./);
  assert.match(sql, /LIMIT/);
});

t('_sjeUrl: 90d ide dalje u prošlost nego 7d', () => {
  const d = u => decodeURIComponent(u.split('sql=')[1]).match(/date >= '([\d-]+)'/)[1];
  assert.ok(d(api5._sjeUrl('90d', { la:44.88, lo:16.15 })) < d(api5._sjeUrl('7d', { la:44.88, lo:16.15 })));
});

t('_sjeParse: GFW JSON → ista struktura tačke kao požari, rezolucija 30 m', () => {
  const p = api5._sjeParse(JSON.stringify({ data: [
    { longitude:16.20, latitude:44.91, gfw_integrated_alerts__date:'2026-08-20', gfw_integrated_alerts__confidence:'highest' }
  ]}));
  assert.strictEqual(p.length, 1);
  assert.strictEqual(p[0].la, 44.91);
  assert.strictEqual(p[0].rez, 30, 'DIST-ALERT je 30 m, ne 375 m kao VIIRS');
  assert.ok(p[0].dt.startsWith('2026-08-20'));
});

t('_sjeParse: smeće ne ruši parser', () => {
  assert.deepStrictEqual(api5._sjeParse(''), []);
  assert.deepStrictEqual(api5._sjeParse('<html>403</html>'), []);
  assert.deepStrictEqual(api5._sjeParse('{"greska":"nema kljuca"}'), []);
});

t('_sjePouzdanost: GFW "highest"/"nominal" → ista skala kao požari', () => {
  assert.strictEqual(api5._sjePouzdanost('highest').rang, 3);
  assert.strictEqual(api5._sjePouzdanost('nominal').rang, 2);
  assert.strictEqual(api5._sjePouzdanost('low').rang, 1);
  assert.match(api5._sjePouzdanost('nesto').boja, /^#[0-9a-f]{6}$/i);
});

t('_sjeFilterBlizu koristi UŽI radijus od požara (50 km, ne 150)', () => {
  const pts = [{ la:45.40, lo:16.15 }];   // ~58 km sjeverno
  assert.strictEqual(api5._sjeFilterBlizu(pts, { la:44.88, lo:16.15 }).length, 0);
  assert.strictEqual(api5._sjeFilterBlizu([{ la:45.10, lo:16.15 }], { la:44.88, lo:16.15 }).length, 1);
});

t('_poziGrupisi sa UŽIM pragom razdvaja ono što bi na 1500 m bilo spojeno', () => {
  const pts = [
    { la:44.9100, lo:16.2000, dt:'2026-08-20T00:00:00Z', conf:'highest', sat:'x', frp:NaN },
    { la:44.9150, lo:16.2000, dt:'2026-08-20T00:00:00Z', conf:'highest', sat:'x', frp:NaN }   // ~555 m
  ];
  assert.strictEqual(api5._poziGrupisi(pts).length, 1, 'na 1500 m (požari) je to jedan');
  assert.strictEqual(api5._poziGrupisi(pts, 300).length, 2, 'na 300 m (sječa) su dvije zasebne');
});

t('_poziEvtKljuc: finija preciznost razlikuje ono što gruba spaja', () => {
  // ~333 m razmaka: dvije ZASEBNE sječine. Na grubom ključu (~1 km) dijele
  // isti ključ pa bi druga bila propuštena kao "već viđena"; na finom ne.
  const a = { la:44.9100, lo:16.2000 }, b = { la:44.9130, lo:16.2000 };
  assert.strictEqual(api5._poziEvtKljuc(a), api5._poziEvtKljuc(b), 'na ~1 km isti ključ');
  assert.notStrictEqual(api5._poziEvtKljuc(a, 1000), api5._poziEvtKljuc(b, 1000), 'na ~110 m različit');
});

t('_sjeBrojRijec: 1 alarm / 2+ alarma', () => {
  assert.strictEqual(api5._sjeBrojRijec(1), '1 alarm');
  assert.strictEqual(api5._sjeBrojRijec(3), '3 alarma');
  assert.strictEqual(api5._sjeBrojRijec(7), '7 alarma');
});

console.log('Prekidač sječe je UVIJEK vidljiv (bez ključa ne smije biti blokiran, samo greška):');

// Zašto ovo postoji: korisnik je prijavio da blokirajuća poruka "treba GFW
// ključ" stoji PRIJE nego korisnik i pokuša, sakrivajući prekidač potpuno.
// _sjeLoad već vraća čitljivu grešku (_sjeMeta.greska='nema-kljuca') kad se
// prekidač uključi bez ključa — dupli, blokirajući gate iznad njega je bio
// suvišan i frustrirajući. Ovaj test čuva da se to ne vrati.
const SRC10 = [
  extractConst('_SJE_OKVIRI'),
  extractFn('_sjeOkvir'),
  extractFn('_sjeOkvirNaziv'),
  extractFn('_sjePouzdanost'),
  extractFn('_bearing'),
  extractFn('_azimutSmjer'),
  extractFn('fmtL'),
  extractConst('_SJE_RADIUS_KM'),
  extractFn('_sjeBrojRijec'),
  extractFn('_sjeSazetak'),
  extractFn('_poziStarost'),
  extractFn('_sjeSadrzajHtml'),
].join('\n');

function makeSjeHtml({ on, meta, evts, store }) {
  const sandbox = {
    localStorage: store || { getItem:()=>null, setItem(){}, removeItem(){} },
    _SJE_ON_KEY:'on', _SJE_OKVIR_KEY:'okvir',
    _sjeOn: !!on, _sjeMeta: meta || null, _sjeEvts: evts || [],
    _poziRefTacka: () => ({ la:44.88, lo:16.15, gps:true }),
    _escHtml: (s) => s,
  };
  const keys = Object.keys(sandbox);
  return new Function(...keys, SRC10 + '\nreturn _sjeSadrzajHtml();')(...keys.map(k => sandbox[k]));
}

t('prekidač je vidljiv i BEZ ključa (nema blokirajuće poruke prije uključivanja)', () => {
  const html = makeSjeHtml({ on:false, meta:null, evts:[] });
  assert.match(html, /onchange="_sjeToggle/, 'checkbox mora postojati');
  assert.ok(!/Za ovaj sloj treba/.test(html), 'stara blokirajuća poruka ne smije se vratiti');
});

t('uključen prekidač BEZ ključa → čitljiva poruka sa akcijom, ne sirov "nema-kljuca"', () => {
  const html = makeSjeHtml({ on:true, meta:{ greska:'nema-kljuca' }, evts:[] });
  assert.match(html, /onchange="_sjeToggle/, 'checkbox i dalje vidljiv');
  assert.match(html, /Global Forest Watch ključ/);
  assert.ok(!/>nema-kljuca</.test(html), 'sirovi interni kod greške ne smije procuriti u UI');
});

t('uključen prekidač SA ključem i podacima → normalna lista, ne poruka o ključu', () => {
  const html = makeSjeHtml({ on:true, meta:{ okvir:'30d' }, evts:[
    { la:44.91, lo:16.20, d:5000, conf:'highest', broj:1, zadnji:Date.now(), nov:false }
  ]});
  assert.ok(!/Global Forest Watch ključ/.test(html));
  assert.match(html, /5\.00 km|5 km/);
});

console.log('Upozorenje na nov požar — native most oko WebView Notification zamke:');

// Zašto ovo postoji: korisnik je na STVARNOM telefonu dobio "Ovaj uređaj ne
// podržava obavještenja" pri uključivanju prekidača. Uzrok: Android WebView na
// mnogim OEM verzijama uopšte nema window.Notification ('Notification' in
// window je false), iako sistem sasvim normalno prikazuje prave Android
// notifikacije (dokazano kod GPS snimanja — vidi GpsService, koji ide preko
// native NotificationManager-a). AndroidNotif most (MainActivity.AppNotifBridge)
// zaobilazi to potpuno, isto kao AndroidNet zaobilazi CORS.
const SRC6 = [
  extractFn('_poziNotifNativnoDostupan'),
  extractFn('_poziEvtKljuc'),
].join('\n');

function makeNotifDetekcija(androidNotif) {
  const sandbox = { AndroidNotif: androidNotif };
  const keys = Object.keys(sandbox);
  return new Function(...keys, SRC6 + '\nreturn { _poziNotifNativnoDostupan };')(...keys.map(k => sandbox[k]));
}

t('_poziNotifNativnoDostupan: false bez AndroidNet-olikog objekta (web/browser)', () => {
  assert.strictEqual(makeNotifDetekcija(undefined)._poziNotifNativnoDostupan(), false);
  assert.strictEqual(makeNotifDetekcija({})._poziNotifNativnoDostupan(), false, 'objekat bez show() ne valja');
});

t('_poziNotifNativnoDostupan: true kad AndroidNotif.show postoji (APK)', () => {
  assert.strictEqual(makeNotifDetekcija({ show(){} })._poziNotifNativnoDostupan(), true);
});

// Puna provjera _poziNotifProvjeri: u APK-u MORA zvati AndroidNotif.show, NE
// smije ni pipnuti window.Notification/service worker (koji su tamo ionako
// slomljeni po nalazu s terena).
const SRC7 = [
  SRC_DST,
  extractFn('_bearing'),
  extractFn('_azimutSmjer'),
  extractFn('fmtL'),
  extractFn('_poziPouzdanost'),
  extractFn('_poziBrojRijecPozar'),
  extractFn('_poziEvtKljuc'),
  extractFn('_poziNotifNativnoDostupan'),
  extractFn('_poziNotifOn'),
  extractFn('_poziNotifKm'),
  extractFn('_poziNotifProvjeri'),
].join('\n');

function makeNotifProvjeri({ androidNotif, notifOn, km, evts, ref, store }) {
  let posljednji = null;
  const swPostMessage = () => { throw new Error('SW put NE SMIJE se zvati kad je native dostupan'); };
  const sandbox = {
    localStorage: store || { getItem:()=>null, setItem(){}, removeItem(){} },
    _POZ_NOTIF_KEY: 'on', _POZ_NOTIF_KM: 'km', _POZ_NOTIF_SEEN: 'seen',
    AndroidNotif: androidNotif ? { show: (naslov, tijelo) => { posljednji = { naslov, tijelo }; } } : undefined,
    Notification: { permission: 'granted' },   // namjerno "ispravan" web fallback — native ipak mora pobijediti
    navigator: { serviceWorker: { controller: { postMessage: swPostMessage } } },
    _poziEvts: evts, _poziRefTacka: () => ref,
  };
  sandbox.localStorage.getItem = (k) => k === 'on' ? (notifOn ? '1' : '0') : (k === 'km' ? String(km||25) : null);
  const keys = Object.keys(sandbox);
  const api = new Function(...keys, SRC7 + '\nreturn { _poziNotifProvjeri };')(...keys.map(k => sandbox[k]));
  api._poziNotifProvjeri();
  return posljednji;
}

t('u APK-u (AndroidNotif prisutan) upozorenje ide preko native mosta, ne preko SW-a', () => {
  const evts = [{ la:44.91, lo:16.20, d:5000, conf:'h', zadnji:Date.now() }];
  const r = makeNotifProvjeri({ androidNotif:true, notifOn:true, km:50, evts, ref:{ la:44.88, lo:16.15, gps:true } });
  assert.ok(r, 'AndroidNotif.show mora biti pozvan');
  assert.match(r.naslov, /Nov požar/);
  assert.match(r.tijelo, /5\.00 km|5 km/);
});

t('požar dalji od praga ne javlja ništa', () => {
  const evts = [{ la:45.50, lo:16.90, d:90000, conf:'h', zadnji:Date.now() }]; // 90 km > prag 50 km
  const r = makeNotifProvjeri({ androidNotif:true, notifOn:true, km:50, evts, ref:{ la:44.88, lo:16.15, gps:true } });
  assert.strictEqual(r, null);
});

t('isključen prekidač → ništa se ne javlja čak i kad ima blizak požar', () => {
  const evts = [{ la:44.91, lo:16.20, d:5000, conf:'h', zadnji:Date.now() }];
  const r = makeNotifProvjeri({ androidNotif:true, notifOn:false, km:50, evts, ref:{ la:44.88, lo:16.15, gps:true } });
  assert.strictEqual(r, null);
});

console.log('Trake udaljenosti (do 20 km / 20-40 km / preko 40 km) — RAŠČLANI, ne filtriraj:');

const SRC8 = [
  extractConst('_POZ_TRAKE'),
  extractFn('_poziTraka'),
].join('\n');
const api8 = new Function(SRC8 + '\nreturn { _poziTraka, _POZ_TRAKE };')();

t('granice traka: 19999m blizu, tačno 20000m srednje, tačno 40000m dalje', () => {
  assert.strictEqual(api8._poziTraka(19999).id, 'blizu');
  assert.strictEqual(api8._poziTraka(20000).id, 'sred');
  assert.strictEqual(api8._poziTraka(39999).id, 'sred');
  assert.strictEqual(api8._poziTraka(40000).id, 'dalje');
  assert.strictEqual(api8._poziTraka(149000).id, 'dalje', 'i požar na rubu 150 km kruga mora pasti u neku traku');
});

t('0 m (požar tačno na tvojoj poziciji) je "blizu"', () => {
  assert.strictEqual(api8._poziTraka(0).id, 'blizu');
});

// _poziListaHtml grupiše _poziEvts u tri trake, ali onclick="_poziZoom(i)" MORA
// nositi ORIGINALNI indeks u _poziEvts — ne poziciju unutar trake. Ako bi ta
// veza pukla, klik na "20-40 km" traku bi zumirao na POGREŠAN požar (ista
// klasa bug-a kao dokumentovano "Pozicija u DOM-u NIJE indeks u nizu").
function extractFnBody(name) { return extractFn(name); }
const SRC9 = [
  SRC_DST,
  extractConst('_POZ_TRAKE'),
  extractFn('_poziTraka'),
  extractConst('_POZ_SORTOVI'),
  extractConst('_POZ_SORT_KEY'),
  extractFn('_poziSort'),
  extractFn('_bearing'),
  extractFn('_azimutSmjer'),
  extractFn('fmtL'),
  extractFn('_poziPouzdanost'),
  extractFn('_poziStarost'),
  extractConst('_POZ_MK_STAROST'),
  extractFn('_poziMkStarost'),
  extractFn('_poziRedHtml'),
  extractConst('_POZ_PO_TRACI'),
  extractConst('_POZ_LISTA_MAX'),
  extractFn('_poziListaHtml'),
].join('\n');

function makeLista({ evts, on = true, meta = {}, sort = null }) {
  const sandbox = {
    _poziOn: on, _poziMeta: meta, _poziEvts: evts,
    _poziRefTacka: () => ({ la:44.88, lo:16.15, gps:true }),
    _poziOkvirNaziv: () => '24 sata', _POZ_RADIUS_KM: 150,
    _escHtml: (s) => s,
    // v3.113.1: _poziRedHtml prikazuje i procijenjenu površinu. Testovi liste
    // se tiču SAMO traka/indeksa, pa je projekcija ovdje isključena — da red
    // ostane isti bez obzira na geometriju.
    _poziOpozOn: () => false, _poziProj: () => null, _poziPovrsTxt: () => '',
    localStorage: { getItem: () => sort, setItem(){}, removeItem(){} },
  };
  const keys = Object.keys(sandbox);
  return new Function(...keys, SRC9 + '\nreturn _poziListaHtml();')(...keys.map(k => sandbox[k]));
}

t('zaglavlja traka se pojavljuju SAMO za trake koje stvarno imaju požar', () => {
  const html = makeLista({ evts: [
    { d:5000,  la:44.9,  lo:16.2,  conf:'h', broj:1, sateliti:['Suomi-NPP'], zadnji:Date.now(), nov:false },
    { d:90000, la:45.5,  lo:17.0,  conf:'h', broj:1, sateliti:['Suomi-NPP'], zadnji:Date.now(), nov:false },
  ]});
  assert.match(html, /Do 20 km/);
  assert.ok(!/20–40 km/.test(html), 'nema požara u srednjoj traci — zaglavlje ne smije postojati');
  assert.match(html, /Preko 40 km/);
});

t('onclick indeksi ostaju ORIGINALNI iz _poziEvts, ne pozicija unutar trake', () => {
  // Namjerno redoslijed koji miješa trake: [blizu, dalje, srednje] — _poziEvts
  // je inače sortiran po udaljenosti, ali test provjerava da grupisanje NE
  // pretpostavlja sortiranost pri računanju indeksa.
  const evts = [
    { d:5000,  la:44.9, lo:16.2, conf:'h', broj:1, sateliti:['A'], zadnji:Date.now(), nov:false },  // i=0, blizu
    { d:90000, la:45.5, lo:17.0, conf:'h', broj:1, sateliti:['A'], zadnji:Date.now(), nov:false },  // i=1, dalje
    { d:25000, la:45.1, lo:16.4, conf:'h', broj:1, sateliti:['A'], zadnji:Date.now(), nov:false },  // i=2, sred
  ];
  const html = makeLista({ evts });
  assert.match(html, /_poziZoom\(0\)/, 'požar iz "blizu" trake mora nositi indeks 0');
  assert.match(html, /_poziZoom\(1\)/, 'požar iz "dalje" trake mora nositi indeks 1 (ne 2 ili 0)');
  assert.match(html, /_poziZoom\(2\)/, 'požar iz "sred" trake mora nositi indeks 2 (ne 1)');
});

t('traka sa više od _POZ_PO_TRACI požara ispiše "i još N", ostale i dalje broji u zaglavlju', () => {
  const evts = Array.from({ length: 9 }, (_, k) => ({
    d: 1000 + k * 100, la:44.9, lo:16.2, conf:'h', broj:1, sateliti:['A'], zadnji:Date.now(), nov:false
  }));
  const html = makeLista({ evts });
  assert.match(html, /Do 20 km.*\(9\)/s, 'zaglavlje mora brojati SVIH 9, ne samo prikazanih');
  assert.match(html, /i još 3 u ovoj traci/);
});

console.log('Sort/filter liste požara (v3.110.0) — bliže/dalje/novije prvo:');

t('zadano (bez sačuvanog sorta) je "bliže prvo" i zadržava trake — nepromijenjeno ponašanje', () => {
  const html = makeLista({ evts: [
    { d:5000,  la:44.9, lo:16.2, conf:'h', broj:1, sateliti:['A'], zadnji:1000, nov:false },
    { d:90000, la:45.5, lo:17.0, conf:'h', broj:1, sateliti:['A'], zadnji:2000, nov:false },
  ] });
  assert.match(html, /Do 20 km/);
  assert.match(html, /Preko 40 km/);
});

t('"dalje prvo" (d_desc): ravna lista bez traka, sortirana OPADAJUĆE po udaljenosti', () => {
  const evts = [
    { d:5000,  la:44.9, lo:16.2, conf:'h', broj:1, sateliti:['A'], zadnji:1000, nov:false },  // i=0
    { d:90000, la:45.5, lo:17.0, conf:'h', broj:1, sateliti:['A'], zadnji:2000, nov:false },  // i=1
    { d:25000, la:45.1, lo:16.4, conf:'h', broj:1, sateliti:['A'], zadnji:3000, nov:false },  // i=2
  ];
  const html = makeLista({ evts, sort: 'd_desc' });
  assert.ok(!/Do 20 km|Preko 40 km/.test(html), 'trake se ne smiju prikazati van zadanog sorta');
  const iDalje = html.indexOf('_poziZoom(1)');   // 90km — najdalji, mora biti PRVI
  const iSred  = html.indexOf('_poziZoom(2)');   // 25km — srednji
  const iBlizu = html.indexOf('_poziZoom(0)');   // 5km — najbliži, mora biti ZADNJI
  assert.ok(iDalje >= 0 && iSred > iDalje && iBlizu > iSred, 'poredak mora biti dalje→bliže: ' + [iDalje, iSred, iBlizu]);
});

t('"novije prvo" (t_desc): ravna lista, sortirana OPADAJUĆE po vremenu zadnje detekcije', () => {
  const evts = [
    { d:5000,  la:44.9, lo:16.2, conf:'h', broj:1, sateliti:['A'], zadnji:1000, nov:false },  // i=0, najstariji
    { d:90000, la:45.5, lo:17.0, conf:'h', broj:1, sateliti:['A'], zadnji:3000, nov:false },  // i=1, najnoviji
    { d:25000, la:45.1, lo:16.4, conf:'h', broj:1, sateliti:['A'], zadnji:2000, nov:false },  // i=2, srednje
  ];
  const html = makeLista({ evts, sort: 't_desc' });
  assert.ok(!/Do 20 km|Preko 40 km/.test(html), 'trake se ne smiju prikazati van zadanog sorta');
  const iNoviji = html.indexOf('_poziZoom(1)');
  const iSred   = html.indexOf('_poziZoom(2)');
  const iStar   = html.indexOf('_poziZoom(0)');
  assert.ok(iNoviji >= 0 && iSred > iNoviji && iStar > iSred, 'poredak mora biti novije→starije: ' + [iNoviji, iSred, iStar]);
});

t('"dalje prvo"/"novije prvo": kapa na _POZ_LISTA_MAX sa "i još N", ORIGINALNI indeksi ostaju netaknuti', () => {
  const evts = Array.from({ length: 20 }, (_, k) => ({
    d: 1000 * (k + 1), la:44.9, lo:16.2, conf:'h', broj:1, sateliti:['A'], zadnji:1000 + k, nov:false
  }));
  const html = makeLista({ evts, sort: 'd_desc' });
  assert.match(html, /i još 2/);
  assert.match(html, /_poziZoom\(19\)/, 'najdalji (i=19) mora biti prikazan prvi u d_desc');
});

console.log('_poziSazetak — upozorenje kad udaljenost NIJE od stvarne GPS pozicije:');

// Zašto ovo postoji: prije ove izmjene je udaljenost do požara tiho padala na
// centar karte kad GPS nema fix — za alat o bezbjednosti to je aktivno
// pogrešno (korisnik je mogao ranije pomjeriti kartu bilo gdje), ne samo manje
// precizno. _poziToggle sad pokreće GPS i _poziMeta pamti refGps; _poziSazetak
// mora to napadno pokazati dok se ne popravi.
const SRC4 = [
  SRC_DST,
  extractFn('_bearing'),
  extractFn('_azimutSmjer'),
  extractFn('fmtL'),
  extractFn('_poziStarost'),
  extractFn('_poziBrojRijecPozar'),
  extractFn('_poziBrojRijecNovih'),
  extractFn('_poziBrojRijecIzvora'),
  extractConst('_POZ_OKVIRI'),
  extractFn('_poziOkvirNaziv'),
  extractFn('_poziSazetak'),
].join('\n');

function makeSazetak({ meta, evts, ref }) {
  const sandbox = {
    _POZ_RADIUS_KM: 150,
    _poziMeta: meta,
    _poziEvts: evts,
    _poziRefTacka: () => ref,
  };
  const keys = Object.keys(sandbox);
  return new Function(...keys, SRC4 + '\nreturn _poziSazetak();')(...keys.map(k => sandbox[k]));
}

t('BEZ GPS fixa (refGps:false) — kratko I toast nose upozorenje, čak i kad nema požara', () => {
  const s = makeSazetak({
    meta: { izvori:['VIIRS S-NPP'], dohvacenoMs:Date.now(), okvir:'24h', refGps:false },
    evts: [], ref: { la:44.88, lo:16.15, gps:false }
  });
  assert.match(s.kratko, /centra karte/, 'kratko: ' + s.kratko);
  assert.match(s.toast, /centra karte/, 'toast: ' + s.toast);
});

t('SA GPS fixom (refGps:true) — upozorenja NEMA', () => {
  const s = makeSazetak({
    meta: { izvori:['VIIRS S-NPP'], dohvacenoMs:Date.now(), okvir:'24h', refGps:true },
    evts: [], ref: { la:44.88, lo:16.15, gps:true }
  });
  assert.ok(!/centra karte/.test(s.kratko), 'kratko: ' + s.kratko);
  assert.ok(!/centra karte/.test(s.toast), 'toast: ' + s.toast);
});

t('upozorenje se pojavljuje i kad IMA požara, ne samo u praznom slučaju', () => {
  const s = makeSazetak({
    meta: { izvori:['VIIRS S-NPP'], dohvacenoMs:Date.now(), okvir:'24h', refGps:false },
    evts: [{ la:44.91, lo:16.20, d:5000, broj:1, sateliti:['Suomi-NPP'], zadnji:Date.now(), nov:true }],
    ref: { la:44.88, lo:16.15, gps:false }
  });
  assert.match(s.kratko, /centra karte/, 'kratko: ' + s.kratko);
});

console.log('Heatmap prekidač (v3.112.2) — localStorage getter/setter:');

const SRC_HEAT = [
  extractConst('_POZ_HEAT_KEY'),
  extractFn('_poziHeatOn'),
  extractFn('_poziHeatSet'),
].join('\n');

function makeHeat(store) {
  const renders = [];
  const sandbox = {
    localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = v; } },
    _poziRender: () => { renders.push(true); },
  };
  const keys = Object.keys(sandbox);
  const api = new Function(...keys, SRC_HEAT + '\nreturn { _poziHeatOn, _poziHeatSet };')(...keys.map(k => sandbox[k]));
  return { ...api, renders };
}

t('podrazumijevano isključeno (nema sačuvane vrijednosti)', () => {
  const h = makeHeat({});
  assert.strictEqual(h._poziHeatOn(), false);
});

t('_poziHeatSet(true) upisuje "1", osvježava kartu preko _poziRender', () => {
  const store = {};
  const h = makeHeat(store);
  h._poziHeatSet(true);
  assert.strictEqual(store['tvlake_pozari_heat'], '1');
  assert.strictEqual(h._poziHeatOn(), true);
  assert.strictEqual(h.renders.length, 1, '_poziRender mora biti pozvan da se heatmap odmah pojavi/nestane');
});

t('_poziHeatSet(false) upisuje "0"', () => {
  const store = { tvlake_pozari_heat: '1' };
  const h = makeHeat(store);
  h._poziHeatSet(false);
  assert.strictEqual(store['tvlake_pozari_heat'], '0');
  assert.strictEqual(h._poziHeatOn(), false);
});

console.log('Okvirni pravac širenja požara — vjetar+nagib terena (v3.112.3):');

const SRC_ASPEKT = [
  extractFn('_termLon2x'),
  extractFn('_termLat2y'),
  extractFn('_poziAspektNaTacki'),
].join('\n');

// Sintetička elevacija: ravnina sa KONSTANTNIM gradijentom (dzdx, dzdy su
// FINITNE RAZLIKE koje _poziAspektNaTacki treba izračunati na koraku od 2
// piksela — postavljanje elev = x*(dzdx/2) + y*(dzdy/2) garantuje tačno taj
// rezultat, nezavisno od toga koji tačno piksel test pogodi).
function makeAspekt({ dzdx = 0, dzdy = 0, tileMissing = false }) {
  const sandbox = {
    _getTerrariumTile: async () => (tileMissing ? null : {}),
    _terrariumDecodeTile: () => {
      const elev = new Float32Array(256 * 256);
      for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) elev[y * 256 + x] = x * (dzdx / 2) + y * (dzdy / 2);
      return elev;
    },
  };
  const keys = Object.keys(sandbox);
  return new Function(...keys, SRC_ASPEKT + '\nreturn _poziAspektNaTacki;')(...keys.map(k => sandbox[k]));
}

t('ravan teren (bez nagiba) → null, ne izmišlja pravac', async () => {
  const fn = makeAspekt({ dzdx: 0, dzdy: 0 });
  assert.strictEqual(await fn(44.9, 16.2), null);
});

t('nedostupna DEM pločica → null, ne baca grešku', async () => {
  const fn = makeAspekt({ dzdx: 1, dzdy: 1, tileMissing: true });
  assert.strictEqual(await fn(44.9, 16.2), null);
});

t('teren raste ka istoku → nizbrdo je zapad, UZBRDO je istok (~90°)', async () => {
  const fn = makeAspekt({ dzdx: 10, dzdy: 0 });
  const r = await fn(44.9, 16.2);
  assert.ok(r, 'mora vratiti rezultat');
  assert.ok(Math.abs(r.uzbrdo - 90) < 1, 'dobijeno ' + r.uzbrdo);
});

t('teren raste ka jugu (tile y raste na jug) → UZBRDO je jug (~180°)', async () => {
  const fn = makeAspekt({ dzdx: 0, dzdy: 10 });
  const r = await fn(44.9, 16.2);
  assert.ok(Math.abs(r.uzbrdo - 180) < 1, 'dobijeno ' + r.uzbrdo);
});

console.log('Vektorski prosjek dva pravca (_poziSmjerBlend) — ne prosta sredina stepeni:');

const { _poziSmjerBlend } = new Function(extractFn('_poziSmjerBlend') + '\nreturn { _poziSmjerBlend };')();

t('prosjek 0° i 90° je 45° (jednostavan slučaj, bez granice)', () => {
  assert.ok(Math.abs(_poziSmjerBlend(0, 90) - 45) < 0.01);
});

t('prosjek 350° i 10° mora biti ~0°, NE 180° (prosta sredina stepeni bi pukla na granici)', () => {
  const r = _poziSmjerBlend(350, 10);
  assert.ok(r < 1 || r > 359, 'očekivano ~0°/360°, dobijeno ' + r);
});

t('prosjek dva ista pravca vraća taj isti pravac', () => {
  assert.ok(Math.abs(_poziSmjerBlend(123, 123) - 123) < 0.01);
});


// ── v3.113.0: Projekcija opožarene površine ────────────────────────────────
// Ovi testovi čuvaju JEDNU ključnu odluku: oblik se NE nagađa izvan onoga što
// je satelit stvarno izmjerio. Convex hull (omotač) je prva pomisao, ali on
// popuni sve udubine — na požaru u obliku LUKA daje višestruko veću "izgorjelu"
// površinu nego što je iko vidio. Zato concave hull, a kad ni on ne uspije
// (detekcije previše razbacane) — unija baferovanih piksela, NIKAD convex.
console.log('Projekcija opožarene površine (v3.113.0):');

const _turfMod = { exports: {} };
new Function('module', 'exports', 'window', 'self',
  fs.readFileSync(path.join(__dirname, '../../static/libs/turf.min.js'), 'utf8')
)(_turfMod, _turfMod.exports, {}, {});
const _turf = _turfMod.exports;

const SRC_OPOZ = [extractFn('_poziOpozGeom'), extractFn('_poziOpozProjekcija')].join('\n');
function makeOpoz() {
  const sandbox = { turf: _turf, _POZ_GRUPA_M: 1500, _POZ_OPOZ_MAX_UNIJA: 60, _POZ_FRONT_MS: 6 * 3600 * 1000,
    _POZ_STAROST: eval('(' + extractConst('_POZ_STAROST').replace(/^const _POZ_STAROST = /, '').replace(/;\s*$/, '') + ')') };
  const keys = Object.keys(sandbox);
  return new Function(...keys, SRC_OPOZ + '\nreturn { _poziOpozGeom, _poziOpozProjekcija };')(...keys.map(k => sandbox[k]));
}
const OPOZ = makeOpoz();
const haOf = f => _turf.area(f) / 10000;
// Površina koju bi VRATIO convex hull — referentna vrijednost za poređenje
function convexHa(pts) {
  const fc = _turf.featureCollection(pts.map(p => _turf.point([p.lo, p.la])));
  return haOf(_turf.buffer(_turf.convex(fc), 0.1875, { units: 'kilometers' }));
}
// Požar u obliku LUKA — front koji obilazi vrh brda; unutrašnjost luka NIJE gorjela
function lukPts(dtIso) {
  const out = [];
  for (let i = 0; i < 14; i++) {
    const a = Math.PI * (i / 13);
    out.push({ la: 44.90 + 0.02 * Math.sin(a), lo: 16.20 + 0.028 * Math.cos(a), rez: 375, dt: dtIso || '2026-09-05T00:00:00Z' });
  }
  return out;
}

t('lučni požar: NE popunjava udubinu (concave, ne convex)', () => {
  const pts = lukPts();
  const g = OPOZ._poziOpozGeom(pts);
  assert.ok(g, 'mora vratiti geometriju');
  const ha = haOf(g), cvx = convexHa(pts);
  assert.ok(ha < cvx * 0.5,
    'concave (' + ha.toFixed(0) + ' ha) mora biti znatno manji od convex (' + cvx.toFixed(0) + ' ha)');
});

t('SVAKA detekcija mora biti UNUTAR poligona (lučni požar)', () => {
  // Prva verzija je koristila samo concave hull i na luku je ostavila desetak
  // detekcija VAN poligona — uhvaćeno tek na screenshotu, ne ovim brojkama.
  // Poligon koji ne pokriva izmjereni piksel je gori od nikakvog.
  const pts = lukPts();
  const g = OPOZ._poziOpozGeom(pts);
  const vani = pts.filter(p => !_turf.booleanPointInPolygon(_turf.point([p.lo, p.la]), g));
  assert.strictEqual(vani.length, 0, vani.length + ' detekcija je ostalo van poligona');
});

t('SVAKA detekcija unutar poligona i kad su razbacane (concave padne)', () => {
  const pts = [
    { la: 44.90, lo: 16.20, rez: 375, dt: '2026-09-05T00:00:00Z' },
    { la: 44.93, lo: 16.26, rez: 375, dt: '2026-09-05T00:00:00Z' },
    { la: 44.88, lo: 16.29, rez: 375, dt: '2026-09-05T00:00:00Z' }
  ];
  const g = OPOZ._poziOpozGeom(pts);
  const vani = pts.filter(p => !_turf.booleanPointInPolygon(_turf.point([p.lo, p.la]), g));
  assert.strictEqual(vani.length, 0, vani.length + ' detekcija je ostalo van poligona');
});

t('razbacane detekcije (concave padne): unija piksela, NE convex hull', () => {
  const pts = [
    { la: 44.90, lo: 16.20, rez: 375, dt: '2026-09-05T00:00:00Z' },
    { la: 44.93, lo: 16.26, rez: 375, dt: '2026-09-05T00:00:00Z' },
    { la: 44.88, lo: 16.29, rez: 375, dt: '2026-09-05T00:00:00Z' }
  ];
  const g = OPOZ._poziOpozGeom(pts);
  assert.ok(g, 'mora vratiti geometriju i kad concave padne');
  const ha = haOf(g), cvx = convexHa(pts);
  assert.ok(ha < cvx * 0.1,
    'unija piksela (' + ha.toFixed(0) + ' ha) ne smije biti blizu convex-a (' + cvx.toFixed(0) + ' ha)');
});

t('jedna detekcija: površina je ~jedan senzorski piksel, ne nula i ne izmišljena', () => {
  const g = OPOZ._poziOpozGeom([{ la: 44.9, lo: 16.2, rez: 375, dt: '2026-09-05T00:00:00Z' }]);
  assert.ok(g, 'jedna detekcija i dalje pokriva površinu');
  const ha = haOf(g);
  assert.ok(ha > 5 && ha < 20, 'očekivano ~11 ha (krug r=187 m), dobijeno ' + ha.toFixed(1));
});

t('MODIS piksel (1 km) daje veću površinu od VIIRS piksela (375 m)', () => {
  const v = haOf(OPOZ._poziOpozGeom([{ la: 44.9, lo: 16.2, rez: 375, dt: '2026-09-05T00:00:00Z' }]));
  const m = haOf(OPOZ._poziOpozGeom([{ la: 44.9, lo: 16.2, rez: 1000, dt: '2026-09-05T00:00:00Z' }]));
  assert.ok(m > v * 3, 'MODIS ' + m.toFixed(0) + ' ha vs VIIRS ' + v.toFixed(0) + ' ha');
});

t('požar koji gori duže: izdvaja se dio koji je VEĆ izgorio (starije od 6 h)', () => {
  const t0 = Date.parse('2026-09-05T00:00:00Z');
  const pts = [];
  // trag koji se pomjera: 8 starih (0–14 h) + 6 svježih (zadnji sat)
  for (let i = 0; i < 8; i++) pts.push({ la: 44.90 - i * 0.004, lo: 16.20 + i * 0.004, rez: 375, dt: new Date(t0 + i * 2 * 3600000).toISOString() });
  for (let i = 0; i < 6; i++) pts.push({ la: 44.87 - i * 0.002, lo: 16.23 + i * 0.002, rez: 375, dt: new Date(t0 + 20 * 3600000).toISOString() });
  const g = { pts, prvi: t0, zadnji: t0 + 20 * 3600000 };
  const pr = OPOZ._poziOpozProjekcija(g);
  assert.ok(pr && pr.ukupno, 'mora dati projekciju');
  assert.ok(pr.staro, 'mora izdvojiti stariji (već izgorjeli) dio');
  assert.ok(pr.haStaro > 0 && pr.haStaro < pr.haUkupno,
    'stariji dio (' + pr.haStaro.toFixed(1) + ') mora biti manji od ukupnog (' + pr.haUkupno.toFixed(1) + ')');
  assert.ok(Math.abs(pr.sati - 20) < 0.01, 'sati gorenja: ' + pr.sati);
});

t('požar viđen u JEDNOM preletu: ne izmišlja "već izgorjeli" dio', () => {
  const t0 = Date.parse('2026-09-05T00:00:00Z');
  const pts = lukPts(new Date(t0).toISOString());
  const pr = OPOZ._poziOpozProjekcija({ pts, prvi: t0, zadnji: t0 });
  assert.ok(pr && pr.ukupno, 'ukupna površina se i dalje računa');
  assert.strictEqual(pr.staro, null, 'nema vremenskog raspona → nema "već izgorjelo"');
  assert.strictEqual(pr.haStaro, 0);
});

t('bez detekcija → null (ne prazna geometrija, ne greška)', () => {
  assert.strictEqual(OPOZ._poziOpozProjekcija({ pts: [] }), null);
  assert.strictEqual(OPOZ._poziOpozGeom([]), null);
});

console.log('Prekidač projekcije (_poziOpozOn/_poziOpozToggle):');
{
  const store = {};
  const sandbox = {
    localStorage: { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } },
    _POZ_OPOZ_KEY: 'tvlake_pozari_opoz_proj',
    _poziOpozAzuriraj: () => { sandbox._crtano = true; },
    _poziRenderPanel: () => { sandbox._panel = true; }
  };
  const keys = Object.keys(sandbox).filter(k => !k.startsWith('_c') && !k.startsWith('_p') || k.startsWith('_POZ') || k === '_poziOpozAzuriraj' || k === '_poziRenderPanel');
  const fns = new Function('localStorage', '_POZ_OPOZ_KEY', '_poziOpozAzuriraj', '_poziRenderPanel',
    extractFn('_poziOpozOn') + '\n' + extractFn('_poziOpozToggle') + '\nreturn { _poziOpozOn, _poziOpozToggle };'
  )(sandbox.localStorage, sandbox._POZ_OPOZ_KEY, sandbox._poziOpozAzuriraj, sandbox._poziRenderPanel);

  t('podrazumijevano isključeno (nije nametnut sloj koji korisnik nije tražio)', () => {
    assert.strictEqual(fns._poziOpozOn(), false);
  });
  t('uključivanje pamti izbor i odmah precrtava kartu + panel', () => {
    fns._poziOpozToggle(true);
    assert.strictEqual(store['tvlake_pozari_opoz_proj'], '1');
    assert.ok(sandbox._crtano && sandbox._panel);
    assert.strictEqual(fns._poziOpozOn(), true);
  });
  t('isključivanje pamti "0", ne briše ključ', () => {
    fns._poziOpozToggle(false);
    assert.strictEqual(store['tvlake_pozari_opoz_proj'], '0');
    assert.strictEqual(fns._poziOpozOn(), false);
  });
}

// v3.117.1: prognoza je NAMJERNO poseban prekidač od projekcije — na terenu je
// bilo nejasno kad je jedan checkbox uključivao i trake starosti NA KARTI i
// tabelu "za 1-7 dana" u kartici odjednom. Ovi testovi čuvaju da je prognoza
// NEZAVISNA (vlastiti localStorage ključ, ne zove _poziOpozAzuriraj — nikad se
// ne crta na karti, samo mijenja sadržaj kartice).
console.log('Prekidač prognoze (_poziPrognOn/_poziPrognToggle) — NEZAVISAN od projekcije:');
{
  const store = {};
  const sandbox = {
    localStorage: { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } },
    _POZ_PROGN_KEY: 'tvlake_pozari_prognoza_prikaz',
    _poziRenderPanel: () => { sandbox._panel = true; }
  };
  const fns = new Function('localStorage', '_POZ_PROGN_KEY', '_poziRenderPanel',
    extractFn('_poziPrognOn') + '\n' + extractFn('_poziPrognToggle') + '\nreturn { _poziPrognOn, _poziPrognToggle };'
  )(sandbox.localStorage, sandbox._POZ_PROGN_KEY, sandbox._poziRenderPanel);

  t('podrazumijevano isključeno', () => {
    assert.strictEqual(fns._poziPrognOn(), false);
  });
  t('koristi SVOJ localStorage ključ, različit od projekcije', () => {
    fns._poziPrognToggle(true);
    assert.strictEqual(store['tvlake_pozari_prognoza_prikaz'], '1');
    assert.strictEqual(store['tvlake_pozari_opoz_proj'], undefined,
      'uključivanje prognoze ne smije dirati ključ projekcije');
    assert.ok(sandbox._panel, 'kartica se mora ponovo iscrtati');
  });
  t('isključivanje pamti "0"', () => {
    fns._poziPrognToggle(false);
    assert.strictEqual(store['tvlake_pozari_prognoza_prikaz'], '0');
    assert.strictEqual(fns._poziPrognOn(), false);
  });
  t('_poziPrognToggle NE zove _poziOpozAzuriraj — prognoza se nikad ne crta na karti', () => {
    // Namjerno bez _poziOpozAzuriraj u sandboxu: ako bi ga _poziPrognToggle
    // ikad pozvao, ovo baci ReferenceError i test padne.
    fns._poziPrognToggle(true);
    fns._poziPrognToggle(false);
  });
}


// ── v3.113.1: trake starosti, formatiranje površine, memoizacija ───────────
console.log('Trake starosti i prikaz površine (v3.113.1):');

const { _poziPovrsTxt } = new Function(extractFn('_poziPovrsTxt') + '\nreturn { _poziPovrsTxt };')();

t('površina se ne prikazuje lažno preciznim brojem', () => {
  assert.strictEqual(_poziPovrsTxt(3.44), '3.4 ha');      // sitno → jedna decimala
  assert.strictEqual(_poziPovrsTxt(213.8027), '214 ha');  // srednje → cijeli broj
  assert.strictEqual(_poziPovrsTxt(2450), '24.5 km²');    // veliko → km² (100 ha = 1 km²)
  assert.strictEqual(_poziPovrsTxt(0), '—');
  assert.strictEqual(_poziPovrsTxt(NaN), '—');
});

// Požar koji gori 4 dana — detekcije razvučene kroz sve četiri trake starosti
function pozarKrozTrake() {
  const zadnji = Date.parse('2026-09-07T12:00:00Z');
  const satiPrije = [96, 90, 48, 40, 20, 14, 3, 1];   // 2× po traci
  const pts = satiPrije.map((h, i) => ({
    la: 44.90 - i * 0.003, lo: 16.20 + i * 0.003, rez: 375,
    dt: new Date(zadnji - h * 3600000).toISOString()
  }));
  return { pts, prvi: zadnji - 96 * 3600000, zadnji };
}

t('požar koji gori danima se razlaže na VIŠE traka, ne u jednu tamnu mrlju', () => {
  const pr = OPOZ._poziOpozProjekcija(pozarKrozTrake());
  assert.ok(pr, 'mora dati projekciju');
  assert.strictEqual(pr.trake.length, 4, 'očekivane 4 trake, dobijeno ' + pr.trake.length);
  const ids = pr.trake.map(t => t.id);
  assert.deepStrictEqual(ids, ['front', 'd1', 'd3', 'star'], 'redoslijed: najnovija → najstarija');
  pr.trake.forEach(t => assert.ok(t.ha > 0, 'traka ' + t.id + ' mora imati površinu'));
});

t('haFront je površina zahvaćena u zadnjih 6 h, manja od ukupne', () => {
  const pr = OPOZ._poziOpozProjekcija(pozarKrozTrake());
  assert.ok(pr.haFront > 0, 'aktivan front mora imati površinu');
  assert.ok(pr.haFront < pr.haUkupno, 'front (' + pr.haFront.toFixed(1) + ') < ukupno (' + pr.haUkupno.toFixed(1) + ')');
  const front = pr.trake.find(t => t.id === 'front');
  assert.strictEqual(pr.haFront, front.ha, 'haFront mora doći baš iz front trake');
});

t('ukupno NIJE prost zbir traka (trake se preklapaju kad isto mjesto gori više puta)', () => {
  // Dvije detekcije na ISTOM mjestu, jedna stara jedna svježa — zbir traka bi
  // istu površinu izbrojao dvaput; spojena geometrija je broji jednom.
  const zadnji = Date.parse('2026-09-07T12:00:00Z');
  const pts = [
    { la: 44.90, lo: 16.20, rez: 375, dt: new Date(zadnji - 40 * 3600000).toISOString() },
    { la: 44.90, lo: 16.20, rez: 375, dt: new Date(zadnji).toISOString() }
  ];
  const pr = OPOZ._poziOpozProjekcija({ pts, prvi: zadnji - 40 * 3600000, zadnji });
  const zbir = pr.trake.reduce((s, t) => s + t.ha, 0);
  assert.ok(pr.haUkupno < zbir * 0.75,
    'ukupno (' + pr.haUkupno.toFixed(1) + ') mora biti bitno manje od zbira traka (' + zbir.toFixed(1) + ')');
});

t('detekcija bez upotrebljivog vremena ne ispada iz projekcije', () => {
  const zadnji = Date.parse('2026-09-07T12:00:00Z');
  const pts = [
    { la: 44.900, lo: 16.200, rez: 375, dt: new Date(zadnji).toISOString() },
    { la: 44.902, lo: 16.202, rez: 375, dt: 'neispravno' },
    { la: 44.904, lo: 16.204, rez: 375, dt: null }
  ];
  const pr = OPOZ._poziOpozProjekcija({ pts, prvi: zadnji, zadnji });
  const pokriveno = pts.every(p => _turf.booleanPointInPolygon(_turf.point([p.lo, p.la]), pr.ukupno));
  assert.ok(pokriveno, 'i detekcija bez vremena je izmjerena — mora biti u poligonu');
});

console.log('Memoizacija projekcije (_poziProj):');
{
  let racunato = 0;
  const fns = new Function('_poziOpozProjekcija',
    extractFn('_poziProj') + '\nreturn { _poziProj };'
  )((g) => { racunato++; return { haUkupno: 1 }; });

  t('računa se jednom po grupi, drugi poziv čita keš', () => {
    const g = { pts: [] };
    fns._poziProj(g); fns._poziProj(g); fns._poziProj(g);
    assert.strictEqual(racunato, 1, 'pozvano ' + racunato + ' puta umjesto 1');
  });
  t('null rezultat se takođe pamti — ne pokušava se ponovo svaki render', () => {
    racunato = 0;
    const fns2 = new Function('_poziOpozProjekcija',
      extractFn('_poziProj') + '\nreturn { _poziProj };'
    )(() => { racunato++; return null; });
    const g = { pts: [] };
    assert.strictEqual(fns2._poziProj(g), null);
    assert.strictEqual(fns2._poziProj(g), null);
    assert.strictEqual(racunato, 1, 'null se mora keširati, pozvano ' + racunato + 'x');
  });
}

console.log('Legenda na karti (_poziLegendaTrake):');
{
  const STAROST = eval('(' + extractConst('_POZ_STAROST').replace(/^const _POZ_STAROST = /, '').replace(/;\s*$/, '') + ')');
  function legenda({ on, poziOn, evts }) {
    return new Function('_poziOpozOn', '_poziOn', '_poziEvts', '_POZ_STAROST',
      extractFn('_poziLegendaTrake') + '\nreturn _poziLegendaTrake();'
    )(() => on, poziOn, evts, STAROST);
  }
  t('sloj isključen → prazna legenda (ne nudi boje kojih na karti nema)', () => {
    assert.deepStrictEqual(legenda({ on: false, poziOn: true, evts: [{ _proj: { trake: [{ id: 'front' }] } }] }), []);
  });
  t('prikazuje SAMO trake koje stvarno postoje na karti', () => {
    const r = legenda({ on: true, poziOn: true, evts: [
      { _proj: { trake: [{ id: 'front' }] } },
      { _proj: { trake: [{ id: 'star' }] } }
    ]});
    assert.deepStrictEqual(r.map(t => t.id), ['front', 'star'], 'bez d1/d3 kojih nema');
  });
  t('trake su uvijek u istom redoslijedu (najnovija → najstarija), bez obzira na redoslijed požara', () => {
    const r = legenda({ on: true, poziOn: true, evts: [
      { _proj: { trake: [{ id: 'star' }, { id: 'd3' }] } },
      { _proj: { trake: [{ id: 'front' }] } }
    ]});
    assert.deepStrictEqual(r.map(t => t.id), ['front', 'd3', 'star']);
  });
}



// ── v3.113.2: tempo napredovanja i produženje na 1–7 dana ─────────────────
// Ključna odluka koju ovi testovi čuvaju: tempo je NAGIB REGRESIJE kroz
// (vrijeme, kumulativna površina), a NE `ukupno / trajanje`. Već prva
// detekcija nosi cijeli senzorski piksel (~11 ha) koji se pojavio odjednom i
// nije "narastao" — dijeljenje ukupnog sa trajanjem taj početni skok pripisuje
// rastu i naduvava tempo, kod kratko posmatranog požara i višestruko.
console.log('Tempo napredovanja i prognoza (v3.113.2):');

const TEMPO = new Function('_POZ_TEMPO_MIN_H', '_POZ_PROGNOZA_DANA',
  extractFn('_poziTempo') + '\n' + extractFn('_poziPrognoza') + '\nreturn { _poziTempo, _poziPrognoza };'
)(6, 7);

t('tempo je nagib regresije: 10 ha/h kroz 4 tačke', () => {
  const pr = { kumulativ: [{h:0,ha:20},{h:10,ha:120},{h:20,ha:220},{h:30,ha:320}], haUkupno:320 };
  const r = TEMPO._poziTempo(pr);
  assert.ok(r, 'mora dati tempo');
  assert.ok(Math.abs(r.haNaSat - 10) < 1e-9, 'ha/h = ' + r.haNaSat);
  assert.ok(Math.abs(r.haNaDan - 240) < 1e-6, 'ha/dan = ' + r.haNaDan);
});

t('početni piksel se NE broji kao rast (regresija, ne ukupno/trajanje)', () => {
  // Požar koji je odmah "skočio" na 100 ha (prvi piksel/prelet), pa 10 h rastao
  // po 2 ha/h. Naivno ukupno/trajanje = 120/10 = 12 ha/h — 6× previše.
  const pr = { kumulativ: [{h:0,ha:100},{h:5,ha:110},{h:10,ha:120}], haUkupno:120 };
  const r = TEMPO._poziTempo(pr);
  assert.ok(Math.abs(r.haNaSat - 2) < 1e-9, 'očekivano 2 ha/h, dobijeno ' + r.haNaSat);
  const naivno = pr.haUkupno / 10;
  assert.ok(r.haNaSat < naivno / 3, 'regresija (' + r.haNaSat + ') mora biti daleko ispod naivnog (' + naivno + ')');
});

t('jedna tačka u vremenu → nema tempa (ne izmišlja se nagib)', () => {
  assert.strictEqual(TEMPO._poziTempo({ kumulativ: [{h:0,ha:50}], haUkupno:50 }), null);
  assert.strictEqual(TEMPO._poziTempo({ kumulativ: [], haUkupno:50 }), null);
  assert.strictEqual(TEMPO._poziTempo(null), null);
});

t('prekratak uzorak (< 6 h) → nema tempa', () => {
  const pr = { kumulativ: [{h:0,ha:20},{h:3,ha:80}], haUkupno:80 };
  assert.strictEqual(TEMPO._poziTempo(pr), null, '3 h je premalo za pouzdan nagib');
});

t('površina koja ne raste (ili se smanjuje) → nema produženja', () => {
  assert.strictEqual(TEMPO._poziTempo({ kumulativ:[{h:0,ha:100},{h:20,ha:100}], haUkupno:100 }), null);
  assert.strictEqual(TEMPO._poziTempo({ kumulativ:[{h:0,ha:100},{h:20,ha:60}],  haUkupno:60  }), null);
});

t('prognoza daje tačno 7 dana, rastuće, od TRENUTNE površine', () => {
  const pr = { kumulativ: [{h:0,ha:100},{h:10,ha:120},{h:20,ha:140}], haUkupno:140 };
  const pg = TEMPO._poziPrognoza(pr);
  assert.ok(pg, 'mora dati prognozu');
  assert.strictEqual(pg.dani.length, 7);
  assert.deepStrictEqual(pg.dani.map(d => d.dan), [1,2,3,4,5,6,7]);
  // 2 ha/h = 48 ha/dan, polazi se od 140 ha
  assert.ok(Math.abs(pg.dani[0].ha - 188) < 1e-6, 'dan 1 = ' + pg.dani[0].ha);
  assert.ok(Math.abs(pg.dani[6].ha - (140 + 48 * 7)) < 1e-6, 'dan 7 = ' + pg.dani[6].ha);
  for (let i = 1; i < pg.dani.length; i++) {
    assert.ok(pg.dani[i].ha > pg.dani[i-1].ha, 'mora rasti iz dana u dan');
  }
});

t('bez tempa nema ni prognoze (ne vraća se lista nula)', () => {
  assert.strictEqual(TEMPO._poziPrognoza({ kumulativ:[{h:0,ha:50}], haUkupno:50 }), null);
});

console.log('Kumulativna kriva iz stvarne geometrije:');

t('kumulativ raste kroz vrijeme i završava na ukupnoj površini', () => {
  const zadnji = Date.parse('2026-09-07T12:00:00Z');
  const satiPrije = [96, 90, 48, 40, 20, 14, 3, 1];
  const pts = satiPrije.map((h, i) => ({
    la: 44.90 - i * 0.003, lo: 16.20 + i * 0.003, rez: 375,
    dt: new Date(zadnji - h * 3600000).toISOString()
  }));
  const pr = OPOZ._poziOpozProjekcija({ pts, prvi: zadnji - 96 * 3600000, zadnji });
  assert.ok(pr.kumulativ.length >= 2, 'treba više tačaka za krivu');
  for (let i = 1; i < pr.kumulativ.length; i++) {
    assert.ok(pr.kumulativ[i].h > pr.kumulativ[i-1].h, 'vrijeme mora rasti (najstarija → najnovija)');
    assert.ok(pr.kumulativ[i].ha >= pr.kumulativ[i-1].ha - 1e-6, 'kumulativna površina ne smije padati');
  }
  const zadnjaKum = pr.kumulativ[pr.kumulativ.length - 1].ha;
  assert.ok(Math.abs(zadnjaKum - pr.haUkupno) < 1e-6, 'zadnja tačka krive = ukupna površina');
});

t('stvaran požar koji gori 4 dana daje upotrebljiv tempo i 7-dnevno produženje', () => {
  const zadnji = Date.parse('2026-09-07T12:00:00Z');
  const satiPrije = [96, 90, 48, 40, 20, 14, 3, 1];
  const pts = satiPrije.map((h, i) => ({
    la: 44.90 - i * 0.003, lo: 16.20 + i * 0.003, rez: 375,
    dt: new Date(zadnji - h * 3600000).toISOString()
  }));
  const pr = OPOZ._poziOpozProjekcija({ pts, prvi: zadnji - 96 * 3600000, zadnji });
  const pg = TEMPO._poziPrognoza(pr);
  assert.ok(pg, 'požar koji raste 4 dana mora dati prognozu');
  assert.ok(pg.tempo.haNaDan > 0);
  assert.ok(pg.dani[6].ha > pr.haUkupno, '7. dan mora biti veći od trenutne površine');
});



// ── v3.113.3: boja markera nosi STAROST, ne pouzdanost ─────────────────────
// Do v3.113.2 je boja značila pouzdanost senzora (crveno = visoka), pa je
// požar od prije četiri dana bio jarko crven, a onaj koji gori SADA sa
// slabijim signalom žut — obrnuto od hitnosti. Ovi testovi čuvaju novu
// semantiku i, najvažnije, da nepoznato vrijeme ne ispadne "najsvježije".
console.log('Starost markera (v3.113.3):');

const MK = new Function(
  extractConst('_POZ_MK_STAROST') + '\n' + extractFn('_poziMkStarost') +
  '\nreturn { _poziMkStarost, _POZ_MK_STAROST };'
)();
const H = 3600 * 1000;

t('detekcija stara 1 h → traka "zadnjih 6 h"', () => {
  assert.strictEqual(MK._poziMkStarost(Date.now() - 1 * H).id, 'h6');
});
t('detekcija stara 10 h → traka "6–24 h"', () => {
  assert.strictEqual(MK._poziMkStarost(Date.now() - 10 * H).id, 'h24');
});
t('detekcija stara 2 dana → traka "1–3 dana"', () => {
  assert.strictEqual(MK._poziMkStarost(Date.now() - 48 * H).id, 'd3');
});
t('detekcija stara 10 dana → traka "starije"', () => {
  assert.strictEqual(MK._poziMkStarost(Date.now() - 240 * H).id, 'st');
});

t('NEPOZNATO vrijeme ide u NAJSTARIJU traku, ne u najsvježiju', () => {
  // Zamka: (Date.now() - NaN)/3600000 je NaN, a `NaN <= 6` je false — bez
  // eksplicitne provjere bi .find vratio prvu traku i detekcija bez vremena
  // bi na karti izgledala kao da gori upravo sada.
  assert.strictEqual(MK._poziMkStarost(NaN).id, 'st');
  assert.strictEqual(MK._poziMkStarost(Date.parse('bezveze')).id, 'st');
  assert.strictEqual(MK._poziMkStarost(undefined).id, 'st');
});

t('svjetlije = svježije (boje idu od najsvjetlije ka najtamnijoj)', () => {
  const svj = (hex) => parseInt(hex.slice(1,3),16) + parseInt(hex.slice(3,5),16) + parseInt(hex.slice(5,7),16);
  const boje = MK._POZ_MK_STAROST.map(b => svj(b.fill));
  for (let i = 1; i < boje.length; i++) {
    assert.ok(boje[i] < boje[i-1],
      'traka ' + MK._POZ_MK_STAROST[i].id + ' mora biti tamnija od prethodne');
  }
});

console.log('Legenda markera (_poziLegendaMarkeri):');
{
  function legMk({ poziOn, evts }) {
    return new Function('_poziOn', '_poziEvts', '_POZ_MK_STAROST', '_poziMkStarost',
      extractFn('_poziLegendaMarkeri') + '\nreturn _poziLegendaMarkeri();'
    )(poziOn, evts, MK._POZ_MK_STAROST, MK._poziMkStarost);
  }
  t('požari isključeni → prazna legenda', () => {
    assert.deepStrictEqual(legMk({ poziOn: false, evts: [{ dt: new Date().toISOString() }] }), []);
  });
  t('prikazuje SAMO starosti koje na karti stvarno postoje', () => {
    const r = legMk({ poziOn: true, evts: [
      { dt: new Date(Date.now() - 1 * H).toISOString() },    // h6
      { dt: new Date(Date.now() - 200 * H).toISOString() }   // st
    ]});
    assert.deepStrictEqual(r.map(b => b.id), ['h6', 'st'], 'bez h24/d3 kojih nema');
  });
  t('redoslijed je uvijek najsvježije → najstarije, bez obzira na redoslijed požara', () => {
    const r = legMk({ poziOn: true, evts: [
      { dt: new Date(Date.now() - 200 * H).toISOString() },
      { dt: new Date(Date.now() - 10 * H).toISOString() },
      { dt: new Date(Date.now() - 1 * H).toISOString() }
    ]});
    assert.deepStrictEqual(r.map(b => b.id), ['h6', 'h24', 'st']);
  });
}

t('"aktivan front" se NE tvrdi za požar koji odavno nije viđen', () => {
  const zadnji = Date.now() - 4 * 24 * H;   // zadnja detekcija prije 4 dana
  const pts = [
    { la:44.900, lo:16.200, rez:375, dt:new Date(zadnji - 30 * H).toISOString() },
    { la:44.903, lo:16.203, rez:375, dt:new Date(zadnji - 28 * H).toISOString() },
    { la:44.906, lo:16.206, rez:375, dt:new Date(zadnji - 26 * H).toISOString() },
    { la:44.910, lo:16.210, rez:375, dt:new Date(zadnji).toISOString() },
    { la:44.912, lo:16.212, rez:375, dt:new Date(zadnji - 1 * H).toISOString() },
    { la:44.914, lo:16.214, rez:375, dt:new Date(zadnji - 2 * H).toISOString() }
  ];
  const pr = OPOZ._poziOpozProjekcija({ pts, prvi: zadnji - 30 * H, zadnji });
  const front = pr.trake.find(x => x.id === 'front');
  assert.ok(front, 'najnovija traka mora postojati');
  assert.ok(!/aktivan front/.test(front.naziv),
    'požar viđen zadnji put prije 4 dana ne smije pisati "aktivan front": ' + front.naziv);
  assert.match(front.naziv, /najnovije viđeno/);
});

t('svjež požar i dalje piše "aktivan front"', () => {
  const zadnji = Date.now() - 1 * H;
  const pts = [
    { la:44.900, lo:16.200, rez:375, dt:new Date(zadnji - 30 * H).toISOString() },
    { la:44.903, lo:16.203, rez:375, dt:new Date(zadnji - 28 * H).toISOString() },
    { la:44.910, lo:16.210, rez:375, dt:new Date(zadnji).toISOString() },
    { la:44.912, lo:16.212, rez:375, dt:new Date(zadnji - 1 * H).toISOString() },
    { la:44.914, lo:16.214, rez:375, dt:new Date(zadnji - 2 * H).toISOString() }
  ];
  const pr = OPOZ._poziOpozProjekcija({ pts, prvi: zadnji - 30 * H, zadnji });
  const front = pr.trake.find(x => x.id === 'front');
  assert.match(front.naziv, /aktivan front/);
});



// ── v3.114.0/v3.114.1: automatsko osvježavanje detekcija ──────────────────
// Sa terena: požar se vidio na firemap.live, a u app-u ga nije bilo. Dohvat je
// radio (drugi požari su se prikazivali), ali se osvježavanje NIJE dešavalo —
// timer je startovao samo ako su uključena obavještenja, a ona su
// podrazumijevano isključena.
// v3.114.1 (na zahtjev): timer radi SAMO dok je sekcija Požari otvorena, ne i
// kad je samo sloj uključen — sloj ostaje uključen danima, pa bi inače kucao i
// dok je korisnik na Vlakama. Obavještenja su izuzetak (javljaju dok NE gledaš).
console.log('Automatsko osvježavanje (v3.114.0 / v3.114.1):');

const SRC_AUTO = [
  // `let _poziNotifTimer` je samostalna deklaracija (ne const) — bez nje bi
  // _poziNotifTimerStop pukao na ReferenceError pri prvom čitanju.
  'let _poziNotifTimer = null;',
  extractConst('_POZ_AUTO_MS'),
  extractConst('_POZ_STALE_MS'),
  extractFn('_poziAutoTreba'),
  extractFn('_poziNotifTimerStart'),
  extractFn('_poziNotifTimerStop'),
  extractFn('_poziAutoSync'),
  extractFn('_poziOsvjeziAkoJeStaro'),
].join('\n');

function makeAuto({ tab = 'karta', notifOn = false, online = true, busy = false,
                    hidden = false, dohvacenoMs = null } = {}) {
  const stanje = { load: 0, timerId: null, tik: null };
  const sandbox = {
    _activeTab: tab,
    _poziNotifOn: () => notifOn,
    _poziBusy: busy,
    _poziMeta: dohvacenoMs === null ? {} : { dohvacenoMs },
    _poziLoad: () => { stanje.load++; },
    navigator: { onLine: online },
    document: { get hidden() { return hidden; } },
    setInterval: (fn) => { stanje.tik = fn; stanje.timerId = 1; return 1; },
    clearInterval: () => { stanje.timerId = null; },
    Date,
  };
  const keys = Object.keys(sandbox);
  const api = new Function(...keys,
    SRC_AUTO + '\nreturn { _poziAutoTreba, _poziAutoSync, _poziNotifTimerStop, _poziOsvjeziAkoJeStaro, _POZ_AUTO_MS, _POZ_STALE_MS };'
  )(...keys.map(k => sandbox[k]));
  return { api, stanje };
}

t('sekcija Požari OTVORENA, obavještenja isključena → timer radi (uzrok bug-a)', () => {
  const { api, stanje } = makeAuto({ tab: 'pozari', notifOn: false });
  assert.strictEqual(api._poziAutoTreba(), true, 'otvorena sekcija mora tražiti osvježavanje');
  api._poziAutoSync();
  assert.strictEqual(stanje.timerId, 1, 'timer mora biti pokrenut');
  stanje.tik();
  assert.strictEqual(stanje.load, 1, 'otkucaj mora dohvatiti podatke');
});

t('korisnik OTIŠAO sa sekcije → timer staje (v3.114.1, ne troši dok niko ne gleda)', () => {
  const { api, stanje } = makeAuto({ tab: 'pozari' });
  api._poziAutoSync();
  assert.strictEqual(stanje.timerId, 1);
  // isti obrazac kao switchTab: promijeni tab pa ponovo uskladi
  const drugi = makeAuto({ tab: 'vlake' });
  drugi.api._poziAutoSync();
  assert.strictEqual(drugi.stanje.timerId, null, 'van sekcije timer ne smije kucati');
  assert.strictEqual(drugi.api._poziAutoTreba(), false);
});

t('samo obavještenja uključena (van sekcije) → timer i dalje radi', () => {
  const { api, stanje } = makeAuto({ tab: 'karta', notifOn: true });
  api._poziAutoSync();
  assert.strictEqual(stanje.timerId, 1, 'obavještenja javljaju dok NE gledaš — moraju kucati');
  stanje.tik();
  assert.strictEqual(stanje.load, 1);
});

t('ni sekcija ni obavještenja → timer se ne pokreće (ne troši bateriju bez potrebe)', () => {
  const { api, stanje } = makeAuto({ tab: 'doznaka', notifOn: false });
  assert.strictEqual(api._poziAutoTreba(), false);
  api._poziAutoSync();
  assert.strictEqual(stanje.timerId, null, 'timer ne smije postojati');
});

t('otkucaj u POZADINI ne dohvaća (nadoknađuje se pri povratku)', () => {
  const { api, stanje } = makeAuto({ tab: 'pozari', hidden: true });
  api._poziAutoSync();
  stanje.tik();
  assert.strictEqual(stanje.load, 0, 'dok je app u pozadini ne trošimo podatke');
});

t('otkucaj bez mreže ili dok traje dohvat ne radi ništa', () => {
  const a = makeAuto({ tab: 'pozari', online: false });
  a.api._poziAutoSync(); a.stanje.tik();
  assert.strictEqual(a.stanje.load, 0, 'offline');
  const b = makeAuto({ tab: 'pozari', busy: true });
  b.api._poziAutoSync(); b.stanje.tik();
  assert.strictEqual(b.stanje.load, 0, 'dohvat već u toku');
});

t('interval je 10 min, prag ustajalosti 5 min', () => {
  const { api } = makeAuto({ tab: 'pozari' });
  assert.strictEqual(api._POZ_AUTO_MS, 10 * 60 * 1000);
  assert.strictEqual(api._POZ_STALE_MS, 5 * 60 * 1000);
});

console.log('Osvježavanje pri povratku u app / otvaranju panela:');

t('podaci stariji od 5 min → dohvaća odmah', () => {
  const { api, stanje } = makeAuto({ tab: 'pozari', dohvacenoMs: Date.now() - 6 * 60 * 1000 });
  api._poziOsvjeziAkoJeStaro();
  assert.strictEqual(stanje.load, 1);
});

t('svježi podaci (prije 1 min) → NE dohvaća ponovo (bez suvišnog prometa)', () => {
  const { api, stanje } = makeAuto({ tab: 'pozari', dohvacenoMs: Date.now() - 60 * 1000 });
  api._poziOsvjeziAkoJeStaro();
  assert.strictEqual(stanje.load, 0);
});

t('nikad učitano (nema dohvacenoMs) → dohvaća', () => {
  const { api, stanje } = makeAuto({ tab: 'pozari', dohvacenoMs: null });
  api._poziOsvjeziAkoJeStaro();
  assert.strictEqual(stanje.load, 1, 'prazan _poziMeta znači da podataka nema uopšte');
});

t('povratak u app dok korisnik NIJE u sekciji → ne dohvaća (v3.114.1)', () => {
  const { api, stanje } = makeAuto({ tab: 'karta', notifOn: false, dohvacenoMs: 0 });
  api._poziOsvjeziAkoJeStaro();
  assert.strictEqual(stanje.load, 0);
});

t('offline povratak u app ne baca i ne dohvaća', () => {
  const { api, stanje } = makeAuto({ tab: 'pozari', online: false, dohvacenoMs: 0 });
  api._poziOsvjeziAkoJeStaro();
  assert.strictEqual(stanje.load, 0);
});


// ── v3.114.1: vidljiva svježina + "novi od zadnje provjere" ────────────────
// Bug zbog kojeg je v3.114.0 nastala bio je NEVIDLJIV: podaci stari satima, a
// to piše sitnim sivim slovima usred rečenice sa još pet podataka.
console.log('Svježina podataka i oznaka novih (v3.114.1):');

const SRC_SVJ = [
  extractConst('_POZ_STARO_MS'),
  extractFn('_poziStarost'),
  extractFn('_poziSvjezinaHtml'),
  extractFn('_poziBrojRijecNovih'),
  extractFn('_poziNoviHtml'),
].join('\n');

function makeSvj({ poziOn = true, meta = {}, evts = [] } = {}) {
  const sandbox = { _poziOn: poziOn, _poziMeta: meta, _poziEvts: evts, _escHtml: (x) => String(x), Date };
  const keys = Object.keys(sandbox);
  return new Function(...keys, SRC_SVJ + '\nreturn { _poziSvjezinaHtml, _poziNoviHtml };')(...keys.map(k => sandbox[k]));
}

t('svježi podaci → tiha siva linija, BEZ upozorenja', () => {
  const html = makeSvj({ meta: { dohvacenoMs: Date.now() - 3 * 60 * 1000 } })._poziSvjezinaHtml();
  assert.match(html, /Osvježeno/);
  assert.ok(!/Osvježi<\/b>/.test(html), 'ne smije zvati na akciju dok su podaci svježi');
});

t('podaci stariji od 30 min → NAPADNO upozorenje sa pozivom na Osvježi', () => {
  const html = makeSvj({ meta: { dohvacenoMs: Date.now() - 90 * 60 * 1000 } })._poziSvjezinaHtml();
  assert.match(html, /Podaci su od/);
  assert.match(html, /Osvježi/);
  assert.match(html, /#b45309/, 'mora imati vidljiv (žuti) okvir, ne sivi tekst');
});

t('podaci iz keša se OZNAČE kao takvi', () => {
  const html = makeSvj({ meta: { dohvacenoMs: Date.now() - 60 * 1000, kes: true } })._poziSvjezinaHtml();
  assert.match(html, /iz keša/);
});

t('greška u dohvatu → svježina se ne prikazuje (poruka o grešci već stoji)', () => {
  assert.strictEqual(makeSvj({ meta: { greska: 'nema mreže', dohvacenoMs: Date.now() } })._poziSvjezinaHtml(), '');
});

t('sloj isključen ili nikad učitano → nema linije o svježini', () => {
  assert.strictEqual(makeSvj({ poziOn: false, meta: { dohvacenoMs: Date.now() } })._poziSvjezinaHtml(), '');
  assert.strictEqual(makeSvj({ meta: {} })._poziSvjezinaHtml(), '');
});

t('"novi od zadnje provjere" broji SAMO grupe sa nov=true', () => {
  const api = makeSvj({ evts: [{ nov: true }, { nov: false }, { nov: true }] });
  const html = api._poziNoviHtml();
  assert.match(html, /2 nova/, 'dobijeno: ' + html);
  assert.match(html, /od zadnje provjere/);
});

t('jedan nov požar — ispravna sklonidba (1 novi, ne "1 novih")', () => {
  const html = makeSvj({ evts: [{ nov: true }] })._poziNoviHtml();
  assert.match(html, /1 novi/);
});

t('nijedan nov → nema trake (ne prikazuje se "0 novih")', () => {
  assert.strictEqual(makeSvj({ evts: [{ nov: false }, { nov: false }] })._poziNoviHtml(), '');
  assert.strictEqual(makeSvj({ evts: [] })._poziNoviHtml(), '');
});


(async () => {
  for (const a of _async) {
    try { await a.p; pass++; console.log('  ✔ ' + a.name); }
    catch (e) { fail++; console.log('  ✘ ' + a.name + '\n      ' + e.message); }
  }
  console.log('\n' + pass + ' prošlo, ' + fail + ' palo');
  process.exit(fail ? 1 : 0);
})();
