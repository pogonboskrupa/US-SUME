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
    'let _serverSaljem = false;',
    extractConst('_SERVER_ZADNJE_KEY'),
    extractFn('_serverSlanjeDozvoljeno'), extractFn('_serverURed'), extractFn('_redUkloni'),
    'return { _serverSlanjeDozvoljeno, _serverURed, _redUkloni, otvori: () => { _serverSaljem = true; }, zatvori: () => { _serverSaljem = false; } };',
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
    sb: { from: () => ({ delete: () => ({ eq: (_,id) => ({select: async () => { p.brisanja++; return { data:[{id}], error: null }; }}) }) }) },
    localStorage: { getItem: () => '[]', setItem: () => {} },
    _DOZ_TRACK_BUF_KEY: 'buf', _genUUID: () => 'x', _flushPendingFotos: async () => { p.fotos++; },
    _mrezaProbaj: () => true, showToast: () => {}, _updSyncBadge: () => {}, console: { warn() {} },
    setTimeout: () => 0,
    _SERVER_SAMO_LOKALNO: new Set(['upsert_trag', 'delete_trag', 'upsert_log', 'upsert_labels']),
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

function writer(name, extra = {}) {
  const k = kapija(); const { sb, log } = lazniSb();
  const g = { sb, sbUser: { id: 'u1' }, sbProfile: { sumarija: 'S' }, _OL, _serverURed: k._serverURed,
    _serverSlanjeDozvoljeno: k._serverSlanjeDozvoljeno, textLabels: [], ...extra };
  const src = (extra._src || '') + extractFn(name) + '\nreturn ' + name + ';';
  delete g._src;
  const keys = Object.keys(g);
  return { f: new Function(...keys, src)(...keys.map(x => g[x])), log, k };
}

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

t('brisanje ZADNJE oznake: prazan set zamjenjuje stariji pun set u redu', () => {
  _store.clear();
  _OL.enqueue({ type: 'upsert_labels', payload: [{ korisnik_id: 'u1', label_id: 'l1' }], korisnik_id: 'u1' });
  _OL.enqueue({ type: 'upsert_labels', payload: [], korisnik_id: 'u1' });
  const q = _OL.loadQueue();
  assert.strictEqual(q.length, 1, 'pun set bi poslije brisanja vratio oznake na server');
  assert.deepStrictEqual(q[0].payload, []);
});

