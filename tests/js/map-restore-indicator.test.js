// =====================================================================
// Testovi za indikator "Učitavam kartu…" pri pokretanju (v1.1.3).
// Pokretanje:  node tests/js/map-restore-indicator.test.js
// ---------------------------------------------------------------------
// Zašto ovo postoji: terenska prijava "kao da u pozadini provjerava vezu
// desetak sekundi gdje ne mogu kliknuti ni na jedno dugme niti se karta
// učita... i onda nakon desetak sekundi radi bez usporavanja". Kroz
// AskUserQuestion potvrđeno: APK, ISTO područje kao uvijek (dakle ne
// mrežni tile-cache miss), a podloga je PREUZETA OFFLINE karta (SQLite/
// MBTiles) — što isključuje `makeCachedTileLayer`-ov mrežni put i upire na
// `_restoreLastMap`: kad je zadnja aktivna karta bila SQLite, taj IIFE
// NAMJERNO ne stavlja NIJEDAN tile sloj (da ne trepne pogrešna podloga) i
// računa da će `sqlmapRestoreAll()` postaviti pravi sloj — a taj korak čita
// lokalni fajl od stotine MB iz IndexedDB/OPFS, što na terenskom uređaju
// zna trajati oko deset sekundi. Do sada je ta praznina bila POTPUNO NIJEMA:
// karta prazna, bez ijednog znaka da nešto RADI — izgleda identično kao da
// je app zamrznuta. Ostatak UI-ja (dugmad, paneli) ostaje uredno responzivan
// jer JS glavna nit nije blokirana — samo se korisniku čini suprotno kad
// jedino što gleda (karta) ništa ne pokazuje deset sekundi.
//
// Rješenje NE mijenja brzinu učitavanja (to je inherentno veličini fajla) —
// samo dodaje vidljiv "Učitavam kartu…" indikator dok traje, tačno u istom
// prozoru u kojem je karta ranije bila nijemo prazna.
//
// Testira se STVARNI kod izvučen iz index.html.
// =====================================================================
'use strict';
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const HTML = fs.readFileSync(path.join(__dirname, '../../index.html'), 'utf8');

// `sqlmapRestoreAll` je `async function` (koristi `await`) — mora ostati
// "async function ..." u izvučenom tekstu, inače `await` unutra puca kao
// SyntaxError ("Unexpected identifier") jer nije više unutar async funkcije.
function extractFn(name) {
  let start = HTML.indexOf('async function ' + name + '(');
  if (start < 0) start = HTML.indexOf('function ' + name + '(');
  assert.ok(start >= 0, 'nije nađena funkcija ' + name + ' u index.html');
  let i = HTML.indexOf('{', start), depth = 0;
  for (; i < HTML.length; i++) {
    if (HTML[i] === '{') depth++;
    else if (HTML[i] === '}') { depth--; if (depth === 0) return HTML.slice(start, i + 1); }
  }
  throw new Error('nezatvorena funkcija ' + name);
}

const SRC_SHOW = extractFn('_mapRestoreIndicatorShow');
const SRC_HIDE = extractFn('_mapRestoreIndicatorHide');
const SRC_RESTORE_ALL = extractFn('sqlmapRestoreAll');

// Lažni <div id="map-restore-indicator"> — samo classList treba.
function makeFakeIndicatorEl() {
  const classes = new Set();
  return {
    classList: {
      add: c => classes.add(c),
      remove: c => classes.delete(c),
      contains: c => classes.has(c)
    },
    _classes: classes
  };
}

let pass = 0, fail = 0;
// `t` MORA čekati async testove — nekoliko testova ispod poziva sqlmapRestoreAll
// (async funkcija). Sinhron t() bi upisao "prošlo" PRIJE nego se tijelo uopšte
// izvrši, a bačena greška bi pobjegla kao unhandled rejection umjesto da je
// try/catch uhvati.
async function t(name, fn) {
  try { await fn(); pass++; console.log('  ✔ ' + name); }
  catch (e) { fail++; console.log('  ✘ ' + name + '\n      ' + e.message); }
}

