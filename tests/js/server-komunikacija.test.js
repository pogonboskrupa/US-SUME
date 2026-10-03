// =====================================================================
// Komunikacija sa serverom na terenu — slab signal, izgubljeni odgovori,
// prolazne greške servera, realtime (v1.9.2).
// Pokretanje:  node tests/js/server-komunikacija.test.js
// ---------------------------------------------------------------------
// Na slaboj vezi je čest slučaj da server upis PRIHVATI, a odgovor se izgubi.
// Svaki upis koji se tada ponavlja mora biti idempotentan (nema duplikata,
// nema lažnog "konflikta"), a kratka smetnja servera ne smije operaciju
// gurnuti u "ručni pokušaj". Testovi puštaju STVARNI kod iz index.html i
// static/js/offline-layer.js nad lažnim Supabase klijentom.
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
  const m = HTML.match(new RegExp('const ' + name + '\\s*=\\s*[^;]+;'));
  if (!m) throw new Error('nema konstante ' + name);
  return m[0];
}

// ── localStorage + sat ────────────────────────────────────────────────
const _store = new Map();
global.localStorage = {
  getItem: k => (_store.has(k) ? _store.get(k) : null),
  setItem: (k, v) => _store.set(k, String(v)),
  removeItem: k => _store.delete(k),
};
global.showToast = () => {};
const sat = { t: 1.7e12 };
const _pravoNow = Date.now;
Date.now = () => sat.t;
const { _OL } = require('../../static/js/offline-layer.js');

let pass = 0, fail = 0;
const testovi = [];
function t(name, fn) { testovi.push([name, fn]); }
t.sekcija = naslov => testovi.push([naslov, null]);

// ── Lažni Supabase: lanac upita koji bilježi i vraća zadani odgovor ────
function lazniSb(odgovori) {
  const log = [];
  const from = (tabela) => {
    const q = { tabela, op: 'select', filteri: [], tijelo: null };
    const lanac = {
      select(k) { if (q.op === 'select') q.kolone = k; else q.vrati = k; return lanac; },
      insert(b) { q.op = 'insert'; q.tijelo = b; return lanac; },
      update(b) { q.op = 'update'; q.tijelo = b; return lanac; },
      upsert(b) { q.op = 'upsert'; q.tijelo = b; return lanac; },
      delete() { q.op = 'delete'; return lanac; },
      eq(k, v) { q.filteri.push(['eq', k, v]); return lanac; },
      is(k, v) { q.filteri.push(['is', k, v]); return lanac; },
      gte(k, v) { q.filteri.push(['gte', k, v]); return lanac; },
      lte(k, v) { q.filteri.push(['lte', k, v]); return lanac; },
      in(k, v) { q.filteri.push(['in', k, v]); return lanac; },
      limit() { return lanac; },
      single() { q.single = true; return lanac; },
      maybeSingle() { q.single = true; return lanac; },
      then(res, rej) {
        log.push(q);
        let r;
        try { r = odgovori(q, log); } catch (e) { return Promise.reject(e).then(res, rej); }
        return Promise.resolve(r || { data: null, error: null }).then(res, rej);
      },
    };
    return lanac;
  };
  return { sb: { from, rpc: async () => ({ error: { code: 'PGRST202' } }), auth: { refreshSession: async () => ({ data: {} }) } }, log };
}

// =====================================================================
t.sekcija('Red za sync — razmak između pokušaja i prolazne greške servera:');

t('bumpRetry postavlja razmak do sljedećeg pokušaja, koji raste (30 s, 60 s, 120 s…)', () => {
  _store.clear();
  const k = _OL.enqueue({ type: 'delete_vlaka', payload: { id: 'x' } });
  const razmaci = [];
  for (let i = 0; i < 4; i++) {
    _OL.bumpRetry(k, 5, { code: '42501' });
    razmaci.push(_OL.loadQueue(true)[0]._retryAt - sat.t);
  }
  assert.deepStrictEqual(razmaci, [30000, 60000, 120000, 240000]);
  assert.ok(_OL.razmakMs(20) <= 15 * 60000, 'razmak ima gornju granicu');
});

