"""Mjerljivi sintetički scenariji; CPU 4x nije emulacija konkretnog telefona."""
import asyncio,importlib.util,json,mimetypes,os,statistics,platform
from pathlib import Path
from playwright.async_api import async_playwright
spec=importlib.util.spec_from_file_location('project_ui',Path(__file__).with_name('project-vlake-220.py'))
u=importlib.util.module_from_spec(spec);spec.loader.exec_module(u);b=u.b
extra=b.function('_saveLocalVlake')+'''
const LOCAL_VLAKE_KEY='perf-local-vlake';map.createPane('vlakeLines');const perfRenderer=L.canvas({pane:'vlakeLines',padding:.3});
const perfFrame=()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
let perfMove=false;
async function perfRun(n,m){
 for(const v of vlake)if(v.poly)map.removeLayer(v.poly);vlake.length=0;
 for(const v of Object.values(kolegeVlakeMap))map.removeLayer(v.poly);kolegeVlakeMap={};
 _OL.load=()=>[];_OL.loadQueue=()=>[];localStorage.removeItem(LOCAL_VLAKE_KEY);
 const input=JSON.stringify(Array.from({length:n},(_,i)=>({nm:'T'+(i+1),kr:0,br:i+1,color:'#123456',projektId:'P',sbId:'v'+i,pts:Array.from({length:m},(_,j)=>({la:44.9+(i%50)*.00006+j*.000004,lo:16+(i%30)*.00005+Math.sin(j*.1)*.0001,al:300+j*.1}))})));
 const results={vlake:n,points:n*m,payload_bytes:new TextEncoder().encode(input).length};
 let start=performance.now();
 for(const v of JSON.parse(input)){v.poly=L.polyline(v.pts.map(p=>[p.la,p.lo]),{color:v.color,pane:'vlakeLines',renderer:perfRenderer,weight:4}).addTo(map);vlake.push(v);}
 _vlakaStilApply();results.load_cpu_ms=performance.now()-start;await perfFrame();results.load_total_ms=performance.now()-start;
 start=performance.now();_bojaVlChange('#456789');results.color_cpu_ms=performance.now()-start;await perfFrame();results.color_total_ms=performance.now()-start;
 start=performance.now();_projektVlakeRender();results.list_cpu_ms=performance.now()-start;await perfFrame();results.list_total_ms=performance.now()-start;
 start=performance.now();perfMove=!perfMove;map.setView(perfMove?[44.9008,16.0004]:[44.9012,16.0008],perfMove?15:16,{animate:false});await perfFrame();results.pan_zoom_total_ms=performance.now()-start;
 start=performance.now();results.local_save_ok=_saveLocalVlake();results.local_save_ms=performance.now()-start;
 const raw=localStorage.getItem(LOCAL_VLAKE_KEY);results.saved_bytes=raw?new TextEncoder().encode(raw).length:0;
 localStorage.removeItem(LOCAL_VLAKE_KEY);
 return results;
}
'''
fixture=u.fixture.replace('</body>','<script>'+extra+'</script></body>')
async def main():
 out=b.ROOT/'outputs/performance';out.mkdir(parents=True,exist_ok=True)
 report={'version':'2.2.0','method':'Chromium desktop CI, real Leaflet canvas and source color/list/localStorage functions; 3 repetitions; CPU 1x/4x, navigator online/offline; no real phone, tile fetch, GPS, authentication, backend, full startup, labels or APK bridge','hardware':platform.platform(),'samples':[],'summary':[]}
 async with async_playwright() as p:
  browser=await p.chromium.launch(headless=True,**({'executable_path':os.environ['UI_CHROMIUM']} if os.environ.get('UI_CHROMIUM') else {}));report['browser']=browser.version
  context=await browser.new_context(viewport={'width':393,'height':851});page=await context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  async def route(r):
   if r.request.url=='https://ui.test/':await r.fulfill(content_type='text/html',body=fixture)
   elif r.request.url.startswith('https://ui.test/'):
    f=b.ROOT/r.request.url.split('ui.test/',1)[1].split('?',1)[0]
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
    for n,m in [(100,100),(500,100),(100,1000)]:
     samples=[]
     for repeat in range(3):
      sample=await page.evaluate('([n,m])=>perfRun(n,m)',[n,m]);sample.update(cpu_throttle=cpu,offline=offline,repeat=repeat);samples.append(sample);report['samples'].append(sample)
     summary={k:samples[0][k] for k in ['vlake','points','payload_bytes','cpu_throttle','offline']}
     for key in samples[0]:
      if key.endswith('_ms'):summary[key]=round(statistics.median(r[key] for r in samples),2)
     summary['save_passes']=sum(r['local_save_ok'] for r in samples)
     report['summary'].append(summary);print(json.dumps(summary),flush=True)
  assert not errors,errors
  metrics=await cdp.send('Performance.getMetrics');report['final_metrics']=metrics
  await browser.close()
 (out/'redmi-note-13-pro.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
 print('OK: sintetička analiza CPU 1x/4x, 3 količine podataka, online/offline, 36 ponavljanja; JSON')
if __name__=='__main__':asyncio.run(main())
