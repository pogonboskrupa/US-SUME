// =====================================================================
// Offline karta (SQLiteDB/MBTiles) — prazan rub dok se karta vuče (v1.8.9).
// Pokretanje:  node tests/js/sqlmap-pan.test.js
// ---------------------------------------------------------------------
// Terenska prijava: "dok skrolam nema tileova na perifernim mjestima".
// Izmjereno Playwright-om nad STVARNIM slojem (28 MB SQLiteDB, OPFS čitač i
// sql.js put): tokom povlačenja je rub koji ulazi u prikaz bio 0 % popunjen
// do puštanja prsta (`updateWhenIdle:true`, bez pločica van prikaza).
// Sad: pločice se traže i tokom povlačenja, obruč od _SQL_TILE_OBRUC pločica
// oko prikaza se učitava unaprijed, a red čitanja bira pločicu najbližu centru.
//
// Testira se STVARNI kod izvučen iz index.html.
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
function extractConst(name) {
  const start = HTML.indexOf('const ' + name + ' =');
  if (start < 0) throw new Error('nije nađena konstanta ' + name);
  let i = HTML.indexOf('{', start), depth = 0;
  for (; i < HTML.length; i++) {
    if (HTML[i] === '{') depth++;
    else if (HTML[i] === '}') { depth--; if (depth === 0) return HTML.slice(start, HTML.indexOf(';', i) + 1); }
  }
  throw new Error('nezatvorena konstanta ' + name);
}

let pass = 0, fail = 0;
const cekaj = [];
function t(name, fn) {
  const r = (async () => fn())();
  cekaj.push(r.then(() => { console.log('  ✔ ' + name); pass++; },
    e => { fail++; console.log('  ✘ ' + name + '\n      ' + e.message); }));
}

// ── Izbor sljedećeg zahtjeva ──────────────────────────────────────────────
const uzmi = new Function(extractFn('_tileUzmiSljedeci') + '\nreturn _tileUzmiSljedeci;')();
function zahtjev(id, pri, log) {
  const r = () => {};
  r.id = id;
  if (pri !== undefined) r._pri = () => pri;
  r._odustani = () => log && log.push(id);
  return r;
}

console.log('Red čitanja pločica — najbliža centru prva:');

t('bira NAJMANJI prioritet (najbližu centru), ne redoslijed dolaska', () => {
  const red = [zahtjev('a', 3), zahtjev('b', 0.5), zahtjev('c', 2)];
  assert.strictEqual(uzmi(red).id, 'b');
  assert.deepStrictEqual(red.map(r => r.id), ['a', 'c']);
});

t('KLJUČNO: unutar jednog _update-a ne ide NAJDALJA prva (stari LIFO jeste)', () => {
  // Leaflet pravi zahtjeve od centra ka rubu — zadnji je najdalji.
  const red = [zahtjev('centar', 0.5), zahtjev('blizu', 1.5), zahtjev('obruc', 2.5)];
  assert.strictEqual(uzmi(red).id, 'centar');
});

t('pločica koju Leaflet više ne drži (null) se izbacuje i razrješava bez čitanja', () => {
  const log = [];
  const red = [zahtjev('mrtva1', null, log), zahtjev('ziva', 4), zahtjev('mrtva2', null, log)];
  assert.strictEqual(uzmi(red).id, 'ziva');
  assert.deepStrictEqual(log.sort(), ['mrtva1', 'mrtva2']);
  assert.strictEqual(red.length, 0);
});

t('samo mrtve u redu → null i red ispražnjen (slot se ne zaglavi)', () => {
  const log = [];
  const red = [zahtjev('x', null, log), zahtjev('y', null, log)];
  assert.strictEqual(uzmi(red), null);
  assert.strictEqual(red.length, 0);
  assert.strictEqual(log.length, 2);
});

t('bez prioriteta (npr. pre-učitavanje) → stari LIFO, i iza pločica sa prioritetom', () => {
  const red = [zahtjev('p1'), zahtjev('p2'), zahtjev('ziva', 1000.5)];
  assert.strictEqual(uzmi(red).id, 'ziva');
  assert.strictEqual(uzmi(red).id, 'p2');
  assert.strictEqual(uzmi(red).id, 'p1');
  assert.strictEqual(uzmi(red), null);
});

