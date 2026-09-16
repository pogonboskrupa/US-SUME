// =====================================================================
// Testovi za uglačavanje snimljenog traga/vlake (index.html).
// Pokretanje:  node tests/js/ugladi.test.js
// ---------------------------------------------------------------------
// Zašto ovi testovi postoje: terenska prijava (v3.120.0) uz screenshot —
// "vratio sam se istim putem oko 5 metara a uvijek pokaže ovako cik-cak".
// Postojeći "Ugladi trag" je bio SAMO Douglas-Peucker + _removeOutliers, a
// oba mjere OKOMITO odstupanje od linije kroz susjede. Vraćanje istim putem
// je UZDUŽNO — nevidljivo za oba, bez obzira na podešenu jačinu.
//
// Testira se STVARNI izvorni kod izvučen iz index.html (ne kopija) — inače
// bi test mogao prolaziti nad logikom koja u aplikaciji ne postoji.
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

const NAMES = ['dst', 'calcL', '_dpSimplifyGeo', '_removeOutliers', '_zbijPetljeProlaz',
               '_zbijPetlje', '_uglObradi', '_tragPtsUObj', '_tragPtsIzObj'];
const M = new Function(
  NAMES.map(extractFn).join('\n') + '\nreturn {' + NAMES.join(',') + '};')();
const { dst, calcL, _dpSimplifyGeo, _removeOutliers, _zbijPetlje, _uglObradi,
        _tragPtsUObj, _tragPtsIzObj } = M;

// ── Pomoćno: ravan lokalni koordinatni sistem u metrima oko jedne tačke ──
const LA0 = 44.90, LO0 = 16.20;
const MLAT = 111320, MLON = 111320 * Math.cos(LA0 * Math.PI / 180);
const mk = (x, y) => ({ la: LA0 + y / MLAT, lo: LO0 + x / MLON });
const X = p => (p.lo - LO0) * MLON;

// Deterministički šum — repro mora dati iste brojke pri svakom pokretanju
// (Math.random bi pravio test koji "ponekad" pada, najgora vrsta testa).
let _s = 1;
const seed = v => { _s = v; };
const noise = amp => { _s = (_s * 1103515245 + 12345) % 2147483648; return ((_s / 2147483648) - 0.5) * 2 * amp; };

// Koliko metara linija ide UNAZAD po x-osi — mjera preostalog cik-caka
function metriUnazad(pts) {
  let m = 0;
  for (let i = 1; i < pts.length; i++) { const d = X(pts[i]) - X(pts[i-1]); if (d < 0) m += -d; }
  return m;
}
// Krivudava trasa (S-krivina) — realna vlaka nije prava linija; na pravoj bi
// DP srušio sve na 2 tačke i "slučajno" uklonio cik-cak, pa bi test lagao.
const trasa = d => [d, 6 * Math.sin(d / 60 * 2 * Math.PI)];

function snimakSaPovratkom() {
  seed(1);
  const ds = [];
  for (let d = 0; d <= 30; d += 2) ds.push(d);
  for (let d = 28; d >= 25; d -= 2) ds.push(d);   // vraćanje 5 m istim putem
  for (let d = 27; d <= 60; d += 2) ds.push(d);
  return ds.map(d => { const [x, y] = trasa(d); return mk(x + noise(1), y + noise(1)); });
}

let pass = 0, fail = 0;
function t(name, fn) {
  try { fn(); console.log('  ✔ ' + name); pass++; }
  catch (e) { console.log('  ✘ ' + name + '\n      ' + e.message); fail++; }
}

// =====================================================================
console.log('Zašto je novi algoritam uopšte trebao — DP ne vidi uzdužno vraćanje:');

t('POSTOJEĆI DP na maloj jačini ostavlja cik-cak netaknutim (uzrok prijave)', () => {
  const rec = snimakSaPovratkom();
  const prije = metriUnazad(rec);
  const poslije = metriUnazad(_dpSimplifyGeo(_removeOutliers(rec), 1));
  assert.ok(prije > 3, 'repro mora sadržavati stvarno vraćanje, ima ' + prije.toFixed(1) + ' m');
  assert.ok(poslije > 3,
    'DP eps=1 mora OSTAVITI vraćanje (' + poslije.toFixed(1) + ' m) — to je greška koju prijava opisuje');
});

