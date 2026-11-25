// =====================================================================
// Hod po već snimljenom dijelu TRAGA — bez petlje (v1.9.2).
// Pokretanje:  node tests/js/trag-povratak.test.js
// ---------------------------------------------------------------------
// Isti terenski problem kao kod vlake (v1.9.1): okret par metara nazad pa opet
// naprijed ostavlja petlju, jer tačke povratka padaju par metara u stranu.
// Razlika: trag je historija hoda — DUG povratak (ode putem pa se vrati) mora
// ostati snimljen, inače bi dužina traga tiho izgubila pola pređenog.
//
// Testovi puštaju STVARNI _addTragPoint iz index.html (median filtar, minD,
// speed-gate, auto-pauza) nad simuliranim GPS fiksovima (1 Hz, 1 m/s, šum).
// =====================================================================
'use strict';
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const HTML = require('./_izvor').izvor();

function extractFn(name) {
  let start = HTML.indexOf('async function ' + name + '(');
  if (start < 0) start = HTML.indexOf('function ' + name + '(');
  if (start < 0) throw new Error('nije nađena funkcija ' + name);
  let i = HTML.indexOf('(', start), par = 0;
  for (; i < HTML.length; i++) {
    if (HTML[i] === '(') par++;
    else if (HTML[i] === ')') { par--; if (par === 0) { i++; break; } }
  }
  i = HTML.indexOf('{', i);
  let depth = 0;
  for (; i < HTML.length; i++) {
    if (HTML[i] === '{') depth++;
    else if (HTML[i] === '}') { depth--; if (depth === 0) return HTML.slice(start, i + 1); }
  }
  throw new Error('nezatvorena funkcija ' + name);
}
function konst(name, zadano) {
  const m = HTML.match(new RegExp('const ' + name + '\\s*=\\s*([^;]+);'));
  if (!m) { if (zadano !== undefined) return zadano; throw new Error('nema konstante ' + name); }
  return m[1];
}
function imaFn(name) { return HTML.indexOf('function ' + name + '(') >= 0; }

let pass = 0, fail = 0;
function t(name, fn) {
  try { fn(); console.log('  ✔ ' + name); pass++; }
  catch (e) { fail++; console.log('  ✘ ' + name + '\n      ' + e.message); }
}

const LA0 = 44.9, LO0 = 16.1, MPD = 111320;
const kx = Math.cos(LA0 * Math.PI / 180) * MPD;
const uLL = (x, y) => ({ la: LA0 + y / MPD, lo: LO0 + x / kx });
const uXY = p => ({ x: (p[1] - LO0) * kx, y: (p[0] - LA0) * MPD });

