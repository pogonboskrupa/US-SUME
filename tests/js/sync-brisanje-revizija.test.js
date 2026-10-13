// Ručno slanje na slaboj vezi (v3.0.1): izgubljen odgovor ne smije ostaviti
// vječni konflikt revizije niti "vaskrsnuti" lokalno obrisan zapis, a stavka
// koja nikad ne može proći ne smije zauvijek stajati u "čeka slanje".
'use strict';
const fs = require('node:fs'), assert = require('node:assert/strict');
const html = fs.readFileSync('index.html', 'utf8');
const _store = new Map();
global.localStorage = { getItem: k => (_store.has(k) ? _store.get(k) : null), setItem: (k, v) => _store.set(k, String(v)),
  removeItem: k => _store.delete(k) };
global.showToast = () => {};
const { _OL } = require('../../static/js/offline-layer.js');
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
const pend = [];
const t = (n, f) => { _store.clear(); const bad = e => { fail++; console.log('FAIL', n, e.message); };
  try { const r = f(); if (r && r.then) pend.push(r.then(() => { ok++; console.log('OK', n); }, bad)); else { ok++; console.log('OK', n); } } catch (e) { bad(e); } };
const vl = (rev, pts) => ({ type: 'upsert_vlaka', knownRev: rev, payload: { id: 'v1', nm: 'T1', korisnik_id: 'u', projekt_id: 'P', pts } });

t('zamjena u redu pamti raniju verziju i to da je već bila poslana', () => {
  _OL.enqueue(vl(5, [1]));
  _OL.oznaciPokusano(_OL.loadQueue()[0]._qid);
  _OL.enqueue(vl(5, [1, 2]));
  const q = _OL.loadQueue();
  assert.equal(q.length, 1);
  assert.deepEqual(q[0]._prevPayloads.map(p => p.pts), [[1]]);
  assert.equal(q[0]._pokusano, true);
});
t('izgubljen odgovor + nova izmjena: red na serveru = naša ranija verzija → upis preko nje, ne konflikt', async () => {
  const pozivi = [];
  const srv = { id: 'v1', nm: 'T1', korisnik_id: 'u', projekt_id: 'P', pts: [1], rev: 6 };
  const upit = (tab) => {
    const st = { tab, eq: {} };
    const o = {
      update(p) { st.update = p; return o; }, select() { return o; }, insert() { return o; },
      eq(k, v) { st.eq[k] = v; return o; }, is() { return o; },
      maybeSingle: async () => ({ data: srv, error: null }),
      then(res) {
        pozivi.push(st);
        const pogodi = st.update && (st.eq.rev === undefined || st.eq.rev === srv.rev);
        res(pogodi ? { data: [{ id: 'v1', rev: 7, updated_at: 'x' }], error: null } : { data: [], error: null });
      },
    };
    return o;
  };
  const env = { sb: { from: upit }, sbUser: { id: 'u' }, vlake: [], _OL, _updateVlakaSyncIcon() {}, _saveLocalVlake() {} };
  const f = new Function(...Object.keys(env), fn('_jsonKanon') + fn('_vlakaIstiSadrzaj') + fn('_syncVlakaOperation') + '\nreturn _syncVlakaOperation;')(...Object.values(env));
  const op = { ...vl(5, [1, 2]), _prevPayloads: [vl(5, [1]).payload], _qid: 'q' };
  const err = await f(op);
  assert.equal(err, null, JSON.stringify(err));
  assert.equal(pozivi.filter(p => p.update).pop().eq.rev, 6, 'drugi upis ide sa stvarnom revizijom servera');
});
t('bez ranije verzije na serveru (tuđa izmjena) ostaje konflikt', () => {
  const src = fn('_syncVlakaOperation');
  assert.match(src, /op\._prevPayloads \|\| \[\]\)\.some\(pp => _vlakaIstiSadrzaj/);
  assert.match(src, /code:'LOCAL_CONFLICT'/);
});

