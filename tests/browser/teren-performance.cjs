// Cijela aplikacija + pravi Leaflet; sintetički korisnik, mreža presretnuta.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'../..');
(async()=>{
 const server=http.createServer((req,res)=>{
  if(req.url==='/blank'){res.end('<html></html>');return;}
  const pathname=decodeURIComponent(req.url.split('?')[0]);
  const file=path.resolve(root,'.'+(pathname==='/'?'/index.html':pathname));
  if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
  res.setHeader('Content-Type',({'.html':'text/html','.js':'application/javascript','.wasm':'application/wasm','.css':'text/css','.png':'image/png','.json':'application/json'})[path.extname(file)]||'application/octet-stream');
  const s=fs.createReadStream(file);s.on('error',()=>res.writeHead(404).end());s.pipe(res);
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`;let browser;
 try{
  browser=await chromium.launch({headless:true,executablePath:process.env.US_SUME_BROWSER,args:['--no-sandbox']});
  const ctx=await browser.newContext({serviceWorkers:'block',viewport:{width:412,height:850}});
  const requests=[],writes=[];
  await ctx.route('**/*',async route=>{
   const req=route.request(),url=req.url();if(url.startsWith(base)||url.startsWith('blob:')||url.startsWith('data:'))return route.continue();
   requests.push(url);if(['POST','PATCH','DELETE'].includes(req.method()))writes.push(url);
   if(url.includes('/rest/v1/')){
    const table=new URL(url).pathname.split('/').pop();
    const data=table==='projekt_clanovi'?[{projekt_id:'shared'}]:table==='projekti'?
     [{id:'shared',korisnik_id:'other',gj:'Test GJ',odjel:'105'}]:table==='vlake'?
     [{id:'v-other',nm:'T-poslana',projekt_id:'shared',korisnik_id:'other',updated_at:'2026-10-02T08:00:00Z',pts:[{la:44.8,lo:16.1},{la:44.801,lo:16.101}]}]:[];
    return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});
   }
   return route.abort();
  });
  await ctx.routeWebSocket('**/*',ws=>ws.close());
  await ctx.addInitScript(()=>{window.__online=false;Object.defineProperty(navigator,'onLine',{get:()=>window.__online});});
  const page=await ctx.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+'/blank');
  await page.evaluate(()=>{
   const id='11111111-1111-4111-8111-111111111111';
   localStorage.setItem('tvlake_ol_profile',JSON.stringify({ts:Date.now(),data:{id,ime:'Test',prezime:'Offline',odobren:true,sumarija:'TEST'}}));
   localStorage.setItem('tvlake_device_last_user',id);localStorage.setItem('tvlake_local_vlake_uid',id);
   const rows=Array.from({length:40},(_,i)=>({id:'local-'+i,nm:'T'+i,br:i+1,kr:0,boja:'#4ade80',
    pts:Array.from({length:800},(_,j)=>({la:44.8+j/1e5,lo:16.1+i/1000,al:400+j/100}))}));
   localStorage.setItem('tvlake_local_vlake',JSON.stringify(rows));
  });
  const cdp=await ctx.newCDPSession(page);await cdp.send('Emulation.setCPUThrottlingRate',{rate:4});
  const start=Date.now();await page.goto(base+'/index.html',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>_startupRestore._done&&vlake.length===40,{},{timeout:20000});
  const startupMs=Date.now()-start;
  const perf=await page.evaluate(async()=>{
   const old=L.layerGroup().addTo(map),fresh=L.layerGroup().addTo(map);
   const t0=performance.now();for(let i=0;i<1500;i++)L.polyline([[44.8+i/1e5,16.1],[44.8+(i+1)/1e5,16.1]],{color:'#4ade80',weight:3}).addTo(old);
   await new Promise(requestAnimationFrame);
   const oldMs=performance.now()-t0,oldLayers=old.getLayers().length;
   map.removeLayer(old);const t1=performance.now();
   for(let i=0;i<1500;i++)_dozGpsDodajSegment(fresh,[44.8+i/1e5,16.1],[44.8+(i+1)/1e5,16.1],'#4ade80');
   await new Promise(requestAnimationFrame);
   const newMs=performance.now()-t1,newLayers=fresh.getLayers().length;
   map.removeLayer(fresh);map.removeLayer(fresh._gpsRenderer);
   window.__online=true;_netUzorci=[];_netZabiljezi({ok:true,ttfb:4000,ms:4000});
   return {oldMs,newMs,oldLayers,newLayers,quality:_mrezaStanje(),automaticAllowed:_netDozvoliZahtjev()};
  });
  assert.equal(perf.quality,'slaba');assert.equal(perf.automaticAllowed,false);
  console.log(JSON.stringify({startupMs,...perf}));
  assert.ok(perf.newLayers<=12);
  const before=requests.length;
  await page.evaluate(()=>_reloadCoreData());await page.waitForTimeout(500);
  assert.equal(requests.length,before,'slab signal pokreće pozadinsko osvježavanje');
  await page.evaluate(()=>{kolegeMap.other={ime:'Drugi Projektant'};openSyncQueuePanel();});
  await page.evaluate(()=>serverPreuzmiDijeljeno());
  assert.match(await page.locator('#syncq-primljeno').innerText(),/T-poslana/);
  assert.match(await page.locator('#syncq-primljeno').innerText(),/Drugi Projektant/);
  await page.evaluate(()=>{window.__online=false;openSyncQueuePanel();});
  assert.match(await page.locator('#syncq-primljeno').innerText(),/T-poslana/);
  assert.equal(writes.length,0,'pregled/preuzimanje šalje podatke');assert.deepEqual(errors,[]);
  console.log(JSON.stringify({cpuThrottle:4,vlake:40,points:32000,startupMs,...perf,sharedProjectOffline:true,externalWrites:writes.length,pageErrors:errors.length}));
 }finally{if(browser)await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