t('odgodi (prolazna greška servera) NE troši pokušaje — operacija nikad ne ide u "ručni pokušaj"', () => {
  _store.clear();
  const k = _OL.enqueue({ type: 'delete_vlaka', payload: { id: 'x' } });
  for (let i = 0; i < 20; i++) _OL.odgodi(k, { code: 'PGRST002' });
  const op = _OL.loadQueue(true)[0];
  assert.ok(!op._retries, '_retries = ' + op._retries);
  assert.ok(!op._blocked);
  assert.ok(op._retryAt > sat.t);
});

t('_serverPrivremeno razlikuje pad servera, pad upita i stvarnu grešku', () => {
  const f = new Function(extractFn('_serverPrivremeno') + '\nreturn _serverPrivremeno;')();
  assert.strictEqual(f({ code: 'PGRST002', message: 'Could not query the database for the schema cache' }), 'server');
  assert.strictEqual(f({ code: 'PGRST000' }), 'server');
  assert.strictEqual(f({ code: '08006' }), 'server');
  assert.strictEqual(f({ code: '53300' }), 'server');
  assert.strictEqual(f({ code: '57P01' }), 'server');
  assert.strictEqual(f({ message: 'x', status: 503 }), 'server');
  assert.strictEqual(f({ code: '57014', message: 'canceling statement due to statement timeout' }), 'upit');
  assert.strictEqual(f({ code: '40001' }), 'upit');
  assert.strictEqual(f({ code: '42501' }), null, 'RLS nije prolazna');
  assert.strictEqual(f({ code: '23505' }), null);
  assert.strictEqual(f({ code: 'PGRST204' }), null, 'nepostojeća kolona nije prolazna');
  assert.strictEqual(f(null), null);
});

function makeRed(greskaZa, overrides = {}) {
  _store.clear();
  const brisanja = [];
  const tajmeri = [];
  const g = {
    sbUser: { id: 'u1' }, sbProfile: { sumarija: 'S' }, _OL,
    sb: { from: () => ({ delete: () => ({ eq: (_k, id) => ({select:async()=>{ brisanja.push(id); return { data:[{id}],error: greskaZa(id) }; }}) }) }),
          auth: { refreshSession: async () => ({ data: {} }) } },
    localStorage: global.localStorage,
    _DOZ_TRACK_BUF_KEY: 'buf', _genUUID: () => 'x', _sendDozTrackPoint: async () => ({}),
    _dozPosaljiKomad: async () => ({ ok: [], error: null }), _dozPosaljiPojedinacno: async () => ({ ok: [], error: null }), _DOZ_KOMAD: 100,
    _flushPendingFotos: async () => {}, _mrezaProbaj: () => true,
    _SERVER_SAMO_LOKALNO: new Set(['upsert_trag', 'delete_trag', 'upsert_log', 'upsert_labels']), 
    _serverSlanjeDozvoljeno: () => true, _serverSaljem: false, _updSyncBadgeUskoro: () => {},
    showToast: () => {}, _updSyncBadge: () => {}, console: { warn() {} },
    setTimeout: (fn, ms) => { tajmeri.push({ fn, ms }); return tajmeri.length; },
  };
  Object.assign(g, overrides);
  const src = [extractConst('_SYNC_PAUZA_MS'),
    'let _syncMrezaPalaU = 0, _syncOdgodaT = null; let _syncInProgress = false, _syncRerun = false;',
    extractFn('_isNetworkErr'), extractFn('_isAuthErr'), extractFn('_serverPrivremeno'), extractFn('_processOfflineQueue'),
    'return { _processOfflineQueue, pauza: () => _syncMrezaPalaU };'].join('\n');
  const k = Object.keys(g);
  const api = new Function(...k, src)(...k.map(x => g[x]));
  return { api, brisanja, tajmeri };
}

t('brisanje bez vraćenog ID-ja ostaje u redu i ne potvrđuje slanje', async () => {
  let confirmed=0;
  const r=makeRed(()=>null,{sb:{from:()=>({delete:()=>({eq:()=>({select:async()=>({data:[],error:null})})})})},_serverTransferConfirmed:()=>confirmed++});
  _OL.enqueue({type:'delete_vlaka',payload:{id:'v1'}});
  await r.api._processOfflineQueue(true);
  assert.strictEqual(_OL.loadQueue(true).length,1);
  assert.strictEqual(confirmed,0);
});

