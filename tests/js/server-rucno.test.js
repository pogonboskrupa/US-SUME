// =====================================================================
// Server — slanje SAMO na zahtjev korisnika (v1.9.4).
// Pokretanje:  node tests/js/server-rucno.test.js
// ---------------------------------------------------------------------
// Na zahtjev: podaci se na server šalju isključivo dugmetom "Pošalji na
// server" (Meni → Server), ne sami od sebe (otkucaj na 60 s, povratak u prvi
// plan, vraćena veza, svaka GPS tačka doznake). Sve se i dalje čuva lokalno i
// u redu — testovi čuvaju da automatski put NE dira server, da ručni šalje
// sve, i da ništa što čeka ne bude izgubljeno ni vaskrsnuto poslije brisanja.
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
  const m = HTML.match(new RegExp('const ' + name + ' = [^;]+;'));
  if (!m) throw new Error('nije nađena konstanta ' + name);
  return m[0];
}

const _store = new Map();
global.localStorage = {
  getItem: k => (_store.has(k) ? _store.get(k) : null),
  setItem: (k, v) => _store.set(k, String(v)),
  removeItem: k => _store.delete(k),
};
global.showToast = () => {};
global.sbUser = { id: 'u1' };
const { _OL } = require('../../static/js/offline-layer.js');

let pass = 0, fail = 0;
const testovi = [];
function t(name, fn) { testovi.push([name, fn]); }
function sekcija(n) { testovi.push([null, n]); }

// Kapija iz index.html, sa podesivim prozorom (stvarni kod, stvarni _OL).
function kapija() {
  const src = [
    'let _serverSlanjeDo = 0, _serverSaljem = false;',
    extractConst('_SERVER_PROZOR_MS'), extractConst('_SERVER_ZADNJE_KEY'),
    extractFn('_serverSlanjeDozvoljeno'), extractFn('_serverURed'), extractFn('_redUkloni'),
    'return { _serverSlanjeDozvoljeno, _serverURed, _redUkloni, otvori: () => { _serverSlanjeDo = Date.now() + 60000; }, zatvori: () => { _serverSlanjeDo = 0; } };',
  ].join('\n');
  return new Function('_OL', 'localStorage', '_updSyncBadge', src)(_OL, global.localStorage, () => {});
}

// Lažni supabase: bilježi SVAKI poziv (from/rpc) — test automatskog puta traži nulu.
function lazniSb(odgovor) {
  const log = [];
  const sb = {
    from(tab) {
      const q = { tab, op: null };
      const l = {
        insert() { q.op = 'insert'; return l; }, update() { q.op = 'update'; return l; },
        upsert() { q.op = 'upsert'; return l; }, delete() { q.op = 'delete'; return l; },
        select() { if (!q.op) q.op = 'select'; return l; }, eq() { return l; }, in() { return l; },
        single() { return l; }, maybeSingle() { return l; }, limit() { return l; },
        then(res, rej) { log.push(q); return Promise.resolve(odgovor ? odgovor(q) : { data: { id: 'srv' }, error: null }).then(res, rej); },
      };
      return l;
    },
    auth: { refreshSession: async () => ({ data: {} }) },
  };
  return { sb, log };
}

// ── Red za sync ────────────────────────────────────────────────────────
sekcija('Red za sync (_processOfflineQueue):');

