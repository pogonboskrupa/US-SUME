'use strict';
const fs = require('node:fs'), assert = require('node:assert/strict');
const html = fs.readFileSync('index.html', 'utf8');
function fn(name) {
  const start = html.search(new RegExp('(?:async )?function ' + name + '\\('));
  assert.ok(start >= 0, name);
  let pos = html.indexOf('{', start), depth = 0;
  for (let i = pos; i < html.length; i++) {
    if (html[i] === '{') depth++;
    if (html[i] === '}' && --depth === 0) return html.slice(start, i + 1);
  }
  throw Error(name);
}
function bind(name, env, pre = '') {
  return new Function(...Object.keys(env), pre + fn(name) + '\nreturn ' + name)(...Object.values(env));
}
function noviProjekt(kvota = false) {
  const projekti = [], red = [], poruke = [], calls = [];
  let sakriven = false;
  const env = {
    document: { getElementById: id => ({ value: id === 'np-odjel' ? '105' : '' }) },
    _projekti: projekti, _npGjValue: () => 'Vojskova', _dlgConfirm: async () => true,
    sbUser: { id: 'u1' }, sbProfile: { sumarija: 'Krupa' },
    todayStr: () => '2026-10-01', _genUUID: () => 'local-id',
    _OL: { save: () => true, enqueue: op => { if (kvota) return false; red.push(op); return 'q1'; } },
    hideNovProjektForm: () => { sakriven = true; },
    localStorage: { setItem() {} }, rndProjektiList() {}, updProjStats() {},
    showToast: msg => poruke.push(msg), _mrezaProbaj: () => true,
    sb: { from: () => { calls.push('server'); throw Error('mrežni upis nije dozvoljen'); } },
    _isNetworkErr: () => false, console: { error() {} },
  };
  return { run: bind('saveNovProjekt', env, 'let _npSaveInFlight=false, _aktivniProjektId=null;'),
    projekti, red, poruke, calls, get sakriven() { return sakriven; } };
}
function dozSlanje(realId) {
  const tree = { trees: [{ id: 1 }] };
  const store = new Map([['q', JSON.stringify([{ type: 'insert_doz_project', _qid: 'q1', _uid: 'u1', payload: { id: 'local-id', _tempId: 'local-id' } }])], ['trees', JSON.stringify({ 'local-id': tree })]]);
  const storage = { getItem: k => store.get(k) || null, setItem: (k, v) => store.set(k, v) };
  const env = {
    sbUser: { id: 'u1' }, sbProfile: {}, _serverSaljem: true,
    _serverSlanjeDozvoljeno: () => true, _SERVER_SAMO_LOKALNO: new Set(),
    _mrezaProbaj: () => true, _updSyncBadgeUskoro() {}, _updSyncBadge() {},
    _OL: { QUEUE: 'q', loadQueue: () => JSON.parse(store.get('q')),
      removeFromQueue: id => store.set('q', JSON.stringify(JSON.parse(store.get('q')).filter(x => x._qid !== id))),
      save() {}, bumpRetry() { throw Error('neočekivani retry'); } },
    sb: { from: () => { const q = { insert: () => q, select: () => q, single: () => q,
      then: (r, j) => Promise.resolve({ data: { id: realId }, error: null }).then(r, j) }; return q; } },
    localStorage: storage, _dozMarkings: [], _dozOdjeli: [{ id: 'local-id' }], _dozSelId: 'local-id',
    _DOZ_TREES_DATA_KEY: 'trees', DOZ_ENG_COLORS: ['green'],
    _DOZ_TRACK_BUF_KEY: 'gps', _genUUID: () => 'new', showToast() {}, setTimeout() {}, console,
    _isNetworkErr: () => false, _isAuthErr: () => false, _serverPrivremeno: () => null,
  };
  const pre = 'let _syncInProgress=false,_syncRerun=false,_syncMrezaPalaU=0,_syncOdgodaT=null; const _SYNC_PAUZA_MS=20000;';
  return { run: bind('_processOfflineQueue', env, pre), store, tree };
}
const tests = [];
function test(name, f) { tests.push([name, f]); }
test('novi projekat na dobroj vezi ostaje lokalno i u redu', async () => {
  const h = noviProjekt(); await h.run();
  assert.deepEqual(h.calls, []);
  assert.equal(h.red.length, 1); assert.equal(h.projekti.length, 1);
  assert.equal(h.red[0].payload.id, h.projekti[0].id);
  assert.equal(h.red[0].payload._tempId, h.projekti[0].id);
  assert.ok(h.sakriven);
});
test('puna kvota ne prikazuje projekat kao sačuvan', async () => {
  const h = noviProjekt(true); await h.run();
  assert.deepEqual(h.calls, []); assert.equal(h.projekti.length, 0);
  assert.equal(h.sakriven, false);
  assert.ok(h.poruke.some(p => p.includes('nije sačuvan')));
});
test('slanje doznake sa istim UUID čuva keš stabala', async () => {
  const h = dozSlanje('local-id'); await h.run(true);
  assert.deepEqual(JSON.parse(h.store.get('trees'))['local-id'], h.tree);
  assert.deepEqual(JSON.parse(h.store.get('q')), []);
});
test('legacy promjena ID doznake prenosi keš na novi ID', async () => {
  const h = dozSlanje('server-id'); await h.run(true);
  assert.deepEqual(JSON.parse(h.store.get('trees')), { 'server-id': h.tree });
});
test('serversko osvježavanje čuva neposlani projekat, vlasnika i aktivni odabir', async () => {
  const pending = { type: 'insert_projekt', _uid: 'u1', payload: { id: 'p1', _tempId: 'p1', korisnik_id: 'u1', odjel: '105' } };
  const cache = new Map();
  const env = {
    sbUser: { id: 'u1' }, sbProfile: {},
    _OL: { PROJEKTI: 'p', save: (k, v) => cache.set(k, structuredClone(v)), load: k => cache.get(k),
      loadQueue: () => [pending,
        { ...pending, _uid: 'u2', payload: { ...pending.payload, id: 'p2', _tempId: 'p2', korisnik_id: 'u2' } },
        { ...pending, payload: { ...pending.payload, id: 'deleted', _tempId: 'deleted' } }] },
    _deletedProjektIds: new Set(['deleted']),
    isSpdField: () => false, isVodeci: () => false, isAdmin: () => false,
    sb: { from: () => { const q = { select: () => q, eq: () => q, order: () => q,
      then: (r, j) => Promise.resolve({ data: [], error: null }).then(r, j) }; return q; } },
    localStorage: { removeItem() { throw Error('aktivni projekat je izgubljen'); } },
    _applyProjektFields() {}, rndProjektiList() {}, rndLog() {}, updProjStats() {},
    sbSaveOdjel() {}, _updVlakeMapVisibility() {}, _kvcPurgeStale() {},
  };
  const api = new Function(...Object.keys(env),
    "let _projekti=[], _aktivniProjektId='p1', _projLoadGen=0;" + fn('_projektiVratiNeposlane') + fn('sbLoadProjekti') +
    ';return {run:sbLoadProjekti, rows:()=>_projekti, active:()=>_aktivniProjektId};')(...Object.values(env));
  await api.run(); await api.run();
  assert.equal(api.active(), 'p1');
  assert.equal(api.rows().length, 1);
  assert.equal(api.rows()[0]._pendingSync, true);
  assert.equal(cache.get('p')[0].id, 'p1');
});
(async () => {
  let fail = 0;
  for (const [name, run] of tests) {
    try { await run(); console.log('OK', name); } catch (e) { fail++; console.error('FAIL', name, e.message); }
  }
  console.log(`${tests.length - fail} prošlo, ${fail} palo`);
  process.exitCode = fail ? 1 : 0;
})();