t('izbor sa izbacivanjem mrtvih ispred najboljeg vraća TAČAN element', () => {
  const log = [];
  const red = [zahtjev('najbolja', 0), zahtjev('m', null, log), zahtjev('druga', 5)];
  assert.strictEqual(uzmi(red).id, 'najbolja');
  assert.deepStrictEqual(red.map(r => r.id), ['druga']);
});

// ── Prioritet pločice ─────────────────────────────────────────────────────
const prio = new Function(extractFn('_sqlTilePrio') + '\nreturn _sqlTilePrio;')();
function sloj(tiles, centarPx) {
  return {
    _map: {
      getCenter: () => 'C',
      project: (c, z) => ({ unscaleBy: () => ({ x: centarPx.x, y: centarPx.y }) }),
    },
    _tiles: tiles,
    _tileCoordsToKey: c => c.x + ':' + c.y + ':' + c.z,
    getTileSize: () => 256,
  };
}

console.log('Prioritet pločice:');

t('udaljenost od centra prikaza u pločicama (Čebiševljeva)', () => {
  const el = {};
  const l = sloj({ '12:7:15': { el, current: true } }, { x: 10.5, y: 7.5 });
  assert.strictEqual(prio(l, { x: 12, y: 7, z: 15 }, el), 2);
});

t('pločica van tekuće mreže (drugi zum / van keepBuffer) ide na kraj, NE odbacuje se', () => {
  const el = {};
  const l = sloj({ '10:7:14': { el, current: false } }, { x: 10.5, y: 7.5 });
  const p = prio(l, { x: 10, y: 7, z: 14 }, el);
  assert.ok(p !== null && p >= 1000,
    'odbačena pločica koju Leaflet ponovo uvrsti ostala bi prazna zauvijek');
});

t('uklonjena pločica → null', () => {
  const l = sloj({}, { x: 0, y: 0 });
  assert.strictEqual(prio(l, { x: 1, y: 1, z: 15 }, {}), null);
});

t('pločica ZAMIJENJENA novom za isto mjesto → null (stari zahtjev ne troši čitanje)', () => {
  const l = sloj({ '1:1:15': { el: { novi: true }, current: true } }, { x: 0, y: 0 });
  assert.strictEqual(prio(l, { x: 1, y: 1, z: 15 }, { stari: true }), null);
});

t('sloj skinut sa karte → null', () => {
  const el = {};
  const l = sloj({ '1:1:15': { el, current: true } }, { x: 0, y: 0 });
  l._map = null;
  assert.strictEqual(prio(l, { x: 1, y: 1, z: 15 }, el), null);
});

// ── done() samo za pločicu koja je još ta ─────────────────────────────────
const gotovo = new Function(extractFn('_sqlTileGotovo') + '\nreturn _sqlTileGotovo;')();

console.log('Završetak pločice:');

t('zakašnjeli odgovor NE proglašava učitanom NOVU pločicu na istom mjestu', () => {
  let zvan = 0;
  const l = sloj({ '1:1:15': { el: { novi: true } } }, { x: 0, y: 0 });
  gotovo(l, { x: 1, y: 1, z: 15 }, { stari: true }, () => zvan++);
  assert.strictEqual(zvan, 0);
});

t('ista pločica → done(null, el)', () => {
  const el = {}; let arg;
  const l = sloj({ '1:1:15': { el } }, { x: 0, y: 0 });
  gotovo(l, { x: 1, y: 1, z: 15 }, el, (e, x) => { arg = [e, x]; });
  assert.deepStrictEqual(arg, [null, el]);
});

t('pločica još nije upisana (sinhroni done iz createTile) → done se zove', () => {
  let zvan = 0;
  gotovo(sloj({}, { x: 0, y: 0 }), { x: 1, y: 1, z: 15 }, {}, () => zvan++);
  assert.strictEqual(zvan, 1);
});

// ── Obruč i opcije sloja ──────────────────────────────────────────────────
console.log('Obruč oko prikaza i opcije sloja:');