function env(opts) {
  opts = opts || {};
  const toasts = [];
  const imena = ['dst', '_addTragPoint'].concat(
    ['_rtLa', '_rtLo', '_vlRetraceSirina', '_vlRetraceTest', '_vlUgaoSkretanja', '_vlVrhSumnjiv',
     '_vlRetraceObreziVrh', '_vlRetraceSkiniSiljak', '_tragRetraceReset', '_tragLineSync', '_tragIdeUnazad', '_tragRetraceKorak', '_tragZavrsiVrh', '_tragAccReset', '_tragAccPrag'].filter(imaFn));
  const src =
    'const MPDEG = 111320, _VL_RETRACE_MIN_W = 6, _VL_RETRACE_MAX_W = 9, _TRAG_RETRACE_MAX_M = ' +
    konst('_TRAG_RETRACE_MAX_M', '30') + ', _TRAG_AUTOPAUSE_MS = ' + konst('_TRAG_AUTOPAUSE_MS') + ';\n' +
    'const GPS_STAB_ACC = 12, _TRAG_ACC_POCETAK_MS = 60000, _TRAG_ACC_PROZOR_MS = 60000; let _tragAccHist = [], _tragAccPocetak = 0, _tragAccDobar = false;\n' +
    'let _tragOn = true, _tragPaused = false, _tragPts = ' + JSON.stringify(opts.pocetne || []) +
    ', _tragBuf = [], _tragKand = null, _tragLastT = 0, _tragLastMoveT = 0, _tragLiveSeg = { setLatLngs() {} }, _tragRetrace = null, _tragRetraceBaza = ' +
    (opts.baza || 0) + ';\n' +
    'const _activeTab = "karta", _lineStyle = { tragW: 3 }, _tragPauseWin = [];\nfunction _pauziOtvoriProzor(w, t) { w.push({ start: t || Date.now(), end: null }); }\nfunction _crashSaveTrag() {}\n' +
    'const _tragLine = { setLatLngs() {}, addLatLng() {} };\n' +
    'function _updTragStats() {} function terenUpdTragStats() {} function _tragLiveClear() {} function _terenUpdTragUI() {}\n' +
    imena.map(extractFn).join('\n') +
    '\nreturn { run: _addTragPoint, pts: () => _tragPts, pauza: () => _tragPaused, zavrsi: () => (typeof _tragZavrsiVrh === "function" ? _tragZavrsiVrh() : false) };';
  const api = new Function('showToast', 'document', 'L', 'map', src)(
    m => toasts.push(m), { getElementById: () => null },
    { polyline: () => ({ addTo() { return this; }, setLatLngs() {} }) }, {});
  let tt = 1e12;
  const pusti = (put, ac, dtMs) => {
    for (const q of put) {
      tt += dtMs || 1000;
      const p = uLL(q.x, q.y);
      api.run(p.la, p.lo, ac || 4, 300, 1, tt);
    }
  };
  return { api, pusti, toasts };
}

function rnd(seed) { let s = seed; return () => { s = (s * 16807) % 2147483647; return s / 2147483647 - 0.5; }; }
function hod(x0, y0, x1, y1, korak, sum, r, pomak) {
  const out = [], L = Math.hypot(x1 - x0, y1 - y0), n = Math.max(1, Math.round(L / korak));
  for (let k = 1; k <= n; k++) {
    const f = k / n;
    out.push({ x: x0 + (x1 - x0) * f + sum * r() * 2 + (pomak ? pomak.x : 0),
               y: y0 + (y1 - y0) * f + sum * r() * 2 + (pomak ? pomak.y : 0) });
  }
  return out;
}
function mjere(pts) {
  const xy = pts.map(uXY);
  let len = 0, unazad = 0;
  for (let i = 1; i < xy.length; i++) {
    len += Math.hypot(xy[i].x - xy[i - 1].x, xy[i].y - xy[i - 1].y);
    if (xy[i].x < xy[i - 1].x) unazad += xy[i - 1].x - xy[i].x;
  }
  return { len, unazad, n: xy.length, xy };
}
function okret(seed) {
  const r = rnd(seed);
  const e = env();
  e.pusti([{ x: 0, y: 0 }].concat(hod(0, 0, 40, 0, 1, 0.7, r)));
  e.pusti(hod(40, 0, 34, 0, 1, 0.7, r, { x: 0, y: 3 }));     // nazad 6 m, GPS 3 m u stranu
  e.pusti(hod(34, 0, 70, 0, 1, 0.7, r, { x: 0, y: 1.5 }));   // opet naprijed
  return { e, m: mjere(e.api.pts()) };
}

console.log('Trag — povratak istim putem:');

t('KLJUČNO: naprijed 40 m, nazad 6 m, opet naprijed → bez petlje', () => {
  const { m } = okret(7);
  assert.ok(m.unazad < 1.5, 'trag ide unazad ' + m.unazad.toFixed(1) + ' m (petlja)');
  assert.ok(m.len < 75, 'dužina ' + m.len.toFixed(1) + ' m — povratak dodat kao petlja');
  assert.ok(m.len > 64, 'dužina ' + m.len.toFixed(1) + ' m — pojedeno od stvarnog hoda');
});

