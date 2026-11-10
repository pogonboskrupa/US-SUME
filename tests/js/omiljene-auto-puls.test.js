'use strict';
const assert=require('node:assert/strict'),fs=require('fs');
const src=require('./_izvor').izvor();
const html=fs.readFileSync(__dirname+'/../../index.html','utf8');
const dl=fs.readFileSync(__dirname+'/../../static/js/map-downloads.js','utf8');
const cat=fs.readFileSync(__dirname+'/../../static/js/map-catalog.js','utf8');
// Podrazumijevani omiljeni: jednom, Google + nagib + ekspozicija
assert(/tvlake_mapfav_auto_v1/.test(src)&&/tlKey: '📡 Google'/.test(src)&&/tlKey: '_nagib'/.test(src)&&/tlKey: '_ekspo'/.test(src));
assert(/function _mapFavDodajAuto/.test(src),'dedup pri dodavanju');
// Ekspozicija kao podloga
assert(/key === '_ekspo'/.test(src)&&/return '_ekspo'/.test(src)&&/'_nagib','_ekspo'/.test(cat));
// Skinuta karta ide u omiljene
assert(/_mapFavDodajAuto\(\{name:row\.name,type:'sqlite'/.test(dl));
// Pulsirajuća lokacija
assert(/loc-puls/.test(src)&&/@keyframes locPuls/.test(html)&&/render-lite \.loc-puls2/.test(html));
// Ponašanje _mapFavDodajAuto
const fn=src.slice(src.indexOf('function _mapFavDodajAuto'),src.indexOf('function _mapFavPodrazumijevani'));
let favs=[],saved=0;
const f=new Function('_mapFavs','_mapFavSave',fn+';return _mapFavDodajAuto;')(favs,()=>saved++);
assert(f({name:'A',type:'sqlite',sqliteId:'A'})===true);
assert(f({name:'A2',type:'sqlite',sqliteId:'A'})===false,'duplikat se ne dodaje');
assert(favs.length===1&&saved===1);
console.log('OK omiljene auto + puls');
