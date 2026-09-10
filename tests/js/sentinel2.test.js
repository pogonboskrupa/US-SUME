// =====================================================================
// Testovi za Sentinel-2 (Copernicus Data Space Ecosystem) — svjež satelitski
// snimak za praćenje opožarenosti (v3.128.0). Pokretanje:
//   node tests/js/sentinel2.test.js
// ---------------------------------------------------------------------
// CORS/endpoint ponašanje CDSE-a se NE MOŽE provjeriti iz sandboxa (isti
// limit kao svaki nov mrežni sloj — vidi CLAUDE.md), pa ovi testovi
// pokrivaju SAMO čistu logiku koja je testabilna bez stvarne mreže:
// keš/fallback ponašanje ključeva, vremenski raspon/MAXCC izbor i pad na
// zadano, OAuth token keš/istek, i da makeCachedTileLayer-ov novi
// `authHeadersFn` kuku ne obori dohvat kad baci grešku. Testovi izvlače
// STVARNI kod iz index.html, ne reimplementaciju.
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
function extractConst(name) {
  const re = new RegExp('const ' + name + '\\s*=');
  const start = HTML.search(re);
  assert.ok(start >= 0, 'nije nađena konstanta ' + name + ' u index.html');
  const end = HTML.indexOf(';', start);
  assert.ok(end > start, 'konstanta ' + name + ' nema ";" — provjeri obrazac');
  return HTML.slice(start, end + 1);
}

let pass = 0, fail = 0;
const _async = [];
function t(name, fn) {
  try {
    const r = fn();
    if (r && typeof r.then === 'function') { _async.push({ name, p: r }); return; }
    pass++; console.log('  ✔ ' + name);
  }
  catch (e) { fail++; console.log('  ✘ ' + name + '\n      ' + e.message); }
}
// Testovi koji mutiraju STVARNE Node globals (global.fetch/URL/window/...) moraju
// ići STROGO REDOM — isti razlog kao u tile-bloburl.test.js: t()+_async pattern
// pokreće fn() odmah, pa bi SLJEDEĆI test svojim makeEnv() prepisao globals dok
// je PRETHODNI još u letu (mikrozadatak/setTimeout), i pogrešan test bi tiho pao.
const _seq = [];
function tSeq(name, fn) { _seq.push({ name, fn }); }

// ─── _s2VremenskiOpseg — WMS TIME=START/END raspon ─────────────────────────
console.log('_s2VremenskiOpseg — gradi WMS TIME raspon od N dana do danas:');

{
  const SRC = [
    extractConst('_S2_RASPONI'),
    extractFn('_s2VremenskiOpseg'),
  ].join('\n');
  const { _s2VremenskiOpseg } = new Function(SRC + '\nreturn { _s2VremenskiOpseg };')();

  t('raspon "7" daje tačno 7 dana razlike između početka i kraja', () => {
    const [pocetak, kraj] = _s2VremenskiOpseg('7').split('/');
    const dani = (new Date(kraj) - new Date(pocetak)) / 86400000;
    assert.strictEqual(dani, 7);
  });

  t('kraj raspona je DANAŠNJI datum (ISO, bez vremena)', () => {
    const [, kraj] = _s2VremenskiOpseg('14').split('/');
    assert.strictEqual(kraj, new Date().toISOString().slice(0, 10));
  });

  t('nepoznat/nedostajući id pada na DRUGI unos liste (14 dana), ne baca', () => {
    const [pocetak, kraj] = _s2VremenskiOpseg('nepostojeci').split('/');
    const dani = (new Date(kraj) - new Date(pocetak)) / 86400000;
    assert.strictEqual(dani, 14);
    const [p2, k2] = _s2VremenskiOpseg(undefined).split('/');
    assert.strictEqual((new Date(k2) - new Date(p2)) / 86400000, 14);
  });
}

// ─── _s2Raspon / _s2Maxcc — localStorage izbor sa padom na zadano ──────────
console.log('_s2Raspon/_s2Maxcc — čitaju izbor iz localStorage, padaju na zadano:');