async function main() {

console.log('_mapRestoreIndicatorShow/Hide — osnovno ponašanje:');

await t('show() dodaje "show" klasu, hide() je uklanja', () => {
  const el = makeFakeIndicatorEl();
  const sandbox = {
    document: { getElementById: id => (id === 'map-restore-indicator' ? el : null) },
    performance: { now: () => 0 },
    _mapLoadDiagStart: () => {}
  };
  const keys = Object.keys(sandbox);
  const api = new Function(...keys, SRC_SHOW + '\n' + SRC_HIDE +
    '\nreturn { _mapRestoreIndicatorShow, _mapRestoreIndicatorHide };')(...keys.map(k => sandbox[k]));
  assert.strictEqual(el.classList.contains('show'), false);
  api._mapRestoreIndicatorShow();
  assert.strictEqual(el.classList.contains('show'), true);
  api._mapRestoreIndicatorHide();
  assert.strictEqual(el.classList.contains('show'), false);
});

await t('nedostajući element (DOM još nije isparsiran) ne baca', () => {
  const sandbox = {
    document: { getElementById: () => null },
    performance: { now: () => 0 },
    _mapLoadDiagStart: () => {}
  };
  const keys = Object.keys(sandbox);
  const api = new Function(...keys, SRC_SHOW + '\n' + SRC_HIDE +
    '\nreturn { _mapRestoreIndicatorShow, _mapRestoreIndicatorHide };')(...keys.map(k => sandbox[k]));
  assert.doesNotThrow(() => api._mapRestoreIndicatorShow());
  assert.doesNotThrow(() => api._mapRestoreIndicatorHide());
});

// ── sqlmapRestoreAll — indikator se MORA skloniti na SVAKOM izlazu ─────────
console.log('\nsqlmapRestoreAll — indikator se sklanja na SVAKOM izlazu iz funkcije:');

function makeRestoreEnv(opts) {
  const o = opts || {};
  const el = makeFakeIndicatorEl();
  el.classList.add('show');   // simulira stanje koje je _restoreLastMap ostavio
  const calls = { ensureBase: [], warn: [], status: [], diag: [] };
  // Podrazumijevano performance.now() koje raste dovoljno malo da sve ostane ISPOD
  // 1.5s praga (brz slučaj) — testovi za spori slučaj eksplicitno daju svoj `perf`.
  const sandbox = {
    document: { getElementById: id => (id === 'map-restore-indicator' ? el : null) },
    console: { warn: (...a) => calls.warn.push(a) },
    localStorage: o.localStorage || { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    performance: o.perf || { now: () => 0 },
    _SQL_CRASH_KEY: 'tvlake_sql_crash',
    _sqlCrashCheck: o.crashCheck || (async () => false),
    _sqlRestoreFailed: [],
    _sqlWCall: o.wCall || (async () => ({ ok: true, rows: [] })),
    _sqlSkipList: () => [],
    _sqlLayers: [],
    _sqlmapCreateLayerW: o.layerFactory || (() => ({ addTo: () => {}, redraw: () => {} })),
    map: { hasLayer: () => false, removeLayer: () => {} },
    TL: {},
    _saveLastMap: () => {},
    _sqlmapRenderLayers: () => {},
    _lsRenderSqlite: () => {},
    _sqlPrewarm: () => {},
    _sqlFailKey: name => 'fail_' + name,
    _sqlEnsureBaseLayer: n => calls.ensureBase.push(n),
    _sqlmapStatus: msg => calls.status.push(msg),
    _mapLoadDiagStep: (label, detail) => calls.diag.push({ label, detail }),
    _mapLoadDiagName: () => {},
    _mapLoadDiagFinish: state => { calls.diagState = state; },
    // v1.1.7: eksplicitno postavljeno (default null = "indikator nikad prikazan
    // u ovom testu"), NE oslanjati se na implicitni global koji bi sloppy-mode
    // dodjela u _mapRestoreIndicatorShow ostavila iza sebe — to bi zavisilo od
    // REDOSLIJEDA testova u ovom fajlu, što je tiho i lažno "prošlo" u prvoj
    // verziji ovog testa prije nego je ovo eksplicitno ožičeno.
    _mapRestoreIndicatorShownAt: o.shownAt !== undefined ? o.shownAt : null,
    // _mapRestoreIndicatorHide se izvlači STVARAN (ne stub) — test provjerava
    // da ga sqlmapRestoreAll STVARNO pozove, ne samo da postoji.
  };
  const src = SRC_HIDE + '\n' + SRC_RESTORE_ALL;
  const keys = Object.keys(sandbox);
  const api = new Function(...keys, src + '\nreturn { sqlmapRestoreAll };')(...keys.map(k => sandbox[k]));
  return { run: api.sqlmapRestoreAll, el, calls };
}

// performance.now() koje raste za `stepMs` pri SVAKOM pozivu — simulira sporo
// učitavanje bez STVARNOG čekanja u testu (nijedan pravi setTimeout/sleep).
function makeSlowPerf(stepMs) {
  let n = 0;
  return { now: () => (n += stepMs) };
}

await t('rani izlaz preko _sqlCrashCheck (crash detektovan) → indikator se skloni', async () => {
  const env = makeRestoreEnv({ crashCheck: async () => true });
  await env.run();
  assert.strictEqual(env.el.classList.contains('show'), false);
});

await t('_sqlWCall javi neuspjeh (worker pao) → indikator se skloni', async () => {
  const env = makeRestoreEnv({ wCall: async () => ({ ok: false, rows: null }) });
  await env.run();
  assert.strictEqual(env.el.classList.contains('show'), false);
  assert.deepStrictEqual(env.calls.ensureBase, [1]);
});

await t('nema sačuvanih karata (prazan popis) → indikator se skloni', async () => {
  const env = makeRestoreEnv({ wCall: async () => ({ ok: true, rows: [] }) });
  await env.run();
  assert.strictEqual(env.el.classList.contains('show'), false);
  assert.deepStrictEqual(env.calls.ensureBase, [0]);
});

await t('_sqlWCall baci grešku (neuhvaćen izuzetak) → indikator se SVEJEDNO skloni', async () => {
  const env = makeRestoreEnv({ wCall: async () => { throw new Error('worker crash'); } });
  await env.run();
  assert.strictEqual(env.el.classList.contains('show'), false, 'finally mora opaliti i kad try-blok baci');
});

await t('uspješno učitavanje jedne karte → indikator se skloni na kraju', async () => {
  const env = makeRestoreEnv({
    wCall: async (msg) => {
      if (msg.type === 'list') return { ok: true, rows: [{ name: 'moja_karta', savedAt: 1, opfs: false }] };
      if (msg.type === 'load-idb') return { ok: true, fmt: 'mbtiles', meta: {} };
      return { ok: false };
    }
  });
  await env.run();
  assert.strictEqual(env.el.classList.contains('show'), false);
});

await t('zadnja OPFS karta postaje vidljiva PRIJE sporog IndexedDB list poziva', async () => {
  let pustiListu;
  const lista = new Promise(resolve => { pustiListu = resolve; });
  const sloj = { addToCalled:false, redrawCalled:false,
    addTo(){ this.addToCalled = true; }, redraw(){ this.redrawCalled = true; } };
  const env = makeRestoreEnv({
    localStorage: {
      getItem: k => k === 'tvlake_last_map' ? JSON.stringify({ type:'sqlite', sqlId:'UNSKO' }) : null,
      setItem: () => {}, removeItem: () => {}
    },
    layerFactory: () => sloj,
    wCall: async msg => {
      if (msg.type === 'load-opfs') return { ok:true, fmt:'rmaps', meta:{} };
      if (msg.type === 'list') return lista;
      return { ok:false };
    }
  });
  const zavrsetak = env.run();
  await Promise.resolve(); await Promise.resolve();
  assert.strictEqual(sloj.addToCalled, true, 'OPFS sloj mora biti dodat bez čekanja liste');
  assert.strictEqual(env.el.classList.contains('show'), false, 'indikator se mora skloniti čim je aktivna karta vidljiva');
  pustiListu({ ok:true, rows:[{ name:'UNSKO', savedAt:1, opfs:true, opfsName:'UNSKO.sqlmap' }] });
  await zavrsetak;
});

await t('neuspjeli brzi OPFS put ostavlja jasan debug i zatim bilježi fallback', async () => {
  const env = makeRestoreEnv({
    localStorage: {
      getItem: k => k === 'tvlake_last_map' ? JSON.stringify({ type:'sqlite', sqlId:'UNSKO' }) : null,
      setItem: () => {}, removeItem: () => {}
    },
    wCall: async msg => {
      if (msg.type === 'load-opfs' && msg.path === '/UNSKO.sqlmap') return { ok:false, error:'not-found' };
      if (msg.type === 'list') return { ok:true, rows:[{ name:'UNSKO', savedAt:1, opfs:false }] };
      if (msg.type === 'load-idb') return { ok:true, fmt:'mbtiles', meta:{} };
      return { ok:false };
    }
  });
  await env.run();
  const labels = env.calls.diag.map(d => d.label);
  assert.ok(labels.includes('brzi OPFS nije uspio'), 'debug mora objasniti zašto brzi put nije sakrio indikator');
  assert.ok(labels.includes('IndexedDB popis'), 'debug mora izmjeriti spori popis');
  assert.ok(labels.includes('karta otvorena'), 'debug mora potvrditi fallback otvaranje');
});

// ── v1.1.6: raščlana dijagnostika trajanja ─────────────────────────────────
console.log('\nsqlmapRestoreAll — dijagnostika trajanja (v1.1.6):');

await t('sporo učitavanje (>1.5s ukupno) upisuje raščlanu po koracima u _sqlmapStatus', async () => {
  const env = makeRestoreEnv({
    perf: makeSlowPerf(1000),   // svaki performance.now() poziv +1000ms → lako pređe 1.5s prag
    wCall: async (msg) => {
      if (msg.type === 'list') return { ok: true, rows: [{ name: 'karta1', savedAt: 1, opfs: true, opfsName: 'karta1.sqlmap' }] };
      if (msg.type === 'load-opfs') return { ok: true, fmt: 'mbtiles', meta: {} };
      return { ok: false };
    }
  });
  await env.run();
  assert.strictEqual(env.calls.status.length, 1, 'mora upisati TAČNO jedan status red kad je sporo');
  const msg = env.calls.status[0];
  assert.ok(/^⏱/.test(msg), 'poruka mora biti prepoznatljiva (⏱ prefiks)');
  assert.ok(msg.includes('list'), 'raščlana mora imenovati "list" korak');
  assert.ok(msg.includes('load-opfs'), 'raščlana mora imenovati "load-opfs" korak (ne load-idb za OPFS kartu)');
  assert.ok(msg.includes('karta1'), 'raščlana mora imenovati KOJA karta je spora, ne samo tip koraka');
});

await t('brzo učitavanje (<1.5s) NE piše ništa u _sqlmapStatus — bez šuma na normalan restart', async () => {
  const env = makeRestoreEnv({
    perf: { now: () => 0 },   // svaki poziv vraća 0 → ukupno trajanje uvijek 0ms
    wCall: async (msg) => {
      if (msg.type === 'list') return { ok: true, rows: [{ name: 'karta1', savedAt: 1, opfs: false }] };
      if (msg.type === 'load-idb') return { ok: true, fmt: 'mbtiles', meta: {} };
      return { ok: false };
    }
  });
  await env.run();
  assert.strictEqual(env.calls.status.length, 0, 'normalan (brz) restart ne smije ništa upisati u status liniju');
});

await t('rani izlaz (nema sačuvanih karata) uz vještački spor performance.now() i dalje javlja bez pucanja', async () => {
  const env = makeRestoreEnv({
    perf: makeSlowPerf(1000),
    wCall: async () => ({ ok: true, rows: [] })
  });
  await assert.doesNotReject(() => env.run());
  assert.strictEqual(env.calls.status.length, 1);
  // 'list' korak se izvrši i kod ranog izlaza (samo je rows[] prazan) — poruka
  // mora bar imenovati taj korak, ne prazninu.
  assert.ok(env.calls.status[0].includes('list'), 'i rani izlaz mora prikazati bar list() korak');
});

// ── v1.1.7: razmak PRIJE poziva (auth/startup gate), ne samo unutar funkcije ──
console.log('\nsqlmapRestoreAll — razmak PRIJE poziva se mjeri odvojeno (v1.1.7):');

await t('funkcija SAMA je brza, ali indikator je bio prikazan davno prije → ipak javlja (korisnik TO vidi)', async () => {
  // _mapRestoreIndicatorShownAt = 0 (indikator prikazan "na početku vremena").
  // Kad sqlmapRestoreAll konačno POČNE, performance.now() je već na 9000 —
  // dakle 9s je prošlo PRIJE nego je ova funkcija uopšte pozvana (npr. auth
  // gate). Unutar funkcije svaki poziv raste za samo +10ms → _tTot ostaje mali.
  let n = 9000;
  const env = makeRestoreEnv({
    shownAt: 0,
    perf: { now: () => (n += 10) },
    wCall: async (msg) => {
      if (msg.type === 'list') return { ok: true, rows: [{ name: 'karta1', savedAt: 1, opfs: true, opfsName: 'karta1.sqlmap' }] };
      if (msg.type === 'load-opfs') return { ok: true, fmt: 'mbtiles', meta: {} };
      return { ok: false };
    }
  });
  await env.run();
  assert.strictEqual(env.calls.status.length, 1, 'razmak PRIJE poziva sam po sebi mora okinuti dijagnostiku');
  const msg = env.calls.status[0];
  assert.ok(msg.includes('PRIJE poziva'), 'poruka mora eksplicitno reći da je kašnjenje PRIJE ulaska u funkciju, ne unutar SQLite čitanja');
  assert.ok(/9\.\ds/.test(msg) || msg.includes('9.0s') || /9\.\d/.test(msg), 'ukupno vrijeme koje korisnik vidi (od prikaza indikatora) mora biti ~9s, ne par stotina ms');
});

await t('gap i interno vrijeme približno isti (nema auth kašnjenja) → BEZ "PRIJE poziva" napomene', async () => {
  // shownAt postavljen TAČNO na _tR0 (indikator prikazan odmah prije poziva) —
  // razlika između _tOdPrikaza i _tTot je ~0, ispod 200ms praga za napomenu.
  const env = makeRestoreEnv({
    shownAt: null,   // isti slučaj kao postojeći "sporo učitavanje" test — nema auth gap podatka
    perf: makeSlowPerf(1000),
    wCall: async (msg) => {
      if (msg.type === 'list') return { ok: true, rows: [{ name: 'karta1', savedAt: 1, opfs: true, opfsName: 'karta1.sqlmap' }] };
      if (msg.type === 'load-opfs') return { ok: true, fmt: 'mbtiles', meta: {} };
      return { ok: false };
    }
  });
  await env.run();
  assert.strictEqual(env.calls.status.length, 1);
  assert.ok(!env.calls.status[0].includes('PRIJE poziva'), 'bez podatka o prikazu indikatora ne smije se izmišljati "kašnjenje prije poziva"');
});

console.log('\n' + pass + ' prošlo, ' + fail + ' palo');
process.exit(fail ? 1 : 0);
}

main();
