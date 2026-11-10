'use strict';
const assert=require('node:assert/strict');
const src=require('./_izvor').izvor();
const f=src.slice(src.indexOf('async function doLogout'),src.indexOf('signOut() šalje'));
assert(/samoOdbijeno = n\.red > 0 && n\.blok === n\.red && !n\.doz/.test(f),'prepoznaje da je sve odbijeno');
assert(/mozeSlati && samoOdbijeno\) \{\s*if \(!await _dlgConfirm/.test(f),'tada samo jedna potvrda, bez uzaludnog slanja');
assert(/Promise\.race\(\[serverPosalji\(\), new Promise\(r => setTimeout\(r, 25000\)\)\]\)/.test(f),'slanje pri odjavi ima rok od 25 s');
// "Pošalji pa se odjavi" ostaje za stavke koje se mogu poslati
assert(/Pošalji pa se odjavi/.test(f));
console.log('OK odjava sa odbijenim stavkama');
