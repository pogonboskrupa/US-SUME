// =====================================================================
// Testovi za NEPOVRATNE lokalne upise i zauzeće localStorage-a (v1.4.7).
// Pokretanje:  node tests/js/offline-kriticni-upis.test.js
// ---------------------------------------------------------------------
// Audit offline rada je našao dva TIHA gubitka podataka: _tragRegSave i
// _msrRegSave su imali goli `catch(e) {}`, pa bi popunjena localStorage kvota
// značila da cijeli terenski dan NIJE sačuvan — bez ijednog znaka korisniku.
// Snimak sa terena se ne može ponoviti (trag se ne može ponovo prehodati), a
// proces koji OEM battery manager ubije odnio bi nesačuvano sa sobom.
//
// Mjereno: tačka traga je ~51 B, terenski dan (6h) ~433 KB, a queue čuva ISTE
// tačke još jednom (payload `pts`) — pa se ~5 MB kvote realno dosegne.
//
// Testira se STVARNI kod izvučen iz index.html.
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

let pass = 0, fail = 0;
function t(name, fn) {
  try { fn(); console.log('  ✔ ' + name); pass++; }
  catch (e) { fail++; console.log('  ✘ ' + name + '\n      ' + e.message); }
}

const SRC = [extractFn('_lsZauzetoKB'), extractFn('_localSetKriticno')].join('\n');

// greska: null | 'kvota' | 'drugo'
function makeEnv(greska, postojeci) {
  const store = Object.assign({}, postojeci || {});
  const toasts = [], debug = [];
  const localStorage = {
    get length() { return Object.keys(store).length; },
    key: (i) => Object.keys(store)[i],
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => {
      if (greska === 'kvota') {
        const e = new Error('Failed to execute setItem: quota exceeded');
        e.name = 'QuotaExceededError';
        throw e;
      }
      if (greska === 'drugo') throw new Error('nešto drugo je puklo');
      store[k] = String(v);
    },
  };
  const sandbox = {
    localStorage,
    showToast: (m) => toasts.push(m),
    _debugUpsert: (id, title, text, state) => debug.push({ id, title, text, state }),
  };
  const keys = Object.keys(sandbox);
  const api = new Function(...keys, SRC + '\nreturn { _lsZauzetoKB, _localSetKriticno };')
    (...keys.map(k => sandbox[k]));
  return { ...api, toasts, debug, store };
}

console.log('_localSetKriticno — nepovratan snimak ne smije pasti tiho:');

t('uspješan upis vraća true i stvarno upiše vrijednost', () => {
  const e = makeEnv(null);
  assert.strictEqual(e._localSetKriticno('k', 'v', 'Snimljeni tragovi'), true);
  assert.strictEqual(e.store.k, 'v');
  assert.strictEqual(e.toasts.length, 0, 'uspjeh ne smije uznemiravati korisnika');
});

t('KLJUČNO: popunjena kvota vraća false (dosad se gutalo i vraćalo undefined)', () => {
  assert.strictEqual(makeEnv('kvota')._localSetKriticno('k', 'v', 'Snimljeni tragovi'), false);
});

t('popunjena kvota GLASNO javlja da snimak NIJE sačuvan', () => {
  const e = makeEnv('kvota');
  e._localSetKriticno('k', 'v', 'Snimljeni tragovi');
  assert.strictEqual(e.toasts.length, 1);
  assert.ok(/NEMA MJESTA/.test(e.toasts[0]), 'poruka mora reći da nema mjesta: ' + e.toasts[0]);
  assert.ok(/NIJE sačuvano/.test(e.toasts[0]), 'mora reći da podatak NIJE sačuvan: ' + e.toasts[0]);
  assert.ok(/Snimljeni tragovi/.test(e.toasts[0]), 'mora imenovati ŠTA je izgubljeno');
});