function makeRed(rucno) {
  let red = [{ type: 'delete_vlaka', payload: { id: 'a' }, _qid: '1' }];
  const p = { brisanja: 0, badge: 0, fotos: 0 };
  const g = {
    Date, sbUser: { id: 'u1' }, sbProfile: { sumarija: 'S' },
    _OL: { QUEUE: 'q', loadQueue: () => red.map(o => ({ ...o })), removeFromQueue: (id) => { red = red.filter(o => o._qid !== id); },
      bumpRetry: () => false, odgodi: () => {} },
    sb: { from: () => ({ delete: () => ({ eq: async () => { p.brisanja++; return { error: null }; } }) }) },
    localStorage: { getItem: () => '[]', setItem: () => {} },
    _DOZ_TRACK_BUF_KEY: 'buf', _genUUID: () => 'x', _flushPendingFotos: async () => { p.fotos++; },
    _mrezaProbaj: () => true, showToast: () => {}, _updSyncBadge: () => {}, console: { warn() {} },
    setTimeout: () => 0,
    _serverSlanjeDozvoljeno: () => rucno, _serverSaljem: rucno, _updSyncBadgeUskoro: () => { p.badge++; },
  };
  const src = [extractConst('_SYNC_PAUZA_MS'),
    'let _syncMrezaPalaU = 0, _syncOdgodaT = null; let _syncInProgress = false, _syncRerun = false;',
    extractFn('_isNetworkErr'), extractFn('_isAuthErr'), extractFn('_serverPrivremeno'), extractFn('_processOfflineQueue'),
    'return _processOfflineQueue;'].join('\n');
  const k = Object.keys(g);
  return { run: new Function(...k, src)(...k.map(x => g[x])), p, get red() { return red; } };
}

t('KLJUČNO: automatski poziv (otkucaj, GPS tačka) NE šalje na server', async () => {
  const r = makeRed(false);
  await r.run();
  assert.strictEqual(r.p.brisanja, 0, 'otišlo na server bez zahtjeva korisnika');
  assert.strictEqual(r.red.length, 1, 'stavka mora ostati u redu');
  assert.strictEqual(r.p.badge, 1, 'brojač na traci se ipak osvježava');
});

t('ni "vraćena veza" (sila=true, online event) više ne šalje sama', async () => {
  const r = makeRed(false);
  await r.run(true);
  assert.strictEqual(r.p.brisanja, 0);
  assert.strictEqual(r.p.fotos, 0);
});

t('za vrijeme ručnog slanja red ide na server', async () => {
  const r = makeRed(true);
  await r.run(true);
  assert.strictEqual(r.p.brisanja, 1);
  assert.strictEqual(r.red.length, 0);
});

t('ručno slanje šalje i fotografije na slabom signalu (korisnik je tražio)', async () => {
  const r = makeRed(true);
  // _mrezaProbaj(true) na slaboj vezi bi bilo false — ručno slanje ga preskače
  await r.run(true);
  assert.strictEqual(r.p.fotos, 1);
});

sekcija('\nAutomatski okidači u izvornom kodu:');

