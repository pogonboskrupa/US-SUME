// Granice → Pronađi odjel (v2.9.4): offline pretraga učitanih poligona, nad STVARNIM modulom.
'use strict';
const fs = require('fs'), vm = require('vm'), assert = require('assert');
const SRC = fs.readFileSync(require('path').join(__dirname, '../../static/js/granice-trazi.js'), 'utf8');

function poly(name, attrs) {
  return { _kmlIsPolygon: true, _kmlName: name, _kmlExtData: attrs, toGeoJSON: () => ({}), getBounds: () => ({ isValid: () => true, getCenter: () => ({}) }) };
}
function sandbox(layers) {
  const grp = ls => ({ eachLayer: f => ls.forEach(f) });
  const e = { console, kmlLs: layers.map(([name, ls]) => ({ name, _origName: name, grp: grp(ls) })), _escHtml: s => String(s).replace(/</g, '&lt;') };
  e.window = e; vm.createContext(e); vm.runInContext(SRC, e);
  return e.GraniceTrazi;
}
const tests = [];
const t = (n, f) => tests.push([n, f]);

t('tačan broj odjela iz atributa je prvi, "105.000000" iz SHP-a = 105', () => {
  const g = sandbox([['GRANICE.kml', [poly('Odjel 1050', { Odjel: '1050' }), poly('Šuma', { Odjel: '105.000000', Odsjek: 'a' })]]]);
  const r = g.search('105');
  assert.strictEqual(r.length, 2);
  assert.strictEqual(r[0].l._kmlName, 'Šuma');
});
t('dijakritika i velika slova ne smetaju', () => {
  const g = sandbox([['g.kml', [poly('Baštra Ćorkovača 12', {})]]]);
  assert.strictEqual(g.search('bastra corkovaca').length, 1);
});
t('više riječi: sve moraju postojati', () => {
  const g = sandbox([['g.kml', [poly('Odjel 7', { GJ: 'Gomila' }), poly('Odjel 7', { GJ: 'Risovac' })]]]);
  assert.strictEqual(g.search('gomila 7').length, 1);
});
t('prazan upit ne vraća ništa', () => assert.strictEqual(sandbox([['g.kml', [poly('x', {})]]]).search('  ').length, 0));
t('linije i tačke se ne nude kao odjeli', () => {
  const line = { _kmlName: 'Odjel 5 put' };
  assert.strictEqual(sandbox([['g.kml', [line]]]).search('odjel').length, 0);
});
t('oznaka reda nosi GJ, odjel i odsjek', () => {
  const g = sandbox([]);
  assert.strictEqual(g.label({ l: poly('x', { GJ: 'Gomila', Odjel: '12.000000', Odsjek: 'b' }) }), 'Gomila · odjel 12b');
});

let fail = 0;
for (const [n, f] of tests) { try { f(); console.log('OK ' + n); } catch (e) { fail++; console.error('FAIL ' + n + '\n' + e.stack); } }
console.log(`${tests.length - fail}/${tests.length}`);
process.exit(fail ? 1 : 0);
