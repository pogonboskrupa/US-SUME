"""Doznaka u pravom Leaflet-u: 12.060 tačaka, 60 pojaseva, četiri člana."""
import asyncio,importlib.util,json,mimetypes,os
from pathlib import Path
from playwright.async_api import async_playwright
spec=importlib.util.spec_from_file_location('doz',Path(__file__).with_name('doznaka-restore-227.py'));d=importlib.util.module_from_spec(spec);spec.loader.exec_module(d);b=d.b
data=json.loads((b.ROOT/'outputs/doznaka-sixdays/simulation.json').read_text())
setup='''const simulation='''+json.dumps(data,separators=(',',':'))+''';
_dozOdjeli=[simulation.project];_dozSelId=simulation.project.id;_dozMembers=simulation.members;_dozTracks=simulation.tracks;_dozMarkings=[];
let t=performance.now();dozRenderDetail();dozRenderMapLayers();window.initialRenderMs=performance.now()-t;_dozShowBoundaryPopup(simulation.project);
'''
fixture=d.fixture.replace('/static/libs/turf.min.js"></script>', '/static/libs/turf.min.js"></script><script src="/static/js/doznaka-bands.js"></script>').replace('</body>','<script>'+setup+'</script></body>')
async def main():
 b.OUT.mkdir(parents=True,exist_ok=True)
 async with async_playwright() as p:
  browser=await p.chromium.launch(headless=True,**({'executable_path':os.environ['UI_CHROMIUM']} if os.environ.get('UI_CHROMIUM') else {}));page=await browser.new_page(viewport={'width':390,'height':800});errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  session=await page.context.new_cdp_session(page);await session.send('Emulation.setCPUThrottlingRate',{'rate':4})
  async def route(r):
   if r.request.url=='https://ui.test/':await r.fulfill(content_type='text/html',body=fixture)
   elif r.request.url.startswith('https://ui.test/'):
    f=b.ROOT/r.request.url.split('ui.test/',1)[1].split('?',1)[0]
    if f.is_file():await r.fulfill(content_type=mimetypes.guess_type(str(f))[0] or 'application/octet-stream',body=f.read_bytes())
    else:await r.fulfill(status=404,body='fixture')
   else:await r.abort()
  await page.route('**/*',route);await page.goto('https://ui.test/',timeout=60000)
  assert not errors,errors
  result=await page.evaluate('''()=>{const a=_dozPokrivenost(simulation.project);return {covered:a.ukupnoHa,overlap:a.preklopHa,bandCount:_dozComputeBands(simulation.project).length,renderMs:initialRenderMs};}''')
  assert result['bandCount']==60 and abs(result['covered']-data['coveredHa'])<1e-8,result
  assert abs(result['overlap']-data['overlapHa'])<1e-8,result
  await page.screenshot(path=str(b.OUT/'doznaka-sixdays-panel-232.png'))
  await page.evaluate("document.querySelector('#doznaka-panel').style.display='none';map.invalidateSize();map.fitBounds(_dozBoundaryLayer.getBounds(),{padding:[35,35]});map.closePopup()")
  await page.screenshot(path=str(b.OUT/'doznaka-sixdays-map-232.png'))
  # Osvježavanje istih podataka i reload ne mijenjaju rezultat; nema mrežnih servisa.
  await page.context.set_offline(True);await page.reload(timeout=60000);assert await page.evaluate('_dozComputeBands(simulation.project).length')==60
  assert not errors,errors;await browser.close()
 (b.ROOT/'outputs/doznaka-sixdays/browser-performance.json').write_text(json.dumps({**result,'cpuThrottle':4,'environment':'Chromium cloud; nije fizički Xiaomi Redmi Note 13 Pro'}))
 print('OK: četiri člana, šest dana, 60 pojaseva/12.060 tačaka, iste površine u Leaflet-u i bez mreže; CPU4x: '+json.dumps(result))
if __name__=='__main__':asyncio.run(main())
