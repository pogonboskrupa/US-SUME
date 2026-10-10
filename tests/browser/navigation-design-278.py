"""Odobrene lokalne SVG ikone, stvarni UI i vodeći kao član tima + zaseban nadzor."""
import asyncio, ast, json, mimetypes, os
from types import SimpleNamespace
from pathlib import Path
from playwright.async_api import async_playwright
ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'outputs/278';OUT.mkdir(parents=True,exist_ok=True)
day_source=ast.parse(Path(__file__).with_name('day-all-panels-275.py').read_text())
day=SimpleNamespace(AUDIT=next(ast.literal_eval(n.value) for n in day_source.body if isinstance(n,ast.Assign) and any(isinstance(t,ast.Name) and t.id=='AUDIT' for t in n.targets)))
A='11111111-1111-4111-8111-111111111111'
async def main():
 async with async_playwright() as p:
  browser=await p.chromium.launch(executable_path=os.environ.get('UI_CHROMIUM') or None)
  ctx=await browser.new_context(service_workers='block',viewport={'width':390,'height':800});errors=[];writes=[];icons=[]
  async def route(r):
   url=r.request.url
   if not url.startswith('https://device.test/'):
    if r.request.method not in ['GET','HEAD']:writes.append(url)
    await r.abort();return
   name=url.split('device.test/',1)[1].split('?',1)[0] or 'index.html';f=ROOT/name
   if name=='GRANICE.kml':await r.fulfill(content_type='application/xml',body='<kml><Document/></kml>')
   elif f.is_file():
    if name=='static/icons/navigation.svg':icons.append(name)
    await r.fulfill(content_type=mimetypes.guess_type(str(f))[0] or 'application/octet-stream',body=f.read_bytes())
   else:await r.fulfill(status=404,body='fixture')
  await ctx.route('**/*',route);await ctx.route_web_socket('**/*',lambda ws:ws.close())
  await ctx.add_init_script("""Object.defineProperty(navigator,'onLine',{get:()=>false,configurable:true});navigator.geolocation.watchPosition=()=>1;navigator.geolocation.clearWatch=()=>{};
   const uid='11111111-1111-4111-8111-111111111111';localStorage.setItem('tvlake_ol_profile',JSON.stringify({ts:Date.now(),data:{id:uid,odobren:true,sumarija:'Krupa',ime:'Emina',prezime:'Projektant'}}));localStorage.setItem('tvlake_device_last_user',uid);""")
  page=await ctx.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
  await page.goto('https://device.test/');await page.wait_for_function('_startupRestore._done&&!!window.DepartmentReport')
  await page.evaluate("""()=>{
   sbUser={id:'11111111-1111-4111-8111-111111111111'};
   window.fixtureProfile={id:sbUser.id,ime:'Emina',prezime:'Projektant',sumarija:'Krupa',odobren:true,je_vodeci:true};
   window.personal=[{id:'P',korisnik_id:sbUser.id,odjel:'105',gj:'Gornja Una',sumarija:'Krupa',clanovi:[]},{id:'Q',korisnik_id:'B',odjel:'106',gj:'Gornja Una',sumarija:'Krupa',clanovi:[{korisnik_id:sbUser.id}]}];
   window.reportRows=[...personal,{id:'R',korisnik_id:'C',odjel:'107',gj:'Grmeč',sumarija:'Krupa',vlasnik:'Amir Kolega'},{id:'FOREIGN',korisnik_id:'D',odjel:'999',sumarija:'Bihać'}];
   window.rpcCalls=[];window.holdReport=false;window.fixtureOffline=false;
   sb={auth:{signOut:async()=>({error:null})},rpc:async name=>{rpcCalls.push(name);if(name==='vodeci_projekti_pregled'&&holdReport)await new Promise(r=>window.reportRelease=r);return {data:name==='vodeci_projekti_pregled'?reportRows:name==='vodeci_doznaka_pregled'?[{id:'D',name:'Doznaka 108',status:'active',known_area_ha:30,clanova:4,kreirao:'Amir Kolega'}]:[],error:null}},from:table=>{
    let filters=[];const query={select(){return this},eq(k,v){filters.push([k,v]);return this},neq(){return this},in(){return this},order(){return this},single:async()=>({data:fixtureProfile,error:null}),then(resolve,reject){if(fixtureOffline){reject(Error('offline'));return;}let data=[];
     if(table==='projekti')data=filters.some(([k])=>k==='korisnik_id')?[personal[0]]:[personal[1]];
     if(table==='projekt_clanovi')data=filters.some(([k])=>k==='korisnik_id')?[{projekt_id:'Q'}]:[{korisnik_id:sbUser.id}];
     if(table==='korisnici')data=[{id:'B',ime:'Amir',prezime:'Kolega',sumarija:'Krupa',je_vodeci:true}];
     resolve({data,error:null});}};return query;}};
   sbInitData=async()=>{};_revealApp();
  }""")
  await page.evaluate('sbLoadProfile();');assert not await page.evaluate('isReadOnly()')
  assert await page.locator('#menu-school-report').is_visible()==False,'Meni je zatvoren'
  await page.evaluate('sbLoadProjekti()');assert await page.evaluate('_projekti.map(p=>p.id)')==['P','Q']
  assert await page.evaluate('rpcCalls.length')==0,'Radni projekti ne traže nadzorni RPC'
  assert await page.evaluate("_impProjektDozvoljen('P')&&_impProjektDozvoljen('Q')&&!_impProjektDozvoljen('R')")
  await page.evaluate("_aktivniProjektId='Q';_applyProjektFields(_projekti[1]);sbLoadKolege()")
  assert await page.evaluate("!!kolegeMap.B"),'Vodeći se nudi kao kolega'
  for tab in ['projekat','vlake','doznaka']:
   btn=page.locator(f'#tab-bar button[onclick="switchTab(\'{tab}\')"]');assert await btn.is_visible();await btn.click();assert await page.evaluate('_activeTab')==tab
  await page.evaluate("()=>{switchTab('karta');map.setView([44.903,16.004],14,{animate:false});L.polygon([[44.9,16],[44.9,16.008],[44.906,16.008],[44.906,16]],{color:'#28734d',fillColor:'#b1ca91',fillOpacity:.6}).addTo(map);L.polyline([[44.9,16],[44.903,16.004],[44.905,16.007]],{color:'#c03935',weight:3,dashArray:'6,5'}).addTo(map)}")
  for theme in ['day','dark']:
   for width,height in [(320,568),(390,800),(800,480)]:
    await page.set_viewport_size({'width':width,'height':height});await page.evaluate('(t)=>{document.documentElement.dataset.fieldTheme=t}',theme);await page.wait_for_timeout(150)
    for sel in ['#tab-bar','#action-bar']:
     if theme=='day':assert not await page.evaluate(day.AUDIT,sel),await page.evaluate(day.AUDIT,sel)
     assert await page.locator(sel).evaluate('(e)=>e.scrollWidth<=e.clientWidth+1'),sel
    visible=await page.locator('#tab-bar .tab-btn:visible').count();assert visible==5,visible
    boxes=await page.locator('#tab-bar .tbi:visible,#action-bar .dm-action-icon:visible').evaluate_all('(es)=>es.map(e=>({href:e.querySelector("use").getAttribute("href"),w:e.querySelector("use").getBBox().width}))')
    assert len(boxes)==8 and all(e['w']>0 for e in boxes),boxes
    await page.screenshot(path=str(OUT/f'navigation-{theme}-{width}.png'))
    await page.locator('#menu-btn').click();await page.locator('#menu-dropdown').wait_for(state='visible')
    assert await page.locator('#menu-school-report').is_visible()
    assert await page.locator('#menu-school-report small').inner_text()=='Krupa'
    assert await page.locator('#menu-dropdown .dm-map-art').count()==7
    if theme=='day':assert not await page.evaluate(day.AUDIT,'#menu-dropdown'),await page.evaluate(day.AUDIT,'#menu-dropdown')
    boxes=await page.locator('#menu-dropdown .dm-menu-svg:visible use').evaluate_all('(es)=>es.map(e=>e.getBBox().width)');assert len(boxes)>=20 and all(w>0 for w in boxes),boxes
    assert await page.locator('#menu-dropdown .mdrop-scroll').evaluate('(e)=>e.scrollWidth<=e.clientWidth+1')
    await page.screenshot(path=str(OUT/f'menu-{theme}-{width}.png'))
    await page.locator('#field-theme-toggle').click();assert await page.locator('#field-theme-toggle svg use').get_attribute('href')=='static/icons/navigation.svg#dm-sun'
    await page.evaluate('closeMenuDropdown()')
  print('UI prikazi provjereni',flush=True)
  # Nadzor ograničen na šumariju, bez promjene radnih projekata ili aktivnog ID-a.
  print('Otvaram nadzor',flush=True)
  before=await page.evaluate('JSON.stringify(_projekti)');await page.evaluate('showProjectManagement(true)')
  assert await page.evaluate('_pmAdminRows.map(p=>p.id)')==['P','Q','R']
  assert await page.evaluate('JSON.stringify(_projekti)')==before and await page.evaluate('_aktivniProjektId')=='Q'
  assert await page.locator('#pm-school-actions').is_visible() and 'Doznaka 108' in await page.locator('#pm-list').inner_text()
  await page.evaluate("_pmOpenDetail('R')");assert 'Aktiviraj' not in await page.locator('#pm-detail-body').inner_text()
  await page.evaluate("closeProjectManagement();showProjectManagement()")
  assert not await page.evaluate('_pmNadzor') and not await page.locator('#pm-school-actions').is_visible()
  assert '107' not in await page.locator('#pm-list').inner_text()
  print('Nadzor i radni spisak provjereni',flush=True)
  # Zakasnjeli report ne smije prepisati obični spisak niti drugi nalog.
  await page.evaluate("()=>{closeProjectManagement();holdReport=true;window.pendingReport=showProjectManagement(true)}")
  await page.wait_for_function('!!window.reportRelease');await page.evaluate('showProjectManagement();reportRelease();pendingReport')
  assert not await page.evaluate('_pmNadzor') and await page.evaluate('JSON.stringify(_projekti)')==before
  print('Zakasnjeli izvještaj provjeren',flush=True)
  # Stari offline nadzorni keš nema članstva: tuđi projekat ostaje samo u izvještaju.
  await page.evaluate("fixtureOffline=true;_OL.save(_OL.PROJEKTI,[...personal,reportRows[2]]);sbLoadProjekti()")
  assert await page.evaluate('_projekti.map(p=>p.id)')==['P','Q']
  print('Offline keš provjeren',flush=True)
  # Promjena uloge na istom uređaju mora deterministički vratiti/ukloniti tabove.
  for role in ['admin','field','regular','leading']:
   await page.evaluate("""async role=>{fixtureProfile={...fixtureProfile,is_admin:role==='admin',je_vodeci:role==='leading',sumarija:role==='field'?'ŠPD US ŠUME':'Krupa'};await sbLoadProfile();}""",role)
   assert await page.locator('#tab-bar button[onclick="switchTab(\'doznaka\')"]').is_visible()==(role in ['regular','leading']),role
   assert await page.locator('#menu-school-report').get_attribute('hidden') is None if role=='leading' else await page.locator('#menu-school-report').get_attribute('hidden') is not None
  assert await page.locator('#ab-loc-acc').evaluate('(e)=>!!e.closest("#ab-loc .ab-ico")')
  assert icons and not errors and not writes,{'icons':icons,'errors':errors,'external_writes':writes}
  (OUT/'navigation-design.json').write_text(json.dumps({'passed':True,'roles':['regular','leading','admin','field'],'views':12,'local_svg_requests':len(icons),'errors':errors,'external_writes':writes},indent=2))
  await ctx.close();await browser.close()
 print('PASS: SVG prikaz, 12 mobilnih/tablet prikaza, Dnevni mod, vlastiti/dijeljeni projekti vodećeg, zaseban nadzor, članstvo/offline keš i promjena uloga')
if __name__=='__main__':asyncio.run(main())