t('DP jačina dovoljna da ubije cik-cak istovremeno desetkuje pravu geometriju', () => {
  const rec = snimakSaPovratkom();
  const jak = _dpSimplifyGeo(_removeOutliers(rec), 2);
  assert.ok(metriUnazad(jak) < 0.5, 'eps=2 ukloni vraćanje');
  // ...ali po cijenu koju novi put ne plaća (provjereno u sljedećem testu)
  assert.ok(jak.length <= rec.length * 0.25,
    'eps=2 mora srezati na ≤25% tačaka (' + jak.length + '/' + rec.length + ')');
});

t('NOVO: petlje se uklone a geometrija ostane — više tačaka nego kod jakog DP-a', () => {
  const rec = snimakSaPovratkom();
  const jakDP = _dpSimplifyGeo(_removeOutliers(rec), 2);
  const novi  = _uglObradi(rec, 5, 1);
  assert.ok(metriUnazad(novi) < 0.5,
    'vraćanje mora nestati, ostalo ' + metriUnazad(novi).toFixed(1) + ' m');
  assert.ok(novi.length > jakDP.length,
    'novi put mora sačuvati VIŠE geometrije (' + novi.length + ') nego jak DP (' + jakDP.length + ')');
});

t('NOVO: izmjerena dužina se približava stvarnoj (cik-cak je naduvava)', () => {
  const rec = snimakSaPovratkom();
  const STVARNO = 60;
  const dPrije = calcL(rec), dPoslije = calcL(_uglObradi(rec, 5, 1));
  assert.ok(dPrije > STVARNO + 15, 'snimak mora biti naduvan, ' + dPrije.toFixed(1) + ' m');
  assert.ok(Math.abs(dPoslije - STVARNO) < Math.abs(dPrije - STVARNO),
    'poslije (' + dPoslije.toFixed(1) + ') mora biti bliže stvarnih 60 m nego prije (' + dPrije.toFixed(1) + ')');
});

// =====================================================================
console.log('\nZaboravljena pauza — mirovanje u mjestu:');

function snimakMirovanja(driftM, brojFiksova) {
  seed(1);
  const pts = [];
  for (let d = 0; d <= 30; d += 2) { const [x, y] = trasa(d); pts.push(mk(x + noise(1), y + noise(1))); }
  const [sx, sy] = trasa(30);
  for (let k = 0; k < brojFiksova; k++) pts.push(mk(sx + noise(driftM), sy + noise(driftM)));
  for (let d = 32; d <= 60; d += 2) { const [x, y] = trasa(d); pts.push(mk(x + noise(1), y + noise(1))); }
  return pts;
}

t('40 fiksova u mjestu naduva dužinu preko 3× — novi algoritam to sruši', () => {
  const rec = snimakMirovanja(3, 40);
  const dPrije = calcL(rec);
  const dPoslije = calcL(_uglObradi(rec, 5, 1));
  assert.ok(dPrije > 150, 'mirovanje mora naduvati dužinu, ' + dPrije.toFixed(1) + ' m (stvarno 60)');
  assert.ok(dPoslije < dPrije * 0.55,
    'poslije mora pasti ispod 55% (' + dPoslije.toFixed(1) + ' vs ' + dPrije.toFixed(1) + ')');
});

t('POSTOJEĆI DP na istom mirovanju jedva pomogne (dokaz da nije bio dovoljan)', () => {
  const rec = snimakMirovanja(3, 40);
  const dp = calcL(_dpSimplifyGeo(_removeOutliers(rec), 2));
  const novi = calcL(_uglObradi(rec, 5, 1));
  assert.ok(dp > novi * 1.5,
    'DP (' + dp.toFixed(1) + ') mora ostati znatno naduvan naspram novog (' + novi.toFixed(1) + ')');
});

t('VIŠE PROLAZA je nužno kad drift prelazi krug — jedan prolaz nije dovoljan', () => {
  const rec = snimakMirovanja(3, 40);
  const jedan = calcL(_zbijPetlje(rec, 5, 1));
  const dva   = calcL(_zbijPetlje(rec, 5, 4));
  assert.ok(dva < jedan * 0.85,
    'drugi prolaz mora dodatno sažeti (' + dva.toFixed(1) + ' vs ' + jedan.toFixed(1) + ')');
});

