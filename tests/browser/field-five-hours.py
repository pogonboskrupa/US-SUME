"""Puni proizvodni JS, Leaflet i IDB; ubrzano GPS vrijeme, CPU4x. Nije telefon."""
import asyncio,json,mimetypes,os
from pathlib import Path
from playwright.async_api import async_playwright
ROOT=Path(__file__).resolve().parents[2]
async def main():
 async with async_playwright() as p:
  browser=await p.chromium.launch(executable_path=os.environ.get('UI_CHROMIUM') or None)
  ctx=await browser.new_context(service_workers='block',viewport={'width':393,'height':851})
  requests=[];errors=[]
  async def route(r):
   url=r.request.url
   if not url.startswith('http://field.test/'):
    requests.append({'url':url,'method':r.request.method});await r.abort();return
   name=url.split('field.test/',1)[1].split('?',1)[0] or 'index.html';f=ROOT/name
   if name=='GRANICE.kml':await r.fulfill(content_type='application/xml',body='<kml xmlns="http://www.opengis.net/kml/2.2"><Document/></kml>')
   elif f.is_file():await r.fulfill(content_type=mimetypes.guess_type(str(f))[0] or 'application/octet-stream',body=f.read_bytes())
   else:await r.fulfill(status=404,body='fixture')
  await ctx.route('**/*',route)
  await ctx.route_web_socket('**/*',lambda ws:ws.close())
  await ctx.add_init_script("window.fieldOnline=false;Object.defineProperty(navigator,'onLine',{get:()=>fieldOnline});navigator.geolocation.watchPosition=()=>1;navigator.geolocation.clearWatch=()=>{};")
  page=await ctx.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
  await page.goto('http://field.test/');await page.wait_for_function('document.readyState==="complete"&&!!window.FieldStore')
  cdp=await ctx.new_cdp_session(page);await cdp.send('Emulation.setCPUThrottlingRate',{'rate':4})
  report=await page.evaluate("""async()=>{
   sbUser={id:'11111111-1111-4111-8111-111111111111'};sbProfile={id:sbUser.id,odobren:true,sumarija:'TEST'};
   _revealApp();switchTab('karta');_forestMode=true;_aktivniProjektId='field-project';
   const base=Date.UTC(2026,9,5,6),fix=[],actions=[];
   const frame=()=>new Promise(r=>requestAnimationFrame(r));
   for(let s=0;s<4;s++){
    const v={nm:'T'+(s+1),br:s+1,kr:0,color:'#16a34a',projektId:'field-project',pts:[],wpts:[],poly:L.polyline([],{renderer:_vlakeRenderer,color:'#16a34a'}).addTo(map)};
    vlake.push(v);actI=vlake.length-1;recOn=true;recPaused=false;_lastFixRaw=null;_lastRecTime=0;_lastPtAcceptedAt=0;_vlRetrace=null;
    for(let i=0;i<900;i++){
     fieldOnline=i%300<100;const t=performance.now();
     _vlakaProcessGpsPoint(44.9+i*4/6371000*180/Math.PI,16+s*.002,i%100===0?40:6,400+i*.01,2,base+s*3600000+i*2000);
     fix.push(performance.now()-t);if(i%16===0)await frame();
    }
    await _flushAllPendingVlake();if(!_saveLocalVlake())throw Error('Nije spremljena vlaka');
    if(v.pts.length!==891)throw Error('Izgubljene tačke vlake: '+v.pts.length);
    recOn=false;const t=performance.now();switchTab('teren');await frame();switchTab('karta');actions.push(performance.now()-t);
   }
   gpsOn=false;_dozSelId=null;_dozGpsOn=true;_dozGpsPaused=false;_dozGpsProjId='field-doznaka';_dozGpsUserId=sbUser.id;
   _dozGpsSessionId='field-session';_dozGpsStartTs=Date.now();_dozGpsPts=[];_dozGpsFullPts=[];_dozGpsElevData=[];_dozGpsLen=0;
   _dozGpsTrackLayer=L.layerGroup().addTo(map);let expected=0;const doz=[];
   for(let i=0;i<1800;i++){
    fieldOnline=i%300<100;_dozGpsPaused=i>=600&&i<660;const t=performance.now();
    await _dozProcessGpsPoint(44.9+i*.00004,16.01,400+i*.01,i%100===0?40:6,1,base+4*3600000+i*2000);
    doz.push(performance.now()-t);if(!_dozGpsPaused&&i%100!==0)expected++;if(i%16===0)await frame();
   }
   if(_dozGpsPts.length!==expected)throw Error('Izgubljene tačke doznake');
   const live=await FieldStore.live(sbUser.id);if(live.pts.length!==expected)throw Error('IDB oporavak nije potpun');
   const fullBefore=JSON.stringify(_dozGpsFullPts);await dozStopGPS();if(_dozGpsOn||JSON.stringify(_dozGpsFullPts)!==fullBefore)throw Error('Završetak nije siguran');
   const percentile=a=>{a.sort((x,y)=>x-y);return {p95Ms:a[Math.floor(a.length*.95)],maxMs:a.at(-1)};};
   openOznakePanel();return {simulatedHours:5,vlakaAccepted:vlake.reduce((n,v)=>n+v.pts.length,0),doznakaAccepted:expected,idbRestored:live.pts.length,vlakaFix:percentile(fix),doznakaFix:percentile(doz),switchTab:percentile(actions),cpuThrottle:4,physicalPhone:false};
  }""")
  assert report['vlakaAccepted']==3564 and report['doznakaAccepted']==1723,report
  assert not errors,errors
  writes=[r for r in requests if r['method'] in ['POST','PATCH','DELETE','PUT']]
  assert not writes,writes
  out=ROOT/'outputs/performance';out.mkdir(parents=True,exist_ok=True)
  report['method']='Desktop Chromium CPU4x, accelerated 5h GPS timestamps, full app/Leaflet/IDB, network blocked, no Android bridge or battery measurement'
  report['externalWrites']=len(writes)
  (out/'field-five-hours.json').write_text(json.dumps(report,indent=2))
  await page.screenshot(path=str(out/'folder-panel-240.png'))
  # Neutralne površine prate odabrani režim bez žutih foldera.
  for theme in ['day','dark']:
   await page.evaluate('(t)=>{document.documentElement.dataset.fieldTheme=t;}',theme)
   assert await page.locator('.ml-folder-area').evaluate('(e)=>getComputedStyle(e).backgroundColor')=={'day':'rgb(241, 244, 244)','dark':'rgb(24, 36, 44)'}[theme]
   assert await page.locator('#oznake-panel').evaluate('(e)=>e.scrollWidth<=e.clientWidth+1')
  await browser.close();print(json.dumps(report),flush=True)
if __name__=='__main__':asyncio.run(main())
