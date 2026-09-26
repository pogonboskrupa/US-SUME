// =====================================================================
// Testovi za razdvajanje IndexedDB skladišta offline SQLite/MBTiles karata
// na 'maps' (samo metapodaci) i 'mapBufs' (samo buffer), v1.1.5.
// Pokretanje:  node tests/js/sqlmap-idb-split.test.js
// ---------------------------------------------------------------------
// Zašto ovo postoji: terenska prijava "opet stoji učitavam kartu desetak
// sekundi" poslije v1.1.3 (koje je samo dodalo VIDLJIV indikator za tu
// prazninu, ne skratilo je). Uzrok: `list` (worker poruka koja se šalje na
// SVAKOM pokretanju app-a, PRIJE nego se zna koja će se karta prikazati)
// iterira IndexedDB `maps` store preko `openCursor()` da pokupi par sitnih
// polja (ime/format/veličina) za listu sačuvanih karata. IndexedDB API
// prisiljava deserijalizaciju CIJELOG zapisa po kursoru — a stariji
// (ne-OPFS) zapisi su buffer od stotine MB držali UNUTAR ISTOG zapisa kao ta
// metapolja. Rezultat: `list` mora strukturno klonirati stotine MB na SVAKOM
// pokretanju, bez obzira koja se karta na kraju prikaže — otud dosljedna
// desetosekundna pauza.
//
// Rješenje: buffer ide u ZASEBAN 'mapBufs' object store (keyPath 'name'),
// 'maps' nosi SAMO metapodatke. DB verzija 1→2, sa `onupgradeneeded`
// migracijom koja postojeće inline buffere premjesti u 'mapBufs' i ukloni ih
// iz 'maps' zapisa — transakciono sigurno (ista versionchange transakcija
// vidi i staru i novu strukturu), ne briše ništa, samo premjesti.
//
// Testira se STVARNI kod izvučen iz index.html (idbOpen worker-side,
// _sqlIdbOpen/_sqlIdbDeleteDirect main-thread, i inline poruke idb-rename/
// idb-delete/load-buf/load-idb iz _SQL_WORKER_SRC), nad RUČNO NAPRAVLJENOM
// (ali API-kompatibilnom) fake IndexedDB implementacijom — Node nema
// IndexedDB, a ovo je jedini način da se testira STVARNA migraciona logika,
// ne prepisana kopija.
// =====================================================================
'use strict';
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const HTML = fs.readFileSync(path.join(__dirname, '../../index.html'), 'utf8');

// NAPOMENA: mora zadržati "async" prefiks u izvučenom tekstu ako postoji —
// _sqlIdbDeleteDirect je async function; ranija verzija ovog helpera je
// tražila poziciju "function" unutar match-a i time ODSJEKLA "async " ispred,
// pa je `await` unutra pucao kao SyntaxError (ista zamka dokumentovana u
// map-restore-indicator.test.js za sqlmapRestoreAll).
function extractFn(name) {
  let start = HTML.indexOf('async function ' + name + '(');
  if (start < 0) start = HTML.search(new RegExp('^\\s*function\\s+' + name + '\\s*\\(', 'm'));
  if (start < 0) throw new Error('nije nađena funkcija ' + name + ' u index.html');
  // ako je regex fallback pogodio unutar wrap-a, pomjeri na stvarni "function" token
  if (HTML.slice(start, start + 8) !== 'function' && HTML.slice(start, start + 5) !== 'async') {
    start = HTML.indexOf('function', start);
  }
  let i = HTML.indexOf('{', start), depth = 0;
  for (; i < HTML.length; i++) {
    if (HTML[i] === '{') depth++;
    else if (HTML[i] === '}') { depth--; if (depth === 0) return HTML.slice(start, i + 1); }
  }
  throw new Error('nezatvorena funkcija ' + name);
}

// Izvlači tijelo `else if (msg.type === '<type>') { ... }` bloka iz worker
// izvora (samo tijelo, bez "else if (...) {" zaglavlja ni zatvarajuće "}").
function extractCase(type) {
  const marker = "msg.type === '" + type + "') {";
  const mi = HTML.indexOf(marker);
  assert.ok(mi >= 0, 'nije nađen case za ' + type);
  const braceStart = mi + marker.length - 1; // pozicija '{'
  let depth = 0, i = braceStart;
  for (; i < HTML.length; i++) {
    if (HTML[i] === '{') depth++;
    else if (HTML[i] === '}') { depth--; if (depth === 0) break; }
  }
  return HTML.slice(braceStart + 1, i);
}

