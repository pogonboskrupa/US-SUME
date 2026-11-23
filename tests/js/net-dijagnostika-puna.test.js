// Puna dijagnostika veze (v4.9.5): tekst probe, dugmad u kartici Server, nema izmjene stanja mreže.
'use strict';
const assert = require('node:assert');
const S = require('./_izvor').izvor();
function fn(n) { let s = S.indexOf('function ' + n + '('); assert.ok(s >= 0, n); let i = S.indexOf('{', s), d = 0; for (; i < S.length; i++) { if (S[i] === '{') d++; else if (S[i] === '}' && --d === 0) return S.slice(s, i + 1); } }
const t = new Function(fn('_netProbaTxt') + '\nreturn _netProbaTxt;')();
assert.strictEqual(t({ ok: true, status: 200, ms: 120 }), 'OK HTTP 200 120 ms');
assert.strictEqual(t({ ok: false, ms: 8000, vrsta: 'istek' }), 'ISTEK 8000 ms');
assert.ok(/ODBIJENO \(Failed/.test(t({ ok: false, ms: 5, vrsta: 'odbijeno', poruka: 'Failed to fetch' })));
// kartica se pokazuje i kad je app u offline režimu a mjerenje kaže drugačije
assert.ok(/st === 'nema' \|\| st === 'slaba' \|\| \(typeof _isOfflineMode/.test(S));
assert.ok(S.includes('onclick="_netDijagnostikaPuna()"') && S.includes('onclick="_netDijagnostikaPosalji()"'));
// dijagnostika ne smije mijenjati mjereno stanje (ne zove _netZabiljezi/_netVezaVracena)
const tijelo = fn('_netDijagnostikaPuna');
assert.ok(!/_netZabiljezi\(|_netVezaVracena\(/.test(tijelo));
// slanje ne ide kroz mrežu aplikacije
assert.ok(/AndroidShare\.shareText\('Dijagnostika veze'/.test(fn('_netDijagnostikaPosalji')) || fn('_netDijagnostikaPosalji').includes("shareText('Dijagnostika veze'"));
console.log('net-dijagnostika-puna: ok');
