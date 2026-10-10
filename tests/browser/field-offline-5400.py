"""3 km + 2,4 km: Leaflet, stvarni stil/spisak/bafer/upis i mrežni transport.

CPU 4x je sintetičko usporenje, nije emulacija konkretnog Redmi telefona.
GPS/queue integritet pokriva tests/js/teren-5400.test.js.
"""
import asyncio,importlib.util,json,mimetypes,os,statistics,platform
from pathlib import Path
from playwright.async_api import async_playwright
spec=importlib.util.spec_from_file_location('project_ui',Path(__file__).with_name('project-vlake-220.py'))
u=importlib.util.module_from_spec(spec);spec.loader.exec_module(u);b=u.b
extra=b.function('_saveLocalVlake')+'\n'+(b.ROOT/'static/js/reliable-fetch.js').read_text()+'''
const LOCAL_VLAKE_KEY='field-local-vlake';map.createPane('vlakeLines');const fieldRenderer=L.canvas({pane:'vlakeLines',padding:.3});
const fieldFrame=()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
let fieldPan=false;
function fieldPoints(m,offset,step){return Array.from({length:m/step+1},(_,j)=>({la:44.9+j*step/6371000*180/Math.PI,lo:16+offset,al:450+j*.1}));}
async function fieldRun(step){
 for(const v of vlake)if(v.poly)map.removeLayer(v.poly);vlake.length=0;
 for(const v of Object.values(kolegeVlakeMap))map.removeLayer(v.poly);kolegeVlakeMap={};
 clearBuffers();_OL.load=()=>[];_OL.loadQueue=()=>[];
 const own=Array.from({length:6},(_,i)=>({nm:'T'+(i+1),kr:0,br:i+1,color:'#16a34a',projektId:'P',sbId:'v'+i,pts:fieldPoints(500,i*.002,step)}));
 const colleague=Array.from({length:4},(_,i)=>({id:'c'+i,korisnik_id:'B',projekt_id:'P',nm:'T'+(i+7),kr:0,br:i+7,boja:'#2563eb',projektant_ime:'Amir Kolega',pts:fieldPoints(600,.014+i*.002,step)}));
 const result={own_metres:3000,colleague_metres:2400,points:own.concat(colleague).reduce((s,v)=>s+v.pts.length,0),step_metres:step};
 let start=performance.now();
 for(const v of own){v.poly=L.polyline(v.pts.map(p=>[p.la,p.lo]),{color:v.color,pane:'vlakeLines',renderer:fieldRenderer,weight:4}).addTo(map);vlake.push(v);}
 await sbLoadKolegeVlake(colleague);_vlakaStilApply();await fieldFrame();result.load_ms=performance.now()-start;
 start=performance.now();_projektVlakeRender();await fieldFrame();result.list_ms=performance.now()-start;
 start=performance.now();_bojaVlChange('#123456');await fieldFrame();result.color_ms=performance.now()-start;
 start=performance.now();fieldPan=!fieldPan;map.setView(fieldPan?[44.902,16.01]:[44.903,16.012],14,{animate:false});await fieldFrame();result.pan_ms=performance.now()-start;
 start=performance.now();result.save_ok=_saveLocalVlake();result.save_ms=performance.now()-start;
 const saved=JSON.parse(localStorage.getItem(LOCAL_VLAKE_KEY));if(saved.reduce((s,v)=>s+v.pts.length,0)!==own.reduce((s,v)=>s+v.pts.length,0))throw Error('Izgubljene tačke');
 result.saved_bytes=new TextEncoder().encode(localStorage.getItem(LOCAL_VLAKE_KEY)).length;
 start=performance.now();showKolegeVlakaInfo('B::T7',map.getCenter());vpBuffer();await fieldFrame();result.colleague_buffer_ms=performance.now()-start;
 if(bufLayers.length!==1)throw Error('Bafer kolege');vpBuffer();closeVlakaPopup();
 if(_projektVlakeRows().length!==10)throw Error('Spisak nije potpun');
 if(!Object.values(kolegeVlakeMap).every(v=>v.poly.options.color==='#123456'))throw Error('Boje kolege');
 return result;
}
async function fieldReceive(url){
 const start=performance.now();try{const rows=await (await reliableFetch(url,{},350)).json();await sbLoadKolegeVlake(rows);return {ok:true,ms:performance.now()-start};}
 catch(e){return {ok:false,ms:performance.now()-start,error:e.message};}
}
'''
fixture=u.fixture.replace('</body>','<script>'+extra+'</script></body>')
async def main():
 out=b.ROOT/'outputs/field-simulation';out.mkdir(parents=True,exist_ok=True)
 report={'version':u.APP_VERSION,'method':'Chromium CI, Leaflet canvas/SVG/Turf, 393x851, CPU1x/4x, 3 repetitions; not physical phone, Android background GPS or production Supabase; route fixtures for network','hardware':platform.platform(),'samples':[],'summary':[]}
 async with async_playwright() as p:
  browser=await p.chromium.launch(headless=True,**({'executable_path':os.environ['UI_CHROMIUM']} if os.environ.get('UI_CHROMIUM') else {}));report['browser']=browser.version
  context=await browser.new_context(viewport={'width':393,'height':851});page=await context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  async def route(r):
   url=r.request.url
   if url=='https://ui.test/':await r.fulfill(content_type='text/html',body=fixture)
   elif '/field/' in url:
    if url.endswith('/dead'):await asyncio.sleep(1)
    elif url.endswith('/weak'):await asyncio.sleep(.2)
    try:
     await r.fulfill(content_type='application/json',body=json.dumps([{'id':'new','korisnik_id':'B','projekt_id':'P','nm':'T99','kr':0,'pts':[{'la':44.9,'lo':16},{'la':44.901,'lo':16}]}]))
    except Exception:pass # request legitimately aborted by the tested timeout
   elif url.startswith('https://ui.test/'):
    f=b.ROOT/url.split('ui.test/',1)[1].split('?',1)[0]
    if f.is_file():await r.fulfill(content_type=mimetypes.guess_type(str(f))[0] or 'application/octet-stream',body=f.read_bytes())
    else:await r.fulfill(status=404,body='fixture')
   else:await r.abort()
  await page.route('**/*',route);await page.goto('https://ui.test/');await page.evaluate('fixtureReady');assert not errors,errors
  await page.evaluate("document.querySelector('#fixture-project').style.display='block'")
  cdp=await context.new_cdp_session(page)
  for cpu in [1,4]:
   await cdp.send('Emulation.setCPUThrottlingRate',{'rate':cpu})
   for offline in [False,True]:
    await context.set_offline(offline)
    for step in [4,1]:
     samples=[]
     for repeat in range(3):
      sample=await page.evaluate('fieldRun',step);sample.update(cpu_throttle=cpu,offline=offline,repeat=repeat);assert sample['save_ok'];samples.append(sample);report['samples'].append(sample)
     summary={k:samples[0][k] for k in ['own_metres','colleague_metres','points','step_metres','cpu_throttle','offline','saved_bytes']}
     summary.update({k:round(statistics.median(s[k] for s in samples),2) for k in samples[0] if k.endswith('_ms')});report['summary'].append(summary);print(json.dumps(summary),flush=True)
  await context.set_offline(False)
  # Simulated weak/dead transport while a local edit remains responsive.
  await page.evaluate('fieldRun(4)');await page.evaluate("()=>{window.inFlight=fieldReceive('/field/dead')}")
  await page.evaluate("_bojaVlChange('#654321');_saveLocalVlake()")
  dead=await page.evaluate('inFlight');assert not dead['ok'],dead;assert await page.evaluate('Object.keys(kolegeVlakeMap).length')==4
  weak=await page.evaluate("fieldReceive('/field/weak')");assert weak['ok'],weak
  await page.evaluate('fieldRun(4)');await context.set_offline(True)
  await page.evaluate('setNetGate(()=>false)');offline_gate=await page.evaluate("fieldReceive('/field/weak')");assert not offline_gate['ok'];assert await page.evaluate('Object.keys(kolegeVlakeMap).length')==4
  report['network']={'dead':dead,'weak':weak,'offline_gate':offline_gate}
  await page.evaluate("document.querySelector('#fixture-project').style.display='none'");await page.screenshot(path=str(out/'map-5400.png'))
  assert not errors,errors;await browser.close()
 (out/'browser-5400.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
 print('OK: 24 mjerenja 5.400 m, 1.360/5.410 tačaka, CPU1x/4x, online/offline, kolegin bafer i slaba/mrtva mreža')
if __name__=='__main__':asyncio.run(main())