const SRC_IDBOPEN_WORKER = extractFn('idbOpen');
const SRC_SQLIDBOPEN_MAIN = extractFn('_sqlIdbOpen');
const SRC_SQLIDBDELETEDIRECT = extractFn('_sqlIdbDeleteDirect');
const BODY_IDB_RENAME = extractCase('idb-rename');
const BODY_IDB_DELETE = extractCase('idb-delete');
const BODY_LOAD_BUF = extractCase('load-buf');
const BODY_LOAD_IDB = extractCase('load-idb');

// ── Fake IndexedDB — dovoljno API-kompatibilna da izvučeni kod radi ────────
// Namjerno ASINHRONA (mikrozadaci + setTimeout(0) za tx.oncomplete) — testira
// se STVARNI redoslijed poziva (onsuccess se kači POSLIJE poziva metode, kao
// u pravom IndexedDB-u), ne sinhrona prečica koja bi sakrila greške u
// redoslijedu (npr. da je onsuccess dodijeljen prekasno).
function makeFakeIndexedDB() {
  const databases = new Map(); // name -> { version, db }

  class FakeStoreData {
    constructor(keyPath) { this.keyPath = keyPath; this.data = new Map(); }
  }
  class FakeRequest {
    constructor() { this.onsuccess = null; this.onerror = null; this.result = undefined; this.error = undefined; }
  }
  class FakeObjectStore {
    constructor(sd, tx) { this._sd = sd; this._tx = tx; }
    _wrap(fn) {
      const req = new FakeRequest();
      this._tx._inc();
      Promise.resolve().then(() => {
        try {
          const result = fn();
          req.result = result;
          if (req.onsuccess) req.onsuccess({ target: req });
        } catch (e) {
          req.error = e;
          if (req.onerror) req.onerror({ target: req });
        }
        this._tx._dec();
      });
      return req;
    }
    get(key) { return this._wrap(() => this._sd.data.has(key) ? this._sd.data.get(key) : undefined); }
    put(value) { return this._wrap(() => { const k = value[this._sd.keyPath]; this._sd.data.set(k, value); return k; }); }
    delete(key) { return this._wrap(() => { this._sd.data.delete(key); return undefined; }); }
    openCursor() {
      const req = new FakeRequest();
      const keys = Array.from(this._sd.data.keys());
      let idx = 0;
      const sd = this._sd, tx = this._tx;
      tx._inc();
      const step = () => {
        Promise.resolve().then(() => {
          if (idx >= keys.length) {
            req.result = null;
            if (req.onsuccess) req.onsuccess({ target: req });
            tx._dec();
            return;
          }
          const key = keys[idx];
          const cursor = {
            get value() { return sd.data.get(key); },
            update(v) { sd.data.set(key, v); },
            continue() { idx++; step(); }
          };
          req.result = cursor;
          if (req.onsuccess) req.onsuccess({ target: req });
        });
      };
      step();
      return req;
    }
  }
  class FakeTransaction {
    constructor(db) {
      this._db = db; this.oncomplete = null; this.onerror = null;
      this._pending = 0; this._done = false;
    }
    objectStore(name) {
      const sd = this._db._stores.get(name);
      if (!sd) throw new Error('no such store: ' + name);
      return new FakeObjectStore(sd, this);
    }
    _inc() { this._pending++; }
    _dec() {
      this._pending--;
      if (this._pending === 0) {
        setTimeout(() => {
          if (this._pending === 0 && !this._done) { this._done = true; if (this.oncomplete) this.oncomplete(); }
        }, 0);
      }
    }
  }
  class FakeDB {
    constructor(name, version) { this.name = name; this.version = version; this._stores = new Map(); }
    get objectStoreNames() {
      const names = Array.from(this._stores.keys());
      return { contains: n => names.includes(n) };
    }
    createObjectStore(name, opts) {
      const sd = new FakeStoreData(opts && opts.keyPath);
      this._stores.set(name, sd);
      return new FakeObjectStore(sd, { _inc(){}, _dec(){} });
    }
    transaction(storeNames) { return new FakeTransaction(this); }
    close() {}
  }

  const indexedDB = {
    open(name, version) {
      const req = new FakeRequest();
      Promise.resolve().then(() => {
        const existing = databases.get(name);
        const oldVersion = existing ? existing.version : 0;
        const newVersion = version || oldVersion || 1;
        let db;
        if (existing) { db = existing.db; }
        else { db = new FakeDB(name, newVersion); databases.set(name, { version: newVersion, db }); }
        if (oldVersion < newVersion) {
          if (req.onupgradeneeded) {
            const upgradeTx = new FakeTransaction(db);
            req.onupgradeneeded({ oldVersion, newVersion, target: { result: db, transaction: upgradeTx } });
            const waitComplete = () => {
              if (upgradeTx._pending === 0) {
                databases.get(name).version = newVersion; db.version = newVersion;
                req.result = db;
                if (req.onsuccess) req.onsuccess({ target: req });
              } else setTimeout(waitComplete, 0);
            };
            setTimeout(waitComplete, 0);
            return;
          }
        }
        databases.get(name).version = newVersion; db.version = newVersion;
        req.result = db;
        if (req.onsuccess) req.onsuccess({ target: req });
      });
      return req;
    },
    deleteDatabase(name) {
      databases.delete(name);
      const req = new FakeRequest();
      Promise.resolve().then(() => { if (req.onsuccess) req.onsuccess({ target: req }); });
      return req;
    }
  };
  return indexedDB;
}

