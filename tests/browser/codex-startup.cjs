// Synthetic SQLite/IndexedDB fixture. All external HTTP and WebSocket traffic is blocked.
const assert=require('node:assert/strict'), fs=require('node:fs'), path=require('node:path'), http=require('node:http');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'../..');
(async()=>{
 const SQL=await require(path.join(root,'static/libs/sql-wasm.js'))({locateFile:f=>path.join(root,'static/libs',f)});
 const db=new SQL.Database();
 db.run('CREATE TABLE metadata(name TEXT,value TEXT); CREATE TABLE tiles(zoom_level INTEGER,tile_column INTEGER,tile_row INTEGER,tile_data BLOB); CREATE UNIQUE INDEX tile_index ON tiles(zoom_level,tile_column,tile_row);');
 for(const [k,v] of Object.entries({name:'test',format:'png',minzoom:'0',maxzoom:'0',bounds:'-180,-85,180,85'})) db.run('INSERT INTO metadata VALUES(?,?)',[k,v]);
 db.run('INSERT INTO tiles VALUES(0,0,0,?)',[new Uint8Array(fs.readFileSync(path.join(root,'icon-192.png')))]);
 const bytes=Array.from(db.export()); db.close();
 const server=http.createServer((req,res)=>{
  if(req.url==='/blank'){res.end('<html></html>');return;}
  const file=path.resolve(root,'.'+decodeURIComponent(req.url.split('?')[0]==='/'?'/index.html':req.url.split('?')[0]));
  if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
  const types={'.html':'text/html','.js':'application/javascript','.wasm':'application/wasm','.css':'text/css','.png':'image/png','.json':'application/json'};
  res.setHeader('Content-Type',types[path.extname(file)]||'application/octet-stream');
  const stream=fs.createReadStream(file);stream.on('error',()=>res.writeHead(404).end());stream.pipe(res);
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const base=`http://127.0.0.1:${server.address().port}`;
 let browser;
 try{
  browser=await chromium.launch({headless:true,args:['--no-sandbox']});
  const context=await browser.newContext({serviceWorkers:'block',viewport:{width:412,height:850}});
  const external=[];
  await context.route('**/*',route=>{const u=route.request().url(); if(u.startsWith(base)||u.startsWith('blob:')||u.startsWith('data:')) return route.continue();external.push(u);return route.abort();});
  await context.routeWebSocket('**/*',ws=>ws.close());
  await context.addInitScript(()=>Object.defineProperty(navigator,'onLine',{get:()=>false}));
  const page=await context.newPage(), errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+'/blank');
  await page.evaluate(async bytes=>{
   const uid='11111111-1111-4111-8111-111111111111';
   localStorage.setItem('tvlake_ol_profile',JSON.stringify({ts:Date.now(),data:{id:uid,ime:'Test',prezime:'Offline',odobren:true,is_admin:false,sumarija:'TEST'}}));
   localStorage.setItem('tvlake_device_last_user',uid);
   localStorage.setItem('tvlake_last_map',JSON.stringify({type:'sqlite',sqlId:'active.mbtiles'}));
   localStorage.setItem('tvlake_sentinel2_kljucevi_kes',JSON.stringify({clientSecret:'synthetic-test-only'}));
   const db=await new Promise((ok,no)=>{const q=indexedDB.open('tvlake_sqlmaps',2);q.onupgradeneeded=()=>{q.result.createObjectStore('maps',{keyPath:'name'});q.result.createObjectStore('mapBufs',{keyPath:'name'});};q.onsuccess=()=>ok(q.result);q.onerror=()=>no(q.error);});
   await new Promise((ok,no)=>{const tx=db.transaction(['maps','mapBufs'],'readwrite');for(const [i,name] of ['active.mbtiles','other.mbtiles'].entries()){tx.objectStore('maps').put({name,fmt:'mbtiles',meta:{minzoom:0,maxzoom:0},savedAt:i+1});tx.objectStore('mapBufs').put({name,buffer:Uint8Array.from(bytes).buffer});}tx.oncomplete=ok;tx.onerror=()=>no(tx.error);});db.close();
  },bytes);
  const start=Date.now();
  await page.goto(base+'/index.html',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>typeof _sqlLayers!=='undefined'&&_sqlLayers.some(sl=>sl.name==='active.mbtiles'&&Object.values(sl.layer._tiles||{}).some(t=>t.loaded)),{},{timeout:8000});
  const elapsed=Date.now()-start;
  const state=await page.evaluate(()=>({names:_sqlLayers.map(s=>s.name),deferred:_sqlRestoreFailed.filter(s=>s.deferred).map(s=>s.name),secret:localStorage.getItem('tvlake_sentinel2_kljucevi_kes'),sentinel:!!document.getElementById('s2-section'),auth:document.getElementById('auth-screen').style.display}));
  assert.deepEqual(state.names,['active.mbtiles']);assert.deepEqual(state.deferred,['other.mbtiles']);
  assert.equal(state.secret,null);assert.equal(state.sentinel,false);assert.equal(state.auth,'none');
  assert.equal(external.filter(u=>/cdnjs|jsdelivr|dataspace/.test(u)).length,0,'no CDN or removed Sentinel dependency on startup');
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({startupMs:elapsed,checks:7,...state}));
  // Open a deferred map through the real user action, then verify data still available.
  await page.evaluate(()=>sqlmapRetryOne('other.mbtiles'));
  assert.equal(await page.evaluate(()=>_sqlLayers.some(sl=>sl.name==='other.mbtiles'&&sl.visible)),true);
  console.log('8 browser provjera prošlo');
 }finally{if(browser)await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
