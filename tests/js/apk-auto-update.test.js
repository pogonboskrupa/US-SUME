// =====================================================================
// Testovi za azurirajAplikaciju() / _azurirajStatus (v1.5.2).
// Pokretanje:  node tests/js/apk-auto-update.test.js
// ---------------------------------------------------------------------
// "Ažuriraj aplikaciju" u Meniju je za APK korisnike ranije samo otvarala
// GitHub Actions listu radnji — korisnik je morao ručno naći build, prijaviti
// se na GitHub, skinuti .zip artefakt (traži login, ističe za 90 dana),
// raspakovati i instalirati. Sad postoji native AndroidUpdate most
// (MainActivity.java) koji sam nalazi i instalira najnoviju verziju preko
// GitHub Release-a (javno dostupan, bez login-a — objavljuje ga CI). Stari
// put ostaje SAMO kao fallback za APK instaliran PRIJE ovog mosta (na njemu
// window.AndroidUpdate ne postoji — kokoška-i-jaje, most se ne može sam
// ubaciti u već instaliran APK).
//
// Testira se STVARNI kod izvučen iz index.html. Java strana (UpdateBridge)
// se ne može kompajlirati iz sandboxa (nema Android SDK-a) — provjerena je
// strukturno, isti princip kao NetBridge (v3.105.0).
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
async function ta(name, fn) {
  try { await fn(); console.log('  ✔ ' + name); pass++; }
  catch (e) { fail++; console.log('  ✘ ' + name + '\n      ' + e.message); }
}

function makeEnv(opts = {}) {
  const toasts = [];
  const calls = { checkAndInstall: 0, fetch: 0, dlg: 0, dlgActions: 0, reload: 0 };
  const napredak = [];
  const sandbox = {
    _anyRecOn: () => false,
    showToast: (m) => toasts.push(m),
    location: { hostname: opts.isAPK ? 'appassets.androidplatform.net' : 'pogonboskrupa.github.io' },
    window: opts.androidUpdate !== undefined
      ? { AndroidUpdate: opts.androidUpdate }
      : {},
    navigator: { serviceWorker: { getRegistration: async () => null } },
    fetch: async () => { calls.fetch++; return { ok: false }; },
    // v1.6.0: fallback put više ne zove goli fetch() nego _fetchT (fetch sa
    // rokom) — sandbox ga mora imati, inače bi ReferenceError pao u postojeći
    // try/catch i test bi mjerio 0 poziva iako fallback uredno radi. Broji u
    // ISTI brojač jer je _fetchT u produkciji samo fetch sa rokom; delegiranje
    // na `fetch(...)` ovdje NE bi radilo — unutar strelice to je Node-ov
    // globalni fetch, ne ovaj stub (sandbox vrijednosti nisu u tom opsegu).
    _fetchT: async () => { calls.fetch++; return { ok: false }; },
    _dlg: async () => { calls.dlg++; },
    _dlgActions: async () => { calls.dlgActions++; return -1; },
    _verCmp: () => 0,
    // v1.6.5: APK put otvara panel ažuriranja umjesto toasta.
    _azurirajNapredak: (x) => napredak.push(x),
    APP_VER: 'v1.5.2',
    _LIVE_BASE: 'https://pogonboskrupa.github.io/US-SUME/',
  };
  const src = extractFn('azurirajAplikaciju') + '\n' + extractFn('_azurirajStatus');
  const keys = Object.keys(sandbox);
  const api = new Function(...keys, src + '\nreturn { azurirajAplikaciju, _azurirajStatus };')
    (...keys.map(k => sandbox[k]));
  return { api, toasts, calls, sandbox, napredak };
}

console.log('azurirajAplikaciju() — APK sa AndroidUpdate mostom:');

