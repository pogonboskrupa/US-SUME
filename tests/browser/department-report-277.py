"""Puni app, pravi DEM PNG/worker/Leaflet/IDB; ručni višestruki izbor i restart."""
import asyncio,importlib.util,mimetypes,os,json,math,struct,zlib
from pathlib import Path
from playwright.async_api import async_playwright
ROOT=Path(__file__).resolve().parents[2]
spec=importlib.util.spec_from_file_location('boundary',Path(__file__).with_name('doznaka-project-boundary-276.py'));b=importlib.util.module_from_spec(spec);spec.loader.exec_module(b)
OUT=ROOT/'outputs/277';OUT.mkdir(parents=True,exist_ok=True)
A='11111111-1111-4111-8111-111111111111';B='22222222-2222-4222-8222-222222222222'
def tile(z,x,y):
 n=256*2**z;origin=(16+180)/360*n;split=.004/360*n
 lat=math.radians(44.902);metres=math.cos(lat)*156543.03392/2**z;raw=bytearray()
 for py in range(256):
  raw.append(0)
  for px in range(256):
   gx=x*256+px-origin;v=800+metres*(min(gx,split)*.15+max(0,gx-split)*.45)+32768
   whole=int(v);raw.extend((whole//256,whole%256,int((v-whole)*256),255))
 def chunk(t,d):return struct.pack('>I',len(d))+t+d+struct.pack('>I',zlib.crc32(t+d)&0xffffffff)
 return b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('>IIBBBBB',256,256,8,6,0,0,0))+chunk(b'IDAT',zlib.compress(raw))+chunk(b'IEND',b'')
async def main():
 async with async_playwright() as p:
  browser=await p.chromium.launch(executable_path=os.environ.get('UI_CHROMIUM') or None)
  ctx=await browser.new_context(service_workers='block',viewport={'width':390,'height':800});errors=[];writes=[];dem=[]
  async def route(r):
   url=r.request.url
   if 'elevation-tiles-prod/terrarium/' in url:
    z,x,y=url.rsplit('/',3)[1:];dem.append(url);await r.fulfill(content_type='image/png',body=tile(int(z),int(x),int(y.split('.')[0])),headers={'Access-Control-Allow-Origin':'*'});return
   if not url.startswith('https://device.test/'):
    if r.request.method not in ['GET','HEAD']:writes.append(url)
    await r.abort();return
   name=url.split('device.test/',1)[1].split('?',1)[0] or 'index.html';f=ROOT/name
   if name=='GRANICE.kml':await r.fulfill(content_type='application/xml',body='<kml><Document/></kml>')
   elif f.is_file():await r.fulfill(content_type=mimetypes.guess_type(str(f))[0] or 'application/octet-stream',body=f.read_bytes())
   else:await r.fulfill(status=404,body='fixture')
  await ctx.route('**/*',route);await ctx.route_web_socket('**/*',lambda ws:ws.close())
  await ctx.add_init_script("""Object.defineProperty(navigator,'onLine',{get:()=>false,configurable:true});navigator.geolocation.watchPosition=()=>1;navigator.geolocation.clearWatch=()=>{};
   const uid='11111111-1111-4111-8111-111111111111';localStorage.setItem('tvlake_ol_profile',JSON.stringify({ts:Date.now(),data:{id:uid,odobren:true,sumarija:'TEST',ime:'Adnan',prezime:'Mahmic'}}));localStorage.setItem('tvlake_device_last_user',uid);""")
  page=await ctx.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
  await page.goto('https://device.test/');await page.wait_for_function('_startupRestore._done&&!!window.DepartmentReport')
  await page.evaluate("""()=>{sbUser={id:'11111111-1111-4111-8111-111111111111'};sbProfile={id:sbUser.id,odobren:true,sumarija:'TEST'};_revealApp();sbLoadProfile=async()=>{};sbInitData=async()=>{};sbLoadProjekti=async()=>{};sb={auth:{signOut:async()=>({error:null})}};}""")
  assert await page.locator('#project-polygon-context').count()==0,'Poligon i teren su premješteni iz Projekta'
  await page.evaluate("""async()=>{if(!crypto.randomUUID)crypto.randomUUID=()=>Math.random().toString(16).slice(2);const poly=(a,c)=>`<Placemark><name>Ne preuzimaj ovaj atribut</name><Polygon><outerBoundaryIs><LinearRing><coordinates>${a},44.9 ${c},44.9 ${c},44.904 ${a},44.904 ${a},44.9</coordinates></LinearRing></outerBoundaryIs></Polygon></Placemark>`;const kml='<kml><Document>'+poly(16,16.004)+poly(16.004,16.008)+'</Document></kml>';await _localLayerKml('GRANICE.kml',kml,sbUser.id,{id:'github-kml-27709',size:kml.length});map.setView([44.902,16.004],16,{animate:false});_dozCreateBoundary=null;_dozCreateGj='Doznaka nije mijenjana';_dozCreateOdjel='987';}""")
  await page.locator('#menu-btn').click();await page.locator('#menu-department-report').click();await page.locator('#department-report').wait_for(state='visible')
  await page.get_by_role('button',name='Izaberi iz Granica',exact=True).click()
  assert not await page.locator('#department-report').is_visible()
  await page.evaluate("map.fire('click',{latlng:L.latLng(44.902,16.002)});map.fire('click',{latlng:L.latLng(44.902,16.006)});DoznakaProjectBoundary.openPicker()")
  assert await page.evaluate('_dozKmlSelLayers.length')==2
  await page.locator('#doz-picker-confirm').click();await page.wait_for_function('DepartmentReport.snapshot().state.count===2')
  await page.locator('#department-report').wait_for(state='visible')
  assert await page.evaluate("_dozCreateBoundary===null&&_dozCreateGj==='Doznaka nije mijenjana'&&_dozCreateOdjel==='987'")
  await page.locator('#dr-name').fill('Odjel 105 · ručni izbor');await page.locator('#dr-name').dispatch_event('change')
  old=await page.evaluate('JSON.stringify(DepartmentReport.snapshot().state.geometry)')
  await page.get_by_role('button',name='Izaberi iz Granica',exact=True).click();await page.evaluate('DoznakaProjectBoundary.cancel()')
  assert await page.evaluate('JSON.stringify(DepartmentReport.snapshot().state.geometry)')==old
  # Stvarni map klik i undo; odustajanje i nedostatak prostora čuvaju staru granicu.
  await page.get_by_role('button',name='Nacrtaj granicu',exact=True).click()
  await page.locator('#map').click(position={'x':100,'y':180});assert '1 tačaka' in await page.locator('#dr-draw-count').inner_text()
  await page.get_by_role('button',name='Vrati tačku',exact=True).click();assert '0 tačaka' in await page.locator('#dr-draw-count').inner_text()
  await page.evaluate("()=>{[[44.9,16],[44.9,16.003],[44.903,16.003]].forEach(ll=>DepartmentReport.addPoint(L.latLng(ll)));window.realSet=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k.startsWith('tvlake_department_report'))throw Error('full');return realSet.call(this,k,v)} }")
  await page.get_by_role('button',name='Sačuvaj granicu',exact=True).click()
  assert await page.evaluate('DepartmentReport.isDrawing()');assert await page.evaluate('JSON.stringify(DepartmentReport.snapshot().state.geometry)')==old
  await page.evaluate('Storage.prototype.setItem=realSet;DepartmentReport.cancelDraw()')
  await page.locator('#department-report').wait_for(state='visible')
  # Pravi PNG dekoder i Worker, bez blokiranja UI; svi DEM fetch upisi su izolovani.
  await page.evaluate('_mrezaProbaj=()=>true;_netDozvoliZahtjev=()=>true;window.framesWhileReport=0;window.frameReport=true;requestAnimationFrame(function frame(){if(frameReport){framesWhileReport++;requestAnimationFrame(frame)}})')
  await page.locator('#dr-calculate').click();await page.wait_for_function('!DepartmentReport.snapshot().busy');assert await page.evaluate('!!DepartmentReport.snapshot().result'),{'status':await page.locator('#dr-status').inner_text(),'errors':errors}
  stats=await page.evaluate('frameReport=false;DepartmentReport.snapshot().result.stats')
  assert await page.evaluate('framesWhileReport')>2
  assert stats['coverage']==100 and stats['slopeCoverage']==100,stats
  assert stats['slope'][1]['percent']>20 and stats['slope'][4]['percent']>20,stats
  assert stats['aspect'][3]['percent']>99 and len(stats['aspect'])==4,stats
  assert stats['min']<stats['mean']<stats['max']
  assert await page.locator('#dr-view').is_enabled() and await page.locator('#dr-remove').is_enabled()
  assert await page.evaluate('DepartmentReport.snapshot().result.edges.length')>0
  assert '%' in await page.locator('#dr-terrain-summary').inner_text() and '°' not in await page.locator('#dr-result').inner_text()
  for theme in ['day','dark']:
   for w,h in [(320,568),(390,800),(800,480)]:
    await page.set_viewport_size({'width':w,'height':h});await page.evaluate('(t)=>{document.documentElement.dataset.fieldTheme=t}',theme);await page.wait_for_timeout(100)
    bad=await page.evaluate(b.AUDIT,'#department-report');assert not bad,{'theme':theme,'bad':bad}
    assert await page.evaluate("document.querySelector('.dr-body').scrollWidth<=document.querySelector('.dr-body').clientWidth+1")
    await page.screenshot(path=str(OUT/f'department-report-{theme}-{w}.png'))
  await page.set_viewport_size({'width':390,'height':800});await page.locator('#dr-view').click();await page.wait_for_timeout(300)
  assert await page.evaluate("Object.keys(map._layers).map(i=>map._layers[i]).some(l=>l.options?.pane==='departmentReport'&&l._tiles&&Object.values(l._tiles).some(t=>{const data=t.el.getContext('2d').getImageData(0,0,256,256).data;return data.some((v,i)=>i%4===3&&v>0)}))")
  await page.screenshot(path=str(OUT/'department-report-map.png'))
  # Snimljen izračun i opcije dostupni su odmah poslije restarta, bez DEM zahtjeva.
  await page.evaluate("async()=>{await DepartmentReport.open();DepartmentReport.change('mode','aspect');DepartmentReport.change('lines',false);DepartmentReport.change('visible',false)}")
  calls=len(dem);await page.reload();await page.wait_for_function('_startupRestore._done&&!!window.DepartmentReport')
  await page.wait_for_function('!!DepartmentReport.snapshot().result')
  await page.evaluate('DepartmentReport.open()')
  assert len(dem)==calls,'Ponovno otvaranje izvještaja ne smije zahtijevati mrežu'
  saved=await page.evaluate('DepartmentReport.snapshot().state');assert saved['mode']=='aspect' and not saved['lines'] and not saved['visible'] and saved['name']=='Odjel 105 · ručni izbor',saved
  assert await page.evaluate('DepartmentReport.snapshot().result.stats.mean')==stats['mean']
  # Prekid za vrijeme rada Workera mora odmah osloboditi novi izračun.
  await page.evaluate("""()=>{_mrezaProbaj=()=>false;window.NativeWorker=Worker;window.stalled=[];window.Worker=class{constructor(){stalled.push(this)}postMessage(){}terminate(){this.stopped=true}};window.cancelledReport=DepartmentReport.calculate();}""")
  await page.wait_for_function('stalled.length===1');await page.evaluate('DepartmentReport.cancelCalculation();Worker=NativeWorker;cancelledReport')
  assert await page.evaluate('stalled[0].stopped&&!DepartmentReport.snapshot().busy')
  # Izračun ponovo radi offline iz stvarnog Cache Storage-a.
  await page.evaluate('DepartmentReport.calculate()');assert len(dem)==calls
  assert await page.evaluate('!!DepartmentReport.snapshot().result&&!DepartmentReport.snapshot().busy')
  # Nedostajući DEM čuva zadnji ispravan rezultat i ne pretvara teren u ravan.
  await page.evaluate("window.getTileOriginal=_getTerrariumTile;_getTerrariumTile=async()=>null;DepartmentReport.calculate()")
  assert await page.evaluate('DepartmentReport.snapshot().result.stats.mean')==stats['mean']
  assert 'Nema sačuvanog DEM-a' in await page.locator('#dr-status').inner_text()
  await page.evaluate("DepartmentReport.reset();sbUser={id:'22222222-2222-4222-8222-222222222222'};DepartmentReport.open()")
  assert await page.evaluate('!DepartmentReport.snapshot().state.geometry&&!DepartmentReport.snapshot().result')
  assert not errors,errors;assert not writes,writes
  (OUT/'department-report.json').write_text(json.dumps({'passed':True,'stats':stats,'dem_requests':calls,'errors':errors,'external_writes':writes},indent=2))
  await ctx.close();await browser.close()
 print('PASS: Izvještaj odjela, ručni odsjeci/crtanje, 6 razreda/4 strane/DEM PNG Worker, karta/linije, 6 prikaza, IDB restart/offline/cancel i izdvajanje naloga')
if __name__=='__main__':asyncio.run(main())
