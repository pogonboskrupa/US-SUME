// =====================================================================
// SQLite karte preko 20 MB (OPFS put): worker kod je TEMPLATE STRING.
// Pokretanje:  node tests/js/sqlmap-worker-src.test.js
// ---------------------------------------------------------------------
// _SQL_WORKER_SRC = `...` je izvor workera kao string. U template stringu
// je "\s" obično slovo "s", "\(" je "(" — pa je regex /\s+/ u workeru
// postajao /s+/ (dijeli po SLOVU s). Nazivi kolona "x int", "z int" se
// tako nisu svodili na "x"/"z", SQLiteDB (RMaps/Locus/OruxMaps) se nije
// prepoznavao i čitao se kao MBTiles: karta "učitana a ne vidi se"
// (v1.8.3). Test izvršava izvor TAČNO kao što ga worker dobije (kao
// vrijednost stringa), ne sirov tekst iz fajla — sirov tekst je zdrav i
// baš zato je greška godinama promicala.
// =====================================================================
'use strict';
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const HTML = fs.readFileSync(path.join(__dirname, '../../index.html'), 'utf8');

const POC = 'const _SQL_WORKER_SRC = `';
const a = HTML.indexOf(POC) + POC.length;
let j = a;
for (;;) { j = HTML.indexOf('`', j); if (HTML[j - 1] !== '\\') break; j++; }
const RAW = HTML.slice(a, j);
// Vrijednost koju worker stvarno dobija (template literal evaluiran)
const SRC = new Function('_SQLJS_CDN', '_SQLJS_LOCAL', 'return `' + RAW + '`;')('cdn/', 'local/');

let pass = 0, fail = 0;
const cekaj = [];
function t(name, fn) {
  const ok = () => { console.log('  ✔ ' + name); pass++; };
  const ko = e => { fail++; console.log('  ✘ ' + name + '\n      ' + e.message); };
  try { const r = fn(); if (r && r.then) cekaj.push(r.then(ok, ko)); else ok(); } catch (e) { ko(e); }
}
console.log('SQLite worker izvor:');

t('nijedan regex u workeru ne gubi backslash (\\s, \\(, \\[ … moraju biti udvostručeni)', () => {
  // Jednostruki "\" ispred znaka koji nije JS escape u template stringu tiho nestaje.
  const lose = [...RAW.matchAll(/(?<!\\)\\([^\\nrtbfvux0`$\n'"])/g)]
    .map(m => RAW.slice(Math.max(0, m.index - 30), m.index + 10).replace(/\s+/g, ' '));
  assert.deepStrictEqual(lose, [], 'backslash se gubi u: ' + lose.join(' | '));
  assert.ok(SRC.includes('split(/\\s+/)') && SRC.includes('/primary\\s+key\\s*\\(([^)]*)\\)/'));
});

const s = SRC.indexOf('class MiniSqlite {'), e = SRC.indexOf('// ── Kraj MiniSqlite');
const MiniSqlite = new Function(SRC.slice(s, e) + '\nreturn MiniSqlite;')();
function otvori(ime) {
  const buf = fs.readFileSync(path.join(__dirname, '../fixtures', ime));
  const file = { size: buf.length, slice: (x, y) => ({ arrayBuffer: async () =>
    buf.buffer.slice(buf.byteOffset + x, buf.byteOffset + Math.min(y, buf.length)) }) };
  return new MiniSqlite(file);
}
const jePng = d => d && d[0] === 0x89 && d[1] === 0x50;

t('SQLiteDB (RMaps/Locus/OruxMaps, PRIMARY KEY bez CREATE INDEX) se prepoznaje i čita', async () => {
  const m = otvori('rmaps-mini.sqlitedb');
  const r = await m.init();
  assert.strictEqual(r.fmt, 'rmaps');
  assert.deepStrictEqual([m.colX, m.colY, m.colZ, m.colD], [0, 1, 2, 4]);
  assert.deepStrictEqual([r.meta.minzoom, r.meta.maxzoom], [12, 14], 'zum mora biti stvaran, ne x kolona (bilo "554–22")');
  assert.ok(jePng(await m.tile(13, 4463, 2940)), 'pločica z13 nije pročitana');
  assert.ok(jePng(await m.tile(12, 2233, 1470)));
  assert.strictEqual(await m.tile(13, 999, 999), null);
});

t('MBTiles i dalje radi (TMS okretanje reda)', async () => {
  const m = otvori('mbtiles-mini.mbtiles');
  const r = await m.init();
  assert.strictEqual(r.fmt, 'mbtiles');
  assert.ok(jePng(await m.tile(12, 2231, 1470)) && jePng(await m.tile(13, 4462, 2940)));
});

t('main-thread rezerva (_MiniSqliteMain) koristi isti evaluiran izvor', () => {
  assert.ok(/new Function\(_SQL_WORKER_SRC\.slice\(s, e\)/.test(HTML));
});

Promise.all(cekaj).then(() => {
  console.log(`\n${pass} prošlo, ${fail} palo`);
  process.exit(fail ? 1 : 0);
});
