// =====================================================================
// Hod po već snimljenom dijelu vlake — bez petlje/kuke (v1.9.1).
// Pokretanje:  node tests/js/vlaka-povratak.test.js
// ---------------------------------------------------------------------
// Terenska prijava: okrenuo se sa kolicima, vratio par metara istim putem pa
// opet naprijed — na snimljenoj vlaci ostala je petlja od ~5 m. GPS tačke
// povratka padaju par metara u stranu od puta naprijed.
//
// Testovi puštaju STVARNI _vlakaProcessGpsPoint iz index.html nad simuliranim
// GPS fiksovima (1 Hz, hod 1 m/s, šum), pa mjere dobijenu liniju.
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
function konst(name) {
  const m = HTML.match(new RegExp('const ' + name + '\\s*=\\s*([^;]+);'));
  if (!m) throw new Error('nema konstante ' + name);
  return m[1];
}

let pass = 0, fail = 0;
function t(name, fn) {
  try { fn(); console.log('  ✔ ' + name); pass++; }
  catch (e) { fail++; console.log('  ✘ ' + name + '\n      ' + e.message); }
}

// ── Okruženje: stvarni pipeline, lažna karta ─────────────────────────────
const LA0 = 44.9, LO0 = 16.1, MPD = 111320;
const kx = Math.cos(LA0 * Math.PI / 180) * MPD;
const uLL = (x, y) => ({ la: LA0 + y / MPD, lo: LO0 + x / kx });
const uXY = p => ({ x: (p.lo - LO0) * kx, y: (p.la - LA0) * MPD });

function env(opts) {
  opts = opts || {};
  const toasts = [];
  const v = { nm: 'T1', pts: (opts.pocetne || []).map(q => ({ ...q })), poly: { setLatLngs() {}, addLatLng() {} } };
  const vlake = [v].concat(opts.ostale || []);
  const imena = ['_rtLa', '_rtLo', '_vlVrhSumnjiv', '_vlRetraceSkiniSiljak', '_vlRetraceSirina', '_vlRetraceTest', '_vlUgaoSkretanja', '_vlRetraceObreziVrh',
    '_vlRetraceZastita', '_vlakaProcessGpsPoint', 'dst'];
  const src =
    'const MPDEG = 111320, GPS_MAX_ACC = ' + konst('GPS_MAX_ACC') + ', GPS_MAX_JUMP = ' + konst('GPS_MAX_JUMP') +
    ', GPS_MAX_SPEED = ' + konst('GPS_MAX_SPEED') + ', GPS_MIN_DIST = ' + konst('GPS_MIN_DIST') +
    ', GPS_GAP_WARN_MS = ' + konst('GPS_GAP_WARN_MS') +
    ', _VL_RETRACE_MIN_W = 6, _VL_RETRACE_MAX_W = 9;\n' +
    'let recOn = true, recPaused = false, actI = 0, _lastFixRaw = null, _pendingJumpFix = null, ' +
    '_lastRecTime = 0, _lastPtAcceptedAt = 0, _parentReturnIdx = null, _parentReturnTrimToIdx = -1, ' +
    '_vlRetrace = null, _vlSesijaPocetak = {};\n' +
    'const _forestMode = false; function _gpsDistMul() { return 0.35; }\n' +
    'function addPt(i, la, lo, al, gap) { const w = vlake[i]; if (w.pts.length) { const l = w.pts[w.pts.length-1]; if (dst(l.la,l.lo,la,lo) < 0.1) return; } w.pts.push({ la, lo, al, ...(gap ? { gap: true } : {}) }); }\n' +
    imena.map(extractFn).join('\n') +
    '\nreturn { run: _vlakaProcessGpsPoint, stanje: () => _vlRetrace };';
  const api = new Function('vlake', 'showToast', 'scheduleVlakaSave', 'updBan', 'updateVlakaLabel', 'sbFlushVlaka',
    '_vlakaSaveTimers', '_markGpsGapOnMap', '_parentOf', src)(
    vlake, m => toasts.push(m), () => {}, () => {}, () => {}, () => {}, {}, () => {},
    x => (opts.parentOf ? opts.parentOf(x) : -1));
  let tt = 1e12;
  const pusti = (put, ac) => {
    for (const q of put) {
      tt += 1000;
      const p = uLL(q.x, q.y);
      api.run(p.la, p.lo, ac || 4, 300, null, tt);
    }
  };
  return { v, api, pusti, toasts };
}

