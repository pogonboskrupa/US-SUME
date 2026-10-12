'use strict';
// Pet sati simuliranog vremena, ne pet sati baterije niti fizički Redmi.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync(process.env.FIELD_SOURCE||'index.html','utf8');
function fn(name){const start=html.search(new RegExp('(?:async )?function '+name+'\\('));assert(start>=0,name);let d=0;
 for(let i=html.indexOf('{',start);i<html.length;i++){if(html[i]==='{')d++;if(html[i]==='}'&&!--d)return html.slice(start,i+1);}}
const tests=[];const test=(n,f)=>tests.push([n,f]);
function stats(){let paths=0,draws=0;const frames=[];const canvas={width:300,height:80,getClientRects:()=>[{}],getContext:()=>ctx};
 const ctx={clearRect(){draws++;},beginPath(){},moveTo(){},lineTo(){paths++;},closePath(){},fill(){},stroke(){},fillText(){},
 createLinearGradient:()=>({addColorStop(){}})};
 const elements={'doz-elev-canvas':canvas,'doz-gps-stats':{style:{}},'doz-gps-elev':{style:{}}};
 const e={document:{hidden:false,getElementById:k=>elements[k]},requestAnimationFrame:f=>{frames.push(f);return frames.length;},
 _dozGpsStartTs:Date.now(),_dozGpsPausedTime:0,_dozGpsPaused:false,_dozGpsPauseStart:0,_dozGpsLen:0,_dozGpsMaxSpd:0,
 _dozGpsPts:[],_dozGpsElevData:[],_dozGpsBuffered:0,fmtL:String};
 vm.createContext(e);vm.runInContext(['_dozUpdGpsStats','_dozCalcElevGain','_dozDrawElevProfile'].map(fn).join('\n'),e);
 return {e,frames,canvas,counts:()=>({draws,paths}),flush(){while(frames.length)frames.shift()();}};}
test('1800 fikseva dopune: jedna slika, posljednja tačnost, puna visinska statistika',()=>{
 const h=stats();for(let i=0;i<1800;i++){h.e._dozGpsElevData.push(400+(i%20)*2);h.e._dozUpdGpsStats(5+i%3);}
 assert.equal(h.counts().draws,0);assert.equal(h.frames.length,1);h.flush();assert.equal(h.counts().draws,1);
 const ref=h.e._dozGpsElevData.reduce((a,v,i,d)=>{if(i){const x=v-d[i-1];if(x>1)a.gain+=x;else if(x< -1)a.loss-=x;}return a;},{gain:0,loss:0});
 assert.deepEqual(JSON.parse(JSON.stringify(h.e._dozCalcElevGain())),ref);
 assert.match(h.e.document.getElementById('doz-gps-stats').innerHTML,/±7m/);
 console.log('PROFILE '+JSON.stringify(h.counts()));
});
test('pozadina i sakriven profil ne crtaju canvas; povratak crta trenutne podatke',()=>{
 const h=stats();h.e._dozGpsElevData=[400,420,410];h.e.document.hidden=true;h.e._dozUpdGpsStats(6);
 assert.equal(h.frames.length,0);h.e.document.hidden=false;h.canvas.getClientRects=()=>[];h.e._dozUpdGpsStats(6);h.flush();
 assert.equal(h.counts().draws,0);h.canvas.getClientRects=()=>[{}];h.e._dozUpdGpsStats(6);h.flush();assert.equal(h.counts().draws,1);
});
test('nova sesija i oporavljene visine resetuju računicu uspona',()=>{
 const h=stats();h.e._dozGpsElevData=[400,420,410];assert.equal(h.e._dozCalcElevGain().gain,20);
 h.e._dozGpsElevData.push(430);assert.equal(h.e._dozCalcElevGain().gain,40);
 h.e._dozGpsElevData=[600,603];assert.equal(h.e._dozCalcElevGain().gain,3);
 h.e._dozGpsElevData.length=0;assert.equal(h.e._dozCalcElevGain().gain,0);
});
function replay(change=false){let calls=0,acks=0,breaks=0;const pts=Array.from({length:1800},(_,i)=>({t:1000+i*2000,la:44+i/1e5,lo:16,ac:5,al:400,sp:1}));
 const e={AndroidGps:{readNativeBuffer(){}},sbUser:{id:'u'},recOn:true,actI:0,_tragOn:false,_dozGpsOn:false,
 _nativeSessionSince:{vlaka:0,trag:0,doznaka:0},_nativeReplayLast:{vlaka:0,trag:0,doznaka:0},_onPLastFixTs:0,
 _crashCheck(){},_nativeBufUzmi:()=>pts,_recPauseWin:[],_tragPauseWin:[],_dozPauseWin:[],
 _uPauziIntervalu:()=>false,_filteredAlt:x=>x,_vlakaProcessGpsPoint(){calls++;},_saveLocalVlake:()=>true,
 _nativeBufPotvrdi(){acks++;},_pauziOcistiZatvorene(){},showToast(){},
 setTimeout(f){breaks++;if(change)e.actI=1;setImmediate(f);}};
 vm.createContext(e);vm.runInContext(fn('_drainNativeGpsBuffer'),e);
 return {e,counts:()=>({calls,acks,breaks})};}
