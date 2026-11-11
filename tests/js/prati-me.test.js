'use strict';
const assert=require('node:assert/strict'),fs=require('fs');
const src=require('./_izvor').izvor();
const html=fs.readFileSync(__dirname+'/../../index.html','utf8');
assert(/onpointerdown="_pratiDown\(\)"/.test(html)&&/if\(_pratiKlik\(\)\)_locPopupCentriraj\(\)/.test(html),'popup Centriraj');
assert(/id="ab-centar" onclick="if\(_pratiKlik\(\)\)fabLokacija\(\)"/.test(html),'dugme Centar');
assert(/_pratiMe && !_userPannedAway && !_recFreeView\) map\.panTo/.test(src),"onP prati poziciju");
assert(/map\.on\('dragend', _pratiDragEnd\)/.test(src)&&/_pratiPostavi\(false\); showToast\('Praćenje isključeno'\)/.test(src),'praćenje gasi tek dragend iza praga');
const dsA=src.slice(src.indexOf("map.on('dragstart'"),src.indexOf('function _pratiOdmakPx'));
assert(!/_pratiPostavi\(false\)/.test(dsA),'dragstart ne gasi praćenje');
// Prag odmaka: mali pomak ostaje, veliki gasi
{const f=src.slice(src.indexOf('function _pratiOdmakPx'),src.indexOf("map.on('dragend', _pratiDragEnd)"));
 const mk=(dist)=>{let off=0,pan=0;const st={_pratiMe:true,lastP:{la:1,lo:1},_userPannedAway:false};
  const map={getSize:()=>({x:400,y:800,divideBy:()=>({distanceTo:()=>dist})}),latLngToContainerPoint:()=>({}),panTo(){pan++;}};
  new Function('map','S','_pratiPostavi','showToast','_updCentarBtn','with(S){'+f+';_pratiDragEnd();}')(map,st,()=>{off++;},()=>{},()=>{});return {off,pan,pa:st._userPannedAway};};
 assert.deepEqual(mk(40),{off:0,pan:1,pa:false},'mali pomak: ostaje i vraća se');
 assert.deepEqual(mk(250),{off:1,pan:0,pa:true},'veliki pomak: gasi');}
// Ponašanje
const body=src.slice(src.indexOf('var _pratiMe'),src.indexOf('function _locPopupCentriraj'));
const els={};const mk=id=>els[id]={style:{},textContent:'',classList:{s:new Set(),toggle(c,on){on?this.s.add(c):this.s.delete(c);}}};
['ab-centar','ab-loc','ab-loc-popup'].forEach(mk);els.chip={style:{},classList:els['ab-loc-popup'].classList,setAttribute(){}};
const toasts=[];let centrirano=0;
const timers=[];
const api=new Function('document','showToast','fabLokacija','setTimeout','clearTimeout',body+';return {_pratiDown,_pratiUp,_pratiKlik,_pratiToggle,get on(){return _pratiMe;}};')(
 {getElementById:id=>els[id],querySelector:()=>els.chip},m=>toasts.push(m),()=>centrirano++,(f)=>{timers.push(f);return timers.length;},()=>{});
// kratki dodir: nema praćenja, klik prolazi
api._pratiDown();api._pratiUp();assert.equal(api._pratiKlik(),true);assert.equal(api.on,false);
// dug dodir: tajmer istekne → prati, klik se guta
api._pratiDown();timers[timers.length-1]();api._pratiUp();
assert.equal(api.on,true);assert.equal(centrirano,1);assert.equal(api._pratiKlik(),false,'klik poslije dugog dodira se guta');assert.equal(api._pratiKlik(),true);
assert(els['ab-centar'].classList.s.has('prati'));
assert(html.includes('class="prati-tog"'),'prekidač je unutar dugmeta');
// drugi dug dodir isključuje
api._pratiToggle();assert.equal(api.on,false);assert(!els['ab-centar'].classList.s.has('prati'));
// Podrazumijevano uključeno čim se lokacija upali; slobodan pogled tokom snimanja ga ne gazi
const sg=src.slice(src.indexOf('function toggleGPS'),src.indexOf('function startGPS'));
assert(/_pratiUkljuciZadano\(\)/.test(sg)&&/_pratiPostavi\(true\)/.test(sg),'ručno paljenje lokacije uključuje Prati me');
assert(!/_pratiPostavi\(true\)/.test(src.slice(src.indexOf('function startGPS'),src.indexOf('function stopGPS'))),'startGPS sam ne uključuje praćenje');
assert(/_pratiMe && !_userPannedAway && !_recFreeView\) map\.panTo/.test(src),'slobodan pogled snimanja ima prednost');
console.log('OK prati me');