t('ručni procesor na privremenom GPS kvaru staje bez 100 pojedinačnih pokušaja', async () => {
  let serije = 0, pojedinacno = 0;
  const r = makeRed(() => null, {
    _dozPosaljiKomad: async () => { serije++; return { ok: [], error: { code: 'PGRST002' } }; },
    _dozPosaljiPojedinacno: async () => { pojedinacno++; return { ok: [], error: null }; }
  });
  const buf = Array.from({ length: 220 }, (_, i) => ({ _qid: 'g' + i, user_id: 'u1', project_id: 'p', recorded_at: new Date(i * 1000).toISOString() }));
  localStorage.setItem('buf', JSON.stringify(buf));
  await r.api._processOfflineQueue(true);
  assert.strictEqual(serije, 1); assert.strictEqual(pojedinacno, 0);
  assert.deepStrictEqual(JSON.parse(localStorage.getItem('buf')), buf);
  assert.ok(r.api.pauza() > 0);
});

t('SCENARIO: kratka smetnja servera dok doznaka šalje prolaz na svaku GPS tačku → vlaka NE završava u "ručnom pokušaju"', async () => {
  // Server 30 s vraća PGRST002 (baza se restartuje), GPS tačka svake sekunde okida prolaz.
  let pocetak = sat.t;
  const r = makeRed(() => (sat.t - pocetak < 30000 ? { code: 'PGRST002', message: 'schema cache' } : null));
  _OL.enqueue({ type: 'delete_vlaka', payload: { id: 'v1' } });
  for (let s = 0; s < 30; s++) { await r.api._processOfflineQueue(); sat.t += 1000; }
  const op = _OL.loadQueue(true)[0];
  assert.ok(op, 'operacija je nestala');
  assert.ok(!op._blocked, 'operacija blokirana poslije ' + r.brisanja.length + ' pokušaja za 30 s');
  assert.ok(r.brisanja.length <= 3, r.brisanja.length + ' zahtjeva na pali server za 30 s (bez razmaka)');
  sat.t += 20 * 60000;                       // server se oporavio
  await r.api._processOfflineQueue();
  assert.strictEqual(_OL.loadQueue(true).length, 0, 'operacija nije poslana kad se server oporavio');
});

t('trajna greška (RLS) i dalje stiže do "ručnog pokušaja", ali ne za 5 sekundi', async () => {
  const r = makeRed(() => ({ code: '42501', message: 'rls' }));
  _OL.enqueue({ type: 'delete_vlaka', payload: { id: 'v1' } });
  for (let s = 0; s < 10; s++) { await r.api._processOfflineQueue(); sat.t += 1000; }
  assert.ok(!_OL.loadQueue(true)[0]._blocked, 'blokirano za 10 s');
  for (let s = 0; s < 60; s++) { await r.api._processOfflineQueue(); sat.t += 60000; }
  assert.ok(_OL.loadQueue(true)[0]._blocked, 'poslije sat vremena i dalje nije u ručnom pokušaju');
});

t('pad cijelog servera prekida prolaz (ne gađa ostatak reda), pad upita ide dalje', async () => {
  const r1 = makeRed(() => ({ code: 'PGRST001' }));
  ['a', 'b', 'c'].forEach(id => _OL.enqueue({ type: 'delete_vlaka', payload: { id } }));
  await r1.api._processOfflineQueue();
  assert.deepStrictEqual(r1.brisanja, ['a']);
  assert.ok(r1.api.pauza() > 0, 'pauza poslije pada servera');
  const r2 = makeRed(id => (id === 'a' ? { code: '57014' } : null));
  ['a', 'b', 'c'].forEach(id => _OL.enqueue({ type: 'delete_vlaka', payload: { id } }));
  await r2.api._processOfflineQueue();
  assert.deepStrictEqual(r2.brisanja, ['a', 'b', 'c']);
  assert.strictEqual(_OL.loadQueue(true).length, 1, 'samo a čeka');
});

t('ručni "Sync sad" (sila) ne čeka razmak stavke', async () => {
  const r = makeRed(() => ({ code: '42501' }));
  _OL.enqueue({ type: 'delete_vlaka', payload: { id: 'v1' } });
  await r.api._processOfflineQueue();
  await r.api._processOfflineQueue();
  assert.strictEqual(r.brisanja.length, 1, 'drugi prolaz odmah poslije ne smije slati');
  await r.api._processOfflineQueue(true);
  assert.strictEqual(r.brisanja.length, 2);
});

