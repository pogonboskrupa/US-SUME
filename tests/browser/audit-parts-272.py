"""Pregled 3/4: puni app, Leaflet i pravi IDB; fake GPS/server/kamera, CPU4x."""
import asyncio,mimetypes,os
from pathlib import Path
from playwright.async_api import async_playwright
ROOT=Path(__file__).resolve().parents[2]
async def main():
 async with async_playwright() as p:
  browser=await p.chromium.launch(executable_path=os.environ.get('UI_CHROMIUM') or None)
  ctx=await browser.new_context(service_workers='block',viewport={'width':390,'height':800})
  errors=[];writes=[]
  async def route(r):
   url=r.request.url
   if not url.startswith('http://audit.test/'):
    if r.request.method not in ['GET','HEAD']:writes.append(url)
    await r.abort();return
   name=url.split('audit.test/',1)[1].split('?',1)[0] or 'index.html';f=ROOT/name
   if name=='GRANICE.kml':await r.fulfill(content_type='application/xml',body='<kml><Document/></kml>')
   elif f.is_file():await r.fulfill(content_type=mimetypes.guess_type(str(f))[0] or 'application/octet-stream',body=f.read_bytes())
   else:await r.fulfill(status=404,body='fixture')
  await ctx.route('**/*',route);await ctx.route_web_socket('**/*',lambda ws:ws.close())
  await ctx.add_init_script("""Object.defineProperty(navigator,'onLine',{get:()=>false,configurable:true});window.watchCount=0;window.clearCount=0;navigator.geolocation.watchPosition=f=>{window.gpsFix=f;return ++watchCount;};navigator.geolocation.clearWatch=()=>clearCount++;
   const uid='11111111-1111-4111-8111-111111111111';localStorage.setItem('tvlake_ol_profile',JSON.stringify({ts:Date.now(),data:{id:uid,odobren:true,sumarija:'TEST',ime:'Test',prezime:'Pregled'}}));localStorage.setItem('tvlake_device_last_user',uid);""")
  page=await ctx.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
  await page.goto('http://audit.test/');await page.wait_for_function('_startupRestore._done&&!!window.FieldStore')
  await page.evaluate("""async()=>{
   sbUser={id:'11111111-1111-4111-8111-111111111111'};sbProfile={id:sbUser.id,odobren:true,sumarija:'TEST',ime:'Test',prezime:'Pregled'};_revealApp();
   _dozOdjeli=['A','B'].map(id=>({id,name:'Test · '+id,created_by:sbUser.id,status:'active'}));_dozSubProject=()=>{};
   window.serverCalls=[];window.responses=[];window.serverError=null;
   sb={from(table){const c={table,mode:'read'},q=new Proxy({}, {get(_,k){if(k==='then')return (ok,bad)=>{serverCalls.push(c);return Promise.resolve(responses.length?responses.shift():{data:[],error:serverError}).then(ok,bad);};return (...args)=>{if(k==='insert'){c.mode='insert';c.payload=args[0];}return q;};}});return q;},rpc:async()=>({data:null,error:{code:'PGRST202'}})};
   _gpsStabilizeGate=fn=>{window.started=fn();};_bgRecStart=()=>{};_bgRecStopIfIdle=()=>{};_dozLiveRacunMozda=()=>{};
   await dozSelectOdjel('A');await FieldStore.init();
  }""")
  cdp=await ctx.new_cdp_session(page);await cdp.send('Emulation.setCPUThrottlingRate',{'rate':4})
  # Actual Doznaka start, durable points, failed finish/back and paused selection.
  await page.evaluate('dozToggleGPS();started')
  await page.evaluate("async()=>{await gpsFix({timestamp:Date.now(),coords:{latitude:44.9,longitude:16,accuracy:5,altitude:480,speed:1}});await _dozProcessGpsPoint._tail;await gpsFix({timestamp:Date.now()+1000,coords:{latitude:44.9002,longitude:16,accuracy:5,altitude:482,speed:1}});await _dozProcessGpsPoint._tail;}")
  assert await page.evaluate('FieldStore.count(sbUser.id)')==2
  assert await page.evaluate("async()=>{window.realFinish=FieldStore.finish;FieldStore.finish=async()=>{throw Error('quota')};const r=await dozBackToList();return r===false&&_dozSelId==='A'&&_dozGpsOn&&document.getElementById('doz-panel-detail').style.display==='flex';}")
  assert await page.locator('#doz-gps-modal').is_visible()
  await page.evaluate("dozPauseGPS();dozSelectOdjel('B')")
  assert await page.evaluate("_dozSelId==='A'&&_dozGpsPaused")
  assert await page.evaluate("async()=>{FieldStore.finish=realFinish;const r=await dozBackToList();return r===true&&!_dozGpsOn&&_dozSelId===null&&!(await FieldStore.live(sbUser.id));}")
  assert await page.evaluate('FieldStore.count(sbUser.id)')==2
  await page.evaluate("dozSelectOdjel('A')")
  assert '2 GPS tačaka čeka slanje' in await page.locator('#doz-local-status').inner_text()
  # In-flight fetch A cannot overwrite selection B or its durable cache.
  assert await page.evaluate("""async()=>{
   let release;const original=sb.from;sb.from=()=>{const q=new Proxy({}, {get(_,k){if(k==='then')return (ok,bad)=>new Promise(r=>release=r).then(ok,bad);return ()=>q;}});return q;};
   _dozUcitajTacke=async()=>({data:[]});_dozReadList=async()=>new Promise(r=>window.loadResolvers.push(r));window.loadResolvers=[];
   const pending=dozLoadLayers('A');_dozSelId='B';_dozMembers=[{user_id:'B'}];loadResolvers.forEach(r=>r({data:[]}));await pending;sb.from=original;
   return _dozMembers[0].user_id==='B'&&(await dozLoadLayers('A'))===false;
  }""")
  await page.evaluate("_dozSelId='A';_dozMembers=[];_dozMarkings=[];_dozTracks=[];")
  # Same count/last timestamp, corrected coordinates, or changed gap => new geometry.
  assert await page.evaluate("""()=>{
   _dozTracks=[{user_id:'peer',latitude:44.9,longitude:16,recorded_at:'2026-10-01T10:00:00Z'},{user_id:'peer',latitude:44.901,longitude:16.001,recorded_at:'2026-10-01T10:01:00Z'}];
   const first=_dozBuildUserTracks().find(t=>t.uid==='peer');_dozTracks[0].longitude=16.002;const corrected=_dozBuildUserTracks().find(t=>t.uid==='peer');_dozTracks[0].recorded_at='2026-10-01T09:30:00Z';
   return corrected!==first&&corrected.line.geometry.coordinates[0][0]===16.002&&_dozBuildUserTracks().every(t=>t.uid!=='peer');
  }""")
  # No-error / missing proof and conflicting ID cannot consume pending GPS/zone.
  assert await page.evaluate("""async()=>{
   const points=await FieldStore.read(sbUser.id);responses=[{data:[],error:null},{data:[],error:null}];const failed=await _dozPosaljiKomad(points);if(failed.ok.length||failed.error.code!=='NO_CONFIRMATION')return false;
   responses=[{data:[],error:null},{data:[points[0]],error:null}];const partial=await _dozPosaljiKomad(points);await FieldStore.acknowledge(sbUser.id,partial.ok);
   const payload={id:'11111111-1111-4111-8111-111111111119',project_id:'A',created_by:sbUser.id,label:'Zona'};
   responses=[{error:{code:'23505'}},{data:{...payload,project_id:'B'},error:null}];const wrong=await _dozUpisiZonu(payload);
   responses=[{error:{code:'23505'}},{data:{...payload},error:null}];const right=await _dozUpisiZonu(payload);
   return FieldStore.count(sbUser.id)===1&&partial.error.code==='NO_CONFIRMATION'&&wrong.error.code==='NO_CONFIRMATION'&&!right.error&&serverCalls.filter(c=>c.mode==='insert'&&c.table==='doz_area_markings').length===2;
  }""")
  # Pending camera permission resolved after close/reopen/owner change: stop every stale stream.
  assert await page.evaluate("""async()=>{
   _loadQrLibs=async()=>{};jsQR=()=>null;window.cameraResolvers=[];Object.defineProperty(navigator,'mediaDevices',{value:{getUserMedia:()=>new Promise(r=>cameraResolvers.push(r))},configurable:true});
   const stream=()=>{const canvas=document.createElement('canvas');canvas.width=canvas.height=16;return canvas.captureStream();};
   const a=dozScanQR();await new Promise(r=>setTimeout(r,20));closeDozQrScan();const late=stream();cameraResolvers.shift()(late);await a;
   if(late.getTracks().some(t=>t.readyState!=='ended')||_dozQrScanning)return false;
   const b=dozScanQR();await new Promise(r=>setTimeout(r,20));const c=dozScanQR();await new Promise(r=>setTimeout(r,20));const old=stream();cameraResolvers.shift()(old);await b;
   const wrongOwner=stream();const owner=sbUser;sbUser={id:'other'};cameraResolvers.shift()(wrongOwner);await c;sbUser=owner;closeDozQrScan();
   return [...old.getTracks(),...wrongOwner.getTracks()].every(t=>t.readyState==='ended')&&!_dozQrScanning&&document.getElementById('doz-qr-video').srcObject===null;
  }""")
  # Missing atomic RPC / incomplete proof: no child DELETE and no false success.
  assert await page.evaluate("""async()=>{
   _mrezaProbaj=()=>true;_dlgConfirm=async()=>true;_dozSelId='B';_dozMembers=[];serverCalls=[];await dozDeleteOdjel();
   const kept=_dozSelId==='B'&&!serverCalls.length;sb.rpc=async()=>({data:{deleted:true,project_id:'A'},error:null});await dozDeleteOdjel();return kept&&_dozSelId==='B'&&!serverCalls.length;
  }""")
  # Late access check of the previous account cannot replace current profile/cache.
  assert await page.evaluate("""async()=>{
   const saved=sb,profile=sbProfile,owner=sbUser;_lastOdobrenCheck=0;
   sb={from(){return {select(){return this},eq(){return this},single(){return new Promise(r=>window.accessReply=r)}}}};
   const pending=_provjeriOpozivOdobrenja();sbUser={id:'other'};sbProfile={id:'other',ime:'Other'};
   accessReply({data:{id:owner.id,odobren:false},error:null});await pending;
   const safe=sbProfile.id==='other';sbUser=owner;sbProfile=profile;sb=saved;return safe;
  }""")
  # Actual receive action must skip an old department after list refresh changes selection.
  assert await page.evaluate("""async()=>{
   Object.defineProperty(navigator,'onLine',{get:()=>true,configurable:true});_dozSelId='A';dozLoadOdjeli=async()=>{_dozSelId='B';return true};
   const r=await _serverPreuzmiDoznaku('A');return r.selectionChanged===true&&_dozMembers.length===0;
  }""")
  # Restart: only confirmed point removed; unacknowledged point remains durable.
  await page.reload();await page.wait_for_function('_startupRestore._done');await page.evaluate('FieldStore.init()')
  assert await page.evaluate("FieldStore.count('11111111-1111-4111-8111-111111111111')")==1
  assert not errors,errors
  assert not writes,writes
  await browser.close()
 print('Audit 3/4: durable finish/back, selection, GPS/zone proof, geometry correction, camera races, atomic delete guard and restart — OK (full app CPU4x, no production writes)')
if __name__=='__main__':asyncio.run(main())