(async () => {
  await ta('poziva AndroidUpdate.checkAndInstall() umjesto starog fetch/dijalog puta', async () => {
    let called = 0;
    const { api, calls, napredak } = makeEnv({
      isAPK: true,
      androidUpdate: { checkAndInstall: () => { called++; } },
    });
    await api.azurirajAplikaciju();
    assert.strictEqual(called, 1, 'AndroidUpdate.checkAndInstall() mora biti pozvan tačno jednom');
    assert.strictEqual(calls.fetch, 0, 'stari sw.js fetch fallback se NE smije pozvati kad most postoji');
    assert.strictEqual(napredak[0] && napredak[0].faza, 'provjera', 'panel mora odmah pokazati korak Provjera');
  });

  await ta('pad AndroidUpdate.checkAndInstall() (baci grešku) ne ruši funkciju', async () => {
    const { api, napredak } = makeEnv({
      isAPK: true,
      androidUpdate: { checkAndInstall: () => { throw new Error('boom'); } },
    });
    await api.azurirajAplikaciju(); // ne smije baciti
    const zadnji = napredak[napredak.length - 1];
    assert.strictEqual(zadnji && zadnji.faza, 'greska', 'panel mora preći u grešku');
    assert.ok(/nije uspjel/i.test(zadnji.poruka), 'mora javiti da pokretanje nije uspjelo: ' + zadnji.poruka);
  });

  console.log('\nazurirajAplikaciju() — APK BEZ AndroidUpdate mosta (fallback, star APK):');

  await ta('bez window.AndroidUpdate ide na stari fetch/sw.js put (fallback)', async () => {
    const { api, calls } = makeEnv({ isAPK: true, androidUpdate: undefined });
    await api.azurirajAplikaciju();
    assert.ok(calls.fetch >= 1, 'mora pasti na stari fetch(sw.js) put kad mosta nema');
  });

  await ta('AndroidUpdate bez checkAndInstall metode se tretira kao da ga nema', async () => {
    const { api, calls } = makeEnv({ isAPK: true, androidUpdate: {} });
    await api.azurirajAplikaciju();
    assert.ok(calls.fetch >= 1, 'nepotpun most (bez checkAndInstall) mora pasti na fallback');
  });

  console.log('\nazurirajAplikaciju() — webapp (nije APK) NIJE dotaknuta ovom izmjenom:');

  await ta('webapp i dalje ide kroz service worker put, ne kroz AndroidUpdate', async () => {
    let called = 0;
    const { api, calls } = makeEnv({
      isAPK: false,
      androidUpdate: { checkAndInstall: () => { called++; } },
    });
    await api.azurirajAplikaciju();
    assert.strictEqual(called, 0, 'AndroidUpdate ne smije se pozvati na webapp-u čak i ako postoji u window-u');
  });

  console.log('\n_azurirajStatus — native → JS status kanal:');

  t('prosljeđuje string poruku u showToast', () => {
    const { api, toasts } = makeEnv();
    api._azurirajStatus('⬇ Preuzimam verziju v1.5.2…');
    assert.deepStrictEqual(toasts, ['⬇ Preuzimam verziju v1.5.2…']);
  });

  t('ignoriše prazan/ne-string ulaz bez pucanja', () => {
    const { api, toasts } = makeEnv();
    api._azurirajStatus('');
    api._azurirajStatus(null);
    api._azurirajStatus(undefined);
    api._azurirajStatus(42);
    assert.deepStrictEqual(toasts, []);
  });

  console.log('\n_updBrzinaEta / _updMB — brzina i preostalo vrijeme preuzimanja:');

  const helpers = new Function(extractFn('_updMB') + '\n' + extractFn('_updBrzinaEta') + '\nreturn { _updMB, _updBrzinaEta };')();

  t('manje od dva uzorka ili prekratak razmak ne izmišlja brzinu', () => {
    assert.deepStrictEqual(helpers._updBrzinaEta([], 0, 100), { brzina:'', eta:'' });
    assert.deepStrictEqual(helpers._updBrzinaEta([{ t:0, b:0 }], 0, 100), { brzina:'', eta:'' });
    assert.deepStrictEqual(helpers._updBrzinaEta([{ t:0, b:0 }, { t:500, b:9e6 }], 9e6, 2e7), { brzina:'', eta:'' });
  });

  t('računa MB/s i preostale sekunde iz uzoraka', () => {
    const r = helpers._updBrzinaEta([{ t:0, b:0 }, { t:2000, b:4 * 1048576 }], 4 * 1048576, 24 * 1048576);
    assert.strictEqual(r.brzina, '2.0 MB/s');
    assert.strictEqual(r.eta, 'još ~10 s');
  });

  t('spora veza: KB/s i minute', () => {
    const r = helpers._updBrzinaEta([{ t:0, b:0 }, { t:4000, b:200 * 1024 }], 200 * 1024, 20 * 1048576);
    assert.strictEqual(r.brzina, '50 KB/s');
    assert.ok(/min$/.test(r.eta), 'preko minute mora ići u minute: ' + r.eta);
  });

  t('bajtovi koji ne rastu (zastoj) ne daju brzinu', () => {
    assert.deepStrictEqual(helpers._updBrzinaEta([{ t:0, b:500 }, { t:3000, b:500 }], 500, 1000), { brzina:'', eta:'' });
  });

  t('_updMB formatira jednu decimalu, preko 100 MB cijeli broj', () => {
    assert.strictEqual(helpers._updMB(23.4 * 1048576), '23.4 MB');
    assert.strictEqual(helpers._updMB(150 * 1048576), '150 MB');
    assert.strictEqual(helpers._updMB(undefined), '0.0 MB');
  });

  console.log('\nJava UpdateBridge — invarijante (sandbox ne kompajlira Javu):');
  const JAVA = fs.readFileSync(path.join(__dirname, '../../android/app/src/main/java/ba/spd/uss/vlake/MainActivity.java'), 'utf8');

  t('preuzimanje nastavlja od prekida (Range) i ponavlja pokušaj', () => {
    assert.ok(/setRequestProperty\("Range", "bytes=" \+ vec \+ "-"\)/.test(JAVA), 'nema Range nastavka');
    assert.ok(/MAX_POKUSAJA/.test(JAVA) && /preuzmiSaNastavkom/.test(JAVA), 'nema petlje ponovnih pokušaja');
  });

  t('nepotpun fajl se ne predaje instalaciji (provjera veličine iz objave)', () => {
    assert.ok(/optLong\("size"/.test(JAVA), 'veličina asseta se ne čita iz objave');
    assert.ok(/dio\.length\(\) != apkVelicina/.test(JAVA), 'nema provjere veličine prije instalacije');
  });

  t('svaka faza koju Java šalje postoji u JS tabeli faza', () => {
    const faze = new Set([...JAVA.matchAll(/napredak\("([a-z]+)"/g)].map(m => m[1]));
    const js = extractFn('_azurirajNapredak') && HTML.slice(HTML.indexOf('const _UPD_FAZE'), HTML.indexOf('const _UPD_ZAVRSNE'));
    for (const f of faze) assert.ok(new RegExp('\\b' + f + ':').test(js), 'JS ne zna fazu "' + f + '"');
    assert.ok(faze.size >= 7, 'očekivano bar 7 faza, nađeno ' + faze.size);
  });

  console.log('\n' + pass + ' prošlo, ' + fail + ' palo');
  process.exit(fail ? 1 : 0);
})();