// Otvori v1 bazu SAMO sa 'maps' store-om (simulira staru app verziju, prije
// v1.1.5) i upiše zapise TAČNO onako kako ih je stari load-buf pisao — sa
// bufferom INLINE u istom zapisu.
function seedLegacyV1(indexedDB, dbName, entries) {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(dbName, 1);
    r.onupgradeneeded = e => { e.target.result.createObjectStore('maps', { keyPath: 'name' }); };
    r.onsuccess = async e => {
      const db = e.target.result;
      const tx = db.transaction('maps', 'readwrite');
      const st = tx.objectStore('maps');
      for (const entry of entries) st.put(entry);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    };
    r.onerror = () => reject(r.error);
  });
}

let pass = 0, fail = 0;
async function t(name, fn) {
  try { await fn(); pass++; console.log('  ✔ ' + name); }
  catch (e) { fail++; console.log('  ✘ ' + name + '\n      ' + (e.stack || e.message)); }
}

async function main() {

console.log('idbOpen (worker) — migracija v1 → v2:');

await t('svježa baza (nikad otvorena) dobija OBA store-a odmah', async () => {
  const indexedDB = makeFakeIndexedDB();
  const sandbox = { indexedDB };
  const keys = Object.keys(sandbox);
  const api = new Function(...keys, SRC_IDBOPEN_WORKER + '\nreturn { idbOpen };')(...keys.map(k => sandbox[k]));
  const db = await api.idbOpen();
  assert.strictEqual(db.objectStoreNames.contains('maps'), true);
  assert.strictEqual(db.objectStoreNames.contains('mapBufs'), true);
});

await t('postojeći v1 zapis sa inline bufferom → buffer premješten u mapBufs, maps ostaje bez buffera', async () => {
  const indexedDB = makeFakeIndexedDB();
  const buf = new ArrayBuffer(8);
  await seedLegacyV1(indexedDB, 'tvlake_sqlmaps', [
    { name: 'karta1', buffer: buf, fmt: 'mbtiles', meta: { minzoom: 1, maxzoom: 10 }, savedAt: 111, size: 8 }
  ]);
  const sandbox = { indexedDB };
  const keys = Object.keys(sandbox);
  const api = new Function(...keys, SRC_IDBOPEN_WORKER + '\nreturn { idbOpen };')(...keys.map(k => sandbox[k]));
  const db = await api.idbOpen();

  const mapsEntry = await new Promise((res,rej) => { const req = db.transaction('maps','readonly').objectStore('maps').get('karta1'); req.onsuccess=()=>res(req.result); req.onerror=()=>rej(req.error); });
  assert.ok(mapsEntry, 'zapis mora preživjeti migraciju');
  assert.strictEqual(mapsEntry.buffer, undefined, 'buffer NE SMIJE ostati u maps zapisu');
  assert.strictEqual(mapsEntry.fmt, 'mbtiles', 'ostala polja se ne diraju');
  assert.strictEqual(mapsEntry.savedAt, 111);
  assert.strictEqual(mapsEntry.size, 8);

  const bufEntry = await new Promise((res,rej) => { const req = db.transaction('mapBufs','readonly').objectStore('mapBufs').get('karta1'); req.onsuccess=()=>res(req.result); req.onerror=()=>rej(req.error); });
  assert.ok(bufEntry, 'buffer mora stići u mapBufs');
  assert.strictEqual(bufEntry.buffer, buf, 'ISTI buffer objekat, ne kopija/gubitak podataka');
});

await t('zapis BEZ buffera (OPFS karta) prolazi migraciju netaknut, mapBufs ostaje prazan za nju', async () => {
  const indexedDB = makeFakeIndexedDB();
  await seedLegacyV1(indexedDB, 'tvlake_sqlmaps', [
    { name: 'opfs_karta', opfs: true, opfsName: 'x.mbtiles', fmt: 'mbtiles', meta: {}, savedAt: 222, size: 999 }
  ]);
  const sandbox = { indexedDB };
  const keys = Object.keys(sandbox);
  const api = new Function(...keys, SRC_IDBOPEN_WORKER + '\nreturn { idbOpen };')(...keys.map(k => sandbox[k]));
  const db = await api.idbOpen();

  const mapsEntry = await new Promise((res,rej) => { const req = db.transaction('maps','readonly').objectStore('maps').get('opfs_karta'); req.onsuccess=()=>res(req.result); req.onerror=()=>rej(req.error); });
  assert.strictEqual(mapsEntry.opfs, true);
  assert.strictEqual(mapsEntry.opfsName, 'x.mbtiles');

  const bufEntry = await new Promise((res,rej) => { const req = db.transaction('mapBufs','readonly').objectStore('mapBufs').get('opfs_karta'); req.onsuccess=()=>res(req.result); req.onerror=()=>rej(req.error); });
  assert.strictEqual(bufEntry, undefined, 'OPFS karta nikad nije imala buffer u IDB-u — mapBufs za nju ostaje prazan');
});

await t('više zapisa (mješavina OPFS i inline-buffer) — migracija ne miješa ih međusobno', async () => {
  const indexedDB = makeFakeIndexedDB();
  const bufA = new ArrayBuffer(4), bufB = new ArrayBuffer(4);
  await seedLegacyV1(indexedDB, 'tvlake_sqlmaps', [
    { name: 'a', buffer: bufA, fmt: 'mbtiles', meta: {}, savedAt: 1, size: 4 },
    { name: 'b', opfs: true, opfsName: 'b.mbtiles', fmt: 'mbtiles', meta: {}, savedAt: 2, size: 100 },
    { name: 'c', buffer: bufB, fmt: 'gpkg', meta: {}, savedAt: 3, size: 4 },
  ]);
  const sandbox = { indexedDB };
  const keys = Object.keys(sandbox);
  const api = new Function(...keys, SRC_IDBOPEN_WORKER + '\nreturn { idbOpen };')(...keys.map(k => sandbox[k]));
  const db = await api.idbOpen();

  const getBuf = name => new Promise((res,rej) => { const req = db.transaction('mapBufs','readonly').objectStore('mapBufs').get(name); req.onsuccess=()=>res(req.result); req.onerror=()=>rej(req.error); });
  assert.strictEqual((await getBuf('a')).buffer, bufA);
  assert.strictEqual(await getBuf('b'), undefined);
  assert.strictEqual((await getBuf('c')).buffer, bufB);
});

await t('migracija je idempotentna — drugo otvaranje ne duplira niti kvari podatke', async () => {
  const indexedDB = makeFakeIndexedDB();
  const buf = new ArrayBuffer(8);
  await seedLegacyV1(indexedDB, 'tvlake_sqlmaps', [
    { name: 'karta1', buffer: buf, fmt: 'mbtiles', meta: {}, savedAt: 111, size: 8 }
  ]);
  const sandbox = { indexedDB };
  const keys = Object.keys(sandbox);
  const api = new Function(...keys, SRC_IDBOPEN_WORKER + '\nreturn { idbOpen };')(...keys.map(k => sandbox[k]));
  await api.idbOpen();          // prvo otvaranje — migrira
  const db2 = await api.idbOpen(); // drugo otvaranje — već v2, ne smije ponoviti migraciju

  const mapsEntry = await new Promise((res,rej) => { const req = db2.transaction('maps','readonly').objectStore('maps').get('karta1'); req.onsuccess=()=>res(req.result); req.onerror=()=>rej(req.error); });
  const bufEntry = await new Promise((res,rej) => { const req = db2.transaction('mapBufs','readonly').objectStore('mapBufs').get('karta1'); req.onsuccess=()=>res(req.result); req.onerror=()=>rej(req.error); });
  assert.strictEqual(mapsEntry.buffer, undefined);
  assert.strictEqual(bufEntry.buffer, buf);
});

console.log('\n_sqlIdbOpen (main-thread) — ista migracija:');

await t('main-thread verzija migrira isto kao worker verzija', async () => {
  const indexedDB = makeFakeIndexedDB();
  const buf = new ArrayBuffer(8);
  await seedLegacyV1(indexedDB, 'tvlake_sqlmaps', [
    { name: 'karta1', buffer: buf, fmt: 'mbtiles', meta: {}, savedAt: 1, size: 8 }
  ]);
  const sandbox = { indexedDB };
  const keys = Object.keys(sandbox);
  const api = new Function(...keys, SRC_SQLIDBOPEN_MAIN + '\nreturn { _sqlIdbOpen };')(...keys.map(k => sandbox[k]));
  const db = await api._sqlIdbOpen();
  const mapsEntry = await new Promise((res,rej) => { const req = db.transaction('maps','readonly').objectStore('maps').get('karta1'); req.onsuccess=()=>res(req.result); req.onerror=()=>rej(req.error); });
  const bufEntry = await new Promise((res,rej) => { const req = db.transaction('mapBufs','readonly').objectStore('mapBufs').get('karta1'); req.onsuccess=()=>res(req.result); req.onerror=()=>rej(req.error); });
  assert.strictEqual(mapsEntry.buffer, undefined);
  assert.strictEqual(bufEntry.buffer, buf);
});

console.log('\n_sqlIdbDeleteDirect — briše iz OBA store-a:');

await t('briše i maps i mapBufs zapis (npr. otkazano preuzimanje/overwrite pri importu)', async () => {
  const indexedDB = makeFakeIndexedDB();
  const buf = new ArrayBuffer(8);
  await seedLegacyV1(indexedDB, 'tvlake_sqlmaps', [
    { name: 'karta1', buffer: buf, fmt: 'mbtiles', meta: {}, savedAt: 1, size: 8 }
  ]);
  const sandbox = { indexedDB };
  const keys = Object.keys(sandbox);
  const api = new Function(...keys, SRC_SQLIDBOPEN_MAIN + '\n' + SRC_SQLIDBDELETEDIRECT +
    '\nreturn { _sqlIdbOpen, _sqlIdbDeleteDirect };')(...keys.map(k => sandbox[k]));
  await api._sqlIdbDeleteDirect('karta1'); // ovo samo po sebi otvara (i migrira) bazu
  const db = await api._sqlIdbOpen();
  const mapsEntry = await new Promise((res,rej) => { const req = db.transaction('maps','readonly').objectStore('maps').get('karta1'); req.onsuccess=()=>res(req.result); req.onerror=()=>rej(req.error); });
  const bufEntry = await new Promise((res,rej) => { const req = db.transaction('mapBufs','readonly').objectStore('mapBufs').get('karta1'); req.onsuccess=()=>res(req.result); req.onerror=()=>rej(req.error); });
  assert.strictEqual(mapsEntry, undefined, 'maps zapis mora nestati');
  assert.strictEqual(bufEntry, undefined, 'mapBufs zapis mora nestati (bez ovoga bi ostao osirotjeli buffer)');
});

await t('brisanje nepostojećeg imena ne baca', async () => {
  const indexedDB = makeFakeIndexedDB();
  const sandbox = { indexedDB };
  const keys = Object.keys(sandbox);
  const api = new Function(...keys, SRC_SQLIDBOPEN_MAIN + '\n' + SRC_SQLIDBDELETEDIRECT +
    '\nreturn { _sqlIdbDeleteDirect };')(...keys.map(k => sandbox[k]));
  await assert.doesNotReject(() => api._sqlIdbDeleteDirect('ne_postoji'));
});

console.log('\nPoruka idb-rename (worker) — preimenuje companion mapBufs zapis:');

function makeIdbRenameHarness(indexedDB) {
  const sandbox = {
    idbOpen: () => indexedDB.open ? new Promise((res,rej) => {
      // koristi PRAVI idbOpen (migracija uključena) — konzistentno sa ostatkom sistema
      const keys2 = ['indexedDB'];
      const inner = new Function(...keys2, SRC_IDBOPEN_WORKER + '\nreturn idbOpen();')(...keys2.map(k => ({indexedDB})[k]));
      inner.then(res, rej);
    }) : null,
    self: { postMessage: (m) => { sandbox._posted = m; } },
  };
  const keys = ['idbOpen', 'self'];
  const wrapped = 'async function run(msg, id) {\n' + BODY_IDB_RENAME + '\n}\nreturn { run };';
  const api = new Function(...keys, wrapped)(...keys.map(k => sandbox[k]));
  return { run: api.run, sandbox, indexedDB };
}

await t('preimenuje maps zapis I companion mapBufs zapis (ne-OPFS karta)', async () => {
  const indexedDB = makeFakeIndexedDB();
  const buf = new ArrayBuffer(8);
  await seedLegacyV1(indexedDB, 'tvlake_sqlmaps', [
    { name: 'stara', buffer: buf, fmt: 'mbtiles', meta: {}, savedAt: 1, size: 8 }
  ]);
  const h = makeIdbRenameHarness(indexedDB);
  await h.run({ old: 'stara', neu: 'nova' }, 1);
  assert.deepStrictEqual(h.sandbox._posted, { id: 1, ok: true });

  const keys2 = ['indexedDB'];
  const db = await new Function(...keys2, SRC_IDBOPEN_WORKER + '\nreturn idbOpen();')(...keys2.map(k => ({indexedDB})[k]));
  const mapsOld = await new Promise((res,rej) => { const req = db.transaction('maps','readonly').objectStore('maps').get('stara'); req.onsuccess=()=>res(req.result); req.onerror=()=>rej(req.error); });
  const mapsNew = await new Promise((res,rej) => { const req = db.transaction('maps','readonly').objectStore('maps').get('nova'); req.onsuccess=()=>res(req.result); req.onerror=()=>rej(req.error); });
  const bufOld = await new Promise((res,rej) => { const req = db.transaction('mapBufs','readonly').objectStore('mapBufs').get('stara'); req.onsuccess=()=>res(req.result); req.onerror=()=>rej(req.error); });
  const bufNew = await new Promise((res,rej) => { const req = db.transaction('mapBufs','readonly').objectStore('mapBufs').get('nova'); req.onsuccess=()=>res(req.result); req.onerror=()=>rej(req.error); });
  assert.strictEqual(mapsOld, undefined, 'stari maps ključ mora nestati');
  assert.ok(mapsNew, 'novi maps zapis mora postojati');
  assert.strictEqual(mapsNew.name, 'nova');
  assert.strictEqual(bufOld, undefined, 'stari mapBufs ključ mora nestati — inače osirotjeli buffer pod starim imenom');
  assert.ok(bufNew, 'buffer mora biti dostupan pod NOVIM imenom');
  assert.strictEqual(bufNew.buffer, buf);
});

await t('OPFS karta (nema mapBufs companion) — preimenovanje ne baca, ne izmišlja buffer zapis', async () => {
  const indexedDB = makeFakeIndexedDB();
  await seedLegacyV1(indexedDB, 'tvlake_sqlmaps', [
    { name: 'opfs_stara', opfs: true, opfsName: 'x.mbtiles', fmt: 'mbtiles', meta: {}, savedAt: 1, size: 999 }
  ]);
  const h = makeIdbRenameHarness(indexedDB);
  await h.run({ old: 'opfs_stara', neu: 'opfs_nova' }, 2);
  assert.deepStrictEqual(h.sandbox._posted, { id: 2, ok: true });

  const keys2 = ['indexedDB'];
  const db = await new Function(...keys2, SRC_IDBOPEN_WORKER + '\nreturn idbOpen();')(...keys2.map(k => ({indexedDB})[k]));
  const mapsNew = await new Promise((res,rej) => { const req = db.transaction('maps','readonly').objectStore('maps').get('opfs_nova'); req.onsuccess=()=>res(req.result); req.onerror=()=>rej(req.error); });
  const bufNew = await new Promise((res,rej) => { const req = db.transaction('mapBufs','readonly').objectStore('mapBufs').get('opfs_nova'); req.onsuccess=()=>res(req.result); req.onerror=()=>rej(req.error); });
  assert.ok(mapsNew);
  assert.strictEqual(mapsNew.opfs, true);
  assert.strictEqual(bufNew, undefined, 'OPFS karta ne smije dobiti izmišljen mapBufs zapis');
});

console.log('\nPoruka idb-delete (worker) — briše iz OBA store-a:');

await t('idb-delete briše maps I mapBufs zapis', async () => {
  const indexedDB = makeFakeIndexedDB();
  const buf = new ArrayBuffer(8);
  await seedLegacyV1(indexedDB, 'tvlake_sqlmaps', [
    { name: 'karta1', buffer: buf, fmt: 'mbtiles', meta: {}, savedAt: 1, size: 8 }
  ]);
  const sandbox = {
    idbOpen: () => { const keys2 = ['indexedDB']; return new Function(...keys2, SRC_IDBOPEN_WORKER + '\nreturn idbOpen();')(...keys2.map(k => ({indexedDB})[k])); },
    self: { postMessage: (m) => { sandbox._posted = m; } },
  };
  const keys = ['idbOpen', 'self'];
  const wrapped = 'async function run(msg, id) {\n' + BODY_IDB_DELETE + '\n}\nreturn { run };';
  const api = new Function(...keys, wrapped)(...keys.map(k => sandbox[k]));
  await api.run({ name: 'karta1' }, 3);
  assert.deepStrictEqual(sandbox._posted, { id: 3, ok: true });

  const keys2 = ['indexedDB'];
  const db = await new Function(...keys2, SRC_IDBOPEN_WORKER + '\nreturn idbOpen();')(...keys2.map(k => ({indexedDB})[k]));
  const mapsEntry = await new Promise((res,rej) => { const req = db.transaction('maps','readonly').objectStore('maps').get('karta1'); req.onsuccess=()=>res(req.result); req.onerror=()=>rej(req.error); });
  const bufEntry = await new Promise((res,rej) => { const req = db.transaction('mapBufs','readonly').objectStore('mapBufs').get('karta1'); req.onsuccess=()=>res(req.result); req.onerror=()=>rej(req.error); });
  assert.strictEqual(mapsEntry, undefined);
  assert.strictEqual(bufEntry, undefined);
});

console.log('\nPoruka load-buf (worker) — upis dijeli metapodatke i buffer u DVA store-a:');

function makeSqlStubs(fmt) {
  return {
    getSqlJs: async () => ({ Database: function(u8) { this._u8 = u8; this.close = () => {}; this.exec = () => []; } }),
    makeSqlJsExec: () => () => 0,
    detectFmt: () => fmt,
    readMeta: () => ({ minzoom: 1, maxzoom: 10 }),
    gpkgTileTable: () => null,
    _prepStmt: () => {},
    dbs: {},
  };
}

await t('msg.save=true upisuje METAPODATKE u maps (BEZ buffera) i buffer ZASEBNO u mapBufs', async () => {
  const indexedDB = makeFakeIndexedDB();
  const buf = new ArrayBuffer(16);
  const stubs = makeSqlStubs('mbtiles');
  const sandbox = Object.assign({
    idbOpen: () => { const keys2 = ['indexedDB']; return new Function(...keys2, SRC_IDBOPEN_WORKER + '\nreturn idbOpen();')(...keys2.map(k => ({indexedDB})[k])); },
    self: { postMessage: (m) => { sandbox._posted = m; } },
  }, stubs);
  const keys = Object.keys(sandbox);
  const wrapped = 'async function run(msg, id) {\n' + BODY_LOAD_BUF + '\n}\nreturn { run };';
  const api = new Function(...keys, wrapped)(...keys.map(k => sandbox[k]));
  await api.run({ name: 'nova_karta', buffer: buf, save: true }, 4);
  assert.strictEqual(sandbox._posted.ok, true);
  assert.strictEqual(sandbox._posted.fmt, 'mbtiles');

  const keys2 = ['indexedDB'];
  const db = await new Function(...keys2, SRC_IDBOPEN_WORKER + '\nreturn idbOpen();')(...keys2.map(k => ({indexedDB})[k]));
  const mapsEntry = await new Promise((res,rej) => { const req = db.transaction('maps','readonly').objectStore('maps').get('nova_karta'); req.onsuccess=()=>res(req.result); req.onerror=()=>rej(req.error); });
  const bufEntry = await new Promise((res,rej) => { const req = db.transaction('mapBufs','readonly').objectStore('mapBufs').get('nova_karta'); req.onsuccess=()=>res(req.result); req.onerror=()=>rej(req.error); });
  assert.ok(mapsEntry, 'maps zapis mora postojati');
  assert.strictEqual(mapsEntry.buffer, undefined, 'maps zapis NE SMIJE nositi buffer (to je bio uzrok sporog list-a)');
  assert.strictEqual(mapsEntry.fmt, 'mbtiles');
  assert.strictEqual(mapsEntry.size, 16);
  assert.ok(bufEntry, 'mapBufs zapis mora postojati');
  assert.strictEqual(bufEntry.buffer, buf);
});

await t('msg.save=false (privremen prikaz, npr. probni uvoz) ne piše NIŠTA u IndexedDB', async () => {
  const indexedDB = makeFakeIndexedDB();
  const buf = new ArrayBuffer(16);
  const stubs = makeSqlStubs('mbtiles');
  const sandbox = Object.assign({
    idbOpen: () => { const keys2 = ['indexedDB']; return new Function(...keys2, SRC_IDBOPEN_WORKER + '\nreturn idbOpen();')(...keys2.map(k => ({indexedDB})[k])); },
    self: { postMessage: (m) => { sandbox._posted = m; } },
  }, stubs);
  const keys = Object.keys(sandbox);
  const wrapped = 'async function run(msg, id) {\n' + BODY_LOAD_BUF + '\n}\nreturn { run };';
  const api = new Function(...keys, wrapped)(...keys.map(k => sandbox[k]));
  await api.run({ name: 'probna', buffer: buf, save: false }, 5);
  assert.strictEqual(sandbox._posted.ok, true);
  // baza se nikad nije ni otvorila u ovom putu — provjeri da nema zapisa ako se otvori sad
  const keys2 = ['indexedDB'];
  const db = await new Function(...keys2, SRC_IDBOPEN_WORKER + '\nreturn idbOpen();')(...keys2.map(k => ({indexedDB})[k]));
  const mapsEntry = await new Promise((res,rej) => { const req = db.transaction('maps','readonly').objectStore('maps').get('probna'); req.onsuccess=()=>res(req.result); req.onerror=()=>rej(req.error); });
  assert.strictEqual(mapsEntry, undefined);
});

console.log('\nPoruka load-idb (worker) — čita buffer IZ mapBufs, ne iz maps:');

await t('učitavanje postojeće ne-OPFS karte čita buffer iz mapBufs i uspijeva', async () => {
  const indexedDB = makeFakeIndexedDB();
  const buf = new ArrayBuffer(16);
  await seedLegacyV1(indexedDB, 'tvlake_sqlmaps', [
    { name: 'karta1', buffer: buf, fmt: 'mbtiles', meta: { minzoom: 1, maxzoom: 5 }, savedAt: 1, size: 16 }
  ]);
  const stubs = makeSqlStubs('mbtiles');
  const sandbox = Object.assign({
    idbOpen: () => { const keys2 = ['indexedDB']; return new Function(...keys2, SRC_IDBOPEN_WORKER + '\nreturn idbOpen();')(...keys2.map(k => ({indexedDB})[k])); },
    self: { postMessage: (m) => { sandbox._posted = m; } },
  }, stubs);
  const keys = Object.keys(sandbox);
  const wrapped = 'async function run(msg, id) {\n' + BODY_LOAD_IDB + '\n}\nreturn { run };';
  const api = new Function(...keys, wrapped)(...keys.map(k => sandbox[k]));
  await api.run({ name: 'karta1' }, 6);
  assert.strictEqual(sandbox._posted.ok, true);
  assert.strictEqual(sandbox._posted.fmt, 'mbtiles');
  assert.ok(stubs.dbs['karta1'], 'karta mora biti registrovana u dbs za dalje queryTile pozive');
});

await t('nedostajući mapBufs zapis (npr. korumpirana/nepotpuna migracija) baca jasnu grešku, ne tihi pad', async () => {
  const indexedDB = makeFakeIndexedDB();
  // maps zapis postoji ali BEZ pratećeg mapBufs zapisa
  const keys0 = ['indexedDB'];
  const db0 = await new Function(...keys0, SRC_IDBOPEN_WORKER + '\nreturn idbOpen();')(...keys0.map(k => ({indexedDB})[k]));
  await new Promise((res,rej) => { const tx = db0.transaction('maps','readwrite'); tx.objectStore('maps').put({ name: 'osiroceno', fmt: 'mbtiles', meta: {}, savedAt: 1, size: 10 }); tx.oncomplete=res; tx.onerror=()=>rej(tx.error); });

  const stubs = makeSqlStubs('mbtiles');
  const sandbox = Object.assign({
    idbOpen: () => { const keys2 = ['indexedDB']; return new Function(...keys2, SRC_IDBOPEN_WORKER + '\nreturn idbOpen();')(...keys2.map(k => ({indexedDB})[k])); },
    self: { postMessage: () => {} },
  }, stubs);
  const keys = Object.keys(sandbox);
  const wrapped = 'async function run(msg, id) {\n' + BODY_LOAD_IDB + '\n}\nreturn { run };';
  const api = new Function(...keys, wrapped)(...keys.map(k => sandbox[k]));
  await assert.rejects(() => api.run({ name: 'osiroceno' }, 7), /buffer-not-found/);
});

await t('nepostojeća karta baca "not-found" (ne "buffer-not-found") — jasno razlikuje uzrok', async () => {
  const indexedDB = makeFakeIndexedDB();
  const stubs = makeSqlStubs('mbtiles');
  const sandbox = Object.assign({
    idbOpen: () => { const keys2 = ['indexedDB']; return new Function(...keys2, SRC_IDBOPEN_WORKER + '\nreturn idbOpen();')(...keys2.map(k => ({indexedDB})[k])); },
    self: { postMessage: () => {} },
  }, stubs);
  const keys = Object.keys(sandbox);
  const wrapped = 'async function run(msg, id) {\n' + BODY_LOAD_IDB + '\n}\nreturn { run };';
  const api = new Function(...keys, wrapped)(...keys.map(k => sandbox[k]));
  await assert.rejects(() => api.run({ name: 'ne_postoji' }, 8), /not-found/);
});

console.log('\n' + pass + ' prošlo, ' + fail + ' palo');
process.exit(fail ? 1 : 0);
}

main();
