// =====================================================================
// Testovi za brzo otvaranje VELIKE offline OPFS karte (v1.4.0).
// Pokretanje:  node tests/js/opfs-sync-upgrade.test.js
// ---------------------------------------------------------------------
// Terenski nalaz (UNSKO_2GB, 2 GB MBTiles): cold start je stajao ~40 s na
// createSyncAccessHandle() prije nego se ijedna pločica nacrta. v1.3.9 je to
// riješila tako što velike karte (>512 MB) uopšte ne traže sync handle nego
// čitaju asinhrono preko File.slice() — karta se otvara odmah, ALI svako
// čitanje stranice košta ~25 ms umjesto mikrosekundi, pa velika karta ostaje
// trajno spora i trza pri panovanju/zumiranju.
//
// v1.4.0: sync handle se traži U POZADINI. Odgovor workera ide ODMAH (karta
// radi asinhrono), a kad handle stigne — makar i 40 s kasnije — prikači se na
// istu MiniSqlite instancu i sva sljedeća čitanja idu punom brzinom.
//
// Testira se STVARNI kod izvučen iz index.html (case 'load-opfs' iz
// _SQL_WORKER_SRC i klasa MiniSqlite), nad kontrolisanim fake OPFS-om gdje
// test SAM odlučuje KADA će createSyncAccessHandle() da se razriješi — bez
// toga se "ne blokira 40 s" ne može ni dokazati ni opovrgnuti.
// =====================================================================
'use strict';
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const HTML = fs.readFileSync(path.join(__dirname, '../../index.html'), 'utf8');

function extractCase(type) {
  const marker = "msg.type === '" + type + "') {";
  const mi = HTML.indexOf(marker);
  assert.ok(mi >= 0, 'nije nađen case za ' + type);
  const braceStart = mi + marker.length - 1;
  let depth = 0, i = braceStart;
  for (; i < HTML.length; i++) {
    if (HTML[i] === '{') depth++;
    else if (HTML[i] === '}') { depth--; if (depth === 0) break; }
  }
  return HTML.slice(braceStart + 1, i);
}
function extractClass(name) {
  const start = HTML.indexOf('class ' + name + ' {');
  assert.ok(start >= 0, 'nije nađena klasa ' + name);
  let depth = 0, i = HTML.indexOf('{', start);
  for (; i < HTML.length; i++) {
    if (HTML[i] === '{') depth++;
    else if (HTML[i] === '}') { depth--; if (depth === 0) return HTML.slice(start, i + 1); }
  }
  throw new Error('nezatvorena klasa ' + name);
}

const BODY_LOAD_OPFS = extractCase('load-opfs');
const SRC_MINISQLITE = extractClass('MiniSqlite');

let pass = 0, fail = 0;
function t(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => { console.log('  ✔ ' + name); pass++; })
    .catch(e => { console.log('  ✘ ' + name + '\n      ' + (e && e.message)); fail++; });
}

const MB = 1024 * 1024;

// ── Fake OPFS ────────────────────────────────────────────────────────────
// createSyncAccessHandle() vraća promise koji test razrješava RUČNO — tako se
// "odgovor je poslat PRIJE nego handle stigne" može tvrditi kao činjenica, ne
// kao nada da će tajming ispasti kako treba.
function makeOpfs(size) {
  const handle = { closed: false, read() {}, close() { handle.closed = true; } };
  let razrijesi = null, odbij = null;
  let trazen = 0;
  const fh = {
    getFile: async () => ({
      size,
      slice: () => ({ arrayBuffer: async () => new ArrayBuffer(4096) })
    }),
    createSyncAccessHandle: () => {
      trazen++;
      return new Promise((res, rej) => { razrijesi = () => res(handle); odbij = rej; });
    }
  };
  return {
    navigator: { storage: { getDirectory: async () => ({ getFileHandle: async () => fh }) } },
    handle,
    brojTrazenja: () => trazen,
    razrijesiHandle: () => { assert.ok(razrijesi, 'createSyncAccessHandle još nije ni pozvan'); razrijesi(); },
    odbijHandle: (e) => { assert.ok(odbij, 'createSyncAccessHandle još nije ni pozvan'); odbij(e || new Error('NoModificationAllowedError')); }
  };
}

