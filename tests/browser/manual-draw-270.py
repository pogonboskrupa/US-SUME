"""Real Leaflet gestures: no points from GPS pan/resize/zoom/inertia or finish buttons."""
import asyncio,importlib.util,mimetypes,os
from pathlib import Path
from playwright.async_api import async_playwright
spec=importlib.util.spec_from_file_location('base',Path(__file__).with_name('menu-tools.py'));b=importlib.util.module_from_spec(spec);spec.loader.exec_module(b)
body=b.section('<div id="manual-draw-panel"','<!-- ═══ EDIT VLAKE')
js='''
const map=L.map('map',{inertia:true}).setView([44.9,16],16);let vlake=[{nm:'T1',pts:[],lager:'L',poly:L.polyline([]).addTo(map)}],actI=0,recOn=false,activeTool='select',bufLayers=[],_mapFullScreen=true,drawUndoStack=[];
const scheduleVlakaSave=()=>{},updBan=()=>{},updOvl=()=>{},rndList=()=>{},updateVlakaLabel=()=>{},sbFlushVlaka=()=>{},updProjStats=()=>{},showToast=()=>{},_updFabVisibility=()=>{},_showLagerDlg=()=>{};
'''
js+='\n'+b.section('let _mdpIdx =','// ─── Uvoz vlake iz fajla')+'\n'+b.section('let _drawDragOn =','function _stopAddLine(')
js+='\n'+'\n'.join(b.function(n) for n in ['dst','addPt','_mcdRestoreVisibility'])
js+='\n'+b.section('// Prevent overlay and banner','// Guard: dblclick')
html='<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/static/libs/leaflet.min.css"><style>'+b.styles+'#main{position:fixed;inset:0}#map{position:absolute;inset:0}</style></head><body>'+b.sprite+'<div id="main"><div id="map"></div><div id="map-center-dot"></div><button id="btn-draw-drag"></button>'+body+'</div><script src="/static/libs/leaflet.min.js"></script><script>'+js+'</script></body></html>'
async def main():
 async with async_playwright() as p:
  browser=await p.chromium.launch(executable_path=os.environ.get('UI_CHROMIUM') or None,args=['--no-sandbox']);page=await browser.new_page(viewport={'width':390,'height':800},has_touch=True);errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  async def route(r):
   if r.request.url=='https://fixture.test/':await r.fulfill(content_type='text/html',body=html)
   elif r.request.url.startswith('https://fixture.test/static/'):
    f=b.ROOT/r.request.url.split('fixture.test/',1)[1];await r.fulfill(content_type=mimetypes.guess_type(f)[0] or 'text/plain',body=f.read_bytes())
   else:await r.abort()
  await page.route('**/*',route);await page.goto('https://fixture.test/');cdp=await page.context.new_cdp_session(page);await cdp.send('Emulation.setCPUThrottlingRate',{'rate':4})
  await page.evaluate('_mdpStart(0)');await page.locator('#mdp-drag-chk').check()
  assert await page.evaluate('vlake[0].pts.length')==1
  # Genuine mouse drag draws; inertial move after pointer release cannot extend it.
  await page.mouse.move(150,210);await page.mouse.down();await page.mouse.move(240,350,steps=15);await page.mouse.up()
  n=await page.evaluate('vlake[0].pts.length');assert n>3,n
  await page.wait_for_timeout(800);assert await page.evaluate('vlake[0].pts.length')==n
  # Reproduce the reported 200 m south jump with a programmatic GPS-like recenter.
  await page.evaluate('()=>{const p=vlake[0].pts.at(-1);map.setView([p.la-.0018,p.lo],16,{animate:false})}')
  await page.set_viewport_size({'width':390,'height':720});await page.evaluate('map.invalidateSize();map.setZoom(17,{animate:false})')
  assert await page.evaluate('vlake[0].pts.length')==n
  # Genuine touch gesture also draws, but touch-end inertia does not.
  await cdp.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[{'x':130,'y':170}]})
  for i in range(1,13):
   await cdp.send('Input.dispatchTouchEvent',{'type':'touchMove','touchPoints':[{'x':130+i*7,'y':170+i*8}]});await page.wait_for_timeout(20)
  await cdp.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]})
  n2=await page.evaluate('vlake[0].pts.length');assert n2>n
  await page.wait_for_timeout(800);assert await page.evaluate('vlake[0].pts.length')==n2
  await page.locator('.mdp-btn.done').click();assert await page.evaluate('_mdpIdx===null && !_mdpDragOn && vlake[0].pts.length')==n2
  await page.evaluate('map.panBy([0,250],{animate:false})');assert await page.evaluate('vlake[0].pts.length')==n2
  # Explicit point mode still records exactly the chosen centre, with Undo intact.
  await page.evaluate('_mdpStart(0)');await page.locator('.mdp-btn.point').click();assert await page.evaluate('vlake[0].pts.length')==n2+1
  await page.locator('.mdp-btn.undo').click();assert await page.evaluate('vlake[0].pts.length')==n2
  await page.locator('.mdp-btn.done').click()
  # Older Vuci toolbar uses the same gesture restriction.
  await page.evaluate('vlake.push({nm:"T2",pts:[],poly:L.polyline([]).addTo(map)});actI=1;activeTool="addline";toggleDrawDrag();map.panBy([0,200],{animate:false})')
  assert await page.evaluate('vlake[1].pts.length')==0
  await page.mouse.move(150,210);await page.mouse.down();await page.mouse.move(230,310,steps=10);await page.mouse.up()
  k=await page.evaluate('vlake[1].pts.length');assert k>2
  await page.wait_for_timeout(800);await page.evaluate('_stopDrawDrag();map.panBy([0,200],{animate:false})');assert await page.evaluate('vlake[1].pts.length')==k
  assert not errors,errors
  await browser.close();print('Manual draw: mouse/touch, inertia, 200m GPS recenter, resize/zoom, finish, point/Undo and legacy Vuci: OK (CPU4x simulation)')
if __name__=='__main__':asyncio.run(main())
