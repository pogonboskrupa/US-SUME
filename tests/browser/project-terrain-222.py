"""Pravi Leaflet/Canvas i Terrarium PNG: crtanje, offline, maska i katalog karata."""
import asyncio,importlib.util,mimetypes,os,struct,zlib,math
from pathlib import Path
from playwright.async_api import async_playwright
spec=importlib.util.spec_from_file_location('project',Path(__file__).with_name('project-vlake-220.py'))
u=importlib.util.module_from_spec(spec);spec.loader.exec_module(u);b=u.b
code='\n'.join(b.function(n) for n in ['_getTerrariumTile','_terrariumDecodeTile','_aspColor','_instUpdateStats','_instClear','_mapFavRender','openMapFavs','closeMapFavs','_mapFavThumbHtml','_tileThumbUrl','setLayerSqlite','_saveLastMap'])
code+='''
const _TERR_CACHE='fixture-terr-222',_ELEV_CACHE='fixture-elev-222',_LASTMAP_KEY='fixture-last';
const _OVL={slope:L.layerGroup(),ekspo:L.layerGroup()},_fetchT=(url,ms,opts)=>fetch(url,opts);
let confirmHook=async()=>true;const _dlgConfirm=(...args)=>confirmHook(...args);
const TL={Topo:L.layerGroup().addTo(map)},_sqlLayers=[{name:'Odjel 105 — kompletna lokalna karta',fmt:'mbtiles',layer:L.layerGroup(),visible:false},{name:'Odjel 2',fmt:'gpkg',layer:L.layerGroup(),visible:false}];
let _sqlRestoreFailed=[{name:'Odjel 206 — sačuvana za naredni teren',deferred:true}],_mapFavs=[{id:'f1',name:'Moja karta odjela 105',type:'sqlite',sqliteId:'Odjel 105 — kompletna lokalna karta'},{id:'f2',name:'Topo pregled',type:'tl',tlKey:'Topo',tileUrl:''},{id:'f3',name:'Stari uklonjeni fajl',type:'sqlite',sqliteId:'missing'}];
const _sqlmapRenderLayers=()=>{},_mapFavMenu=()=>{},mapFavAddCurrent=()=>{},openLoadMapScreen=()=>{},showCacheMgr=()=>{},nvDemPreuzmiUi=()=>{};
const pixelToLL=(x,y)=>map.unproject(L.point((TERR_COORDS.x*256)+x,(TERR_COORDS.y*256)+y),14);
const center=map.project(L.latLng(44.9,16),14);window.TERR_COORDS={z:14,x:Math.floor(center.x/256),y:Math.floor(center.y/256)};
window.polyRing=[[64,64],[196,64],[196,196],[64,196]].map(p=>{const l=pixelToLL(...p);return [l.lat,l.lng]});
map.setView(pixelToLL(128,128),14,{animate:false});
window.terrainReady=new Promise(resolve=>window.addEventListener('DOMContentLoaded',async()=>{await fixtureReady;document.querySelector('#fixture-project').innerHTML=document.querySelector('#terrain-markup').innerHTML;ProjectTerrain.refresh();resolve();},{once:true}));
window.tileAlphas=pane=>{let result=null;map.eachLayer(layer=>{if(layer.options?.pane===pane){for(const tile of Object.values(layer._tiles||{})){if(tile.coords.x===TERR_COORDS.x&&tile.coords.y===TERR_COORDS.y){const ctx=tile.el.getContext('2d');result=[ctx.getImageData(80,128,1,1).data[3],ctx.getImageData(160,128,1,1).data[3],ctx.getImageData(220,128,1,1).data[3],ctx.getImageData(160,20,1,1).data[3]];}}}});return result;};
'''
poly=b.section('      <section class="sec proj-akt-only project-polygon">','    </div><!-- /proj-panel -->')
favs=b.section('<div id="mapfav-modal"','<!-- === Registar tragova === -->')
bar=b.section('<div id="project-draw-toolbar"','<script src="static/js/map-catalog.js">')
markup='<template id="terrain-markup">'+poly+'</template>'+favs+bar+'<script>'+code+'</script><script src="/static/js/map-catalog.js"></script><script src="/static/js/project-terrain.js"></script>'
fixture=u.fixture.replace("switchTab=()=>{},selI","switchTab=()=>{document.querySelector('#fixture-project').style.display='none'},selI").replace('_instUpdateStats=()=>{}','_fixtureStats=()=>{}').replace("_activeLayerKey=()=>''","_activeLayerKey=()=>{const i=_sqlLayers.findIndex(l=>l.visible&&map.hasLayer(l.layer));return i>=0?'_sqlite_'+i:'Topo'}").replace('</body>',markup+'</body>')
def png_tile(z,y):
 lat=math.atan(math.sinh(math.pi*(1-2*(y+.5)/2**z)));metres=math.cos(lat)*156543.03392/2**z
 raw=bytearray()
 for py in range(256):
  raw.append(0)
  for px in range(256):
   height=500+metres*(min(px,128)*.2+max(0,px-128)*.45)+32768
   integer=int(height);raw.extend((integer//256,integer%256,int((height-integer)*256),255))
 def chunk(typ,data):return struct.pack('>I',len(data))+typ+data+struct.pack('>I',zlib.crc32(typ+data)&0xffffffff)
 return b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('>IIBBBBB',256,256,8,6,0,0,0))+chunk(b'IDAT',zlib.compress(raw))+chunk(b'IEND',b'')
async def main():
 b.OUT.mkdir(parents=True,exist_ok=True)
 async with async_playwright() as p:
  browser=await p.chromium.launch(headless=True,**({'executable_path':os.environ['UI_CHROMIUM']} if os.environ.get('UI_CHROMIUM') else {}));page=await browser.new_page(viewport={'width':390,'height':800});errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  async def route(r):
   if 'elevation-tiles-prod/terrarium/' in r.request.url:
    z,x,y=r.request.url.rsplit('/',3)[1:];await r.fulfill(content_type='image/png',body=png_tile(int(z),int(y.split('.')[0])),headers={'Access-Control-Allow-Origin':'*'})
   elif r.request.url=='https://ui.test/':await r.fulfill(content_type='text/html',body=fixture)
   elif r.request.url.startswith('https://ui.test/'):
    f=b.ROOT/r.request.url.split('ui.test/',1)[1].split('?',1)[0]
    if f.is_file():await r.fulfill(content_type=mimetypes.guess_type(str(f))[0] or 'application/octet-stream',body=f.read_bytes())
    else:await r.fulfill(status=404,body='fixture')
   else:await r.abort()
  await page.route('**/*',route);await page.goto('https://ui.test/');await page.evaluate('terrainReady');assert not errors,errors
  assert await page.locator('#project-terrain-slope').is_disabled()
  await page.click('#project-polygon-draw');assert await page.evaluate('ProjectTerrain.isDrawing()')
  await page.click('#map',position={'x':110,'y':100});assert '1 tačaka' in await page.locator('#project-draw-count').inner_text();await page.click('#project-draw-undo')
  await page.evaluate('polyRing.forEach(p=>map.fire("click",{latlng:L.latLng(p)}))');await page.click('#project-draw-undo')
  assert await page.evaluate('ProjectTerrain.isDrawing()');assert '3 tačaka' in await page.locator('#project-draw-count').inner_text()
  await page.evaluate('map.fire("click",{latlng:L.latLng(polyRing[3])})');await page.click('#project-draw-save')
  assert await page.evaluate('ProjectTerrain.dataFor().ring.length')==4
  await page.evaluate("_OVL.slope.addTo(map);_OVL.ekspo.addTo(map);_ovlState.slope=true;_ovlState.ekspo=true;ProjectTerrain.toggle('slope',true);ProjectTerrain.toggle('aspect',true)")
  await page.wait_for_function("tileAlphas('projectSlope')?.[1]>0&&tileAlphas('projectAspect')?.[0]>0")
  assert await page.evaluate('!map.hasLayer(_OVL.slope)&&!map.hasLayer(_OVL.ekspo)&&!_ovlState.slope&&!_ovlState.ekspo')
  assert await page.evaluate("tileAlphas('projectSlope')")==[0,200,0,0]
  assert await page.evaluate("tileAlphas('projectAspect')[2]===0&&tileAlphas('projectAspect')[3]===0")
  # Poništen nacrt i neuspješan upis ne uklanjaju stari poligon.
  await page.evaluate('ProjectTerrain.start();polyRing.slice(0,3).forEach(p=>map.fire("click",{latlng:L.latLng(p)}));ProjectTerrain.cancel()')
  assert await page.evaluate('ProjectTerrain.dataFor().ring.length')==4
  await page.evaluate('''()=>{window.savedSet=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k.startsWith('tvlake_project_polygon'))throw new DOMException('full','QuotaExceededError');return savedSet.call(this,k,v)};ProjectTerrain.start();polyRing.slice(0,3).forEach(p=>map.fire('click',{latlng:L.latLng(p)}));ProjectTerrain.finish();}''')
  assert await page.evaluate('ProjectTerrain.isDrawing()&&ProjectTerrain.dataFor().ring.length===4')
  await page.evaluate('Storage.prototype.setItem=savedSet;ProjectTerrain.cancel();recOn=true;ProjectTerrain.start()');assert not await page.evaluate('ProjectTerrain.isDrawing()');await page.evaluate('recOn=false')
  # Konto/projekat, slojevi i nacrt se razdvajaju; stari zapis preživi.
  await page.evaluate("ProjectTerrain.start();_aktivniProjektId='Q';ProjectTerrain.refresh()")
  assert not await page.evaluate('ProjectTerrain.isDrawing()');assert await page.evaluate('ProjectTerrain.dataFor().ring') is None
  assert await page.evaluate("tileAlphas('projectSlope')") is None
  await page.evaluate("_aktivniProjektId='P';sbUser={id:'B'};ProjectTerrain.refresh()")
  assert await page.evaluate('ProjectTerrain.dataFor().ring') is None
  await page.evaluate("sbUser={id:'A'};ProjectTerrain.refresh()")
  await page.wait_for_function("tileAlphas('projectSlope')?.[1]>0")
  for theme in ['day','dark']:
   for w,h in [(320,568),(390,800),(568,320),(800,600)]:
    await page.set_viewport_size({'width':w,'height':h});await page.evaluate("t=>{document.documentElement.dataset.fieldTheme=t;document.querySelector('#fixture-project').style.display='block'}",theme)
    await b.bounds(page,'#brec',w,h);box=await page.locator('#brec').bounding_box();assert box['width']<=w/2 and box['height']<=60,box
    assert await page.locator('#fixture-project').evaluate('(e)=>e.scrollWidth<=e.clientWidth+1')
    await page.screenshot(path=str(b.OUT/f'project-terrain-{theme}-{w}-{h}.png'))
    await page.evaluate("document.querySelector('#fixture-project').style.display='none';_openLayerSheet();_lsTab('inst')")
    await b.bounds(page,'#layer-sheet',w,h);assert await page.locator('#installed-local-count').inner_text()=='3 karata na telefonu'
    assert await page.locator('#layer-sheet').evaluate('(e)=>e.scrollWidth<=e.clientWidth+1')
    await page.screenshot(path=str(b.OUT/f'installed-maps-{theme}-{w}-{h}.png'))
    await page.evaluate('closeLayerSheet();openMapFavs()');await b.bounds(page,'#mapfav-box',w,h)
    await page.screenshot(path=str(b.OUT/f'favorite-maps-{theme}-{w}-{h}.png'));await page.evaluate('closeMapFavs()')
  await page.set_viewport_size({'width':390,'height':800});await page.evaluate('openMapFavs()')
  await page.locator('[data-fav-action=open]').first.click();assert await page.evaluate('_sqlLayers[0].visible')
  # Oblik iz Cache Storage i lokalna geometrija preživita reload bez mreže.
  await page.context.set_offline(True);await page.reload();await page.evaluate('terrainReady');await page.wait_for_function("tileAlphas('projectSlope')?.[1]>0")
  assert await page.evaluate('ProjectTerrain.dataFor().ring.length')==4
  assert await page.locator('#project-terrain-slope').is_checked()
  # Zastarjela potvrda brisanja nema pravo ukloniti poligon drugog projekta.
  await page.evaluate("window.confirmWait=null;confirmHook=()=>new Promise(r=>confirmWait=r);window.deleteWait=ProjectTerrain.del();_aktivniProjektId='Q';ProjectTerrain.refresh();confirmWait(true)")
  await page.evaluate('deleteWait');await page.evaluate("_aktivniProjektId='P';ProjectTerrain.refresh()")
  assert await page.evaluate('ProjectTerrain.dataFor().ring.length')==4
  assert not errors,errors;await browser.close()
 print('OK: poligon, undo/cancel/quota, odvajanje projekta/naloga, PNG DEM, >30% i maska, reload bez mreže; instalirane/omiljene; 24 PNG')
if __name__=='__main__':asyncio.run(main())
