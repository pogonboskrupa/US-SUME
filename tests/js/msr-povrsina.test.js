// =====================================================================
// Testovi za popravke alata "Izmjeri" — mjerenje površina (v1.4.4).
// Pokretanje:  node tests/js/msr-povrsina.test.js
// ---------------------------------------------------------------------
// Terenska prijava, tri dijela:
//  1) samo-presijecajući poligon (korisnik pređe preko već obilježenog
//     dijela granice) se NE smije brojati kao dvije pune preklapajuće
//     površine — _msrPoligonPovrsina spaja (union), ne sabira, dijelove.
//  2) Undo zadnje tačke (msrUndo) — dosad postojalo samo brisanje CIJELE
//     tačke preko desnog klika na marker.
//  3) Zajednički crosshair (#map-center-dot) umjesto #msr-xhair — vidi
//     komentar u index.html o position:fixed vs position:absolute.
//
// Testira se STVARNI kod izvučen iz index.html.
// =====================================================================
'use strict';
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const HTML = fs.readFileSync(path.join(__dirname, '../../index.html'), 'utf8');

// Stvarni turf iz repoa (isti fajl kao produkcija) — turf.min.js nije čist
// CommonJS modul, pa se ručno izvršava kao UMD wrapper (isti obrazac kao
// pozari-arhiva.test.js).
const _turfMod = { exports: {} };
new Function('module', 'exports', 'require', 'define',
  fs.readFileSync(path.join(__dirname, '../../static/libs/turf.min.js'), 'utf8')
)(_turfMod, _turfMod.exports, {}, {});
const turf = _turfMod.exports;

function extractFn(name) {
  let start = HTML.indexOf('async function ' + name + '(');
  if (start < 0) start = HTML.indexOf('function ' + name + '(');
  if (start < 0) throw new Error('nije nađena funkcija ' + name);
  let i = HTML.indexOf('{', start), depth = 0;
  for (; i < HTML.length; i++) {
    if (HTML[i] === '{') depth++;
    else if (HTML[i] === '}') { depth--; if (depth === 0) return HTML.slice(start, i + 1); }
  }
  throw new Error('nezatvorena funkcija ' + name);
}

let pass = 0, fail = 0;
function t(name, fn) {
  try { fn(); console.log('  ✔ ' + name); pass++; }
  catch (e) { fail++; console.log('  ✘ ' + name + '\n      ' + e.message); }
}

console.log('_msrPoligonPovrsina — ne broji dvaput preklapajući dio (v1.4.4):');

const SRC_POVRSINA = [extractFn('_msrSphericalArea'), extractFn('_msrPoligonPovrsina')].join('\n');
function makePovrsina() {
  return new Function('turf', SRC_POVRSINA + '\nreturn { _msrSphericalArea, _msrPoligonPovrsina };')(turf);
}
const P = (lat, lng) => ({ lat, lng });

t('prost (nepresijecajući) kvadrat — nova funkcija daje ISTU površinu kao stara formula', () => {
  const api = makePovrsina();
  // ~100m x 100m kvadrat na 45°N
  const pts = [P(45.000, 16.000), P(45.000, 16.00127), P(45.0009, 16.00127), P(45.0009, 16.000)];
  const stara = api._msrSphericalArea(pts);
  const nova = api._msrPoligonPovrsina(pts);
  const razlikaPct = Math.abs(nova - stara) / stara * 100;
  assert.ok(razlikaPct < 1, 'prost poligon: razlika mora biti zanemarljiva (' + razlikaPct.toFixed(2) + '%)');
});

t('samo-presijecajući poligon ("figura-8") — unkink+union NE udvostručava površinu', () => {
  const api = makePovrsina();
  // Dva kvadrata spojena u jedan prsten tako da se linija sama presijeca
  // na sredini (klasična "bowtie"/figura-8) — svaki lobus je ~50x50m.
  const pts = [
    P(45.0000, 16.00000), P(45.0000, 16.00064), P(45.0005, 16.00000), P(45.0005, 16.00064),
  ];
  const nova = api._msrPoligonPovrsina(pts);
  // Površina JEDNOG lobusa (~50x50m ≈ 2500 m² na ovoj širini) — unkink treba
  // vratiti otprilike DVA takva lobusa spojena (union), NE četverostruko više
  // niti nulu (do koje bi mogla dovesti naivna signed-area formula).
  assert.ok(nova > 1000 && nova < 8000,
    'površina bowtie oblika mora biti reda veličine dva lobusa, ne 0 i ne nerazumno velika: ' + nova.toFixed(0) + ' m²');
});

t('manje od 3 tačke → pada na staru formulu (ne baca)', () => {
  const api = makePovrsina();
  assert.strictEqual(api._msrPoligonPovrsina([P(45, 16), P(45, 16.01)]), api._msrSphericalArea([P(45, 16), P(45, 16.01)]));
});

