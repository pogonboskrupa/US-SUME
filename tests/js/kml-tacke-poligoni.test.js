'use strict';
// v3.7.1: tačke zadano 3 px; fajl s tačkama ne prikazuje poligone; poligon fajl je oker s 60 % ispune;
// izabran odsjek dobija jasan stil (plava ispuna, fill:true).
const assert = require('assert'), fs = require('fs');
const { izvor } = require('./_izvor'); const src = izvor();
const lli = fs.readFileSync(__dirname + '/../../static/js/local-layer-import.js', 'utf8');
const pb = fs.readFileSync(__dirname + '/../../static/js/doznaka-project-boundary.js', 'utf8');
const fn = (s, n) => { const a = s.indexOf('function ' + n + '('); assert(a >= 0, n); let d = 0, i = s.indexOf('{', a); for (; i < s.length; i++) { if (s[i] === '{') d++; else if (s[i] === '}' && !--d) break; } return s.slice(a, i + 1); };

function sloj(tip, ime) {
  const l = { options: { interactive: true }, stilovi: [], opac: null, _kmlName: ime || 'x',
    setStyle(o) { this.stilovi.push(o); Object.assign(this.options, o); }, setOpacity(v) { this.opac = v; } };
  if (tip === 'poly') l._kmlIsPolygon = true;
  if (tip === 'pt') l._kmlIsPoint = true;
  if (tip === 'lbl') { l._kmlLabel = true; delete l.setStyle; }
  return l;
}
function primijeni(k, slojevi) {
  k.grp = { eachLayer(f) { slojevi.forEach(f); }, _layers: {}, _tackeSloj: null };
  const env = { kmlLs: [k], _ensureKmlPattern: () => null, _kmlCanvasPattern: () => null, L: { Canvas: function () {} }, Object };
  new Function(...Object.keys(env), fn(src, 'applyKmlStyle') + ';applyKmlStyle(0);')(...Object.values(env));
}
const osnova = () => ({ col: '#22c55e', weight: 2, opacity: .9, fill: false, fillOpacity: .35, vis: true });

// 1) Fajl s tačkama: poligon i njegov naziv se ne vide, ne hvataju klik; tačka je 3 px.
{ const tacka = sloj('pt'), poly = sloj('poly'), lbl = sloj('lbl');
  primijeni(osnova(), [poly, tacka, lbl]);
  assert.strictEqual(tacka.stilovi.at(-1).radius, 3, 'tačka zadano 3 px');
  assert.strictEqual(poly.stilovi.at(-1).opacity, 0); assert.strictEqual(poly.stilovi.at(-1).fillOpacity, 0);
  assert.strictEqual(poly.stilovi.at(-1).fill, false); assert.strictEqual(poly.options.interactive, false);
  assert.strictEqual(poly._kmlSakriven, true); assert.strictEqual(lbl.opac, 0, 'naziv poligona se sakriva'); }
// 2) Korisnik uključi "Prikaži poligone": vraća se prikaz i klik.
{ const tacka = sloj('pt'), poly = sloj('poly'), lbl = sloj('lbl'); const k = osnova(); k.poligoniVidljivi = true;
  primijeni(k, [poly, tacka, lbl]);
  assert(poly.stilovi.at(-1).opacity > 0); assert.strictEqual(poly.options.interactive, true); assert.strictEqual(poly._kmlSakriven, false); assert.strictEqual(lbl.opac, 1); }
// 3) Fajl samo s poligonima: ništa se ne skriva.
{ const poly = sloj('poly'); primijeni(osnova(), [poly]); assert(poly.stilovi.at(-1).opacity > 0); assert.notStrictEqual(poly._kmlSakriven, true); }
// 4) Ručno izabrana veličina tačke se poštuje.
{ const tacka = sloj('pt'); const k = osnova(); k.ptR = 9; primijeni(k, [tacka]); assert.strictEqual(tacka.stilovi.at(-1).radius, 9); }

// 5) Uvoz: samo poligoni → oker i 60 % ispune; s tačkama → boja ne postaje oker.
assert(/const samoPoligoni=imaPoligon&&!imaTacku;/.test(lli) && /if\(samoPoligoni\)col='#d4a52a'/.test(lli), 'oker za poligon fajl');
assert(/fill:samoPoligoni,fillCol:col,fillPattern:'solid',fillOpacity:samoPoligoni\?\.6:\.35/.test(lli), 'ispuna 60 %');
assert(/applyKmlStyle\(kmlLs\.length-1\);\s*try\{_localKmlSaveAll\(false\)/.test(lli), 'zadani stil se odmah primijeni i sačuva');

// 6) Izbor odsjeka: izabran poligon dobija plavu ispunu i fill:true (veliki fajlovi imaju ispunu isključenu).
const m = pb.match(/const SELEKTOVAN=(\{[^}]+\})/); assert(m, 'SELEKTOVAN');
const sel = new Function('return ' + m[1])();
assert.strictEqual(sel.fill, true); assert(sel.fillOpacity >= .4); assert(sel.weight >= 4);
assert(!/#f59e0b/.test(pb), 'stara boja (slična bojama fajlova) više nije u upotrebi');
assert((pb.match(/oznaci\(/g) || []).length >= 3, 'toggle i "označi sve vidljive" koriste isti stil');
console.log('kml-tacke-poligoni: ok');
