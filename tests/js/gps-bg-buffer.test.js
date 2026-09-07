// =====================================================================
// Testovi za NATIVE GPS BAFER — snimanje koje teče dok je app zatvorena.
// Pokretanje:  node tests/js/gps-bg-buffer.test.js
// ---------------------------------------------------------------------
// Zašto ovaj test postoji: GpsService (foreground servis) nastavi prikupljati
// GPS fiksove u fajl i kad OEM battery manager ubije CIJELI proces usred
// snimanja. Ali do v3.115.0 je jedini pozivalac drain-a bio `visibilitychange`
// — a ponovno otvaranje app-a poslije ubijenog procesa je HLADAN START:
// stranica se učita već vidljiva, pa taj event NIKAD ne opali. Sve što je
// servis snimio dok je app bio mrtav ostajalo je u fajlu i bilo TRAJNO
// obrisano pri sljedećem startRecording() (clearBuffer u GpsService).
//
// Ovi testovi čuvaju da _crashCheck povuče bafer i dopuni oporavljeni
// trag/vlaku, i da se bafer ne "prelije" u pogrešnu sesiju.
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
  if (HTML.slice(Math.max(0, fstart - 6), fstart) === 'async ') fstart -= 6;
  let i = HTML.indexOf('{', fstart), depth = 0;
  for (; i < HTML.length; i++) {
    if (HTML[i] === '{') depth++;
    else if (HTML[i] === '}') { depth--; if (depth === 0) return HTML.slice(fstart, i + 1); }
  }
  throw new Error('nezatvorena funkcija ' + name);
}

let pass = 0, fail = 0;
const _async = [];
function t(name, fn) {
  try {
    const r = fn();
    if (r && typeof r.then === 'function') { _async.push({ name, p: r }); return; }
    pass++; console.log('  ✔ ' + name);
  } catch (e) { fail++; console.log('  ✘ ' + name + '\n      ' + e.message); }
}

// ── _nativeBufUzmi: čita i (na Java strani) briše bafer ────────────────────
console.log('_nativeBufUzmi — jedno destruktivno čitanje:');

const SRC_UZMI = extractFn('_nativeBufUzmi');
function makeUzmi(bridge) {
  return new Function('AndroidGps', SRC_UZMI + '\nreturn _nativeBufUzmi;')(bridge);
}

t('bez native mosta (webapp) vraća prazno, ne baca', () => {
  assert.deepStrictEqual(makeUzmi(undefined)(), []);
  assert.deepStrictEqual(makeUzmi({})(), []);
});

t('tačke se vraćaju SORTIRANE po vremenu (fajl se piše redom pisanja, ne vremena)', () => {
  const raw = JSON.stringify([
    { la: 44.9, lo: 16.2, ac: 5, al: 300, sp: 1, t: 300 },
    { la: 44.9, lo: 16.2, ac: 5, al: 300, sp: 1, t: 100 },
    { la: 44.9, lo: 16.2, ac: 5, al: 300, sp: 1, t: 200 },
  ]);
  const pts = makeUzmi({ drainNativeBuffer: () => raw })();
  assert.deepStrictEqual(pts.map(p => p.t), [100, 200, 300]);
});

t('zapisi bez upotrebljivog vremena se odbacuju (pola reda pri ubijanju procesa)', () => {
  const raw = JSON.stringify([
    { la: 44.9, lo: 16.2, t: 100 },
    { la: 44.9, lo: 16.2 },          // bez t
    null,
    { la: 44.9, lo: 16.2, t: 'x' },  // t nije broj
  ]);
  assert.strictEqual(makeUzmi({ drainNativeBuffer: () => raw })().length, 1);
});

t('korumpiran/prazan sadržaj ne ruši oporavak', () => {
  assert.deepStrictEqual(makeUzmi({ drainNativeBuffer: () => '{nije json' })(), []);
  assert.deepStrictEqual(makeUzmi({ drainNativeBuffer: () => '' })(), []);
  assert.deepStrictEqual(makeUzmi({ drainNativeBuffer: () => '[]' })(), []);
  assert.deepStrictEqual(makeUzmi({ drainNativeBuffer: () => { throw new Error('most pao'); } })(), []);
});

t('most se pita SAMO JEDNOM po pozivu (čitanje briše fajl na Java strani)', () => {
  let n = 0;
  const fn = makeUzmi({ drainNativeBuffer: () => { n++; return '[]'; } });
  fn();
  assert.strictEqual(n, 1);
});

// ── _crashCheck: hladan start poslije ubijenog procesa ─────────────────────
console.log('_crashCheck — dopuna oporavljenog snimanja iz native bafera:');

const SRC_CRASH = [
  extractFn('_nativeBufUzmi'),
  extractFn('_crashClearVlaka'),
  extractFn('_crashClearTrag'),
  extractFn('_crashCheck'),
].join('\n');

