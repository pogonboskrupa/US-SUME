"""Stvarne raster pločice/worker: bijeli uzorak, pregled u svim listama i offline cache."""
import asyncio,importlib.util,math,mimetypes,os,sqlite3,struct,tempfile,zlib
from pathlib import Path
from playwright.async_api import async_playwright
ROOT=Path(__file__).resolve().parents[2]
spec=importlib.util.spec_from_file_location('load',Path(__file__).with_name('load-map-233.py'));f=importlib.util.module_from_spec(spec);spec.loader.exec_module(f);b=f.b
extra='<section id="preview-test" style="position:fixed;inset:10px;z-index:999999;background:var(--field-card);overflow:auto;padding:12px;box-sizing:border-box"><h3>Offline karte</h3><small id="ls-offline-count"></small><div id="ls-sqlite-in-grid" class="offline-map-list"></div><div id="ls-pane-inst"><div id="installed-local-list"></div></div><div id="mapfav-grid"></div></section>'
html=f.fixture.replace('</body>',extra+'<script>const _mapLoadDiagStep=()=>{},_mapLoadDiagName=()=>{},_mapLoadDiagFinish=()=>{},_mapRestoreIndicatorHide=()=>{},_mapRestoreIndicatorShownAt=null;</script><script>'+b.function('_mapFavThumbHtml')+'</script><script src="/static/js/map-catalog.js"></script></body>')
def white():
 def chunk(k,d):return struct.pack('>I',len(d))+k+d+struct.pack('>I',zlib.crc32(k+d))
 return b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('>2I5B',256,256,8,6,0,0,0))+chunk(b'IDAT',zlib.compress((b'\0'+b'\xff'*1024)*256))+chunk(b'IEND',b'')
