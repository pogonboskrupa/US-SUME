// =====================================================================
// Rad bez signala i na slabom signalu (v1.8.8).
// Pokretanje:  node tests/js/slab-signal.test.js
// ---------------------------------------------------------------------
// navigator.onLine na terenu LAŽE 'true' na mrtvoj vezi (OS-S4). Do v1.8.8
// je mjerenje kvaliteta veze (v1.4.6) bilo samo PRIKAZ — odluke su i dalje
// pitale navigator.onLine, pa je app na izmjereno mrtvoj vezi slao zahtjev za
// zahtjevom i svaki je visio do roka. Ovdje se provjerava da:
//   - odluka "vrijedi li sad pokušati online" poštuje IZMJERENO stanje,
//     uz povremenu probu (bez sintetičkog pinga) da se veza sama otkrije;
//   - transport na izmjereno mrtvoj vezi pada ODMAH (keš/red krenu odmah);
//   - red za sync staje na prvoj mrežnoj grešci i ne gađa vezu u petlji;
//   - oporavak prekinutog snimanja NE čeka mrežna učitavanja;
//   - service worker ne drži pokretanje app-a na mreži koja ne odgovara.
// Sve nad STVARNIM kodom iz index.html, sw.js i reliable-fetch.js.
// =====================================================================
'use strict';
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const HTML = fs.readFileSync(path.join(__dirname, '../../index.html'), 'utf8');
const SW = fs.readFileSync(path.join(__dirname, '../../sw.js'), 'utf8');