function makeCrash({ snapV = null, snapT = null, buf = [], potvrdi = true }) {
  const store = {
    'tvlake_crash_vlaka_v2': snapV ? JSON.stringify(snapV) : null,
    'tvlake_crash_trag_v2':  snapT ? JSON.stringify(snapT) : null,
  };
  const stanje = { vlake: [], dodane: [], toasts: [], drainPozvan: 0 };

  const sandbox = {
    _CRASH_VLAKA_KEY: 'tvlake_crash_vlaka_v2',
    _CRASH_TRAG_KEY:  'tvlake_crash_trag_v2',
    localStorage: {
      getItem: k => (k in store ? store[k] : null),
      removeItem: k => { store[k] = null; },
      setItem: (k, v) => { store[k] = v; },
    },
    AndroidGps: { drainNativeBuffer: () => { stanje.drainPozvan++; return JSON.stringify(buf); } },
    _dlgConfirm: async () => potvrdi,
    showToast: (m) => stanje.toasts.push(m),
    // vlaka grana
    vlake: stanje.vlake,
    window: {
      addV: (color) => { stanje.vlake.push({ color, nm: '', br: '', pts: [], poly: { addLatLng(){} } }); },
      selI: () => {},
    },
    saveV: async () => {},
    dst: (la1, lo1, la2, lo2) => Math.hypot((la1 - la2) * 111000, (lo1 - lo2) * 78000),
    // trag grana
    map: { removeLayer(){} },
    L: { polyline: () => ({ addTo: () => ({}) }) },
    _tragLiveClear: () => {},
    _lineStyle: { tragW: 3 },
    _updFabVisibility: () => {},
    _updTragStats: () => {},
    _terenUpdTragUI: undefined,
    _crashStartTimer: () => {},
    document: { getElementById: () => null },
    // _crashCheck REBIND-uje _tragPts/_tragOn (to su parametri sandbox funkcije),
    // pa se unutrašnje stanje ne može posmatrati izvana. Zato mock bilježi u
    // DIJELJENI niz: predmet ovog testa je da li bufferovani fiksovi UOPŠTE
    // stignu do _addTragPoint i sa kojim vrijednostima. Filtriranje po tačnosti
    // i speed-gate su posao pravog _addTragPoint (živi put ih već pokriva).
    _addTragPoint: (la, lo, ac, al, sp, ts) => { stanje.dodane.push({ la, lo, ac, al, sp, ts }); },
    _tragPts: [], _tragLine: null, _tragOn: false, _tragPaused: false,
    _tragBuf: [], _tragLastT: 0, _tragLastMoveT: 0,
    Date, Math, JSON,
  };
  // `window.addV/selI` se u kodu destrukturira iz window
  sandbox.addV = sandbox.window.addV;
  sandbox.selI = sandbox.window.selI;

  const keys = Object.keys(sandbox);
  const api = new Function(...keys,
    SRC_CRASH + '\nreturn { _crashCheck, vidi: () => ({ tragOn: _tragOn, tragLastT: _tragLastT }) };'
  )(...keys.map(k => sandbox[k]));
  return { fn: api._crashCheck, vidi: api.vidi, sandbox, stanje };
}

t('TRAG: fiksovi snimljeni dok je app bila mrtva stižu u snimanje', async () => {
  const t0 = 1_000_000;
  const { fn, vidi, stanje } = makeCrash({
    snapT: { ts: t0, pts: [[44.900, 16.200, 300, t0 - 2000], [44.901, 16.201, 300, t0]] },
    buf: [
      { la: 44.902, lo: 16.202, ac: 6, al: 300, sp: 1, t: t0 + 2000 },
      { la: 44.903, lo: 16.203, ac: 6, al: 300, sp: 1, t: t0 + 4000 },
      { la: 44.904, lo: 16.204, ac: 6, al: 300, sp: 1, t: t0 + 6000 },
    ],
  });
  await fn();
  assert.strictEqual(stanje.dodane.length, 3, 'dobijeno: ' + stanje.dodane.length);
  assert.strictEqual(vidi().tragOn, true, 'snimanje se mora nastaviti');
});

t('TRAG: fiksovi nose STVARNI historijski timestamp (inače speed-gate odbije sve)', async () => {
  const t0 = 1_000_000;
  const { fn, stanje } = makeCrash({
    snapT: { ts: t0, pts: [[44.900, 16.200, 300, t0]] },
    buf: [{ la: 44.902, lo: 16.202, ac: 6, al: 301, sp: 1.5, t: t0 + 2000 }],
  });
  await fn();
  assert.strictEqual(stanje.dodane.length, 1);
  const d = stanje.dodane[0];
  assert.strictEqual(d.ts, t0 + 2000, 'mora proslijediti vrijeme iz bafera, ne Date.now()');
  assert.strictEqual(d.ac, 6);
  assert.strictEqual(d.al, 301);
  assert.strictEqual(d.sp, 1.5);
});

