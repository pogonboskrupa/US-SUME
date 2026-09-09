// =====================================================================
// Testovi za prečicu "Snimi trag" u popupu "Moja lokacija" (v3.126.0).
// Pokretanje:  node tests/js/loc-popup-trag.test.js
// ---------------------------------------------------------------------
// Zašto ovo postoji: korisnik koji je već otvorio "Moja lokacija" (GPS/
// kompas/radijus) ranije je morao zatvoriti popup i ići na Tragovi tab da
// bi počeo snimati trag. Dugme "Snimi trag" je dodano DIREKTNO u taj popup,
// pored kompasa — poziva POSTOJEĆI fabSnimTrag() (već toggle: start kad ne
// snima, spremi/završi kad snima), ne duplira logiku.
//
// Dvije stvari koje moraju ostati tačne:
//   1. Klik zatvara popup i zove fabSnimTrag() TAČNO jednom — ne treba dva
//      poziva (npr. ako se popup i akcija slučajno okinu odvojeno).
//   2. Kad se popup OTVORI, dugme mora pokazati STVARNO stanje snimanja —
//      trag je mogao biti započet negdje drugo (Tragovi tab), pa bi tekst
//      "Snimi trag" ovdje bio laž koja vodi na tiho gašenje snimanja.
//
// Testira se STVARNI izvorni kod — funkcije se izvlače direktno iz index.html.
// =====================================================================
'use strict';
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const HTML = fs.readFileSync(path.join(__dirname, '../../index.html'), 'utf8');

function extractFn(name) {
  const re = new RegExp('function ' + name + '\\(');
  const start = HTML.search(re);
  assert.ok(start >= 0, 'nije nađena funkcija ' + name + ' u index.html');
  let fstart = HTML.indexOf('function', start);
  if (HTML.slice(Math.max(0, fstart - 6), fstart) === 'async ') fstart -= 6;
  let i = HTML.indexOf('{', fstart), depth = 0;
  for (; i < HTML.length; i++) {
    if (HTML[i] === '{') depth++;
    else if (HTML[i] === '}') { depth--; if (depth === 0) return HTML.slice(fstart, i + 1); }
  }
  throw new Error('nezatvorena funkcija ' + name);
}

let pass = 0, fail = 0;
function t(name, fn) {
  try { fn(); pass++; console.log('  ✔ ' + name); }
  catch (e) { fail++; console.log('  ✘ ' + name + '\n      ' + e.message); }
}

function makeEl() {
  return { style: {}, classList: { toggle(){} }, textContent: '' };
}

// _locPopupSnimiTrag zove document.getElementById('ab-loc-popup').style.display
// direktno (isti obrazac kao _locPopupCentriraj) — bez try/catch, pa mock MORA
// vratiti element sa .style za baš taj id, ostali mogu biti null.
function makeSnimi({ pozvanoFn } = {}) {
  const popup = makeEl();
  const sandbox = {
    document: { getElementById: (id) => id === 'ab-loc-popup' ? popup : null },
    fabSnimTrag: pozvanoFn || (() => {}),
  };
  const keys = Object.keys(sandbox);
  const api = new Function(...keys, extractFn('_locPopupSnimiTrag') + '\nreturn { _locPopupSnimiTrag };')(...keys.map(k => sandbox[k]));
  return { api, popup };
}

console.log('_locPopupSnimiTrag — zatvara popup i delegira na fabSnimTrag:');

t('zatvara #ab-loc-popup (display:none)', () => {
  const { api, popup } = makeSnimi();
  api._locPopupSnimiTrag();
  assert.strictEqual(popup.style.display, 'none');
});

t('poziva fabSnimTrag() TAČNO jednom, bez argumenata', () => {
  let pozvano = 0, args = null;
  const { api } = makeSnimi({ pozvanoFn: (...a) => { pozvano++; args = a; } });
  api._locPopupSnimiTrag();
  assert.strictEqual(pozvano, 1);
  assert.deepStrictEqual(args, []);
});

console.log('_updGpsSwitch — dugme "Snimi trag" prati _tragOn kad se popup otvori:');

function makeSwitch({ tragOn }) {
  const els = {
    'ab-loc-trag-txt': makeEl(),
    'ab-loc-trag': makeEl(),
  };
  const sandbox = {
    document: { getElementById: (id) => els[id] || null },
    gpsOn: false, _compassConeOn: false, _radiusOn: false, _forestMode: false,
    _tragOn: tragOn,
  };
  const keys = Object.keys(sandbox);
  const api = new Function(...keys, extractFn('_updGpsSwitch') + '\nreturn { _updGpsSwitch };')(...keys.map(k => sandbox[k]));
  api._updGpsSwitch();
  return els;
}

t('trag NE snima → "Snimi trag", narandžasta paleta', () => {
  const els = makeSwitch({ tragOn: false });
  assert.strictEqual(els['ab-loc-trag-txt'].textContent, 'Snimi trag');
  assert.strictEqual(els['ab-loc-trag'].style.color, '#c2410c');
});

t('trag SNIMA (started elsewhere, npr. Tragovi tab) → "Završi trag", crvena paleta', () => {
  const els = makeSwitch({ tragOn: true });
  assert.strictEqual(els['ab-loc-trag-txt'].textContent, 'Završi trag');
  assert.strictEqual(els['ab-loc-trag'].style.color, '#dc2626');
});

t('nedostajući elementi (npr. popup nikad otvoren, DOM još nije parsiran) ne bacaju', () => {
  const sandbox = {
    document: { getElementById: () => null },
    gpsOn: false, _compassConeOn: false, _radiusOn: false, _forestMode: false, _tragOn: false,
  };
  const keys = Object.keys(sandbox);
  const api = new Function(...keys, extractFn('_updGpsSwitch') + '\nreturn { _updGpsSwitch };')(...keys.map(k => sandbox[k]));
  assert.doesNotThrow(() => api._updGpsSwitch());
});

console.log('\n' + pass + ' prošlo, ' + fail + ' palo');
process.exit(fail ? 1 : 0);