t('periodični otkucaj (60 s) ne šalje ni red ni tragove', () => {
  const i = HTML.indexOf('// Periodični sync — fallback');
  const dio = HTML.slice(i, HTML.indexOf('}, 60000);', i));
  assert.ok(dio.length > 200, 'nije nađen otkucaj');
  assert.ok(!/_processOfflineQueue\(/.test(dio), 'otkucaj i dalje zove red');
  assert.ok(!/sbFlushTrag\(/.test(dio), 'otkucaj i dalje šalje tragove');
});

t('pokretanje ne šalje neposlane tragove', () => {
  const src = extractFn('_startupRestore');
  assert.ok(!/sbFlushTrag\(/.test(src));
});

t('red ima kapiju PRIJE svega što ide na mrežu', () => {
  const src = extractFn('_processOfflineQueue');
  const kap = src.indexOf('_serverSlanjeDozvoljeno()');
  assert.ok(kap > 0, 'nema kapije');
  assert.ok(kap < src.indexOf('await '), 'kapija mora biti prije prvog mrežnog poziva');
});

// ── Direktni upisi idu u red ──────────────────────────────────────────
sekcija('\nDirektni upisi van ručnog slanja idu u red:');

function tragFlush(k, sb) {
  return new Function('sb', 'sbUser', 'sbProfile', '_genUUID', '_tragRegSave', '_tragRegSaveUskoro', '_tragCalcLen',
    '_isAuthErr', '_isNetworkErr', '_tryRefreshSession', 'showToast', '_OL', '_serverURed',
    extractFn('_sbFlushTragImpl') + '\nreturn _sbFlushTragImpl;')(
    sb, { id: 'u1' }, { sumarija: 'S' }, () => 'g', () => {}, () => {}, () => 100, () => false, () => false,
    async () => false, () => {}, _OL, k._serverURed);
}

t('trag: van ručnog slanja ide u red, server se ne dira', async () => {
  _store.clear();
  const k = kapija(); const { sb, log } = lazniSb();
  await tragFlush(k, sb)({ name: 'T', uuid: 'c1', pts: [[44, 16, 300], [44.1, 16.1, 300]] });
  assert.strictEqual(log.length, 0, 'poziv na server: ' + JSON.stringify(log));
  const q = _OL.loadQueue();
  assert.strictEqual(q.length, 1);
  assert.strictEqual(q[0].type, 'upsert_trag');
  assert.strictEqual(q[0].payload.client_uuid, 'c1');
});

t('trag: nova verzija istog traga u redu zamjenjuje staru (nema gomilanja)', async () => {
  _store.clear();
  const k = kapija(); const { sb } = lazniSb();
  const tr = { name: 'T', uuid: 'c1', pts: [[44, 16, 300], [44.1, 16.1, 300]] };
  await tragFlush(k, sb)(tr);
  tr.pts.push([44.2, 16.2, 300]);
  await tragFlush(k, sb)(tr);
  const q = _OL.loadQueue();
  assert.strictEqual(q.length, 1);
  assert.strictEqual(q[0].payload.pts.length, 3);
});

t('trag: za vrijeme ručnog slanja ide direktno', async () => {
  _store.clear();
  const k = kapija(); k.otvori(); const { sb, log } = lazniSb();
  const tr = { name: 'T', uuid: 'c1', pts: [[44, 16, 300], [44.1, 16.1, 300]] };
  await tragFlush(k, sb)(tr);
  assert.ok(log.some(q => q.tab === 'tragovi' && q.op === 'insert'));
  assert.strictEqual(tr.sbId, 'srv');
  assert.strictEqual(_OL.loadQueue().length, 0);
});

function writer(name, extra = {}) {
  const k = kapija(); const { sb, log } = lazniSb();
  const g = { sb, sbUser: { id: 'u1' }, sbProfile: { sumarija: 'S' }, _OL, _serverURed: k._serverURed,
    _serverSlanjeDozvoljeno: k._serverSlanjeDozvoljeno, textLabels: [], ...extra };
  const src = (extra._src || '') + extractFn(name) + '\nreturn ' + name + ';';
  delete g._src;
  const keys = Object.keys(g);
  return { f: new Function(...keys, src)(...keys.map(x => g[x])), log, k };
}

t('dnevni log: u red, bez servera', async () => {
  _store.clear();
  const w = writer('sbSaveLogEntry');
  await w.f('2026-09-30', 'Ime', 120, [], 'O1', null);
  assert.strictEqual(w.log.length, 0);
  assert.strictEqual(_OL.loadQueue()[0].type, 'upsert_log');
});

t('odjel: u red, a već poznat odjel ni ne čeka', async () => {
  _store.clear();
  const w = writer('sbSaveOdjel');
  _OL.save(_OL.ODJELI, [{ naziv: 'Poznat' }]);
  await w.f('Poznat');
  assert.strictEqual(_OL.loadQueue().length, 0);
  await w.f('Novi'); await w.f('Novi');
  assert.strictEqual(w.log.length, 0);
  assert.strictEqual(_OL.loadQueue().length, 1, 'isti odjel dvaput u redu');
});

t('tekstualne oznake: u red, bez servera', async () => {
  _store.clear();
  const w = writer('sbSaveTextLabels', { textLabels: [{ id: 'l1', lat: 44, lng: 16, text: 'A', size: 12, color: '#fff' }],
    _syncTextLabelsServer: async () => { throw new Error('ne smije'); } });
  await w.f();
  const q = _OL.loadQueue();
  assert.strictEqual(q.length, 1);
  assert.strictEqual(q[0].korisnik_id, 'u1');
});

t('brisanje ZADNJE oznake: prazan set zamjenjuje stariji pun set u redu', () => {
  _store.clear();
  _OL.enqueue({ type: 'upsert_labels', payload: [{ korisnik_id: 'u1', label_id: 'l1' }], korisnik_id: 'u1' });
  _OL.enqueue({ type: 'upsert_labels', payload: [], korisnik_id: 'u1' });
  const q = _OL.loadQueue();
  assert.strictEqual(q.length, 1, 'pun set bi poslije brisanja vratio oznake na server');
  assert.deepStrictEqual(q[0].payload, []);
});

t('red briše oznake za prazan set (korisnik iz op-a, ne iz praznog niza)', () => {
  const i = HTML.indexOf("op.type === 'upsert_labels'");
  const dio = HTML.slice(i, i + 1200);
  assert.ok(/op\.korisnik_id \|\| op\._uid/.test(dio));
});

t('fotografija: bez ručnog slanja se ne šalje (puna slika čeka u IDB-u)', async () => {
  const { sb, log } = lazniSb();
  let badge = 0;
  const f = new Function('sb', 'sbUser', 'sbProfile', '_locFotos', '_saveFotos', '_kmlcDelete', '_isNetworkErr',
    '_serverSlanjeDozvoljeno', '_updSyncBadge', [extractFn('_fotoNaServeru'), extractFn('sbUploadFoto'), 'return sbUploadFoto;'].join('\n'))(
    sb, { id: 'u1' }, { sumarija: 'S' }, [], () => {}, async () => {}, () => false, () => false, () => { badge++; });
  const r = await f({ la: 44, lo: 16, ts: 1, full: 'x', sbId: null }, 0);
  assert.strictEqual(r, false);
  assert.strictEqual(log.length, 0);
  assert.strictEqual(badge, 1);
});

t('doznaka: zona, brisanje zone i status idu u red van ručnog slanja', () => {
  assert.ok(/!_serverSlanjeDozvoljeno\(\) \|\| !_mrezaProbaj\(\)/.test(extractFn('dozConfirmSave')));
  assert.ok(/!_serverSlanjeDozvoljeno\(\) \|\| !_mrezaProbaj\(\)/.test(extractFn('dozDeleteMarking')));
  const st = extractFn('dozSetStatus');
  assert.ok(st.indexOf('_serverURed(') > 0 && st.indexOf('_serverURed(') < st.indexOf(".update({ status })"));
});

t('preimenovanje vlake ne piše direktno van ručnog slanja', () => {
  const src = extractFn('renameVlaka');
  assert.ok(/v\.sbId && sbUser && _serverSlanjeDozvoljeno\(\)/.test(src));
});

// ── Brisanje neposlanog ne smije vaskrsnuti na serveru ─────────────────
sekcija('\nBrisanje onoga što još čeka slanje:');

t('KLJUČNO: obrisana vlaka koja nikad nije poslana NE ode na server', async () => {
  _store.clear();
  const k = kapija();
  _OL.enqueue({ type: 'upsert_vlaka', payload: { nm: 'T1', korisnik_id: 'u1', projekt_id: 'P', pts: [1] } });
  _OL.enqueue({ type: 'upsert_vlaka', payload: { nm: 'T2', korisnik_id: 'u1', projekt_id: 'P', pts: [1] } });
  const f = new Function('sb', 'sbUser', '_OL', '_serverURed', '_redUkloni', extractFn('sbDeleteVlaka') + '\nreturn sbDeleteVlaka;')(
    lazniSb().sb, { id: 'u1' }, _OL, k._serverURed, k._redUkloni);
  await f({ nm: 'T1', projektId: 'P', sbId: null });
  const q = _OL.loadQueue();
  assert.deepStrictEqual(q.map(o => o.payload.nm), ['T2'], 'T1 bi nastala na serveru poslije brisanja');
});

t('obrisana vlaka koja JESTE na serveru: brisanje u red, njena neposlana izmjena van reda', async () => {
  _store.clear();
  const k = kapija(); const { sb, log } = lazniSb();
  _OL.enqueue({ type: 'upsert_vlaka', payload: { id: 's9', nm: 'T1', korisnik_id: 'u1', projekt_id: 'P', pts: [1] } });
  const f = new Function('sb', 'sbUser', '_OL', '_serverURed', '_redUkloni', extractFn('sbDeleteVlaka') + '\nreturn sbDeleteVlaka;')(
    sb, { id: 'u1' }, _OL, k._serverURed, k._redUkloni);
  await f({ nm: 'T1', projektId: 'P', sbId: 's9' });
  assert.strictEqual(log.length, 0);
  assert.deepStrictEqual(_OL.loadQueue().map(o => o.type + ':' + o.payload.id), ['delete_vlaka:s9']);
});

t('obrisan trag koji nikad nije poslan NE ode na server', async () => {
  _store.clear();
  const k = kapija();
  _OL.enqueue({ type: 'upsert_trag', payload: { nm: 'd', korisnik_id: 'u1', client_uuid: 'c1', pts: [1] } });
  _OL.enqueue({ type: 'upsert_trag', payload: { nm: 'd', korisnik_id: 'u1', client_uuid: 'c2', pts: [1] } });
  const f = new Function('sb', 'sbUser', '_OL', '_serverURed', '_redUkloni', extractFn('sbDeleteTrag') + '\nreturn sbDeleteTrag;')(
    lazniSb().sb, { id: 'u1' }, _OL, k._serverURed, k._redUkloni);
  await f({ uuid: 'c1', sbId: null });
  assert.deepStrictEqual(_OL.loadQueue().map(o => o.payload.client_uuid), ['c2']);
});

// ── Šta čeka + ručno slanje ───────────────────────────────────────────
sekcija('\nŠta čeka i dugme "Pošalji na server":');

function naCekanju(extra) {
  const g = { _OL, localStorage: global.localStorage, _DOZ_TRACK_BUF_KEY: 'buf', sbUser: { id: 'u1' },
    _tragZaSlanje: () => [], _locFotos: [], ...extra };
  const keys = Object.keys(g);
  return new Function(...keys, extractFn('_serverNaCekanju') + '\nreturn _serverNaCekanju;')(...keys.map(x => g[x]));
}

t('_serverNaCekanju broji red, tragove van reda, pojas doznake kao jednu stavku i fotografije', () => {
  _store.clear();
  _OL.enqueue({ type: 'upsert_log', payload: { datum: 'd', korisnik_id: 'u1' } });
  localStorage.setItem('buf', JSON.stringify([{ user_id: 'u1' }, { user_id: 'u1' }, { user_id: 'drugi' }]));
  const n = naCekanju({ _tragZaSlanje: () => [{}, {}], _locFotos: [{ sbId: null }, { sbId: 'x' }, { sbId: null, _nemaFull: true }] })();
  assert.strictEqual(n.red, 1); assert.strictEqual(n.tragovi, 2); assert.strictEqual(n.doz, 2); assert.strictEqual(n.foto, 1);
  assert.strictEqual(n.stavki, 5);
});

t('_serverNaCekanju ne pada kad registar tragova još ne postoji (rano pokretanje)', () => {
  _store.clear();
  const n = naCekanju({ _tragZaSlanje: () => { throw new ReferenceError('TDZ'); } })();
  assert.strictEqual(n.stavki, 0);
});

function posaljiEnv(opts = {}) {
  _store.clear();
  const p = { red: [], trag: 0, toast: [], render: 0 };
  let cekaju = opts.cekaju ?? 3;
  const src = ['let _serverSlanjeDo = 0, _serverSaljem = false; let _syncInProgress = false;',
    extractConst('_SERVER_PROZOR_MS'), extractConst('_SERVER_ZADNJE_KEY'),
    extractFn('_serverSlanjeDozvoljeno'), extractFn('serverPosalji'),
    'return { serverPosalji, dozvoljeno: _serverSlanjeDozvoljeno, saljem: () => _serverSaljem };'].join('\n');
  const g = {
    sbUser: opts.bezPrijave ? null : { id: 'u1' }, sbProfile: { sumarija: 'S' }, _OL, localStorage: global.localStorage,
    navigator: { onLine: opts.offline ? false : true },
    showToast: m => p.toast.push(m), _mrezaSila: () => {}, _updSyncBadge: () => {}, _serverSazetakRender: () => { p.render++; },
    document: { getElementById: () => null }, openSyncQueuePanel: () => {},
    _serverNaCekanju: () => ({ stavki: cekaju }),
    _tragZaSlanje: () => [{ name: 'A' }],
    sbFlushTrag: async () => { p.trag++; p.tragDozvoljeno = api.dozvoljeno(); },
    _processOfflineQueue: async (sila) => { p.red.push({ sila, dozvoljeno: api.dozvoljeno() }); cekaju = opts.poslije ?? 0; },
    setTimeout,
  };
  const keys = Object.keys(g);
  const api = new Function(...keys, src)(...keys.map(x => g[x]));
  return { api, p };
}

t('KLJUČNO: dugme otvara slanje, šalje tragove i red, pa slanje ZATVARA', async () => {
  const { api, p } = posaljiEnv();
  assert.strictEqual(api.dozvoljeno(), false);
  await api.serverPosalji();
  assert.strictEqual(p.trag, 1); assert.strictEqual(p.tragDozvoljeno, true);
  assert.ok(p.red.length >= 1);
  assert.ok(p.red.every(r => r.sila === true && r.dozvoljeno === true));
  assert.strictEqual(api.dozvoljeno(), false, 'poslije slanja automatski put mora opet biti zatvoren');
  assert.strictEqual(api.saljem(), false);
  assert.ok(Number(localStorage.getItem('tvlake_server_zadnje_slanje')) > 0, 'vrijeme zadnjeg slanja');
  assert.ok(p.toast.some(m => /Sve poslano/.test(m)));
});

t('stavke koje su bile odbijene/u razmaku idu odmah na ručno slanje', async () => {
  const { api } = posaljiEnv();
  _OL.enqueue({ type: 'upsert_log', payload: { datum: 'd', korisnik_id: 'u1' } });
  const q = _OL.loadQueue(); q[0]._blocked = true; q[0]._retries = 5; q[0]._retryAt = Date.now() + 1e6;
  localStorage.setItem(_OL.QUEUE, JSON.stringify(q));
  await api.serverPosalji();
  const o = _OL.loadQueue()[0];
  assert.strictEqual(o._blocked, false); assert.strictEqual(o._retries, 0); assert.strictEqual(o._retryAt, undefined);
});

t('neuspjelo slanje: kaže to, podaci ostaju, vrijeme zadnjeg slanja se NE upisuje', async () => {
  const { api, p } = posaljiEnv({ cekaju: 3, poslije: 3 });
  await api.serverPosalji();
  assert.ok(p.toast.some(m => /nije uspjelo/.test(m)));
  assert.strictEqual(localStorage.getItem('tvlake_server_zadnje_slanje'), null);
  assert.strictEqual(api.dozvoljeno(), false);
});

t('bez veze (OS offline) se ni ne pokušava', async () => {
  const { api, p } = posaljiEnv({ offline: true });
  await api.serverPosalji();
  assert.strictEqual(p.red.length, 0); assert.strictEqual(p.trag, 0);
  assert.ok(p.toast.some(m => /Nema veze/.test(m)));
});

t('ništa ne čeka → nema mrežnih poziva', async () => {
  const { api, p } = posaljiEnv({ cekaju: 0 });
  await api.serverPosalji();
  assert.strictEqual(p.red.length, 0);
});

t('dupli tap ne pokreće dva slanja', async () => {
  const { api, p } = posaljiEnv();
  await Promise.all([api.serverPosalji(), api.serverPosalji()]);
  assert.strictEqual(p.trag, 1);
});

sekcija('\nMeni i panel:');

t('Meni ima sekciju "Server" koja otvara panel', () => {
  const i = HTML.indexOf('<div class="mdrop-hdr">Server</div>');
  assert.ok(i > 0, 'nema zaglavlja Server u meniju');
  assert.ok(/id="mdrop-server"[^>]*onclick="closeMenuDropdown\(\);openSyncQueuePanel\(\)"/.test(HTML.slice(i, i + 600)));
});

t('panel ima dugme "Pošalji na server" i sažetak', () => {
  assert.ok(/id="syncq-posalji" onclick="serverPosalji\(\)"/.test(HTML));
  assert.ok(HTML.includes('id="syncq-sum"'));
});

(async () => {
  for (const [name, fn] of testovi) {
    if (name === null) { console.log(fn); continue; }
    try { await fn(); console.log('  ✔ ' + name); pass++; }
    catch (e) { fail++; console.log('  ✘ ' + name + '\n      ' + (e && e.message)); }
  }
  console.log('\n' + pass + ' prošlo, ' + fail + ' palo');
  process.exit(fail ? 1 : 0);
})();
