// Uređivanje traga TOKOM snimanja (v3.0.0) + brisanje korisnika (FK).
'use strict';
const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict');
const html = fs.readFileSync('index.html', 'utf8');
function fn(name) {
  const start = html.search(new RegExp('(?:async )?function ' + name + '\\('));
  assert.ok(start >= 0, name);
  let depth = 0;
  for (let i = html.indexOf('{', start); i < html.length; i++) {
    if (html[i] === '{') depth++;
    if (html[i] === '}' && --depth === 0) return html.slice(start, i + 1);
  }
}
let ok = 0, fail = 0;
const t = (n, f) => { try { f(); ok++; console.log('OK', n); } catch (e) { fail++; console.log('FAIL', n, e.message); } };

// Tačke ~11 m razmaka po geografskoj širini, vrijeme 1000 ms po tački.
function sandbox(n) {
  const pts = Array.from({ length: n }, (_, i) => [44 + i * 0.0001, 16, 300, 1000 * (i + 1), 4]);
  const toasts = [], crash = [];
  const env = {
    _tragOn: true, _tragPaused: false, _tragPts: pts, _tragBuf: [1, 2], _tragLastT: 99999,
    _tragRetraceBaza: 50, _tragLine: null, _activeTab: 'karta', _lineStyle: { tragW: 3 },
    _tragLiveMeta: {},
    dst: (a, b, c, d) => Math.hypot((a - c) * 111000, (b - d) * 78000),
    showToast: m => toasts.push(m), _tragLiveClear() {}, _tragLineSync() {}, _updTragStats() {},
    _tragFmtLen: m => Math.round(m) + ' m', _tragCalcLen: () => 0, _tragUrediInfo() {},
    _crashSaveTrag: () => crash.push(env._tragPts.length), document: { getElementById: () => null },
  };
  vm.createContext(env);
  vm.runInContext(['function _tragRetraceReset(baza){_tragRetrace=null;_tragRetraceBaza=baza>0?baza:0;}',
    'var _tragRetrace=null;', fn('_tragUkloniZadnje'), fn('_tragDashArr'), fn('_tragLiveStil')].join('\n'), env);
  return { env, toasts, crash };
}

t('"Zadnju tačku" skida tačno jednu i vraća brzinsku kapiju na njeno vrijeme', () => {
  const s = sandbox(10);
  assert.equal(s.env._tragUkloniZadnje(0), 1);
  assert.equal(s.env._tragPts.length, 9);
  assert.equal(s.env._tragLastT, 9000, 'kapija mjeri od nove zadnje tačke, ne od uklonjene');
  assert.equal(s.env._tragBuf.length, 0);
  assert.equal(s.env._tragRetraceBaza, 8, 'baza povratka ne smije pokazivati iza kraja');
  assert.deepEqual(s.crash, [9], 'crash snimak odmah bez uklonjenih tačaka');
});
t('"Zadnjih 20 m" skida dok ne pređe 20 m (2 segmenta po ~11 m)', () => {
  const s = sandbox(10);
  assert.equal(s.env._tragUkloniZadnje(20), 2);
  assert.equal(s.env._tragPts.length, 8);
});
t('prva tačka ostaje i kad se traži više nego što trag ima', () => {
  const s = sandbox(4);
  s.env._tragUkloniZadnje(5000);
  assert.equal(s.env._tragPts.length, 1);
  assert.equal(s.env._tragUkloniZadnje(0), 0, 'sa jednom tačkom nema šta ukloniti');
});
t('pauzirano snimanje: uklanjanje radi, ali crash snimak čeka nastavak', () => {
  const s = sandbox(5); s.env._tragPaused = true;
  s.env._tragUkloniZadnje(0);
  assert.equal(s.env._tragPts.length, 4); assert.equal(s.crash.length, 0);
});
t('stil žive linije prati izbor (boja, iscrtkana/tačkasta)', () => {
  const s = sandbox(2);
  s.env._tragLiveMeta = { color: '#38bdf8', dashStyle: 'dash' };
  const st = s.env._tragLiveStil();
  assert.equal(st.color, '#38bdf8'); assert.equal(st.dashArray, '8 4'); assert.equal(st.pane, 'tragMsrLines');
  s.env._tragLiveMeta = null;
  assert.equal(s.env._tragLiveStil().color, '#f97316'); assert.equal(s.env._tragLiveStil().dashArray, null);
});
t('sačuvani trag dobija naziv/boju/stil uređene tokom snimanja; prazan naziv ne briše zadani', () => {
  const env = { _tragRegistry: [], _TRAG_COLORS: ['#f97316'], _aktivniProjektId: null, _projekti: [],
    fmtDateShort: () => '13.10.', _genUUID: () => 'u', _tragRegSave: () => true, _tragRegAddLayer() {}, _tragRegRender() {} };
  vm.createContext(env); vm.runInContext(fn('_tragRegAdd'), env);
  const a = env._tragRegAdd([[1, 1], [2, 2]], { name: ' Obilazak ', color: '#38bdf8', dashStyle: 'dot', weight: 5 });
  assert.equal(a.name, 'Obilazak'); assert.equal(a.color, '#38bdf8'); assert.equal(a.dashStyle, 'dot'); assert.equal(a.weight, 5);
  const b = env._tragRegAdd([[1, 1], [2, 2]], { name: '   ' });
  assert.equal(b.name, 'Trag 13.10.');
  assert.equal(env._tragRegAdd([[1, 1], [2, 2]]).color, '#f97316', 'bez meta ponašanje je staro');
});
t('stop i oporavak nose uređeni stil; crash snimak čuva meta', () => {
  assert.match(fn('fabSnimTrag'), /_tragRegAdd\(final, _tragLiveMeta\)/);
  assert.match(fn('_crashSaveTrag'), /meta: _tragLiveMeta/);
  assert.match(fn('_crashCheck'), /_tragLiveMeta = \(snapT\.meta/);
  assert.match(fn('_fabSnimTragBegin'), /_tragLiveMeta = \{\};[\s\S]*_tragLiveStil\(\)/);
});
t('traka snimanja traga otvara uređivanje', () => {
  assert.match(html, /id="ab-trag-stats"[^>]*onclick="_tragUrediOtvori\(\)"/);
  assert.match(html, /id="trag-ured" class="rs-sheet"/);
});
t('brisanje korisnika: migracija razrješava SVAKI blokirajući FK i traži admina', () => {
  const sql = fs.readFileSync('supabase/migrations/20261013_admin_delete_user_fk.sql', 'utf8');
  assert.match(sql, /public\.je_admin\(\)/);
  assert.match(sql, /confdeltype IN \('a', 'r'\)/);
  assert.match(sql, /'auth\.users'::regclass, 'public\.korisnici'::regclass/);
  assert.match(sql, /SET %I = NULL/); assert.match(sql, /DELETE FROM %s WHERE %I = \$1/);
  assert.ok(sql.indexOf('END LOOP') < sql.indexOf('DELETE FROM auth.users'), 'FK se razrješavaju PRIJE brisanja naloga');
  assert.match(fn('adminDeleteUser'), /foreign key\|23503/);
});
console.log(`trag-ured: ${ok} ok, ${fail} palo`);
process.exit(fail ? 1 : 0);
