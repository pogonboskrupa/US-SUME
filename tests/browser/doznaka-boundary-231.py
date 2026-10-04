"""Stvarni Doznaka crtež, Leaflet raster, worker i prihvatanje uz očuvanu ručnu granicu."""
import asyncio,importlib.util,mimetypes,os
from pathlib import Path
from playwright.async_api import async_playwright
spec=importlib.util.spec_from_file_location('base',Path(__file__).with_name('menu-tools.py'));b=importlib.util.module_from_spec(spec);spec.loader.exec_module(b)
banner=b.section('<div id="doz-draw-banner">','<!-- ═══ VODI ME DO ODJELA/LOKACIJE')
functions='\n'.join(b.function(n) for n in ['dozAddDrawPoint','_dozRedrawPreview','dozUndoDrawPt','dozToggleDrawMode','_onDozDragMove','_dozDrawCleanup','dozCancelDraw','dozFinishDraw'])
setup='''
let sbUser={id:'A'},_aktivniProjektId='P',_dozDrawType='__boundary__',_dozDrawPts=[],_dozDrawLayer=null,_dozDrawEnabled=false,_dozDragLastPt=null,_dozCreateBoundary=null,_dozCreateAreaHa=null;
let _dozNewOdjelDrawGj='Una',_dozNewOdjelDrawOdjel='105',_sqlLayers=[];
const DOZ_TYPES={custom:{color:'#38bdf8'}},DOZ_DRAG_MIN_M=10,showToast=()=>{},_mcdRestoreVisibility=()=>{},dozShowCreateOdjel=()=>{},_dozCalcArea=()=>10000;
const map=L.map('map',{zoomAnimation:false,fadeAnimation:false}).setView([44.9,16],17);
const actual=[[90,140],[290,140],[290,340],[90,340]].map(p=>map.containerPointToLatLng(p));
const rough=[[104,154],[276,154],[276,326],[104,326]].map(p=>{const ll=map.containerPointToLatLng(p);return {lat:ll.lat,lng:ll.lng}});
let rasterColor='#151515',rasterSolid=false,holdWords=false,releaseWords=null,ocrCalls=0;
window.AndroidReferenceOcr={isOnline:()=>true};window.ReferenceVlake={readWords:async()=>{ocrCalls++;if(holdWords)await new Promise(r=>releaseWords=r);return []}};
const topo=L.gridLayer({tileSize:256,maxZoom:22});topo.createTile=function(coords){const c=document.createElement('canvas');c.width=c.height=256;const ctx=c.getContext('2d');ctx.fillStyle='#f1eddb';ctx.fillRect(0,0,256,256);ctx.strokeStyle=rasterColor;ctx.lineWidth=4;ctx.setLineDash(rasterSolid?[]:[18,10]);for(let i=0;i<actual.length;i++){const a=map.project(actual[i],coords.z),d=map.project(actual[(i+1)%actual.length],coords.z);ctx.beginPath();ctx.moveTo(a.x-coords.x*256,a.y-coords.y*256);ctx.lineTo(d.x-coords.x*256,d.y-coords.y*256);ctx.stroke();}return c;};topo.addTo(map);
const TL={'⛰ Topo':topo};let layerKey='⛰ Topo';function _activeLayerKey(){return layerKey;}
'''+functions+'''
function reset(){DoznakaBoundary.invalidate();_dozDrawType='__boundary__';_dozDrawPts=rough.map(p=>({...p}));_dozRedrawPreview();document.querySelector('#doz-draw-banner').style.display='flex';DoznakaBoundary.refresh();}
window.fixtureReady=new Promise(resolve=>document.addEventListener('DOMContentLoaded',()=>{reset();resolve()},{once:true}));
'''
fixture='<!DOCTYPE html><html lang="bs"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/static/libs/leaflet.min.css"><style>'+b.styles+'''#main{position:fixed;inset:0}#map{position:absolute;inset:0}#doz-draw-banner{display:flex}</style></head><body>'''+b.sprite+'<div id="main"><div id="map"></div><div id="action-bar"></div><div id="tab-bar"></div><div id="map-center-dot"></div></div>'+banner+'<script src="/static/libs/leaflet.min.js"></script><script>'+setup+'</script><script src="/static/js/doznaka-boundary.js"></script></body></html>'
async def main():
 b.OUT.mkdir(parents=True,exist_ok=True)
 async with async_playwright() as p:
  browser=await p.chromium.launch(headless=True,**({'executable_path':os.environ['UI_CHROMIUM']} if os.environ.get('UI_CHROMIUM') else {}));page=await browser.new_page(viewport={'width':390,'height':800});errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  async def route(r):
   if r.request.url=='https://ui.test/':await r.fulfill(content_type='text/html',body=fixture)
   elif r.request.url.startswith('https://ui.test/'):
    f=b.ROOT/r.request.url.split('ui.test/',1)[1].split('?',1)[0]
    if f.is_file():await r.fulfill(content_type=mimetypes.guess_type(str(f))[0] or 'application/octet-stream',body=f.read_bytes())
    else:await r.fulfill(status=404,body='fixture')
   else:await r.abort()
  await page.route('**/*',route);await page.goto('https://ui.test/');await page.evaluate('fixtureReady');assert not errors,errors
  manual=await page.evaluate('JSON.stringify(_dozDrawPts)')
  await page.evaluate('DoznakaBoundary.start()');assert await page.locator('#doz-boundary-accept').is_visible(),await page.locator('#doz-boundary-status').inner_text();assert await page.evaluate('JSON.stringify(_dozDrawPts)')==manual
  # Pan after capture cannot alter the saved geographical coordinates.
  await page.evaluate('map.panBy([23,17],{animate:false})');await page.click('#doz-boundary-accept');accepted=await page.evaluate('_dozDrawPts');assert await page.evaluate('JSON.stringify(_dozDrawPts)')!=manual
  expected=await page.evaluate('actual')
  assert all(min(abs(p['lat']-q['lat'])+abs(p['lng']-q['lng']) for q in expected)<.00008 for p in accepted),accepted
  await page.evaluate('dozFinishDraw()');assert await page.evaluate('_dozCreateBoundary.coordinates[0].length')==len(accepted)+1;assert await page.locator('#doz-boundary-tools').is_hidden()
  # Validated native network gate; no OCR, worker or geometric mutation offline.
  await page.evaluate('reset();AndroidReferenceOcr.isOnline=()=>false;DoznakaBoundary.refresh()');assert await page.locator('#doz-boundary-detect').is_disabled();before=await page.evaluate('ocrCalls');await page.evaluate('DoznakaBoundary.start()');assert await page.evaluate('ocrCalls')==before;assert await page.evaluate('JSON.stringify(_dozDrawPts)')==manual
  await page.evaluate('AndroidReferenceOcr.isOnline=()=>true;DoznakaBoundary.refresh()')
  # Undo and account changes invalidate an OCR result that arrives late.
  await page.evaluate('()=>{holdWords=true;window.pendingStart=DoznakaBoundary.start()}');await page.wait_for_function('releaseWords!==null');await page.evaluate('dozUndoDrawPt();releaseWords()');await page.evaluate('pendingStart');assert await page.locator('#doz-boundary-accept').is_hidden();assert await page.evaluate('_dozDrawPts.length')==3
  await page.evaluate('()=>{reset();releaseWords=null;window.pendingStart=DoznakaBoundary.start()}');await page.wait_for_function('releaseWords!==null');await page.evaluate("sbUser={id:'B'};releaseWords()");await page.evaluate('pendingStart');assert await page.locator('#doz-boundary-accept').is_hidden();assert await page.evaluate('JSON.stringify(_dozDrawPts)')==manual
  await page.evaluate("sbUser={id:'A'};holdWords=false;reset();layerKey='🛰 Sat'");await page.evaluate('DoznakaBoundary.start()');assert 'Topo' in await page.locator('#doz-boundary-status').inner_text();assert await page.evaluate('JSON.stringify(_dozDrawPts)')==manual
  # Blue raster and installed raster both use the actual current map tiles.
  await page.evaluate("layerKey='_sqlite_0';_sqlLayers=[{layer:topo}];rasterColor='#1932b4';topo.redraw();reset()");await page.evaluate('DoznakaBoundary.start()');assert await page.locator('#doz-boundary-accept').is_visible(),await page.locator('#doz-boundary-status').inner_text()
  await page.click('#doz-boundary-keep');assert await page.evaluate('JSON.stringify(_dozDrawPts)')==manual
  await page.evaluate('rasterSolid=true;topo.redraw();reset()');await page.evaluate('DoznakaBoundary.start()');assert await page.locator('#doz-boundary-accept').is_hidden();assert await page.evaluate('JSON.stringify(_dozDrawPts)')==manual
  await page.evaluate('rasterSolid=false;topo.redraw();reset()');await page.evaluate('DoznakaBoundary.start()')
  for theme in ['day','dark']:
   for w,h in [(320,568),(390,800),(568,320)]:
    await page.set_viewport_size({'width':w,'height':h});await page.evaluate("t=>{document.documentElement.dataset.fieldTheme=t;map.invalidateSize()}",theme)
    assert await page.locator('#doz-boundary-tools').evaluate('(e)=>e.scrollWidth<=e.clientWidth+1')
    assert await page.locator('#doz-boundary-detect').evaluate('(e)=>e.getBoundingClientRect().height>=44')
    await page.screenshot(path=str(b.OUT/f'doznaka-boundary-{theme}-{w}-{h}.png'))
  await page.evaluate('dozCancelDraw()');assert await page.locator('#doz-boundary-tools').is_hidden();assert not errors,errors;await browser.close()
 print('OK: actual raster + worker, black/blue, installed map, online gates, explicit accept/manual save, pan georeference, late undo/account, continuous road rejected, responsive 6 PNG')
if __name__=='__main__':asyncio.run(main())
