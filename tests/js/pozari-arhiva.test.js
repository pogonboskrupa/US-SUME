// =====================================================================
// Testovi za arhivu opožarenih površina po godinama (index.html, v3.122.0).
// Pokretanje:  node tests/js/pozari-arhiva.test.js
// ---------------------------------------------------------------------
// Zašto ovo postoji: terenski zahtjev "gori požar više od mjesec dana a ja
// imam kraći prikaz; hoću ukupno što je gorilo i da mi se iduće godine
// prikaže kao opožarena površina iz te godine".
//
// Postojeći prikazi to nisu mogli:
//   • redovni panel radi nad 24h/48h/7d prozorom,
//   • "Ova godina" traži GFW ključ (korisnik ga NEMA — potvrđeno pitanjem),
//   • "Zadnjih 5 godina" pamti samo CENTROID grupe i samo pri PRVOM viđenju.
// Zato arhiva pamti pojedinačne detekcije iz SVAKOG osvježavanja, sa dedupom
// po (piksel, dan). Dvije stvari se moraju čuvati testom jer se tiho kvare:
//   1) dedup — bez njega arhiva raste pri svakom od desetina osvježavanja
//      dnevno i localStorage pukne,
//   2) ukupno = SPOJENA geometrija, NE zbir po požaru (isto mjesto koje gori
//      više puta kroz sezonu bi se inače brojalo dvaput).
//
// Testira se STVARNI kod izvučen iz index.html.
// =====================================================================
'use strict';
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const HTML = fs.readFileSync(path.join(__dirname, '../../index.html'), 'utf8');

function extractFn(name) {
  const start = HTML.indexOf('function ' + name + '(');
  assert.ok(start >= 0, 'nije nađena funkcija ' + name + ' u index.html');
  let i = HTML.indexOf('{', start), depth = 0;
  for (; i < HTML.length; i++) {
    if (HTML[i] === '{') depth++;
    else if (HTML[i] === '}') { depth--; if (depth === 0) return HTML.slice(start, i + 1); }
  }
  throw new Error('nezatvorena funkcija ' + name);
}
function extractConst(name) {
  const re = new RegExp('const ' + name + '\\s*=\\s*[^;]+;');
  const m = HTML.match(re);
  assert.ok(m, 'nije nađena konstanta ' + name);
  return m[0];
}

// Stvarni turf iz repoa — ista biblioteka koju koristi produkcija
const _turfMod = { exports: {} };
new Function('module', 'exports', 'window', 'self',
  fs.readFileSync(path.join(__dirname, '../../static/libs/turf.min.js'), 'utf8')
)(_turfMod, _turfMod.exports, {}, {});
const turf = _turfMod.exports;

// Lažni localStorage — arhiva je čisto localStorage stvar
function mkLS() {
  const m = {};
  return {
    getItem: k => (k in m ? m[k] : null),
    setItem: (k, v) => { m[k] = String(v); },
    removeItem: k => { delete m[k]; },
    _dump: () => m,
    _size: () => JSON.stringify(m).length
  };
}

function makeArh(opts) {
  const o = opts || {};
  const sandbox = {
    localStorage: o.ls || mkLS(),
    turf,
    _POV_ARH_KEY: 'tvlake_pozari_arhiva',
    _POV_ARH_GODINA: 5,
    _POV_ARH_MAX_GOD: o.maxGod || 20000,
    _POZ_GRUPA_M: 1500,
    _POZ_OPOZ_MAX_UNIJA: 60,
    _POZ_OPOZ_MAXEDGE_M: 500,
    _POV_ARH_BOJE: ['#38bdf8', '#a78bfa', '#2dd4bf', '#f472b6', '#94a3b8'],
    // _povArhKesOcisti zove _povArhRender kad je neka godina uključena —
    // u testu nema karte, pa se oba javljaju kao no-op.
    _povArhUkljucene: () => [],
    _povArhRender: () => {}
  };
  const src = [extractFn('dst'), extractFn('_poziPouzdanost'), extractFn('_poziSatelit'),
               extractFn('_poziGrupisi'), extractFn('_poziOpozGeom'),
               extractFn('_povArhUcitaj'), extractFn('_povArhSacuvaj'), extractFn('_povArhDan'),
               extractFn('_povArhKljuc'), extractFn('_povArhDodaj'), extractFn('_povArhGodine'),
               extractFn('_povArhTacke'), extractFn('_povArhBoja'), extractFn('_povArhBrojZapisa'),
               extractConst('_povArhKes'), extractFn('_povArhIzracunata'),
               extractFn('_povArhRacunaj'), extractFn('_povArhKesOcisti')].join('\n');
  const keys = Object.keys(sandbox);
  const mod = new Function(...keys, src +
    '\nreturn { _povArhUcitaj,_povArhSacuvaj,_povArhDan,_povArhKljuc,_povArhDodaj,' +
    '_povArhGodine,_povArhTacke,_povArhRacunaj,_povArhBoja,_povArhBrojZapisa,' +
    '_povArhIzracunata,_povArhKesOcisti,_poziGrupisi,_poziOpozGeom };'
  )(...keys.map(k => sandbox[k]));
  mod._ls = sandbox.localStorage;
  return mod;
}

