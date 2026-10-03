"""Oznake i sažet Server sa stvarnim Leafletom, lokalnim fajlovima i lažnim podacima."""
import asyncio,importlib.util,mimetypes,os
from pathlib import Path
from playwright.async_api import async_playwright
spec=importlib.util.spec_from_file_location('server_map',Path(__file__).with_name('server-map-218.py'))
s=importlib.util.module_from_spec(spec);spec.loader.exec_module(s);b=s.b
extra='''
let _kmlEditIdx=-1;
const _tragIme=t=>t.name||'Trag',closeTragRegistry=()=>{},_dlgConfirm=async()=>true;
const _srvDownload=async()=>{},_srvDelete=async()=>{};
'''
extra+='\n'.join(b.function(n) for n in ['_kmlFeatureCount','openOznakePanel','closeOznakePanel','_ozZoomKml','_tragRegZoom','_kmlSetNameR','_kmlSaveTag','delK'])
extra+='\n'+(b.ROOT/'static/js/map-library.js').read_text()
extra+='''
_locFotos[0].la=44.902;_locFotos[0].lo=16.002;_locFotos[0].ts=1;_locFotos[0].odjel='105';
_sharedFotos[0].la=44.903;_sharedFotos[0].lo=16.002;_sharedFotos[0].ts=2;
_tragRegistry[0].name='Trag 105';_tragRegistry[0].odjel='105';
for(let i=0;i<65;i++){
 const grp=L.featureGroup([L.polyline([[44.9+i*.0001,16],[44.901+i*.0001,16.001]])]).addTo(map);
 kmlLs.push({name:'Granica '+i,_origName:'Granica '+i,tag:i===64?'206':'105',grp,vis:true,col:'#16a34a',_loadedAt:100+i});
}
kmlLs.push({name:'Server granica',_key:'server/sample',vis:false,tag:'206'});
openOznakePanel();
'''
markup=b.section('<div id="oznake-bg"','<!-- Sync queue viewer panel -->')
fixture=s.fixture.replace('_rndOznakePanel=()=>{}',"_rndOznakePanel=()=>{if(typeof _libraryRender==='function')_libraryRender()}")
fixture=fixture.replace('</head>','<style>'+(b.ROOT/'static/css/map-library.css').read_text()+'</style></head>').replace('</body>',markup+'<script>'+extra+'</script></body>')
async def main():
 b.OUT.mkdir(parents=True,exist_ok=True)
 async with async_playwright() as p:
  browser=await p.chromium.launch(headless=True,**({'executable_path':os.environ['UI_CHROMIUM']} if os.environ.get('UI_CHROMIUM') else {}))
  page=await browser.new_page(viewport={'width':390,'height':800});errors=[]
  page.on('pageerror',lambda e:errors.append(str(e)))
  async def route(r):
   path=r.request.url.split('ui.test',1)[-1].split('?',1)[0]
   if r.request.url=='https://ui.test/':await r.fulfill(content_type='text/html',body=fixture)
   elif r.request.url.startswith('https://ui.test/static/libs/'):
    f=b.ROOT/path.lstrip('/')
    if f.is_file():await r.fulfill(content_type=mimetypes.guess_type(str(f))[0] or 'application/octet-stream',body=f.read_bytes())
    else:await r.fulfill(status=404,body='fixture')
   else:await r.abort()
  await page.route('**/*',route);await page.goto('https://ui.test/');assert not errors,errors
  await page.fill('#library-search','105');await page.get_by_role('button',name='Sakrij rezultate',exact=True).click()
  assert await page.evaluate("kmlLs.slice(0,64).every(k=>!map.hasLayer(k.grp))&&map.hasLayer(kmlLs[64].grp)")
  await page.get_by_role('button',name='Prikaži rezultate',exact=True).click()
  await page.fill('#library-search','');await page.select_option('#library-sort','proximity')
  assert await page.evaluate('_libraryRows().every((r,i,a)=>!i||r.distance>=a[i-1].distance)')
  await page.evaluate("_libraryFilter('photos');_libraryGroup(false);_libraryAction('visibility',_libraryRows()[0].key)")
  assert await page.evaluate('_libraryRows().filter(r=>r.visible).length')==1
  await page.evaluate("_libraryFilter('local');_librarySort('department')")
  for theme in ['day','dark']:
   for w,h in [(320,568),(390,800),(568,320),(800,600)]:
    await page.set_viewport_size({'width':w,'height':h})
    await page.evaluate("t=>{document.documentElement.dataset.fieldTheme=t;openOznakePanel();}",theme)
    await b.bounds(page,'#oznake-panel',w,h)
    assert await page.evaluate("document.querySelector('#oznake-panel').scrollWidth<=document.querySelector('#oznake-panel').clientWidth+1")
    await page.screenshot(path=str(b.OUT/f'library-{theme}-{w}-{h}.png'))
  await page.set_viewport_size({'width':390,'height':800})
  await page.locator('#library-list button[data-action="edit"]').first.click()
  await page.locator('#library-list .le-fields input').first.fill('Nova granica')
  await page.locator('#library-list .le-fields input').first.press('Tab')
  assert await page.evaluate("kmlLs.some(k=>k.name==='Nova granica')")
  await page.evaluate("closeOznakePanel();_serverProjektPreuzeto('P',fixtureRows);openSyncQueuePanel()")
  assert await page.locator('#server-received-items details').count()==1
  assert not await page.locator('#server-received-items .sp-item-map').is_visible()
  await page.locator('#server-received-items summary').click()
  await page.locator('#server-received-items .sp-item-map').click()
  assert not await page.locator('#syncq-panel').is_visible()
  assert await page.evaluate('map.getBounds().contains([44.9005,16])')
  await page.evaluate('_serverPreviewClose();openSyncQueuePanel()')
  await page.select_option('#server-group-mode','day')
  await page.screenshot(path=str(b.OUT/'server-grouped-day-390.png'))
  assert not errors,errors
  await browser.close()
 print('OK: Oznake grupne radnje, sortiranje, foto, KML editor i Server grupa/klik; 9 PNG')
if __name__=='__main__':asyncio.run(main())
