"""Stvarni Leaflet: projektantska razdjelnica, GPS nastavak, projektne strelice i outline."""
import asyncio,importlib.util,mimetypes,os
from pathlib import Path
from playwright.async_api import async_playwright
spec=importlib.util.spec_from_file_location('project',Path(__file__).with_name('project-vlake-220.py'));u=importlib.util.module_from_spec(spec);spec.loader.exec_module(u);b=u.b
panel=b.section('      <section class="sec proj-akt-only project-arrows">','    </div><!-- /proj-panel -->')
toolbar=b.section('<div id="direction-pick-toolbar"','<script src="static/js/vlaka-outline.js">')
extra='''
let actI=null,recPaused=false,_puteviLayerFg=null;
'''+ '\n'.join(b.function(n) for n in ['ptDist','ptAtFrac','_abVisinaSync','zoomForScale'])+'''
window.directionReady=new Promise(resolve=>window.addEventListener('DOMContentLoaded',async()=>{await fixtureReady;document.querySelector('#fixture-project').style.display='none';map.createPane('vlakeLines');window.testV=vlake.find(v=>v.nm==='T10');testV.pts=[{la:44.9,lo:16},{la:44.9,lo:16.004},{la:44.9,lo:16.01}];testV.poly.setLatLngs(testV.pts.map(p=>[p.la,p.lo]));window.peer=kolegeVlakeMap['B::T2'];VlakaDirection.refresh();resolve();},{once:true}));
'''
fixture=u.fixture.replace('</body>','<div id="fixture-arrows" style="display:none;position:fixed;inset:12px 0 88px;overflow:auto;background:var(--field-card);z-index:1800;padding:12px">'+panel+'</div>'+toolbar+b.section('      <!-- ═══ GPS SNIMANJE BANNER ═══ -->','      <!-- TRAG RECORDING BANNER -->')+'<script>'+extra+'</script><script src="/static/js/vlaka-outline.js"></script><script src="/static/js/vlaka-direction.js"></script></body>')
async def tap_fraction(page,f):
 xy=await page.evaluate('f=>{const p=ptAtFrac(testV.pts,f),xy=map.latLngToContainerPoint([p.la,p.lo]),r=map.getContainer().getBoundingClientRect();return {x:r.left+xy.x,y:r.top+xy.y}}',f)
 await page.touchscreen.tap(xy['x'],xy['y'])
