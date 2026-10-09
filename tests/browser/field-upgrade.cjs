'use strict';
// Stvarni IndexedDB, puna aplikacija i Leaflet; svi vanjski servisi blokirani.
const assert=require('node:assert/strict'),http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'../..');
const trace=message=>{if(process.env.US_SUME_TEST_TRACE)console.log(message);};
(async()=>{
 const server=http.createServer((req,res)=>{
  if(req.url==='/blank'){res.end('<html></html>');return;}
  const file=path.resolve(root,'.'+(req.url.split('?')[0]==='/'?'/index.html':req.url.split('?')[0]));
  if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
  res.setHeader('Content-Type',({'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json','.png':'image/png'})[path.extname(file)]||'application/octet-stream');
  const s=fs.createReadStream(file);s.on('error',()=>res.writeHead(404).end());s.pipe(res);
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const url=`http://127.0.0.1:${server.address().port}`;let browser;
 try {
  browser=await chromium.launch({headless:true,executablePath:process.env.US_SUME_BROWSER,args:['--no-sandbox']});
  const ctx=await browser.newContext({serviceWorkers:'block',viewport:{width:412,height:850}}),requests=[];
  await ctx.route('**/*',route=>{if(route.request().url().startsWith(url)||route.request().url().startsWith('blob:'))return route.continue();requests.push(route.request().url());return route.abort();});
  await ctx.routeWebSocket('**/*',ws=>ws.close());
  await ctx.addInitScript(()=>Object.defineProperty(navigator,'onLine',{get:()=>false}));
  const page=await ctx.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(url+'/blank');
  await page.evaluate(()=>{
   const uid='11111111-1111-4111-8111-111111111111';window.uid=uid;
   localStorage.setItem('tvlake_ol_profile',JSON.stringify({ts:Date.now(),data:{id:uid,ime:'Test',prezime:'Teren',odobren:true,sumarija:'TEST'}}));
   localStorage.setItem('tvlake_device_last_user',uid);localStorage.setItem('tvlake_local_vlake_uid',uid);
   const p={user_id:uid,project_id:'odjel-test',latitude:44,longitude:16,recorded_at:'2026-10-02T09:00:00Z'};
   localStorage.setItem('tvlake_doz_track_buf',JSON.stringify([p,{...p,user_id:'other'}]));
  });
  await page.goto(url+'/index.html',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>typeof FieldStore!=='undefined'&&FieldStore.ready&&_startupRestore._done);
  trace('Startup / IndexedDB spremni');
  const migration=await page.evaluate(()=>({own:FieldStore.count(sbUser.id),other:FieldStore.count('other'),old:localStorage.getItem('tvlake_doz_track_buf')}));
  assert.deepEqual(migration,{own:1,other:1,old:null});
  const cdp=await ctx.newCDPSession(page);await cdp.send('Emulation.setCPUThrottlingRate',{rate:4});
  const long=await page.evaluate(async()=>{
   _dozSelId=null;_dozGpsOn=true;_dozGpsProjId='odjel-test';_dozGpsUserId=sbUser.id;_dozGpsSessionId='session-test';
   _dozGpsPts=[];_dozGpsFullPts=[];_dozGpsLen=0;_dozGpsTrackLayer=L.layerGroup().addTo(map);_dozCrossWarnEnabled=false;
   _dozGpsStartTs=Date.now()-6*3600000;_dozGpsPaused=false;
   const oldSet=Storage.prototype.setItem,writes=[];
   Storage.prototype.setItem=function(k,v){if(k==='tvlake_doz_track_buf'||k==='tvlake_doz_live')writes.push(v.length);return oldSet.call(this,k,v);};
   const times=[];
   for(let i=0;i<1200;i++){const t=performance.now();await _dozProcessGpsPoint(44+i/10000,16,400,5,1,_dozGpsStartTs+i*18000);times.push(performance.now()-t);}
   Storage.prototype.setItem=oldSet;
   const last=await FieldStore.live(sbUser.id);
   return {count:FieldStore.count(sbUser.id),sessionPoints:last.pts.length,full:last.fullPts.length,legacyWrites:writes.length,
    first100:times.slice(0,100).reduce((a,b)=>a+b,0),last100:times.slice(-100).reduce((a,b)=>a+b,0)};
  });
  assert.equal(long.count,1201);assert.equal(long.sessionPoints,1200);assert.equal(long.full,1200);assert.equal(long.legacyWrites,0);
  trace('1200 GPS tačaka potvrđeno');
  assert.equal(await page.evaluate(async()=>{const n=_dozGpsPts.length;await _crashCheck();return n===_dozGpsPts.length;}),true,'startup recovery prepisuje živo snimanje');
  const failure=await page.evaluate(async()=>{
   const before=_dozGpsPts.length,put=IDBObjectStore.prototype.put;
   IDBObjectStore.prototype.put=function(row){if(this.name==='pending'&&row.latitude===44.2)throw new DOMException('Test puna pohrana','QuotaExceededError');return put.apply(this,arguments);};
   let failed=false;try{await _dozProcessGpsPoint(44.2,16,400,5,1,Date.now()+7000000);}catch(e){failed=true;}
   const afterFailure=_dozGpsPts.length;IDBObjectStore.prototype.put=put;
   await _dozProcessGpsPoint(44.21,16,410,5,1,Date.now()+7005000);
   return {failed,before,afterFailure,last:_dozGpsPts.slice(-2),durable:(await FieldStore.live(sbUser.id)).pts.slice(-2)};
  });
  assert.equal(failure.failed,true);assert.equal(failure.before,failure.afterFailure);
  assert.deepEqual(failure.last,[[44.2,16],[44.21,16]]);assert.deepEqual(failure.last,failure.durable);
  trace('Puna memorija / oporavak potvrđeni');
  const before=requests.length;
  const copy=await page.evaluate(async()=>{
   _activeTab='doznaka';_dozSelId='odjel-test';_dozOdjeli=[{id:'odjel-test',name:'TEST 105',created_by:sbUser.id}];
   _fieldStatusUpdate();return _fieldMakeBackup();
  });
  await page.waitForTimeout(150);assert.equal(requests.length,before);
  assert.match(await page.locator('#field-status').innerText(),/upis potvrđen/);
  const integrity=await page.evaluate(async copy=>{
   await _fieldValidateBackup(copy);copy.data.createdAt='tampered';
   try{await _fieldValidateBackup(copy);return false;}catch(e){return e.message.includes('oštećena');}
  },copy);assert.equal(integrity,true);
  // Ponovno otvaranje zasebne stranice: nema in-memory GPS niza prethodne stranice.
  const cold=await ctx.newPage();await cold.goto(url+'/blank');await cold.addScriptTag({url:url+'/static/js/field-store.js'});
  trace('Hladno otvaranje za oporavak');
  const recovery=await cold.evaluate(async uid=>{await FieldStore.init();const s=await FieldStore.live(uid);return{n:s.pts.length,last:s.pts.slice(-2),time:s.fullPts[0].time};},copy.data.uid);
  assert.equal(recovery.n,1202);assert.deepEqual(recovery.last,[[44.2,16],[44.21,16]]);assert.ok(recovery.time);
  await page.evaluate(async copy=>{
   _dozGpsOn=false;_dlgConfirm=async()=>true;
   await fieldImportBackup({size:JSON.stringify(copy).length,text:async()=>JSON.stringify(copy)});
   await fieldImportBackup({size:JSON.stringify(copy).length,text:async()=>JSON.stringify(copy)});
  },copy);
  assert.equal(await page.evaluate(()=>FieldStore.count(sbUser.id)),1203); // legacy + 1202 snimljene
  const isolated=await page.evaluate(async()=>{
   const before=FieldStore.count('other'),ids=FieldStore.view('other').map(p=>p._qid);
   await FieldStore.acknowledge(sbUser.id,ids);return {before,after:FieldStore.count('other')};
  });assert.deepEqual(isolated,{before:1,after:1});
  const acknowledged=await page.evaluate(async copy=>{
   const id=FieldStore.view(sbUser.id)[0]._qid;
   await FieldStore.acknowledge(sbUser.id,[id]);const n=FieldStore.count(sbUser.id);
   await FieldStore.importOwner(sbUser.id,copy.data.journal);
   return FieldStore.count(sbUser.id)===n;
  },copy);assert.equal(acknowledged,true,'backup ponovo stavlja potvrđeni upis u red');
  // Čist profil/browser: stvarna obnova kopije, ne samo dedup postojećih redova.
  const freshCtx=await browser.newContext({serviceWorkers:'block'});
  await freshCtx.route('**/*',route=>route.request().url().startsWith(url)?route.continue():route.abort());
  await freshCtx.routeWebSocket('**/*',ws=>ws.close());
  await freshCtx.addInitScript(()=>Object.defineProperty(navigator,'onLine',{get:()=>false}));
  const fresh=await freshCtx.newPage();await fresh.goto(url+'/blank');
  await fresh.evaluate(uid=>{
   localStorage.setItem('tvlake_ol_profile',JSON.stringify({ts:Date.now(),data:{id:uid,ime:'Test',prezime:'Teren',odobren:true,sumarija:'TEST'}}));
   localStorage.setItem('tvlake_device_last_user',uid);localStorage.setItem('tvlake_local_vlake_uid',uid);
  },copy.data.uid);
  await fresh.goto(url+'/index.html');await fresh.waitForFunction(()=>FieldStore.ready);
  trace('Čist profil spreman za obnovu');
  const restored=await fresh.evaluate(async copy=>{
   _dlgConfirm=async()=>true;
   await fieldImportBackup({size:JSON.stringify(copy).length,text:async()=>JSON.stringify(copy)});
   const live=await FieldStore.live(sbUser.id);
   return {count:FieldStore.count(sbUser.id),n:live?.pts.length,last:live?.pts.slice(-2),project:_dozOdjeli.some(p=>p.id==='odjel-test')};
  },copy);
  assert.deepEqual(restored,{count:1203,n:1202,last:[[44.2,16],[44.21,16]],project:true});
  const normal=await fresh.evaluate(async()=>{
   _dozGpsOn=false;_activeTab='projekat';_aktivniProjektId='normal-test';
   _projekti.push({id:'normal-test',korisnik_id:sbUser.id,gj:'Test GJ',odjel:'106'});
   const copy=await _fieldMakeBackup();
   copy.data.vlake=[{id:'vlaka-copy',nm:'T7',br:7,kr:0,boja:'#4ade80',projekt_id:'normal-test',pts:[{la:44,lo:16,al:400},{la:44.01,lo:16.01,al:410}]}];
   copy.sha256=await _fieldChecksum(copy.data);
   const file={size:JSON.stringify(copy).length,text:async()=>JSON.stringify(copy)};
   await fieldImportBackup(file);await fieldImportBackup(file);
   return vlake.filter(v=>v.nm==='T7'&&v.projektId==='normal-test').map(v=>v.pts.length);
  });assert.deepEqual(normal,[2],'obnovljena vlaka odmah postoji u memoriji i ne duplira se');
  trace('Obnova i vlasnička izolacija potvrđene; zatvaranje testnog profila');
  await freshCtx.close();
  const corrupt=await page.evaluate(async()=>{
   localStorage.setItem('tvlake_doz_track_buf','{broken');
   let failed=false;try{await FieldStore.init();}catch(e){failed=true;}
   const kept=localStorage.getItem('tvlake_doz_track_buf')==='{broken';localStorage.removeItem('tvlake_doz_track_buf');
   return {failed,kept};
  });assert.deepEqual(corrupt,{failed:true,kept:true});
  assert.deepEqual(errors,[]);
  trace('Sve provjere prolaze; screenshot');
  await page.screenshot({path:path.resolve(root,'outputs/field-upgrade.png'),fullPage:false});
  console.log(JSON.stringify({checks:18,cpuThrottle:4,...long,recoveryPoints:recovery.n,roundTrip:true,freshRestore:true,ownerIsolation:true,pageErrors:errors.length}));
 }finally{if(browser)await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
