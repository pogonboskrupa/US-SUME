// =====================================================================
// Testovi za _fetchT — rok mrežnog poziva koji NE smije zavisiti od
// AbortSignal.timeout() (v1.6.0).
// Pokretanje:  node tests/js/fetch-rok.test.js
// ---------------------------------------------------------------------
// UZROK: _fetchT je uveden (v3.102.1) baš zato što na terenu navigator.onLine
// laže 'true' na mrtvoj vezi (OS-S4) pa `await fetch(...)` bez roka VISI umjesto
// da padne. Ali sam helper je rok pravio preko AbortSignal.timeout(), koja
// postoji tek od Chrome/WebView 103 (2022) — a minSdk je 24 (Android 7) i
// WebView na terenskom uređaju zna biti godinama star bez Play Store update-a.
// Tamo je provjera `typeof AbortSignal.timeout === 'function'` bila FALSE i
// helper je TIHO padao na fetch BEZ IKAKVOG ROKA: tačno onaj bug koji je trebao
// spriječiti, samo sakriven u fallback grani i vidljiv SAMO na starom uređaju.
//
// Testira se STVARNI kod izvučen iz index.html.
// =====================================================================
'use strict';
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const HTML = fs.readFileSync(path.join(__dirname, '../../index.html'), 'utf8');

// ZAMKA (v1.6.0): uobičajeni extractFn iz ostalih test fajlova traži PRVU '{'
// poslije imena funkcije — a to je kod `_fetchT(url, ms = 12000, opts = {})`
// vitičasta zagrada ZADANOG PARAMETRA, ne tijela. Brojač zagrada se tu odmah
// zatvori i izvuče se `function _fetchT(url, ms = 12000, opts = {}` bez tijela,
// što puca kao "Unexpected token 'return'" i navodi na pogrešan trag. Zato se
// prvo pronađe kraj liste parametara, pa tek onda '{' tijela.
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

// Komentari se moraju izbaciti prije invarijanti nad markupom — inače
// dokumentacija izmjene obori test te iste izmjene (dokumentovana zamka iz
// v1.5.3: asercija "nema X u kodu" pala je na komentaru koji objašnjava
// zašto je X uklonjen).
const HTML_BEZ_KOMENTARA = HTML.split('\n')
  .map(red => red.replace(/^\s*\/\/.*$/, ''))
  .join('\n');

let pass = 0, fail = 0;
async function ta(name, fn) {
  try { await fn(); console.log('  ✔ ' + name); pass++; }
  catch (e) { fail++; console.log('  ✘ ' + name + '\n      ' + e.message); }
}
function t(name, fn) {
  try { fn(); console.log('  ✔ ' + name); pass++; }
  catch (e) { fail++; console.log('  ✘ ' + name + '\n      ' + e.message); }
}

// Sandbox koji oponaša STARI WebView: AbortSignal postoji (Chrome 66+), ali
// AbortSignal.timeout NE postoji (stiže tek u 103). Ako se _fetchT osloni na
// nju, ovdje ostaje bez roka i test to uhvati.
function makeStariWebView(opts = {}) {
  const stanje = { pozvan: 0, prekinut: null, zadnjiOpts: null };
  class FakeAbortSignal {
    constructor() { this.aborted = false; this.reason = undefined; this._l = []; }
    addEventListener(_ev, fn) { this._l.push(fn); }
    removeEventListener(_ev, fn) { this._l = this._l.filter(x => x !== fn); }
  }
  class FakeAbortController {
    constructor() { this.signal = new FakeAbortSignal(); }
    abort(reason) {
      if (this.signal.aborted) return;
      this.signal.aborted = true;
      this.signal.reason = reason;
      this.signal._l.slice().forEach(fn => fn());
    }
  }
  // NAMJERNO bez .timeout — to je cijela poenta ovog sandboxa.
  const AbortSignalStub = function () {};

  const fetchStub = (url, o) => {
    stanje.pozvan++;
    stanje.zadnjiOpts = o;
    return new Promise((resolve, reject) => {
      const sig = o && o.signal;
      if (sig) {
        // Stvarni fetch odbija ODMAH ako je signal već prekinut prije poziva —
        // bez ovoga stub visi zauvijek i test se nikad ne završi (a uzrok
        // izgleda kao bug u _fetchT, iako je u stubu).
        if (sig.aborted) {
          stanje.prekinut = sig.reason;
          reject(sig.reason || new Error('abort'));
          return;
        }
        sig.addEventListener('abort', () => {
          stanje.prekinut = sig.reason;
          reject(sig.reason || new Error('abort'));
        });
      }
      if (opts.odgovoriOdmah) resolve({ ok: true });
      // inače: nikad se ne rješava — simulira vezu koja VISI (OS-S4)
    });
  };

  const src = extractFn('_fetchT');
  const keys = ['fetch', 'AbortController', 'AbortSignal', 'setTimeout'];
  const vals = [fetchStub, FakeAbortController, AbortSignalStub, setTimeout];
  const api = new Function(...keys, src + '\nreturn { _fetchT };')(...vals);
  return { api, stanje };
}