const GOD = new Date().getUTCFullYear();
const iso = (god, mjesec, dan, sat) =>
  new Date(Date.UTC(god, mjesec - 1, dan, sat || 10)).toISOString();
const det = (la, lo, dtIso, rez) => ({ la, lo, dt: dtIso, rez: rez || 375 });

let pass = 0, fail = 0;
function t(name, fn) {
  try { fn(); console.log('  ✔ ' + name); pass++; }
  catch (e) { console.log('  ✘ ' + name + '\n      ' + e.message); fail++; }
}

// =====================================================================
console.log('Dedup — isti piksel viđen više puta u danu je JEDNO izgorjelo mjesto:');

t('isto osvježavanje ponovljeno 10× ne raste u arhivi', () => {
  const A = makeArh();
  const pts = [det(44.90, 16.20, iso(GOD, 7, 5)), det(44.905, 16.205, iso(GOD, 7, 5))];
  const prvi = A._povArhDodaj(pts);
  assert.strictEqual(prvi, 2, 'prvi put se upisuju obje');
  for (let i = 0; i < 10; i++) {
    assert.strictEqual(A._povArhDodaj(pts), 0, 'ponovljeno osvježavanje ne smije dodati ništa');
  }
  assert.strictEqual(A._povArhTacke(GOD).length, 2);
});

t('ISTI piksel SLJEDEĆI dan JESTE nov zapis (tako površina i raste)', () => {
  const A = makeArh();
  A._povArhDodaj([det(44.90, 16.20, iso(GOD, 7, 5))]);
  A._povArhDodaj([det(44.90, 16.20, iso(GOD, 7, 6))]);
  assert.strictEqual(A._povArhTacke(GOD).length, 2, 'dan je dio ključa, ne samo koordinate');
});

t('isti piksel u različitim SATIMA istog dana se sažima u jedan zapis', () => {
  const A = makeArh();
  A._povArhDodaj([det(44.90, 16.20, iso(GOD, 7, 5, 2))]);
  A._povArhDodaj([det(44.90, 16.20, iso(GOD, 7, 5, 13))]);
  A._povArhDodaj([det(44.90, 16.20, iso(GOD, 7, 5, 23))]);
  assert.strictEqual(A._povArhTacke(GOD).length, 1);
});

t('detekcija bez upotrebljivog datuma/koordinate se preskače, ne ruši upis', () => {
  const A = makeArh();
  const n = A._povArhDodaj([
    det(44.90, 16.20, iso(GOD, 7, 5)),
    { la: 44.9, lo: 16.2, dt: 'nije-datum' },
    { la: NaN, lo: 16.2, dt: iso(GOD, 7, 5) },
    { dt: iso(GOD, 7, 5) }
  ]);
  assert.strictEqual(n, 1, 'samo ispravna prolazi');
});

t('prazan/nedostajuć ulaz ne baca', () => {
  const A = makeArh();
  assert.strictEqual(A._povArhDodaj([]), 0);
  assert.strictEqual(A._povArhDodaj(null), 0);
});

// =====================================================================
console.log('\nRazdvajanje po godinama i obrezivanje:');

t('detekcije se razvrstavaju u godinu iz SVOG datuma, ne u tekuću', () => {
  const A = makeArh();
  A._povArhDodaj([det(44.90, 16.20, iso(GOD, 7, 5)), det(44.91, 16.21, iso(GOD - 1, 8, 9))]);
  const g = A._povArhGodine();
  assert.deepStrictEqual(g, [String(GOD), String(GOD - 1)], 'najnovija prva');
  assert.strictEqual(A._povArhTacke(GOD).length, 1);
  assert.strictEqual(A._povArhTacke(GOD - 1).length, 1);
});

t('godine starije od 5 se odbacuju pri upisu', () => {
  const A = makeArh();
  A._povArhDodaj([det(44.90, 16.20, iso(GOD - 8, 7, 5)), det(44.91, 16.21, iso(GOD, 7, 5))]);
  assert.deepStrictEqual(A._povArhGodine(), [String(GOD)]);
});

