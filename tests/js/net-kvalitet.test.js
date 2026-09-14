// =====================================================================
// Testovi za mjerenje kvaliteta veze i terensku debug sekciju (v1.4.6).
// Pokretanje:  node tests/js/net-kvalitet.test.js
// ---------------------------------------------------------------------
// Terenski problem: navigator.onLine na mrtvoj vezi LAŽE 'true' (OS-S4), pa
// je "slab signal" dosad bio POTPUNO nevidljiv — crvena tačkica se palila samo
// kad OS sam prizna da je offline. Stanje linka se zato MJERI iz saobraćaja
// koji app ionako pravi (reliableFetch je jedini transport svih Supabase
// poziva), bez ijednog dodatnog "ping" zahtjeva.
//
// Testira se STVARNI kod izvučen iz index.html + stvarni reliable-fetch.js.
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
  let i = HTML.indexOf('{', start), depth = 0;
  for (; i < HTML.length; i++) {
    if (HTML[i] === '{') depth++;
    else if (HTML[i] === '}') { depth--; if (depth === 0) return HTML.slice(start, i + 1); }
  }
  throw new Error('nezatvorena funkcija ' + name);
}
function extractConst(name) {
  const re = new RegExp('const ' + name + ' = [^;]+;');
  const m = HTML.match(re);
  if (!m) throw new Error('nije nađena konstanta ' + name);
  return m[0];
}

let pass = 0, fail = 0;
function t(name, fn) {
  try { fn(); console.log('  ✔ ' + name); pass++; }
  catch (e) { fail++; console.log('  ✘ ' + name + '\n      ' + e.message); }
}
// Zaseban runner za async testove — t() ne čeka Promise, pa bi pala asercija
// unutar async funkcije prošla kao "uspjeh" uz neuhvaćeno odbijanje sa strane.
async function ta(name, fn) {
  try { await fn(); console.log('  ✔ ' + name); pass++; }
  catch (e) { fail++; console.log('  ✘ ' + name + '\n      ' + e.message); }
}

// Sav mjerni kod u jednom sandboxu — _netUzorci je `let` u istom opsegu kao
// funkcije koje ga čitaju, pa se mora izvršiti zajedno s njima.
const SRC_NET = [
  extractConst('_NET_UZORAKA'), extractConst('_NET_SVJEZE_MS'), extractConst('_NET_SPORO_MS'),
  'let _netUzorci = [];',
  extractFn('_netZabiljezi'), extractFn('_netSvjezi'),
  extractFn('_netMedijanMs'), extractFn('_netKvalitet'), extractFn('_netBadgeSync'),
].join('\n');

// uzorci: niz {ok, ms, starostMs?} — ubacuju se direktno da se ne mora čekati.
function makeNet(uzorci, onLine, offlineMode) {
  const el = { style: { display: 'none', background: '', boxShadow: '' }, title: '' };
  const sandbox = {
    navigator: { onLine: onLine !== false },
    document: { getElementById: (id) => id === 'offline-badge' ? el : null },
    _isOfflineMode: !!offlineMode,
  };
  const keys = Object.keys(sandbox);
  const sad = Date.now();
  const seed = JSON.stringify((uzorci || []).map(u => ({
    ok: !!u.ok, ms: u.ms || 0, vrsta: u.ok ? 'ok' : 'istek', t: sad - (u.starostMs || 0),
  })));
  const api = new Function(...keys, SRC_NET +
    '\n_netUzorci = ' + seed + ';' +
    '\nreturn { _netKvalitet, _netMedijanMs, _netSvjezi, _netBadgeSync, _netZabiljezi,' +
    '  broj: () => _netUzorci.length };')(...keys.map(k => sandbox[k]));
  return { ...api, el };
}
const OK = (ms) => ({ ok: true, ms: ms == null ? 200 : ms });
const PAO = () => ({ ok: false, ms: 15000 });

console.log('_netKvalitet — izmjereno stanje, ne navigator.onLine:');

t('OS kaže offline → "nema" (u tom smjeru OS ne laže)', () => {
  assert.strictEqual(makeNet([OK()], false)._netKvalitet(), 'nema');
});

t('nema uzoraka → "nepoznato" (ne izmišlja se "dobra")', () => {
  assert.strictEqual(makeNet([], true)._netKvalitet(), 'nepoznato');
});

t('KLJUČNO: onLine=true a svi pozivi pali → "nema" (OS-S4 laž se hvata)', () => {
  assert.strictEqual(makeNet([PAO(), PAO(), PAO()], true)._netKvalitet(), 'nema',
    'ovo je stanje u kojem je korisnik dosad vidio "online" dok ništa nije prolazilo');
});

t('dio poziva pao, dio prošao → "slaba"', () => {
  assert.strictEqual(makeNet([OK(150), OK(200), PAO()], true)._netKvalitet(), 'slaba');
});

t('svi prošli ali sporo (medijan > praga) → "slaba"', () => {
  assert.strictEqual(makeNet([OK(4000), OK(5000), OK(6000)], true)._netKvalitet(), 'slaba');
});

t('svi prošli brzo → "dobra"', () => {
  assert.strictEqual(makeNet([OK(120), OK(180), OK(240)], true)._netKvalitet(), 'dobra');
});

t('stari uzorci se ne broje — ne opisuju trenutni teren', () => {
  const n = makeNet([PAO(), PAO()].map(u => ({ ...u, starostMs: 30 * 60 * 1000 })), true);
  assert.strictEqual(n._netKvalitet(), 'nepoznato',
    'uzorci od prije pola sata ne smiju tvrditi da veze NEMA sada');
});

