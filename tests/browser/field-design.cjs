const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require('playwright'),root=path.resolve(__dirname,'../..');
(async()=>{
 const server=http.createServer((req,res)=>{
  if(req.url==='/blank'){res.end('<html></html>');return;}
  const pathname=decodeURIComponent(req.url.split('?')[0]),file=path.resolve(root,'.'+(pathname==='/'?'/index.html':pathname));
  if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
  res.setHeader('Content-Type',({'.html':'text/html','.js':'application/javascript','.css':'text/css','.wasm':'application/wasm','.json':'application/json'})[path.extname(file)]||'application/octet-stream');
  const s=fs.createReadStream(file);s.on('error',()=>res.writeHead(404).end());s.pipe(res);
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`;let browser;
 try{
  browser=await chromium.launch({headless:true,executablePath:process.env.US_SUME_BROWSER,args:['--no-sandbox']});
  const ctx=await browser.newContext({serviceWorkers:'block',viewport:{width:360,height:800}}),external=[],errors=[];
  await ctx.route('**/*',r=>{if(r.request().url().startsWith(base))return r.continue();external.push(r.request().url());return r.abort();});
  await ctx.routeWebSocket('**/*',ws=>ws.close());await ctx.addInitScript(()=>Object.defineProperty(navigator,'onLine',{get:()=>false}));
  const page=await ctx.newPage();page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+'/blank');await page.evaluate(()=>{
   const id='11111111-1111-4111-8111-111111111111';localStorage.setItem('tvlake_ol_profile',JSON.stringify({ts:Date.now(),data:{id,ime:'Test',prezime:'Offline',odobren:true,sumarija:'TEST'}}));localStorage.setItem('tvlake_device_last_user',id);
  });
  await page.goto(base+'/index.html',{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>_startupRestore._done);await page.waitForTimeout(400);
  await page.evaluate(()=>{
   _projekti=[{id:'p1',gj:'GJ Test',odjel:'105',korisnik_id:sbUser.id}];_aktivniProjektId='p1';rndProjektiList();
   _applyVlakeRows(Array.from({length:4},(_,i)=>({id:'v'+i,nm:'T'+(i+1),br:i+1,kr:0,projekt_id:'p1',korisnik_id:sbUser.id,boja:'#4ade80',pts:[{la:44.8,lo:16.1},{la:44.801,lo:16.101}]})));switchTab('vlake');selI(0);
  });
  const before=external.length,queue=await page.evaluate(()=>JSON.stringify(_OL.loadQueue()));
  const contrast=await page.evaluate(()=>({nav:parseFloat(getComputedStyle(document.querySelector('.tab-btn')).fontSize),touch:document.querySelector('.tab-btn').getBoundingClientRect().height}));
  assert.ok(contrast.nav>=11.5&&contrast.touch>=48);
  await page.screenshot({path:path.join(root,'outputs/design-dark-vlake.png')});
  await page.evaluate(()=>toggleFieldTheme());assert.equal(await page.locator('html').getAttribute('data-field-theme'),'day');
  await page.waitForTimeout(220); // završi prijelaz kartica, bez mijenjanja teme podloge
  assert.equal(await page.locator('#field-theme-toggle').getAttribute('aria-pressed'),'true');
  const ink=await page.locator('.vcard-name').first().evaluate(e=>getComputedStyle(e).color);assert.equal(ink,'rgb(16, 32, 51)');
  const tabs=await page.locator('.tab-btn').evaluateAll(els=>els.filter(e=>e.offsetWidth).map(e=>({left:e.getBoundingClientRect().left,right:e.getBoundingClientRect().right})));assert.ok(tabs.every(r=>r.left>=0&&r.right<=360));
  await page.screenshot({path:path.join(root,'outputs/design-day-vlake.png')});
  await page.evaluate(()=>switchTab('projekat'));await page.screenshot({path:path.join(root,'outputs/design-day-project.png')});
  await page.evaluate(()=>{_dozOdjeli=[{id:'d1',name:'GJ Test · 105',status:'active',created_by:sbUser.id,known_area_ha:42}];switchTab('doznaka');dozRenderOdjeli();});await page.screenshot({path:path.join(root,'outputs/design-day-doznaka.png')});
  for(const width of [320,412,768]) {
   await page.setViewportSize({width,height:850});
   for(const tab of ['vlake','projekat','doznaka']) {await page.evaluate(t=>switchTab(t),tab);await page.waitForTimeout(100);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));}
  }
  await page.setViewportSize({width:360,height:800});await page.evaluate(()=>openSyncQueuePanel());
  assert.equal(await page.locator('#syncq-panel').evaluate(e=>getComputedStyle(e).backgroundColor),'rgb(255, 255, 255)');
  const send=await page.locator('#syncq-posalji').evaluate(e=>({color:getComputedStyle(e).color,height:e.getBoundingClientRect().height}));assert.equal(send.color,'rgb(255, 255, 255)');assert.ok(send.height>=48);
  await page.screenshot({path:path.join(root,'outputs/design-day-server.png')});
  await page.evaluate(()=>{closeSyncQueuePanel();window.__dialog=_dlgConfirm('Provjera dnevnog dijaloga');});
  assert.ok(await page.locator('#dlg-ok').evaluate(e=>e.getBoundingClientRect().height>=48));assert.equal(await page.locator('#dlg-msg').evaluate(e=>getComputedStyle(e).color),'rgb(16, 32, 51)');await page.locator('#dlg-cancel').click();
  await page.evaluate(()=>{closeSyncQueuePanel();switchTab('vlake');recOn=true;recPaused=true;actI=0;_fieldStatusUpdate();_updFabVisibility();});
  const overlap=await page.evaluate(()=>({nav:document.getElementById('tab-bar').getBoundingClientRect().bottom,status:document.getElementById('field-status').getBoundingClientRect().top}));assert.ok(overlap.status>=overlap.nav-1);
  await page.evaluate(()=>toggleFieldTheme());assert.equal(await page.evaluate(()=>recOn),true,'promjena prikaza zaustavlja snimanje');assert.equal(await page.evaluate(()=>JSON.stringify(_OL.loadQueue())),queue);
  assert.equal(external.length,before,'dizajn pokreće mrežu');await page.evaluate(()=>{recOn=false;toggleFieldTheme();});
  await page.reload({waitUntil:'domcontentloaded'});assert.equal(await page.locator('html').getAttribute('data-field-theme'),'day');
  assert.deepEqual(errors,[]);console.log(JSON.stringify({widths:[320,360,412,768],dayTheme:true,persisted:true,recordingUnaffected:true,...contrast,pageErrors:errors.length}));
 }finally{if(browser)await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