function brisanjeEnv(v) {
  const env = { sbUser: { id: 'u' }, _OL, _updSyncBadge() {}, _redUkloni: null };
  const redUkloni = new Function('_OL', '_updSyncBadge', fn('_redUkloni') + '\nreturn _redUkloni;')(_OL, () => {});
  env._redUkloni = redUkloni;
  return new Function(...Object.keys(env), fn('sbDeleteVlaka') + '\nreturn sbDeleteVlaka;')(...Object.values(env));
}
t('vlaka bez ID-ja čiji upis nije ni krenuo: brisanje samo otkaže red', () => {
  _OL.enqueue({ type: 'upsert_vlaka', payload: { nm: 'T1', korisnik_id: 'u', projekt_id: 'P' } });
  brisanjeEnv()({ nm: 'T1', projektId: 'P' });  // bez await-a u ovoj grani — efekat je sinhron
  assert.equal(_OL.loadQueue().length, 0);
});
t('vlaka bez ID-ja čiji je upis već krenuo: brisanje ide na server po ključu', () => {
  _OL.enqueue({ type: 'upsert_vlaka', payload: { nm: 'T1', korisnik_id: 'u', projekt_id: 'P' } });
  _OL.oznaciPokusano(_OL.loadQueue()[0]._qid);
  brisanjeEnv()({ nm: 'T1', projektId: 'P' });  // bez await-a u ovoj grani — efekat je sinhron
  const q = _OL.loadQueue();
  assert.equal(q.length, 1);
  assert.equal(q[0].type, 'delete_vlaka');
  assert.deepEqual([q[0].payload.id, q[0].payload.nm, q[0].payload.projekt_id], [null, 'T1', 'P']);
});
t('procesor: insert se obilježi kao pokušan PRIJE mrežnog poziva; brisanje bez ID-ja se razriješi po ključu', () => {
  const src = fn('_processOfflineQueue');
  const i = src.indexOf('_OL.oznaciPokusano'), j = src.indexOf("op.type === 'upsert_vlaka') {");
  assert.ok(i > 0 && i < j);
  assert.match(src, /op\.type === 'delete_vlaka' && !op\.payload\?\.id/);
  assert.match(src, /else if \(op\.type === 'delete_projekt'\)/);
});
t('zona i projekat: otkazan pokušan upis šalje brisanje po klijentskom UUID-u', () => {
  assert.match(fn('dozDeleteMarking'), /queued\._pokusano && queued\.payload\?\.id[\s\S]*type: 'delete_doz_marking'/);
  assert.match(fn('deleteProjektUI'), /ins\?\._pokusano && ins\.payload\?\.id[\s\S]*type: 'delete_projekt'/);
  assert.match(fn('_projektiVratiNeposlane'), /op\.type === 'delete_projekt'/);
});
t('nemoguće stavke: brisanje nepostojeće zone i status obrisanog odjela su gotovi, ne vječni', () => {
  const src = fn('_processOfflineQueue');
  assert.match(src, /check\.data\?\.is_visible === false \? null\s*: check\.data === null \? await potvrdiPrijavu\(\)/);
  assert.match(src, /check\.data === null && !_OL\.loadQueue\(true\)\.some\(o => o\.type === 'insert_doz_project'/);
  assert.match(src, /_dozSirocadDodaj\(pid\)/);
});
t('GPS tačke obrisanog odjela se ne broje u "čeka slanje"', () => {
  const env = { sbUser: { id: 'u' }, FieldStore: { ready: true, count: () => 10, view: (u, p) => p === 'X' ? [1, 2, 3] : [] },
    _SERVER_SAMO_LOKALNO: new Set(), _lsJsonMemo: () => [], _DOZ_TRACK_BUF_KEY: 'b', localStorage };
  localStorage.setItem('tvlake_doz_sirocad_u', JSON.stringify(['X']));
  const f = new Function(...Object.keys(env), fn('_dozSirocadKljuc') + fn('_dozSirocad') + fn('_serverNaCekanju') + '\nreturn _serverNaCekanju;')(...Object.values(env));
  const r = f([]);
  assert.equal(r.doz, 7); assert.equal(r.siroce, 3);
});
Promise.all(pend).then(() => { console.log(`sync-brisanje-revizija: ${ok} ok, ${fail} palo`); process.exit(fail ? 1 : 0); });