t('medijan računa SAMO uspjele pozive (pali nemaju smisleno trajanje)', () => {
  assert.strictEqual(makeNet([OK(100), OK(300), PAO()], true)._netMedijanMs(), 300);
});

console.log('\n_netBadgeSync — tri stanja tačkice, ne dva:');

t('dobra veza → tačkica skrivena', () => {
  const n = makeNet([OK(100), OK(120)], true); n._netBadgeSync();
  assert.strictEqual(n.el.style.display, 'none');
});

t('slab signal → ŽUTA tačkica (dosad nije postojala)', () => {
  const n = makeNet([OK(100), PAO()], true); n._netBadgeSync();
  assert.strictEqual(n.el.style.display, 'inline-block');
  assert.ok(/f59e0b/i.test(n.el.style.background), 'slab signal mora biti žut, ne crven: ' + n.el.style.background);
  assert.ok(/slab/i.test(n.el.title), 'title mora objasniti šta znači žuto: ' + n.el.title);
});

t('nema veze → CRVENA tačkica', () => {
  const n = makeNet([PAO(), PAO()], true); n._netBadgeSync();
  assert.ok(/dc2626/i.test(n.el.style.background));
});

t('_isOfflineMode (odluka auth/startup sloja) ima zadnju riječ i nadjača mjerenje', () => {
  const n = makeNet([OK(100), OK(110)], true, true); n._netBadgeSync();
  assert.strictEqual(n.el.style.display, 'inline-block');
  assert.ok(/dc2626/i.test(n.el.style.background),
    'kad je startup odlučio da radimo offline, brzi uzorci to ne smiju poništiti');
});

t('nedostajuć element ne baca (badge postoji tek kad se app prikaže)', () => {
  const api = new Function('navigator', 'document', '_isOfflineMode',
    SRC_NET + '\nreturn { _netBadgeSync };')({ onLine: true }, { getElementById: () => null }, false);
  api._netBadgeSync();
});

console.log('\n_netZabiljezi — prozor uzoraka:');

t('prozor se ne prelijeva preko _NET_UZORAKA', () => {
  const n = makeNet([], true);
  for (let i = 0; i < 40; i++) n._netZabiljezi({ ok: true, ms: 100, vrsta: 'ok' });
  assert.ok(n.broj() <= 12, 'zadržava se samo zadnjih 12 uzoraka, bilo: ' + n.broj());
});

t('prazan/neispravan ishod se ignoriše (ne pravi lažan uzorak)', () => {
  const n = makeNet([], true);
  n._netZabiljezi(null); n._netZabiljezi(undefined);
  assert.strictEqual(n.broj(), 0);
});

console.log('\nreliableFetch — pasivni posmatrač (stvarni modul):');

const { reliableFetch, setNetObserver } = require('../../static/js/reliable-fetch.js');

function sObs() { const v = []; setNetObserver(i => v.push(i)); return { v, done: () => setNetObserver(null) }; }

(async () => {
await ta('uspješan poziv javlja {ok:true} sa trajanjem', async () => {
  const o = sObs();
  const orig = global.fetch;
  global.fetch = async () => new Response('x', { status: 200 });
  try { await reliableFetch('https://example.test/a', {}, 1000); }
  finally { global.fetch = orig; o.done(); }
  assert.strictEqual(o.v.length, 1);
  assert.strictEqual(o.v[0].ok, true);
  assert.strictEqual(typeof o.v[0].ms, 'number');
});

await ta('HTTP 500 je i dalje ok:true — link RADI, server je taj koji se buni', async () => {
  const o = sObs();
  const orig = global.fetch;
  global.fetch = async () => new Response('bum', { status: 500 });
  try { await reliableFetch('https://example.test/b', {}, 1000); }
  finally { global.fetch = orig; o.done(); }
  assert.strictEqual(o.v[0].ok, true);
  assert.strictEqual(o.v[0].status, 500);
});

await ta('istek javlja vrstu "istek" (to je slab signal, ne odbijanje)', async () => {
  const o = sObs();
  const orig = global.fetch;
  global.fetch = (_u, opt) => new Promise((_r, rej) =>
    opt.signal.addEventListener('abort', () => rej(Object.assign(new Error('a'), { name: 'AbortError' })), { once: true }));
  try { await reliableFetch('https://example.test/c', {}, 10).catch(() => {}); }
  finally { global.fetch = orig; o.done(); }
  assert.strictEqual(o.v[0].ok, false);
  assert.strictEqual(o.v[0].vrsta, 'istek');
});

await ta('prekid koji je tražio POZIVALAC se NE broji kao loša veza', async () => {
  const o = sObs();
  const orig = global.fetch;
  const up = new AbortController();
  global.fetch = (_u, opt) => new Promise((_r, rej) =>
    opt.signal.addEventListener('abort', () => rej(Object.assign(new Error('p'), { name: 'AbortError' })), { once: true }));
  const p = reliableFetch('https://example.test/d', { signal: up.signal }, 1000);
  up.abort();
  try { await p.catch(() => {}); }
  finally { global.fetch = orig; o.done(); }
  assert.strictEqual(o.v.length, 0, 'korisnik koji je napustio ekran nije kvar veze');
});

console.log('\n' + pass + ' prošlo, ' + fail + ' palo');
process.exit(fail ? 1 : 0);
})();
