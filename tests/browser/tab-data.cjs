// Offline UI pregled: stvarna aplikacija, bez pristupa produkcijskim servisima.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require('playwright'),root=path.resolve(__dirname,'../..');
(async()=>{
 const server=http.createServer((req,res)=>{
  if(req.url==='/blank'){res.end('<html></html>');return;}
  const pathname=decodeURIComponent(req.url.split('?')[0]);
  const file=path.resolve(root,'.'+(pathname==='/'?'/index.html':pathname));
  if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
  res.setHeader('Content-Type',({'.html':'text/html','.js':'application/javascript','.wasm':'application/wasm','.css':'text/css','.json':'application/json'})[path.extname(file)]||'application/octet-stream');
  const s=fs.createReadStream(file);s.on('error',()=>res.writeHead(404).end());s.pipe(res);
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`;let browser;
 try{
  browser=await chromium.launch({headless:true,executablePath:process.env.US_SUME_BROWSER,args:['--no-sandbox']});
  const ctx=await browser.newContext({serviceWorkers:'block',viewport:{width:412,height:850}}),external=[];
  await ctx.route('**/*',r=>{if(r.request().url().startsWith(base))return r.continue();external.push(r.request().url());return r.abort();});
  await ctx.routeWebSocket('**/*',ws=>ws.close());
  await ctx.addInitScript(()=>Object.defineProperty(navigator,'onLine',{get:()=>false}));
  const page=await ctx.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+'/blank');await page.evaluate(()=>{
   const id='11111111-1111-4111-8111-111111111111';
   localStorage.setItem('tvlake_ol_profile',JSON.stringify({ts:Date.now(),data:{id,ime:'Test',prezime:'Offline',odobren:true,sumarija:'TEST'}}));
   localStorage.setItem('tvlake_device_last_user',id);
  });
  await page.goto(base+'/index.html',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>_startupRestore._done&&typeof _tabListRender==='function');
  await page.waitForTimeout(300);const startupRequests=external.length;
  const cdp=await ctx.newCDPSession(page);await cdp.send('Emulation.setCPUThrottlingRate',{rate:4});
  const metrics=await page.evaluate(()=>{
   _projekti=[{id:'p1',gj:'GJ Test',odjel:'105',korisnik_id:sbUser.id},{id:'p2',gj:'GJ Drugi',odjel:'206',korisnik_id:sbUser.id}];
   _aktivniProjektId='p1';
   const rows=Array.from({length:240},(_,i)=>({id:'v'+i,nm:'T'+(i+1),br:i+1,kr:0,projekt_id:'p1',korisnik_id:sbUser.id,boja:'#4ade80',pts:[{la:44.8+i/10000,lo:16.1},{la:44.801+i/10000,lo:16.101}]}));
   _applyVlakeRows(rows);_OL.enqueue({type:'upsert_vlaka',payload:{id:'v0',projekt_id:'p1',nm:'T1'}});
   kolegeVlakeMap=Object.fromEntries(Array.from({length:180},(_,i)=>['other::K'+i,{ime:'Kolega '+(i%3),pts:[{la:44.8,lo:16.1},{la:44.81,lo:16.11}],color:'#4ade80'}]));
   switchTab('vlake');const t=performance.now();rndList();return {renderMs:performance.now()-t,rows:document.querySelectorAll('#vl .vrow').length};
  });
  assert.equal(metrics.rows,60);
  await page.evaluate(()=>_tabPage(2));assert.equal(await page.locator('#vl .vrow').count(),60);
  await page.evaluate(()=>selI(vlake.findIndex(v=>v.nm==='T240')));assert.equal(await page.locator('#vl .vrow.act .vcard-name').textContent(),'T240');
  await page.evaluate(()=>_tabFilter('pending'));assert.equal(await page.locator('#vl .vrow').count(),1);
  assert.match(await page.locator('#vl .data-row-status').textContent(),/nije poslano/);
  await page.evaluate(()=>_tabFilter('all'));assert.match(await page.locator('#vl .data-row-status').nth(1).textContent(),/Na serveru/);
  await page.locator('#vl-trazi').fill('T2');const filtered=await page.locator('#vl .vrow').count();assert.ok(filtered>0&&filtered<=60);
  await page.waitForTimeout(500); // završi prethodni smooth scroll od selI
  await page.evaluate(()=>document.getElementById('panel').scrollTop=600);const scroll=await page.evaluate(()=>document.getElementById('panel').scrollTop);assert.ok(scroll>0);
  await page.evaluate(()=>switchTab('karta'));await page.evaluate(()=>switchTab('vlake'));await page.waitForTimeout(100);
  assert.equal(await page.locator('#vl-trazi').inputValue(),'T2');const restoredScroll=await page.evaluate(()=>document.getElementById('panel').scrollTop);assert.ok(Math.abs(restoredScroll-scroll)<=2,JSON.stringify({scroll,restoredScroll}));
  await page.evaluate(()=>{_tabRemember('vlake');_aktivniProjektId='p2';rndList();_tabRestore('vlake');});assert.equal(await page.locator('#vl-trazi').inputValue(),'');
  await page.evaluate(()=>{_tabRemember('vlake');_aktivniProjektId='p1';rndList();_tabRestore('vlake');});assert.equal(await page.locator('#vl-trazi').inputValue(),'T2');
  await page.evaluate(()=>rndKolegeVlakeList());assert.equal(await page.locator('#kolege-vl .vrow').count(),60);
  await page.locator('#data-colleague-controls input').fill('Kolega 1');assert.equal(await page.locator('#kolege-vl .vrow').count(),60);
  await page.locator('#data-colleague-controls input').fill('Kolega ne postoji');assert.equal(await page.locator('#kolege-vl .vrow').count(),0);
  await page.evaluate(()=>{
   for(let i=0;i<80;i++)_OL.enqueue({type:'delete_vlaka',payload:{id:'del'+i},_lastErr:i===0?{message:'Odbijeno'}:undefined,_blocked:i===0});
   const q=_OL.loadQueue(true);q.push({type:'delete_vlaka',payload:{id:'foreign'},_uid:'other',_qid:'foreign'});
   localStorage.setItem(_OL.QUEUE,JSON.stringify(q));_OL.loadQueue(true);
   openSyncQueuePanel();
  });
  assert.equal(await page.locator('#syncq-list > div').count(),60);
  assert.match(await page.locator('#data-server-tabs').innerText(),/Za slanje \(81\)/);
  await page.evaluate(()=>_tabServer('problems'));assert.equal(await page.locator('#syncq-list > div').count(),1);assert.match(await page.locator('#syncq-list').innerText(),/Odbijeno/);
  await page.evaluate(()=>_tabServer('received'));assert.equal(await page.locator('#syncq-list').isVisible(),false);assert.equal(await page.locator('#data-server-received').isVisible(),true);
  assert.deepEqual(errors,[]);assert.equal(external.length,startupRequests,'pregled lokalnih podataka pokrenuo mrežu: '+external.slice(startupRequests).join(','));
  await page.screenshot({path:path.join(root,'outputs/tab-data.png')});
  console.log(JSON.stringify({checks:21,cpuThrottle:4,vlake:240,colleagueVlake:180,...metrics,offline:true,pageErrors:errors.length,externalReviewRequests:external.length-startupRequests}));
 }finally{if(browser)await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
