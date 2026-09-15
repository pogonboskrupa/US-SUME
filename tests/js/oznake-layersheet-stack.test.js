// =====================================================================
// Testovi za openOznakePanel() / _openLayerSheet() međusobno zatvaranje (v1.5.0).
// Pokretanje:  node tests/js/oznake-layersheet-stack.test.js
// ---------------------------------------------------------------------
// Terenska prijava (screenshot): "Prikazane oznake" (folder ikonica, 📁) i
// "Slojevi karte" (planina ikonica, ⛰) su se prikazivali ISTOVREMENO, jedan
// preko drugog — korisnik je opisao to kao "pojavi se [Oznake panel] jedino
// kad kliknem Karte iznad" (sub-tab unutar Slojeva karte).
//
// Kod je pregledan liniju po liniju: _lsTab(), switchTab() i _openLayerSheet()
// NIGDJE ne pozivaju openOznakePanel(), niti obrnuto — ova dva bottom-sheet
// modala su NEZAVISNA i nikad se nisu zatvarala jedan drugog. Ako korisnik
// otvori Oznake panel (📁 ili "≡ Prikazani slojevi i oznake" u Terenu), pa se
// bez X-a prebaci i otvori Slojeve karte (⛰), oba ostaju prikazana odjednom —
// tačno ono što screenshot pokazuje. Popravka: svaki od dva "open" poziva sad
// PRVO zatvori onaj drugi, isti obrazac kao dokumentovane popravke osirotjelih
// overlay-a/canvas-a (v3.119.1, v1.4.8/v1.4.9) — nikad dva nezavisna full-
// screen/bottom-sheet modala istovremeno vidljiva.
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

function mkEl() { return { style: { display: 'none' } }; }

function makeEnv() {
  const els = {
    'oznake-bg': mkEl(), 'oznake-panel': mkEl(),
    'layer-sheet-bg': mkEl(), 'layer-sheet': mkEl(),
  };
  const document = {
    getElementById: (id) => els[id] || null,
    querySelectorAll: () => [],
  };
  // openOznakePanel() zove _rndOznakePanel(); _openLayerSheet() zove gomilu
  // pomoćnih render funkcija — sve se stubuju kao no-op da test ostane
  // fokusiran isključivo na koordinaciju dva overlay-a, ne na render detalje.
  const noop = () => {};
  const sandbox = {
    document,
    _rndOznakePanel: noop,
    _kmlEditIdx: -1,
    _lsTab: noop,
    _ovlState: {},
    _wbOn: false,
    _wbReleases: null,
    _instUpdateStats: noop,
    _lsRenderSqlite: noop,
    _activeLayerKey: () => null,
    TL: {},
    _lsRenderGranice: noop,
    _lsRenderCache: noop,
    _lsRenderTem: noop,
    _geojsonLayer: null,
    _escHtml: (s) => s,
  };
  const src = extractFn('closeOznakePanel') + '\n' +
              extractFn('openOznakePanel') + '\n' +
              extractFn('closeLayerSheet') + '\n' +
              extractFn('_openLayerSheet');
  const keys = Object.keys(sandbox);
  const fn = new Function(...keys,
    src + '\nreturn { openOznakePanel, closeOznakePanel, closeLayerSheet, _openLayerSheet };');
  const api = fn(...keys.map(k => sandbox[k]));
  return { api, els };
}

console.log('openOznakePanel() / _openLayerSheet() — ne smiju biti prikazani istovremeno:');

t('otvoren Oznake panel se zatvori kad se otvore Slojevi karte', () => {
  const { api, els } = makeEnv();
  api.openOznakePanel();
  assert.strictEqual(els['oznake-panel'].style.display, 'block');
  api._openLayerSheet();
  assert.strictEqual(els['layer-sheet'].style.display, 'block', 'Slojevi karte moraju biti otvoreni');
  assert.strictEqual(els['oznake-panel'].style.display, 'none', 'Oznake panel MORA biti zatvoren');
  assert.strictEqual(els['oznake-bg'].style.display, 'none');
});

t('otvoreni Slojevi karte se zatvore kad se otvori Oznake panel', () => {
  const { api, els } = makeEnv();
  api._openLayerSheet();
  assert.strictEqual(els['layer-sheet'].style.display, 'block');
  api.openOznakePanel();
  assert.strictEqual(els['oznake-panel'].style.display, 'block', 'Oznake panel mora biti otvoren');
  assert.strictEqual(els['layer-sheet'].style.display, 'none', 'Slojevi karte MORAJU biti zatvoreni');
  assert.strictEqual(els['layer-sheet-bg'].style.display, 'none');
});

t('otvaranje istog panela dva puta ostaje ispravno (idempotentno)', () => {
  const { api, els } = makeEnv();
  api.openOznakePanel();
  api.openOznakePanel();
  assert.strictEqual(els['oznake-panel'].style.display, 'block');
});

console.log('\n' + pass + ' prošlo, ' + fail + ' palo');
process.exit(fail ? 1 : 0);
