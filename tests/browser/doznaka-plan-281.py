"""Stvarni app/DEM PNG/Worker/Leaflet/IDB: izohipsna projekcija i izolacija stvarne doznake."""
import asyncio,importlib.util,mimetypes,os,json,math,struct,zlib
from pathlib import Path
from playwright.async_api import async_playwright
ROOT=Path(__file__).resolve().parents[2];OUT=ROOT/'outputs/281';OUT.mkdir(parents=True,exist_ok=True)
spec=importlib.util.spec_from_file_location('boundary',Path(__file__).with_name('doznaka-project-boundary-276.py'));b=importlib.util.module_from_spec(spec);spec.loader.exec_module(b)
def tile(z,x,y):
 n=256*2**z;rad=math.pi/180;R=6371000;raw=bytearray()
 for py in range(256):
  raw.append(0);lat=math.atan(math.sinh(math.pi*(1-2*(y*256+py)/n)))/rad;my=(lat-44.9)*R*rad
  for px in range(256):
   lon=(x*256+px)/n*360-180;mx=(lon-16)*R*rad*math.cos(44.9*rad);v=500+.4*my+8*math.sin(mx/80)+32768;whole=int(v)
   raw.extend((whole//256,whole%256,int((v-whole)*256),255))
 def chunk(t,d):return struct.pack('>I',len(d))+t+d+struct.pack('>I',zlib.crc32(t+d)&0xffffffff)
 return b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('>IIBBBBB',256,256,8,6,0,0,0))+chunk(b'IDAT',zlib.compress(raw))+chunk(b'IEND',b'')
SETUP="""async()=>{sbUser={id:'11111111-1111-4111-8111-111111111111'};sbProfile={id:sbUser.id,odobren:true,sumarija:'TEST'};_revealApp();sbInitData=async()=>{};sb={auth:{signOut:async()=>({error:null})}};_dozOdjeli=[{id:'PLAN',name:'RISOVAC · 105',boundary_geojson:{type:'Polygon',coordinates:[[[16,44.9],[16.004,44.9],[16.004,44.9015],[16,44.9015],[16,44.9]]]}},{id:'OTHER',name:'Drugi odjel'}];_dozSelId='PLAN';_mrezaProbaj=()=>true;_netDozvoliZahtjev=()=>true;await DoznakaPlan.sync();}"""
async def main():
 async with async_playwright() as p:
  browser=await p.chromium.launch(executable_path=os.environ.get('UI_CHROMIUM') or None);ctx=await browser.new_context(service_workers='block',viewport={'width':390,'height':800});errors=[];writes=[];dem=[]
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
  await ctx.add_init_script("""Object.defineProperty(navigator,'onLine',{get:()=>false,configurable:true});navigator.geolocation.watchPosition=()=>1;navigator.geolocation.clearWatch=()=>{};const id='11111111-1111-4111-8111-111111111111';localStorage.setItem('tvlake_ol_profile',JSON.stringify({ts:Date.now(),data:{id,odobren:true,sumarija:'TEST',ime:'Adnan',prezime:'Mahmic'}}));localStorage.setItem('tvlake_device_last_user',id);""")
  page=await ctx.new_page();page.on('pageerror',lambda e:errors.append(str(e)+' '+e.stack));await page.goto('https://device.test/');await page.wait_for_function('_startupRestore._done&&!!window.DoznakaPlan');await page.evaluate(SETUP)
  await page.evaluate('DoznakaPlan.open()');await page.locator('#doz-plan-modal').wait_for(state='visible')
  await page.locator('#dp-width-choice').select_option('custom');await page.locator('#dp-width').fill('12.5');await page.locator('#dp-width').dispatch_event('change');assert await page.locator('#dp-width-custom-row').is_visible()
  await page.locator('#dp-width-choice').select_option('15');await page.locator('#dp-crew').fill('3');await page.locator('#dp-crew').dispatch_event('change');await page.locator('#dp-pace').fill('2');await page.locator('#dp-pace').dispatch_event('change')
  await page.get_by_role('textbox',name='Naziv projektanta 1',exact=True).fill('Projektant A');await page.get_by_role('textbox',name='Naziv projektanta 1',exact=True).dispatch_event('change')
  await page.get_by_label('Boja projektanta 1',exact=True).fill('#a32132');await page.get_by_label('Boja projektanta 1',exact=True).dispatch_event('change')
  before=await page.evaluate('JSON.stringify({tracks:_dozTracks,marks:_dozMarkings,boundary:_dozOdjeli[0].boundary_geojson})')
  await page.evaluate('window.planFrames=0;window.planFrameOn=true;requestAnimationFrame(function frame(){if(planFrameOn){planFrames++;requestAnimationFrame(frame)}})')
  await page.locator('#dp-calculate').click();await page.wait_for_function('!DoznakaPlan.snapshot().busy');r=await page.evaluate('planFrameOn=false;DoznakaPlan.snapshot().result');assert r,await page.locator('#dp-status').inner_text();assert await page.evaluate('planFrames')>2
  assert not r['stats']['flat'] and len(r['bands'])>10 and r['daysNeeded']>=3,r['stats'];assert r['passes'][1]['slots'][0]['person']==2 and r['passes'][1]['slots'][0]['guide']
  assert abs(r['stats']['areaHa']-r['stats']['coveredHa'])<1e-7
  assert await page.evaluate('JSON.stringify({tracks:_dozTracks,marks:_dozMarkings,boundary:_dozOdjeli[0].boundary_geojson})')==before
  assert 'praćenja' in (await page.locator('#dp-days').inner_text()).lower();assert 'prethodni pojas' in await page.locator('#dp-pass-list').inner_text()
  for theme in ['day','dark']:
   for w,h in [(320,568),(390,800),(800,480)]:
    await page.set_viewport_size({'width':w,'height':h});await page.evaluate('(t)=>document.documentElement.dataset.fieldTheme=t',theme)
    assert not await page.evaluate(b.AUDIT,'#doz-plan-modal'),await page.evaluate(b.AUDIT,'#doz-plan-modal')
    assert await page.locator('#doz-plan-modal .dr-body').evaluate('(e)=>e.scrollWidth<=e.clientWidth+1')
    await page.locator('#doz-plan-modal .dr-body').evaluate('(e)=>e.scrollTop=0');await page.screenshot(path=str(OUT/f'plan-{theme}-{w}.png'))
    await page.locator('#dp-result').scroll_into_view_if_needed();await page.screenshot(path=str(OUT/f'plan-result-{theme}-{w}.png'))
  await page.set_viewport_size({'width':390,'height':800});await page.locator('#dp-day').select_option('2');await page.locator('#dp-view').click();assert await page.locator('.dp-map-legend').is_visible()
  assert await page.evaluate("Object.values(map._layers).some(l=>l.options?.pane==='doznakaPlan'&&l.options.dashArray)")
  await page.wait_for_timeout(150)
  assert await page.locator('.dp-band-label').evaluate_all('(els)=>{const b=els.map(e=>e.getBoundingClientRect());return b.every((p,i)=>b.slice(i+1).every(q=>p.right<=q.left||q.right<=p.left||p.bottom<=q.top||q.bottom<=p.top))}')
  for theme in ['day','dark']:
   await page.evaluate('(t)=>document.documentElement.dataset.fieldTheme=t',theme)
   assert not await page.evaluate(b.AUDIT,'.dp-map-legend'),await page.evaluate(b.AUDIT,'.dp-map-legend')
   await page.screenshot(path=str(OUT/f'plan-map-{theme}.png'))
  await page.get_by_role('button',name='Minimiziraj ili proširi legendu plana',exact=True).click();assert not await page.locator('.dp-map-legend .dr-legend-body').is_visible()
  await page.get_by_role('button',name='Sakrij plan s karte',exact=True).click();assert await page.locator('.dp-map-legend').count()==0
  calls=len(dem);await page.reload();await page.wait_for_function('_startupRestore._done&&!!window.DoznakaPlan');await page.evaluate(SETUP);assert await page.evaluate('!!DoznakaPlan.snapshot().result')
  saved=await page.evaluate('DoznakaPlan.snapshot().prefs');assert saved['day']==2 and not saved['visible'] and saved['legendMin'] and saved['people']['0']['name']=='Projektant A' and saved['people']['0']['color']=='#a32132',saved
  assert len(dem)==calls;assert await page.locator('.dp-map-legend').count()==0
  # Stvarni odsjeci iz KML-a, bez upisa ili izmjene granice projekta.
  await page.evaluate("""async()=>{const poly=(a,c)=>`<Placemark><name>Atribut ne koristimo</name><Polygon><outerBoundaryIs><LinearRing><coordinates>${a},44.9 ${c},44.9 ${c},44.9015 ${a},44.9015 ${a},44.9</coordinates></LinearRing></outerBoundaryIs></Polygon></Placemark>`;const kml='<kml><Document>'+poly(16,16.002)+poly(16.002,16.004)+'</Document></kml>';await _localLayerKml('GRANICE.kml',kml,sbUser.id,{id:'github-kml-281',size:kml.length});GithubLayers.onlyPolygon(true);map.setView([44.9007,16.002],17,{animate:false});await DoznakaPlan.open();}""")
  await page.get_by_role('button',name='Izaberi odsjeke iz Granica',exact=True).click();await page.evaluate("map.fire('click',{latlng:L.latLng(44.9007,16.001)});map.fire('click',{latlng:L.latLng(44.9007,16.003)});DoznakaProjectBoundary.openPicker()")
  assert await page.evaluate('_dozKmlSelLayers.length')==2;await page.locator('#doz-picker-confirm').click();await page.wait_for_function('DoznakaPlan.snapshot().prefs.count===2')
  assert await page.locator('#doz-plan-modal').is_visible();assert await page.evaluate('!map.hasLayer(kmlLs[0].grp)');assert await page.evaluate('JSON.stringify({tracks:_dozTracks,marks:_dozMarkings,boundary:_dozOdjeli[0].boundary_geojson})')==before
  geometry=await page.evaluate('JSON.stringify(DoznakaPlan.snapshot().prefs.geometry)');await page.get_by_role('button',name='Izaberi odsjeke iz Granica',exact=True).click();await page.evaluate('DoznakaProjectBoundary.cancel()');assert await page.evaluate('JSON.stringify(DoznakaPlan.snapshot().prefs.geometry)')==geometry
  await page.evaluate('_mrezaProbaj=()=>false;DoznakaPlan.calculate()');assert len(dem)==calls;assert await page.evaluate('!!DoznakaPlan.snapshot().result')
  # Otkazivanje Workera i promjena projekta ne dopuštaju stari rezultat u novom odjelu.
  await page.evaluate("""()=>{window.RealWorker=Worker;window.stalled=[];window.Worker=class{constructor(){stalled.push(this)}postMessage(){}terminate(){this.stopped=true}};window.pendingPlan=DoznakaPlan.calculate();}""")
  await page.wait_for_function('stalled.length===1');await page.evaluate("async()=>{_dozSelId='OTHER';await DoznakaPlan.sync();Worker=RealWorker;await pendingPlan}");assert await page.evaluate('stalled[0].stopped&&!DoznakaPlan.snapshot().busy&&!DoznakaPlan.snapshot().result')
  await page.evaluate("async()=>{_dozSelId='PLAN';await DoznakaPlan.sync();await DoznakaPlan.open()}");assert await page.evaluate('!!DoznakaPlan.snapshot().result')
  await page.evaluate('window.getTileSaved=_getTerrariumTile;_getTerrariumTile=async()=>null;DoznakaPlan.calculate()');assert await page.evaluate('!!DoznakaPlan.snapshot().result');assert 'Nema sačuvanog DEM-a' in await page.locator('#dp-status').inner_text();await page.evaluate('_getTerrariumTile=getTileSaved')
  await page.evaluate("async()=>{sbUser={id:'22222222-2222-4222-8222-222222222222'};await DoznakaPlan.sync()}");assert await page.evaluate('!DoznakaPlan.snapshot().result&&!DoznakaPlan.snapshot().prefs.people')
  await page.evaluate("async()=>{sbUser={id:'11111111-1111-4111-8111-111111111111'};await DoznakaPlan.sync();await doLogout()}");assert await page.evaluate('!DoznakaPlan.snapshot().current&&!DoznakaPlan.snapshot().result');assert await page.locator('.dp-map-legend').count()==0
  assert not errors,errors;assert not writes,writes
  (OUT/'plan.json').write_text(json.dumps({'passed':True,'stats':r['stats'],'bands':len(r['bands']),'days':r['daysNeeded'],'dem_requests':calls,'errors':errors,'external_writes':writes},indent=2));await ctx.close();await browser.close()
 print('PASS: DEM PNG/Worker, izohipse/rotacija, 6 prikaza i kontrast, ručni odsjeci, IDB restart/offline/cancel, izolacija projekta/naloga i stvarne doznake')
if __name__=='__main__':asyncio.run(main())
