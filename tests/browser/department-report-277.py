"""Puni app, pravi DEM PNG/worker/Leaflet/IDB; ručni višestruki izbor i restart."""
import asyncio,importlib.util,mimetypes,os,json,math,struct,zlib
from pathlib import Path
from playwright.async_api import async_playwright
ROOT=Path(__file__).resolve().parents[2]
spec=importlib.util.spec_from_file_location('boundary',Path(__file__).with_name('doznaka-project-boundary-276.py'));b=importlib.util.module_from_spec(spec);spec.loader.exec_module(b)
OUT=ROOT/'outputs/282';OUT.mkdir(parents=True,exist_ok=True)
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
  # Samo za poligon je trajna postavka; obična vidljivost i stil ostaju netaknuti.
  await page.evaluate('GithubLayers.onlyPolygon(true)')
  assert await page.evaluate('kmlLs[0].onlyPolygon&&kmlLs[0].vis&&!map.hasLayer(kmlLs[0].grp)')
  assert await page.evaluate("JSON.parse(localStorage.getItem(_LOCAL_KML_KEY))['GRANICE.kml'].onlyPolygon")
  await page.locator('#menu-btn').click();await page.locator('#menu-department-report').click();await page.locator('#department-report').wait_for(state='visible')
  await page.evaluate('_mrezaProbaj=()=>true;_netDozvoliZahtjev=()=>true;window.framesWhileReport=0;window.frameReport=true;requestAnimationFrame(function frame(){if(frameReport){framesWhileReport++;requestAnimationFrame(frame)}})')
  await page.get_by_role('button',name='Izaberi poligon',exact=True).click()
  assert await page.evaluate('map.hasLayer(kmlLs[0].grp)')
  assert not await page.locator('#department-report').is_visible()
  await page.evaluate("map.fire('click',{latlng:L.latLng(44.902,16.002)});map.fire('click',{latlng:L.latLng(44.902,16.006)});DoznakaProjectBoundary.openPicker()")
  assert await page.evaluate('_dozKmlSelLayers.length')==2
  await page.locator('#doz-picker-confirm').click();await page.wait_for_function('DepartmentReport.snapshot().state.count===2')
  await page.locator('#department-report').wait_for(state='visible');await page.wait_for_function('!DepartmentReport.snapshot().busy&&!!DepartmentReport.snapshot().result')
  assert await page.locator('#dr-analysis-state').get_attribute('data-state')=='done','Potvrda izabranog poligona mora automatski završiti DEM analizu'
  assert not await page.locator('#dr-calculate').is_visible(),'Uspješan automatski izračun ne smije tražiti dodatni klik'
  assert await page.evaluate('!map.hasLayer(kmlLs[0].grp)')
  assert await page.evaluate("_dozCreateBoundary===null&&_dozCreateGj==='Doznaka nije mijenjana'&&_dozCreateOdjel==='987'")
  await page.locator('#dr-selection-editor>summary').click();await page.locator('#dr-name').fill('Odjel 105 · ručni izbor');await page.locator('#dr-name').dispatch_event('change')
  old=await page.evaluate('JSON.stringify(DepartmentReport.snapshot().state.geometry)')
  await page.get_by_role('button',name='Izaberi poligon',exact=True).click();await page.evaluate('DoznakaProjectBoundary.cancel()')
  assert await page.evaluate('JSON.stringify(DepartmentReport.snapshot().state.geometry)')==old
  # Stvarni map klik i undo; odustajanje i nedostatak prostora čuvaju staru granicu.
  await page.get_by_role('button',name='Nacrtaj poligon',exact=True).click()
  assert await page.evaluate('map.hasLayer(kmlLs[0].grp)')
  assert not await page.locator('#action-bar').is_visible() and not await page.locator('#tab-bar').is_visible(),'Crtanje ne smije istovremeno pokrenuti GPS alat'
  await page.locator('#map').click(position={'x':100,'y':180});assert '1 tačaka' in await page.locator('#dr-draw-count').inner_text()
  await page.get_by_role('button',name='Vrati tačku',exact=True).click();assert '0 tačaka' in await page.locator('#dr-draw-count').inner_text()
  await page.evaluate("()=>{[[44.9,16],[44.9,16.003],[44.903,16.003]].forEach(ll=>DepartmentReport.addPoint(L.latLng(ll)));window.realSet=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k.startsWith('tvlake_department_report'))throw Error('full');return realSet.call(this,k,v)} }")
  await page.get_by_role('button',name='Sačuvaj granicu',exact=True).click()
  assert await page.evaluate('DepartmentReport.isDrawing()');assert await page.evaluate('JSON.stringify(DepartmentReport.snapshot().state.geometry)')==old
  await page.evaluate('Storage.prototype.setItem=realSet;DepartmentReport.cancelDraw()')
  await page.locator('#department-report').wait_for(state='visible')
  assert await page.evaluate('!map.hasLayer(kmlLs[0].grp)')
  assert await page.locator('#action-bar').is_visible() and await page.locator('#tab-bar').is_visible()
  # I uspješno ručno crtanje odmah pokreće pravi PNG dekoder i Worker, bez dodatnog klika.
  before_manual=await page.evaluate('DepartmentReport.snapshot().state.calculatedAt')
  await page.get_by_role('button',name='Nacrtaj poligon',exact=True).click()
  await page.evaluate("()=>{[[44.9,16],[44.9,16.008],[44.904,16.008],[44.904,16]].forEach(ll=>DepartmentReport.addPoint(L.latLng(ll)))}")
  await page.get_by_role('button',name='Sačuvaj granicu',exact=True).click()
  await page.wait_for_function('(old)=>DepartmentReport.snapshot().state.calculatedAt!==old&&!DepartmentReport.snapshot().busy&&!!DepartmentReport.snapshot().result',arg=before_manual)
  assert await page.locator('#dr-analysis-state').get_attribute('data-state')=='done' and not await page.locator('#dr-calculate').is_visible()
  stats=await page.evaluate('frameReport=false;DepartmentReport.snapshot().result.stats')
  assert await page.evaluate('framesWhileReport')>2
  assert stats['coverage']==100 and stats['slopeCoverage']==100,stats
  assert stats['slope'][1]['percent']>20 and stats['slope'][4]['percent']>20,stats
  assert stats['aspect'][3]['percent']>99 and len(stats['aspect'])==4,stats
  assert stats['min']<stats['mean']<stats['max']
  assert await page.locator('#dr-view').is_enabled() and await page.locator('#dr-remove').is_enabled()
  assert await page.evaluate('DepartmentReport.snapshot().result.edgeBands.some(b=>b.paths.length)')
  assert await page.evaluate("DepartmentReport.snapshot().result.edgeBands.some(b=>b.paths.length)&&DepartmentReport.snapshot().result.edgeBands.every((b,i)=>b.color===['#789a39','#c2a036','#cf7532','#b94c4f','#78456e'][i])")
  assert await page.evaluate("Number(map.getPane('departmentReport').style.zIndex)>Number(getComputedStyle(map.getPane('overlayPane')).zIndex)&&map.getPane('departmentReport').style.pointerEvents==='none'")
  assert '%' in await page.locator('#dr-terrain-summary').inner_text() and '°' not in await page.locator('#dr-result').inner_text()
  profiles=await page.evaluate('DepartmentReport.snapshot().result.slopeProfiles')
  profile_info=await page.evaluate('DepartmentReport.snapshot().result.profileInfo')
  assert len(profiles)==profile_info['target'] and not profile_info['unavailable'],profile_info
  assert len(profiles)>5 and all(abs(p['percent']-p['drop']/p['distance']*100)<1e-8 for p in profiles)
  # Podtabovi skrivaju ostale rezultate, ne mijenjaju prikaz karte i ne računaju ponovo.
  assert not await page.locator('#dr-selection-editor').evaluate('(e)=>e.open')
  assert await page.locator('#dr-panel-overview').is_visible()
  assert 'Odjel 105' in await page.locator('#dr-selection').inner_text()
  assert not await page.locator('#dr-slopes').is_visible() and not await page.locator('#dr-aspects').is_visible()
  assert await page.locator('#dr-dist .dr-dist-row').count()==2 and 'Zapad' in await page.locator('#dr-kpi-aspect').inner_text()
  assert 'Strmije od 30%' in await page.locator('#dr-terrain-summary').inner_text()
  txt=await page.evaluate('DepartmentReport.reportText()');assert 'Odjel 105' in txt and txt.count('–')>=6 and '50% i više' in txt,txt
  assert await page.locator('#dr-slopes .dr-stat-zero').count()>0,'Razredi sa 0% su zbijeni'
  await page.locator('#dr-dist .dr-dist-row').first.click();assert await page.locator('#dr-panel-slope').is_visible();await page.locator('#dr-tab-overview').click()
  before_tabs=await page.evaluate('({mode:DepartmentReport.snapshot().state.mode,result:JSON.stringify(DepartmentReport.snapshot().result)})');tab_calls=len(dem)
  await page.locator('#dr-tab-slope').click()
  assert await page.locator('#dr-slopes .dr-stat-row').count()==6 and await page.locator('#dr-slopes').is_visible()
  assert not await page.locator('#dr-aspects').is_visible() and not await page.locator('#dr-elevation').is_visible()
  assert await page.locator('#dr-profile-toggle').is_checked()
  await page.locator('#dr-profile-list>summary').click()
  await page.wait_for_function('(n)=>document.querySelectorAll("#dr-profile-rows button").length===n',arg=len(profiles))
  assert 'Vodoravno' in await page.locator('#dr-profile-rows').inner_text()
  await page.locator('#dr-profile-list>summary').click()
  await page.evaluate("()=>{Storage.prototype.setItem=function(k,v){if(k.startsWith('tvlake_department_report'))throw Error('full');return realSet.call(this,k,v)}}")
  await page.locator('#dr-tab-aspect').click();assert await page.locator('#dr-panel-slope').is_visible(),'Ako nema prostora, zadrži prethodni sačuvani podtab'
  await page.evaluate('()=>{Storage.prototype.setItem=realSet}')
  await page.locator('#dr-tab-slope').press('ArrowRight')
  assert await page.locator('#dr-tab-aspect').evaluate('(e)=>e===document.activeElement&&e.tabIndex===0&&e.getAttribute("aria-selected")==="true"')
  assert await page.locator('#dr-aspects .dr-stat-row').count()==4 and await page.locator('#dr-aspects').is_visible()
  await page.locator('#dr-tab-aspect').press('Home');assert await page.locator('#dr-panel-overview').is_visible()
  await page.locator('#dr-tab-overview').press('ArrowLeft');assert await page.locator('#dr-panel-aspect').is_visible()
  await page.locator('#dr-tab-aspect').press('End');assert await page.locator('#dr-panel-aspect').is_visible()
  assert len(dem)==tab_calls and await page.evaluate('JSON.stringify(DepartmentReport.snapshot().result)')==before_tabs['result']
  assert await page.evaluate('DepartmentReport.snapshot().state.mode')==before_tabs['mode']
  for theme in ['day','dark']:
   for w,h in [(320,568),(390,800),(800,480)]:
    await page.set_viewport_size({'width':w,'height':h});await page.evaluate('(t)=>{document.documentElement.dataset.fieldTheme=t}',theme)
    for tab in ['overview','slope','aspect']:
     await page.locator('#dr-tab-'+tab).click()
     bad=await page.evaluate(b.AUDIT,'#department-report');assert not bad,{'theme':theme,'tab':tab,'bad':bad}
     assert await page.locator('#department-report .dr-body').evaluate('(e)=>e.scrollWidth<=e.clientWidth+1')
     assert await page.locator('#department-report [role=tabpanel]:visible').count()==1
     if tab=='overview':
      await page.locator('#dr-selection-editor>summary').click();await page.locator('#dr-map-settings>summary').click();await page.locator('.dr-source>summary').click()
      assert not await page.evaluate(b.AUDIT,'#department-report'),{'theme':theme,'expanded':await page.evaluate(b.AUDIT,'#department-report')}
      assert await page.locator('#department-report .dr-body').evaluate('(e)=>e.scrollWidth<=e.clientWidth+1')
      await page.locator('.dr-source>summary').click();await page.locator('#dr-map-settings>summary').click();await page.locator('#dr-selection-editor>summary').click()
     await page.locator('#dr-tab-'+tab).scroll_into_view_if_needed();await page.screenshot(path=str(OUT/f'department-report-{tab}-{theme}-{w}.png'))
  # Svaki podtab može izričito prikazati svoj sloj s odgovarajućom legendom.
  await page.locator('#dr-aspect-map').click();assert await page.evaluate('DepartmentReport.snapshot().state.mode')=='aspect'
  assert await page.locator('.dr-legend-body>div').count()==4
  await page.evaluate('DepartmentReport.open()');await page.locator('#dr-tab-slope').click();await page.locator('#dr-slope-map').click()
  assert await page.evaluate('DepartmentReport.snapshot().state.mode')=='slope' and await page.locator('.dr-legend-body>div').count()==6
  await page.evaluate('DepartmentReport.open()')
  await page.set_viewport_size({'width':390,'height':800});await page.locator('#dr-view').click();await page.wait_for_timeout(300)
  assert await page.evaluate("Object.keys(map._layers).map(i=>map._layers[i]).some(l=>l.options?.pane==='departmentReport'&&l._tiles&&Object.values(l._tiles).some(t=>{const data=t.el.getContext('2d').getImageData(0,0,256,256).data;return data.some((v,i)=>i%4===3&&v>0)}))")
  assert await page.evaluate("()=>{const expected=new Set(['#789a39','#c2a036','#cf7532','#b94c4f','#78456e']),lines=Object.values(map._layers).filter(l=>l.options?.pane==='departmentReport'&&l.getLatLngs);return lines.length>0&&lines.every(l=>expected.has(l.options.color))&&!lines.some(l=>l.options.color==='#243646')}")
  assert await page.locator('#dr-map-legend').is_visible()
  assert await page.locator('.dr-legend-body>div').count()==6
  # Dodir profila otvara visine, vodoravnu dužinu i provjerljivu formulu.
  await page.evaluate("()=>{const p=DepartmentReport.snapshot().result.slopeProfiles[0];DepartmentReport.viewProfile(p.id);map.closePopup()}")
  await page.wait_for_timeout(300)
  pos=await page.evaluate("()=>{const p=DepartmentReport.snapshot().result.slopeProfiles[0],ll=p.points[Math.floor(p.points.length/2)],at=map.latLngToContainerPoint(ll);return {x:at.x,y:at.y}}")
  await page.locator('#map').click(position=pos)
  assert await page.locator('.dr-profile-popup').is_visible()
  assert 'Vodoravna dužina:' in await page.locator('.dr-profile-popup').inner_text()
  assert 'Visinska razlika:' in await page.locator('.dr-profile-popup').inner_text()
  assert not await page.locator('#department-report').is_visible()
  for theme in ['day','dark']:
   await page.evaluate('(t)=>document.documentElement.dataset.fieldTheme=t',theme)
   assert not await page.evaluate(b.AUDIT,'.dr-profile-popup')
   await page.screenshot(path=str(OUT/f'department-profile-popup-{theme}.png'))

  await page.locator('.dr-profile-popup button').click();await page.locator('#dr-tab-slope').click()
  await page.locator('#dr-profile-toggle').uncheck()
  assert not await page.locator('.dr-profile-tile').count()
  await page.locator('#dr-profile-toggle').check();await page.locator('#dr-view').click()
  assert await page.locator('.dr-profile-tile').count()>0
  await page.evaluate('map.setView([44.902,16.004],16,{animate:false});setMapScale(10000)')
  await page.wait_for_timeout(300)
  await page.screenshot(path=str(OUT/'department-profiles-scale-10000.png'))

  # Stvarni SVG dodir otvara izvještaj, a ne izvorni KML. Legenda ne pomjera kartu.
  async def click_report():
   pos=await page.evaluate("()=>{const p=map.latLngToContainerPoint([44.9001,16.0079]);return {x:p.x,y:p.y}}")
   await page.locator('#map').click(position=pos)
   await page.locator('#department-report').wait_for(state='visible')
  await click_report()
  await page.locator('#dr-view').click();await page.wait_for_timeout(100)
  center=await page.evaluate('JSON.stringify(map.getCenter())')
  drag=page.locator('.dr-legend-drag');box=await drag.bounding_box()
  await page.mouse.move(box['x']+20,box['y']+20);await page.mouse.down();await page.mouse.move(box['x']+65,box['y']+120,steps=8);await page.mouse.up()
  moved=await page.evaluate('DepartmentReport.snapshot().state.legendPosition');assert moved and moved['y']>150,moved
  assert await page.evaluate('JSON.stringify(map.getCenter())')==center
  await page.get_by_role('button',name='Minimiziraj legendu',exact=True).click();assert not await page.locator('.dr-legend-body').is_visible()
  await page.get_by_role('button',name='Proširi legendu',exact=True).click();assert await page.locator('.dr-legend-body').is_visible()
  await page.get_by_role('button',name='Ugasi legendu',exact=True).click();assert await page.locator('#dr-map-legend').count()==0
  await click_report();await page.locator('#dr-map-settings>summary').click();await page.locator('#dr-legend-visible').check();await page.locator('#dr-visible').uncheck()
  assert await page.locator('#dr-map-legend').count()==0
  assert await page.evaluate("!Object.values(map._layers).some(l=>l.options?.pane==='departmentReportHit'&&l.getLatLngs)")
  await page.locator('#dr-visible').check();await page.locator('#dr-view').click()
  # Vlaka unutar izvještaja zadržava prednost na dodir i svoj pregled.
  await page.evaluate("()=>{window.oldSel=selI;window.oldVlPopup=showVlakaPopup;selI=()=>{};window.routeClicks=0;showVlakaPopup=()=>routeClicks++;const pts=[{la:44.9025,lo:16.005},{la:44.9025,lo:16.007}];window.testRoute={nm:'T999',pts,poly:L.polyline(pts.map(p=>[p.la,p.lo])).addTo(map)};vlake.push(testRoute)}")
  pos=await page.evaluate("()=>{const p=map.latLngToContainerPoint([44.9025,16.006]);return {x:p.x,y:p.y}}")
  await page.locator('#map').click(position=pos);assert await page.evaluate('routeClicks===1')
  assert not await page.locator('#department-report').is_visible()
  await page.evaluate('map.removeLayer(testRoute.poly);vlake.splice(vlake.indexOf(testRoute),1);selI=oldSel;showVlakaPopup=oldVlPopup')
  # Izbor odsjeka prolazi kroz poligon izvještaja; report ne presreće KML dodire.
  await page.evaluate('DepartmentReport.open()');await page.locator('#dr-selection-editor>summary').click();await page.get_by_role('button',name='Izaberi poligon',exact=True).click()
  assert await page.evaluate('map.hasLayer(kmlLs[0].grp)')
  pos=await page.evaluate("()=>{const p=map.latLngToContainerPoint([44.902,16.006]);return {x:p.x,y:p.y}}")
  await page.locator('#map').click(position=pos);assert await page.evaluate('_dozKmlSelLayers.length')==1
  await page.evaluate('DoznakaProjectBoundary.cancel()');assert await page.evaluate('!map.hasLayer(kmlLs[0].grp)')
  await page.locator('#dr-view').click()
  for theme in ['day','dark']:
   for w,h in [(320,568),(390,800),(800,480)]:
    await page.set_viewport_size({'width':w,'height':h});await page.evaluate('(t)=>{document.documentElement.dataset.fieldTheme=t;map.invalidateSize()}',theme);await page.wait_for_timeout(100)
    bad=await page.evaluate(b.AUDIT,'#dr-map-legend');assert not bad,{'theme':theme,'legend':bad}
    bounds=await page.locator('#dr-map-legend').bounding_box();assert bounds['x']>=0 and bounds['x']+bounds['width']<=w+1
    bottom=await page.locator('#action-bar').bounding_box();assert not bottom or bounds['y']+bounds['height']<=bottom['y']+1
    await page.screenshot(path=str(OUT/f'legend-{theme}-{w}.png'))
  await page.set_viewport_size({'width':390,'height':800});await page.wait_for_timeout(100)
  await page.screenshot(path=str(OUT/'department-report-map.png'))
  # Snimljen izračun i opcije dostupni su odmah poslije restarta, bez DEM zahtjeva.
  await page.evaluate("async()=>{await DepartmentReport.open();DepartmentReport.selectTab('aspect');DepartmentReport.change('mode','aspect');DepartmentReport.change('lines',false);DepartmentReport.change('profiles',false);DepartmentReport.change('visible',false);DepartmentReport.change('legendMin',true);DepartmentReport.change('legendVisible',false)}")
  calls=len(dem);await page.reload();await page.wait_for_function('_startupRestore._done&&!!window.DepartmentReport')
  await page.wait_for_function('!!DepartmentReport.snapshot().result')
  await page.evaluate('DepartmentReport.open()')
  assert await page.evaluate('kmlLs[0].onlyPolygon&&!map.hasLayer(kmlLs[0].grp)')
  assert await page.evaluate('!!DepartmentReport.snapshot().state.legendPosition')
  assert len(dem)==calls,'Ponovno otvaranje izvještaja ne smije zahtijevati mrežu'
  saved=await page.evaluate('DepartmentReport.snapshot().state');assert saved['mode']=='aspect' and not saved['lines'] and not saved['visible'] and saved['name']=='Odjel 105 · ručni izbor' and saved['legendMin'] and not saved['legendVisible'],saved
  assert await page.locator('#dr-tab-aspect').get_attribute('aria-selected')=='true' and await page.locator('#dr-panel-aspect').is_visible()
  assert not await page.locator('#dr-slopes').is_visible() and not await page.locator('#dr-panel-overview').is_visible()
  assert saved['tab']=='aspect' and not saved['profiles']
  assert await page.evaluate('DepartmentReport.snapshot().result.slopeProfiles')==profiles
  assert await page.evaluate('DepartmentReport.snapshot().result.stats.mean')==stats['mean']
  # Stari keš bez profila ostaje upotrebljiv offline; ne izmišlja se novi rezultat.
  await page.evaluate("""async()=>{window.profileReportBackup=DepartmentReport.snapshot().result;const legacy={...profileReportBackup};delete legacy.slopeProfiles;delete legacy.profileInfo;const k='tvlake_department_report_v1_'+encodeURIComponent(sbUser.id),geometry=DepartmentReport.snapshot().state.geometry;await _kmlcSave(k,{model:2,signature:JSON.stringify(geometry),result:legacy});DepartmentReport.reset();await DepartmentReport.open()}""")
  assert 'ponovi izračun' in await page.locator('#dr-profile-info').text_content()
  assert await page.locator('#dr-profile-toggle').is_disabled()
  assert await page.evaluate('DepartmentReport.snapshot().result.stats.mean')==stats['mean'] and len(dem)==calls
  await page.evaluate("""async()=>{const k='tvlake_department_report_v1_'+encodeURIComponent(sbUser.id),geometry=DepartmentReport.snapshot().state.geometry;await _kmlcSave(k,{model:2,signature:JSON.stringify(geometry),result:profileReportBackup});DepartmentReport.reset();await DepartmentReport.open()}""")
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
  assert 'Nema DEM podataka u memoriji' in await page.locator('#dr-status').inner_text()
  # Ručno crtanje granice Doznake: KML klik dodaje jednu tačku, ne otvara info.
  await page.evaluate("()=>{DepartmentReport.hide();window.oldCreate=dozShowCreateOdjel;dozShowCreateOdjel=()=>{};dozStartNewBoundaryDraw()}")
  await page.locator('#doz-draw-banner').wait_for(state='visible')
  await page.evaluate('()=>{map.invalidateSize({animate:false});map.setView([44.902,16.004],16,{animate:false});}')
  assert await page.evaluate('map.hasLayer(kmlLs[0].grp)')
  pos=await page.evaluate("()=>{const p=map.latLngToContainerPoint([44.902,16.006]);return {x:p.x,y:p.y}}")
  await page.locator('#map').click(position=pos);assert await page.evaluate('_dozDrawPts.length')==1
  await page.evaluate('dozCancelDraw();dozShowCreateOdjel=oldCreate;DepartmentReport.open()')
  assert await page.evaluate('!map.hasLayer(kmlLs[0].grp)')
  # Brisanje je trajno i uklanja legendu/poligon, a učitani KML ostaje.
  await page.evaluate("_dlgConfirm=async()=>true;DepartmentReport.remove()")
  assert await page.evaluate('!DepartmentReport.snapshot().state.geometry&&!DepartmentReport.snapshot().result&&kmlLs.length===1')
  assert await page.locator('#dr-map-legend').count()==0
  await page.reload();await page.wait_for_function('_startupRestore._done&&!!window.DepartmentReport')
  await page.evaluate('DepartmentReport.open()');assert await page.evaluate('!DepartmentReport.snapshot().state.geometry&&!DepartmentReport.snapshot().result')
  await page.evaluate("DepartmentReport.reset();sbUser={id:'22222222-2222-4222-8222-222222222222'};DepartmentReport.open()")
  assert await page.evaluate('!DepartmentReport.snapshot().state.geometry&&!DepartmentReport.snapshot().result')
  assert not errors,errors;assert not writes,writes
  (OUT/'department-report.json').write_text(json.dumps({'passed':True,'tabs':['overview','slope','aspect'],'layouts':18,'tab_restart':True,'stats':stats,'profile_info':profile_info,'profiles':profiles,'dem_requests':calls,'errors':errors,'external_writes':writes},indent=2))
  await ctx.close();await browser.close()
 print('PASS: Izvještaj odjela, ručni odsjeci/crtanje, 6 razreda/4 strane/DEM PNG Worker, karta/linije, 3 podtaba/18 prikaza/tastatura, IDB restart/offline/cancel i izdvajanje naloga')
if __name__=='__main__':asyncio.run(main())
