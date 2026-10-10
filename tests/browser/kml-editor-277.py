"""Puni app: prozirni klikabilni KML/SHP, stil/IDB restart i urednik na telefonu."""
import asyncio,importlib.util,mimetypes,os,json
from pathlib import Path
from playwright.async_api import async_playwright
ROOT=Path(__file__).resolve().parents[2]
spec=importlib.util.spec_from_file_location('boundary',Path(__file__).with_name('doznaka-project-boundary-276.py'));b=importlib.util.module_from_spec(spec);spec.loader.exec_module(b)
OUT=ROOT/'outputs/277';OUT.mkdir(parents=True,exist_ok=True)
KML='''<kml><Document><Placemark><name>Odjel 105</name><description><![CDATA[<table><tr><td>Odjel</td><td>105</td></tr><tr><td>Odsjek</td><td>a</td></tr></table><script>window.unsafeKml=true</script><p>Napomena s terena</p>]]></description><Polygon><outerBoundaryIs><LinearRing><coordinates>16,44.9 16.004,44.9 16.004,44.904 16,44.904 16,44.9</coordinates></LinearRing></outerBoundaryIs><innerBoundaryIs><LinearRing><coordinates>16.0014,44.9014 16.0026,44.9014 16.0026,44.9026 16.0014,44.9026 16.0014,44.9014</coordinates></LinearRing></innerBoundaryIs></Polygon></Placemark></Document></kml>'''
ROAD='<kml><Placemark><name>Put 1</name><LineString><coordinates>16,44.9 16.003,44.904</coordinates></LineString></Placemark></kml>'
async def main():
 async with async_playwright() as p:
  browser=await p.chromium.launch(executable_path=os.environ.get('UI_CHROMIUM') or None)
  ctx=await browser.new_context(service_workers='block',viewport={'width':390,'height':800});errors=[];writes=[]
  async def route(r):
   url=r.request.url
   if not url.startswith('http://device.test/'):
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
  await page.goto('http://device.test/');await page.wait_for_function('_startupRestore._done&&!!window.VlakaKeyboard')
  await page.evaluate("""()=>{sbUser={id:'11111111-1111-4111-8111-111111111111'};sbProfile={id:sbUser.id,odobren:true,sumarija:'TEST'};_revealApp();sbLoadProfile=async()=>{};sbInitData=async()=>{};sbLoadProjekti=async()=>{};sb={auth:{signOut:async()=>({error:null})}};}""")
  await page.evaluate("""async([poly,road])=>{if(!crypto.randomUUID)crypto.randomUUID=()=>Math.random().toString(16).slice(2);
   await _localLayerKml('GRANICE.kml',poly,sbUser.id,{id:'github-kml-27701',size:poly.length});await _localLayerKml('KAMIONSKI.PUTEVI.kml',road,sbUser.id,{id:'github-kml-27702',size:road.length});map.setView([44.902,16.002],16,{animate:false});openGraniceModal();}""",[KML,ROAD])
  assert await page.locator('.le-layer-card').count()==2
  assert await page.locator('.gl-group-name').all_text_contents()==['Granice odjela','Kamionski putevi']
  await page.locator('.le-library-heading').scroll_into_view_if_needed();await page.screenshot(path=str(OUT/'kml-files.png'))
  await page.locator('.le-layer-card[data-layer="0"]').get_by_role('button',name='Uredi stil',exact=True).click()
  for theme in ['day','dark']:
   for w,h in [(320,568),(390,800),(800,480)]:
    await page.set_viewport_size({'width':w,'height':h});await page.evaluate('(t)=>{document.documentElement.dataset.fieldTheme=t}',theme);await page.wait_for_timeout(250)
    bad=await page.evaluate(b.AUDIT,'#granice-list');assert not bad,{'theme':theme,'bad':bad,'vars':await page.evaluate("[...document.querySelectorAll('html,#granice-list,.gl-group-hdr')].map(e=>({tag:e.tagName,theme:document.documentElement.dataset.fieldTheme,bg:getComputedStyle(e).getPropertyValue('--field-bg'),style:e.getAttribute('style')}))")}
    assert await page.evaluate("document.getElementById('granice-list').scrollWidth<=document.getElementById('granice-list').clientWidth+1")
    await page.locator('.le-editor').scroll_into_view_if_needed();await page.screenshot(path=str(OUT/f'kml-editor-{theme}-{w}.png'))
  await page.set_viewport_size({'width':390,'height':800})
  controls=page.locator('#granice-list .le-editor')
  await controls.get_by_role('button',name='Obrub i ispuna',exact=True).click()
  await controls.get_by_label('Prilagođena boja',exact=True).fill('#dc2626');await controls.get_by_label('Prilagođena boja',exact=True).dispatch_event('change')
  await controls.get_by_label('Prilagođena boja ispune',exact=True).fill('#3b82f6');await controls.get_by_label('Prilagođena boja ispune',exact=True).dispatch_event('change')
  async def slider(label,value):
   el=controls.get_by_label(label,exact=True);await el.fill(str(value));await el.dispatch_event('change')
  await slider('Debljina',4.5);await slider('Jačina ispune',0);await slider('Vidljivost linije',80)
  state=await page.evaluate("({col:kmlLs[0].col,fillCol:kmlLs[0].fillCol,weight:kmlLs[0].weight,opacity:kmlLs[0].opacity,fill:kmlLs[0].fill,fillOpacity:kmlLs[0].fillOpacity,actual:kmlLs[0].grp.getLayers()[0].options.fillOpacity})")
  assert state=={'col':'#dc2626','fillCol':'#3b82f6','weight':4.5,'opacity':.8,'fill':True,'fillOpacity':0,'actual':0},state
  await page.evaluate('closeGraniceModal();map.setView([44.902,16.002],16,{animate:false});map.closePopup()')
  await page.wait_for_timeout(250)
  # Stvarni DOM klik unutar prozirnog canvas poligona, udaljen od obruba i rupe.
  async def click_map(lat,lng):
   pos=await page.evaluate("([a,b])=>{const p=map.latLngToContainerPoint([a,b]),r=map.getContainer().getBoundingClientRect();return {x:r.left+p.x,y:r.top+p.y}}",[lat,lng]);await page.mouse.click(pos['x'],pos['y'])
  await click_map(44.9012,16.0012)
  await page.locator('.le-popup').wait_for()
  assert await page.locator('.le-popup .le-attributes dd').all_text_contents()==['105','a']
  assert await page.locator('.le-popup .le-description').inner_text()=='Napomena s terena'
  assert 'ha' in await page.locator('.le-object-measure').inner_text()
  assert not await page.evaluate('!!window.unsafeKml')
  # Rupa u poligonu nije dio odjela; ni na fallback-u.
  assert await page.evaluate("!_kmlHitTest(L.latLng(44.902,16.002),true)")
  assert await page.evaluate("!!_kmlHitTest(L.latLng(44.9012,16.0012),true)")
  await page.locator('.le-popup').get_by_role('button',name='Stil fajla',exact=True).click()
  bad=await page.evaluate(b.AUDIT,'.le-popup');assert not bad,bad
  await page.screenshot(path=str(OUT/'transparent-polygon-info.png'))
  await page.evaluate("map.closePopup();togK(0)")
  assert await page.evaluate("!_kmlHitTest(L.latLng(44.9012,16.0012),true)")
  await page.evaluate("togK(0);openGraniceModal();_glKmlToggleEdit(1)")
  controls=page.locator('#granice-list .le-editor')
  assert not await controls.get_by_text('Ispuna poligona',exact=True).count()
  await controls.get_by_role('button',name='Isprekidana',exact=True).click();await slider('Debljina',3)
  assert await page.evaluate("kmlLs[1].dash==='6 4'&&kmlLs[1].grp.getLayers()[0].options.weight===3")
  # SVG parser također čuva stvarnu nultu ispunu i rupu.
  await page.evaluate("""(xml)=>{closeGraniceModal();map.closePopup();kmlLs.forEach(k=>map.removeLayer(k.grp));const doc=new DOMParser().parseFromString(xml,'text/xml');const grp=pkmlStyled(doc,{color:'#2563eb',weight:2,fillOpacity:0,renderer:L.svg()}).addTo(map);kmlLs[0].grp=grp;applyKmlStyle(0);window.svgTest=grp.getLayers().find(l=>l._kmlIsPolygon);map.setView([44.902,16.002],16,{animate:false});}""",KML)
  assert await page.evaluate("svgTest.options.fillOpacity===0&&svgTest.getLatLngs().length===2&&svgTest._path.style.pointerEvents==='all'")
  await click_map(44.9012,16.0012);await page.locator('.le-popup').wait_for()
  # Durabilno čuvanje nakon ponovnog pokretanja; zero se ne zamjenjuje defaultom.
  await page.evaluate('map.closePopup();saveKmlStyles();_localKmlSaveAll(false)');await page.reload();await page.wait_for_function('_startupRestore._done&&!!window.GithubLayers')
  await page.evaluate("async()=>{sbUser={id:'11111111-1111-4111-8111-111111111111'};sbProfile={odobren:true,sumarija:'TEST'};await _localKmlRestore();GithubLayers.render();}")
  saved=await page.evaluate("({b:GithubLayers.layers('boundaries').map(k=>({col:k.col,fillCol:k.fillCol,weight:k.weight,opacity:k.opacity,fill:k.fill,fillOpacity:k.fillOpacity,actual:k.grp.getLayers()[0].options.fillOpacity})),r:GithubLayers.layers('roads').map(k=>({weight:k.weight,dash:k.dash}))})")
  assert saved['b']==[state],saved
  assert saved['r']==[{'weight':3,'dash':'6 4'}],saved
  # Projekti kolege: briše se isključivo vlastito članstvo, uz potvrdu ciljanog reda.
  await page.evaluate("""()=>{
   window.teamCalls=[];window.teamMode='ok';window.memberActive=true;_mrezaProbaj=()=>true;_dlgConfirm=async()=>true;_dozSubProject=()=>{};sbLoadKolegeVlake=async()=>{};
   sbLoadProjekti=async()=>{rndProjektiList()};dozLoadOdjeli=async()=>{dozRenderOdjeli()};
   const builder=(table)=>{let deleting=false;const eqs={};const response=()=>{if(deleting){teamCalls.push({table,eqs:{...eqs}});if(teamMode==='rls')return {data:[],error:null};if(teamMode==='network')return {data:null,error:{message:'SocketException'}};memberActive=false;return {data:[{projekt_id:eqs.projekt_id,project_id:eqs.project_id}],error:null};}return {data:memberActive?{projekt_id:eqs.projekt_id,project_id:eqs.project_id}:null,error:null};};
    const q={delete(){if(!['projekt_clanovi','doz_project_members'].includes(table))throw Error('Zabranjeno brisanje timskih podataka');deleting=true;return q},eq(k,v){eqs[k]=v;return q},select(){return q},maybeSingle(){return Promise.resolve(response())},then(a,b){return Promise.resolve(response()).then(a,b)}};return q;};sb={from:builder};
   localStorage.setItem(_OL.QUEUE,'[]');const colleague='22222222-2222-4222-8222-222222222222';_projekti=[{id:'team-v',korisnik_id:colleague,odjel:'105',gj:'Test',clanovi:[{korisnik_id:sbUser.id}]}];_OL.save(_OL.PROJEKTI,_projekti);showProjektDetalji('team-v');
  }""")
  assert (await page.locator('#pd-leave-btn').inner_text()).strip()=='Ukloni sa mog spiska'
  await page.evaluate("teamMode='rls';napustiProjekat('team-v')")
  assert await page.evaluate("_projekti.length===1&&_OL.load(_OL.PROJEKTI).length===1")
  await page.evaluate("teamMode='network';napustiProjekat('team-v')")
  assert await page.evaluate('_projekti.length===1')
  await page.evaluate("teamMode='ok';napustiProjekat('team-v')")
  assert await page.evaluate("_projekti.length===0&&_OL.load(_OL.PROJEKTI).length===0")
  assert await page.evaluate("teamCalls.every(c=>c.table==='projekt_clanovi'&&c.eqs.projekt_id==='team-v'&&c.eqs.korisnik_id===sbUser.id)")
  await page.evaluate("""()=>{teamCalls=[];memberActive=true;_dozOdjeli=[{id:'team-d',name:'Test · 105',created_by:'22222222-2222-4222-8222-222222222222',status:'active'}];_OL.save(_OL.DOZ_ODJELI,_dozOdjeli);_dozSelId='team-d';_dozMembers=[];_dozTracks=[];_dozMarkings=[];dozRenderOdjeli();}""")
  await page.evaluate("teamMode='rls';dozDeleteOdjel()")
  assert await page.evaluate("_dozSelId==='team-d'&&_dozOdjeli.length===1")
  await page.evaluate("teamMode='ok';_OL.enqueue({type:'insert_doz_marking',payload:{project_id:'team-d'}});dozDeleteOdjel()")
  assert await page.evaluate("teamCalls.length===1&&_dozOdjeli.length===1"),'Neposlani podaci moraju blokirati napuštanje'
  await page.evaluate("localStorage.setItem(_OL.QUEUE,'[]');dozDeleteOdjel()")
  assert await page.evaluate("_dozSelId===null&&_dozOdjeli.length===0&&_OL.load(_OL.DOZ_ODJELI).length===0")
  assert await page.evaluate("teamCalls.every(c=>c.table==='doz_project_members'&&c.eqs.project_id==='team-d'&&c.eqs.user_id===sbUser.id)")
  assert not errors,errors;assert not writes,writes
  (OUT/'report.json').write_text(json.dumps({'passed':True,'errors':errors,'external_writes':writes,'restored':saved},indent=2))
  await ctx.close();await browser.close()
 print('PASS: Canvas/SVG prozirna ispuna, rupa, info tabela, stil puteva/granica, 6 prikaza/kontrast, IDB restart, članstvo Vlake/Doznaka i RLS/mreža/neposlani podaci')
if __name__=='__main__':asyncio.run(main())
