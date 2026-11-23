'use strict';
// v4.1.3: trag prima samo fikseve razumne tačnosti — početak (GPS se smiruje) ne ulazi u trag.
const assert = require('node:assert/strict');
const src = require('./_izvor').izvor();
const a = src.indexOf('const _TRAG_ACC_POCETAK_MS'), b = src.indexOf('function _tragAccPrag') ;
const kraj = src.indexOf('\n}\n', b) + 3;
const f = new Function('GPS_STAB_ACC', src.slice(a, kraj) + ';return {reset:_tragAccReset,prag:_tragAccPrag};')(12);
// 1) početak: dok nema fiksa ≤12 m, prag je 12 m
f.reset(); let t = 1e6;
assert.equal(f.prag(40, t), 12, 'loš fiks na početku odbijen');
assert.equal(f.prag(25, t += 2000), 12);
assert.equal(f.prag(9, t += 2000), 27 /* 3×9 */ , 'prvi dobar fiks: prag postaje 3× najbolja');
// 2) kad signal postane ±3 m, fiksevi od ±30 m ne ulaze (prag 15)
assert.equal(f.prag(3, t += 2000), 15, 'najmanje 15 m');
assert(30 > f.prag(3, t += 1000), '±30 m se odbija poslije dobrog signala');
// 3) nema dobrog fiksa 60 s: ne gubi se trag — prag ide na adaptivni (≤50 m)
f.reset(); t = 2e6; f.prag(30, t);
const poslije = f.prag(30, t + 61000);
assert(poslije >= 15 && poslije <= 50 && poslije > 12, 'u šumi/među zgradama prag se opušta poslije 60 s: ' + poslije);
// 4) prozor 60 s: stara dobra tačnost ne drži prag zauvijek
f.reset(); t = 3e6; f.prag(3, t); assert.equal(f.prag(40, t + 1000), 15);
assert.equal(f.prag(40, t + 90000), 50 > 3 * 40 ? 50 : 50, 'poslije 60 s bez dobrih fikseva prag raste');
// 5) trag koristi prag; replay iz native bafera zadržava stari (≤50)
assert(/_tragAccPrag\(ac, now0\)/.test(src) && /bypassPauzu \? 50 :/.test(src), 'prag u _addTragPoint, replay bez promjene');
assert(/_tragAccReset\(\);\s*_tragLastT = 0;\s*_tragRetraceReset\(0\);\s*if \(_tragLine\)/.test(src), 'reset pri početku snimanja');
console.log('OK trag: prag tačnosti');
