"""Puna aplikacija offline: dodir dvosmjera/kraka, nezavisan stil i trajni položaji lagera."""
import asyncio, ast, json, mimetypes, os
from pathlib import Path
from playwright.async_api import async_playwright
ROOT=Path(__file__).resolve().parents[2];OUT=ROOT/'outputs/286';OUT.mkdir(parents=True,exist_ok=True)
source=ast.parse(Path(__file__).with_name('day-all-panels-275.py').read_text())
AUDIT=next(ast.literal_eval(n.value) for n in source.body if isinstance(n,ast.Assign) and any(isinstance(t,ast.Name) and t.id=='AUDIT' for t in n.targets))
async def tap(page,point):
 xy=await page.evaluate('p=>{const at=map.latLngToContainerPoint([p.la,p.lo]),r=map.getContainer().getBoundingClientRect();return {x:at.x+r.left,y:at.y+r.top}}',point)
 await page.touchscreen.tap(xy['x'],xy['y']);await page.wait_for_timeout(100)
async def main():
 async with async_playwright() as p:
  browser=await p.chromium.launch(executable_path=os.environ.get('UI_CHROMIUM') or None)
  ctx=await browser.new_context(service_workers='block',viewport={'width':390,'height':800},has_touch=True);errors=[];writes=[]
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
  await ctx.add_init_script("""Object.defineProperty(navigator,'onLine',{get:()=>false,configurable:true});navigator.geolocation.watchPosition=()=>1;navigator.geolocation.clearWatch=()=>{};if(!localStorage.getItem('tvlake_device_last_user')){const id='11111111-1111-4111-8111-111111111111';localStorage.setItem('tvlake_ol_profile',JSON.stringify({ts:Date.now(),data:{id,odobren:true,sumarija:'TEST',ime:'Emina',prezime:'Projektant'}}));localStorage.setItem('tvlake_device_last_user',id);} """)
  page=await ctx.new_page();page.on('pageerror',lambda e:errors.append(str(e)+' '+e.stack))
  await page.goto('https://device.test/');await page.wait_for_function('_startupRestore._done&&!!window.VlakaLager')
  await page.evaluate("""()=>{sbUser={id:'11111111-1111-4111-8111-111111111111'};sbProfile={id:sbUser.id,odobren:true,sumarija:'TEST'};sbInitData=async()=>{};_revealApp();_projekti=[{id:'P',gj:'Gornja Una',odjel:'105',korisnik_id:sbUser.id,clanovi:[]},{id:'Q',gj:'Gornja Una',odjel:'106',korisnik_id:sbUser.id,clanovi:[]}];_aktivniProjektId='P';localStorage.setItem('tvlake_akt_proj','P');_OL.save(_OL.PROJEKTI,_projekti);const pts=[{la:44.9,lo:16},{la:44.9002,lo:16.002},{la:44.9005,lo:16.004},{la:44.9002,lo:16.006},{la:44.9,lo:16.008}];_applyVlakeRows([{nm:'T1',br:1,kr:0,projekt_id:'P',pts},{nm:'T1.1',br:1,kr:1,projekt_id:'P',pts:pts.map(p=>({...p,la:p.la+.003}))},{nm:'T3',br:3,kr:0,projekt_id:'P',lager:'L3',pts:pts.map(p=>({...p,la:p.la-.003}))},{nm:'T4',br:4,kr:0,projekt_id:'Q',lager:'L4',pts}]);window.makePeer=()=>{const pts=[{la:44.9,lo:16},{la:44.901,lo:16.003}];const poly=L.polyline(pts.map(p=>[p.la,p.lo])).addTo(map);kolegeVlakeMap['B::T2']={nm:'T2',korisnikId:'B',projektId:'P',pts,poly,lager:'LC',lagerPt:{la:44.9,lo:16}};VlakaLager.refresh();};makePeer();_saveLocalVlake();}""")
  assert await page.evaluate("getVlakaWeight()===2&&getVlakaDash()==='dash'&&getVlakaOutline()&&VlakaDirection.settingsFor('P').size===25&&VlakaDirection.settingsFor('P').width===2")
  # Real popup + touch, not extracted methods: each route exposes points and stores chosen vertex.
  shapes=await page.evaluate('JSON.stringify(vlake.map(v=>v.pts))')
  for i,vertex in [(0,1),(1,3)]:
   await page.evaluate('(i)=>{switchTab("karta");showVlakaPopup(i,vlake[i].poly.getBounds().getCenter())}',i);await page.wait_for_timeout(120)
   assert await page.locator('#vp-direction-mode').count()==1
   await page.get_by_role('button',name='↔ Odredi dvosmjer',exact=True).click()
   assert await page.evaluate('VlakaDirection.isPicking()')
   await page.screenshot(path=str(OUT/f'direction-points-{i}.png'))
   assert await page.evaluate("Object.values(map._layers).filter(l=>l instanceof L.CircleMarker&&l.options.fillColor==='#1d4ed8').length")==5
   point=await page.evaluate('([i,n])=>vlake[i].pts[n]',[i,vertex]);await tap(page,point)
   assert not await page.evaluate('VlakaDirection.isPicking()')
   assert await page.evaluate('([i,p])=>{const s=VlakaDirection.splitFor(vlake[i]);return !!s&&Math.abs(s.la-p.la)<1e-9&&Math.abs(s.lo-p.lo)<1e-9}',[i,point])
   await page.evaluate('(i)=>showVlakaPopup(i,vlake[i].poly.getBounds().getCenter())',i);await page.wait_for_timeout(120)
   assert await page.locator('#vp-direction-mode').count()==0
   await page.get_by_role('button',name='↔ Promijeni mjesto dvosmjera',exact=True).click()
   await page.keyboard.press('Escape');assert not await page.evaluate('VlakaDirection.isPicking()')
  assert await page.evaluate('JSON.stringify(vlake.map(v=>v.pts))')==shapes
  # Reposition via actual touch at another point; full app works for legacy project-less route too.
  await page.evaluate('showVlakaPopup(0,vlake[0].poly.getBounds().getCenter())');await page.wait_for_timeout(120)
  await page.get_by_role('button',name='↔ Promijeni mjesto dvosmjera',exact=True).click();point=await page.evaluate('vlake[0].pts[3]');await tap(page,point)
  assert await page.evaluate('VlakaDirection.splitFor(vlake[0]).f>.7')
  await page.evaluate("()=>{closeVlakaPopup();_aktivniProjektId=null;vlake[0].projektId=null;VlakaDirection.startPick(vlake[0]);}")
  assert await page.evaluate('VlakaDirection.isPicking()');await page.keyboard.press('Escape')
  await page.evaluate("_aktivniProjektId='P';vlake[0].projektId='P'")
  # Hidden line and ongoing report drawing must not capture a map tap.
  await page.evaluate("map.removeLayer(vlake[0].poly);VlakaDirection.startPick(vlake[0])")
  assert not await page.evaluate('VlakaDirection.isPicking()');await page.evaluate('()=>{vlake[0].poly.addTo(map)}')
  # Separate symbol and text, global inheritance and per-project exception.
  await page.evaluate('openVlakaStyle()');await page.locator('#lager-scale').fill('150');await page.locator('#lager-scale').dispatch_event('input')
  assert await page.evaluate("VlakaLager.styleFor(vlake[2]).width===42&&VlakaLager.styleFor(vlake[2]).font===9")
  await page.locator('#lager-label').fill('14');await page.locator('#lager-label').dispatch_event('input')
  assert await page.evaluate("vlake[2].lagerMk.options.icon.options.iconSize[0]===42&&kolegeVlakeMap['B::T2'].lagerMk.options.icon.options.iconSize[0]===42&&VlakaLager.styleFor(vlake[2]).font===14")
  await page.locator('#vlaka-style-project').check();await page.locator('#vlaka-style-project-select').select_option('Q');await page.locator('#lager-scale').fill('200');await page.locator('#lager-scale').dispatch_event('input')
  assert await page.evaluate("VlakaLager.styleFor(vlake[3]).width===56&&VlakaLager.styleFor(vlake[3]).font===14&&VlakaLager.styleFor(vlake[2]).width===42")
  await page.locator('#vlaka-style-all').check();await page.locator('#lager-position-list summary').click();await page.wait_for_function("document.querySelectorAll('.lager-position-row').length===3")
  # Day/dark, portrait/landscape; lazy rows with long names remain inside sheet.
  for theme in ['day','dark']:
   for width,height in [(320,568),(390,800),(800,480)]:
    await page.set_viewport_size({'width':width,'height':height});await page.evaluate('(t)=>document.documentElement.dataset.fieldTheme=t',theme)
    await page.locator('.lager-style').scroll_into_view_if_needed()
    assert await page.locator('.vlaka-style-sheet').evaluate('(e)=>e.scrollWidth<=e.clientWidth+1')
    if theme=='day':assert not await page.evaluate(AUDIT,'.lager-style'),await page.evaluate(AUDIT,'.lager-style')
    await page.screenshot(path=str(OUT/f'lagers-{theme}-{width}.png'))
  await page.set_viewport_size({'width':390,'height':800})
  # Popup placement must leave the actual button tappable on the smallest phone.
  await page.evaluate('closeVlakaStyle()');await page.set_viewport_size({'width':320,'height':568});await page.evaluate('showVlakaPopup(1,vlake[1].poly.getBounds().getCenter())');await page.wait_for_timeout(120)
  await page.get_by_role('button',name='↔ Promijeni mjesto dvosmjera',exact=True).click();await page.keyboard.press('Escape');await page.set_viewport_size({'width':390,'height':800})
  # Own lager: persisted through existing local route cache, queued for server; no geometry edits.
  await page.evaluate('openVlakaStyle()');row=page.locator('.lager-position-row').filter(has_text='L3 · T3');await row.get_by_role('button').click()
  assert await page.evaluate('VlakaLager.isPicking()');new={'la':44.8972,'lo':16.0004};await tap(page,new)
  assert await page.evaluate('p=>{const v=vlake[2],r=_loadLocalVlake().find(x=>x.nm===v.nm);return Math.abs(v.lagerPt.la-p.la)<2e-5&&Math.abs(r.lager_pt.lo-p.lo)<2e-5}',new)
  assert await page.evaluate('JSON.stringify(vlake.map(v=>v.pts))')==shapes
  assert await page.evaluate("_OL.loadQueue().some(x=>x.type==='upsert_vlaka'&&x.payload.nm==='T3'&&!!x.payload.lager_pt)")
  # Peer lager: local override survives redraw; neither colleague geometry nor server changed.
  await page.evaluate('openVlakaStyle()');row=page.locator('.lager-position-row').filter(has_text='LC · T2');await row.get_by_role('button').click();peer={'la':44.9003,'lo':16.0003};await tap(page,peer)
  assert await page.evaluate("p=>{const v=kolegeVlakeMap['B::T2'];return v.lagerPt.la===44.9&&Math.abs(VlakaLager.positionFor(v,true).la-p.la)<2e-5}",peer)
  # Quota/cancel: a failed write leaves saved coordinates and in-memory state untouched.
  await page.evaluate("()=>{window.savedPoint=JSON.stringify(vlake[2].lagerPt);VlakaLager.startPlace('own:2');window.oldStorage=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k===LOCAL_VLAKE_KEY)throw new DOMException('quota','QuotaExceededError');return oldStorage.call(this,k,v)}}")
  await tap(page,{'la':new['la']+.0001,'lo':new['lo']+.0001})
  assert await page.evaluate('VlakaLager.isPicking()&&JSON.stringify(vlake[2].lagerPt)===savedPoint')
  await page.evaluate('()=>{Storage.prototype.setItem=oldStorage}');await page.keyboard.press('Escape')
  await page.evaluate("VlakaLager.startPlace('peer:B::T2');switchTab('projekat')");assert not await page.evaluate('VlakaLager.isPicking()')
  await page.evaluate("switchTab('karta');map.removeLayer(kolegeVlakeMap['B::T2'].poly);VlakaLager.refresh()")
  assert await page.evaluate("!kolegeVlakeMap['B::T2'].lagerMk")
  # Explicit old styles survive defaults; default for unsaved projects stays thin/dashed/outlined.
  await page.evaluate("localStorage.setItem(_bojaProjektKey('CUSTOM'),JSON.stringify({weight:6,dash:'solid',outline:false}))")
  assert await page.evaluate("_vlakaPrikazStyle({projektId:'CUSTOM'}).weight===6&&!_vlakaPrikazStyle({projektId:'CUSTOM'}).vlakaOutline&&_vlakaPrikazStyle({projektId:'NEW'}).weight===2")
  await page.reload();await page.wait_for_function('_startupRestore._done&&!!window.VlakaLager')
  assert await page.evaluate("!!vlake.find(v=>v.nm==='T3')&&VlakaLager.styleFor(vlake.find(v=>v.nm==='T3')).width===42&&VlakaLager.styleFor(vlake.find(v=>v.nm==='T3')).font===14&&VlakaDirection.splitFor(vlake.find(v=>v.nm==='T1')).f>.7")
  assert await page.evaluate('p=>Math.abs(vlake.find(v=>v.nm==="T3").lagerPt.la-p.la)<2e-5',new)
  # Recreate downloaded shared route after restart; per-user position isolation.
  await page.evaluate("()=>{const poly=L.polyline([[44.9,16],[44.901,16.003]]).addTo(map);kolegeVlakeMap['B::T2']={nm:'T2',korisnikId:'B',projektId:'P',poly,pts:[{la:44.9,lo:16},{la:44.901,lo:16.003}],lager:'LC',lagerPt:{la:44.9,lo:16}};VlakaLager.refresh()}")
  assert await page.evaluate("p=>Math.abs(VlakaLager.positionFor(kolegeVlakeMap['B::T2'],true).la-p.la)<2e-5",peer)
  await page.evaluate("sbUser={id:'OTHER'}")
  assert await page.evaluate("VlakaLager.positionFor(kolegeVlakeMap['B::T2'],true).la===44.9")
  assert not errors,errors;assert not writes,writes
  (OUT/'report.json').write_text(json.dumps({'version':'2.8.6','full_app_offline':True,'directions':'main/branch/legacy/touch/reposition/cancel','lager':'independent size, own cache+queue, peer local override, restart, quota, hide, user isolation','layouts':6,'external_writes':writes,'errors':errors},indent=2))
  print('OK 2.8.6: full app touch + points, thin defaults, own/peer lagers, persisted styles/positions, quota/cancel/isolation, six layouts; no external writes')
  await ctx.close();await browser.close()
asyncio.run(main())
