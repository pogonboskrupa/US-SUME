// =====================================================================
// Labele vlaka/kraka: idealan položaj paralelno s linijom, rotacija, OBB declutter,
// ručno uređivanje (lager rotacija). Pokretanje: node tests/js/labele-vlaka.test.js
// Testira se STVARNI kod izvučen iz index.html / static/js/vlaka-lager.js.
// =====================================================================
'use strict';
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const HTML = require('./_izvor').izvor();
const LAGER = fs.readFileSync(path.join(__dirname, '../../static/js/vlaka-lager.js'), 'utf8');

function extractFn(name, h) {
  h = h || HTML;
  const start = h.indexOf('function ' + name + '(');
  if (start < 0) throw new Error('nije nađena funkcija ' + name);
  let i = h.indexOf('(', start), par = 0;
  for (; i < h.length; i++) { if (h[i] === '(') par++; else if (h[i] === ')') { par--; if (par === 0) { i++; break; } } }
  i = h.indexOf('{', i);
  let depth = 0;
  for (; i < h.length; i++) { if (h[i] === '{') depth++; else if (h[i] === '}') { depth--; if (depth === 0) return h.slice(start, i + 1); } }
  throw new Error('nezatvorena funkcija ' + name);
}
let pass = 0, fail = 0;
function t(name, fn) {
  try { fn(); console.log('  ✔ ' + name); pass++; }
  catch (e) { fail++; console.log('  ✘ ' + name + '\n      ' + e.message); }
}

const api = new Function('_LBL_REF_MPP', extractFn('_lblDuzinaM') + '\n' + extractFn('_lblIdealno') + '\n' + extractFn('_lblObbPresjek') +
  '\nreturn { _lblDuzinaM, _lblIdealno, _lblObbPresjek };')(2.65);

const LA0 = 44.9, LO0 = 16.0, KX = 111320 * Math.cos(LA0 * Math.PI / 180), KY = 111320;
const P = (x, y) => ({ la: LA0 + y / KY, lo: LO0 + x / KX });
const XY = p => ({ x: (p.lo - LO0) * KX, y: (p.la - LA0) * KY });
const linija = (...xy) => xy.map(([x, y]) => P(x, y));

console.log('Idealan položaj labele:');

t('krak: labela NIJE na čvorištu (početku kraka) nego dalje duž linije', () => {
  const pts = linija([0, 0], [300, 0], [600, 0]);
  const [l] = api._lblIdealno(pts, 'T1.2', [], 1, []);
  const x = XY(l).x;
  assert.ok(x > 100 && x < 500, 'labela na x=' + x.toFixed(0) + ' m — preblizu kraju/čvorištu');
});

t('labela izbjegava mjesto gdje polaze krakovi (čvorište na sredini)', () => {
  const pts = linija([0, 0], [500, 0], [1000, 0]);
  const junk = [P(500, 40)];
  const [l] = api._lblIdealno(pts, 'T1', junk, 1, []);
  const win = api._lblDuzinaM('T1');
  assert.ok(Math.abs(XY(l).x - 500) >= win / 2, 'labela leži na čvorištu: x=' + XY(l).x.toFixed(0));
});

t('labela izbjegava oštru krivinu — ostaje na ravnom dijelu', () => {
  const pts = linija([0, 0], [300, 0], [300, 300]);
  const [l] = api._lblIdealno(pts, 'T12', [], 1, []);
  assert.ok(Math.abs(l.s - 300) >= 40, 'labela na s=' + l.s.toFixed(0) + ' siječe krivinu na 300');
});

t('ugao je paralelan liniji: istok 0°, sjeveroistok −45°, uvijek u (−90, 90]', () => {
  const [a] = api._lblIdealno(linija([0, 0], [600, 0]), 'T1', [], 1, []);
  assert.ok(Math.abs(a.deg) < 0.5, 'istok: ' + a.deg);
  const [b] = api._lblIdealno(linija([0, 0], [500, 500]), 'T1', [], 1, []);
  assert.ok(Math.abs(b.deg + 45) < 1, 'sjeveroistok: ' + b.deg);
  const [c] = api._lblIdealno(linija([600, 0], [0, 0]), 'T1', [], 1, []);   // ista linija, suprotan smjer
  assert.ok(Math.abs(c.deg) < 0.5, 'tekst se ne smije okrenuti naopako: ' + c.deg);
  [[0, 600], [0, -600], [-400, 300], [300, -400]].forEach(([x, y]) => {
    const [d] = api._lblIdealno(linija([0, 0], [x, y]), 'T1', [], 1, []);
    assert.ok(d.deg > -90 && d.deg <= 90, 'ugao van opsega: ' + d.deg);
  });
});

t('susjedna labela se izbjegava (zauzeti)', () => {
  const pts = linija([0, 0], [600, 0]);
  const [bez] = api._lblIdealno(pts, 'T1', [], 1, []);
  const [sa] = api._lblIdealno(pts, 'T1', [], 1, [{ la: bez.la, lo: bez.lo, r: 60 }]);
  assert.ok(Math.hypot(XY(sa).x - XY(bez).x, XY(sa).y - XY(bez).y) > 60, 'labele se preklapaju');
});

t('n=3 daje tri razdvojene labele duž duge vlake', () => {
  const r = api._lblIdealno(linija([0, 0], [1500, 0]), 'T1', [], 3, []);
  assert.strictEqual(r.length, 3);
  const xs = r.map(l => XY(l).x);
  assert.ok(xs[1] - xs[0] > 200 && xs[2] - xs[1] > 200, 'razmaci: ' + xs.map(Math.round));
});

