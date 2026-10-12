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
const HTML = fs.readFileSync(path.join(__dirname, '../../index.html'), 'utf8');

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
     '_vlRetraceObreziVrh', '_vlRetraceSkiniSiljak', '_tragRetraceReset', '_tragLineSync', '_tragRetraceKorak'].filter(imaFn));
  const src =
    'const MPDEG = 111320, _VL_RETRACE_MIN_W = 6, _VL_RETRACE_MAX_W = 9, _TRAG_RETRACE_MAX_M = ' +
    konst('_TRAG_RETRACE_MAX_M', '30') + ', _TRAG_AUTOPAUSE_MS = ' + konst('_TRAG_AUTOPAUSE_MS') + ';\n' +
    'let _tragOn = true, _tragPaused = false, _tragPts = ' + JSON.stringify(opts.pocetne || []) +
    ', _tragBuf = [], _tragLastT = 0, _tragLastMoveT = 0, _tragLiveSeg = { setLatLngs() {} }, _tragRetrace = null, _tragRetraceBaza = ' +
    (opts.baza || 0) + ';\n' +
    'const _activeTab = "karta", _lineStyle = { tragW: 3 };\n' +
    'const _tragLine = { setLatLngs() {}, addLatLng() {} };\n' +
    'function _updTragStats() {} function terenUpdTragStats() {} function _tragLiveClear() {} function _terenUpdTragUI() {}\n' +
    imena.map(extractFn).join('\n') +
    '\nreturn { run: _addTragPoint, pts: () => _tragPts, pauza: () => _tragPaused };';
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

console.log('\n' + pass + ' prošlo, ' + fail + ' palo');
process.exit(fail ? 1 : 0);