t('_getTiledPixelBounds se širi za _SQL_TILE_OBRUC pločica na sve strane', () => {
  const P = (x, y) => ({ x, y,
    subtract: o => P(x - o.x, y - o.y), add: o => P(x + o.x, y + o.y),
    multiplyBy: k => P(x * k, y * k) });
  const L = {
    GridLayer: { prototype: { _getTiledPixelBounds: () => ({ min: P(1000, 2000), max: P(1360, 2740) }) } },
    bounds: (a, b) => ({ min: a, max: b }),
  };
  const obruc = new Function('L', '_SQL_TILE_OBRUC',
    extractConst('_sqlGridObruc') + '\nreturn _sqlGridObruc;')(L, 1);
  const b = obruc._getTiledPixelBounds.call({ getTileSize: () => P(256, 256) }, 'C');
  assert.deepStrictEqual([b.min.x, b.min.y, b.max.x, b.max.y], [744, 1744, 1616, 2996]);
});

t('opcije: pločice se traže i TOKOM povlačenja (updateWhenIdle:false)', () => {
  const opc = new Function(extractConst('_SQL_GRID_OPC') + '\nreturn _SQL_GRID_OPC;')();
  assert.strictEqual(opc.updateWhenIdle, false,
    'sa true Leaflet traži pločice tek na moveend — rub je prazan dok prst vuče');
  assert.ok(opc.updateInterval > 0 && opc.updateInterval <= 200);
  assert.strictEqual(opc.updateWhenZooming, false);
});

t('OBA sloja (worker i glavna nit) koriste obruč i zajedničke opcije', () => {
  for (const fn of ['_sqlmapCreateLayerW', '_sqlmapCreateLayerMain']) {
    const src = extractFn(fn);
    assert.ok(/L\.GridLayer\.extend\(Object\.assign\(\{\}, _sqlGridObruc,/.test(src), fn + ' bez obruča');
    assert.ok(src.includes('_SQL_GRID_OPC'), fn + ' bez zajedničkih opcija');
    assert.ok(!/updateWhenIdle:\s*true/.test(src), fn + ' i dalje čeka moveend');
    assert.ok(src.includes('_sqlTilePrio(this, coords, img)'), fn + ' bez prioriteta');
    assert.ok(src.includes('_sqlTileGotovo('), fn + ' bez zaštite done()');
  }
});

// ── Stvarni worker raspored: redoslijed izvršavanja ───────────────────────
console.log('Raspored čitanja (stvarni _wTileScheduleCall):');

t('kad se slot oslobodi, prvo se čita pločica najbliža centru', async () => {
  const pozvani = [];
  const cekaju = [];
  const env = new Function('_sqlWCall', '_tileUzmiSljedeci',
    'let _wTileActive = 0; const _wTileStack = []; const _W_TILE_MAX_INFLIGHT = 1;' +
    'const _now = () => 0; const _tileProf = {qWaitN:0,qWaitSum:0,qWaitMax:0,reads:0,readSum:0,readMax:0};\n' +
    extractFn('_wTileScheduleCall') + '\nreturn { _wTileScheduleCall, red: _wTileStack };')(
    msg => { pozvani.push(msg.x); return new Promise(r => cekaju.push(r)); }, uzmi);
  const rez = [];
  const pr = { 0: 0, 5: 2.5, 6: 0.5, 7: 1.5, 8: null };
  for (const x of [0, 5, 6, 7, 8]) {
    const p = pr[x] === undefined ? undefined : () => pr[x];
    rez.push(env._wTileScheduleCall({ type: 'tile', x }, p));
  }
  assert.deepStrictEqual(pozvani, [0], 'samo jedan slot');
  for (let k = 0; k < 4 && cekaju.length; k++) {
    cekaju.shift()({ data: null });
    await new Promise(r => setTimeout(r, 0));
  }
  assert.deepStrictEqual(pozvani, [0, 6, 7, 5], 'mrtva (x=8) se ne čita, ostale od centra ka rubu');
  const r8 = await rez[4];
  assert.strictEqual(r8, null, 'odbačen zahtjev se RAZRJEŠAVA (inače pločica ostane "loading")');
});

Promise.all(cekaj).then(() => {
  console.log(`\n${pass} prošlo, ${fail} palo`);
  process.exit(fail ? 1 : 0);
});