t('vrlo kratak krak: labela se svejedno postavlja (sredina) i ne baca', () => {
  const [l] = api._lblIdealno(linija([0, 0], [30, 0]), 'T10.12', [], 1, []);
  assert.ok(l && Number.isFinite(l.la) && Number.isFinite(l.deg));
  assert.deepStrictEqual(api._lblIdealno([P(0, 0)], 'T1', [], 1, []), []);
});

t('razmjera 1:10000: labela od 5 znakova ≈ 100 m (12 px × 2,65 m)', () => {
  const m = api._lblDuzinaM('T12.3');
  assert.ok(m > 90 && m < 130, String(m));
});

console.log('\nDeclutter rotiranih labela (orijentisani pravougaonici):');
const obb = (cx, cy, hw, hh, deg) => ({ cx, cy, hw, hh, c: Math.cos(deg * Math.PI / 180), s: Math.sin(deg * Math.PI / 180) });
t('dvije paralelne dijagonalne labele razmaknute okomito se NE dodiruju (AABB bi ih spojio)', () => {
  const a = obb(0, 0, 40, 7, 45), b = obb(14, -14, 40, 7, 45);   // 20 px okomito na smjer teksta
  assert.strictEqual(api._lblObbPresjek(a, b, 2), false);
  const baa = (o) => { const w = Math.abs(o.hw * o.c) + Math.abs(o.hh * o.s); const h = Math.abs(o.hw * o.s) + Math.abs(o.hh * o.c); return { l: o.cx - w, r: o.cx + w, t: o.cy - h, b: o.cy + h }; };
  const A = baa(a), B = baa(b);
  assert.ok(!(A.r < B.l || A.l > B.r || A.b < B.t || A.t > B.b), 'kontrola: AABB bi javio preklapanje');
});
t('labele koje se stvarno preklapaju se prepoznaju', () => {
  assert.strictEqual(api._lblObbPresjek(obb(0, 0, 40, 7, 30), obb(10, 3, 40, 7, 30), 2), true);
  assert.strictEqual(api._lblObbPresjek(obb(0, 0, 40, 7, 0), obb(0, 40, 40, 7, 0), 2), false);
});

console.log('\nUgrađenost u app:');
t('updateVlakaLabel: krak više NE stavlja labelu na početak (pts[0])', () => {
  const f = extractFn('updateVlakaLabel');
  assert.ok(!/Krak — labela uvijek na početku/.test(f), 'stari komentar/ponašanje je još tu');
  assert.ok(f.includes('_lblIdealno('), 'ne koristi idealan položaj');
  assert.ok(!/_labelFracs\(v\.pts/.test(f), 'i dalje koristi stare frakcije');
});
t('labela je zarotirana CSS-om i pomaknuta iznad linije (rotacija oko centra)', () => {
  const f = extractFn('_labelHtml');
  assert.ok(f.includes('translate(-50%,-50%) rotate(') && f.includes('translateY(-'), f);
  assert.ok(/data-rot/.test(f) && /data-pin/.test(f));
});
t('_lblIdealno je čista funkcija — ne dira map/DOM (testabilna, nezavisna od zuma)', () => {
  const f = extractFn('_lblIdealno');
  assert.ok(!/(?<![.\w])map\b|document\./.test(f), 'koristi map/document');
});
t('declutter koristi OBB i daje prednost ručno postavljenim (pin) labelama', () => {
  const f = extractFn('_declutterVlakaLabels');
  assert.ok(f.includes('_lblObbPresjek') && f.includes('dataset.pin'));
});
t('lager: rotacija je u lager_pt (rot) i ide kroz VlakaLager.icon bez mijenjanja položaja', () => {
  assert.ok(/function rotOf\(v\)/.test(LAGER) && /rotate\(/.test(LAGER));
  assert.ok(/root\.VlakaLager=\{[^}]*\bicon\b[^}]*\brotOf\b/.test(LAGER));
  const api2 = new Function('_stpLagerSvg', '_escHtml', 'styleFor', LAGER.match(/function rotOf[\s\S]*?\n function|function rotOf[\s\S]*?(?=\nfunction icon)/)[0] + '\nreturn {rotOf, content};');
  const k = api2(() => '<svg/>', x => x, () => ({ width: 28, height: 13, font: 9 }));
  assert.strictEqual(k.rotOf({ lagerPt: { la: 1, lo: 2, rot: 30 } }), 30);
  assert.strictEqual(k.rotOf({ lagerPt: { la: 1, lo: 2 } }), 0);
  assert.strictEqual(k.rotOf({ lagerPt: { rot: 500 } }), 90);
  assert.ok(k.content({ lager: 'L1', lagerPt: { rot: 30 } }).includes('rotate(30deg)'));
  assert.ok(!k.content({ lager: 'L1' }).includes('rotate('));
});
t('uređivanje: labela imena se pamti po projektu+imenu, lager u lager_pt (server)', () => {
  assert.ok(extractFn('_lblKljuc').includes('projektId'));
  assert.ok(extractFn('_lblDragKraj').includes('_lblOvrSet'));
  assert.ok(extractFn('_lagerDragKraj').includes('lagerPt') && extractFn('_lagerSnimi').includes('sbFlushVlaka'));
});
t('uređivanje se gasi pri štampi i pri napuštanju Karte', () => {
  assert.ok(extractFn('stampaOtvori').includes('_lblEditToggle(false)'));
  assert.ok(extractFn('switchTab').includes('_lblEditToggle(false)'));
});

console.log('\n' + pass + ' prošlo, ' + fail + ' palo');
process.exit(fail ? 1 : 0);
