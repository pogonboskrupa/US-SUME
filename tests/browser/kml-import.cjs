const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require('playwright'),root=path.resolve(__dirname,'../..');
(async()=>{
 const server=http.createServer((req,res)=>{
  if(req.url==='/blank'){res.end('<html></html>');return;}
  const file=path.resolve(root,'.'+(req.url.split('?')[0]==='/'?'/index.html':req.url.split('?')[0]));
  if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
  res.setHeader('Content-Type',({'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json'})[path.extname(file)]||'application/octet-stream');
  const s=fs.createReadStream(file);s.on('error',()=>res.writeHead(404).end());s.pipe(res);
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`;let browser;
 try{
  browser=await chromium.launch({headless:true,executablePath:process.env.US_SUME_BROWSER,args:['--no-sandbox']});
  const ctx=await browser.newContext({serviceWorkers:'block',viewport:{width:360,height:800}}),errors=[],requests=[];
  await ctx.route('**/*',r=>r.request().url().startsWith(base)?r.continue():(requests.push(r.request().url()),r.abort()));
  await ctx.routeWebSocket('**/*',ws=>ws.close());await ctx.addInitScript(()=>Object.defineProperty(navigator,'onLine',{get:()=>false}));
  const page=await ctx.newPage();page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+'/blank');await page.evaluate(()=>{
   const id='11111111-1111-4111-8111-111111111111';localStorage.setItem('tvlake_ol_profile',JSON.stringify({ts:Date.now(),data:{id,ime:'Test',prezime:'Offline',odobren:true,sumarija:'TEST'}}));localStorage.setItem('tvlake_device_last_user',id);
  });
  await page.goto(base+'/index.html',{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>_startupRestore._done);
  await page.evaluate(()=>{_projekti=[{id:'a',odjel:'100',gj:'Test',korisnik_id:sbUser.id},{id:'b',odjel:'200',gj:'Test',korisnik_id:sbUser.id}];_aktivniProjektId='b';rndProjektiList();});
  const line=(name)=>`<Placemark><name>${name}</name><LineString><coordinates>16.1,44.8,100 16.101,44.801,102</coordinates></LineString></Placemark>`;
  const file=body=>({name:'vlake.kml',mimeType:'application/vnd.google-earth.kml+xml',buffer:Buffer.from(`<kml xmlns="http://www.opengis.net/kml/2.2"><Document>${body}</Document></kml>`)});
  const upload=async body=>{await page.locator('#imv-file').setInputFiles(file(body));await page.waitForFunction(()=>_impTracks.length>0);};
  await page.evaluate(()=>impVlakaOpen('a'));await upload(line('T1')+line('T1.1'));
  assert.equal(await page.locator('#imv-proj').inputValue(),'a');assert.equal(await page.locator('#imv-proj').isDisabled(),true);
  assert.deepEqual(await page.evaluate(()=>[document.getElementById('imv-nm-0').value,document.getElementById('imv-nm-1').value]),['T1','T1.1']);
  assert.equal(await page.evaluate(()=>vlake.length),0,'preview mutated tracks');
  await page.evaluate(()=>impVlakaClose());assert.equal(await page.evaluate(()=>_OL.loadQueue().length),0);
  await page.evaluate(()=>impVlakaOpen('a'));await upload(line('T1')+line('T1.1'));
  await page.evaluate(()=>document.getElementById('imv-chk-0').checked=false);await page.evaluate(()=>impVlakaConfirm());assert.equal(await page.evaluate(()=>vlake.length),0,'orphan branch imported');
  await page.evaluate(()=>{document.getElementById('imv-chk-0').checked=true;document.getElementById('imv-str-1').value='L';document.getElementById('imv-proj').innerHTML='<option value="b">Other</option>';});
  const before=requests.length;await page.evaluate(()=>impVlakaConfirm());
  await page.waitForFunction(()=>_OL.loadQueue().filter(o=>o.type==='upsert_vlaka').length===2);
  const rows=await page.evaluate(()=>vlake.map(v=>({nm:v.nm,pid:v.projektId,br:v.br,kr:v.kr,strana:v.strana,poly:!!v.poly,wpts:v.wpts,al:v.pts[0].al})));
  assert.deepEqual(rows,[{nm:'T1',pid:'a',br:1,kr:0,strana:null,poly:true,wpts:[],al:100},{nm:'T1.1',pid:'a',br:1,kr:1,strana:'L',poly:true,wpts:[],al:100}]);
  assert.equal(await page.evaluate(()=>_aktivniProjektId),'a');assert.equal(requests.length,before,'import requested server');
  await page.evaluate(()=>{selI(1);vlake[1].poly.fire('click',{latlng:L.latLng(44.8,16.1)});});
  assert.equal(await page.locator('#vlaka-popup').evaluate(e=>getComputedStyle(e).display!=='none'),true);
  await page.evaluate(()=>vpEdit());assert.equal(await page.evaluate(()=>actI),1);
  const geometry=await page.evaluate(()=>JSON.stringify(vlake[1].pts));
  assert.equal(await page.evaluate(()=>renameVlaka(1,'1.2')),true);
  await page.waitForFunction(()=>_OL.loadQueue().filter(o=>o.type==='upsert_vlaka').map(o=>o.payload.nm).includes('T1.2'));
  assert.deepEqual(await page.evaluate(()=>_OL.loadQueue().filter(o=>o.type==='upsert_vlaka').map(o=>o.payload.nm).sort()),['T1','T1.2']);
  assert.equal(await page.evaluate(()=>JSON.stringify(vlake[1].pts)),geometry);
  assert.equal(await page.evaluate(()=>vlake[1].strana),'L');
  await page.evaluate(()=>{impVlakaOpen('a');_impTracks=[{name:'T8',pts:[{la:44.8,lo:16.1},{la:44.9,lo:16.2}]}];_impRenderTracks();window.__save=_saveLocalVlake;_saveLocalVlake=()=>false;});
  await page.evaluate(()=>impVlakaConfirm());assert.equal(await page.evaluate(()=>vlake.length),2,'quota failure imported');
  await page.evaluate(()=>{_saveLocalVlake=window.__save;const old=sbUser;sbUser={id:'other'};impVlakaConfirm();sbUser=old;impVlakaClose();});assert.equal(await page.evaluate(()=>vlake.length),2,'owner switched during import');
  await page.evaluate(()=>impVlakaOpen('a'));await upload(line('T9')+line('T9')+line('&lt;img src=x onerror=alert(1)&gt;'));
  assert.equal(await page.locator('#imv-tracks img').count(),0);
  assert.equal(await page.evaluate(()=>new Set(_impTracks.map((t,i)=>document.getElementById('imv-nm-'+i).value)).size),3);
  const parsed=await page.evaluate(()=>_impParseTracks('<kml xmlns:g="http://www.google.com/kml/ext/2.2"><Placemark><g:Track><g:coord>16 44 5</g:coord><g:coord>17 45 6</g:coord></g:Track></Placemark></kml>','x.kml'));
  assert.equal(parsed.length,1);assert.equal(parsed[0].pts[1].al,6);
  const extras=await page.evaluate(()=>{
   const prefixed=_impParseTracks('<k:kml xmlns:k="http://www.opengis.net/kml/2.2"><k:Placemark><k:MultiGeometry><k:LineString><k:coordinates>16,44 17,45</k:coordinates></k:LineString><k:LineString><k:coordinates>17,45 18,46</k:coordinates></k:LineString></k:MultiGeometry></k:Placemark></k:kml>','x.kml');
   let invalid=false;try{_impParseTracks('<kml><Placemark><LineString><coordinates>16,44 17,999 18,45</coordinates></LineString></Placemark></kml>','x.kml');}catch(e){invalid=true;}
   return {lines:prefixed.length,invalid};
  });assert.deepEqual(extras,{lines:2,invalid:true});
  await page.evaluate(async()=>{
   window.__Reader=FileReader;window.__late=[];window.FileReader=class{readAsText(){window.__late.push(this);}};
   window.__pending=impVlakaFile({target:{files:[{name:'late.kml',size:100}]}});impVlakaClose();impVlakaOpen('b');
   const reader=window.__late[0];reader.result='<kml><Placemark><LineString><coordinates>16,44 17,45</coordinates></LineString></Placemark></kml>';reader.onload();await window.__pending;window.FileReader=window.__Reader;
  });assert.equal(await page.evaluate(()=>_impTracks.length),0,'stale file overwrote reopened project');
  await page.evaluate(()=>impVlakaClose());await page.reload({waitUntil:'domcontentloaded'});await page.waitForFunction(()=>_startupRestore._done);
  assert.deepEqual(await page.evaluate(()=>vlake.map(v=>v.nm).sort()),['T1','T1.2']);
  assert.deepEqual(errors,[]);console.log('KML import: project isolation, branch validation, editable geometry, offline rename queue, quota/owner guards, escaped preview and reload passed');
 }finally{if(browser)await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
