// Učitaj kartu: sort "Moje karte" i sažetak; Tematska: redoslijed kartice i izbor fajla (v4.9.4).
'use strict';
const assert = require('node:assert');
const HTML = require('./_izvor').izvor();
function fn(name) {
  let s = HTML.indexOf('function ' + name + '(');
  assert.ok(s >= 0, name);
  let i = HTML.indexOf('{', s), d = 0;
  for (; i < HTML.length; i++) { if (HTML[i] === '{') d++; else if (HTML[i] === '}' && --d === 0) return HTML.slice(s, i + 1); }
}
const store = {};
const ctx = new Function('localStorage', '_LOADMAP_SORT_KEY', '_LOADMAP_SORTOVI',
  [fn('_loadmapSortGet'), fn('_loadmapSortiraj'), 'return {_loadmapSortGet,_loadmapSortiraj};'].join('\n'))(
  { getItem: k => store[k] ?? null, setItem: (k, v) => { store[k] = v; } },
  'k', [['novo', 'x'], ['naziv', 'x'], ['velicina', 'x']]);
const maps = [
  { name: 'B', size: 5, savedAt: 1, visible: false },
  { name: 'a10', size: 50, savedAt: 3, visible: false },
  { name: 'a2', size: 20, savedAt: 2, visible: true },
];
const n = (m, k) => ctx._loadmapSortiraj(m, k).map(x => x.name).join();
assert.strictEqual(n(maps, 'novo'), 'a2,a10,B', 'prikazana prva, pa najnovija');
assert.strictEqual(n(maps, 'naziv'), 'a2,a10,B', 'prikazana prva, pa prirodno po nazivu');
assert.strictEqual(n(maps.map(m => ({ ...m, visible: false })), 'naziv'), 'a2,a10,B');
assert.strictEqual(n(maps.map(m => ({ ...m, visible: false })), 'velicina'), 'a10,a2,B');
assert.strictEqual(maps[0].name, 'B', 'ulazni niz se ne mijenja');
assert.strictEqual(ctx._loadmapSortGet(), 'novo');
store.k = 'naziv'; assert.strictEqual(ctx._loadmapSortGet(), 'naziv');
store.k = 'smece'; assert.strictEqual(ctx._loadmapSortGet(), 'novo');
// Tematska: radnje i jačina boje su IZNAD legende, birač fajla samo uz više fajlova
const t = require('node:fs').readFileSync(__dirname + '/../../static/js/app/tematska-karta.js', 'utf8');
assert.ok(t.indexOf("<div class=\"tem-akc\">") < t.indexOf("${m.theme ? _temPregledHtml(m) : ''}"), 'legenda ispod radnji');
assert.ok(t.includes('_temMaps.length > 1 ? `<label class="tem-picker">'), 'birač fajla samo kad ima više fajlova');
console.log('loadmap-sort-tem-redoslijed: ok');