// =====================================================================
t.sekcija('Izgubljen odgovor — ponovljen upis ne smije praviti duplikat ni lažan konflikt:');

function vlakaEnv(odgovori) {
  _store.clear();
  const { sb, log } = lazniSb(odgovori);
  const vlake = [{ nm: 'T1', sbId: 'id1', rev: 3, projektId: null }];
  const src = [extractFn('_jsonKanon'), extractFn('_vlakaIstiSadrzaj'), extractFn('_syncVlakaOperation'),
    'return { _syncVlakaOperation, _vlakaIstiSadrzaj };'].join('\n');
  const api = new Function('sb', 'sbUser', 'vlake', '_OL', 'localStorage', '_updateVlakaSyncIcon', '_saveLocalVlake', src)(
    sb, { id: 'u1' }, vlake, _OL, global.localStorage, () => {}, () => {});
  return { api, log, vlake };
}
const PTS = [{ la: 44.1, lo: 16.1, al: 300 }, { la: 44.2, lo: 16.2, al: 310 }];
const PAYLOAD = { korisnik_id: 'u1', nm: 'T1', br: 1, kr: 0, boja: '#f00', lager: null, na_putu: false, pts: PTS, updated_at: '2026-09-30T10:00:00Z' };

t('KLJUČNO: upis vlake je PROŠAO, odgovor izgubljen → ponovljeni upis ne vraća "konflikt"', async () => {
  const e = vlakaEnv(q => {
    if (q.op === 'update') return { data: [], error: null };            // rev se već promijenio
    if (q.op === 'select') return { data: { id: 'id1', rev: 4, updated_at: 'x', ...PAYLOAD,
      // jsonb vraća ključeve drugim redoslijedom i bez updated_at klijenta
      pts: PTS.map(p => ({ al: p.al, lo: p.lo, la: p.la })), updated_at: '2026-09-30T10:00:01Z' }, error: null };
  });
  const err = await e.api._syncVlakaOperation({ payload: { id: 'id1', ...PAYLOAD }, knownRev: 3 });
  assert.strictEqual(err, null, 'lažan konflikt: ' + JSON.stringify(err));
  assert.strictEqual(e.vlake[0].rev, 4, 'revizija sa servera preuzeta');
});

t('stvaran konflikt (drugi sadržaj na serveru) i dalje ostaje konflikt', async () => {
  const e = vlakaEnv(q => {
    if (q.op === 'update') return { data: [], error: null };
    if (q.op === 'select') return { data: { id: 'id1', rev: 9, ...PAYLOAD, pts: [PTS[0]] }, error: null };
  });
  const err = await e.api._syncVlakaOperation({ payload: { id: 'id1', ...PAYLOAD }, knownRev: 3 });
  assert.strictEqual(err && err.code, 'LOCAL_CONFLICT');
});

t('provjera sadržaja koja padne na mreži vraća mrežnu grešku (stavka čeka), ne konflikt', async () => {
  const e = vlakaEnv(q => {
    if (q.op === 'update') return { data: [], error: null };
    if (q.op === 'select') return { data: null, error: { message: 'TypeError: Failed to fetch' } };
  });
  const err = await e.api._syncVlakaOperation({ payload: { id: 'id1', ...PAYLOAD }, knownRev: 3 });
  assert.ok(err && /fetch/.test(err.message));
});

t('_vlakaIstiSadrzaj: redoslijed ključeva nebitan, nepostojeća kolona = null, updated_at se ne poredi', () => {
  const e = vlakaEnv(() => null);
  const f = e.api._vlakaIstiSadrzaj;
  assert.ok(f({ a: 1, pts: [{ la: 1, lo: 2 }], updated_at: 'x' }, { pts: [{ lo: 2, la: 1 }], a: 1, updated_at: 'y' }));
  assert.ok(f({ a: null }, {}));
  assert.ok(!f({ a: 1 }, { a: 2 }));
  assert.ok(!f({ pts: [{ la: 1 }] }, { pts: [{ la: 1 }, { la: 2 }] }));
});

// =====================================================================
t.sekcija('Doznaka GPS tačke u serijama:');