t('TRAG: fiksovi stariji od zadnje snimljene tačke se NE dupliraju', async () => {
  const t0 = 1_000_000;
  const { fn, stanje } = makeCrash({
    snapT: { ts: t0, pts: [[44.900, 16.200, 300, t0]] },
    buf: [
      { la: 44.899, lo: 16.199, ac: 6, al: 300, sp: 1, t: t0 - 5000 },  // stariji — preskoči
      { la: 44.902, lo: 16.202, ac: 6, al: 300, sp: 1, t: t0 + 2000 },
    ],
  });
  await fn();
  assert.strictEqual(stanje.dodane.length, 1, 'samo noviji smije proći');
  assert.strictEqual(stanje.dodane[0].ts, t0 + 2000);
});

t('VLAKA: dopunjena fiksovima novijim od zadnjeg auto-save-a', async () => {
  const t0 = 1_000_000;
  const { fn, stanje } = makeCrash({
    snapV: { ts: t0, nm: 'T1', color: '#f97316', pts: [[44.900, 16.200, 300], [44.901, 16.201, 300]] },
    buf: [
      { la: 44.8995, lo: 16.1995, ac: 6, al: 300, sp: 1, t: t0 - 9000 }, // prije snimka — preskoči
      { la: 44.902, lo: 16.202, ac: 6, al: 300, sp: 1, t: t0 + 2000 },
      { la: 44.903, lo: 16.203, ac: 6, al: 300, sp: 1, t: t0 + 4000 },
    ],
  });
  await fn();
  assert.strictEqual(stanje.vlake.length, 1);
  assert.strictEqual(stanje.vlake[0].pts.length, 4, 'dobijeno: ' + stanje.vlake[0].pts.length);
  assert.ok(stanje.toasts.some(m => /iz pozadinskog snimanja/.test(m)),
    'korisnik mora vidjeti da je dio tačaka došao iz pozadine: ' + JSON.stringify(stanje.toasts));
});

t('VLAKA: fiks sa katastrofalnom tačnošću (ac>50) se odbacuje pri dopuni', async () => {
  const t0 = 1_000_000;
  const { fn, stanje } = makeCrash({
    snapV: { ts: t0, nm: 'T1', pts: [[44.900, 16.200, 300]] },
    buf: [{ la: 44.95, lo: 16.25, ac: 500, al: 300, sp: 1, t: t0 + 2000 }],
  });
  await fn();
  assert.strictEqual(stanje.vlake[0].pts.length, 1, 'ac=500 ne smije ući u vlaku');
});

t('VLAKA: bez ijedne tačke iz bafera poruka NE spominje pozadinsko snimanje', async () => {
  const t0 = 1_000_000;
  const { fn, stanje } = makeCrash({
    snapV: { ts: t0, nm: 'T1', pts: [[44.900, 16.200, 300]] },
    buf: [],
  });
  await fn();
  assert.ok(stanje.toasts.some(m => /Oporavljena vlaka/.test(m)));
  assert.ok(!stanje.toasts.some(m => /iz pozadinskog snimanja/.test(m)));
});

t('bafer se povuče (i odbaci) i kad korisnik ODBIJE oporavak — ne curi u sljedeće snimanje', async () => {
  const t0 = 1_000_000;
  const { fn, stanje, sandbox } = makeCrash({
    snapT: { ts: t0, pts: [[44.900, 16.200, 300, t0]] },
    buf: [{ la: 44.902, lo: 16.202, ac: 6, al: 300, sp: 1, t: t0 + 2000 }],
    potvrdi: false,
  });
  await fn();
  assert.strictEqual(stanje.drainPozvan, 1, 'bafer mora biti pročitan (dakle i obrisan)');
  assert.strictEqual(sandbox._tragPts.length, 0, 'ništa se ne smije oporaviti');
});

t('nema nedovršenog snimanja → bafer se NE dira (nema šta da mu se doda)', async () => {
  const { fn, stanje } = makeCrash({ buf: [{ la: 44.9, lo: 16.2, ac: 5, al: 300, sp: 1, t: 1 }] });
  await fn();
  assert.strictEqual(stanje.drainPozvan, 0);
});

(async () => {
  for (const a of _async) {
    try { await a.p; pass++; console.log('  ✔ ' + a.name); }
    catch (e) { fail++; console.log('  ✘ ' + a.name + '\n      ' + e.message); }
  }
  console.log('\n' + pass + ' prošlo, ' + fail + ' palo');
  process.exit(fail ? 1 : 0);
})();