{
  const SRC = [
    extractConst('_S2_RASPONI'),
    extractConst('_S2_RASPON_KEY'),
    extractConst('_S2_MAXCC_KEY'),
    extractFn('_s2Raspon'),
    extractFn('_s2Maxcc'),
  ].join('\n');

  function make(store) {
    const sandbox = { localStorage: { getItem: (k) => (k in store ? store[k] : null) } };
    const keys = Object.keys(sandbox);
    return new Function(...keys, SRC + '\nreturn { _s2Raspon, _s2Maxcc };')(...keys.map(k => sandbox[k]));
  }

  t('prazan localStorage → zadano 14 dana / 30% oblaka', () => {
    const { _s2Raspon, _s2Maxcc } = make({});
    assert.strictEqual(_s2Raspon(), '14');
    assert.strictEqual(_s2Maxcc(), 30);
  });

  t('validan sačuvan izbor se poštuje', () => {
    const { _s2Raspon, _s2Maxcc } = make({
      tvlake_sentinel2_raspon: '90',
      tvlake_sentinel2_maxcc: '10',
    });
    assert.strictEqual(_s2Raspon(), '90');
    assert.strictEqual(_s2Maxcc(), 10);
  });

  t('neispravna/proizvoljna sačuvana vrijednost pada na zadano, ne baca', () => {
    const { _s2Raspon, _s2Maxcc } = make({
      tvlake_sentinel2_raspon: '3',      // nije u _S2_RASPONI
      tvlake_sentinel2_maxcc: '77',      // nije u dozvoljenom skupu
    });
    assert.strictEqual(_s2Raspon(), '14');
    assert.strictEqual(_s2Maxcc(), 30);
  });
}

// ─── _s2KljucKesUcitaj / _s2Podeseno — offline-first keš ključeva ──────────
console.log('_s2KljucKesUcitaj/_s2Podeseno — sinhroni localStorage keš, otporan na korupciju:');

{
  const SRC = [
    extractConst('_S2_KLJUCEVI_KES'),
    'let _s2Kljucevi = { clientId: \'\', clientSecret: \'\', instanceId: \'\', layer: \'TRUE-COLOR\' };',
    extractFn('_s2KljucKesUcitaj'),
    extractFn('_s2Podeseno'),
  ].join('\n');

  function make(store) {
    const sandbox = { localStorage: { getItem: (k) => (k in store ? store[k] : null) } };
    const keys = Object.keys(sandbox);
    return new Function(...keys,
      SRC + '\n_s2KljucKesUcitaj();\nreturn { _s2Kljucevi, _s2Podeseno };'
    )(...keys.map(k => sandbox[k]));
  }

  t('bez keša: prazni ključevi, _s2Podeseno() je false', () => {
    const { _s2Kljucevi, _s2Podeseno } = make({});
    assert.strictEqual(_s2Kljucevi.clientId, '');
    assert.strictEqual(_s2Kljucevi.layer, 'TRUE-COLOR');
    assert.strictEqual(_s2Podeseno(), false);
  });

  t('korumpiran JSON u kešu ne baca — ostaje prazno/nepodešeno', () => {
    const { _s2Podeseno } = make({ tvlake_sentinel2_kljucevi_kes: '{ovo nije json' });
    assert.strictEqual(_s2Podeseno(), false);
  });

  t('validan keš puni sva četiri polja, _s2Podeseno() postaje true', () => {
    const { _s2Kljucevi, _s2Podeseno } = make({
      tvlake_sentinel2_kljucevi_kes: JSON.stringify({
        clientId: 'cid', clientSecret: 'sec', instanceId: 'inst', layer: 'CUSTOM'
      })
    });
    assert.strictEqual(_s2Kljucevi.clientId, 'cid');
    assert.strictEqual(_s2Kljucevi.clientSecret, 'sec');
    assert.strictEqual(_s2Kljucevi.instanceId, 'inst');
    assert.strictEqual(_s2Kljucevi.layer, 'CUSTOM');
    assert.strictEqual(_s2Podeseno(), true);
  });

  t('nedostaje Instance ID (client_id/secret uneseni, treće polje ne) → i dalje false', () => {
    const { _s2Podeseno } = make({
      tvlake_sentinel2_kljucevi_kes: JSON.stringify({ clientId: 'cid', clientSecret: 'sec', instanceId: '' })
    });
    assert.strictEqual(_s2Podeseno(), false);
  });
}

// ─── _s2TokenUzmi — OAuth2 client-credentials, keš/istek/greška ────────────
console.log('_s2TokenUzmi — token se kešira dok ne istekne, greška ne baca:');