function dozEnv(odgovori) {
  const { sb, log } = lazniSb(odgovori);
  const src = [extractConst('_DOZ_KOMAD'), extractFn('_isNetworkErr'), extractFn('_isAuthErr'), extractFn('_dozTackaKljuc'),
    extractFn('_serverPrivremeno'), extractFn('_dozPosaljiKomad'), extractFn('_dozPosaljiPojedinacno'), extractFn('_sendDozTrackPoint'),
    'return { _dozPosaljiKomad, _dozPosaljiPojedinacno };'].join('\n');
  const api = new Function('sb', src)(sb);
  return { api, log };
}
function tacke(n, od) {
  const out = [];
  for (let i = 0; i < n; i++) out.push({ _qid: 'q' + (od + i), user_id: 'u1', project_id: 'p1', latitude: 44 + i * 1e-5, longitude: 16,
    recorded_at: new Date(1.7e12 + (od + i) * 1000).toISOString() });
  return out;
}

t('serija od 100 tačaka = 2 zahtjeva (provjera + jedan upis), ne 100–200', async () => {
  const e = dozEnv(q => (q.op === 'select' ? { data: [], error: null } : { error: null }));
  const r = await e.api._dozPosaljiKomad(tacke(100, 0));
  assert.strictEqual(r.ok.length, 100);
  assert.strictEqual(e.log.length, 2);
  assert.strictEqual(e.log[1].tijelo.length, 100);
  assert.ok(!e.log[1].tijelo.some(p => '_qid' in p), '_qid ne ide na server');
});

t('tačke koje su već na serveru (izgubljen odgovor) se ne upisuju ponovo — i uz drugačiji zapis vremena', async () => {
  const sve = tacke(10, 0);
  const e = dozEnv(q => (q.op === 'select'
    ? { data: sve.slice(0, 6).map(p => ({ recorded_at: p.recorded_at.replace('Z', '+00:00'), latitude: p.latitude, longitude: p.longitude })), error: null }
    : { error: null }));
  const r = await e.api._dozPosaljiKomad(sve);
  assert.strictEqual(r.ok.length, 10, 'sve tačke smiju iz bafera');
  assert.strictEqual(e.log[1].tijelo.length, 4, 'upisano ' + e.log[1].tijelo.length + ' umjesto 4 nove');
});

t('preširok prozor (≥ 1000 redova — nepotpuna provjera) → serija ide pojedinačno, bez rizika duplikata', async () => {
  const e = dozEnv(q => (q.op === 'select' ? { data: new Array(1000).fill({ recorded_at: 'x', latitude: 0, longitude: 0 }), error: null } : { error: null }));
  const r = await e.api._dozPosaljiKomad(tacke(5, 0));
  assert.strictEqual(r.error && r.error.code, 'KOMAD_SIROK');
  assert.ok(!e.log.some(q => q.op === 'insert'));
});

t('mrežni pad usred serije: ništa nije označeno poslanim (ostaje u baferu)', async () => {
  const e = dozEnv(q => (q.op === 'select' ? { data: [], error: null } : { error: { message: 'Failed to fetch' } }));
  const r = await e.api._dozPosaljiKomad(tacke(20, 0));
  assert.deepStrictEqual(r.ok, []);
  assert.ok(/fetch/.test(r.error.message));
});

t('privremeni pad servera prekida pojedinačno slanje GPS tačaka', async () => {
  let pokusaja = 0;
  const e = dozEnv(q => {
    pokusaja++;
    return { error: { code: 'PGRST000', message: 'database unavailable' } };
  });
  const r = await e.api._dozPosaljiPojedinacno(tacke(100, 0));
  assert.deepStrictEqual(r.ok, []);
  assert.strictEqual(r.error.code, 'PGRST000');
  assert.strictEqual(pokusaja, 1);
});

t('pojedinačni rezervni put: loša tačka (FK) ostaje, dobre prolaze', async () => {
  const e = dozEnv(q => {
    if (q.op === 'select') return { data: [], error: null };
    if (q.op === 'insert') return { error: q.tijelo.latitude === 44 ? { code: '23503', message: 'fk' } : null };
  });
  const r = await e.api._dozPosaljiPojedinacno(tacke(3, 0));
  assert.deepStrictEqual(r.ok, ['q1', 'q2']);
  assert.strictEqual(r.error, null);
});

// =====================================================================
t.sekcija('Realtime — obnova kanala na mrtvoj i sporoj vezi:');

