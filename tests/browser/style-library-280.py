"""Puni app: zajednički stil + projektni izuzetak, javni KML na uređaju, lična arhiva i restart."""
import asyncio, ast, json, mimetypes, os
from pathlib import Path
from types import SimpleNamespace
from playwright.async_api import async_playwright
ROOT=Path(__file__).resolve().parents[2];OUT=ROOT/'outputs/280';OUT.mkdir(parents=True,exist_ok=True)
source=ast.parse(Path(__file__).with_name('day-all-panels-275.py').read_text())
audit=next(ast.literal_eval(n.value) for n in source.body if isinstance(n,ast.Assign) and any(isinstance(t,ast.Name) and t.id=='AUDIT' for t in n.targets))
A='11111111-1111-4111-8111-111111111111';B='22222222-2222-4222-8222-222222222222'
KML='<kml><Document><Placemark><name>105</name><Polygon><outerBoundaryIs><LinearRing><coordinates>16,44.9 16.005,44.9 16.005,44.905 16,44.905 16,44.9</coordinates></LinearRing></outerBoundaryIs></Polygon></Placemark></Document></kml>'
ROAD='<kml><Placemark><name>Put</name><LineString><coordinates>16,44.9 16.005,44.905</coordinates></LineString></Placemark></kml>'
async def main():
 async with async_playwright() as p:
  browser=await p.chromium.launch(executable_path=os.environ.get('UI_CHROMIUM') or None)
  ctx=await browser.new_context(service_workers='block',viewport={'width':390,'height':800});errors=[];writes=[]
  async def route(r):
   url=r.request.url
   if not url.startswith('https://device.test/'):
    if r.request.method not in ['GET','HEAD']:writes.append(url)
    await r.abort();return
   name=url.split('device.test/',1)[1].split('?',1)[0] or 'index.html';f=ROOT/name
   if name=='GRANICE.kml':await r.fulfill(content_type='application/xml',body='<kml><Document/></kml>')
   elif f.is_file():await r.fulfill(content_type=mimetypes.guess_type(str(f))[0] or 'application/octet-stream',body=f.read_bytes())
   else:await r.fulfill(status=404,body='fixture')
  await ctx.route('**/*',route);await ctx.route_web_socket('**/*',lambda ws:ws.close())
  await ctx.add_init_script("""Object.defineProperty(navigator,'onLine',{get:()=>false,configurable:true});navigator.geolocation.watchPosition=()=>1;navigator.geolocation.clearWatch=()=>{};
   if(!localStorage.getItem('tvlake_device_last_user')){const id='11111111-1111-4111-8111-111111111111';localStorage.setItem('tvlake_ol_profile',JSON.stringify({ts:Date.now(),data:{id,odobren:true,sumarija:'TEST',ime:'Emina',prezime:'Projektant'}}));localStorage.setItem('tvlake_device_last_user',id);} """)
  page=await ctx.new_page();page.on('pageerror',lambda e:errors.append(str(e)+' '+e.stack))
  await page.goto('https://device.test/');await page.wait_for_function('_startupRestore._done&&!!window.GithubLayers')
  await page.evaluate("""()=>{sbUser={id:'11111111-1111-4111-8111-111111111111'};sbProfile={id:sbUser.id,odobren:true,sumarija:'TEST'};sbInitData=async()=>{};sb={auth:{signOut:async()=>({error:null})}};_revealApp();_projekti=[{id:'P',gj:'Gornja Una',odjel:'105',korisnik_id:sbUser.id,clanovi:[]},{id:'Q',gj:'Gornja Una',odjel:'106',korisnik_id:sbUser.id,clanovi:[]}];_aktivniProjektId='P';localStorage.setItem('tvlake_akt_proj','P');_OL.save(_OL.PROJEKTI,_projekti);_applyVlakeRows([{nm:'T1',br:1,kr:0,projekt_id:'P',pts:[{la:44.9,lo:16},{la:44.901,lo:16.003}]},{nm:'T1.1',br:1,kr:1,projekt_id:'Q',pts:[{la:44.9,lo:16},{la:44.903,lo:16.003}]}]);const poly=L.polyline([[44.9,16],[44.902,16.003]]).addTo(map);kolegeVlakeMap['B::T2']={nm:'T2',korisnikId:'B',projektId:'P',pts:[{la:44.9,lo:16},{la:44.902,lo:16.003}],poly};}""")
  assert await page.locator('#proj-panel .project-colors,#proj-panel .project-arrows').count()==0
  labels=await page.locator('#menu-dropdown .mdrop-item').all_text_contents();line=next(i for i,t in enumerate(labels) if t.strip()=='Stil linija');assert labels[line+1].strip()=='Stil i boja vlaka'
  await page.evaluate('openVlakaStyle()');assert await page.locator('#vlaka-style-all').is_checked()
  async def color(id,col):
   e=page.locator('#'+id);await e.fill(col);await e.dispatch_event('input');await e.dispatch_event('change')
  await color('boja-vl-pick','#176b48');await color('boja-kr-pick','#ad2938')
  await page.locator('.boja-dash-btn[data-d=dash]').click();await page.locator('#boja-outline').check()
  await page.locator('#project-arrow-placement').select_option('beside');await page.locator('#project-arrow-count').select_option('2')
  assert await page.evaluate("vlake[0].poly.options.color==='#176b48'&&vlake[1].poly.options.color==='#ad2938'&&kolegeVlakeMap['B::T2'].poly.options.color==='#176b48'&&vlake.every(v=>v.poly.options.vlakaOutline&&v.poly.options.dashArray)")
  assert await page.evaluate("VlakaDirection.settingsFor('P').placement==='beside'&&VlakaDirection.settingsFor('Q').count===2&&_loadBoje('NEW').vlaka==='#176b48'")
  await page.locator('#vlaka-style-project').check();await page.locator('#vlaka-style-project-select').select_option('Q')
  await color('boja-kr-pick','#5935aa');await page.locator('#project-arrow-visible').uncheck()
  assert await page.evaluate("_aktivniProjektId==='P'&&vlake[0].poly.options.color==='#176b48'&&vlake[1].poly.options.color==='#5935aa'&&VlakaDirection.settingsFor('P').visible&&!VlakaDirection.settingsFor('Q').visible")
  # A colour-only exception still inherits new common width and arrow placement.
  await page.locator('#vlaka-style-all').check();await page.locator('#boja-weight').fill('5');await page.locator('#boja-weight').dispatch_event('input');await page.locator('#project-arrow-placement').select_option('on')
  assert await page.evaluate("_loadBoje('Q').weight===5&&_loadBoje('Q').krak==='#5935aa'&&VlakaDirection.settingsFor('Q').placement==='on'&&!VlakaDirection.settingsFor('Q').visible")
  await page.locator('#project-arrow-placement').select_option('beside');await page.locator('#vlaka-style-project').check()
  # Existing project overrides remain until user explicitly returns to common style.
  for theme in ['day','dark']:
   for width,height in [(320,568),(390,800),(800,480)]:
    await page.set_viewport_size({'width':width,'height':height});await page.evaluate('(t)=>document.documentElement.dataset.fieldTheme=t',theme)
    assert await page.locator('.vlaka-style-sheet').evaluate('(e)=>e.scrollWidth<=e.clientWidth+1')
    if theme=='day':assert not await page.evaluate(audit,'#vlaka-style-modal'),await page.evaluate(audit,'#vlaka-style-modal')
    await page.locator('.vlaka-style-sheet').evaluate('(e)=>e.scrollTop=0');await page.screenshot(path=str(OUT/f'style-{theme}-{width}.png'))
    await page.locator('.project-arrows').scroll_into_view_if_needed();await page.screenshot(path=str(OUT/f'direction-{theme}-{width}.png'))
  print('UI style passed',flush=True)
  await page.locator('#vlaka-style-inherit').click();assert await page.evaluate("_loadBoje('Q').krak==='#ad2938'&&VlakaDirection.settingsFor('Q').visible&&VlakaDirection.settingsFor('Q').placement==='beside'")
  await color('boja-kr-pick','#5935aa');await page.locator('#project-arrow-visible').uncheck();await page.evaluate('closeVlakaStyle()')
  # Genuine IndexedDB payloads; same names and persisted hidden/styles states.
  await page.evaluate("""async ([boundary,road])=>{await _localLayerKml('Granice odjela.kml',boundary,sbUser.id,{id:'github-kml-boundaries',provider:'github',name:'Granice odjela.kml',size:boundary.length});await _localLayerKml('Kamionski putevi.kml',road,sbUser.id,{id:'github-kml-roads',provider:'github',name:'Kamionski putevi.kml',size:road.length});await _localLayerKml('Licni sloj.kml',boundary,sbUser.id);const k=kmlLs[0];Object.assign(k,{vis:false,onlyPolygon:true,col:'#a32132',weight:3,fill:true,fillOpacity:0});map.removeLayer(k.grp);saveKmlStyles();_localKmlSaveAll(false);_mapFavs=[{id:'fav-test',type:'builtin',layerKey:'topo',name:'Moja topo'}];_mapFavSave();_lineStyle.tragW=6;_lineStyleSave();}""",[KML,ROAD])
  print('IDB stored; restarting',flush=True)
  await page.reload();await page.wait_for_function('_startupRestore._done&&!!window.GithubLayers');await page.evaluate('async()=>{await _localKmlRestore();GithubLayers.render()}')
  assert await page.evaluate("kmlLs.length===3&&GithubLayers.layers('boundaries')[0].vis===false&&GithubLayers.layers('boundaries')[0].onlyPolygon&&GithubLayers.layers('boundaries')[0].fillOpacity===0&&!map.hasLayer(GithubLayers.layers('boundaries')[0].grp)&&_loadBoje('Q').krak==='#5935aa'&&!VlakaDirection.settingsFor('Q').visible&&_aktivniProjektId==='P'&&_mapFavs[0].name==='Moja topo'&&_lineStyle.tragW===6")
  await page.evaluate("""()=>{sbInitData=async()=>{};sb={auth:{signOut:async()=>({error:null})}};_projekti=[{id:'P',gj:'Gornja Una',odjel:'105',korisnik_id:sbUser.id,clanovi:[]},{id:'Q',gj:'Gornja Una',odjel:'106',korisnik_id:sbUser.id,clanovi:[]}];_OL.save(_OL.PROJEKTI,_projekti);_aktivniProjektId='P';localStorage.setItem('tvlake_akt_proj','P');}""")
  print('Restart passed; switching users',flush=True)
  async def logout():
   await page.evaluate('()=>{window.logoutDone=false;doLogout().then(()=>window.logoutDone=true)}')
   if await page.evaluate('_dlgMode==="actions"&&!!_dlgResolve'):await page.locator('#dlg-actions-list button').nth(1).click()
   await page.wait_for_function('logoutDone')
  # Logout A / login B uses actual archive before wipe, actual public restore, no downloads.
  await logout();await page.evaluate("""async()=>{sbUser={id:'22222222-2222-4222-8222-222222222222'};sbProfile={id:sbUser.id,odobren:true,sumarija:'TEST'};await showApp();await _localKmlRestore();}""")
  print('Switched B',flush=True)
  assert await page.evaluate("kmlLs.length===2&&kmlLs.every(k=>k._driveSource.id.startsWith('github-kml-'))&&_aktivniProjektId===null&&_mapFavs[0].name==='Moja topo'&&_loadBoje('P').vlaka===undefined")
  assert await page.evaluate("GithubLayers.layers('boundaries')[0].col==='#a32132'&&GithubLayers.layers('boundaries')[0].vis===false&&GithubLayers.layers('boundaries')[0].onlyPolygon")
  await logout();await page.evaluate("""async()=>{sbUser={id:'11111111-1111-4111-8111-111111111111'};sbProfile={id:sbUser.id,odobren:true,sumarija:'TEST'};await showApp();await _localKmlRestore();}""")
  print('Returned A',flush=True)
  assert await page.evaluate("kmlLs.length===3&&kmlLs.some(k=>k.name==='Licni sloj.kml')&&_aktivniProjektId==='P'&&_loadBoje('Q').krak==='#5935aa'&&!VlakaDirection.settingsFor('Q').visible")
  await page.evaluate('sbLoadProjekti()');assert await page.evaluate('_projekti.map(p=>p.id)')==['P','Q']
  # Common style can explicitly replace all exceptions without deleting manual directions.
  await page.evaluate("()=>{localStorage.setItem(VlakaDirection.storeKey('Q'),JSON.stringify({'A:T1':{mode:'start'}}));openVlakaStyle();_vlakaStyleChoose('all')}")
  print('Unifying',flush=True)
  await page.locator('#vlaka-style-unify').click();await page.locator('#dlg-ok').click();await page.wait_for_function("_loadBoje('Q').krak==='#ad2938'")
  assert await page.evaluate("VlakaDirection.settingsFor('Q').visible&&JSON.parse(localStorage.getItem(VlakaDirection.storeKey('Q')))['A:T1'].mode==='start'")
  assert not errors and not writes,{'errors':errors,'external_writes':writes}
  (OUT/'style-library.json').write_text(json.dumps({'passed':True,'views':12,'public_kml_device':True,'private_archive':True,'active_project_restored':True,'global_and_project_styles':True,'errors':errors,'external_writes':writes},indent=2))
  await ctx.close();await browser.close()
 print('PASS: globalni/posebni stil, 12 prikaza, kolegine vlake, IDB offline restart, javni KML uređaja i arhiva naloga')
if __name__=='__main__':asyncio.run(main())
