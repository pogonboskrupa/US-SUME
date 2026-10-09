"""Puni app: karte na uređaju, tim, tastatura, brisanje oznaka i pregled UI; fake server."""
import asyncio,importlib.util,mimetypes,os,tempfile
from pathlib import Path
from playwright.async_api import async_playwright
ROOT=Path(__file__).resolve().parents[2]
spec=importlib.util.spec_from_file_location('raster',ROOT/'tests/browser/load-map-233.py');raster=importlib.util.module_from_spec(spec);spec.loader.exec_module(raster)
OUT=ROOT/'outputs/273';OUT.mkdir(parents=True,exist_ok=True)
A='11111111-1111-4111-8111-111111111111';B='22222222-2222-4222-8222-222222222222'
async def main():
 with tempfile.TemporaryDirectory() as tmp:
  path=Path(tmp)/'Odjel_test.mbtiles';raster.mbtiles(path)
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
   await page.evaluate("""()=>{sbUser={id:'11111111-1111-4111-8111-111111111111'};sbProfile={id:sbUser.id,odobren:true,sumarija:'TEST',ime:'Adnan',prezime:'Mahmic'};_revealApp();sbLoadProfile=async()=>{};sbInitData=async()=>{};sbLoadProjekti=async()=>{};sb={auth:{signOut:async()=>({error:null})}};}""")
   # Genuine raster import, worker/SQLite + IDB + active Leaflet tiles.
   await page.evaluate('openLoadMapScreen()');await page.locator('#loadmap-file-input').set_input_files(str(path))
   await page.wait_for_function('_loadmapPending.length===1');await page.locator('#loadmap-confirm').click()
   await page.wait_for_function('_sqlLayers.length===1',timeout=30000)
   assert await page.evaluate("""()=>{const m=_sqlLayers[0].meta,b=String(m.bounds).split(',').map(Number),c=map.getCenter();return Math.abs(c.lat-(b[1]+b[3])/2)<.00001&&Math.abs(c.lng-(b[0]+b[2])/2)<.00001&&156543.03392*Math.cos(c.lat*Math.PI/180)/2**map.getZoom()/.0002646<=50000;}"""), 'First raster view must be centered and at most 1:50000'

   await page.wait_for_function('_sqlLayers[0].layer.getContainer()?.querySelector("img.leaflet-tile-loaded")',timeout=30000)
   await page.wait_for_function('document.querySelector("#loadmap-manage .lm-card")')
   assert await page.locator('.lm-hero').count()==0
   assert await page.locator('.lm-map-preview').first.evaluate('(e)=>e.getBoundingClientRect().height')<=84
   await page.screenshot(path=str(OUT/'compact-maps.png'))
   await page.evaluate("""()=>{window.originalLayer=_sqlLayers[0].layer;window.originalMapName=_sqlLayers[0].name;window.originalLastMap=localStorage.getItem(_LASTMAP_KEY);localStorage.setItem('tvlake_sqlmap_prefs_v1',JSON.stringify({[originalMapName]:{opacity:.7}}));} """)
   await page.evaluate('closeLoadMapScreen()')
   # Ordinary logout/login leaves imported map open without duplicate or reimport.
   await page.evaluate('doLogout()');assert not await page.evaluate('_startupRestore._done')
   await page.evaluate("""async()=>{sbUser={id:'11111111-1111-4111-8111-111111111111'};sbProfile={id:sbUser.id,odobren:true,sumarija:'TEST',ime:'Adnan',prezime:'Mahmic'};await showApp();}""")
   await page.wait_for_timeout(150)
   assert await page.evaluate('_sqlLayers.length===1&&_sqlLayers[0].layer===originalLayer&&map.hasLayer(originalLayer)')
   # Different user: private location data archived/cleared, raster survives untouched.
   await page.evaluate("localStorage.setItem(_TACKE_KEY,JSON.stringify([{nm:'Privatna tačka',la:44.9,lo:16}]))")
   await page.evaluate('doLogout()')
   await page.evaluate("""async()=>{sbUser={id:'22222222-2222-4222-8222-222222222222'};sbProfile={id:sbUser.id,odobren:true,sumarija:'TEST',ime:'Drugi',prezime:'Korisnik'};await showApp();}""")
   await page.wait_for_timeout(150)
   assert await page.evaluate('_sqlLayers.length===1&&_sqlLayers[0].layer===originalLayer&&map.hasLayer(originalLayer)&&localStorage.getItem(_LASTMAP_KEY)===originalLastMap')
   assert await page.evaluate("_tacke.every(p=>p.nm!=='Privatna tačka')")
   assert await page.evaluate("localStorage.getItem('tvlake_sqlmap_prefs_v1').includes(originalMapName)")
   # Team list dedup by UUID; owner name is not borrowed from current user's profile.
   await page.evaluate("""()=>{_projekti=[{id:'P',korisnik_id:'11111111-1111-4111-8111-111111111111',odjel:'105',gj:'Test',clanovi:[{korisnik_id:'11111111-1111-4111-8111-111111111111'},{korisnik_id:sbUser.id},{korisnik_id:sbUser.id},{korisnik_id:''}]}];_aktivniProjektId='P';kolegeMap={'11111111-1111-4111-8111-111111111111':{ime:'Adnan Mahmic',color:'#22c55e'}};switchTab('projekat');showProjektDetalji('P');}""")
   assert await page.locator('#pd-clanovi .clan-row').count()==2
   members=await page.locator('#pd-clanovi').inner_text();assert 'Adnan Mahmic' in members and 'Drugi Korisnik' in members and '22222222' not in members
   await page.evaluate("""()=>{_projekti[0].korisnik_id=sbUser.id;_projekti[0].clanovi.push({korisnik_id:'33333333-3333-4333-8333-333333333333'});kolegeMap['33333333-3333-4333-8333-333333333333']={ime:'Drugi Korisnik'};showProjektDetalji('P');}""")
   assert await page.locator('#pd-clanovi .clan-row').count()==3
   assert await page.locator('#pd-delete-btn').is_visible()
   assert await page.locator('#pd-delete-btn').evaluate('(e)=>getComputedStyle(e).backgroundColor')=='rgb(185, 28, 28)'
   assert await page.evaluate("document.querySelector('#proj-panel').lastElementChild.classList.contains('project-polygon')")
   # Existing modal gains keypad, preserves caret and selection; cancel does not change vlaka.
   await page.evaluate("()=>{window.promptResult='pending';_dlgPrompt('Naziv vlake','T14',{title:'Nova ručna vlaka',vlakaKeyboard:true}).then(v=>window.promptResult=v)}")
   await page.wait_for_function('document.querySelector("#dlg-sheet.show")')
   await page.locator('#dlg-vlaka-keyboard button[aria-label="T"]').click();await page.locator('#dlg-vlaka-keyboard button[aria-label="2"]').click();await page.locator('#dlg-vlaka-keyboard button[aria-label="Tačka za krak"]').click();await page.locator('#dlg-vlaka-keyboard button[aria-label="3"]').click()
   assert await page.locator('#dlg-input').input_value()=='T2.3'
   await page.locator('#dlg-vlaka-keyboard button[aria-label="Obriši znak"]').click();assert await page.locator('#dlg-input').input_value()=='T2.'
   await page.locator('#dlg-vlaka-keyboard button[aria-label="Prikaži slova"]').click();await page.locator('#dlg-vlaka-keyboard button[aria-label="A"]').click();assert await page.locator('#dlg-input').input_value()=='T2.A'
   await page.locator('#dlg-cancel').click();await page.wait_for_function('promptResult===null');await page.wait_for_timeout(450)
   await page.evaluate("()=>{_dlgPrompt('Broj vlake','T15',{title:'Nova ručna vlaka',vlakaKeyboard:true}).then(v=>window.promptResult=v)}")
   await page.locator('#dlg-input').press('End');await page.locator('#dlg-input').press('Backspace');await page.locator('#dlg-input').press('7');assert await page.locator('#dlg-input').input_value()=='T17'
   await page.locator('#dlg-ok').click();await page.wait_for_function("promptResult==='T17'");await page.wait_for_timeout(450)
   # Actual own route renderer: main/lager/arrows/both sign/steep highlights all removed.
   await page.evaluate("""()=>{vlake=[];sbDeleteVlaka=async v=>{};_applyVlakeRows([{nm:'T21',br:21,kr:0,projekt_id:'P',lager:'L3',pts:[{la:44.9,lo:16,al:400},{la:44.903,lo:16.003,al:450}]}]);const v=vlake[0];VlakaDirection.setPopup;const key=VlakaDirection.storeKey('P');localStorage.setItem(key,JSON.stringify({[VlakaDirection.identity(v)]:{mode:'start'}}));updateVlakaLabel(0);v._steepPolys=[L.polyline([[44.9,16],[44.903,16.003]]).addTo(map)];window.routeArtifacts=[v.poly,v.lagerMk,v.labelMk,...v.extraLabels,...v._directionMarkers,...v._steepPolys].filter(Boolean);window.directionCount=v._directionMarkers.length;_aktivniProjektId='P';recOn=false;_vpIdx=0;dlV(0);}""")
   assert await page.evaluate('directionCount>0&&routeArtifacts.some(m=>m.options?.icon?.options?.className==="vlaka-lager-mk")')
   # Full app zoom handlers must keep print strokes thin after changing scale.
   await page.evaluate("()=>{_delCancel();stampaOtvori();map.setZoom(map.getZoom()+1,{animate:false});}")
   await page.wait_for_timeout(350)
   assert await page.evaluate("vlake[0].poly.options.weight===1.4&&vlake[0].poly.options.dashArray==='6 4'&&vlake[0].poly.options.vlakaOutline===false&&vlake[0]._steepPolys[0].options.opacity===0")
   await page.evaluate("()=>{_stpZatvoriInterno();dlV(0);}")
   assert await page.evaluate("vlake[0]._steepPolys[0].options.opacity===1")

   await page.locator('#del-modal-input').fill('T21');await page.locator('#del-confirm-btn').click()
   assert await page.evaluate('vlake.length===0&&routeArtifacts.every(m=>!map.hasLayer(m))')
   await page.evaluate("""()=>{const html=_vlakeStatsSecsHtml(10,[{nm:'T1',br:1,kr:0,pts:[{la:44.9,lo:16,al:400},{la:44.901,lo:16.001,al:450}],projektant_ime:'Drugi Korisnik'}]);document.getElementById('pm-detail-body').innerHTML=html;document.getElementById('pm-modal').style.display='flex';document.getElementById('pm-list').style.display='none';document.getElementById('pm-detail').style.display='';}""")
   for theme in ['dark','day']:
    await page.evaluate('(t)=>document.documentElement.dataset.fieldTheme=t',theme)
    assert await page.locator('.pm-tbl td.r').first.evaluate('(e)=>getComputedStyle(e).backgroundColor')=='rgba(0, 0, 0, 0)'
    await page.screenshot(path=str(OUT/f'project-management-{theme}.png'))
   await page.evaluate("closeProjectManagement();switchTab('teren')")
   assert await page.evaluate("(()=>{const p=document.getElementById('trn-position');return p.nextElementSibling.querySelector('#trn-sun')&&p.nextElementSibling.nextElementSibling.querySelector('#trn-heading')})()")
   # Admin uses real activity dates independently of a newer login date.
   await page.evaluate("""async()=>{sbProfile.is_admin=true;sb.rpc=async name=>name==='admin_get_all_users'?{data:[{id:'X',ime:'Test',prezime:'Aktivan',odobren:true,is_admin:false,last_sign_in_at:'2026-10-09T12:00:00Z',created_at:'2026-01-01'}],error:null}:name==='admin_get_user_activity'?{data:[{user_id:'X',last_active_at:'2026-10-08T10:20:00Z'}],error:null}:{data:[],error:null};switchTab('admin');await adminLoadUsers();}""")
   assert await page.evaluate("_adminUsers[0].last_active_at==='2026-10-08T10:20:00Z'")
   text=await page.locator('#admin-panel-user-list').inner_text();assert 'Zadnja aktivnost:' in text and 'Zadnja prijava:' not in text
   await page.screenshot(path=str(OUT/'admin-activity.png'))
   await page.evaluate("sbProfile.is_admin=false;switchTab('karta')")
   # Entire version notice activates the actual APK updater; close only dismisses.
   await page.evaluate("""()=>{window.updateClicks=0;window.azurirajAplikaciju=()=>{updateClicks++};_updateNotice('9.9.9');}""")
   for theme in ['dark','day']:
    await page.evaluate('(t)=>document.documentElement.dataset.fieldTheme=t',theme)
    await page.screenshot(path=str(OUT/f'update-notice-{theme}.png'))
   await page.locator('#ver-banner .update-notice-action').click()
   assert await page.evaluate('updateClicks')==1
   await page.locator('#ver-banner .update-notice-close').click();assert await page.locator('#ver-banner').count()==0
   assert await page.evaluate("localStorage.getItem('tvlake_ver_dismissed')")=='9.9.9'
   # Same single dialog, deliberate native settings actions; no asserted autostart status.
   await page.evaluate("""()=>{window.deviceCalls=[];window.AndroidDevice={status:()=>JSON.stringify({batteryExempt:false,manufacturer:'Xiaomi'}),openBattery:()=>deviceCalls.push('battery'),openAutostart:()=>deviceCalls.push('autostart'),openAppSettings:()=>deviceCalls.push('app')};showDeviceSettings();}""")
   await page.wait_for_function('document.querySelector("#dlg-sheet.show")');await page.wait_for_timeout(350)
   await page.screenshot(path=str(OUT/'device-settings.png'))
   await page.locator('#dlg-actions-list .dlg-action-btn').nth(0).click();await page.wait_for_function("deviceCalls[0]==='battery'");await page.wait_for_timeout(450)
   await page.evaluate('()=>{showDeviceSettings()}');await page.locator('#dlg-actions-list .dlg-action-btn').nth(1).click();await page.wait_for_function("deviceCalls[1]==='autostart'");await page.wait_for_timeout(450)
   await page.evaluate('()=>{showDeviceSettings()}');await page.locator('#dlg-actions-list .dlg-action-btn').nth(2).click();await page.wait_for_function("deviceCalls[2]==='app'");await page.wait_for_timeout(450)
   # Keyboard layout contains all keys and stays scrollable on smaller/landscape viewports.
   for width,height in [(320,568),(390,800),(568,320)]:
    await page.set_viewport_size({'width':width,'height':height})
    await page.evaluate("()=>{_dlgPrompt('Naziv vlake','T14',{title:'Nova ručna vlaka',vlakaKeyboard:true})}")
    await page.wait_for_timeout(330)
    assert await page.locator('#dlg-vlaka-keyboard button[aria-label="Tačka za krak"]').is_visible()
    assert await page.evaluate('document.documentElement.scrollWidth<=innerWidth+1')
    await page.screenshot(path=str(OUT/f'keyboard-{width}-{height}.png'))
    await page.locator('#dlg-cancel').scroll_into_view_if_needed();await page.locator('#dlg-cancel').click();await page.wait_for_timeout(450)
   # Cold page restart restores genuine persisted raster locally, without another import.
   await page.evaluate("()=>{map.setView([44.9015,16.0015],15,{animate:false});window.lastRasterView={lat:map.getCenter().lat,lng:map.getCenter().lng,z:map.getZoom()};}")
   expectedView=await page.evaluate('lastRasterView')
   restored=await ctx.new_page();restored.on('pageerror',lambda e:errors.append(str(e)))
   await restored.goto('http://device.test/');await restored.wait_for_function('_sqlLayers.length===1',timeout=30000)
   await restored.wait_for_function('_sqlLayers[0].layer.getContainer()?.querySelector("img.leaflet-tile-loaded")',timeout=30000)
   assert await restored.evaluate('_sqlLayers[0].name')==await page.evaluate('originalMapName')
   actualView=await restored.evaluate('({lat:map.getCenter().lat,lng:map.getCenter().lng,z:map.getZoom()})')
   assert actualView['z']==expectedView['z'] and abs(actualView['lat']-expectedView['lat'])<.00005 and abs(actualView['lng']-expectedView['lng'])<.00005,(actualView,expectedView)
   assert not errors,errors
   assert not writes,writes
   await browser.close()
 print('PASS device maps survive logout/different users; private points isolated; team dedup; keyboard; full route artifact deletion; compact cards; neutral statistics; daylight order')
asyncio.run(main())
