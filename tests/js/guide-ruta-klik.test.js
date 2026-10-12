// "Vodi me" — klik na nacrtanu rutu (v2.9.4), nad STVARNIM kodom iz index.html.
//
// Zašto: ruta se crta u podrazumijevanom canvasu (overlayPane, z 400), a vlake
// i mjerenja u vlastitim canvasima istog ili višeg z-indexa preko cijele karte
// — klik do linije rute ne stigne (zamka v3.101.0). map.on('click') zato pita
// _guideHitTest, u pikselima.

const fs = require('fs');
const path = require('path');
const SRC = fs.readFileSync(path.join(__dirname, '../../index.html'), 'utf8');

let ok = 0, fail = 0;
function t(ime, fn) {
  try { fn(); ok++; }
  catch (e) { fail++; console.log('  PAO:', ime, '\n    ', e.message); }
}
function eq(a, b, msg) {
  if (a !== b) throw new Error((msg || '') + ' očekivano ' + JSON.stringify(b) + ', dobijeno ' + JSON.stringify(a));
}
function extractFn(naziv) {
  let i = SRC.indexOf('async function ' + naziv + '(');
  if (i < 0) i = SRC.indexOf('function ' + naziv + '(');
  if (i < 0) throw new Error('nema funkcije ' + naziv);
  let d = 0, p = false;
  for (let j = i; j < SRC.length; j++) {
    if (SRC[j] === '{') { d++; p = true; }
    else if (SRC[j] === '}') { d--; if (p && !d) return SRC.slice(i, j + 1); }
  }
  throw new Error('zagrade ' + naziv);
}

// 1 stepen = 1000 px, bez projekcije.
function sandbox(active, onMap = true) {
  const px = ll => ({ x: (ll.lng ?? ll.lo) * 1000, y: -(ll.lat ?? ll.la) * 1000 });
  const line = { getLatLngs: () => [{ lat: 0, lng: 0 }, { lat: 0, lng: 1 }], opened: null, openPopup(ll) { this.opened = ll; } };
  const mk = (lat, lng) => ({ getLatLng: () => ({ lat, lng }) });
  const map = { latLngToContainerPoint: px, hasLayer: l => onMap && l === line };
  const layer = [{}, line, mk(0, 0), mk(0, 1)];
  const f = new Function('map', 'window', '_guideResultLayer', '_guideActiveRouteId',
    extractFn('_distToSegPx') + '\nconst _GUIDE_HIT_PX = 22;\n' + extractFn('_guideHitTest') + '\n' + extractFn('_guideOpenPopupNa') +
    '\nreturn {_guideHitTest,_guideOpenPopupNa};');
  return { ...f(map, { map }, active ? layer : null, active ? 'r1' : null), line };
}

t('klik tačno na liniji pogađa rutu', () => eq(sandbox(true)._guideHitTest({ lat: 0, lng: 0.5 }), true));
t('klik 15 px pored linije (prst) i dalje pogađa', () => eq(sandbox(true)._guideHitTest({ lat: 0.015, lng: 0.5 }), true));
t('klik 40 px dalje ne pogađa', () => eq(sandbox(true)._guideHitTest({ lat: 0.04, lng: 0.5 }), false));
t('bez nacrtane rute nema pogotka', () => eq(sandbox(false)._guideHitTest({ lat: 0, lng: 0.5 }), false));
t('ruta sklonjena sa karte nije klikabilna', () => eq(sandbox(true, false)._guideHitTest({ lat: 0, lng: 0.5 }), false));
t('popup se otvara na mjestu klika', () => {
  const s = sandbox(true); s._guideOpenPopupNa({ lat: 0, lng: 0.3 });
  eq(s.line.opened.lng, 0.3);
});
t('map.on(click) pita rutu prije vlaka', () => {
  const i = SRC.indexOf("map.on('click', e => {"), blok = SRC.slice(i, i + 9000);
  const r = blok.indexOf('_guideHitTest(e.latlng)'), v = blok.indexOf('showVlakaPopup(bestI');
  if (r < 0 || v < 0 || r > v) throw new Error('ruta mora biti provjerena prije vlaka');
});
t('popup čita svjež naziv iz registra (preimenovanje)', () => {
  if (!/_guideRoutesLoad\(\)\.find\(r => r\.id === routeMeta\.id\)/.test(extractFn('_guideDrawResult'))) throw new Error('popup koristi zastarjeli objekat');
});
t('popup nudi preimenovanje, profil i sklanjanje sa karte', () => {
  const b = extractFn('_guideRoutePopupHtml');
  for (const fn of ['_guideRenameRoute', '_guideProfilRoute', '_guideHideResult', '_guideExploreRoute', '_guideAskDeleteRoute'])
    if (!b.includes(fn)) throw new Error('nedostaje ' + fn);
});

console.log(`guide-ruta-klik: ${ok} ok, ${fail} palo`);
process.exit(fail ? 1 : 0);