console.log('_fetchT — rok radi i bez AbortSignal.timeout (stari WebView):');

(async () => {
  await ta('veza koja VISI se prekida po isteku roka, ne čeka zauvijek', async () => {
    const { api, stanje } = makeStariWebView();
    const p = api._fetchT('https://primjer/x', 30);
    let greska = null;
    try { await p; } catch (e) { greska = e; }
    assert.ok(greska, 'poziv je morao baciti po isteku roka, a nije — visi kao prije popravke');
    assert.strictEqual(greska.name, 'TimeoutError', 'greška mora biti prepoznatljiva kao istek, ne generička');
    assert.ok(stanje.prekinut, 'signal je morao biti prekinut (abort), ne samo odbijeno obećanje');
  });

  await ta('signal se PROSLJEĐUJE fetch-u (inače rok ne može ništa prekinuti)', async () => {
    const { api, stanje } = makeStariWebView({ odgovoriOdmah: true });
    await api._fetchT('https://primjer/x', 50);
    assert.ok(stanje.zadnjiOpts && stanje.zadnjiOpts.signal,
      'fetch je pozvan BEZ signala — rok tad ne postoji');
  });

  await ta('uspješan odgovor prolazi normalno (rok ne smeta ispravnom pozivu)', async () => {
    const { api } = makeStariWebView({ odgovoriOdmah: true });
    const r = await api._fetchT('https://primjer/x', 50);
    assert.strictEqual(r.ok, true);
  });

  await ta('prekid koji traži POZIVALAC se poštuje (upstream signal)', async () => {
    const { api, stanje } = makeStariWebView();
    // Pozivalac šalje svoj signal i prekida ga prije nego rok istekne.
    const gornji = { aborted: false, reason: undefined, _l: [],
      addEventListener(_e, fn) { this._l.push(fn); } };
    const p = api._fetchT('https://primjer/x', 5000, { signal: gornji });
    gornji.aborted = true;
    gornji.reason = new Error('korisnik napustio ekran');
    gornji._l.forEach(fn => fn());
    let greska = null;
    try { await p; } catch (e) { greska = e; }
    assert.ok(greska, 'prekid pozivaoca mora oboriti poziv');
    assert.strictEqual(stanje.prekinut && stanje.prekinut.message, 'korisnik napustio ekran',
      'mora se proslijediti RAZLOG pozivaoca, ne izmišljen istek');
  });

  await ta('signal pozivaoca koji je VEĆ prekinut obara poziv odmah', async () => {
    const { api, stanje } = makeStariWebView();
    const gornji = { aborted: true, reason: new Error('već otkazano'), _l: [],
      addEventListener(_e, fn) { this._l.push(fn); } };
    let greska = null;
    try { await api._fetchT('https://primjer/x', 5000, { signal: gornji }); }
    catch (e) { greska = e; }
    assert.ok(greska, 'već prekinut signal ne smije pustiti poziv da visi');
    assert.strictEqual(stanje.prekinut && stanje.prekinut.message, 'već otkazano');
  });

  console.log('\nINVARIJANTE nad index.html (regresija se lako tiho vrati):');

  t('nijedan mrežni rok se ne oslanja na AbortSignal.timeout', () => {
    const pogodci = HTML_BEZ_KOMENTARA.split('\n')
      .map((red, i) => ({ red, br: i + 1 }))
      .filter(x => x.red.includes('AbortSignal.timeout'));
    assert.strictEqual(pogodci.length, 0,
      'AbortSignal.timeout tiho nestaje na WebView-u < 103 i ostavlja poziv BEZ roka; koristiti _fetchT. Nađeno na linijama: ' +
      pogodci.map(x => x.br).join(', '));
  });

  t('_fetchT stvarno koristi AbortController + setTimeout', () => {
    const src = extractFn('_fetchT');
    assert.ok(/new AbortController\(\)/.test(src), '_fetchT mora praviti vlastiti AbortController');
    assert.ok(/setTimeout\(/.test(src), '_fetchT mora imati tajmer koji prekida poziv');
    assert.ok(/signal:\s*ctl\.signal/.test(src), 'signal kontrolera mora stvarno otići u fetch');
  });

  t('tajmer se NE čisti kad odgovor stigne (štiti i čitanje tijela)', () => {
    const src = extractFn('_fetchT');
    assert.ok(!/clearTimeout/.test(src),
      'čišćenje tajmera na dolazak zaglavlja ostavlja SPORO ČITANJE TIJELA bez roka — ' +
      'isti kvar, samo faza kasnije (vidi reliableFetch koji tijelo namjerno štiti)');
  });

  console.log('\n' + pass + ' prošlo, ' + fail + ' palo');
  if (fail) process.exit(1);
})();