t('doznaka: zona, brisanje zone i status idu u red van ručnog slanja', () => {
  assert.ok(/!_serverSlanjeDozvoljeno\(\) \|\| !_mrezaProbaj\(\)/.test(extractFn('dozConfirmSave')));
  assert.ok(/!_serverSlanjeDozvoljeno\(\) \|\| !_mrezaProbaj\(\)/.test(extractFn('dozDeleteMarking')));
  const st = extractFn('dozSetStatus');
  assert.ok(st.includes('localStorage.setItem(_OL.QUEUE') && !st.includes('sb.from('), 'status ide u atomski lokalni red; server piše procesor ručnog slanja');
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

// ── Šta čeka + ručno slanje ───────────────────────────────────────────
sekcija('\nŠta čeka i dugme "Pošalji na server":');

function naCekanju(extra) {
  const g = { _SERVER_SAMO_LOKALNO: new Set(['upsert_trag', 'delete_trag', 'upsert_log', 'upsert_labels']), _OL, localStorage: global.localStorage, _DOZ_TRACK_BUF_KEY: 'buf', sbUser: { id: 'u1' },
    _tragZaSlanje: () => [], _locFotos: [], ...extra };
  const keys = Object.keys(g);
  return new Function(...keys, 'const _lsMemo = {};\n' + extractFn('_lsJsonMemo') + '\n' + extractFn('_serverNaCekanju') + '\nreturn _serverNaCekanju;')(...keys.map(x => g[x]));
}

t('_serverNaCekanju ne pada kad registar tragova još ne postoji (rano pokretanje)', () => {
  _store.clear();
  const n = naCekanju({ _tragZaSlanje: () => { throw new ReferenceError('TDZ'); } })();
  assert.strictEqual(n.stavki, 0);
});

function posaljiEnv(opts = {}) {
  _store.clear();
  const p = { red: [], trag: 0, toast: [], render: 0 };
  let cekaju = opts.cekaju ?? 3;
  const src = ['let _serverSaljem = false; let _syncInProgress = false; let _syncMrezaPalaU = 0;',
    extractConst('_SERVER_ZADNJE_KEY'),
    extractFn('_serverSlanjeDozvoljeno'), extractFn('serverPosalji'),
    'return { serverPosalji, dozvoljeno: _serverSlanjeDozvoljeno, saljem: () => _serverSaljem, padMreze: () => { _syncMrezaPalaU = Date.now(); } };'].join('\n');
  const g = {
    sbUser: opts.bezPrijave ? null : { id: 'u1' }, sbProfile: { sumarija: 'S' }, _OL, localStorage: global.localStorage,
    navigator: { onLine: opts.offline ? false : true },
    showToast: m => p.toast.push(m), _mrezaSila: () => {}, _updSyncBadge: () => {}, _serverSazetakRender: () => { p.render++; },
    document: { getElementById: () => null }, openSyncQueuePanel: () => {},
    _SERVER_SAMO_LOKALNO: new Set(['upsert_trag', 'delete_trag', 'upsert_log', 'upsert_labels']),
    _serverNaCekanju: () => ({ stavki: cekaju }),
    _flushAllPendingVlake: async () => {}, _retryOrphanVlake: async () => {},
    _tragZaSlanje: () => opts.tragovi || [{ name: 'A' }],
    sbFlushTrag: async (t) => { p.trag++; p.tragDozvoljeno = api.dozvoljeno(); return t && t.ish; },
    _processOfflineQueue: async (sila) => {
      p.red.push({ sila, dozvoljeno: api.dozvoljeno() });
      cekaju = opts.poslije ?? 0;
      if (opts.prolaz) opts.prolaz(p.red.length, api);
    },
    setTimeout, setInterval: () => 1, clearInterval: () => {},
  };
  const keys = Object.keys(g);
  const api = new Function(...keys, src)(...keys.map(x => g[x]));
  return { api, p };
}

t('KLJUČNO: dugme otvara slanje, šalje red, pa slanje ZATVARA', async () => {
  const { api, p } = posaljiEnv();
  assert.strictEqual(api.dozvoljeno(), false);
  await api.serverPosalji();
  assert.strictEqual(p.trag, 0, 'tragovi se od v1.9.6 ne šalju');
  assert.ok(p.red.length >= 1);
  assert.ok(p.red.every(r => r.sila === true && r.dozvoljeno === true));
  assert.strictEqual(api.dozvoljeno(), false, 'poslije slanja automatski put mora opet biti zatvoren');
  assert.strictEqual(api.saljem(), false);
  assert.ok(Number(localStorage.getItem('tvlake_server_zadnje_slanje')) > 0, 'vrijeme zadnjeg slanja');
  assert.ok(p.toast.some(m => /Sve poslano/.test(m)));
});

t('stavke koje su bile odbijene/u razmaku idu odmah na ručno slanje', async () => {
  const { api } = posaljiEnv();
  _OL.enqueue({ type: 'delete_vlaka', payload: { datum: 'd', korisnik_id: 'u1' } });
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
  assert.strictEqual(p.red.length, 1);
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

// =====================================================================
// v1.9.5 — brzina brojača i reda, i ispravke ručnog slanja
// =====================================================================
sekcija('\nv1.9.5 — kapija traje koliko i slanje:');

t('KLJUČNO: kapija nema vremenski rok — otvorena je tačno dok traje slanje', () => {
  const src = extractFn('_serverSlanjeDozvoljeno');
  assert.ok(!/Date\.now/.test(src), 'rok od 3 min je zatvarao kapiju usred dugog slanja na slaboj vezi');
  assert.ok(/_serverSaljem/.test(src));
});

t('tokom ručnog slanja procesor ne javlja svoju poruku (samo jedna, konačna)', () => {
  assert.ok(/if \(synced && !_serverSaljem\) showToast/.test(extractFn('_processOfflineQueue')));
});

t('odjava: dijalog nema dupli "Odustani" (_dlgActions ga ima sam)', () => {
  const src = extractFn('doLogout');
  assert.ok(!/label: 'Odustani'/.test(src));
});

t('poslije pada mreže u prolazu reda nema novog prolaza', async () => {
  const { api, p } = posaljiEnv({
    poslije: 2,
    prolaz: (n, a) => { a.padMreze(); _OL.enqueue({ type: 'delete_vlaka', payload: { datum: 'x' + n, korisnik_id: 'u1' } }); },
  });
  await api.serverPosalji();
  assert.strictEqual(p.red.length, 1);
});

t('novi prolaz SAMO za stavke koje ovo slanje još nije pokušalo (npr. vlake poslije upisa projekta)', async () => {
  let dodano = false;
  const { api, p } = posaljiEnv({
    poslije: 1,
    prolaz: (n) => {
      if (!dodano) { dodano = true; _OL.enqueue({ type: 'upsert_vlaka', payload: { nm: 'T1', korisnik_id: 'u1', projekt_id: 'P' } }); return; }
      // drugi prolaz: stavka je pokušana i pala → treći prolaz ne smije krenuti
      const q = _OL.loadQueue(); q.forEach(o => { o._retries = 1; }); localStorage.setItem(_OL.QUEUE, JSON.stringify(q));
    },
  });
  await api.serverPosalji();
  assert.strictEqual(p.red.length, 2, 'prolaza: ' + p.red.length);
});

t('stavka koja je upravo pala se ne gađa ponovo u istom slanju', async () => {
  const { api, p } = posaljiEnv({
    poslije: 1,
    prolaz: () => {
      _OL.enqueue({ type: 'delete_vlaka', payload: { datum: 'd', korisnik_id: 'u1' } });
      const q = _OL.loadQueue(); q.forEach(o => { o._retries = 1; }); localStorage.setItem(_OL.QUEUE, JSON.stringify(q));
    },
  });
  await api.serverPosalji();
  assert.strictEqual(p.red.length, 1);
});

sekcija('\nv1.9.5 — brojač i red ne parsiraju cijeli dan bez potrebe:');

function brojacEnv() {
  const parsiranja = { n: 0 };
  const J = { parse: (x) => { parsiranja.n++; return JSON.parse(x); }, stringify: JSON.stringify };
  const g = { _SERVER_SAMO_LOKALNO: new Set(['upsert_trag', 'delete_trag', 'upsert_log', 'upsert_labels']), _OL, localStorage: global.localStorage, _DOZ_TRACK_BUF_KEY: 'buf', sbUser: { id: 'u1' },
    _tragZaSlanje: (q) => { parsiranja.trag = Array.isArray(q); return []; }, _locFotos: [], JSON: J };
  const keys = Object.keys(g);
  const f = new Function(...keys, 'const _lsMemo = {};\n' + extractFn('_lsJsonMemo') + '\n' + extractFn('_serverNaCekanju') +
    '\nreturn _serverNaCekanju;')(...keys.map(x => g[x]));
  return { f, parsiranja };
}

t('KLJUČNO: nepromijenjen red se ne parsira ponovo', () => {
  _store.clear();
  _OL.enqueue({ type: 'delete_vlaka', payload: { datum: 'd', korisnik_id: 'u1' } });
  localStorage.setItem('buf', JSON.stringify([{ user_id: 'u1' }]));
  const { f, parsiranja } = brojacEnv();
  f(); const prvi = parsiranja.n;
  f(); f(); f();
  assert.strictEqual(parsiranja.n, prvi, 'parsirano ponovo bez ikakve promjene');
  assert.strictEqual(f().red, 1);
});

t('promijenjen red (bilo ko da je pisao) se čita svjež', () => {
  _store.clear();
  _OL.enqueue({ type: 'delete_vlaka', payload: { datum: 'd', korisnik_id: 'u1' } });
  const { f } = brojacEnv();
  assert.strictEqual(f().red, 1);
  localStorage.setItem(_OL.QUEUE, JSON.stringify([...(_OL.loadQueue()), { type: 'delete_vlaka', payload: {}, _uid: 'u1' }]));
  assert.strictEqual(f().red, 2);
});

t('red koji pozivalac već ima se ne parsira', () => {
  _store.clear();
  const { f, parsiranja } = brojacEnv();
  const q = [{ type: 'delete_vlaka', payload: {}, _uid: 'u1' }];
  localStorage.setItem(_OL.QUEUE, JSON.stringify(q));
  const n = f(q);
  assert.strictEqual(n.red, 1);
  assert.strictEqual(parsiranja.n, 0);
});

t('oštećen red ne ruši brojač', () => {
  _store.clear();
  localStorage.setItem(_OL.QUEUE, '{oštećeno');
  const { f } = brojacEnv();
  assert.strictEqual(f().stavki, 0);
});

t('_OL.enqueue predaje upravo upisan red brojaču', () => {
  _store.clear();
  let dobio = null;
  global._updSyncBadge = (q) => { dobio = q; };
  try { _OL.enqueue({ type: 'delete_vlaka', payload: { datum: 'd', korisnik_id: 'u1' } }); }
  finally { delete global._updSyncBadge; }
  assert.ok(Array.isArray(dobio) && dobio.length === 1);
});

t('procesor reda čita red JEDNOM po stavci (ranije dva puta)', async () => {
  const brojiCitanja = async (nOps) => {
    let red = [];
    for (let i = 0; i < nOps; i++) red.push({ type: 'delete_vlaka', payload: { id: 'a' + i }, _qid: String(i) });
    let citanja = 0;
    const g = {
      Date, sbUser: { id: 'u1' }, sbProfile: { sumarija: 'S' },
      _OL: { QUEUE: 'q', loadQueue: () => { citanja++; return red.map(o => ({ ...o })); }, removeFromQueue: (id) => { red = red.filter(o => o._qid !== id); },
        bumpRetry: () => false, odgodi: () => {} },
      sb: { from: () => ({ delete: () => ({ eq: (_,id) => ({select: async () => ({data:[{id}], error:null})}) }) }) },
      localStorage: { getItem: () => '[]', setItem: () => {} },
      _DOZ_TRACK_BUF_KEY: 'buf', _genUUID: () => 'x', _flushPendingFotos: async () => {},
      _mrezaProbaj: () => true, showToast: () => {}, _updSyncBadge: () => {}, console: { warn() {} }, setTimeout: () => 0,
      _SERVER_SAMO_LOKALNO: new Set(['upsert_trag', 'delete_trag', 'upsert_log', 'upsert_labels']),
      _serverSlanjeDozvoljeno: () => true, _serverSaljem: true, _updSyncBadgeUskoro: () => {},
    };
    const src = [extractConst('_SYNC_PAUZA_MS'),
      'let _syncMrezaPalaU = 0, _syncOdgodaT = null; let _syncInProgress = false, _syncRerun = false;',
      extractFn('_isNetworkErr'), extractFn('_isAuthErr'), extractFn('_serverPrivremeno'), extractFn('_processOfflineQueue'),
      'return _processOfflineQueue;'].join('\n');
    const k = Object.keys(g);
    await new Function(...k, src)(...k.map(x => g[x]))(true);
    return citanja;
  };
  const jedna = await brojiCitanja(1), cetiri = await brojiCitanja(4);
  assert.strictEqual(cetiri - jedna, 3, 'čitanja po stavci: ' + (cetiri - jedna) / 3);
});

t('koordinate na karti bez toLocaleString (prvi Intl poziv pri pokretanju)', () => {
  const src = extractFn('updMGI').split('\n').filter(r => !/^\s*\/\//.test(r)).join('\n');
  assert.ok(!/toLocale/.test(src));
  assert.ok(/_stpBroj\(c\.y\)/.test(src));
});

sekcija('\nv1.9.5 — odjava i podsjetnik:');

t('KLJUČNO: odjava ne pokušava tihi prolaz reda (kapija je zatvorena) nego pita', () => {
  const src = extractFn('doLogout');
  const prije = src.slice(0, src.indexOf('sb.auth.signOut'));
  assert.ok(!/_processOfflineQueue\(/.test(prije), 'tihi pokušaj je udarao u zatvorenu kapiju');
  assert.ok(/_serverNaCekanju\(\)/.test(prije) && /_dlgActions\(/.test(prije) && /serverPosalji\(\)/.test(prije));
});

function podsjetnikEnv(n, saljem) {
  const toasti = []; const sat = { t: 1e12 };
  const f = new Function('_serverNaCekanju', 'showToast', 'sbUser', '_serverSaljem', 'Date',
    'let _serverPodsjetnikZadnji = 0;\n' + extractFn('_serverPodsjetnik') + '\nreturn _serverPodsjetnik;')(
    () => ({ stavki: n }), m => toasti.push(m), { id: 'u1' }, !!saljem, { now: () => sat.t });
  return { f, toasti, sat };
}

t('podsjetnik kad se signal vrati: javi se, ali najviše jednom u 30 min', () => {
  const e = podsjetnikEnv(4);
  e.f(); e.f();
  assert.strictEqual(e.toasti.length, 1);
  assert.ok(/4/.test(e.toasti[0]) && /Server/.test(e.toasti[0]));
  e.sat.t += 31 * 60000; e.f();
  assert.strictEqual(e.toasti.length, 2);
});

t('podsjetnik šuti kad ništa ne čeka ili slanje već traje', () => {
  const a = podsjetnikEnv(0); a.f(); assert.strictEqual(a.toasti.length, 0);
  const b = podsjetnikEnv(3, true); b.f(); assert.strictEqual(b.toasti.length, 0);
});

t('podsjetnik je zakačen na vraćenu vezu i na online event', () => {
  assert.ok(/_serverPodsjetnik\(\)/.test(extractFn('_netVezaVracena')));
  const i = HTML.indexOf("showToast('🌐 Veza uspostavljena')");
  assert.ok(i > 0 && /_serverPodsjetnik/.test(HTML.slice(i, i + 300)));
});

// =====================================================================
// v1.9.6 — na server idu SAMO vlake projekta i doznaka
// =====================================================================
sekcija('\nv1.9.6 — tragovi, dnevnik, oznake i fotografije ostaju na telefonu:');

t('KLJUČNO: brojač ne broji tragove, dnevnik ni oznake (ni zaostale u redu)', () => {
  _store.clear();
  _OL.enqueue({ type: 'upsert_trag', payload: { nm: 'd', korisnik_id: 'u1', client_uuid: 'c1', pts: [] } });
  _OL.enqueue({ type: 'upsert_log', payload: { datum: 'd', korisnik_id: 'u1' } });
  _OL.enqueue({ type: 'upsert_labels', payload: [], korisnik_id: 'u1' });
  _OL.enqueue({ type: 'upsert_vlaka', payload: { nm: 'T1', korisnik_id: 'u1', projekt_id: 'P' } });
  localStorage.setItem('buf', JSON.stringify([{ user_id: 'u1' }, { user_id: 'u1' }]));
  const n = naCekanju({ _locFotos: [{ sbId: null }] })();
  assert.strictEqual(n.red, 1, 'samo vlaka');
  assert.strictEqual(n.doz, 2);
  assert.strictEqual(n.stavki, 2, 'vlaka + pojas doznake (jedna stavka)');
  assert.strictEqual(n.tragovi, undefined);
  assert.strictEqual(n.foto, undefined);
});

t('procesor zaostalu stavku traga/dnevnika/oznaka izbaci iz reda BEZ slanja', async () => {
  let red = [
    { type: 'upsert_trag', payload: { client_uuid: 'c' }, _qid: '1' },
    { type: 'upsert_log', payload: {}, _qid: '2' },
    { type: 'upsert_labels', payload: [], _qid: '3' },
    { type: 'delete_trag', payload: { id: 'x' }, _qid: '4' },
    { type: 'delete_vlaka', payload: { id: 'v' }, _qid: '5' },
  ];
  const poziva = [];
  const g = {
    Date, sbUser: { id: 'u1' }, sbProfile: { sumarija: 'S' },
    _OL: { QUEUE: 'q', loadQueue: () => red.map(o => ({ ...o })), removeFromQueue: (id) => { red = red.filter(o => o._qid !== id); },
      bumpRetry: () => false, odgodi: () => {} },
    sb: { from: (tab) => { poziva.push(tab); return { delete: () => ({ eq: (_,id) => ({select: async () => ({data:[{id}], error:null})}) }) }; } },
    localStorage: { getItem: () => '[]', setItem: () => {} },
    _DOZ_TRACK_BUF_KEY: 'buf', _genUUID: () => 'x', _mrezaProbaj: () => true, showToast: () => {}, _updSyncBadge: () => {},
    console: { warn() {} }, setTimeout: () => 0,
    _SERVER_SAMO_LOKALNO: new Set(['upsert_trag', 'delete_trag', 'upsert_log', 'upsert_labels']),
    _serverSlanjeDozvoljeno: () => true, _serverSaljem: true, _updSyncBadgeUskoro: () => {},
  };
  const src = [extractConst('_SYNC_PAUZA_MS'),
    'let _syncMrezaPalaU = 0, _syncOdgodaT = null; let _syncInProgress = false, _syncRerun = false;',
    extractFn('_isNetworkErr'), extractFn('_isAuthErr'), extractFn('_serverPrivremeno'), extractFn('_processOfflineQueue'),
    'return _processOfflineQueue;'].join('\n');
  const k = Object.keys(g);
  await new Function(...k, src)(...k.map(x => g[x]))(true);
  assert.deepStrictEqual(poziva, ['vlake'], 'na server je smjela samo vlaka: ' + poziva.join(','));
  assert.strictEqual(red.length, 0);
});

t('lista vrsta koje ostaju na telefonu je tačno: tragovi, dnevnik, oznake', () => {
  const m = HTML.match(/const _SERVER_SAMO_LOKALNO = new Set\(\[([^\]]+)\]\)/);
  assert.ok(m);
  assert.deepStrictEqual(m[1].split(',').map(x => x.trim().replace(/'/g, '')).sort(), ['delete_trag', 'upsert_labels', 'upsert_log', 'upsert_trag']);
});

t('ručno slanje i pokretanje čiste zaostale lokalne stavke iz reda', () => {
  assert.ok(/filter\(op => !_SERVER_SAMO_LOKALNO\.has\(op\.type\)\)/.test(extractFn('serverPosalji')));
  const st = extractFn('_startupRestore');
  assert.ok(/_redUkloni\(op => _SERVER_SAMO_LOKALNO\.has\(op\.type\)\)/.test(st));
});

t('KLJUČNO: nigdje u app-u nema slanja tragova na server', () => {
  assert.ok(!/from\('tragovi'\)/.test(HTML), 'ostao je upis u tabelu tragovi');
  assert.ok(!/\bsbFlushTrag\b|\b_sbFlushTragImpl\b|\bsbDeleteTrag\b/.test(HTML));
});

t('fotografija se ne šalje sama; kolegama ide samo kroz "Podijeli"', () => {
  assert.ok(!/\bsbUploadFoto\b|\b_flushPendingFotos\b/.test(HTML));
  assert.ok(/async function sbSaveFoto\(/.test(HTML), 'izričito dijeljenje mora ostati');
});

t('dnevnik: "Zabilježi dan" ne ide na server', () => {
  const src = extractFn('logDan');
  assert.ok(!/\bsb\.|sbSaveLog|_OL\.enqueue/.test(src));
  assert.ok(/localStorage\.setItem\('tvlake_log'/.test(src));
});

function logEnv(lokalni) {
  if (lokalni) localStorage.setItem('tvlake_log', JSON.stringify(lokalni)); else localStorage.removeItem('tvlake_log');
  const box = {};
  const f = new Function('localStorage', 'rndLog', 'updProjStats', 'rndOdjeliRekap', 'box',
    'let dnevniLog = [];\n' + extractFn('_applyLogRows') + '\nreturn (r) => { _applyLogRows(r); box.log = dnevniLog; };')(
    global.localStorage, () => {}, () => {}, () => {}, box);
  return { f, box };
}

t('KLJUČNO: dnevnik sa servera se SPAJA sa lokalnim — novi lokalni unos ne nestaje', () => {
  _store.clear();
  const e = logEnv([
    { date: '2026-10-01', entries: [{ projektant: 'Ana', meters: 900 }] },          // samo lokalno (novo)
    { date: '2026-09-01', entries: [{ projektant: 'Ana', meters: 555 }] },          // lokalno ispravljeno
  ]);
  e.f([
    { datum: '2026-09-01', projektant: 'Ana', meters: 100 },
    { datum: '2026-08-15', projektant: 'Ana', meters: 300 },                          // samo na serveru (staro)
  ]);
  const dani = e.box.log.map(d => d.date);
  assert.deepStrictEqual(dani, ['2026-10-01', '2026-09-01', '2026-08-15']);
  assert.strictEqual(e.box.log[1].entries[0].meters, 555, 'lokalni unos ima prednost');
  assert.strictEqual(JSON.parse(localStorage.getItem('tvlake_log')).length, 3, 'spojeno je i zapisano lokalno');
});

t('dnevnik: bez lokalnog zapisa, stari serverski se prikaže (nov telefon)', () => {
  _store.clear();
  const e = logEnv(null);
  e.f([{ datum: '2026-08-15', projektant: 'Ana', meters: 300 }]);
  assert.strictEqual(e.box.log.length, 1);
});

t('tekstualne oznake: čuvanje je samo lokalno', async () => {
  _store.clear();
  const { sb, log } = lazniSb();
  const f = new Function('sb', 'sbUser', 'sbProfile', '_OL', 'textLabels', extractFn('sbSaveTextLabels') + '\nreturn sbSaveTextLabels;')(
    sb, { id: 'u1' }, { sumarija: 'S' }, _OL, [{ id: 'l1', lat: 44, lng: 16, text: 'A', size: 12, color: '#fff' }]);
  await f();
  assert.strictEqual(log.length, 0);
  assert.strictEqual(_OL.loadQueue().length, 0);
  assert.strictEqual(_OL.load(_OL.LABELS).length, 1);
});

t('tekstualne oznake: lokalni zapis ima prednost, server se čita samo kad lokalnog nema', async () => {
  const pokreni = async () => {
    const { sb, log } = lazniSb(() => ({ data: [{ label_id: 's', lat: 1, lng: 1, tekst: 'SA SERVERA' }], error: null }));
    const lbls = [];
    await new Function('sb', 'sbUser', '_OL', 'textLabels', 'createTextMarker', extractFn('sbLoadTextLabelsDB') + '\nreturn sbLoadTextLabelsDB;')(
      sb, { id: 'u1' }, _OL, lbls, () => ({}))();
    return { log, lbls };
  };
  _store.clear();
  _OL.save(_OL.LABELS, [{ label_id: 'l', lat: 2, lng: 2, tekst: 'LOKALNO' }]);
  let r = await pokreni();
  assert.strictEqual(r.log.length, 0);
  assert.deepStrictEqual(r.lbls.map(l => l.text), ['LOKALNO']);
  _store.clear();
  r = await pokreni();
  assert.strictEqual(r.log.length, 1);
  assert.deepStrictEqual(r.lbls.map(l => l.text), ['SA SERVERA']);
});

t('"maloprije", ne "maloprijed"', () => {
  const f = new Function(extractFn('_fmtAgo') + '\nreturn _fmtAgo;')();
  assert.strictEqual(f(Date.now() - 5000), 'Maloprije');
  assert.ok(!/[Mm]aloprijed/.test(HTML));
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

