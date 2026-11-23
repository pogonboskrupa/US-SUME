'use strict';
// v4.1.0: pomak karte (Prati me, tastatura) ne smije ponovo crtati preglednik dok se stavka uređuje.
const assert = require('node:assert/strict'), fs = require('fs');
const s = fs.readFileSync(__dirname + '/../../static/js/map-library.js', 'utf8');
const a = s.indexOf('function moveRender(){'), b = s.indexOf("map.on('moveend',moveRender);");
assert(a > 0 && b > a, 'moveend ide kroz moveRender');
assert(!/map\.on\('moveend',\(\)=>/.test(s), 'nema bezuslovnog crtanja na moveend');
const body = s.slice(a, b);
function mk(st) {
  let n = 0; const panel = { style: { display: st.panel || 'block' }, contains: x => x === st.fokus };
  const f = new Function('S', 'el', 'render', 'document', 'Date', 'let moveT=0;with(S){' + body + ';return moveRender;}')(
    st, id => id === 'oznake-panel' ? panel : null, () => { n++; }, { activeElement: st.fokus || null }, { now: () => st.t });
  return { f, n: () => n };
}
let m = mk({ sort: 'proximity', opened: '', t: 10000 }); m.f(); assert.equal(m.n(), 1, 'bez uređivanja se osvježava');
m = mk({ sort: 'proximity', opened: 'k1', t: 10000 }); m.f(); assert.equal(m.n(), 0, 'otvoreno uređivanje: ne crta');
m = mk({ sort: 'proximity', opened: '', fokus: { tagName: 'INPUT' }, t: 10000 }); m.f(); assert.equal(m.n(), 0, 'fokus u polju pretrage: ne crta');
m = mk({ sort: 'name', opened: '', t: 10000 }); m.f(); assert.equal(m.n(), 0, 'drugi sort: ne crta');
m = mk({ sort: 'proximity', opened: '', panel: 'none', t: 10000 }); m.f(); assert.equal(m.n(), 0, 'zatvoren panel: ne crta');
const st = { sort: 'proximity', opened: '', t: 10000 }; m = mk(st); m.f(); st.t = 10500; m.f(); assert.equal(m.n(), 1, 'najviše jednom u 1,5 s'); st.t = 12000; m.f(); assert.equal(m.n(), 2);
console.log('OK preglednik: uređivanje preživi pomak karte');
