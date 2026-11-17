'use strict';
// v4.7.2: granice i sakriveni slojevi se ne parsiraju pri pokretanju; veliki MultiGeometry Placemark
// se obrađuje po komadima; pcs ručno skenira koordinate (isti rezultat kao stari split/map/filter).
const assert = require('assert'), fs = require('fs');
const { izvor } = require('./_izvor'); const src = izvor();
const fn = n => { const a = src.indexOf('function ' + n + '('); assert(a >= 0, n); let d = 0, i = src.indexOf('{', a); for (; i < src.length; i++) { if (src[i] === '{') d++; else if (src[i] === '}' && !--d) break; } return src.slice(a, i + 1); };
const env = new Function('const _KML_PO_DIJELOVIMA_MIN=1200000;' + ['_kmlJeGranicaPoImenu', '_kmlLijenoPriStartu', '_kmlRazbijPm', '_pcsRazmak', 'pcs'].map(fn).join('\n') +
  ';return {_kmlJeGranicaPoImenu,_kmlLijenoPriStartu,_kmlRazbijPm,pcs};')();
let ok = 0; const t = (n, f) => { f(); ok++; console.log('OK ' + n); };

t('sakriven sloj se ne parsira pri pokretanju, bez obzira na veličinu', () => {
  assert.equal(env._kmlLijenoPriStartu('mali.kml', { vis: false, cacheKey: 'k', size: 300 }), true);
  assert.equal(env._kmlLijenoPriStartu('mali.kml', { vis: true, cacheKey: 'k', size: 300 }), false);
  assert.equal(env._kmlLijenoPriStartu('tacke.kml', { cacheKey: 'k' }), false, 'vidljiv običan sloj ostaje kao prije');
  assert.equal(env._kmlLijenoPriStartu('x', null), false);
});
t('velike granice (po nazivu fajla ili izvora sa servera) se ne parsiraju pri pokretanju', () => {
  assert.equal(env._kmlLijenoPriStartu('GRANICE.kml', { cacheKey: 'k' }), true, 'stari zapis bez veličine');
  assert.equal(env._kmlLijenoPriStartu('GRANICE.kml', { cacheKey: 'k', size: 13000000 }), true);
  assert.equal(env._kmlLijenoPriStartu('Granice odjela.kml', { cacheKey: 'k', size: 50000 }), false, 'male granice su jeftine');
  assert.equal(env._kmlLijenoPriStartu('fajl.kml', { cacheKey: 'k', _driveSource: { name: 'Granice taksacije 2021' } }), true);
  assert.equal(env._kmlLijenoPriStartu('kamionski putevi.kml', { cacheKey: 'k', size: 13000000 }), false);
});

const pm = (geo, ext = true) => '<Placemark><name>Odjel 7</name>' + (ext ? '<ExtendedData><Data name="Odjel"><value>7</value></Data></ExtendedData>' : '') + '<MultiGeometry>' + geo + '</MultiGeometry></Placemark>';
const poly = i => '<Polygon><outerBoundaryIs><LinearRing><coordinates>' + ('16.' + i + ',44.1,0 ').repeat(40) + '</coordinates></LinearRing></outerBoundaryIs></Polygon>';
t('MultiGeometry se dijeli na komade sa istim nazivom i atributima, svaka geometrija tačno jednom', () => {
  const geos = Array.from({ length: 30 }, (_, i) => poly(i)).join('');
  const k = env._kmlRazbijPm(pm(geos), 3000);
  assert.ok(k.length > 1, 'mora biti više komada');
  for (const c of k) { assert.ok(c.startsWith('<Placemark><name>Odjel 7</name><ExtendedData>')); assert.ok(c.endsWith('</Placemark>')); assert.ok(!c.includes('MultiGeometry')); }
  assert.equal(k.join('').split('<Polygon>').length - 1, 30);
});
t('atributi POSLIJE geometrije (rep) ostaju u svakom komadu', () => {
  const x = '<Placemark><name>A</name><MultiGeometry>' + poly(1) + poly(2) + '</MultiGeometry><ExtendedData><Data name="GJ"><value>9</value></Data></ExtendedData></Placemark>';
  const k = env._kmlRazbijPm(x, 10);
  assert.equal(k.length, 2);
  for (const c of k) assert.ok(c.includes('<Data name="GJ">'));
});
t('jedna geometrija ili Placemark bez MultiGeometry se ne dijeli', () => {
  assert.equal(env._kmlRazbijPm('<Placemark><name>A</name>' + poly(1) + '</Placemark>', 10), null);
  assert.equal(env._kmlRazbijPm(pm(poly(1)), 10), null);
});

const pcsOld = s => { if (!s) return []; return s.trim().split(/\s+/).map(c => { const p = c.split(','); return p.length >= 2 ? [parseFloat(p[1]), parseFloat(p[0])] : null; }).filter(Boolean); };
t('pcs daje isti rezultat kao stari kod (i za neispravne/rubne ulaze)', () => {
  let c = ''; for (let k = 0; k < 2000; k++) c += (16.3 + k * 1e-5).toFixed(7) + ',' + (44.9 - k * 1e-5).toFixed(7) + ',0 ';
  for (const s of [c, '\n  ' + c + '\n', ' 16,44 16.1,44.1,5 x 1,2,3,4 ,5 5, \t\n16.5,44.5', '', '   ', '16,44', 'a,b', '16 44', '1,2 3,4', '16,44\r\n16.1,44.1', null, undefined])
    assert.deepEqual(env.pcs(s), pcsOld(s), JSON.stringify(String(s).slice(0, 30)));
});

const gl = src;
t('restore ne čita sadržaj lijenog sloja i kači učitavanje na dodavanje na kartu', () => {
  const r = fn('_localKmlRestore');
  const a = r.indexOf('_kmlLijenoPriStartu('), b = r.indexOf('_kmlcGet(data.cacheKey)');
  assert.ok(a > 0 && b > a, 'odluka o lijenom sloju dolazi PRIJE čitanja sadržaja');
  assert.ok(/layer\.grp\.once\('add'/.test(r));
});
t('potrošači granica učitaju lijene slojeve prije upotrebe', () => {
  const gt = fs.readFileSync(__dirname + '/../../static/js/granice-trazi.js', 'utf8');
  const pb = fs.readFileSync(__dirname + '/../../static/js/doznaka-project-boundary.js', 'utf8');
  const li = fs.readFileSync(__dirname + '/../../static/js/local-layer-import.js', 'utf8');
  assert.ok(/_kmlLijenoUcitajSve\(\)/.test(gt));
  assert.ok(/await _kmlLijenoUcitajSve\(\);\s*\n\s*sources=getSources\(\)/.test(pb));
  assert.ok(/if\(k\._lijeno\)return true;/.test(li), 'neučitane granice su i dalje granice');
  assert.ok(/await _kmlLijenoUcitaj\(layer,false\)/.test(li));
  assert.ok(/if \(k\._lijeno\) await _kmlLijenoUcitaj\(k, true\)/.test(fn('_ozZoomKml')));
});
t('nova sačuvana granica pamti veličinu', () => assert.ok(/size:content\.length/.test(fn('_localKmlSaveContent'))));
console.log(ok + ' prošlo, 0 palo');