async def main():
 b.OUT.mkdir(parents=True,exist_ok=True)
 async with async_playwright() as p:
  browser=await p.chromium.launch(headless=True,**({'executable_path':os.environ['UI_CHROMIUM']} if os.environ.get('UI_CHROMIUM') else {}));page=await browser.new_page(viewport={'width':390,'height':800},has_touch=True);errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  async def route(r):
   if r.request.url=='https://ui.test/':await r.fulfill(content_type='text/html',body=fixture)
   elif r.request.url.startswith('https://ui.test/'):
    f=b.ROOT/r.request.url.split('ui.test/',1)[1].split('?',1)[0]
    if f.is_file():await r.fulfill(content_type=mimetypes.guess_type(str(f))[0] or 'application/octet-stream',body=f.read_bytes())
    else:await r.fulfill(status=404,body='fixture')
   else:await r.abort()
  await page.route('**/*',route);await page.goto('https://ui.test/');await page.evaluate('directionReady');assert not errors,errors
  # Stara dvosmjerna postavka ne smije ponovo stvarati matematičku polovinu.
  await page.evaluate("localStorage.setItem(VlakaDirection.storeKey('P'),JSON.stringify({[VlakaDirection.identity(testV)]:'both'}));VlakaDirection.draw(testV)")
  assert await page.evaluate('testV._directionMarkers.length')==0
  await page.evaluate("testV._manual=true;showVlakaPopup(vlake.indexOf(testV),testV.poly.getBounds().getCenter())");await page.get_by_role('button',name='↔ Odredi dvosmjer',exact=True).click();assert await page.evaluate('VlakaDirection.isPicking()')
  # Dodir prolazi kroz postojeći klikabilni marker i hit sloj vlake.
  await page.evaluate("()=>{const p=ptAtFrac(testV.pts,.2);window.blockClicks=0;window.block=L.marker([p.la,p.lo],{icon:L.divIcon({className:'block',html:'<b style=\"display:block;width:40px;height:40px;background:red\">X</b>',iconSize:[40,40],iconAnchor:[20,20]}),bubblingMouseEvents:false}).on('click',()=>blockClicks++).addTo(map)}")
  await tap_fraction(page,.2);assert await page.evaluate('blockClicks')==0;assert not await page.evaluate('VlakaDirection.isPicking()');assert await page.evaluate("!map.getContainer().classList.contains('direction-picking')")
  assert abs(await page.evaluate('VlakaDirection.splitFor(testV).f')-.2)<.02
  assert await page.evaluate('testV._directionMarkers.map(m=>m._directionSign)')==[-1,0,1]
  assert await page.evaluate("testV._directionMarkers.filter(m=>m._directionSign===0).length")==1
  icon=await page.evaluate("()=>{const m=testV._directionMarkers.find(m=>m._directionSign===0),e=m.getElement().querySelector('svg'),p=e.querySelector('path:last-child');return {label:e.getAttribute('aria-label'),path:p.getAttribute('d'),stroke:p.getAttribute('stroke-width'),bounds:{width:p.getBBox().width,height:p.getBBox().height}}}")
  assert icon['label']=='Dvosmjer koji je odabrao projektant';assert 'L -9 0' in icon['path'] and 'L 9 0' in icon['path'];assert icon['bounds']['width']==18
  assert await page.locator('#project-arrow-placement').count()==1
  before=await page.evaluate('testV._directionMarkers.length')
  for mode in ['beside','on','beside']:
   await page.evaluate("mode=>{VlakaDirection.change('placement',mode);map.setZoom(14,{animate:false});VlakaDirection.refresh()}",mode)
   distances=await page.evaluate("testV._directionMarkers.map(m=>{const p=ptAtFrac(testV.pts,m._directionFraction),a=map.latLngToLayerPoint([p.la,p.lo]),b=map.latLngToLayerPoint(m.getLatLng());return Math.hypot(a.x-b.x,a.y-b.y)})")
   assert await page.evaluate('testV._directionMarkers.length')==before
   assert all(v>10 if mode=='beside' else v<1 for v in distances),distances
  await page.evaluate('map.removeLayer(block)')
  # Pregled jednog odjela pri stvarnoj CSS razmjeri 1:10.000 (isti izračun kao app).
  await page.evaluate("window.testDepartment=L.polygon([[44.898,15.999],[44.902,15.999],[44.902,16.011],[44.898,16.011]],{color:'#64748b',weight:1.5,fillOpacity:.08}).addTo(map);map.options.zoomSnap=0;map.setView([44.9,16.005],zoomForScale(10000,44.9),{animate:false})")
  for theme in ['day','dark']:
   for mode in ['on','beside']:
    await page.evaluate("([theme,mode])=>{document.documentElement.dataset.fieldTheme=theme;VlakaDirection.change('placement',mode);document.querySelector('#map-scale-val').textContent='10 000'}",[theme,mode])
    assert await page.evaluate('testV._directionMarkers.filter(m=>m._directionSign===0).length')==1
    await page.screenshot(path=str(b.OUT/f'arrows-department-10000-{theme}-{mode}.png'))
  await page.evaluate('map.removeLayer(testDepartment)')
  await page.evaluate("VlakaDirection.change('placement','on')")
  await page.evaluate('block.addTo(map)')
  await tap_fraction(page,.2);assert await page.evaluate('blockClicks')==1;await page.evaluate('map.removeLayer(block)')
  # Prekid/otkaz ne mijenjaju prethodnu razdjelnicu; tačka van vlake odbijena.
  await page.evaluate('VlakaDirection.startPick(testV)');await page.keyboard.press('Escape');assert not await page.evaluate('VlakaDirection.isPicking()');assert abs(await page.evaluate('VlakaDirection.splitFor(testV).f')-.2)<.02
  await page.evaluate("VlakaDirection.startPick(testV);map.fire('click',{latlng:L.latLng(45,17)})");assert await page.evaluate('VlakaDirection.isPicking()');await page.evaluate("_aktivniProjektId='Q';VlakaDirection.refresh()");assert not await page.evaluate('VlakaDirection.isPicking()');await page.evaluate("_aktivniProjektId='P'")
  # Završeni ručni krak: direktno dugme, izbor na 80%, jedan ↔ i smjerovi prema krajevima.
  await page.evaluate("()=>{window.mainV=testV;window.branch={nm:'T10.1',kr:1,projektId:'P',pts:testV.pts.map(p=>({...p})),color:'#2563eb',extraLabels:[],poly:L.polyline(testV.pts.map(p=>[p.la,p.lo]),{weight:4}).addTo(map)};vlake.push(branch);testV=branch;showVlakaPopup(vlake.indexOf(branch),branch.poly.getBounds().getCenter())}")
  await page.get_by_role('button',name='↔ Odredi dvosmjer',exact=True).click();await tap_fraction(page,.8)
  assert abs(await page.evaluate('VlakaDirection.splitFor(branch).f')-.8)<.02
  assert await page.evaluate('branch._directionMarkers.map(m=>m._directionSign)')==[-1,0,1]
  assert abs(await page.evaluate('VlakaDirection.splitFor(mainV).f')-.2)<.02
  await page.evaluate('testV=mainV;VlakaDirection.clear(branch);map.removeLayer(branch.poly);vlake.splice(vlake.indexOf(branch),1)')
  await page.context.set_offline(True)
  # Čuvanje po nalogu/projektu; prilagodbe rade i za kolegine vlake.
  await page.evaluate("VlakaDirection.change('color','#dc2626');VlakaDirection.change('width',4);VlakaDirection.change('size',40);VlakaDirection.change('count',4)")
  assert await page.evaluate('testV._directionMarkers.filter(m=>m._directionSign!==0).length')==4
  await page.evaluate("_vpSharedKey='B::T2';_vpIdx=null;VlakaDirection.setPopup('start')")
  assert await page.evaluate('peer._directionMarkers.length')==4
  assert '#dc2626' in await page.evaluate('peer._directionMarkers[0].options.icon.options.html')
  assert await page.evaluate('peer._directionMarkers[0].options.icon.options.iconSize[0]')==40
  await page.evaluate("VlakaDirection.change('visible',false)");assert await page.evaluate('testV._directionMarkers.length+peer._directionMarkers.length')==0
  await page.evaluate("VlakaDirection.change('visible',true);VlakaDirection.change('separator',false)");assert await page.evaluate('testV._directionMarkers.length')==4
  await page.evaluate("_aktivniProjektId='Q'");assert await page.evaluate("VlakaDirection.settingsFor('Q').size")==30;await page.evaluate("_aktivniProjektId='P';sbUser={id:'C'}");assert await page.evaluate("VlakaDirection.modeFor(testV)==='auto'&&VlakaDirection.settingsFor('P').size===30");await page.evaluate("sbUser={id:'A'}")
  # Quota ne smije potvrditi postavku ili novi položaj razdjelnice.
  await page.evaluate("()=>{window.oldSet=Storage.prototype.setItem;Storage.prototype.setItem=function(){throw new DOMException('full','QuotaExceededError')};}")
  await page.evaluate("VlakaDirection.change('size',48);VlakaDirection.startPick(testV)");await tap_fraction(page,.8);assert await page.evaluate('VlakaDirection.isPicking()');assert abs(await page.evaluate('VlakaDirection.splitFor(testV).f')-.2)<.02;assert await page.evaluate("VlakaDirection.settingsFor('P').size")==40
  await page.evaluate('Storage.prototype.setItem=oldSet;VlakaDirection.cancelPick()')
  # Snimanje: razdjelnica na zadnjoj prihvaćenoj GPS tački, ostaje ista kad vlaka raste.
  await page.evaluate("recOn=true;actI=vlake.indexOf(testV);VlakaDirection.refreshRecording();VlakaDirection.markRecording()")
  at=await page.evaluate('VlakaDirection.recordFor(testV).split.atM')
  await page.evaluate('recPaused=true;VlakaDirection.refreshRecording();VlakaDirection.markRecording()');assert await page.locator('#rec-direction-split').is_disabled();assert await page.evaluate('VlakaDirection.recordFor(testV).split.atM')==at;await page.evaluate('recPaused=false')
  await page.evaluate("testV.pts.push({la:44.9,lo:16.02});testV.poly.setLatLngs(testV.pts.map(p=>[p.la,p.lo]));VlakaDirection.draw(testV)")
  assert abs(await page.evaluate('VlakaDirection.splitFor(testV).atM')-at)<1;assert abs(await page.evaluate('VlakaDirection.splitFor(testV).f')-.5)<.01
  await page.evaluate('recOn=false;actI=null;VlakaDirection.refreshRecording()')
  # Stvarni sažeti panel i dvosmjer na donjoj traci; ostaje prostor za kartu.
  for theme in ['day','dark']:
   for w,h in [(320,568),(390,800),(568,320)]:
    await page.set_viewport_size({'width':w,'height':h});await page.evaluate("t=>{document.documentElement.dataset.fieldTheme=t;recOn=true;recPaused=false;actI=vlake.indexOf(testV);document.querySelector('#rec-banner').classList.add('show');for(const e of document.querySelectorAll('#action-bar>button,#action-bar>div'))e.style.display=['ab-krak-l','ab-krak-d','rec-direction-split','ab-pauza'].includes(e.id)?'':'none';VlakaDirection.refreshRecording();_abVisinaSync()}",theme)
    assert await page.locator('#btn-preciz,#btn-freeview').count()==0
    for selector in ['#rec-banner','#action-bar','#rec-direction-split']:await b.bounds(page,selector,w,h)
    assert await page.locator('#rec-direction-split').evaluate('e=>e.getBoundingClientRect().height')>=44
    assert await page.locator('#rec-banner').evaluate('e=>e.getBoundingClientRect().height')<110
    assert await page.locator('#rec-row2').is_hidden()
    await page.screenshot(path=str(b.OUT/f'recording-compact-{theme}-{w}-{h}.png'))
  await page.evaluate("recOn=false;actI=null;VlakaDirection.refreshRecording();document.querySelector('#rec-banner').classList.remove('show')")
  # Outline je isti za vlastite/kolegine linije i krakove; ne mijenja izvorne boje.
  await page.evaluate("window.sourceColor=testV.color;_bojaChange('outline',true)");assert await page.evaluate('testV.poly.options.vlakaOutline&&peer.poly.options.vlakaOutline');assert await page.evaluate('testV.color===sourceColor')
  # Stvarni SVG fallback: uvezan i pomjeren sa glavnim pathom, bez klikova i curenja.
  await page.evaluate("window.ol=L.polyline([[44.9,16],[44.901,16]],{color:'#000000',weight:4,dashArray:'8 2',vlakaOutline:true,renderer:L.svg()}).addTo(map)")
  assert await page.evaluate("ol._vlakaOutlinePath.getAttribute('stroke')")=='#ffffff';assert abs(float(await page.evaluate("ol._vlakaOutlinePath.getAttribute('stroke-width')"))-4*1.14)<.001
  await page.evaluate("ol.setLatLngs([[44.9,16],[44.902,16.002]])");assert await page.evaluate("ol._vlakaOutlinePath.getAttribute('d')===ol._path.getAttribute('d')")
  await page.evaluate("ol.setStyle({color:'#ffffff'})");assert await page.evaluate("ol._vlakaOutlinePath.getAttribute('stroke')")=='#000000';await page.evaluate('ol.setStyle({vlakaOutline:false})');assert await page.evaluate('ol._vlakaOutlinePath') is None;await page.evaluate('map.removeLayer(ol)')
  # Stvarni Canvas: čuva ritam crtica/tačaka i dodaje kontrastni rub prije glavne linije.
  for mode in ['solid','dash','dot']:
   result=await page.evaluate("""async mode=>{map.setView([44.9,16.005],16,{animate:false});const renderer=L.canvas(),style=_vlakaStroke(mode,8,16),line=L.polyline([map.containerPointToLatLng([40,180]),map.containerPointToLatLng([350,180])],{color:'#000000',weight:8,opacity:1,...style,vlakaOutline:true,renderer}).addTo(map);await new Promise(r=>setTimeout(r,100));const r=renderer._bounds.min,p=map.containerPointToLayerPoint([40,180]),data=renderer._ctx.getImageData(Math.round(p.x-r.x),Math.round(p.y-r.y)-6,280,13).data;let edge=0,ink=0;for(let i=0;i<data.length;i+=4){if(data[i+3]>5&&data[i]>150&&data[i+1]>150&&data[i+2]>150)edge++;if(data[i+3]>100&&data[i]<50&&data[i+1]<50&&data[i+2]<50)ink++;}map.removeLayer(line);map.removeLayer(renderer);return {edge,ink}}""",mode)
   assert result['edge']>0 and result['ink']>0,(mode,result)
  for theme in ['day','dark']:
   for w,h in [(320,568),(390,800),(568,320),(800,600)]:
    await page.set_viewport_size({'width':w,'height':h});await page.evaluate("t=>{document.documentElement.dataset.fieldTheme=t;document.querySelector('#fixture-arrows').style.display='block';VlakaDirection.refreshPanel()}",theme)
    assert await page.locator('#fixture-arrows').evaluate('(e)=>e.scrollWidth<=e.clientWidth+1');await page.screenshot(path=str(b.OUT/f'project-arrows-{theme}-{w}-{h}.png'))
    await page.evaluate("document.querySelector('#fixture-arrows').style.display='none';showVlakaPopup(vlake.indexOf(testV),map.getCenter())");await b.bounds(page,'#vlaka-popup',w,h);await page.screenshot(path=str(b.OUT/f'direction-popup-{theme}-{w}-{h}.png'));await page.evaluate('closeVlakaPopup()')
  # Offline reload dobija istu tačku i izgled.
  expected=await page.evaluate('VlakaDirection.recordFor(testV).split');await page.reload();await page.evaluate('directionReady');assert await page.evaluate('VlakaDirection.recordFor(testV).split')==expected;assert await page.evaluate("VlakaDirection.settingsFor('P').size")==40;assert not errors,errors
  await browser.close()
 print('OK: designer split touch at 20%, cancel/stale/quota, GPS extension, project/account styles own+peer, real SVG/Canvas outline and 16 PNG')
if __name__=='__main__':asyncio.run(main())