t('ponavljanje staje samo od sebe (stabilno stanje, ne mrvi trag do kraja)', () => {
  const rec = snimakMirovanja(3, 40);
  const a = _zbijPetlje(rec, 5, 4);
  const b = _zbijPetlje(a, 5, 4);
  assert.strictEqual(b.length, a.length, 'drugi poziv nad već sažetim ne smije ništa dalje jesti');
});

// =====================================================================
console.log('\nKONTROLA — šta se NE SMIJE pojesti:');

t('obično pravolinijsko hodanje ostaje NETAKNUTO (ni jedna tačka, ni jedan metar)', () => {
  seed(3);
  const hod = [];
  for (let d = 0; d <= 100; d += 2) hod.push(mk(d + noise(0.5), noise(0.5)));
  const out = _zbijPetlje(hod, 5, 4);
  assert.strictEqual(out.length, hod.length,
    'hodanje pravo se NE smije prorjeđivati (' + hod.length + ' → ' + out.length + ')');
  assert.ok(Math.abs(calcL(out) - calcL(hod)) < 0.001, 'dužina mora ostati identična');
});

t('STVARNA serpentina širine 14 m preživi u cijelosti (špic-okret nije greška)', () => {
  seed(7);
  const pts = [];
  for (let d = 0; d <= 40; d += 2) pts.push(mk(d + noise(0.6), noise(0.6)));
  for (let d = 38; d >= 0; d -= 2) pts.push(mk(d + noise(0.6), 14 + noise(0.6)));
  const prije = calcL(pts), poslije = calcL(_zbijPetlje(pts, 5, 4));
  assert.ok(Math.abs(poslije - prije) < 0.5,
    'stvarni okret mora ostati (' + prije.toFixed(1) + ' → ' + poslije.toFixed(1) + ' m)');
});

t('granica je poznata i dokumentovana: okret uži od kruga SE poravna', () => {
  // Ovo NIJE greška nego svjesna cijena — okret uži od 6 m nije prohodan za
  // traktor/forvarder. Test postoji da granica ostane MJERENA, a ne
  // pretpostavljena, ako se algoritam ikad mijenja.
  seed(7);
  const uski = [];
  for (let d = 0; d <= 40; d += 2) uski.push(mk(d + noise(0.6), noise(0.6)));
  for (let d = 38; d >= 0; d -= 2) uski.push(mk(d + noise(0.6), 4 + noise(0.6)));
  const prije = calcL(uski), poslije = calcL(_zbijPetlje(uski, 5, 4));
  assert.ok(poslije < prije * 0.85, 'okret od 4 m se na krugu od 5 m poravna — očekivano');

  seed(7);
  const sigurni = [];
  for (let d = 0; d <= 40; d += 2) sigurni.push(mk(d + noise(0.6), noise(0.6)));
  for (let d = 38; d >= 0; d -= 2) sigurni.push(mk(d + noise(0.6), 6 + noise(0.6)));
  const p2 = calcL(sigurni), q2 = calcL(_zbijPetlje(sigurni, 5, 4));
  assert.ok(Math.abs(q2 - p2) < 0.5, 'već na 6 m okret mora biti potpuno siguran');
});

t('krug 0 (isključeno) ne dira ništa', () => {
  const rec = snimakSaPovratkom();
  assert.strictEqual(_zbijPetlje(rec, 0).length, rec.length);
  assert.strictEqual(_zbijPetlje(rec, -1).length, rec.length);
});

