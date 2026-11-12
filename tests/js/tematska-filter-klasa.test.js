'use strict';
// v4.2.4: tematska karta — filter klasa iz legende na karti i brza tema.
const assert = require('node:assert/strict');
const src = require('./_izvor').izvor();
function fn(name) {
  const i = src.indexOf('function ' + name + '('); assert(i >= 0, name);
  let d = 0, j = src.indexOf('{', src.indexOf(')', i));
  for (let k = j; k < src.length; k++) { if (src[k] === '{') d++; else if (src[k] === '}') { d--; if (!d) return src.slice(i, k + 1); } }
}
const kod = ['_temNum', '_temKlasaIdx', '_temBojaZa', '_temOboji', '_temKlasaSkrij'].map(fn).join('\n');
const mk = () => {
  const stilovi = [];
  const f = v => ({ attrs: { vis: v }, polys: [{ setStyle: s => stilovi.push([v, s]) }] });
  const entry = { id: 'm1', opacity: .5, features: [f(1), f(5), f(9)], _cls: { col: 'vis', breaks: [3, 7], colors: ['#a', '#b', '#c'], min: 0, max: 10 } };
  let leg = 0;
  const api = new Function('_temById', '_temLegendUpd', '_temBr', kod + ';return {oboji:_temOboji,skrij:_temKlasaSkrij};')(id => id === 'm1' ? entry : null, () => { leg++; }, x => x);
  return { entry, api, stilovi, leg: () => leg };
};
let t = mk();
t.api.skrij('m1', 2);                         // sakrij klasu 3 (vis ≥ 7)
assert(t.entry._skrKlase.has(2));
const zadnji = v => t.stilovi.filter(s => s[0] === v).pop()[1];
assert.equal(zadnji(9).fill, false, 'odsjek sakrivene klase nestaje'); assert.equal(zadnji(9).interactive, false);
assert.equal(zadnji(1).fill, true, 'ostale klase ostaju'); assert.equal(zadnji(5).fillColor, '#b');
t.api.skrij('m1', 2); assert.equal(t.entry._skrKlase, null, 'drugi dodir vraća klasu'); assert.equal(zadnji(9).fill, true);
t.api.skrij('m1', 0); t.api.skrij('m1', 1); assert.equal(t.entry._skrKlase.size, 2);
t.api.skrij('m1', -1); assert.equal(t.entry._skrKlase, null, '-1 prikazuje sve'); assert(t.leg() >= 4, 'legenda se osvježava');
// tema: promjena teme briše filter; legenda ima dodir po klasi i prečicu "Prikaži sve"
assert(/entry\._skrKlase = null;\s*\/\/ filter klasa važi samo za temu/.test(src), 'promjena teme briše filter');
assert(/_temKlasaSkrij\('\$\{jid\}',\$\{k\.i\}\)/.test(src) && /Prikaži sve klase/.test(src) && /class="tem-leg-row kl/.test(src), 'legenda: dodir po klasi');
assert(/event\.stopPropagation\(\);_temKlasaSkrij/.test(src), 'dodir klase ne sklapa legendu');
assert(/class="tem-brze"/.test(src) && /Brza tema/.test(src) && /sve\.slice\(0, 6\)/.test(src) && /pr\[5\] = m\.theme/.test(src), 'brze teme u panelu (aktivna tema je uvijek među njima)');
console.log('OK tematska: filter klasa + brza tema');