async def main():
 out=ROOT/'outputs/ui-preview';out.mkdir(parents=True,exist_ok=True)
 with tempfile.TemporaryDirectory() as d:
  path=Path(d)/'local.mbtiles';f.mbtiles(path)
  c=sqlite3.connect(path);x=math.floor((16+180)/360*2**14);y=math.floor((1-math.asinh(math.tan(math.radians(44.9)))/math.pi)/2*2**14)
  c.execute('UPDATE tiles SET tile_data=? WHERE tile_column=? AND tile_row=?',(white(),x,2**14-1-y));c.commit();c.close();payload=path.read_bytes();c=sqlite3.connect(path);c.execute('UPDATE tiles SET tile_data=?',(white(),));c.commit();c.close();all_white=path.read_bytes()
 async with async_playwright() as p:
  browser=await p.chromium.launch(**({'executable_path':os.environ['UI_CHROMIUM']} if os.environ.get('UI_CHROMIUM') else {}));page=await browser.new_page(viewport={'width':390,'height':800});errors=[];external=[];page.on('pageerror',lambda e:errors.append(str(e)))
  async def route(r):
   if r.request.url=='https://ui.test/':await r.fulfill(content_type='text/html',body=html)
   elif r.request.url.startswith('https://ui.test/static/'):
    path=ROOT/r.request.url.split('ui.test/',1)[1];await r.fulfill(content_type=mimetypes.guess_type(path)[0] or 'application/octet-stream',body=path.read_bytes())
   else:external.append(r.request.url);await r.abort()
  await page.route('**/*',route);await page.goto('https://ui.test/')
  await page.evaluate('document.getElementById("preview-test").style.display="none";openLoadMapScreen()')
  await page.locator('#loadmap-file-input').set_input_files({'name':'Topografska <105>.mbtiles','mimeType':'application/octet-stream','buffer':payload})
  await page.wait_for_function('_loadmapPending.length===1');await page.locator('#loadmap-confirm').click();await page.wait_for_function('_sqlLayers.length===1')
  await page.evaluate('_loadmapThumbQueue')
  # Regeneriši ranije bijelo sačuvano v2. Prvi uzorak je stvarno bijela pločica.
  await page.evaluate('''async()=>{const sl=_sqlLayers[0];sl.meta._preview=[14,''' +str(x)+','+str(y)+'''];
    const cv=document.createElement('canvas');cv.width=320;cv.height=180;const ctx=cv.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,320,180);
    localStorage.setItem('lm_thumb_'+sl.name,cv.toDataURL('image/jpeg'));localStorage.setItem('lm_thumb_v2_'+sl.name,'1');localStorage.removeItem('lm_thumb_v3_'+sl.name);
    _mapFavs=[{id:'a',type:'sqlite',sqliteId:sl.name,name:'Moja lokalna karta'}];window.reads=0;window.original=_sqlWCall;_sqlWCall=(msg,...args)=>{if(msg.type==='tile')reads++;return original(msg,...args)};
    document.getElementById('preview-test').style.display='block';MapCatalog.renderOffline();MapCatalog.renderInstalled();MapCatalog.renderFavorites();await _loadmapThumbQueue;
    }''')
  assert await page.evaluate('reads>1&&reads<=24'),await page.evaluate('reads')
  assert await page.evaluate('localStorage.getItem("lm_thumb_v3_"+_sqlLayers[0].name)==="1"')
  assert await page.locator('#preview-test img[data-map-preview]').count()==3
  for img in await page.locator('#preview-test img[data-map-preview]').all():assert (await img.get_attribute('src')).startswith('data:image/jpeg')
  assert await page.locator('.offline-map-card .installed-preview-tag').inner_text()=='Isječak karte'
  color=await page.evaluate('''async()=>{const bm=await createImageBitmap(await (await fetch(_loadmapThumbData(_sqlLayers[0].name))).blob());const cv=document.createElement('canvas');cv.width=320;cv.height=180;const ctx=cv.getContext('2d');ctx.drawImage(bm,0,0);const px=[...ctx.getImageData(160,90,1,1).data];bm.close();return px;}''')
  assert color[1]>color[0] and color[1]>color[2] and color[0]<230,color
  await page.evaluate('window.before=reads;MapCatalog.renderOffline();MapCatalog.renderInstalled();MapCatalog.renderFavorites();_loadmapThumbQueue');assert await page.evaluate('reads===before')
  for theme in ['day','dark']:
   await page.evaluate('(t)=>document.documentElement.dataset.fieldTheme=t',theme)
   for width,height in [(320,568),(390,800),(568,320),(1200,800)]:
    await page.set_viewport_size({'width':width,'height':height})
    assert await page.locator('.offline-map-card').evaluate('(e)=>e.scrollWidth<=e.clientWidth+1')
    assert await page.locator('.offline-map-card .installed-preview').evaluate('(e)=>e.clientWidth/e.clientHeight>1.6')
    await page.screenshot(path=str(out/f'offline-real-preview-{theme}-{width}.png'))
  # Karta sa svim bijelim pločicama: jasan rezervni prikaz, bez bijelog thumbnaila.
  await page.evaluate('document.getElementById("preview-test").style.display="none";openLoadMapScreen()')
  await page.locator('#loadmap-file-input').set_input_files({'name':'Bijela karta.mbtiles','mimeType':'application/octet-stream','buffer':all_white})
  await page.wait_for_function('_loadmapPending.length===1');await page.locator('#loadmap-confirm').click();await page.wait_for_function('_sqlLayers.length===2');await page.evaluate('_loadmapThumbQueue')
  assert await page.evaluate('!_loadmapThumbData(_sqlLayers[1].name)&&localStorage.getItem("lm_thumb_v3_"+_sqlLayers[1].name)==="empty"')
  # Pregled preživi pravi reload i ne traži mrežu/niti otvaranje sačuvanog fajla.
  saved_name=await page.evaluate('_sqlLayers[0].name')
  await page.reload();await page.evaluate('''window.old=_sqlWCall;_sqlWCall=(msg,...args)=>{if(msg.type==='tile')throw new Error('cache must not read');return old(msg,...args)};
    void 0''');await page.evaluate('(name)=>{_sqlRestoreFailed=[{name,deferred:true}];MapCatalog.renderOffline()}',saved_name)
  assert (await page.locator('.offline-map-card img').get_attribute('src')).startswith('data:image/jpeg')
  # Izabrana karta, providnost i redoslijed prežive stvarni restore iz IDB.
  await page.evaluate('(name)=>_loadmapShow(name)',saved_name)
  assert await page.evaluate('_sqlLayers.length===1&&_sqlLayers[0].visible')
  await page.evaluate('_sqlMapSetOpacity(_sqlLayers[0],35);_loadmapManageShown=[{name:_sqlLayers[0].name}];_loadmapZ(0,2)')
  z=await page.evaluate('_sqlLayers[0].layer.options.zIndex')
  await page.reload();await page.evaluate('sqlmapRestoreAll()')
  assert await page.evaluate('_sqlLayers.length===1&&_sqlLayers[0].visible&&_sqlLayers[0].layer.options.opacity===.35')
  assert await page.evaluate('_sqlLayers[0].layer.options.zIndex')==z
  await page.evaluate('_loadmapManageShown=[{name:_sqlLayers[0].name}];_loadmapDeactivate(0)')
  assert await page.evaluate('JSON.parse(localStorage.getItem("tvlake_last_map")).type==="none"')
  await page.reload();await page.evaluate('sqlmapRestoreAll()')
  assert await page.evaluate('_sqlLayers.every(sl=>!sl.visible)&&_sqlRestoreFailed.length===2')
  await page.evaluate('(name)=>_loadmapShow(name)',saved_name)
  assert await page.evaluate('_sqlLayers[0].layer.options.opacity===.35')
  assert not errors,errors
  assert not external,external
  await browser.close()
 print('Offline pregled: stvarne MBTiles/worker pločice, preskočena bijela slika, sve 3 liste, ograničena čitanja i reload bez mreže: OK')
if __name__=='__main__':asyncio.run(main())
