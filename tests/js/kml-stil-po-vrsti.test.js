'use strict';
// Stil KML fajla prema sadržaju: samo tačke → stil tačaka (bez linije/ispune); poligoni → linija + ispuna.
const assert = require('assert'), fs = require('fs');
const le = fs.readFileSync(__dirname + '/../../static/js/layer-editor.js', 'utf8');
const { izvor } = require('./_izvor'); const src = izvor();
const fn = (s, n) => { const a = s.indexOf('function ' + n + '('); let d = 0, i = s.indexOf('{', a); for (; i < s.length; i++) { if (s[i] === '{') d++; else if (s[i] === '}' && !--d) break; } return s.slice(a, i + 1); };
function kontrole(vr, k) {
  const env = { kmlLs: [k], _LE_COLORS: ['#ff0000'], _LE_PATTERNS: [['solid', 'Puna']], _layerColor: c => c, window: {}, _kmlGrpVrste: () => vr, _kmlGrpHasPolygon: () => vr.poligoni > 0 };
  return new Function(...Object.keys(env), fn(le, '_layerStyleControls') + ';return _layerStyleControls;')(...Object.values(env))(0);
}
const k = { col: '#ff0000', weight: 2, opacity: .9, ptR: 7 };
const t = kontrole({ tacke: 5578, linije: 0, poligoni: 0 }, k);
assert(/Veličina tačke/.test(t) && /Tačke \(5578\)/.test(t) && /value="7"/.test(t), 'samo tačke: stil tačaka');
assert(!/Linija i obrub/.test(t) && !/Ispuna poligona/.test(t) && !/Samo obrub/.test(t), 'samo tačke: bez linije/ispune');
const p = kontrole({ tacke: 0, linije: 0, poligoni: 12 }, k);
assert(/Linija i obrub/.test(p) && /Ispuna poligona/.test(p) && !/Veličina tačke/.test(p), 'poligoni: linija + ispuna, bez tačaka');
const m = kontrole({ tacke: 3, linije: 0, poligoni: 2 }, k);
assert(/Linija i obrub/.test(m) && /Veličina tačke/.test(m), 'mješovito: oboje');
assert(!/_layerPreview\(i\)\+/.test(fn(le, '_layerStyleControls')), 'bez pregleda geometrije');
// ptR se validira i primjenjuje kao radius tačke
assert(/prop==='ptR'\)value=Math\.max\(2,Math\.min\(14/.test(le));
assert(/if \(l\._kmlIsPoint\) \{ lo\.radius = k\.ptR \|\| 5;/.test(src) && /ptR: data\.ptR \|\| 5/.test(src) && /store\[origName\]\.ptR/.test(src), 'ptR primjena + čuvanje');
console.log('kml-stil-po-vrsti: ok');
// KML linije bez dodatnog nevidljivog sloja za klik (klik hvata _kmlHitTest u map.on('click'))
{
  const b = fn(src, '_bindKmlPopup');
  assert(!/L\.polyline\(/.test(b), 'bez hit-sloja po liniji (dvostruki broj slojeva)');
  assert(/const kl = _kmlHitTest\(e\.latlng\);\s*if \(kl\) \{ _kmlOpenPopup\(kl, e\.latlng\); return; \}/.test(src), 'fallback klik postoji');
  assert(/o\.slojeviPo = /.test(src), 'Dijagnostika: raspodjela slojeva');
  console.log('kml linije bez hit-sloja + dijagnostika slojeva: ok');
}