// Pomoćno: šum, putanja.
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
function mjere(v) {
  const xy = v.pts.map(uXY);
  let len = 0, unazad = 0, maxY = 0;
  for (let i = 1; i < xy.length; i++) {
    len += Math.hypot(xy[i].x - xy[i - 1].x, xy[i].y - xy[i - 1].y);
    if (xy[i].x < xy[i - 1].x) unazad += xy[i - 1].x - xy[i].x;
  }
  xy.forEach(p => { maxY = Math.max(maxY, Math.abs(p.y)); });
  return { len, unazad, maxY, n: xy.length, xy };
}

console.log('Scenario sa terena — okret sa kolicima:');

t('KLJUČNO: naprijed 40 m, nazad 6 m (pomak 3 m u stranu), opet naprijed → bez petlje', () => {
  const r = rnd(7);
  const e = env();
  e.pusti([{ x: 0, y: 0 }].concat(hod(0, 0, 40, 0, 1, 0.7, r)));
  e.pusti(hod(40, 0, 34, 0, 1, 0.7, r, { x: 0, y: 3 }));        // povratak, GPS 3 m sjevernije
  e.pusti(hod(34, 0, 70, 0, 1, 0.7, r, { x: 0, y: 1.5 }));      // opet naprijed
  const m = mjere(e.v);
  assert.ok(m.unazad < 1.5, 'linija ide unazad ' + m.unazad.toFixed(1) + ' m (petlja)');
  assert.ok(m.len < 74, 'dužina ' + m.len.toFixed(1) + ' m — povratak dodat u dužinu');
  assert.ok(m.len > 66, 'dužina ' + m.len.toFixed(1) + ' m — pojedeno od stvarne trase');
  const siljak = Math.max(...m.xy.filter(p => p.x > 34 && p.x < 46).map(p => Math.abs(p.y)));
  assert.ok(siljak < 2.8, 'šiljak na mjestu okreta: ' + siljak.toFixed(1) + ' m u stranu');
});

t('isti scenario kroz 40 različitih GPS šumova — petlja/šiljak nikad ne ostaje', () => {
  const lose = [];
  for (let seed = 1; seed <= 40; seed++) {
    const r = rnd(seed * 101);
    const e = env();
    e.pusti([{ x: 0, y: 0 }].concat(hod(0, 0, 40, 0, 1, 0.7, r)));
    e.pusti(hod(40, 0, 34, 0, 1, 0.7, r, { x: 0, y: 3 }));
    e.pusti(hod(34, 0, 70, 0, 1, 0.7, r, { x: 0, y: 1.5 }));
    const m = mjere(e.v);
    const siljak = Math.max(...m.xy.filter(p => p.x > 34 && p.x < 46).map(p => Math.abs(p.y)));
    if (m.unazad >= 1.5 || siljak >= 3 || m.len > 74 || m.len < 64) lose.push(seed + ':' + m.len.toFixed(0) + 'm/' + m.unazad.toFixed(1) + '/' + siljak.toFixed(1));
  }
  assert.deepStrictEqual(lose, []);
});

t('šiljak se skida samo pri izlasku iz povratka i samo kad je oštar', () => {
  const f = new Function(extractFn('dst') + '\n' + extractFn('_rtLa') + '\n' + extractFn('_rtLo') + '\n' + extractFn('_vlUgaoSkretanja') + '\n' +
    extractFn('_vlRetraceSkiniSiljak') + '\nreturn _vlRetraceSkiniSiljak;')();
  const siljak = [uLL(0, 0), uLL(10, 0), uLL(20, 0), uLL(22, 3)];
  assert.strictEqual(f(siljak, uLL(24, 0), 6, 0), 1);
  const blag = [uLL(0, 0), uLL(10, 0), uLL(20, 0), uLL(23, 0.5)];
  assert.strictEqual(f(blag, uLL(26, 1), 6, 0), 0, 'običan vrh skinut');
  const zast = [uLL(0, 0), uLL(10, 0), uLL(20, 0), uLL(22, 3)];
  assert.strictEqual(f(zast, uLL(24, 0), 6, 3), 0, 'zaštićena tačka skinuta');
});

