// =====================================================================
// Zaostao Leaflet canvas renderer guta SVE dodire na karti (v1.6.0).
// Pokretanje:  node tests/js/pane-renderer-klik.test.js
// ---------------------------------------------------------------------
// UZROK: karta radi sa preferCanvas:true. Kad u neki pane uđe prvi canvas sloj
// BEZ eksplicitne `renderer:` opcije, Leaflet sam napravi renderer za taj pane,
// kešira ga u map._paneRenderers i NIKAD ga ne vrati — ni kad zadnji sloj koji
// ga je koristio nestane sa karte. Taj canvas je JEDAN element preko CIJELE
// karte, pa i potpuno prazan guta svaki dodir sloju ispod.
//
// Konkretan slučaj: kalibracija referentne karte je plavu tačku crtala kao
// L.circleMarker u pane 'refKarte' (z-index 620 — IZNAD mjerenja 410, vlaka 400
// i oznaka 401). Jedna kalibraciona tačka = mrtvi klikovi na cijeloj karti, i
// to TRAJNO, jer brisanje markera ne uklanja renderer.
//
// Isti bug je već dvaput prijavljen sa terena (v1.4.8/v1.4.9 — "izmjere
// površine i ostalo nije klikabilno"), a mehanizam koji ga je čistio uklonjen
// je u v1.5.7 zajedno sa sekcijom Požari.
//
// Testira se STVARNI Leaflet iz static/libs (isti fajl kao produkcija).
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

let pass = 0, fail = 0;
function t(name, fn) {
  try { fn(); console.log('  ✔ ' + name); pass++; }
  catch (e) { fail++; console.log('  ✘ ' + name + '\n      ' + e.message); }
}

console.log('_oslobodiPaneRenderer — oslobađa zaostao canvas:');

// Lažna karta koja vjerno oponaša Leafletov map._paneRenderers keš.
function makeMap(sadrzi) {
  const uklonjeni = [];
  return {
    _paneRenderers: sadrzi ? { refKarte: { _id: 'r1' }, drugi: { _id: 'r2' } } : {},
    hasLayer: () => true,
    removeLayer: (l) => uklonjeni.push(l._id),
    _uklonjeni: uklonjeni
  };
}
function runOslobodi(map, ime) {
  const api = new Function('map', extractFn('_oslobodiPaneRenderer') +
    '\nreturn { _oslobodiPaneRenderer };')(map);
  return api._oslobodiPaneRenderer(ime);
}

t('uklanja renderer sa karte I briše ga iz keša (oboje je nužno)', () => {
  const map = makeMap(true);
  assert.strictEqual(runOslobodi(map, 'refKarte'), true);
  assert.deepStrictEqual(map._uklonjeni, ['r1'], 'renderer mora biti skinut sa karte');
  assert.ok(!('refKarte' in map._paneRenderers),
    'bez delete iz keša _getPaneRenderer vraća VEĆ UKLONJEN renderer i sljedeći sloj ' +
    'crta u otkačen canvas koji se nikad ne prikaže');
});

t('ne dira renderere DRUGIH pane-ova', () => {
  const map = makeMap(true);
  runOslobodi(map, 'refKarte');
  assert.ok(map._paneRenderers.drugi, 'tuđi pane ne smije biti dotaknut');
});

t('nepostojeći renderer vraća false i ne baca', () => {
  assert.strictEqual(runOslobodi(makeMap(false), 'refKarte'), false);
});

t('pad Leafleta unutra se guta (čišćenje ne smije oboriti pozivaoca)', () => {
  const map = { get _paneRenderers() { throw new Error('bum'); } };
  assert.strictEqual(runOslobodi(map, 'refKarte'), false);
});

console.log('\nKalibracija referentne karte — bez canvasa u pane-u 620:');

t('KLJUČNO: plava kalibraciona tačka NIJE circleMarker (canvas u refKarte)', () => {
  const src = extractFn('_refCalibClick');
  const uRefKarte = src.split('\n').filter(r => /circleMarker/.test(r) && /refKarte/.test(r));
  assert.strictEqual(uRefKarte.length, 0,
    'circleMarker u pane-u refKarte (z-index 620) natjera Leaflet da napravi canvas ' +
    'preko cijele karte koji guta sve dodire ispod. Nađeno: ' + uRefKarte.join(' | '));
});

t('kalibraciona tačka se crta kao divIcon marker (DOM, ne canvas)', () => {
  const src = extractFn('_refCalibClick');
  assert.ok(/L\.marker\(/.test(src) && /divIcon/.test(src),
    'plava tačka mora biti divIcon, isto kao zeleni marker u _refCalibRedrawMarkers');
});

t('_refCalibStop oslobađa pane i za uređaje koji su kalibrirali prije update-a', () => {
  const src = extractFn('_refCalibStop');
  assert.ok(/_oslobodiPaneRenderer\('refKarte'\)/.test(src),
    'bez ovoga renderer zaostao iz starije verzije ostaje do kraja sesije');
});

console.log('\nINVARIJANTA — nijedan canvas sloj iznad interaktivnih pane-ova:');

t('nijedan circleMarker/polyline/polygon ne ide u pane refKarte (620)', () => {
  // Komentari se izbacuju — inače dokumentacija ove izmjene obori test te
  // iste izmjene (dokumentovana zamka iz v1.5.3).
  const bezKom = HTML.split('\n').map(r => r.replace(/^\s*\/\/.*$/, '')).join('\n');
  const lose = bezKom.split('\n')
    .map((red, i) => ({ red, br: i + 1 }))
    .filter(x => /pane\s*:\s*'refKarte'/.test(x.red) &&
                 /L\.(circleMarker|polyline|polygon|circle)\(/.test(x.red));
  assert.strictEqual(lose.length, 0,
    'canvas sloj u pane-u 620 guta dodire svemu ispod. Linije: ' + lose.map(x => x.br).join(', '));
});

console.log('\n' + pass + ' prošlo, ' + fail + ' palo');
process.exit(fail ? 1 : 0);