t('krajnje tačke su SIDRA — početak i kraj se ne pomjeraju', () => {
  // Početak vlake se veže na put ili matičnu vlaku, kraj na sljedeći krak;
  // pomjeranje na centroid bi tiho raskinulo taj spoj.
  seed(5);
  const pts = [];
  for (let k = 0; k < 12; k++) pts.push(mk(noise(2), noise(2)));        // mirovanje na POČETKU
  for (let d = 6; d <= 40; d += 2) pts.push(mk(d + noise(0.5), noise(0.5)));
  for (let k = 0; k < 12; k++) pts.push(mk(40 + noise(2), noise(2)));   // mirovanje na KRAJU
  const out = _zbijPetlje(pts, 5, 4);
  assert.ok(out.length < pts.length, 'mirovanje se ipak mora sažeti');
  assert.strictEqual(out[0].la, pts[0].la, 'prva tačka mora ostati originalna');
  assert.strictEqual(out[0].lo, pts[0].lo);
  assert.strictEqual(out[out.length-1].la, pts[pts.length-1].la, 'zadnja tačka mora ostati originalna');
  assert.strictEqual(out[out.length-1].lo, pts[pts.length-1].lo);
});

t('oznaka GPS prekida (gap) se PRENOSI na sažetu tačku, ne proguta', () => {
  seed(5);
  const pts = [];
  for (let k = 0; k < 10; k++) pts.push(mk(20 + noise(2), noise(2)));
  pts[5].gap = true;                                    // prekid usred mirovanja
  for (let d = 26; d <= 40; d += 2) pts.push(mk(d + noise(0.5), noise(0.5)));
  const out = _zbijPetlje(pts, 5, 4);
  assert.ok(out.length < pts.length, 'mirovanje se mora sažeti');
  assert.ok(out.some(p => p.gap === true),
    'upozorenje "provjeri ovaj dio traga" ne smije nestati sažimanjem');
});

t('premalo tačaka (< 3) prolazi nepromijenjeno, ne baca', () => {
  assert.strictEqual(_zbijPetlje([], 5).length, 0);
  assert.strictEqual(_zbijPetlje([mk(0,0)], 5).length, 1);
  assert.strictEqual(_zbijPetlje([mk(0,0), mk(5,0)], 5).length, 2);
  assert.doesNotThrow(() => _zbijPetlje(null, 5));
});

// =====================================================================
console.log('\nAdapter za tragove (nizovi, ne objekti):');

t('tam-i-nazad konverzija čuva visinu, vrijeme i tačnost', () => {
  const pts = [[44.9, 16.2, 315, 1700000000000, 8], [44.901, 16.201, 318, 1700000005000, 6]];
  const nazad = _tragPtsIzObj(_tragPtsUObj(pts));
  assert.deepStrictEqual(nazad, pts, 'trag tačke moraju proći kroz adapter bez gubitka');
});

t('uglačan trag zadrži oblik niza [la,lo,alt,ts,acc] — ne objekte', () => {
  seed(1);
  const raw = [];
  for (let d = 0; d <= 20; d += 2) raw.push([LA0 + noise(0.00001), LO0 + d / MLON, 300 + d, 1700000000000 + d * 1000, 7]);
  for (let k = 0; k < 15; k++) raw.push([LA0 + noise(0.00002), LO0 + (20 + noise(2)) / MLON, 320, 1700000030000 + k * 1000, 7]);
  const out = _tragPtsIzObj(_uglObradi(_tragPtsUObj(raw), 5, 1));
  assert.ok(out.length < raw.length, 'mirovanje na kraju se mora sažeti');
  assert.ok(Array.isArray(out[0]) && out[0].length === 5, 'tačka mora ostati niz od 5 elemenata');
  assert.strictEqual(typeof out[0][3], 'number', 'timestamp mora preživjeti');
});

t('sažeta tačka nosi vrijeme PRVE tačke niza (dolazak), ne zadnje', () => {
  const T0 = 1700000000000;
  const raw = [];
  raw.push([LA0, LO0, 300, T0, 5]);
  for (let k = 1; k < 12; k++) raw.push([LA0 + (k % 3) * 0.000009, LO0 + (k % 2) * 0.000009, 300, T0 + k * 10000, 5]);
  raw.push([LA0, LO0 + 40 / MLON, 300, T0 + 200000, 5]);
  const out = _tragPtsIzObj(_zbijPetlje(_tragPtsUObj(raw), 5, 4));
  assert.ok(out.length < raw.length, 'mirovanje se mora sažeti');
  assert.ok(out[0][3] === T0, 'prva tačka nosi vrijeme dolaska ' + out[0][3]);
});

console.log('\n' + pass + ' prošlo, ' + fail + ' palo');
process.exit(fail ? 1 : 0);