{
  const SRC = [extractConst('_S2_TOKEN_URL'), extractFn('_s2TokenUzmi')].join('\n');

  function make({ kljucevi, token = null, fetchImpl }) {
    const sandbox = {
      _s2Kljucevi: kljucevi,
      _s2Token: token,
      _s2Podeseno: () => !!(kljucevi.clientId && kljucevi.clientSecret && kljucevi.instanceId),
      _fetchT: fetchImpl,
    };
    const keys = Object.keys(sandbox);
    // _s2Token je `let` u pravom kodu (mijenja se unutar funkcije) — sandbox ga
    // izlaže kroz objekat da test poslije poziva može pročitati novu vrijednost
    // (isti razlog kao gps-bg-buffer.test.js zamka sa _tragPts/_tragOn rebind-om).
    const holder = { v: token };
    const fn = new Function(...keys, 'holder',
      SRC
      + '\nreturn (async () => { const r = await _s2TokenUzmi(); holder.v = _s2Token; return { r, tok: holder.v }; })();'
    );
    return () => fn(...keys.map(k => sandbox[k]), holder);
  }

  t('nije podešeno (nedostaje ključ) → vraća null bez mrežnog poziva', async () => {
    let called = false;
    const run = make({
      kljucevi: { clientId: '', clientSecret: '', instanceId: '' },
      fetchImpl: async () => { called = true; return { ok: true, json: async () => ({}) }; },
    });
    const { r } = await run();
    assert.strictEqual(r, null);
    assert.strictEqual(called, false);
  });

  t('nema keširanog tokena → dohvata, keš postavljen sa exp u budućnosti', async () => {
    const run = make({
      kljucevi: { clientId: 'a', clientSecret: 'b', instanceId: 'c' },
      fetchImpl: async () => ({ ok: true, json: async () => ({ access_token: 'TOK1', expires_in: 600 }) }),
    });
    const { r, tok } = await run();
    assert.strictEqual(r, 'TOK1');
    assert.strictEqual(tok.access_token, 'TOK1');
    assert.ok(tok.exp > Date.now());
  });

  t('već važeći (nepistekao) token u kešu → NE zove mrežu, vraća keširani', async () => {
    let called = false;
    const run = make({
      kljucevi: { clientId: 'a', clientSecret: 'b', instanceId: 'c' },
      token: { access_token: 'CACHED', exp: Date.now() + 60000 },
      fetchImpl: async () => { called = true; return { ok: true, json: async () => ({ access_token: 'NOVI', expires_in: 600 }) }; },
    });
    const { r } = await run();
    assert.strictEqual(r, 'CACHED');
    assert.strictEqual(called, false);
  });

  t('istekao (ili u 30s marži) token u kešu → dohvata NOVI', async () => {
    const run = make({
      kljucevi: { clientId: 'a', clientSecret: 'b', instanceId: 'c' },
      token: { access_token: 'STARI', exp: Date.now() + 5000 }, // unutar 30s marže
      fetchImpl: async () => ({ ok: true, json: async () => ({ access_token: 'SVJEZI', expires_in: 600 }) }),
    });
    const { r } = await run();
    assert.strictEqual(r, 'SVJEZI');
  });

  t('mrežna greška (fetch baca) → vraća null, ne baca dalje', async () => {
    const run = make({
      kljucevi: { clientId: 'a', clientSecret: 'b', instanceId: 'c' },
      fetchImpl: async () => { throw new Error('mreza pala'); },
    });
    const { r } = await run();
    assert.strictEqual(r, null);
  });

  t('server odgovori bez access_token (npr. pogrešan client_secret) → null', async () => {
    const run = make({
      kljucevi: { clientId: 'a', clientSecret: 'pogresan', instanceId: 'c' },
      fetchImpl: async () => ({ ok: true, json: async () => ({ error: 'invalid_client' }) }),
    });
    const { r } = await run();
    assert.strictEqual(r, null);
  });

  t('r.ok === false (HTTP greška) → null', async () => {
    const run = make({
      kljucevi: { clientId: 'a', clientSecret: 'b', instanceId: 'c' },
      fetchImpl: async () => ({ ok: false, json: async () => ({}) }),
    });
    const { r } = await run();
    assert.strictEqual(r, null);
  });
}

