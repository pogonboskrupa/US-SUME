"""Stvarni Leaflet/Turf: kolegine vlake, bafer i grupna vidljivost; lažni server."""
import asyncio,importlib.util,mimetypes,os
from pathlib import Path
from playwright.async_api import async_playwright
spec=importlib.util.spec_from_file_location('menu_tools',Path(__file__).with_name('menu-tools.py'))
b=importlib.util.module_from_spec(spec);spec.loader.exec_module(b)
extra='''
window.map=map;map.createPane('tragMsrLines');map.createPane('vlakeLabels');
let fixtureAdmin=false,recOn=false,activeTool=null,_msrOn=false,_guideOn=false,_tackaPlaceMode=false,textToolOn=false,_dozDrawType=null,_dblClickGuard=false;
let _vpIdx=null,_vpJustOpened=false,_vpSharedKey=null,_vpBufferId=null,_lastVlakaClickTs=0;
let bufRadius=80,bufLayers=[],deadLayers=[],kolegeVlake=[],kolegeLabels=[],kolegeVlakeMap={};
let _locFotos=[],_sharedFotos=[],_tacke=[],textLabels=[],_msrRegistry=[],_msrSavedLayer=L.layerGroup().addTo(map),_tragRegistry=[],_tragLayers={},_tragHitLayers={},_tragLenMk={};
const _lineStyle={tragDash:'solid',tragW:3,tragOp:85,tragLen:true};
const _bufGetColor=()=> '#60a5fa',_bufGetOpacity=()=>.2,_kvcSave=()=>{},rndKolegeVlakeList=()=>{},_placeLabelMarkers=()=>[],KORISNIK_PAL=['#338855'];
const _tragRegSave=()=>{},_tragPopupHtml=()=> 'Trag',_tragoviRender=()=>_tvVisibilityRender(),_msrHitTest=()=>null,_kmlHitTest=()=>null;
const _setupFotoPopup=()=>{},_fotoMarkerHtml=()=>'<b>Foto</b>',_tačkaIcon=()=>L.divIcon({html:'Tačka'}),_setupTackaPopup=()=>{},_saveTacke=()=>{};
const switchTab=()=>{},selI=()=>{},getIme=()=> 'Emina',fmtDate=String,todayStr=()=> '2026-10-03',isReadOnly=()=>false;
sbProfile.sumarija='Test';kolegeMap.B.color='#38bdf8';
'''
names=['sbLoadKolegeVlake','attachPolyClick','_distToSegPx','showKolegeVlakaInfo','showVlakaPopup','closeVlakaPopup','_positionPopup','vpZoom','vpBuffer','_vpBufferLabel','buildBufPoly','geoJsonToLeaflet','drawBuffers','clearBuffers','_tragRegAddLayer','_tragCalcLen','_tragFmtLen','_buildFotoMarker','_createTacka']
extra+='\n'.join(b.function(n) for n in names)
extra+='\n'+b.section("map.on('click', e => {","map.on('dblclick'")
extra+='\n'+(b.ROOT/'static/js/map-visibility.js').read_text()
extra+='''
_locFotos.push({marker:_buildFotoMarker(44.902,16.002,'','',0,1,true)});
_sharedFotos.push({marker:_buildFotoMarker(44.903,16.002,'','',1,2,false)});
_createTacka(44.904,16.002,'Test');
textLabels.push({marker:L.marker([44.905,16.002],{icon:L.divIcon({html:'Oznaka'})}).addTo(map)});
_msrRegistry.push({id:'m'});_msrSavedLayer.addLayer(L.polyline([[44.904,16.001],[44.905,16.001]]));
_tragRegistry.push({id:'t',pts:[[44.902,16.003],[44.905,16.003]],visible:true});_tragRegAddLayer(_tragRegistry[0]);
map.setView([44.9005,16],16,{animate:false});_tvVisibilityRender();
'''
markup=b.section('<div id="vlaka-popup">','    <!-- IZMJERI PANEL -->')+'<div id="vis-panel" style="position:fixed;inset:60px 8px 8px;z-index:1900;overflow:auto;display:none"><section id="tv-visibility"></section></div>'
fixture=b.fixture.replace('isAdmin=()=>false','isAdmin=()=>fixtureAdmin').replace('</body>',markup+'<script src="/static/libs/turf.min.js"></script><script>'+extra+'</script></body>')
async def main():
 b.OUT.mkdir(parents=True,exist_ok=True)
 async with async_playwright() as p:
  browser=await p.chromium.launch(headless=True,**({'executable_path':os.environ['UI_CHROMIUM']} if os.environ.get('UI_CHROMIUM') else {}))
  page=await browser.new_page(viewport={'width':390,'height':800});errors=[]
  page.on('pageerror',lambda e:errors.append(str(e)))
  async def route(r):
   if not r.request.url.startswith('https://ui.test/'):
    await r.abort();return
   path=r.request.url.split('ui.test',1)[1].split('?',1)[0]
   if path=='/':await r.fulfill(content_type='text/html',body=fixture)
   elif path.startswith('/static/libs/'):
    f=b.ROOT/path.lstrip('/')
    if f.is_file():await r.fulfill(content_type=mimetypes.guess_type(str(f))[0] or 'application/octet-stream',body=f.read_bytes())
    else:await r.fulfill(status=404,body='fixture only')
   else:await r.fulfill(status=404,body='fixture only')
  await page.route('**/*',route);await page.goto('https://ui.test/')
  assert not errors,errors
  for admin in [False,True]:
   await page.evaluate('''async admin=>{fixtureAdmin=admin;await sbLoadKolegeVlake(fixtureRows);_lastVlakaClickTs=0;const v=kolegeVlakeMap['B::T2'];v.poly.fire('click',{latlng:L.latLng(44.9005,16)});}''',admin)
   assert await page.locator('#vlaka-popup').is_visible()
   assert 'Amir Kolega' in await page.locator('#vp-info').inner_text()
   assert not await page.locator('#vlaka-popup-btns').is_visible()
   await page.click('#vp-buffer');assert await page.evaluate('bufLayers.length')==1
   assert await page.evaluate('turf.area(buildBufPoly(kolegeVlakeMap["B::T2"]))')>10000
   await page.click('#vp-buffer');assert await page.evaluate('bufLayers.length')==0
   await page.evaluate("closeVlakaPopup();map.fire('click',{latlng:L.latLng(44.9005,16)})")
   assert await page.locator('#vlaka-popup').is_visible()
  for theme in ['day','dark']:
   for w,h in [(320,568),(568,320)]:
    await page.set_viewport_size({'width':w,'height':h})
    await page.evaluate("t=>{document.documentElement.dataset.fieldTheme=t;map.invalidateSize();showKolegeVlakaInfo('B::T2',map.getCenter());}",theme)
    await b.bounds(page,'#vlaka-popup',w,h)
    await page.screenshot(path=str(b.OUT/f'colleague-buffer-{theme}-{w}-{h}.png'))
    await page.evaluate("closeVlakaPopup();document.querySelector('#vis-panel').style.display='block';_tvVisibilityRender()")
    await b.bounds(page,'#vis-panel',w,h)
    await page.screenshot(path=str(b.OUT/f'visibility-{theme}-{w}-{h}.png'))
    await page.evaluate("document.querySelector('#vis-panel').style.display='none'")
  await page.evaluate("document.querySelector('#vis-panel').style.display='block'")
  await page.get_by_role('button',name='Sakrij sve',exact=True).click()
  assert await page.evaluate('_tvVisibilityModel().every(r=>r.visible===0)')
  assert await page.evaluate('!map.hasLayer(_tragHitLayers.t)&&(!_tragLenMk.t||!map.hasLayer(_tragLenMk.t))')
  await page.evaluate("_createTacka(44.9,16,'Skrivena');_locFotos.push({marker:_buildFotoMarker(44.9,16,'','',2,3,true)})")
  assert await page.evaluate("!map.hasLayer(_tacke.at(-1).marker)&&!map.hasLayer(_locFotos.at(-1).marker)")
  assert await page.evaluate('_tragRegistry[0].pts.length')==2
  await page.evaluate("_tvVisibilitySet('all',true)")
  assert await page.evaluate('_tvVisibilityModel().every(r=>r.visible===r.total)')
  await page.evaluate("_tvVisibilitySet('photos',false);sbUser={id:'B'}")
  assert await page.evaluate("_tvCategoryOn('photos')")
  await page.evaluate("sbUser={id:'A'}")
  assert not await page.evaluate("_tvCategoryOn('photos')")
  assert not errors,errors
  await browser.close()
 print('OK: kolegina vlaka obični/admin, direktni klik i fallback, stvarni Turf bafer, sve grupe i odvajanje naloga; 8 PNG')
if __name__=='__main__':asyncio.run(main())
