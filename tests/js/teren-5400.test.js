'use strict';
// 3 km GPS snimanja + 2,4 km kolege, izvorni JS; lažni GPS/server/Leaflet.
// FIELD_APP_ROOT omogućava provjeru identičnih izvora iz objavljenog APK-a.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const {performance}=require('node:perf_hooks');
const app=process.env.FIELD_APP_ROOT||'.';
const harness=fs.readFileSync('tests/js/server-dvije-vlake.test.js','utf8').split('const tests=[];')[0];
const requireSource=name=>name==='node:fs'?{...fs,readFileSync:(p,...args)=>fs.readFileSync(path.join(app,p),...args)}:require(name);
const {setup,fn}=new Function('require',harness+'\nreturn {setup,fn};')(requireSource);
const report={version:fs.readFileSync(path.join(app,'index.html'),'utf8').match(/const APP_VER = 'v([^']+)'/)[1],method:'Node, stvarni APK JS, simulirani GPS/server/Leaflet; nije telefon niti mjerenje WebView brzine',checks:[],timings:{}};
function source(e,names){vm.runInContext(names.map(fn).join('\n'),e);}
function init(uid,store){
 const h=setup(uid),e=h.e;
 if(store){e.localStorage.getItem=k=>store.get(k)||null;e.localStorage.setItem=(k,v)=>store.set(k,v);e.localStorage.removeItem=k=>store.delete(k);}else e.localStorage.removeItem=k=>h.store.delete(k);
 Object.assign(e,{LOCAL_VLAKE_KEY:'tvlake_local_vlake',_syncRerun:false,_syncOdgodaT:null,_SYNC_PAUZA_MS:20000,
   _mrezaProbaj:()=>e.navigator.onLine,_NET_SVJEZE_MS:600000,_NET_SPORO_MS:2500,_NET_PROBA_MS:30000,_NET_PROZOR_MS:20000,
   _netUzorci:[],_netProbaDo:0,_netSilaDo:0});
 source(e,['_saveLocalVlake','_loadLocalVlake','_processOfflineQueue','_isNetworkErr','_isAuthErr','_serverPrivremeno']);
 return h;
}
function recorder(e){
 Object.assign(e,{recOn:true,recPaused:false,actI:0,GPS_MAX_ACC:15,GPS_MIN_DIST:3,GPS_MAX_JUMP:25,GPS_MAX_SPEED:2.5,
   GPS_GAP_WARN_MS:60000,MPDEG:111320,_VL_RETRACE_MIN_W:6,_VL_RETRACE_MAX_W:9,_forestMode:true,
   _lastFixRaw:null,_pendingJumpFix:null,_lastRecTime:0,_lastPtAcceptedAt:0,_vlSesijaPocetak:{},_vlRetrace:null,
   _parentReturnIdx:null,_parentReturnTrimToIdx:-1,bufLayers:[],activeTool:null,
   _parentOf:()=>-1,_scheduleOvlRnd(){},updBan(){},updateVlakaLabel(){},scheduleVlakaSave(){},_markGpsGapOnMap(){}});
 source(e,['dst','calcL','_gpsDistMul','_rtLa','_rtLo','_vlRetraceSirina','_vlRetraceTest','_vlUgaoSkretanja',
   '_vlVrhSumnjiv','_vlRetraceObreziVrh','_vlRetraceSkiniSiljak','_vlRetraceZastita','addPt','_vlakaProcessGpsPoint',
   '_crashSaveVlaka','_recoverVlakaSnapshot']);
 Object.assign(e,{_CRASH_VLAKA_KEY:'tvlake_crash_vlaka_v2',_crashUpisPaoV:false,
   getVlakaWeight:()=>3,getVlakaDashArray:()=>null,_vlakeRenderer:{}});
}
function line(e,nm,metres,offset=0){
 const pts=Array.from({length:metres/4+1},(_,i)=>({la:44.9+i*4/6371000*180/Math.PI,lo:16+offset,al:450+i*.05}));
 return {nm,br:Number(nm.slice(1)),kr:0,color:'#16a34a',projektId:'P',projektantIme:'Emina Projektant',pts,
   poly:e.L.polyline([],{})};
}
const check=(n)=>{report.checks.push(n);console.log('OK '+n);};
(async()=>{
 const h=init('owner'),e=h.e;recorder(e);e.navigator.onLine=false;
 let start=performance.now(),snap;
 for(let i=0;i<6;i++){
  const route=line(e,'T'+(i+1),500,i*.002),planned=route.pts;route.pts=[];
  route.poly.addLatLng=()=>{};e.vlake.push(route);e.actI=i;e._lastFixRaw=null;e._lastRecTime=0;e._lastPtAcceptedAt=0;e._vlRetrace=null;
  planned.forEach((p,j)=>e._vlakaProcessGpsPoint(p.la,p.lo,6,p.al,1.2,1000000+i*1000000+j*4000));
  assert.equal(route.pts.length,planned.length);assert.ok(Math.abs(e.calcL(route.pts)-500)<.01);
  e._crashSaveVlaka();snap=JSON.parse(e.localStorage.getItem(e._CRASH_VLAKA_KEY));assert.equal(snap.pts.length,126);
  await e.sbFlushVlaka(i);
 }
 report.timings.record_and_persist_cpu_ms=performance.now()-start;
 assert.equal(h.requests.length,0);assert.equal(e.ol.loadQueue(true).length,6);
 assert.ok(Math.abs(e.vlake.reduce((s,v)=>s+e.calcL(v.pts),0)-3000)<.01);
 check('3.000 m kroz stvarni GPS filter: 6 × 500 m, 756 tačaka, offline bez ijednog zahtjeva');
 const long=init('owner');recorder(long.e);long.e.navigator.onLine=false;
 const longRoute=line(long.e,'T100',3000),fixes=longRoute.pts;longRoute.pts=[];longRoute.poly.addLatLng=()=>{};long.e.vlake.push(longRoute);
 const fixTimes=[];
 fixes.forEach((p,j)=>{const t=performance.now();long.e._vlakaProcessGpsPoint(p.la,p.lo,6,p.al,1.2,1000000+j*4000);fixTimes.push(performance.now()-t);});
 assert.equal(longRoute.pts.length,751);assert.ok(Math.abs(long.e.calcL(longRoute.pts)-3000)<.01);
 const count=longRoute.pts.length,p=fixes.at(-1);
 long.e._vlakaProcessGpsPoint(p.la+.1,p.lo,40,p.al,1.2,4100000);assert.equal(longRoute.pts.length,count,'loša GPS tačnost ne smije dodati lažni skok');
 long.e._vlakaProcessGpsPoint(p.la+4/6371000*180/Math.PI,p.lo,6,p.al,1.2,4120000);assert.equal(longRoute.pts.at(-1).gap,true,'prekid GPS-a ostaje označen');
 fixTimes.sort((a,b)=>a-b);report.timings.single_3000m_gps_fix_p95_cpu_ms=fixTimes[Math.floor(fixTimes.length*.95)];
 check('Jedna vlaka 3.000 m / 751 tačka: bez interneta; netačan GPS odbačen, prekid satelitskog signala označen');
 const restarted=init('owner',h.store);recorder(restarted.e);restarted.e.navigator.onLine=false;
 const saved=restarted.e._loadLocalVlake();assert.equal(saved.length,6);assert.equal(saved.reduce((s,v)=>s+v.pts.length,0),756);
 restarted.e.vlake=saved.map(r=>({...r,color:r.boja,projektId:r.projekt_id,sbId:r.id,poly:restarted.e.L.polyline([],{} )}));
 assert.equal(restarted.e.ol.loadQueue(true).length,6);
 const crash=init('owner');recorder(crash.e);const idx=crash.e._recoverVlakaSnapshot(snap);
 crash.e.vlake[idx].pts=snap.pts.map(([la,lo,al])=>({la,lo,al}));assert.equal(crash.e._saveLocalVlake(),true);
 assert.equal(crash.e.vlake[idx].projektId,'P');assert.ok(Math.abs(crash.e.calcL(crash.e.vlake[idx].pts)-500)<.01);
 check('Restart: svih 756 tačaka i 6 operacija obnovljeno; crash snapshot čuva projekat i 500 m');
 // OS prikazuje online, ali server ne odgovara. Deset ručnih pokušaja.
 const r=restarted.e;r.navigator.onLine=true;restarted.e.reply=()=>({data:null,error:{message:'network timeout'}});
 for(let i=0;i<10;i++)await r.serverPosalji();
 assert.equal(r.ol.loadQueue(true).length,6);assert.equal(restarted.database.length,0);assert.ok(r.ol.loadQueue().every(o=>!o._blocked));
 assert.equal(restarted.requests.length,10,'jedan neuspio zahtjev za svaki ručni pokušaj, ne šest čekanja');
 check('10 neuspjelih ručnih slanja: red ostaje potpun, bez blokiranja i bez lažne potvrde');
 restarted.e.reply=null;start=performance.now();await r.serverPosalji();report.timings.send_mock_cpu_ms=performance.now()-start;
 assert.equal(restarted.database.length,6);assert.equal(r.ol.loadQueue(true).length,0);assert.ok(r.vlake.every(v=>v.sbId));
 await r.serverPosalji();assert.equal(restarted.database.length,6);
 check('Povratak veze i ručno slanje: svih 6 potvrđeno, ponovljeno slanje bez duplikata');
 // Server prihvati, ali se odgovor izgubi: drugi pokušaj mora pronaći taj red.
 const lost=init('owner');lost.e.vlake.push(line(lost.e,'T99',500));await lost.e.sbFlushVlaka(0);
 let hidden=true;lost.e.reply=call=>{
  if(call.mode==='insert'&&hidden){hidden=false;lost.database.push({...call.payload,id:'accepted',rev:1});return {data:null,error:{message:'network timeout'}};}
  const rows=lost.database.filter(row=>call.filters.every(f=>f(row)));
  if(call.mode==='update')for(const row of rows)Object.assign(row,call.payload,{rev:row.rev+1});
  return {data:call.single?rows[0]||null:rows,error:null};
 };
 await lost.e.serverPosalji();assert.equal(lost.e.ol.loadQueue().length,1);await lost.e.serverPosalji();
 assert.equal(lost.database.length,1);assert.equal(lost.e.vlake[0].sbId,'accepted');assert.equal(lost.e.ol.loadQueue().length,0);
 check('Prihvaćen upis bez odgovora: ponovni pokušaj bez dupliranja vlake');
 const colleague=Array.from({length:4},(_,i)=>({id:'C'+i,korisnik_id:'member',projekt_id:'P',nm:'T'+(i+7),br:i+7,kr:0,
   projektant_ime:'Amir Kolega',pts:line(r,'T'+(i+7),600,.014+i*.002).pts,rev:1}));
 restarted.database.push(...colleague);start=performance.now();await r.serverPreuzmiDijeljeno();report.timings.receive_mock_cpu_ms=performance.now()-start;
 assert.equal(r.kolegeVlake.length,4);assert.ok(Math.abs(Object.values(r.kolegeVlakeMap).reduce((s,v)=>s+r.calcL(v.pts),0)-2400)<.01);
 assert.ok(Object.values(r.kolegeVlakeMap).every(v=>v.poly.clickKey&&v.ime==='Amir Kolega'));
 const ownBefore=JSON.stringify(r.vlake.map(v=>v.pts));await r.serverPreuzmiDijeljeno();assert.equal(r.kolegeVlake.length,4);assert.equal(JSON.stringify(r.vlake.map(v=>v.pts)),ownBefore);
 check('Primljeno 4 × 600 m kolege: 604 tačke, tačan projektant, klik, 5.400 m ukupno bez duplikata');
 // Prekid usred višestraničnog preuzimanja ne smije zamijeniti dobar keš.
 const cacheBefore=r.localStorage.getItem('kvc');r._vlakePreuzmiStranice=async()=>{throw Error('network timeout');};
 await r.serverPreuzmiDijeljeno();assert.equal(r.localStorage.getItem('kvc'),cacheBefore);assert.equal(r.kolegeVlake.length,4);
 const offline=init('owner',restarted.store.size?restarted.store:h.store);recorder(offline.e);offline.e.navigator.onLine=false;
 offline.e.reply=()=>({data:null,error:{message:'network offline'}});await offline.e.sbLoadKolegeVlake();
 assert.equal(offline.e.kolegeVlake.length,4);
 assert.ok(Math.abs(Object.values(offline.e.kolegeVlakeMap).reduce((s,v)=>s+offline.e.calcL(v.pts),0)-2400)<.01);
 check('Neuspjelo preuzimanje čuva keš; novi offline proces vraća svih 2.400 m kolege');
 const gate=init('owner').e;source(gate,['_netSvjezi','_netMedijanMs','_netKvalitet','_mrezaProbaj','_mrezaSila','_netDozvoliZahtjev']);
 gate._netUzorci=[{ok:true,ms:4000,t:Date.now()}];assert.equal(gate._netKvalitet(),'slaba');assert.equal(gate._netDozvoliZahtjev(),false);
 gate._mrezaSila();assert.equal(gate._netDozvoliZahtjev(),true);gate._netSilaDo=0;
 gate._netUzorci=[{ok:false,ms:15000,t:Date.now()},{ok:false,ms:15000,t:Date.now()}];assert.equal(gate._netKvalitet(),'nema');assert.equal(gate._netDozvoliZahtjev(),false);
 check('Slaba/mrtva veza uz onLine=true: automatski zahtjevi odbijeni, ručni pokušaj dopušten');
 report.own_metres=3000;report.colleague_metres=2400;report.total_points=1360;
 const out='outputs/field-simulation';fs.mkdirSync(out,{recursive:true});fs.writeFileSync(out+'/integrity.json',JSON.stringify(report,null,2));
 console.log(JSON.stringify(report.timings));
})().catch(e=>{console.error(e);process.exitCode=1;});