// ─── makeCachedTileLayer authHeadersFn — greška se guta, dohvat ne padne ───
console.log('makeCachedTileLayer — options.authHeadersFn: zaglavlje se šalje, greška se guta:');

{
  const SRC = extractFn('makeCachedTileLayer');

  class FakeLayer {
    constructor(opts) { Object.assign(this, opts || {}); this._handlers = {}; this.options = opts || {}; }
    on(evt, fn) { (this._handlers[evt] = this._handlers[evt] || []).push(fn); }
    fire() {}
    getTileUrl() { return 'https://sh.dataspace.copernicus.eu/ogc/wms/test?x=1'; }
    getTileSize() { return { x: 256, y: 256 }; }
  }
  const FakeL = { TileLayer: { extend(proto) { class Ext extends FakeLayer {} Object.assign(Ext.prototype, proto); return Ext; } } };

  function makeEnv({ authHeadersFn, fetchCalls }) {
    global.L = FakeL;
    global.AbortController = class { constructor() { this.signal = {}; } abort() {} };
    global.document = { createElement: () => ({ _ctls: null, set src(v) {}, set onload(f) {}, set onerror(f) {} }) };
    global.window = {}; // 'caches' in window → false (nema tog svojstva), load() ide pravo na fromNet
    global.fetch = (u, opts) => { fetchCalls.push(opts); return Promise.resolve({ ok: true, headers: { get: () => 'image/png' }, blob: async () => ({}) }); };
    global.Blob = class {};
    global.URL = { createObjectURL: () => 'blob:x', revokeObjectURL: () => {} };
    global.TILE_CACHE_NAME = 'tvlake-tiles-v1';
    const Klasa = new Function('L', 'window', 'document', SRC + '\nreturn makeCachedTileLayer;')(global.L, global.window, global.document)('test-cache', null);
    return new Klasa({ authHeadersFn });
  }

  tSeq('authHeadersFn koji vrati header → fetch dobija Authorization', async () => {
    const fetchCalls = [];
    const layer = makeEnv({
      authHeadersFn: async () => ({ Authorization: 'Bearer XYZ' }),
      fetchCalls,
    });
    const img = layer.createTile({ x: 1, y: 1, z: 5 }, () => {});
    await new Promise(r => setTimeout(r, 10));
    assert.strictEqual(fetchCalls.length, 1);
    assert.deepStrictEqual(fetchCalls[0].headers, { Authorization: 'Bearer XYZ' });
  });

  tSeq('authHeadersFn koji BACI grešku → fetch se ipak pozove, BEZ zaglavlja (ne padne)', async () => {
    const fetchCalls = [];
    const layer = makeEnv({
      authHeadersFn: async () => { throw new Error('token nedostupan'); },
      fetchCalls,
    });
    const img = layer.createTile({ x: 1, y: 1, z: 5 }, () => {});
    await new Promise(r => setTimeout(r, 10));
    assert.strictEqual(fetchCalls.length, 1);
    assert.strictEqual(fetchCalls[0].headers, undefined);
  });

  tSeq('bez authHeadersFn (svi postojeći slojevi) → headers ostaje undefined, ponašanje nepromijenjeno', async () => {
    const fetchCalls = [];
    const layer = makeEnv({ authHeadersFn: undefined, fetchCalls });
    const img = layer.createTile({ x: 1, y: 1, z: 5 }, () => {});
    await new Promise(r => setTimeout(r, 10));
    assert.strictEqual(fetchCalls.length, 1);
    assert.strictEqual(fetchCalls[0].headers, undefined);
  });
}

(async () => {
  for (const a of _async) {
    try { await a.p; pass++; console.log('  ✔ ' + a.name); }
    catch (e) { fail++; console.log('  ✘ ' + a.name + '\n      ' + e.message); }
  }
  // _seq: mora ići STROGO REDOM (vidi komentar uz definiciju tSeq) — fn() se
  // poziva TEK ovdje, jedan po jedan, čekajući kraj prije sljedećeg.
  for (const s of _seq) {
    try { await s.fn(); pass++; console.log('  ✔ ' + s.name); }
    catch (e) { fail++; console.log('  ✘ ' + s.name + '\n      ' + e.message); }
  }
  console.log('\n' + pass + ' prošlo, ' + fail + ' palo');
  process.exit(fail ? 1 : 0);
})();