function extractFn(name) {
  let start = HTML.indexOf('async function ' + name + '(');
  if (start < 0) start = HTML.indexOf('function ' + name + '(');
  if (start < 0) throw new Error('nije nađena funkcija ' + name);
  let i = HTML.indexOf('{', start), depth = 0;
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

let pass = 0, fail = 0;
async function t(name, fn) {
  try { await fn(); console.log('  ✔ ' + name); pass++; }
  catch (e) { fail++; console.log('  ✘ ' + name + '\n      ' + e.message); }
}

// ── Odluka o vezi ────────────────────────────────────────────────────
const SRC_NET = [
  extractConst('_NET_UZORAKA'), extractConst('_NET_SVJEZE_MS'), extractConst('_NET_SPORO_MS'),
  extractConst('_NET_PROBA_MS'), extractConst('_NET_PROZOR_MS'),
  'let _netUzorci = []; let _netProbaDo = 0, _netSilaDo = 0; let _netVracenaT = null, _netVracenaZadnji = 0;',
  extractFn('_netZabiljezi'), extractFn('_netSvjezi'), extractFn('_netMedijanMs'), extractFn('_netKvalitet'),
  extractFn('_mrezaProbaj'), extractFn('_mrezaStanje'), extractFn('_mrezaSila'),
  extractFn('_netDozvoliZahtjev'), extractFn('_netZaboraviKvarove'), extractFn('_netVezaVracena'),
].join('\n');

function makeNet({ onLine = true } = {}) {
  const sat = { t: 1000000 };
  const tajmeri = [];
  const pozivi = { red: [], jezgro: 0, plocice: 0 };
  const g = {
    Date: { now: () => sat.t },
    navigator: { onLine },
    setTimeout: (fn) => { tajmeri.push(fn); return tajmeri.length; },
    _netBadgeSync: () => {},
    _netPonoviPlocice: () => { pozivi.plocice++; },
    sbUser: { id: 'u1' },
    _processOfflineQueue: (sila) => { pozivi.red.push(sila); },
    _serverPodsjetnik: () => { pozivi.podsjetnik = (pozivi.podsjetnik || 0) + 1; },
    _reloadCoreData: () => { pozivi.jezgro++; },
  };
  const k = Object.keys(g);
  const api = new Function(...k, SRC_NET + `
    return { _netZabiljezi, _netKvalitet, _mrezaProbaj, _mrezaStanje, _mrezaSila,
             _netDozvoliZahtjev, _netZaboraviKvarove,
             uzorak(ok, prijeMs) { _netUzorci.push({ ok, ms: 100, vrsta: ok ? 'ok' : 'istek', t: Date.now() - (prijeMs || 0) }); },
             get broj() { return _netUzorci.length; } };`)(...k.map(x => g[x]));
  return { api, sat, tajmeri, pozivi, g };
}

(async () => {
console.log('Odluka "vrijedi li sad pokušati online" (_mrezaProbaj):');

await t('OS kaže offline → ne pokušava ni lagano ni teško', () => {
  const { api } = makeNet({ onLine: false });
  assert.strictEqual(api._mrezaProbaj(), false);
  assert.strictEqual(api._mrezaProbaj(true), false);
});

await t('bez uzoraka (nepoznato) → pokušava — prvi poziv i JESTE mjerenje', () => {
  const { api } = makeNet();
  assert.strictEqual(api._netKvalitet(), 'nepoznato');
  assert.strictEqual(api._mrezaProbaj(), true);
  assert.strictEqual(api._mrezaProbaj(true), true);
});

await t('slaba veza → offline i za lagane i za teške automatske radnje', () => {
  const { api } = makeNet();
  api.uzorak(true); api.uzorak(false);
  assert.strictEqual(api._netKvalitet(), 'slaba');
  assert.strictEqual(api._mrezaProbaj(), false);
  assert.strictEqual(api._mrezaProbaj(true), false);
});

await t('izmjereno mrtva veza (OS i dalje kaže online) → ne pokušava', () => {
  const { api } = makeNet();
  api.uzorak(false, 1000);
  assert.strictEqual(api._netKvalitet(), 'nema');
  assert.strictEqual(api._mrezaProbaj(), false);
  assert.strictEqual(api._mrezaProbaj(true), false);
});

await t('dva zadnja pada zaustavljaju mrežu i poslije ranije dobre veze', () => {
  const { api } = makeNet();
  for (let i = 0; i < 8; i++) api.uzorak(true, 60000);
  api._netZabiljezi({ ok: false, ms: 15000, vrsta: 'istek' });
  api._netZabiljezi({ ok: false, ms: 15000, vrsta: 'istek' });
  assert.strictEqual(api._netKvalitet(), 'nema');
  assert.strictEqual(api._netDozvoliZahtjev(), false);
});

await t('neuspjela proba odmah zatvara prozor za naredne zahtjeve', () => {
  const { api } = makeNet();
  api.uzorak(false, 31000);
  assert.strictEqual(api._netDozvoliZahtjev(), true);
  api._netZabiljezi({ ok: false, ms: 100, vrsta: 'greska' });
  assert.strictEqual(api._netDozvoliZahtjev(), false);
});

await t('mrtva veza: poslije 30 s JEDNA proba, njen tok smije završiti, ostali čekaju sljedeći prozor', () => {
  const { api, sat } = makeNet();
  api.uzorak(false, 31000);
  assert.strictEqual(api._mrezaProbaj(), true, 'proba dodijeljena');
  assert.strictEqual(api._mrezaProbaj(), true, 'u prozoru probe (20 s) smiju i drugi zahtjevi istog toka');
  assert.strictEqual(api._mrezaProbaj(true), false, 'teška radnja nikad nije proba');
  sat.t += 21000;   // prozor istekao, a 30 s od dodjele još nije
  assert.strictEqual(api._mrezaProbaj(), false, 'sljedeća proba tek za 30 s od prethodne');
  sat.t += 10000;
  assert.strictEqual(api._mrezaProbaj(), true, 'novi prozor');
});

await t('stanje za poruke (_mrezaStanje) NE troši probu', () => {
  const { api } = makeNet();
  api.uzorak(false, 31000);
  for (let i = 0; i < 5; i++) assert.strictEqual(api._mrezaStanje(), 'nema');
  assert.strictEqual(api._mrezaProbaj(), true, 'proba je i dalje slobodna');
});

await t('OS kaže offline → vrata odbijaju odmah (supabase-js bi inače ponavljao 1+2+4 s), osim uz _mrezaSila', () => {
  const { api } = makeNet({ onLine: false });
  assert.strictEqual(api._netDozvoliZahtjev(), false);
  api._mrezaSila();
  assert.strictEqual(api._netDozvoliZahtjev(), true);
});

await t('izričita radnja korisnika (_mrezaSila) propušta zahtjeve i na izmjereno mrtvoj vezi', () => {
  const { api } = makeNet();
  api.uzorak(false, 1000);
  assert.strictEqual(api._netDozvoliZahtjev(), false);
  api._mrezaSila();
  assert.strictEqual(api._netDozvoliZahtjev(), true);
});

await t('veza se vratila BEZ online eventa → red za sync (prisilno) + osvježavanje + pločice', () => {
  const { api, tajmeri, pozivi } = makeNet();
  api.uzorak(false, 1000);
  api._netZabiljezi({ ok: true, ms: 300, ttfb: 200 });
  assert.strictEqual(tajmeri.length, 1, 'oporavak zakazan');
  tajmeri.shift()();
  assert.deepStrictEqual(pozivi.red, [true]);
  assert.strictEqual(pozivi.jezgro, 1);
  assert.strictEqual(pozivi.plocice, 1);
  assert.strictEqual(api._netKvalitet(), 'dobra', 'kvarovi iz mrtvog perioda se ne broje — inače bi foto čekale do 10 min');
  api.uzorak(false, 0);   // opet pala…
  api._netZabiljezi({ ok: true, ms: 300 });
  assert.strictEqual(tajmeri.length, 0, '…ali oporavak se ne ponavlja češće od jednom u minuti');
});

await t('velik ali uredan odgovor NE proglašava vezu slabom (odziv = vrijeme do zaglavlja)', () => {
  const { api } = makeNet();
  for (let i = 0; i < 3; i++) api._netZabiljezi({ ok: true, ms: 9000, ttfb: 300 });
  assert.strictEqual(api._netKvalitet(), 'dobra');
});

await t('OS javi da je veza uspostavljena → stari kvarovi se zaboravljaju', () => {
  const { api } = makeNet();
  api.uzorak(false, 1000); api.uzorak(false, 500);
  api._netZaboraviKvarove();
  assert.strictEqual(api._netKvalitet(), 'nepoznato');
  assert.strictEqual(api._mrezaProbaj(), true);
});

console.log('\nTransport (reliable-fetch.js) sa vratima:');
const { reliableFetch, setNetObserver, setNetGate } = require('../../static/js/reliable-fetch.js');

await t('izmjereno mrtva veza → poziv pada ODMAH, bez mrežnog zahtjeva i bez lažnog uzorka', async () => {
  const { api } = makeNet();
  api.uzorak(false, 1000);
  const uzorci = [];
  setNetObserver(i => uzorci.push(i));
  setNetGate(api._netDozvoliZahtjev);
  const orig = global.fetch;
  let fetchZvan = 0;
  global.fetch = async () => { fetchZvan++; return new Response('x'); };
  try {
    const t0 = Date.now();
    await assert.rejects(() => reliableFetch('https://s.test/rest/v1/vlake', {}, 5000),
      e => e instanceof TypeError && /fetch/i.test(e.message) && e.name === 'AbortError',
      'mrežna greška (_isNetworkErr) koju supabase-js NE ponavlja 3 puta (AbortError)');
    assert.ok(Date.now() - t0 < 100, 'ne čeka rok');
    assert.strictEqual(fetchZvan, 0);
    assert.strictEqual(uzorci.length, 0, 'odbijen poziv nije pokušaj — inače proba nikad ne dođe na red');
  } finally { global.fetch = orig; setNetGate(null); setNetObserver(null); }
});

await t('dodijeljena proba prolazi kroz vrata i njen ishod se mjeri', async () => {
  const { api } = makeNet();
  api.uzorak(false, 31000);
  const uzorci = [];
  setNetObserver(i => uzorci.push(i));
  setNetGate(api._netDozvoliZahtjev);
  const orig = global.fetch;
  global.fetch = async () => new Response('ok', { status: 200 });
  try {
    const r = await reliableFetch('https://s.test/rest/v1/vlake', {}, 5000);
    assert.strictEqual(r.status, 200);
    assert.strictEqual(uzorci.length, 1);
  } finally { global.fetch = orig; setNetGate(null); setNetObserver(null); }
});

console.log('\nRed za sync (_processOfflineQueue) na slaboj/mrtvoj vezi:');
const SRC_Q = [
  extractConst('_SYNC_PAUZA_MS'),
  'let _syncMrezaPalaU = 0, _syncOdgodaT = null; let _syncInProgress = false, _syncRerun = false;',
  extractFn('_isNetworkErr'), extractFn('_isAuthErr'), extractFn('_serverPrivremeno'), extractFn('_processOfflineQueue'),
].join('\n');

function makeRed(opts = {}) {
  let red = (opts.ops || []).map(o => ({ ...o }));
  const pozivi = { brisanja: [], retry: [], fotos: 0, tajmeri: [] };
  const sat = { t: 5000000 };
  const g = {
    Date: { now: () => sat.t },
    sbUser: { id: 'u1' }, sbProfile: { sumarija: 'S' },
    _OL: {
      QUEUE: 'q',
      loadQueue: () => red.map(o => ({ ...o })),
      removeFromQueue: (id) => { red = red.filter(o => o._qid !== id); },
      bumpRetry: (id) => { pozivi.retry.push(id); return false; },
      odgodi: (id) => { pozivi.odgode = (pozivi.odgode || []).concat(id); },
    },
    sb: { from: () => ({ delete: () => ({ eq: async (_k, id) => { pozivi.brisanja.push(id); return { error: opts.greska || null }; } }) }),
          auth: { refreshSession: async () => ({ data: {} }) } },
    localStorage: { getItem: () => '[]', setItem: () => {} },
    _DOZ_TRACK_BUF_KEY: 'buf', _genUUID: () => 'x', _sendDozTrackPoint: async () => ({}),
    _flushPendingFotos: async () => { pozivi.fotos++; },
    _mrezaProbaj: (teska) => (opts.mreza ? opts.mreza(teska) : true),
    // v1.9.4: slanje je ručno — ovi testovi mjere ponašanje DOK ručno slanje traje.
    _SERVER_SAMO_LOKALNO: new Set(['upsert_trag', 'delete_trag', 'upsert_log', 'upsert_labels']), 
    _serverSlanjeDozvoljeno: () => opts.rucno !== false, _serverSaljem: false, _updSyncBadgeUskoro: () => { pozivi.badge = (pozivi.badge || 0) + 1; },
    showToast: () => {}, _updSyncBadge: () => {}, console: { warn() {} },
    setTimeout: (fn, ms) => { pozivi.tajmeri.push({ fn, ms }); return pozivi.tajmeri.length; },
  };
  const k = Object.keys(g);
  const api = new Function(...k, SRC_Q + '\nreturn { _processOfflineQueue };')(...k.map(x => g[x]));
  return { api, pozivi, sat, get red() { return red; } };
}
const OPS = [
  { type: 'delete_vlaka', payload: { id: 'a' }, _qid: '1' },
  { type: 'delete_vlaka', payload: { id: 'b' }, _qid: '2' },
  { type: 'delete_vlaka', payload: { id: 'c' }, _qid: '3' },
];

await t('mrežna greška VRAĆENA kao {error} prekida prolaz — ne čeka rok za svaku stavku redom', async () => {
  const r = makeRed({ ops: OPS, greska: { message: 'TypeError: Failed to fetch' } });
  await r.api._processOfflineQueue();
  assert.deepStrictEqual(r.pozivi.brisanja, ['a'], 'samo prva stavka — veza je ista za sve');
  assert.strictEqual(r.red.length, 3, 'ništa nije izgubljeno');
  assert.strictEqual(r.pozivi.retry.length, 0, 'mrežni pad ne troši pokušaje stavke');
});

await t('greška baze (RLS) i dalje ide na sljedeću stavku (nije kvar veze)', async () => {
  const r = makeRed({ ops: OPS, greska: { code: '42501', message: 'rls' } });
  await r.api._processOfflineQueue();
  assert.deepStrictEqual(r.pozivi.brisanja, ['a', 'b', 'c']);
  assert.strictEqual(r.pozivi.retry.length, 3);
});

await t('poslije mrežnog pada sljedeći prolaz čeka pauzu (nema petlje na svaku GPS tačku)…', async () => {
  const r = makeRed({ ops: OPS, greska: { message: 'Failed to fetch' } });
  await r.api._processOfflineQueue();
  r.pozivi.tajmeri.length = 0;
  r.sat.t += 1000;
  for (let i = 0; i < 5; i++) await r.api._processOfflineQueue();
  assert.deepStrictEqual(r.pozivi.brisanja, ['a'], 'nijedan novi zahtjev u pauzi');
  assert.strictEqual(r.pozivi.tajmeri.length, 1, 'jedan odgođen prolaz, ne pet');
  assert.ok(r.pozivi.tajmeri[0].ms > 18000 && r.pozivi.tajmeri[0].ms <= 20000);
});

await t('…a ručni "Sync sad" / vraćena veza (sila) ide odmah', async () => {
  const r = makeRed({ ops: OPS, greska: { message: 'Failed to fetch' } });
  await r.api._processOfflineQueue();
  r.sat.t += 1000;
  await r.api._processOfflineQueue(true);
  assert.deepStrictEqual(r.pozivi.brisanja, ['a', 'a']);
});

await t('izmjereno mrtva veza → prolaz se ni ne pokreće', async () => {
  const r = makeRed({ ops: OPS, mreza: () => false });
  await r.api._processOfflineQueue();
  assert.deepStrictEqual(r.pozivi.brisanja, []);
});

await console.log('\nPokretanje (sbInitData) — lokalni oporavak ne čeka mrežu:');
function makeInit(opts) {
  const log = [];
  const g = {
    sbProfile: { is_admin: false },
    sbLoadProjekti: opts.projekti || (async () => { log.push('projekti'); }),
    sbLoadVlake: async () => { log.push('vlake'); }, sbLoadLog: async () => {}, sbLoadTextLabelsDB: async () => {},
    sbLoadKolege: async () => {}, sbLoadOdjeli: async () => {}, loadGlobalKmlStyles: async () => {},
    sbStartRealtime: () => {}, sbLoadKolegeVlake: opts.kolege || (async () => {}),
    sbLoadSharedFotos: () => {}, dozLoadOdjeli: async () => {}, autoLoadAllKmlBuckets: () => {},
    _processOfflineQueue: () => {}, _retryOrphanVlake: async () => {}, _adminCheckPending: async () => {},
    _trnSharedRestore: () => log.push('sifra'), _dozQrRestore: () => log.push('qr'),
    _updSyncBadge: () => log.push('bedz'),
    _crashCheck: () => log.push('oporavak'),
    setTimeout: (fn) => { log.push('zakazan-oporavak'); fn(); },
  };
  const k = Object.keys(g);
  const api = new Function(...k, extractFn('sbInitData') + '\nreturn { sbInitData };')(...k.map(x => g[x]));
  return { api, log };
}

await t('mrežno učitavanje BACI grešku → oporavak snimanja se i dalje pokrene', async () => {
  const { api, log } = makeInit({ projekti: async () => { throw new TypeError('Failed to fetch'); } });
  await api.sbInitData().catch(() => {});
  assert.ok(log.includes('oporavak'), 'ranije se u ovom slučaju oporavak NIKAD ne bi desio: ' + log.join(','));
  assert.ok(log.includes('qr') && log.includes('sifra') && log.includes('bedz'));
});

await t('oporavak ne čeka vlake KOLEGA (dugo mrežno učitavanje), ali ide POSLIJE vlastitih vlaka', async () => {
  let pusti;
  const { api, log } = makeInit({ kolege: () => new Promise(r => { pusti = r; }) });
  const p = api.sbInitData();
  await new Promise(r => setImmediate(r));
  assert.ok(log.includes('oporavak'), 'oporavak već prošao dok kolege još traju');
  assert.ok(log.indexOf('vlake') < log.indexOf('oporavak'), 'oporavak se oslanja na učitane vlake');
  pusti(); await p;
  assert.strictEqual(log.filter(x => x === 'oporavak').length, 1, 'samo jednom');
});

console.log('\nService worker — pokretanje app-a na mreži koja ne odgovara:');
function makeSW({ kes, mreza }) {
  const handlers = {};
  const self = { addEventListener: (ev, fn) => { handlers[ev] = fn; }, location: { origin: 'https://app.test' },
                 clients: {}, registration: {} };
  const caches = {
    match: async () => kes,
    open: async () => ({ put: async () => {}, match: async () => kes }),
  };
  const g = { self, caches, fetch: mreza, setTimeout: (fn) => { setImmediate(fn); return 1; }, Request };
  const k = Object.keys(g);
  new Function(...k, SW)(...k.map(x => g[x]));
  return (url) => new Promise((res, rej) => {
    let odgovor = null;
    handlers.fetch({ request: { url, mode: 'same-origin' },
      respondWith: (p) => { odgovor = p; p.then(res, rej); }, waitUntil: () => {} });
    if (!odgovor) rej(new Error('SW nije odgovorio'));
  });
}

await t('mreža visi, keš ima kopiju → služi se keš (ne čeka browser da odustane)', async () => {
  const kes = new Response('iz-kesa');
  const odgovori = makeSW({ kes, mreza: () => new Promise(() => {}) });
  const r = await odgovori('https://app.test/index.html');
  assert.strictEqual(await r.text(), 'iz-kesa');
});

await t('mreža odgovori na vrijeme → nova verzija (update i dalje stiže)', async () => {
  const odgovori = makeSW({ kes: new Response('stara'), mreza: async () => new Response('nova', { status: 200 }) });
  const r = await odgovori('https://app.test/index.html');
  assert.strictEqual(await r.text(), 'nova');
});

await t('nema keša (prvo pokretanje) → čeka mrežu, ne vraća prazno', async () => {
  const odgovori = makeSW({ kes: undefined, mreza: () => new Promise(r => setTimeout(() => r(new Response('mreza')), 20)) });
  const r = await odgovori('https://app.test/index.html');
  assert.strictEqual(await r.text(), 'mreza');
});

console.log('\nOsvježavanje vlaka na prekinutoj vezi:');
function makeVlakeLoader(odgovor) {
  const primjene = [], citanja = [];
  const lokalne = [{ id: 'v1', pts: [{ la: 44, lo: 16 }] }];
  const g = {
    isReadOnly: () => false, sbUser: { id: 'u1' }, sbProfile: { sumarija: 'S' },
    localStorage: { getItem: () => 'u1', setItem() {}, removeItem() {} },
    LOCAL_VLAKE_KEY: 'vlake',
    _loadLocalVlake: () => { citanja.push('lokalne'); return lokalne; },
    _applyVlakeRows: rows => primjene.push(rows),
    _OL: { VLAKE: 'kes', save() {}, load: () => { citanja.push('kes'); return lokalne; } },
    sb: { from: () => { const q = { select: () => q, eq: () => q,
      then: (ok, fail) => Promise.resolve().then(odgovor).then(ok, fail) }; return q; } },
  };
  const api = new Function(...Object.keys(g), extractFn('sbLoadVlake') + ';return sbLoadVlake;')(...Object.values(g));
  return { api, primjene, citanja };
}
await t('pozadinski tok poziva osvježavanje bez ponovnog lokalnog restore-a', async () => {
  const pozivi = [];
  const g = {
    sbUser: { id: 'u1' }, sbProfile: {}, _mrezaProbaj: () => true,
    sbLoadProjekti: async () => {}, sbLoadVlake: async arg => pozivi.push(arg),
    sbLoadLog: async () => {}, autoLoadAllKmlBuckets() {}, sbLoadSharedFotos() {}, sbLoadKolegeVlake() {},
  };
  const fn = new Function(...Object.keys(g), 'let _coreReloadBusy = false;\n' +
    extractFn('_reloadCoreData') + ';return _reloadCoreData;')(...Object.values(g));
  await fn();
  assert.deepStrictEqual(pozivi, [true]);
});
await t('pozadinski neuspjeh ne parsira keš i ne precrtava postojeće vlake', async () => {
  const h = makeVlakeLoader(() => ({ error: { message: 'Failed to fetch' } }));
  await h.api(true); await h.api(true);
  assert.deepStrictEqual(h.citanja, []);
  assert.deepStrictEqual(h.primjene, []);
});
await t('bačena mrežna greška također čuva postojeći prikaz', async () => {
  const h = makeVlakeLoader(() => { throw new TypeError('Failed to fetch'); });
  await h.api(true);
  assert.deepStrictEqual(h.primjene, []);
});
await t('prvi offline ulazak i dalje učitava lokalne vlake', async () => {
  const h = makeVlakeLoader(() => ({ error: { message: 'Failed to fetch' } }));
  await h.api();
  assert.ok(h.citanja.includes('lokalne') && h.primjene.length > 0);
});
await t('uspješno osvježavanje primjenjuje nove serverske podatke', async () => {
  const rows = [{ id: 'v2', pts: [] }];
  const h = makeVlakeLoader(() => ({ data: rows, error: null }));
  await h.api(true);
  assert.deepStrictEqual(h.primjene, [rows]);
  assert.deepStrictEqual(h.citanja, []);
});

console.log('\nInvarijante nad kodom:');
await t('nijedna pozadinska grana više ne odlučuje SAMO po navigator.onLine', () => {
  // Ove funkcije su se pokretale same (tajmer, povratak u app, GPS tačka) i na
  // mrtvoj vezi visile do roka — moraju ići kroz izmjereno stanje.
  for (const fn of ['_reloadCoreData', '_provjeriOpozivOdobrenja', '_adminSchedPendingCheck', '_dozSchedCatchup']) {
    assert.ok(/_mrezaProbaj\(/.test(extractFn(fn)), fn + ' mora pitati _mrezaProbaj');
  }
});
await t('profil terena bez mreže koristi preuzeti model terena (nema ranog izlaza)', () => {
  assert.ok(!/if \(!navigator\.onLine\) \{ showToast\('Nema GPS visina/.test(HTML));
});

console.log('\n' + pass + ' prošlo, ' + fail + ' palo');
process.exit(fail ? 1 : 0);
})();