t('isti scenario kroz 40 GPS šumova — petlja nikad ne ostaje', () => {
  const lose = [];
  for (let seed = 1; seed <= 40; seed++) {
    const { m } = okret(seed * 101);
    const siljak = Math.max(...m.xy.filter(p => p.x > 34 && p.x < 46).map(p => Math.abs(p.y)));
    if (m.unazad >= 1.5 || siljak >= 3.2 || m.len > 75 || m.len < 64) lose.push(seed + ':' + m.len.toFixed(0) + 'm/' + m.unazad.toFixed(1) + '/' + siljak.toFixed(1));
  }
  assert.deepStrictEqual(lose, []);
});

t('DUG povratak (ode 120 m, vrati se 120 m) ostaje snimljen — trag je historija hoda', () => {
  const r = rnd(33);
  const e = env();
  e.pusti([{ x: 0, y: 0 }].concat(hod(0, 0, 120, 0, 1, 0.7, r)));
  e.pusti(hod(120, 0, 0, 0, 1, 0.7, r, { x: 0, y: 3 }));
  const m = mjere(e.api.pts());
  assert.ok(m.len > 215, 'dužina ' + m.len.toFixed(0) + ' m — povratak od 120 m nije snimljen');
  assert.ok(m.len < 260, 'dužina ' + m.len.toFixed(0) + ' m');
  const kraj = m.xy[m.xy.length - 1];
  assert.ok(kraj.x < 10, 'trag završava na x=' + kraj.x.toFixed(0) + ' m, a korisnik je stigao nazad na početak');
});

t('obično hodanje ostaje netaknuto', () => {
  const r = rnd(5);
  const e = env();
  e.pusti([{ x: 0, y: 0 }].concat(hod(0, 0, 60, 0, 1, 0.5, r)));
  const m = mjere(e.api.pts());
  assert.ok(m.len > 57 && m.len < 66, 'dužina ' + m.len.toFixed(1));
  assert.ok(!e.toasts.some(x => /već snimljenom/.test(x)), 'lažna poruka o povratku');
});

t('serpentina sa krakovima 12 m razmaka ostaje CIJELA', () => {
  const r = rnd(9);
  const e = env();
  e.pusti([{ x: 0, y: 0 }].concat(hod(0, 0, 40, 0, 1, 0.5, r)));
  e.pusti(hod(40, 0, 40, 12, 1, 0.5, r));
  e.pusti(hod(40, 12, 0, 12, 1, 0.5, r));
  const m = mjere(e.api.pts());
  assert.ok(m.len > 85, 'dužina ' + m.len.toFixed(1) + ' m — pojeden drugi krak serpentine');
  assert.ok(m.xy.some(p => p.x < 5 && p.y > 9), 'drugi krak nije stigao do kraja');
});

t('tačke prije prekida (oporavak) se ne skidaju ni kad se hoda po njima', () => {
  const pocetne = [];
  for (let x = 0; x <= 30; x += 3) { const p = uLL(x, 0); pocetne.push([p.la, p.lo, 300, 1, 4]); }
  const e = env({ pocetne, baza: pocetne.length - 1 });
  const r = rnd(3);
  e.pusti(hod(30, 0, 22, 0, 1, 0.5, r, { x: 0, y: 2 }));
  e.pusti(hod(22, 0, 50, 0, 1, 0.5, r, { x: 0, y: 1 }));
  const pts = e.api.pts();
  for (let i = 0; i < pocetne.length; i++) assert.deepStrictEqual(pts[i], pocetne[i], 'stara tačka ' + i + ' izmijenjena');
});

t('stajanje iza vrha NIJE kretanje — auto-pauza i dalje okida', () => {
  const r = rnd(11);
  const e = env();
  e.pusti([{ x: 0, y: 0 }].concat(hod(0, 0, 40, 0, 1, 0.5, r)));
  e.pusti(hod(40, 0, 34, 0, 1, 0.5, r, { x: 0, y: 2 }));
  const stoji = []; for (let k = 0; k < 150; k++) stoji.push({ x: 34 + r() * 1.2, y: 2 + r() * 1.2 });
  e.pusti(stoji);                          // 2,5 min stoji 6 m iza vrha
  assert.strictEqual(e.api.pauza(), true, 'auto-pauza nije okinula');
});