// Pokreće IZVUČENO tijelo case-a 'load-opfs' sa stubovanim MiniSqlite —
// stvarna MiniSqlite.init() bi tražila pravi SQLite fajl, a ovdje se testira
// REDOSLIJED (kad ide odgovor, kad se kači handle), ne parsiranje baze.
function pokreniLoadOpfs(opfs, opts) {
  const o = opts || {};
  const poruke = [];
  const dbs = o.dbs || {};
  const instance = [];
  class FakeMiniSqlite {
    constructor(file, sync) { this.file = file; this.sync = sync || null; instance.push(this); }
    async init() { return { fmt: 'mbtiles', meta: {} }; }
  }
  const self = { postMessage: (m) => poruke.push(m) };
  const msg = { name: o.name || 'UNSKO_2GB', path: '/unsko.sqlmap', diag: false };
  const fn = new Function('msg', 'id', 'dbs', 'self', 'navigator', 'MiniSqlite',
    'return (async () => {' + BODY_LOAD_OPFS + '})();');
  const gotovo = fn(msg, 1, dbs, self, opfs.navigator, FakeMiniSqlite);
  return { poruke, dbs, instance, gotovo };
}

(async () => {

console.log("load-opfs — velika karta se otvara ODMAH, sync handle stiže poslije:");

await t('velika karta (>512 MB): odgovor ide PRIJE nego createSyncAccessHandle uopšte razriješi', async () => {
  const opfs = makeOpfs(2048 * MB);
  const r = pokreniLoadOpfs(opfs);
  await r.gotovo;

  const ok = r.poruke.find(m => m.id === 1);
  assert.ok(ok, 'odgovor na load-opfs mora stići');
  assert.strictEqual(ok.ok, true, 'karta je otvorena');
  assert.strictEqual(r.instance[0].sync, null,
    'velika karta se otvara BEZ sync handle-a — inače cold start stoji ~40 s');
  assert.ok(r.dbs['UNSKO_2GB'], 'karta je registrovana i upotrebljiva odmah');
});

await t('handle koji stigne KASNIJE se prikači na istu instancu (karta postaje brza)', async () => {
  const opfs = makeOpfs(2048 * MB);
  const r = pokreniLoadOpfs(opfs);
  await r.gotovo;
  const mini = r.instance[0];
  assert.strictEqual(mini.sync, null, 'prije razrješenja još čita asinhrono');

  opfs.razrijesiHandle();
  await new Promise(res => setTimeout(res, 0));

  assert.strictEqual(mini.sync, opfs.handle, 'sync handle mora biti prikačen na ISTU MiniSqlite instancu');
  assert.strictEqual(opfs.handle.closed, false, 'handle koji se koristi se NE zatvara');
  assert.ok(r.poruke.some(m => m.type === 'opfs-sync-ready' && m.name === 'UNSKO_2GB'),
    'glavna nit mora dobiti obavijest da je brzo čitanje spremno (ide u dijagnostiku)');
});

await t('karta zatvorena prije nego handle stigne — handle se ZATVARA (ne curi lock na fajlu)', async () => {
  const opfs = makeOpfs(2048 * MB);
  const r = pokreniLoadOpfs(opfs);
  await r.gotovo;
  const mini = r.instance[0];

  delete r.dbs['UNSKO_2GB'];        // korisnik je u međuvremenu zatvorio/zamijenio kartu
  opfs.razrijesiHandle();
  await new Promise(res => setTimeout(res, 0));

  assert.strictEqual(opfs.handle.closed, true,
    'nezatvoren handle ostavlja ekskluzivni lock na fajlu — karta se kasnije ne bi mogla otvoriti');
  assert.strictEqual(mini.sync, null, 'ne kači se na instancu koja više nije aktivna');
});

await t('odbijen handle (WebView ne da ekskluzivni pristup) ne ruši ništa — karta ostaje asinhrona', async () => {
  const opfs = makeOpfs(2048 * MB);
  const r = pokreniLoadOpfs(opfs);
  await r.gotovo;

  opfs.odbijHandle();
  await new Promise(res => setTimeout(res, 0));

  assert.strictEqual(r.instance[0].sync, null, 'ostaje asinhrona, bez bacanja');
  assert.ok(r.poruke.find(m => m.id === 1).ok, 'odgovor iz prvog koraka ostaje uspješan');
});

await t('mala karta (≤512 MB) uzima sync handle ODMAH i ne traži ga drugi put', async () => {
  const opfs = makeOpfs(100 * MB);
  const r = pokreniLoadOpfs(opfs);
  await new Promise(res => setTimeout(res, 0));
  opfs.razrijesiHandle();          // kod ga AWAIT-uje, pa mora biti razriješen da se nastavi
  await r.gotovo;

  assert.strictEqual(r.instance[0].sync, opfs.handle, 'mala karta ga dobija odmah (trenutno je)');
  assert.strictEqual(opfs.brojTrazenja(), 1, 'ne smije se tražiti i drugi put u pozadini');
});

console.log('\nMiniSqlite._pg — čitanje stranice preživi smjenu sync/async puta:');

function makeMini(opts) {
  const o = opts || {};
  const mod = new Function(SRC_MINISQLITE + '\nreturn MiniSqlite;')();
  const file = {
    slice: () => ({
      arrayBuffer: async () => {
        if (o.filePuca) throw new Error('NotReadableError');
        return new Uint8Array(4096).fill(7).buffer;
      }
    })
  };
  const sync = o.sync === false ? null : {
    read(d) { if (o.syncPuca) throw new Error('sync fail'); d.fill(9); }
  };
  return { mini: new mod(file, o.sync === false ? null : sync), sync };
}

await t('sync handle postoji → čita se sinhrono (brzi put)', async () => {
  const { mini } = makeMini({});
  const d = await mini._pg(2);
  assert.strictEqual(d[0], 9, 'podatak mora doći iz sync.read');
});

await t('sync read pukne → pada na File čitanje (postojeći fallback, nedirnut)', async () => {
  const { mini } = makeMini({ syncPuca: true });
  const d = await mini._pg(2);
  assert.strictEqual(d[0], 7, 'podatak mora doći iz file.slice()');
});

await t('NOVO: handle stigne DOK je File čitanje u letu → stranica se pročita preko sync-a', async () => {
  // Tačan scenario iz v1.4.0, i jedini koji stvarno razlikuje novi kod od
  // starog: _pg je ušao u ASINHRONI put (this.sync je tada bio null), a
  // pozadinski createSyncAccessHandle uzme ekskluzivni lock BAŠ dok je to
  // File čitanje u letu — File read tada pukne. Ako se sync postavi PRIJE
  // poziva, ovo ne dokazuje ništa (i stari kod bi prošao, jer bi uzeo sync
  // granu odmah), pa se sync namjerno kači IZ SAMOG čitanja.
  const mod = new Function(SRC_MINISQLITE + '\nreturn MiniSqlite;')();
  let mini;
  const file = {
    slice: () => ({
      arrayBuffer: async () => {
        mini.sync = { read(d) { d.fill(5); } };   // handle je upravo stigao
        throw new Error('NotReadableError');       // ...i oborio File čitanje u letu
      }
    })
  };
  mini = new mod(file, null);
  const d = await mini._pg(2);
  assert.strictEqual(d[0], 5, 'mora se pročitati preko sync handle-a, ne pući');
});

await t('File čitanje pukne a sync handle NE postoji → greška se propušta (ne guta se tiho)', async () => {
  const { mini } = makeMini({ sync: false, filePuca: true });
  await assert.rejects(() => mini._pg(2), /NotReadableError/,
    'stvarna greška čitanja mora ostati vidljiva, inače se pločica tiho gubi bez traga');
});

console.log('\n' + pass + ' prošlo, ' + fail + ' palo');
process.exit(fail ? 1 : 0);

})();
