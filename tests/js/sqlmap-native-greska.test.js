// v4.5.9: native pločica koja ne uspije se ne smije TRAJNO proglasiti "nema" zbog prolazne greške.
'use strict';
const assert = require('node:assert');
const HTML = require('./_izvor').izvor();
const a = HTML.indexOf('const nPokusaj = (n) =>');
assert.ok(a > 0, 'nPokusaj postoji');
const blok = HTML.slice(a, HTML.indexOf('nPokusaj(0);', a));
let pass = 0;
function t(n, f) { f(); pass++; console.log('  ✔ ' + n); }
t('negativni keš samo uz potvrđen 404', () => {
  assert.ok(/r\.status === 404 \? 'nema'/.test(blok));
  assert.ok(blok.indexOf('_sqlTileNeg.add') > blok.indexOf("st === 'nema'"));
  assert.strictEqual((blok.match(/_sqlTileNeg\.add/g) || []).length, 1);
});
t('500/greška se ponavlja i ne ide u negativni keš', () => {
  assert.ok(blok.includes("n < 1") && blok.includes('nPokusaj(n + 1)'));
  assert.ok(blok.includes('BEZ trajnog'));
});
t('istek od 20 s se ponavlja prije odustajanja', () => {
  assert.ok(/if \(n < 2\) \{ setTimeout\(\(\) => nPokusaj\(n \+ 1\), 300\)/.test(blok));
});
t('obruč se ne dodaje na udaljenom zumu', () => {
  assert.ok(/sk >= 1 \? _SQL_TILE_OBRUC : 0/.test(HTML));
});
t('na udaljenom zumu se zadržava samo 1 prsten pločica', () => {
  assert.ok(/_kbPrije = this\.options\.keepBuffer; this\.options\.keepBuffer = Math\.min\(1, this\._kbPrije\)/.test(HTML));
});
console.log(pass + ' prošlo');