t('turf nedostupan → siguran fallback na staru formulu, ne baca', () => {
  const withoutTurf = new Function(SRC_POVRSINA + '\nreturn { _msrPoligonPovrsina, _msrSphericalArea };')(undefined);
  const pts = [P(45.000, 16.000), P(45.000, 16.00127), P(45.0009, 16.00127), P(45.0009, 16.000)];
  assert.strictEqual(withoutTurf._msrPoligonPovrsina(pts), withoutTurf._msrSphericalArea(pts));
});

console.log('\nmsrUndo — poništi zadnju tačku (v1.4.4):');

// _msrDrawLastPt se u msrUndo REASSIGN-uje (ne mutira postojeći objekat) —
// vrijednost proslijeđena kao parametar Function-a se zato ne može očitati
// nazad preko istog sandbox objekta (parametar je kopija reference, ne
// live veza). Zato run() vraća finalno stanje IZ ISTOG scope-a preko
// eksplicitnog "return", umjesto da se čita sandbox.* poslije poziva.
function runUndo(pts, drawLastPtPrije) {
  const calls = { redraw: 0, panel: 0, sync: 0 };
  const src = [extractFn('msrUndo'), extractFn('_msrUpdUndoBtn')].join('\n');
  const btn = { style: { display: '' } };
  const sandbox = {
    _msrPts: pts.slice(),
    _msrDrawLastPt: drawLastPtPrije,
    _msrOn: true,
    _msrRedraw: () => calls.redraw++,
    _msrUpdPanel: () => calls.panel++,
    _msrSyncRegistry: () => calls.sync++,
    document: { getElementById: (id) => id === 'btn-msr-undo' ? btn : null },
  };
  const keys = Object.keys(sandbox);
  const rez = new Function(...keys, src + '\nmsrUndo();\nreturn { pts:_msrPts, drawLastPt:_msrDrawLastPt };')
    (...keys.map(k => sandbox[k]));
  return { ...rez, calls, btn };
}

t('undo uklanja TAČNO zadnju tačku, ostale ostaju netaknute', () => {
  const pts = [{ lat: 1, lng: 1 }, { lat: 2, lng: 2 }, { lat: 3, lng: 3 }];
  const r = runUndo(pts, { la: 999, lo: 999 });
  assert.deepStrictEqual(r.pts, [{ lat: 1, lng: 1 }, { lat: 2, lng: 2 }]);
});

t('undo resetuje _msrDrawLastPt na NOVU zadnju tačku (ne ostaje na obrisanoj)', () => {
  const pts = [{ lat: 1, lng: 1 }, { lat: 2, lng: 2 }];
  const r = runUndo(pts, { la: 999, lo: 999 });
  assert.deepStrictEqual(r.drawLastPt, { la: 1, lo: 1 },
    'nakon undo-a prag "Crtaj" moda mora mjeriti od PREOSTALE zadnje tačke, ne od obrisane');
});

t('undo do PRAZNE liste postavlja _msrDrawLastPt na null (ne na staru vrijednost)', () => {
  const pts = [{ lat: 1, lng: 1 }];
  const r = runUndo(pts, { la: 999, lo: 999 });
  assert.strictEqual(r.pts.length, 0);
  assert.strictEqual(r.drawLastPt, null);
});

t('undo na praznoj listi je no-op (ne baca, ne zove redraw/panel)', () => {
  const r = runUndo([], null);
  assert.strictEqual(r.calls.redraw, 0);
  assert.strictEqual(r.calls.panel, 0);
});

console.log('\nZajednički crosshair — #map-center-dot umjesto #msr-xhair (v1.4.4):');

t('#msr-xhair je uklonjen (CSS pravilo i HTML element), komentar smije spomenuti staro ime', () => {
  assert.ok(!HTML.includes('#msr-xhair {'), 'CSS pravilo za stari crosshair ne smije ostati');
  assert.ok(!HTML.includes('id="msr-xhair"'), 'HTML element starog crosshair-a ne smije ostati');
});

t('msrStart koristi map-center-dot i postavlja drawing-active na #main', () => {
  const src = extractFn('msrStart');
  assert.ok(src.includes("classList.add('drawing-active')"), 'mora označiti #main kao drawing-active');
  assert.ok(src.includes("getElementById('map-center-dot')"), 'mora koristiti ZAJEDNIČKI crosshair, ne poseban element');
});

t('msrStop uklanja drawing-active i sakriva crosshair', () => {
  const src = extractFn('msrStop');
  assert.ok(src.includes("classList.remove('drawing-active')"));
  assert.ok(src.includes("dot.style.display = 'none'"));
});

t('_updMcdDist sakriva udaljenost dok je crtanje aktivno', () => {
  const src = extractFn('_updMcdDist');
  assert.ok(src.includes('drawing-active'), 'mora provjeriti drawing-active prije prikaza udaljenosti');
});

console.log('\n' + pass + ' prošlo, ' + fail + ' palo');
process.exit(fail ? 1 : 0);
