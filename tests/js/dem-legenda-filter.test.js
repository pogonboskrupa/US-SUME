'use strict';
const assert=require('node:assert/strict');
const src=require('./_izvor').izvor();
const ex=(a,b)=>src.slice(src.indexOf(a),src.indexOf(b));
const kod=ex('const _DEM_NAGIB_KLASE','const DemSlopeClass');
const mk=filter=>{const ls={getItem:()=>filter?JSON.stringify(filter):null};return new Function('localStorage',kod+';return {_slopeColor,get f(){return _demFilter;}};')(ls);};
let m=mk(null);
assert.deepEqual(m._slopeColor(15),[0,0,0,0],'zadano: 10–20 % se ne crta');
assert(m._slopeColor(35)[3]>0,'zadano: 30 %+ se crta');
m=mk({ekspo:[1,1,1,1],slope:[0,1,0,0,0,0]});
assert(m._slopeColor(15)[3]>0,'samo 10–20 %: crta se');
assert.deepEqual(m._slopeColor(35),[0,0,0,0],'samo 10–20 %: 30 %+ ne');
assert.deepEqual(m._slopeColor(NaN),[0,0,0,0]);
// ekspozicija: filtar po četvrtinama
assert(/_demFilter\.ekspo\[g\.bearing>=315\|\|g\.bearing<45\?0:/.test(src),'ekspozicija koristi filter u pločici');
// legenda: minimiziranje, X i checkbox po klasi
const leg=ex('function _demLegSekcija','async function _instClear');
assert(/_demLegMinToggle/.test(leg)&&/_demLegX/.test(leg)&&/type="checkbox"/.test(leg)&&/_demFilterSet/.test(leg));
assert(/function _demLegX\(id\) \{ _instToggle\(id, false\); \}/.test(src),'X isključuje taj prikaz');
assert(/_ovlState\.slope\) sek\.push/.test(src),'legenda nagiba postoji');
// popup KML
const le=require('fs').readFileSync(__dirname+'/../../static/js/layer-editor.js','utf8');
assert(/_kmlPopKlikOff[^]*?_kmlPopPosalji/.test(le.slice(le.indexOf("btn('_kmlPopKlikOff'"),le.indexOf("btn('_kmlPopKlikOff'")+200)),'Pošalji je odmah poslije Isključi klik');
assert(/<details class="le-attributes"><summary>/.test(le)&&!/le-attributes" open/.test(le),'podaci o objektu su zadano minimizirani');
console.log('OK dem legenda + popup');
