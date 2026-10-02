// Stvarna aplikacija, sintetički korisnik, svi vanjski HTTP/WS zahtjevi presretnuti.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'../..');
(async()=>{
 const server=http.createServer((req,res)=>{
  if(req.url==='/blank'){res.end('<html></html>');return;}
  const file=path.resolve(root,'.'+decodeURIComponent(req.url.split('?')[0]==='/'?'/index.html':req.url.split('?')[0]));
  if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
  res.setHeader('Content-Type',({'.html':'text/html','.js':'application/javascript','.wasm':'application/wasm','.css':'text/css','.png':'image/png','.json':'application/json'})[path.extname(file)]||'application/octet-stream');
  const s=fs.createReadStream(file);s.on('error',()=>res.writeHead(404).end());s.pipe(res);
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const base=`http://127.0.0.1:${server.address().port}`; let browser;
 try{
  browser=await chromium.launch({headless:true,executablePath:process.env.US_SUME_BROWSER,args:['--no-sandbox']});
  const ctx=await browser.newContext({serviceWorkers:'block',viewport:{width:412,height:850}});
  const writes=[];
  await ctx.route('**/*',async route=>{
   const req=route.request(),url=req.url();
   if(url.startsWith(base)||url.startsWith('blob:')||url.startsWith('data:'))return route.continue();
   if(url.includes('.supabase.co/rest/v1/')){
    let data=[];
    if(['POST','PATCH','DELETE'].includes(req.method())){
     const body=req.postDataJSON(); writes.push({table:new URL(url).pathname.split('/').pop(),method:req.method()});
     data=req.headers().accept?.includes('vnd.pgrst.object')?body:[body];
    }
    return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});
   }
   return route.abort();
  });
  await ctx.routeWebSocket('**/*',ws=>ws.close());
  await ctx.addInitScript(()=>{
   window.__testOnline=false;
   Object.defineProperty(navigator,'onLine',{get:()=>window.__testOnline});
  });
  const page=await ctx.newPage(),errors=[]; page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+'/blank');
  await page.evaluate(()=>{
   const id='11111111-1111-4111-8111-111111111111';
   localStorage.setItem('tvlake_ol_profile',JSON.stringify({ts:Date.now(),data:{id,ime:'Test',prezime:'Offline',odobren:true,is_admin:false,sumarija:'TEST'}}));
   localStorage.setItem('tvlake_device_last_user',id);
  });
  await page.goto(base+'/index.html',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>typeof _startupRestore==='function'&&_startupRestore._done,{},{timeout:15000});
  await page.evaluate(()=>{
   window.__testOnline=true;
   switchTab('projekat');showNovProjektForm();
   document.getElementById('np-odjel').value='105-test';
   document.getElementById('np-gj-plain').value='TEST';
  });
  await page.evaluate(()=>saveNovProjekt());
  assert.equal(writes.length,0,'novi projekat šalje bez pritiska Pošalji');
  const id=await page.evaluate(()=>_aktivniProjektId);
  await page.evaluate(()=>_reloadCoreData());
  assert.equal(await page.evaluate(()=>_aktivniProjektId),id);
  assert.equal(await page.evaluate(id=>_projekti.some(p=>p.id===id&&p._pendingSync),id),true);
  assert.equal(writes.length,0,'osvježavanje je pokrenulo slanje');
  await page.evaluate(()=>serverPosalji());
  assert.ok(writes.some(w=>w.table==='projekti'&&w.method==='POST'),'ručno slanje nije poslalo projekat');
  assert.equal(await page.evaluate(()=>_serverSaljem),false);
  assert.equal(await page.evaluate(()=>_OL.loadQueue().filter(o=>o.type==='insert_projekt').length),0);
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({checks:7,manualProjectUpload:true,keepsPendingProject:true,pageErrors:errors.length}));
 }finally{if(browser)await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
