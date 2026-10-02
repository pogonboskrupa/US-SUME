'use strict';
const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict');
const html = fs.readFileSync('index.html', 'utf8');
function fn(name) {
  const start = html.search(new RegExp('(?:async )?function ' + name + '\\('));
  assert.ok(start >= 0, name);
  let depth = 0;
  for (let i = html.indexOf('{', start); i < html.length; i++) {
    if (html[i] === '{') depth++;
    if (html[i] === '}' && --depth === 0) return html.slice(start, i + 1);
  }
}
const tests = [];
const test = (n, f) => tests.push([n, f]);
function net() {
  const env = {navigator:{onLine:true}, Date:{now:()=>100000},
    _NET_PROBA_MS:30000, _NET_PROZOR_MS:20000, _netProbaDo:0, _netSilaDo:0,
    _netUzorci:[{ok:true,t:99900}], _netKvalitet:()=> 'slaba'};
  vm.createContext(env);
  vm.runInContext(fn('_mrezaProbaj') + '\n' + fn('_netDozvoliZahtjev') + '\n' + fn('_mrezaSila'), env);
  return env;
}
test('slab signal odmah odbija automatske radnje i Supabase transport', () => {
  const e = net(); assert.equal(e._mrezaProbaj(),false); assert.equal(e._netDozvoliZahtjev(),false);
});
test('ručno slanje može proći na slabom signalu bez automatskog slanja', () => {
  const e = net(); e._mrezaSila(); assert.equal(e._mrezaProbaj(),true); assert.equal(e._netDozvoliZahtjev(),true);
});
test('periodična proba na slaboj vezi ne daje novi prozor prije 30 sekundi', () => {
  const e = net(); e._netUzorci[0].t=60000;
  assert.equal(e._mrezaProbaj(false,true),true);
  e._netSilaDo=0; assert.equal(e._mrezaProbaj(false,true),false);
});
test('5000 segmenata iste brzine imaju ograničene linije i dijeljeni Canvas', () => {
  let lines=0, vertices=0, canvases=0; const group={};
  const e={L:{canvas:()=>{canvases++;return {};},polyline:(pts,opts)=>{
    lines++;vertices+=pts.length;assert.equal(opts.interactive,false);assert.ok(opts.renderer);
    return {addTo:()=>({addLatLng:()=>{vertices++;}})};
  }}};
  vm.createContext(e);vm.runInContext(fn('_dozGpsDodajSegment'),e);
  for(let i=0;i<5000;i++) e._dozGpsDodajSegment(group,[44+i/1e5,16],[44+(i+1)/1e5,16],'#4ade80');
  assert.ok(lines<=40,lines+' slojeva');assert.equal(canvases,1);assert.equal(vertices,5000+lines);
  const before=lines; e._dozGpsDodajSegment(group,[45,16],[45.1,16],'#ef4444');assert.equal(lines,before+1);
});
test('kanal doznake koji se već spaja ne ruši se iz periodičnog održavanja', () => {
  let calls=0; const e={_dozSelId:'p',_dozActiveChannel:{state:'joining'},_mrezaProbaj:()=>true,
    _dozSubProject:()=>{calls++;}}; vm.createContext(e);vm.runInContext(fn('_dozEnsureChannel'),e);
  e._dozEnsureChannel();assert.equal(calls,0);
  e._dozActiveChannel.state='closed';e._dozEnsureChannel();assert.equal(calls,1);
});
(async()=>{let failed=0;for(const [n,f]of tests){try{await f();console.log('OK '+n);}catch(e){failed++;console.log('FAIL '+n+': '+e.message);}}
console.log(`${tests.length-failed}/${tests.length}`);if(failed)process.exitCode=1;})();