t('BUDUĆA godina se odbacuje (pokvaren sat ne smije trajno zauzeti arhivu)', () => {
  const A = makeArh();
  A._povArhDodaj([det(44.90, 16.20, iso(GOD + 3, 7, 5))]);
  assert.deepStrictEqual(A._povArhGodine(), [], 'zapis iz budućnosti se ne bi nikad sam očistio');
});

t('korumpiran localStorage se tretira kao prazna arhiva, ne ruši čitanje', () => {
  const ls = mkLS();
  ls.setItem('tvlake_pozari_arhiva', '{ovo nije json');
  assert.deepStrictEqual(makeArh({ ls })._povArhGodine(), []);
  const ls2 = mkLS();
  ls2.setItem('tvlake_pozari_arhiva', '[1,2,3]');
  assert.deepStrictEqual(makeArh({ ls: ls2 })._povArhGodine(), []);
});

t('strani ključ u arhivi se odbacuje po godini, ostatak preživi', () => {
  const ls = mkLS();
  ls.setItem('tvlake_pozari_arhiva',
    JSON.stringify({ [String(GOD)]: [[44.9, 16.2, 100, 375]], 'smece': [[1, 2, 3, 4]] }));
  assert.deepStrictEqual(makeArh({ ls })._povArhGodine(), [String(GOD)]);
});

t('zapis je KOMPAKTAN niz od 4 elementa (ne objekat) — arhiva mora ostati mala', () => {
  const A = makeArh();
  A._povArhDodaj([det(44.9012345, 16.2098765, iso(GOD, 7, 5), 1000)]);
  const sirovo = JSON.parse(A._ls.getItem('tvlake_pozari_arhiva'))[String(GOD)][0];
  assert.ok(Array.isArray(sirovo), 'zapis mora biti niz');
  assert.strictEqual(sirovo.length, 4);
  assert.strictEqual(sirovo[0], 44.9012, 'koordinate zaokružene na 4 decimale (~11 m)');
  assert.strictEqual(sirovo[3], 1000, 'rezolucija se MORA sačuvati — o njoj zavisi bafer');
});

t('rezolucija koja nedostaje pada na VIIRS 375, ne na undefined', () => {
  const A = makeArh();
  A._povArhDodaj([{ la: 44.9, lo: 16.2, dt: iso(GOD, 7, 5) }]);
  assert.strictEqual(A._povArhTacke(GOD)[0].rez, 375);
});

t('povratak u {la,lo,dt,rez} daje datum unutar iste godine', () => {
  const A = makeArh();
  A._povArhDodaj([det(44.90, 16.20, iso(GOD, 7, 5))]);
  const p = A._povArhTacke(GOD)[0];
  assert.strictEqual(new Date(p.dt).getUTCFullYear(), GOD);
  assert.strictEqual(new Date(p.dt).getUTCMonth(), 6, 'juli');
  assert.strictEqual(new Date(p.dt).getUTCDate(), 5);
});

// =====================================================================
console.log('\nUkupna površina — SPOJENA geometrija, ne zbir po požaru:');

// Požar koji tinja: ISTO mjesto gori kroz 5 različitih dana.
function istoMjestoViseDana(dana) {
  const out = [];
  for (let d = 1; d <= dana; d++) out.push(det(44.90, 16.20, iso(GOD, 7, d)));
  return out;
}

t('isto mjesto koje gori 5 dana NE daje 5× veću površinu', () => {
  const A = makeArh();
  A._povArhDodaj(istoMjestoViseDana(5));
  assert.strictEqual(A._povArhTacke(GOD).length, 5, 'svih 5 dana je u arhivi');
  const r = A._povArhRacunaj(GOD);
  assert.ok(r, 'mora dati rezultat');
  // Jedan VIIRS piksel = krug r=137.5 m ≈ 5.94 ha (v3.119.3). Pet dana na
  // ISTOM mjestu je i dalje to isto mjesto.
  const jedan = Math.PI * 137.5 * 137.5 / 10000;
  assert.ok(Math.abs(r.ha - jedan) / jedan < 0.05,
    'očekivano ~' + jedan.toFixed(1) + ' ha (jedno mjesto), dobijeno ' + r.ha.toFixed(1));
});

t('požar koji se ŠIRI kroz dane daje VEĆU površinu (rast se stvarno hvata)', () => {
  const A = makeArh();
  // front se pomjera ~200 m dnevno kroz 8 dana
  const pts = [];
  for (let d = 1; d <= 8; d++) pts.push(det(44.90 + d * 0.0018, 16.20, iso(GOD, 7, d)));
  A._povArhDodaj(pts);
  const r = A._povArhRacunaj(GOD);
  const jedan = Math.PI * 137.5 * 137.5 / 10000;
  assert.ok(r.ha > jedan * 2,
    'raširen požar mora biti znatno veći od jednog piksela: ' + r.ha.toFixed(1) + ' ha');
});