t('neuspjeh ostaje u DEBUG-u i poslije nestanka toasta (sunce na terenu)', () => {
  const e = makeEnv('kvota');
  e._localSetKriticno('k', 'v', 'Snimljeni tragovi');
  assert.strictEqual(e.debug.length, 1);
  assert.strictEqual(e.debug[0].id, 'local-quota');
  assert.ok(/kvota/i.test(e.debug[0].text), 'zapis mora imenovati uzrok: ' + e.debug[0].text);
});

t('greška koja NIJE kvota se razlikuje u poruci (drugi problem, drugo rješenje)', () => {
  const e = makeEnv('drugo');
  assert.strictEqual(e._localSetKriticno('k', 'v', 'Sačuvana mjerenja'), false);
  assert.ok(!/NEMA MJESTA/.test(e.toasts[0]),
    'ne smije tvrditi da je kvota puna kad nije: ' + e.toasts[0]);
});

t('pad showToast-a ne smije progutati povratnu vrijednost', () => {
  const api = new Function('localStorage', 'showToast', '_debugUpsert',
    SRC + '\nreturn { _localSetKriticno };')(
    { setItem: () => { const e = new Error('q'); e.name = 'QuotaExceededError'; throw e; }, length: 0, key: () => null, getItem: () => null },
    () => { throw new Error('toast pukao'); }, () => {});
  assert.strictEqual(api._localSetKriticno('k', 'v', 'X'), false);
});

console.log('\n_lsZauzetoKB — localStorage ima SVOJU kvotu, odvojenu od origin kvote:');

t('zbraja ključ + vrijednost, UTF-16 (2 bajta po znaku)', () => {
  const e = makeEnv(null, { ab: '12345678' });   // 2 + 8 = 10 znakova = 20 B
  assert.strictEqual(e._lsZauzetoKB(), Math.round(20 / 1024));
});

t('veći sadržaj daje realnu brojku u KB', () => {
  const e = makeEnv(null, { trag: 'x'.repeat(512 * 1024) });  // ~1 MB u UTF-16
  const kb = e._lsZauzetoKB();
  assert.ok(kb > 1000 && kb < 1100, 'očekivano ~1024 KB, dobiveno ' + kb);
});

t('nedostupan localStorage (privatni prozor) vraća null, ne baca', () => {
  const api = new Function('localStorage', SRC + '\nreturn { _lsZauzetoKB };')(
    { get length() { throw new Error('Access is denied'); } });
  assert.strictEqual(api._lsZauzetoKB(), null);
});

console.log('\nPozivaoci — tiho gutanje je stvarno uklonjeno:');

t('_tragRegSave više nema goli catch i ide kroz _localSetKriticno', () => {
  const src = extractFn('_tragRegSave');
  assert.ok(!/catch\s*\([a-z]*\)\s*\{\s*\}/.test(src),
    'goli catch(e) {} je bio uzrok tihog gubitka terenskog dana: ' + src);
  assert.ok(src.includes('_localSetKriticno'), 'mora ići kroz zajednički siguran upis');
  assert.ok(src.includes('return'), 'mora vratiti ishod da ga pozivalac MOŽE provjeriti');
});

t('_msrRegSave više nema goli catch i ide kroz _localSetKriticno', () => {
  const src = extractFn('_msrRegSave');
  assert.ok(!/catch\s*\([a-z]*\)\s*\{\s*\}/.test(src), 'goli catch(e) {}: ' + src);
  assert.ok(src.includes('_localSetKriticno'));
});

t('nijedan preostali upis tvlake_tragovi/mjerenja ne guta grešku tiho', () => {
  const linije = HTML.split('\n');
  const lose = [];
  linije.forEach((l, i) => {
    if (!/localStorage\.setItem/.test(l)) return;
    const ctx = linije.slice(i, i + 3).join(' ');
    if (/_TRAG_REG_KEY|_MSR_REG_KEY/.test(ctx) && /catch\s*\([a-z]*\)\s*\{\s*\}/.test(ctx))
      lose.push(i + 1);
  });
  assert.deepStrictEqual(lose, [], 'tihi upisi nepovratnih snimaka na linijama: ' + lose);
});

console.log('\n' + pass + ' prošlo, ' + fail + ' palo');
process.exit(fail ? 1 : 0);
