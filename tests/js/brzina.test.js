// =====================================================================
// Brzina — zaleđen ekran pri pokretanju i periodičnom sync-u (v1.9.3).
// Pokretanje:  node tests/js/brzina.test.js
// ---------------------------------------------------------------------
// Izmjereno Playwright-om (CPU 4×, 40 vlaka, 20 neposlanih tragova): vlake su
// se pojavljivale tek za 7,5–9 s, a ekran je bio zaleđen 1,8–2,8 s u komadu.
// Dva uzroka: svaki pokušaj slanja JEDNOG traga je prepisivao CIJELI registar
// tragova u localStorage (3,2 s), a linija vlake se gradila tačku po tačku
// (Leaflet poslije svake ponovo projektuje cijelu liniju — 0,7 s).
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

const _store = new Map();
global.localStorage = {
  getItem: k => (_store.has(k) ? _store.get(k) : null),
  setItem: (k, v) => _store.set(k, String(v)),
  removeItem: k => _store.delete(k),
};
global.showToast = () => {};
const { _OL } = require('../../static/js/offline-layer.js');

let pass = 0, fail = 0;
const testovi = [];
function t(name, fn) { testovi.push([name, fn]); }


console.log('Red za sync:');

t('dva traga ISTOG dana (isto ime) oba ostaju u redu — dedup gleda client_uuid', () => {
  _store.clear();
  _OL.enqueue({ type: 'upsert_trag', payload: { nm: '2026-09-30', korisnik_id: 'u1', client_uuid: 'u-A', pts: [1] } });
  _OL.enqueue({ type: 'upsert_trag', payload: { nm: '2026-09-30', korisnik_id: 'u1', client_uuid: 'u-B', pts: [2] } });
  assert.strictEqual(_OL.loadQueue().length, 2, 'drugi trag je izbacio prvog iz reda');
  _OL.enqueue({ type: 'upsert_trag', payload: { nm: '2026-09-30', korisnik_id: 'u1', client_uuid: 'u-A', pts: [3] } });
  const q = _OL.loadQueue();
  assert.strictEqual(q.length, 2, 'nova verzija ISTOG traga i dalje zamjenjuje staru');
  assert.deepStrictEqual(q.find(o => o.payload.client_uuid === 'u-A').payload.pts, [3]);
});

console.log('\nLinija vlake se gradi odjednom:');

t('KLJUČNO: _applyVlakeRows ne dodaje tačke jednu po jednu (kvadratno)', () => {
  let addLatLng = 0, tacakaUKonstruktoru = 0;
  const L = { polyline: (ll) => { tacakaUKonstruktoru += ll.length;
    const p = { addTo() { return p; }, bindTooltip() { return p; }, addLatLng() { addLatLng++; return p; },
      setLatLngs() { return p; }, setStyle() { return p; } }; return p; } };
  const vlake = [];
  const rows = [];
  for (let i = 0; i < 5; i++) {
    const pts = []; for (let k = 0; k < 50; k++) pts.push({ la: 44 + k * 1e-5, lo: 16 + i * 1e-3, al: 300 });
    rows.push({ id: 'v' + i, nm: 'T' + i, br: i, kr: 0, boja: '#0f0', pts, projekt_id: 'P' });
  }
  const noop = () => {};
  new Function('L', 'map', 'vlake', 'sbUser', '_OL', 'getVlakaWeight', 'getVlakaDashArray', '_vlakeRenderer', '_escHtml',
    'attachPolyClick', 'rndList', 'updateVlakaLabel', '_syncIbr', '_updFabVisibility', '_updVlakeMapVisibility',
    extractFn('_applyVlakeRows') + '\nreturn _applyVlakeRows;')(
    L, {}, vlake, { id: 'u1' }, { loadQueue: () => [] }, () => 4, () => null, null, x => x,
    noop, noop, noop, noop, noop, noop)(rows);
  assert.strictEqual(vlake.length, 5);
  assert.strictEqual(addLatLng, 0, addLatLng + ' poziva addLatLng (svaki ponovo iscrta cijelu liniju)');
  assert.strictEqual(tacakaUKonstruktoru, 250, 'linija nije dobila sve tačke odjednom');
  assert.strictEqual(vlake[0].pts.length, 50);
});

t('oporavak prekinute vlake također gradi liniju odjednom', () => {
  const src = extractFn('_crashCheck');
  const od = src.indexOf('_recoverVlakaSnapshot(snapV)');
  const dio = src.slice(od, src.indexOf('if (snapT)', od));
  assert.ok(dio.length > 100, 'nije nađena grana oporavka vlake');
  assert.ok(!/addLatLng\(/.test(dio), 'grana oporavka vlake i dalje zove addLatLng po tački');
});

console.log('\nPokretanje:');

t('debug zapis pri pokretanju ne koristi toLocaleString (prvi Intl poziv je skup)', () => {
  assert.ok(!/\.toLocale/.test(extractFn('_appLifecycleDebug')));
});

(async () => {
  for (const [name, fn] of testovi) {
    try { await fn(); console.log('  ✔ ' + name); pass++; }
    catch (e) { fail++; console.log('  ✘ ' + name + '\n      ' + e.message); }
  }
  console.log('\n' + pass + ' prošlo, ' + fail + ' palo');
  process.exit(fail ? 1 : 0);
})();