test('sat native dopune vlake vraća UI tok i potvrđuje sve tačke tek na kraju',async()=>{
 const h=replay();await h.e._drainNativeGpsBuffer();assert.equal(h.counts().calls,1800);assert.equal(h.counts().acks,1);
 assert(h.counts().breaks>=100);assert.equal(h.e._nativeReplayLast.vlaka,1000+1799*2000);
});
test('promjena vlake tokom dopune ne upisuje u novu vlaku niti potvrđuje journal',async()=>{
 const h=replay(true);await h.e._drainNativeGpsBuffer();assert.equal(h.counts().calls,16);assert.equal(h.counts().acks,0);
 assert.equal(h.e._drainNativeGpsBuffer._busy,false);
});
test('pet sati: 4×30min vlaka/30min drugih radnji + 1h doznake, mobilna veza dolazi i nestaje',async()=>{
 const fieldHarness=fs.readFileSync('tests/js/teren-5400.test.js','utf8').split('const check=')[0];
 const {init,recorder}=new Function('require','process',fieldHarness+'\nreturn {init,recorder};')(require,process);
 const own=init('owner');recorder(own.e);const v=own.e;
 const base=Date.UTC(2026,9,5,6);let ownCount=0,uiChecks=0;
 for(let session=0;session<4;session++){
  const route={nm:'T'+(session+1),br:session+1,kr:0,color:'#16a34a',projektId:'P',pts:[],poly:{addLatLng(){}}};
  v.vlake.push(route);v.actI=session;v._lastFixRaw=null;v._lastRecTime=0;v._lastPtAcceptedAt=0;v._vlRetrace=null;
  for(let i=0;i<900;i++){
   v.navigator.onLine=i%300<100;
   v._vlakaProcessGpsPoint(44.9+i*4/6371000*180/Math.PI,16+session*.002,i%100===0?40:6,400+i*.01,2,base+session*3600000+i*2000);
  }
  assert.equal(route.pts.length,891);ownCount+=route.pts.length;
  await v.sbFlushVlaka(session);v._crashSaveVlaka();
  // Pola sata drugih radnji: ponovna čitanja trajnih vlaka, računica i provjera reda.
  for(let j=0;j<30;j++){assert.equal(v._loadLocalVlake().length,session+1);assert(v.calcL(route.pts)>3500);v.ol.loadQueue(true);uiChecks++;}
 }
 assert.equal(own.requests.length,0,'sam povratak mobilnih podataka ne šalje vlake');
 assert.equal(v.ol.loadQueue(true).length,4);assert.equal(v._loadLocalVlake().reduce((s,r)=>s+r.pts.length,0),ownCount);
 const harness=fs.readFileSync('tests/js/field-upgrade.test.js','utf8').split('const tests=[];')[0];
 const {gps}=new Function('require',harness+'\nreturn {gps};')(require),h=gps();
 // GPS/persistencija su iz aplikacije; IDB transakcije i senzor su kontrolisani.
 h.e.fmtL=String;
 let accepted=0;const times=[];
 for(let i=0;i<1800;i++){
  h.e.navigator.onLine=i%300<100;h.e._dozGpsPaused=i>=600&&i<660;
  const t=performance.now();await h.e._dozProcessGpsPoint(44+i*.00004,16,400+i*.01,i%100===0?40:6,1,base+4*3600000+i*2000);
  times.push(performance.now()-t);if(!h.e._dozGpsPaused&&i%100!==0)accepted++;
 }
 assert.equal(h.durable.length,accepted);assert.equal(h.e._dozGpsPts.length,accepted);assert.equal(h.writes.length,0);
 assert.equal(new Set(h.durable.map(r=>r.p.recorded_at)).size,accepted);
 const gain=h.e._dozGpsFullPts.length;await h.e.dozStopGPS();assert.equal(h.e._dozGpsOn,false);assert.equal(h.e._dozGpsFullPts.length,gain);
 times.sort((a,b)=>a-b);
 console.log('TEREN '+JSON.stringify({simulatedHours:5,vlakaFixes:3600,vlakaAccepted:ownCount,uiChecks,doznakaFixes:1800,doznakaAccepted:accepted,pausedFixes:60,p95NodeMs:times[Math.floor(times.length*.95)],maxNodeMs:times.at(-1),phone:false}));
});
(async()=>{let bad=0;for(const[n,f]of tests){try{await f();console.log('OK '+n);}catch(e){bad++;console.error('FAIL '+n,e.message);}}
 if(bad)process.exitCode=1;})();