t('hod NAZAD po snimljenom jeste kretanje — auto-pauza ne okida usred povratka', () => {
  const r = rnd(12);
  const e = env();
  e.pusti([{ x: 0, y: 0 }].concat(hod(0, 0, 60, 0, 1, 0.5, r)));
  e.pusti(hod(60, 0, 35, 0, 1, 0.5, r, { x: 0, y: 2 }), 4, 6000);   // sporo nazad: 25 m za 2,5 min
  assert.strictEqual(e.api.pauza(), false, 'auto-pauza okinula dok se hoda nazad');
});


// ── v5.0.0: mali krug / izlet do 10 m pa nazad, usrednjavanje, kraj traga ──
function linija(a, b) { const L = Math.hypot(b.x - a.x, b.y - a.y), n = Math.max(1, Math.round(L)), o = [];
  for (let k = 1; k <= n; k++) o.push({ x: a.x + (b.x - a.x) * k / n, y: a.y + (b.y - a.y) * k / n }); return o; }
function krug(c, r, start) { const n = Math.max(8, Math.round(2 * Math.PI * r)), o = [];
  for (let k = 1; k <= n; k++) { const a = start + 2 * Math.PI * k / n; o.push({ x: c.x + r * Math.cos(a), y: c.y + r * Math.sin(a) }); } return o; }
function dSeg(p, a, b) { const dx = b.x - a.x, dy = b.y - a.y, L2 = dx * dx + dy * dy;
  const t = L2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / L2)) : 0; return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy); }
function dPoly(p, P) { let m = Infinity; for (let i = 1; i < P.length; i++) m = Math.min(m, dSeg(p, P[i - 1], P[i])); return m; }
// Najveći promašaj: koliko daleko je stvarni hod od snimljene linije.
function promasaj(tru, xy) { let m = 0; for (const q of tru) m = Math.max(m, dPoly(q, xy)); return m; }
function snimi(tru, seed, sum, ac, zavrsi) {
  const r = rnd(seed), e = env();
  e.pusti([{ x: 0, y: 0 }].concat(tru.map(q => ({ x: q.x + sum * r() * 2, y: q.y + sum * r() * 2 }))), ac);
  if (zavrsi) e.api.zavrsi();
  return mjere(e.api.pts());
}
const ULAZ = linija({ x: 0, y: 0 }, { x: 40, y: 0 });

t('KLJUČNO: izlet 10 m u stranu pa nazad pa dalje — vrh izleta ostaje (bio 3 m)', () => {
  const tru = ULAZ.concat(linija({ x: 40, y: 0 }, { x: 40, y: 10 }), linija({ x: 40, y: 10 }, { x: 40, y: 0 }), linija({ x: 40, y: 0 }, { x: 70, y: 0 }));
  const lose = [];
  for (let s = 1; s <= 30; s++) {
    const m = snimi(tru, s * 97, 0.5, 3);
    const vrh = Math.max(...m.xy.map(p => p.y));
    const p = promasaj(tru, m.xy);
    if (vrh < 7.5 || p > 4) lose.push(s + ':vrh ' + vrh.toFixed(1) + '/prom ' + p.toFixed(1));
  }
  assert.deepStrictEqual(lose, []);
});

t('KLJUČNO: krug Ø 10 m i Ø 8 m ostaje cijel (zatvaranje kruga nije povratak)', () => {
  const lose = [];
  for (const R of [5, 4]) for (let s = 1; s <= 30; s++) {
    const tru = ULAZ.concat(krug({ x: 40, y: R }, R, -Math.PI / 2), linija({ x: 40, y: 0 }, { x: 70, y: 0 }));
    const p = promasaj(tru, snimi(tru, s * 97, 0.5, 3, true).xy);
    if (p > 3.5) lose.push('Ø' + 2 * R + '/' + s + ':' + p.toFixed(1));
  }
  assert.deepStrictEqual(lose, []);
});