t('dva ODVOJENA požara se sabiraju (ne preklapaju se, pa nema dvostrukog brojanja)', () => {
  const A = makeArh();
  A._povArhDodaj([det(44.90, 16.20, iso(GOD, 7, 5)), det(45.10, 16.60, iso(GOD, 8, 9))]);
  const r = A._povArhRacunaj(GOD);
  const jedan = Math.PI * 137.5 * 137.5 / 10000;
  assert.strictEqual(r.brojPozara, 2, 'dva udaljena mjesta su dva požara');
  assert.ok(Math.abs(r.ha - 2 * jedan) / (2 * jedan) < 0.05,
    'očekivano ~' + (2 * jedan).toFixed(1) + ' ha, dobijeno ' + r.ha.toFixed(1));
});

t('rezultat nosi broj požara i broj detekcija, ne samo hektare', () => {
  const A = makeArh();
  A._povArhDodaj(istoMjestoViseDana(4));
  const r = A._povArhRacunaj(GOD);
  assert.strictEqual(r.brojDetekcija, 4);
  assert.strictEqual(r.brojPozara, 1);
});

t('prazna godina vraća null, ne nulu i ne izmišljenu geometriju', () => {
  const A = makeArh();
  assert.strictEqual(A._povArhRacunaj(GOD), null);
  assert.strictEqual(A._povArhRacunaj(GOD - 2), null);
});

t('rezultat je memoizovan (druga računica vraća ISTI objekat)', () => {
  const A = makeArh();
  A._povArhDodaj(istoMjestoViseDana(3));
  const a = A._povArhRacunaj(GOD);
  assert.strictEqual(A._povArhRacunaj(GOD), a, 'geometrija je najskuplji dio, ne smije se ponavljati');
});

// =====================================================================
console.log('\nKeš — osvježavanje ne smije poništiti posao za SVE godine:');

t('godina nije "izračunata" dok se stvarno ne zatraži', () => {
  const A = makeArh();
  A._povArhDodaj(istoMjestoViseDana(3));
  assert.strictEqual(A._povArhIzracunata(GOD), false, 'kartica po ovome odlučuje da NE računa');
  A._povArhRacunaj(GOD);
  assert.strictEqual(A._povArhIzracunata(GOD), true);
});

t('čišćenje keša za TEKUĆU godinu ne dira prošle (inače bi svako osvježavanje bacilo sav posao)', () => {
  const A = makeArh();
  A._povArhDodaj([det(44.90, 16.20, iso(GOD, 7, 5)), det(45.20, 16.70, iso(GOD - 1, 8, 9))]);
  const lani = A._povArhRacunaj(GOD - 1);
  A._povArhRacunaj(GOD);
  A._povArhKesOcisti(GOD);                       // ono što radi _poziLoad na 10 min
  assert.strictEqual(A._povArhIzracunata(GOD), false, 'tekuća se mora preračunati');
  assert.strictEqual(A._povArhIzracunata(GOD - 1), true, 'prošla godina se NE mijenja, keš ostaje');
  assert.strictEqual(A._povArhRacunaj(GOD - 1), lani, 'i to isti objekat, bez ponovnog računa');
});

t('broj zapisa je dostupan BEZ računanja geometrije', () => {
  const A = makeArh();
  A._povArhDodaj(istoMjestoViseDana(4));
  assert.strictEqual(A._povArhBrojZapisa(GOD), 4);
  assert.strictEqual(A._povArhIzracunata(GOD), false, 'čitanje broja ne smije okinuti geometriju');
  assert.strictEqual(A._povArhBrojZapisa(GOD - 3), 0, 'godina bez zapisa daje 0, ne baca');
});

console.log('\nBoja godine:');

t('ista godina uvijek daje istu boju (ne zavisi od redoslijeda u listi)', () => {
  const A = makeArh();
  assert.strictEqual(A._povArhBoja(2026), A._povArhBoja('2026'));
  assert.strictEqual(A._povArhBoja(2026), A._povArhBoja(2026));
});

t('susjedne godine se razlikuju po boji', () => {
  const A = makeArh();
  assert.notStrictEqual(A._povArhBoja(2026), A._povArhBoja(2025));
  assert.notStrictEqual(A._povArhBoja(2025), A._povArhBoja(2024));
});

console.log('\n' + pass + ' prošlo, ' + fail + ' palo');
process.exit(fail ? 1 : 0);