t('bez povratka: obično hodanje ostaje netaknuto (ista dužina kao prije izmjene)', () => {
  const r = rnd(3);
  const e = env();
  e.pusti([{ x: 0, y: 0 }].concat(hod(0, 0, 60, 0, 1, 0.7, r)));
  const m = mjere(e.v);
  assert.ok(m.len > 58 && m.len < 66, 'dužina ' + m.len.toFixed(1));
  assert.strictEqual(e.toasts.length, 0, 'lažna uzbuna povratka: ' + e.toasts.join('|'));
});

t('serpentina sa krakovima 12 m razmaka ostaje CIJELA (nije "povratak")', () => {
  const r = rnd(11);
  const e = env();
  const put = [{ x: 0, y: 0 }].concat(hod(0, 0, 40, 0, 1, 0.5, r));
  for (let a = 1; a <= 12; a++) {   // polukrug poluprečnika 6 m
    const f = Math.PI * a / 12;
    put.push({ x: 40 + 6 * Math.sin(f), y: 6 - 6 * Math.cos(f) });
  }
  e.pusti(put.concat(hod(40, 12, 10, 12, 1, 0.5, r)));
  const m = mjere(e.v);
  assert.ok(m.len > 82, 'serpentina skraćena na ' + m.len.toFixed(1) + ' m (očekivano ~89)');
  assert.ok(m.xy.some(p => p.y > 10 && p.x < 15), 'drugi krak serpentine nije snimljen');
});

t('pravi oštar ugao od 90° ostaje (nije povratak)', () => {
  const r = rnd(5);
  const e = env();
  e.pusti([{ x: 0, y: 0 }].concat(hod(0, 0, 30, 0, 1, 0.5, r), hod(30, 0, 30, 30, 1, 0.5, r)));
  const m = mjere(e.v);
  assert.ok(m.len > 56, 'dužina ' + m.len.toFixed(1));
  assert.strictEqual(e.toasts.length, 0);
});

t('dug povratak pa skretanje sa SREDINE linije → zadržan put do mjesta skretanja (nema tetive)', () => {
  const r = rnd(9);
  const e = env();
  e.pusti([{ x: 0, y: 0 }].concat(hod(0, 0, 40, 0, 1, 0.5, r)));
  e.pusti(hod(40, 0, 15, 0, 1, 0.5, r, { x: 0, y: 2 }));
  e.pusti(hod(15, 0, 15, 25, 1, 0.5, r));
  const xy = mjere(e.v).xy;
  const prvaSjeverno = xy.findIndex(p => p.y > 8);
  assert.ok(prvaSjeverno > 0, 'skretanje nije snimljeno');
  const prije = xy[prvaSjeverno - 1];
  assert.ok(prije.x < 25, 'linija skače od vrha (x≈40) pravo na novu poziciju — tetiva preko šume (x=' + prije.x.toFixed(1) + ')');
  assert.ok(xy.some(p => p.x > 38), 'stvarni vrh (40 m) je izgubljen');
  assert.ok(Math.abs(prije.y) < 3, 'mjesto skretanja nije na liniji (y=' + prije.y.toFixed(1) + ')');
});

t('duži povratak javlja ZAŠTO linija čeka (jednom), kratak okret ne smeta porukom', () => {
  const r = rnd(21);
  const e = env();
  e.pusti([{ x: 0, y: 0 }].concat(hod(0, 0, 60, 0, 1, 0.5, r)));
  e.pusti(hod(60, 0, 30, 0, 1, 0.5, r, { x: 0, y: 2 }));
  e.pusti(hod(30, 0, 80, 0, 1, 0.5, r, { x: 0, y: 1 }));
  assert.strictEqual(e.toasts.filter(x => /već snimljen/.test(x)).length, 1, e.toasts.join('|'));
});

