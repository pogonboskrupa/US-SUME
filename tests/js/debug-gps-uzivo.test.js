'use strict';
const assert=require('node:assert/strict');
const src=require('./_izvor').izvor(),html=require('fs').readFileSync(__dirname+'/../../index.html','utf8');
const p=html.slice(html.indexOf('id="debug-panel"'),html.indexOf('TEREN PANEL'));
assert(/gps-live-card/.test(p)&&/perf-diag-card/.test(p),'ostaju brzina aplikacije i GPS uživo');
for(const id of ['net-debug-card','admin-debug-list','btn-net-test','_adminDebugObrisiSve','_adminDebugKlikNow','_adminDebugMapStuckNow'])assert(!p.includes(id),'uklonjeno: '+id);
assert(/_gpsTelZabiljezi\(p\)/.test(src.slice(src.indexOf('function onP(p)'))),'onP bilježi fiks');
// statistika: medijan/p95/max
const f=new Function(src.slice(src.indexOf('function _gpsStat'),src.indexOf('function _gpsLiveRender'))+';return _gpsStat;')();
const s=f([5,10,3,NaN,20,4]);assert.equal(s.n,5);assert.equal(s.max,20);assert.equal(s.med,5);
console.log('OK debug gps uzivo');
