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
function gps() {
  let fail = true;
  const durable = [], events = [];
  const env = { _dozGpsOn:true, _dozGpsProjId:'p', _dozGpsUserId:'u', _dozGpsPaused:false,
    _dozGpsPts:[[44,16]], _dozGpsLen:0, _DOZ_GPS_MIN_DIST:2,
    dst:(a,b,c,d) => a===c && b===d ? 0 : 10,
    _dozGpsMaxSpd:0, _dozGpsSpdSum:0, _dozGpsSpdCnt:0, _dozGpsElevData:[], _dozGpsFullPts:[],
    _dozGpsTrackLayer:{}, _dozGpsBuffered:0, _dozSelId:null,
    _dozBufferTrackPoint:p => { events.push('write'); if(fail)return false; durable.push(p);return true; },
    _dozSaveLivePts:()=>events.push('snapshot'), _dozUpdGpsStats(){}, _dozCheckBandCross(){},
    _dozGpsDodajSegment:()=>events.push('draw'),
    _processOfflineQueue:async()=>{}, L:{polyline:()=>({addTo(){events.push('draw');}})} };
  vm.createContext(env);vm.runInContext(fn('_dozProcessGpsPoint'),env);
  return { env, durable, events, recover:()=>{fail=false;} };
}
function trag() {
  let fail=true;
  const calls=[], store=new Map([['crash','old snapshot']]);
  const pts=[[44,16,400],[44.1,16.1,420]];
  const env={_tragOn:true,_tragPaused:false,_tragPauseWin:[],_tragLine:{},_tragPts:pts,_tragBuf:[],_tragLastT:20,
    _tragRegistry:[],_TRAG_COLORS:['green'],_aktivniProjektId:null,_projekti:[],_activeTab:'teren',
    _genUUID:()=> 'uuid',fmtDateShort:()=> 'date',
    _tragRegSave:()=>{calls.push('save');if(fail)return false;store.set('reg',JSON.stringify(env._tragRegistry));return true;},
    _tragRegAddLayer:()=>calls.push('layer'),_tragRegRender(){},
    _pauziZavrsi(){},map:{removeLayer(){}},_tragLiveClear(){},document:{getElementById:()=>null},
    _updFabVisibility(){},_rdpSimplify:p=>p,terenRenderTragovi(){},
    showToast:m=>calls.push(m),_tragFmtLen:()=> '10 m',_tragCalcLen:()=>10,
    _tragRetraceReset(){},_crashClearTrag:()=>store.delete('crash'),_bgRecStopIfIdle(){},_crashStopIfIdle(){} };
  vm.createContext(env);vm.runInContext(fn('_tragRegAdd')+'\n'+fn('fabSnimTrag'),env);
  return {env,calls,store,pts,recover:()=>{fail=false;}};
}
const tests=[];
function test(n,f){tests.push([n,f]);}
test('GPS pad trajnog upisa ne pomjera liniju ni statistiku',async()=>{
  const h=gps();await assert.rejects(h.env._dozProcessGpsPoint(45,17,500,5,1,1000),/sačuvana/);
  assert.equal(h.env._dozGpsPts.length,1);assert.equal(h.env._dozGpsLen,0);
  assert.equal(h.env._dozGpsFullPts.length,0);assert.equal(h.env._dozGpsSpdCnt,0);
  assert.deepEqual(h.events,['write']);
});
test('ponavljanje iste GPS tačke nakon oslobađanja prostora stvarno je sprema',async()=>{
  const h=gps();try{await h.env._dozProcessGpsPoint(45,17,500,5,1,1000);}catch{}
  h.recover();await h.env._dozProcessGpsPoint(45,17,500,5,1,1000);
  assert.equal(h.durable.length,1);assert.equal(h.env._dozGpsPts.length,2);
  assert.equal(h.env._dozGpsLen,10);
});
test('neuspjelo završavanje traga čuva aktivni snimak i crash snapshot',()=>{
  const h=trag();h.env.fabSnimTrag();
  assert.equal(h.env._tragOn,true);assert.equal(h.env._tragPts,h.pts);
  assert.equal(h.store.get('crash'),'old snapshot');assert.equal(h.env._tragRegistry.length,0);
  assert.equal(h.calls.includes('layer'),false);assert.ok(!h.calls.some(x=>x.includes('✅')));
});
test('ponovni završetak nakon oporavka pohrane sprema samo jedan trag',()=>{
  const h=trag();h.env.fabSnimTrag();h.recover();h.env.fabSnimTrag();
  assert.equal(h.env._tragOn,false);assert.equal(h.env._tragRegistry.length,1);
  assert.equal(JSON.parse(h.store.get('reg')).length,1);assert.equal(h.store.has('crash'),false);
});
test('oporavak 5000 GPS tačaka ne pravi 4999 zasebnih slojeva',()=>{
  const source=fn('_crashCheck');
  const start=source.indexOf('      _dozGpsTrackLayer = L.layerGroup()');
  const end=source.indexOf('      _dozGpsOn = true;',start);
  let lines=0, vertices=0;
  const env={map:{},_dozGpsPts:Array.from({length:5000},(_,i)=>[44+i/100000,16]),
    L:{layerGroup:()=>({addTo(){return this;}}),polyline:pts=>{lines++;vertices+=pts.length;return{addTo(){}};}}};
  vm.createContext(env);vm.runInContext(source.slice(start,end),env);
  assert.equal(lines,1);assert.equal(vertices,5000);
});
(async()=>{let failed=0;for(const[n,f]of tests){try{await f();console.log('OK '+n);}catch(e){failed++;console.log('FAIL '+n+': '+e.message);}}console.log(`${tests.length-failed}/${tests.length}`);if(failed)process.exitCode=1;})();