t('povratak ne javlja lažan "GPS prekid" poslije dužeg hoda po snimljenom', () => {
  const r = rnd(13);
  const e = env();
  e.pusti([{ x: 0, y: 0 }].concat(hod(0, 0, 80, 0, 1, 0.5, r)));
  e.pusti(hod(80, 0, 10, 0, 1, 0.5, r, { x: 0, y: 2 }));   // 70 s nazad
  e.pusti(hod(10, 0, 95, 0, 1, 0.5, r, { x: 0, y: 1 }));
  assert.ok(!e.toasts.some(x => /GPS prekid/.test(x)), e.toasts.join('|'));
});

console.log('Zaštita već snimljenog:');

t('kuka na vrhu se skida, ali NIKAD tačke iz ranije sesije', () => {
  const f = new Function(extractFn('dst') + '\n' + extractFn('_rtLa') + '\n' + extractFn('_rtLo') + '\n' + extractFn('_vlUgaoSkretanja') + '\n' + extractFn('_vlVrhSumnjiv') + '\n' +
    extractFn('_vlRetraceObreziVrh') + '\nreturn _vlRetraceObreziVrh;')();
  const pts = [uLL(0, 0), uLL(10, 0), uLL(20, 0), uLL(20, 3)];   // zadnja = kuka (90°+)
  const p1 = pts.map(q => ({ ...q }));
  assert.strictEqual(f(p1, 6, 0), 1);
  assert.strictEqual(p1.length, 3);
  const p2 = pts.map(q => ({ ...q }));
  assert.strictEqual(f(p2, 6, 3), 0, 'tačka iz ranije sesije / spoj kraka je skinut');
});

t('tačka sa oznakom GPS prekida se ne skida', () => {
  const f = new Function(extractFn('dst') + '\n' + extractFn('_rtLa') + '\n' + extractFn('_rtLo') + '\n' + extractFn('_vlUgaoSkretanja') + '\n' + extractFn('_vlVrhSumnjiv') + '\n' +
    extractFn('_vlRetraceObreziVrh') + '\nreturn _vlRetraceObreziVrh;')();
  const p = [uLL(0, 0), uLL(10, 0), uLL(20, 0), { ...uLL(19, 3), gap: true }];
  assert.strictEqual(f(p, 6, 0), 0);
});

t('nastavak postojeće vlake: hod po staroj liniji ne dira stare tačke', () => {
  const r = rnd(17);
  const stare = [0, 5, 10, 15, 20, 25, 30].map(x => uLL(x, 0));
  const e = env({ pocetne: stare });
  e.pusti(hod(20, 1, 30, 1, 1, 0.5, r));      // hoda po staroj liniji prema kraju
  e.pusti(hod(30, 1, 50, 1, 1, 0.5, r));      // pa dalje
  const xy = mjere(e.v).xy;
  for (let i = 0; i < stare.length; i++) {
    const o = uXY(stare[i]);
    assert.ok(Math.abs(xy[i].x - o.x) < 0.01 && Math.abs(xy[i].y - o.y) < 0.01, 'stara tačka ' + i + ' pomjerena');
  }
  assert.ok(!xy.slice(stare.length).some(p => p.x < 29), 'hod po staroj liniji upisan dvaput');
});

t('granica koridora: 2 × tačnost, ograničeno na 6–9 m', () => {
  const f = new Function('const _VL_RETRACE_MIN_W = 6, _VL_RETRACE_MAX_W = 9;\n' +
    extractFn('_vlRetraceSirina') + '\nreturn _vlRetraceSirina;')();
  assert.strictEqual(f(4), 8);
  assert.strictEqual(f(1), 6);
  assert.strictEqual(f(15), 9);
  assert.strictEqual(f(undefined), 8);
});

console.log(`\n${pass} prošlo, ${fail} palo`);
process.exit(fail ? 1 : 0);