function rtEnv(stanje) {
  let now = 0; const timers = [];
  const st = (fn, ms) => { const x = { at: now + ms, fn }; timers.push(x); return x; };
  const ct = x => { const i = timers.indexOf(x); if (i >= 0) timers.splice(i, 1); };
  let starts = 0, spojeno = 0, kanala = 0;
  const sb = {
    channel() { const ch = { state: 'joining', on() { return ch; }, subscribe(cb) {
      kanala++; ch.cb = cb; const J = stanje.join(kanala);
      st(() => { if (ch.state === 'closed') return; if (J) { ch.state = 'joined'; spojeno++; } cb && cb(J ? 'SUBSCRIBED' : 'TIMED_OUT'); }, J || 10000);
      return ch; } }; return ch; },
    removeChannel(ch) { ch.state = 'closed'; ch.cb && ch.cb('CLOSED'); },
  };
  const src = `let _rtVlakeChannel=null,_rtOdjeliChannel=null,_rtFotosChannel=null,_rtClanoviChannel=null,_rtDozGlobalChannel=null,_rtShareChannel=null,_shareChannelReady=false;
  let _rtObnovaT = null, _rtObnovaN = 0;
  function _mrezaProbaj(){return true;}
  function _stopShareLive(){} function _updSyncDot(){} function _schedKolegeFullSync(){} function _dozEnsureChannel(){} function _dozSchedCatchup(){}
  function _onVlakaRtEvent(){} function sbLoadOdjeli(){} function _updKoleguLiveBar(){} function _onSharePoint(){} function _onShareLive(){} function _onShareStop(){}
  ${['_sbRemoveRtChannels', '_rtZakaziObnovu', '_onRtStatus', 'sbStartRealtime'].map(extractFn).join('\n')}
  const orig = sbStartRealtime; sbStartRealtime = function(){ tick(); return orig(); };
  return () => sbStartRealtime();`;
  const start = new Function('sb', 'setTimeout', 'clearTimeout', 'sbProfile', 'window', 'setInterval', 'clearInterval', 'tick', 'console', '_mrezaStanje', src)(
    sb, st, ct, { sumarija: 'S' }, {}, () => 0, () => {}, () => starts++, { log() {}, warn() {} }, () => stanje.mreza);
  start();
  const vrti = (min) => {
    while (timers.length) {
      timers.sort((a, b) => a.at - b.at);
      if (timers[0].at > min * 60000) break;
      const x = timers.shift(); now = x.at; x.fn();
    }
  };
  return { vrti, get starts() { return starts; }, get spojeno() { return spojeno; } };
}

t('mrtva veza 10 min: kanali se ne ruše i ne otvaraju iznova svakih 8 s (bilo 74 puta)', () => {
  const e = rtEnv({ mreza: 'nema', join: () => 0 });
  e.vrti(10);
  assert.ok(e.starts <= 2, 'sbStartRealtime ' + e.starts + '×');
});

t('slaba veza bez uspjeha: obnova sa rastućim razmakom (najviše ~1 u 2 min)', () => {
  const e = rtEnv({ mreza: 'slaba', join: () => 0 });
  e.vrti(10);
  assert.ok(e.starts >= 3 && e.starts <= 9, 'sbStartRealtime ' + e.starts + '×');
});

t('KLJUČNO: spora veza (prijava kanala traje 9 s) — kanal se NA KRAJU prijavi (ranije se rušio prije prijave, zauvijek)', () => {
  const e = rtEnv({ mreza: 'slaba', join: n => (n <= 6 ? 0 : 9000) });
  e.vrti(5);
  assert.ok(e.spojeno >= 1, 'vlake kanal se nikad nije prijavio (' + e.starts + ' obnova)');
  assert.ok(e.starts <= 3, 'sbStartRealtime ' + e.starts + '×');
});

// =====================================================================
(async () => {
  for (const [name, fn] of testovi) {
    if (!fn) { console.log('\n' + name); continue; }
    try { await fn(); console.log('  ✔ ' + name); pass++; }
    catch (e) { fail++; console.log('  ✘ ' + name + '\n      ' + e.message); }
  }
  Date.now = _pravoNow;
  console.log('\n' + pass + ' prošlo, ' + fail + ' palo');
  process.exit(fail ? 1 : 0);
})();

