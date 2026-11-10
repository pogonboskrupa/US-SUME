'use strict';
// v3.7.1: slika snimljena dok traje trag pripada tragu; izvoz traga bira sa/bez slika;
// Explorer mod u meniju ispod "Dijeljenje kretanja"; traka stanja snimanja ispod gornjeg bara je uklonjena.
const assert = require('assert'), fs = require('fs');
const { izvor } = require('./_izvor'); const src = izvor();
const html = fs.readFileSync(__dirname + '/../../index.html', 'utf8');
const tw = fs.readFileSync(__dirname + '/../../static/js/terrain-workspace.js', 'utf8');
const css = fs.readFileSync(__dirname + '/../../static/css/field-design.css', 'utf8');
const ft = fs.readFileSync(__dirname + '/../../static/js/field-tools.js', 'utf8');
const fn = (s, n) => { const a = s.indexOf('function ' + n + '('); assert(a >= 0, n); let d = 0, i = s.indexOf('{', a); for (; i < s.length; i++) { if (s[i] === '{') d++; else if (s[i] === '}' && !--d) break; } return s.slice(a, i + 1); };

// 1) startLocPhoto: dok traje trag, slika ide tragu (do 30); bez traga ne.
function pokreni(env) {
  const e = { document: { getElementById: () => ({ disabled: false, click() { e.kliknuto = true; }, value: '' }) }, showToast() {}, _projekti: [], _aktivniProjektId: null, _fotoSnapPos: null, _tragFotoCeka: null, ...env };
  new Function(...Object.keys(e), fn(src, 'startLocPhoto') + ';startLocPhoto();globalThis.__ceka=_tragFotoCeka;')(...Object.values(e));
  return globalThis.__ceka;
}
assert.strictEqual(pokreni({ _tragOn: true, _tragLiveMeta: { fotos: [] }, lastP: { la: 1, lo: 2 } }), true, 'trag snima → slika pripada tragu');
assert.strictEqual(pokreni({ _tragOn: false, _tragLiveMeta: null, lastP: { la: 1, lo: 2 } }), false, 'bez traga → obična slika');
assert.strictEqual(pokreni({ _tragOn: true, _tragLiveMeta: { fotos: new Array(30).fill({}) }, lastP: { la: 1, lo: 2 } }), false, 'najviše 30 slika po tragu');
assert.strictEqual(pokreni({ _tragOn: true, _tragLiveMeta: { fotos: [] }, lastP: null }), false, 'bez GPS-a zastavica se ne ostavlja');

// 2) Izvoz traga sa slikama nudi sa/bez slika; bez slika ostaje kratak meni.
const meni = fn(src, '_tragKmlMeni');
assert(/_tragRegShare\(id, true\)/.test(meni) && /_tragKmlSacuvaj\(id, true\)/.test(meni) && /SA slikama/.test(meni) && /SAMO trag/.test(meni));
assert(/async function _tragRegShare\(id, bezSlika\)/.test(src) && /if \(!bezSlika\) \{ try \{ kmz = await _tragKmzBajti\(t\)/.test(src));
assert(/async function _tragKmlSacuvaj\(id, bezSlika\)/.test(src));

// 3) Explorer mod u meniju, odmah ispod "Dijeljenje kretanja".
const i1 = html.indexOf('id="menu-share-kretanje"'), i2 = html.indexOf('id="menu-explorer-mod"'), i3 = html.indexOf('startLocPhoto()', i2);
assert(i1 > 0 && i2 > i1 && i3 > i2 && i2 - i1 < 1200, 'Explorer mod stoji odmah ispod Dijeljenja kretanja');
assert(/TerenWorkspace\.explorerMeni\(\)/.test(html) && /function explorerMeni\(\)/.test(tw) && /explorerMeni,/.test(tw));

// 4) Traka stanja snimanja (● Trag · 1 min · 5 tač. · GPS 6 m …) više ne postoji.
for (const [ime, tekst] of [['index.html', html], ['field-design.css', css], ['field-tools.js', ft], ['glavni.js', src]])
  assert(!/field-status|_fieldStatusUpdate|field-recording/.test(tekst), ime + ' više ne sadrži traku stanja');
console.log('trag-foto-meni-explorer: ok');