t('krug Ø 10 m pa NAZAD istim putem — krug ostaje, a trag završava gdje korisnik stoji', () => {
  const lose = [];
  for (let s = 1; s <= 30; s++) {
    const tru = ULAZ.concat(krug({ x: 40, y: 5 }, 5, -Math.PI / 2), linija({ x: 40, y: 0 }, { x: 20, y: 0 }));
    const m = snimi(tru, s * 97, 0.5, 3, true);
    const p = promasaj(tru, m.xy), kraj = m.xy[m.xy.length - 1];
    if (p > 3 || Math.hypot(kraj.x - 20, kraj.y) > 3) lose.push(s + ':' + p.toFixed(1) + '/kraj ' + kraj.x.toFixed(0));
  }
  assert.deepStrictEqual(lose, []);
});

t('"Završi" usred povratka: trag dobija tačku NA liniji gdje korisnik stoji', () => {
  const r = rnd(21), e = env();
  e.pusti([{ x: 0, y: 0 }].concat(hod(0, 0, 40, 0, 1, 0.4, r)));
  e.pusti(hod(40, 0, 28, 0, 1, 0.4, r, { x: 0, y: 2 }));   // 12 m nazad — ne upisuje se dvaput
  const prije = mjere(e.api.pts()), dodano = e.api.zavrsi(), m = mjere(e.api.pts()), kraj = m.xy[m.xy.length - 1];
  assert.ok(dodano, 'kraj nije dopisan');
  assert.ok(Math.abs(kraj.x - 28) < 3 && Math.abs(kraj.y) < 1, 'kraj ' + kraj.x.toFixed(1) + ',' + kraj.y.toFixed(1) + ' — nije na liniji kod korisnika');
  assert.ok(prije.unazad < 1.5, 'povratak upisan kao petlja');
});

t('"Završi" bez kretanja ne dodaje GPS šum (< 1,5 m)', () => {
  const r = rnd(4), e = env();
  e.pusti([{ x: 0, y: 0 }].concat(hod(0, 0, 30, 0, 1, 0.3, r)));
  e.pusti([{ x: 30.4, y: 0.2 }, { x: 30.2, y: -0.3 }, { x: 30.5, y: 0.1 }]);
  const n = e.api.pts().length;
  e.api.zavrsi();
  assert.ok(e.api.pts().length - n <= 1);
  const m = mjere(e.api.pts());
  assert.ok(m.len < 32, 'dužina ' + m.len.toFixed(1));
});

t('usrednjavanje: ravnih 70 m uz ±1,5 m šuma — dužina blizu stvarne (bilo ~80 m)', () => {
  const lens = [];
  for (let s = 1; s <= 30; s++) lens.push(snimi(linija({ x: 0, y: 0 }, { x: 70, y: 0 }), s * 97, 1.5, 5).len);
  const avg = lens.reduce((a, b) => a + b, 0) / lens.length;
  assert.ok(avg < 76, 'prosječna dužina ' + avg.toFixed(1) + ' m');
  assert.ok(avg > 64, 'prosječna dužina ' + avg.toFixed(1) + ' m');
});

t('jedan GPS skok od 25 m ne ulazi u trag', () => {
  const e = env();
  const put = [{ x: 0, y: 0 }].concat(linija({ x: 0, y: 0 }, { x: 40, y: 0 }));
  put.splice(20, 1, { x: 19, y: 25 });
  e.pusti(put);
  assert.ok(Math.max(...mjere(e.api.pts()).xy.map(p => Math.abs(p.y))) < 1, 'skok upisan');
});

t('prelaz preko starijeg dijela traga (krst) se snima, ne guta', () => {
  const tru = linija({ x: 0, y: 0 }, { x: 40, y: 0 }).concat(linija({ x: 40, y: 0 }, { x: 40, y: 20 }),
    linija({ x: 40, y: 20 }, { x: 20, y: 20 }), linija({ x: 20, y: 20 }, { x: 20, y: -20 }));
  const lose = [];
  for (let s = 1; s <= 20; s++) { const p = promasaj(tru, snimi(tru, s * 97, 0.5, 3, true).xy); if (p > 3) lose.push(s + ':' + p.toFixed(1)); }
  assert.deepStrictEqual(lose, []);
});

console.log('\n' + pass + ' prošlo, ' + fail + ' palo');
process.exit(fail ? 1 : 0);
