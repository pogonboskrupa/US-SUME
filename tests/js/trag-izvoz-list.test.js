// v4.7.7: list za izvoz/slanje traga — sa/bez slika se bira jednom, radnje u boji.
'use strict';
const assert = require('assert');
const src = require('./_izvor').izvor();
function fn(name) {
  const i = src.indexOf('function ' + name + '(');
  let j = src.indexOf('{', i), d = 0, k = j;
  for (; k < src.length; k++) { if (src[k] === '{') d++; else if (src[k] === '}' && --d === 0) break; }
  return src.slice(i, k + 1);
}
let ok = 0;
function t(n, f) { f(); ok++; console.log('✓', n); }

function izvrsi(t, radnja, sa) {
  const poz = [];
  const e = {
    _tragRegistry: [t],
    podaciPosalji: (...a) => poz.push(['posalji', a[0]]),
    _tragPosaljiSaSlikama: () => poz.push(['posaljiSlike']),
    _tragRegShare: (id, bez) => poz.push(['share', !!bez]),
    _tragKmlSacuvaj: (id, bez) => poz.push(['sacuvaj', !!bez]),
    _tragIme: () => 'T', _tragToKml: () => '<kml/>',
  };
  new Function(...Object.keys(e), fn('_tragIzvozIzvrsi') + ';_tragIzvozIzvrsi(' + JSON.stringify(t.id) + ',' + JSON.stringify(radnja) + ',' + sa + ');')(...Object.values(e));
  return poz;
}
const saSl = { id: 'a', fotos: [{}, {}], pts: [] }, bezSl = { id: 'b', fotos: [], pts: [] };

t('sa slikama: kolegi ide sa slikama, podijeli/sačuvaj kao .kmz', () => {
  assert.deepStrictEqual(izvrsi(saSl, 'kolegi', true), [['posaljiSlike']]);
  assert.deepStrictEqual(izvrsi(saSl, 'podijeli', true), [['share', false]]);
  assert.deepStrictEqual(izvrsi(saSl, 'sacuvaj', true), [['sacuvaj', false]]);
});
t('izabrano "Samo trag": sve tri radnje bez slika', () => {
  assert.deepStrictEqual(izvrsi(saSl, 'kolegi', false), [['posalji', 'trag']]);
  assert.deepStrictEqual(izvrsi(saSl, 'podijeli', false), [['share', true]]);
  assert.deepStrictEqual(izvrsi(saSl, 'sacuvaj', false), [['sacuvaj', true]]);
});
t('trag bez slika nikad ne ide putem sa slikama', () => {
  assert.deepStrictEqual(izvrsi(bezSl, 'kolegi', true), [['posalji', 'trag']]);
  assert.deepStrictEqual(izvrsi(bezSl, 'podijeli', true), [['share', true]]);
});
function html(t, sa, admin) {
  const e = { _tizSaSlikama: sa, isAdmin: () => !!admin, _tragFmtLen: () => '120 m', _tragCalcLen: () => 120,
    _tvBoja: () => '#f00', _escHtml: s => String(s), _tragIme: () => 'Obilazak' };
  return new Function(...Object.keys(e), '__t', fn('_tizHtml') + ';return _tizHtml(__t);')(...Object.values(e), t);
}
t('izbor sa/bez slika postoji samo kad trag ima slike, izabran je obilježen', () => {
  const h = html(saSl, true);
  assert.ok(/tiz-opc sa on/.test(h) && /tiz-opc bez"/.test(h) && /aria-checked="true"/.test(h));
  assert.ok(/tiz-opc bez on/.test(html(saSl, false)));
  assert.ok(!/tiz-izbor/.test(html(bezSl, true)));
});
t('tri radnje u različitim bojama, opis prati izbor', () => {
  const h = html(saSl, true);
  for (const k of ['kol', 'pod', 'sac']) assert.ok(new RegExp('tiz-radnja ' + k).test(h));
  assert.ok(/\.kmz/.test(h) && !/\.kmz/.test(html(saSl, false)));
  assert.ok(/Pošalji korisniku/.test(html(saSl, true, true)) && /Pošalji kolegi/.test(h));
});
t('CSS: svaka radnja i izbor ima svoju boju i dnevnu temu', () => {
  const css = require('fs').readFileSync(__dirname + '/../../static/css/field-design.css', 'utf8');
  for (const s of ['.tiz-radnja.kol', '.tiz-radnja.pod', '.tiz-radnja.sac', '.tiz-opc.sa.on', '.tiz-opc.bez.on'])
    assert.ok(css.includes(s), s);
  assert.ok(/html\[data-field-theme=day\] \.tiz-box/.test(css));
});
console.log(ok + ' testova prošlo');
