"""Pregled 1/2: puni app, stvarni Leaflet/IDB; lažni korisnici, bez server upisa."""
import asyncio,json,mimetypes,os,subprocess
from pathlib import Path
from playwright.async_api import async_playwright
ROOT=Path(__file__).resolve().parents[2]
KML='<kml><Placemark><name>Odjel</name><Polygon><outerBoundaryIs><LinearRing><coordinates>16,44.9 16.01,44.9 16.01,44.91 16,44.91 16,44.9</coordinates></LinearRing></outerBoundaryIs></Polygon></Placemark></kml>'
SEED="""()=>{sbUser={id:'11111111-1111-4111-8111-111111111111'};sbProfile={id:sbUser.id,odobren:true,sumarija:'TEST',ime:'Test',prezime:'Pregled'};_revealApp();_projekti=[{id:'P',odjel:'105',gj:'Test',korisnik_id:sbUser.id},{id:'Q',odjel:'206',gj:'Drugi',korisnik_id:sbUser.id}];_aktivniProjektId='P';switchTab('karta');}"""
async def main():
 async with async_playwright() as p:
  browser=await p.chromium.launch(executable_path=os.environ.get('UI_CHROMIUM') or None)
  ctx=await browser.new_context(service_workers='block',viewport={'width':390,'height':800})
  requests=[];errors=[]
  async def route(r):
   url=r.request.url
   if not url.startswith('http://audit.test/'):
    requests.append({'url':url,'method':r.request.method});await r.abort();return
   name=url.split('audit.test/',1)[1].split('?',1)[0] or 'index.html';f=ROOT/name
   if name=='GRANICE.kml':await r.fulfill(content_type='application/xml',body='<kml><Document/></kml>')
   elif os.environ.get('AUDIT_BASELINE') and name in ['index.html','static/js/tab-data.js']:
    data=subprocess.check_output(['git','show','HEAD:'+name],cwd=ROOT);await r.fulfill(content_type=mimetypes.guess_type(name)[0],body=data)
   elif f.is_file():await r.fulfill(content_type=mimetypes.guess_type(str(f))[0] or 'application/octet-stream',body=f.read_bytes())
   else:await r.fulfill(status=404,body='fixture')
  await ctx.route('**/*',route);await ctx.route_web_socket('**/*',lambda ws:ws.close())
  await ctx.add_init_script("Object.defineProperty(navigator,'onLine',{get:()=>false});navigator.geolocation.watchPosition=()=>1;navigator.geolocation.clearWatch=()=>{};")
  await ctx.add_init_script("const uid='11111111-1111-4111-8111-111111111111';if(!localStorage.getItem('tvlake_ol_profile'))localStorage.setItem('tvlake_ol_profile',JSON.stringify({ts:Date.now(),data:{id:uid,odobren:true,sumarija:'TEST',ime:'Test',prezime:'Pregled'}}));localStorage.setItem('tvlake_device_last_user',uid);")
  page=await ctx.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
  await page.goto('http://audit.test/');await page.wait_for_function('_startupRestore._done&&!!window.FieldStore');await page.evaluate(SEED)
  cdp=await ctx.new_cdp_session(page);await cdp.send('Emulation.setCPUThrottlingRate',{'rate':4})
  # Removing first layer and adding another cannot recolor the remaining hatch.
  await page.evaluate('''async data=>{
    for(const name of ['A.kml','B.kml'])await _localKmlSaveContent(name,data,'#16a34a');await _localKmlRestore();
    window.svgRenderer=L.svg();for(const k of kmlLs)for(const l of k.grp.getLayers()){map.removeLayer(l);l.options.renderer=svgRenderer;l.addTo(map);}
    Object.assign(kmlLs[0],{fill:true,fillPattern:'diagonal',fillCol:'#dc2626'});Object.assign(kmlLs[1],{fill:true,fillPattern:'horizontal',fillCol:'#2563eb'});applyKmlStyle(0);applyKmlStyle(1);saveKmlStyles();
    window.remaining=kmlLs[1];window.patternBefore=remaining.grp.getLayers()[0].options.fillColor;
    delK(0);await _localKmlSaveContent('C.kml',data,'#16a34a');await _localKmlRestore();for(const l of kmlLs[1].grp.getLayers()){map.removeLayer(l);l.options.renderer=svgRenderer;l.addTo(map);}Object.assign(kmlLs[1],{fill:true,fillPattern:'vertical',fillCol:'#f97316'});applyKmlStyle(1);
  }''',KML)
  assert await page.evaluate('''()=>{const id=patternBefore.slice(5,-1);return remaining.grp.getLayers()[0].options.fillColor===patternBefore&&document.getElementById(id).querySelector('line').getAttribute('stroke')==='#2563eb';}'''),'Šrafura preostalog sloja promijenjena nakon del/add'
  # Pending server files have saved styles but no geometry/Leaflet group yet.
  assert await page.evaluate("""()=>{const k={_key:'bucket/pending.kml',grp:null,fill:true,fillPattern:'diagonal',fillCol:'#dc2626'};kmlLs.push(k);try{applyKmlStyle(kmlLs.length-1);return _ensureKmlPattern(kmlLs.length-1)===null;}finally{kmlLs.pop();}}"""),'Stil nepreuzetog KML fajla ruši pregled'
  # Actual default Canvas KML: hatching exists and respects opacity/changes.
  assert await page.evaluate('''async data=>{
    await _localKmlSaveContent('Canvas.kml',data,'#16a34a');await _localKmlRestore();const k=kmlLs.at(-1),l=k.grp.getLayers()[0];Object.assign(k,{fill:true,fillPattern:'diagonal',fillCol:'#dc2626',fillOpacity:.25});applyKmlStyle(kmlLs.length-1);
    const first=l.options.fillColor,c=document.createElement('canvas');c.width=c.height=16;const ctx=c.getContext('2d');ctx.fillStyle=first;ctx.fillRect(0,0,16,16);const px=ctx.getImageData(0,0,16,16).data,alpha=[];for(let i=3;i<px.length;i+=4)alpha.push(px[i]);
    k.fillOpacity=.7;applyKmlStyle(kmlLs.length-1);return l._renderer instanceof L.Canvas&&first instanceof CanvasPattern&&Math.max(...alpha)>30&&Math.max(...alpha)<100&&Math.min(...alpha)===0&&l.options.fillColor!==first;
  }''',KML),'Canvas šrafura/jačina nisu nacrtani'
  # Provider refusal must keep its only durable catalogue entry, with no IDB leaks.
  assert await page.evaluate('''async()=>{
    const db=await _sqlIdbOpen();await new Promise((res,rej)=>{const tx=db.transaction('maps','readwrite');tx.objectStore('maps').put({name:'native-test',meta:{_nativeId:'native-fixture'}});tx.oncomplete=res;tx.onerror=()=>rej(tx.error);});db.close();
    const old=NativeOfflineMaps.remove;NativeOfflineMaps.remove=async()=>{throw Error('provider denied')};let rejected=false;
    try{await _sqlIdbDeleteDirect('native-test');}catch(e){rejected=true;}finally{NativeOfflineMaps.remove=old;}
    const check=await _sqlIdbOpen();const value=await new Promise(res=>{const r=check.transaction('maps').objectStore('maps').get('native-test');r.onsuccess=()=>res(r.result);});check.close();return rejected&&value?.meta?._nativeId==='native-fixture';
  }'''),'Izgubljen katalog pri neuspjelom native brisanju'
  # Successful deletion clears only that map's persisted preferences/favorites.
  assert await page.evaluate("""async()=>{
    const old=NativeOfflineMaps.remove;NativeOfflineMaps.remove=async()=>({ok:true});
    localStorage.setItem('lm_thumb_v3_native-test','thumb');localStorage.setItem('tvlake_sqlmap_prefs_v1',JSON.stringify({'native-test':{hidden:true},Keep:{opacity:.7}}));_sqlSkipAdd('native-test');_saveLastMap('sqlite',null,'native-test');_mapFavs=[{type:'sqlite',sqliteId:'native-test'},{type:'sqlite',sqliteId:'Keep'}];
    try{await _sqlIdbDeleteDirect('native-test');}finally{NativeOfflineMaps.remove=old;}
    const db=await _sqlIdbOpen(),entry=await new Promise(res=>{const r=db.transaction('maps').objectStore('maps').get('native-test');r.onsuccess=()=>res(r.result)});db.close();return !entry&&!localStorage.getItem('lm_thumb_v3_native-test')&&!_sqlMapPrefs()['native-test']&&_sqlMapPrefs().Keep.opacity===.7&&!_sqlSkipList().includes('native-test')&&JSON.parse(localStorage.getItem('tvlake_last_map')).type==='none'&&_mapFavs.length===1&&_mapFavs[0].sqliteId==='Keep';
  }"""),'Brisanje ostavilo stare postavke ili obrisalo drugu kartu'
  # Photograph restore delayed past deletion cannot populate its new neighbor.
  assert await page.evaluate('''async()=>{
    window.realFotoGet=_kmlcGet;window.photoResolvers={};_kmlcGet=key=>new Promise(r=>photoResolvers[key]=r);
    _locFotos=[];localStorage.setItem(_FOTO_KEY,JSON.stringify([1,2].map(ts=>({la:44.9,lo:16,ts,thumb:'',sbId:null}))));_restoreFotos();const second=_locFotos[1];_locFotos.splice(0,1);
    photoResolvers['fotofull:1']('WRONG');await new Promise(r=>setTimeout(r,20));const ok=second.full===null;
    photoResolvers['fotofull:2']('RIGHT');await new Promise(r=>setTimeout(r,20));_kmlcGet=realFotoGet;return ok&&second.full==='RIGHT';
  }'''),'Kasna fotografija upisana u susjedni zapis'
  # Switching/closing the actual viewer ignores a stale asynchronous response.
  assert await page.evaluate('''async()=>{
    _locFotos=[{ts:11,la:44.9,lo:16,thumb:'',full:null},{ts:12,la:44.9,lo:16,thumb:'',full:null}];window.pendingPhotos={};_kmlcGet=key=>new Promise(r=>pendingPhotos[key]=r);
    const first=openFotoFullscreen(11,false),second=openFotoFullscreen(12,false);
    pendingPhotos['fotofull:12']('data:image/png;base64,RIGHT');await second;
    pendingPhotos['fotofull:11']('data:image/png;base64,WRONG');await first;
    const ok=document.getElementById('foto-fullscreen-img').getAttribute('src')==='data:image/png;base64,RIGHT'&&_locFotos[0].full===null;
    _locFotos[1].full=null;const late=openFotoFullscreen(12,false);closeFotoFullscreen();pendingPhotos['fotofull:12']('data:image/png;base64,LATE');await late;
    _kmlcGet=realFotoGet;return ok&&document.getElementById('foto-fullscreen-img').getAttribute('src')==='';
  }'''),'Kasni odgovor promijenio drugi/zatvoren pregled'
  # Real own/colleague layers, labels, hit layer, project hide and list -> buffer.
  await page.evaluate('''async()=>{
    _applyVlakeRows([{id:'own1',nm:'T1',br:1,kr:0,projekt_id:'P',korisnik_id:sbUser.id,pts:[{la:44.9,lo:16},{la:44.901,lo:16.001}],boja:'#16a34a'}]);
    await sbLoadKolegeVlake([{id:'col2',nm:'T2',br:2,kr:0,korisnik_id:'B',projektant_ime:'Amir Kolega',pts:[{la:44.9,lo:16.003},{la:44.902,lo:16.004}]}]);toggleProjektVlakeVisible('P');
  }''')
  assert await page.evaluate("!map.hasLayer(vlake[0].poly)&&!map.hasLayer(kolegeVlakeMap['B::T2'].poly)&&kolegeVlakeMap['B::T2'].labels.every(l=>!map.hasLayer(l))")
  await page.evaluate("switchTab('vlake');rndKolegeVlakeList()")
  await page.locator('#kolege-vl .vrow').focus();await page.keyboard.press('Enter')
  assert await page.locator('#vlaka-popup').is_visible()
  assert 'Amir Kolega' in await page.locator('#vp-info').inner_text()
  await page.locator('#vp-buffer').click();assert await page.evaluate('bufLayers.length>0')
  assert await page.evaluate("!_getHiddenProjektIds().has('P')&&map.hasLayer(kolegeVlakeMap['B::T2'].poly)")
  await page.evaluate("clearBuffers();closeVlakaPopup();toggleProjektVlakeVisible('P');_patchKolegaVlaka({id:'col2',nm:'T2',korisnik_id:'B',pts:[{la:44.9,lo:16.003},{la:44.903,lo:16.004}]})")
  assert await page.evaluate("!map.hasLayer(kolegeVlakeMap['B::T2'].poly)&&kolegeVlakeMap['B::T2'].labels.every(l=>!map.hasLayer(l))&&kolegeLabels.length===kolegeVlakeMap['B::T2'].labels.length")
  # Previous project's peer cache cannot affect another department offline.
  assert await page.evaluate("""()=>{
    _aktivniProjektId='Q';_updVlakeMapVisibility();const ok=_nextMainBr()===1&&_kolegaVlakaDup('T2')===null&&_projSveVlake().length===0&&!map.hasLayer(kolegeVlakeMap['B::T2'].poly)&&kolegeVlakeMap['B::T2'].labels.every(l=>!map.hasLayer(l));_aktivniProjektId='P';_updVlakeMapVisibility();return ok;
  }"""),'Stari keš kolege utiče na drugi projekat'
  # Slow activation A must not finalize realtime/navigation after activation B.
  assert await page.evaluate("""async()=>{
    const load=sbLoadKolegeVlake,start=sbStartRealtime;const pending=[],final=[];sbLoadKolegeVlake=()=>new Promise(r=>pending.push(r));sbStartRealtime=()=>final.push(_aktivniProjektId);
    try{const a=aktivirajProjekt('P'),b=aktivirajProjekt('Q'),c=aktivirajProjekt('P');pending[2]();await c;pending[1]();await b;pending[0]();await a;return final.join(',')==='P'&&_aktivniProjektId==='P';}finally{sbLoadKolegeVlake=load;sbStartRealtime=start;_aktivniProjektId='P';}
  }"""),'Zakašnjela aktivacija nadjačala noviji projekat'
  # Enter cannot bypass the typed name, and reordered arrays cannot change target.
  await page.evaluate("""()=>{
    _setProjektVlakeHidden('P',false);_applyVlakeRows([1,2,3].map(n=>({id:'own'+n,nm:'T'+n,br:n,kr:0,projekt_id:'P',pts:[{la:44.9,lo:16+n*.001},{la:44.901,lo:16+n*.001}]})));window.realDelete=sbDeleteVlaka;window.deleted=[];sbDeleteVlaka=v=>deleted.push(v.nm);dlV(1);
  }""")
  await page.locator('#del-modal-input').focus();await page.keyboard.press('Enter')
  assert await page.evaluate('vlake.length===3&&deleted.length===0')
  await page.locator('#del-modal-input').fill('WRONG');await page.keyboard.press('Enter')
  assert await page.evaluate('vlake.length===3&&deleted.length===0')
  await page.evaluate('vlake.unshift(vlake.pop())')
  await page.locator('#del-modal-input').fill('T2');await page.keyboard.press('Enter')
  assert await page.evaluate("vlake.map(v=>v.nm).sort().join(',')==='T1,T3'&&deleted.join(',')==='T2'")
  assert await page.evaluate("""()=>{
    dlV(0);document.getElementById('del-modal-input').value=vlake[0].nm;const user=sbUser;sbUser={id:'Other'};_delConfirm();sbUser=user;const ok=vlake.length===2&&deleted.length===1;recOn=true;dlV(0);const recordingSafe=_delPendingRef===null;recOn=false;sbDeleteVlaka=realDelete;return ok&&recordingSafe;
  }"""),'Promjena naloga / aktivno GPS snimanje nisu zaštitili brisanje'
  # Project/user-specific sort/search/filter survive actual reload, plus clear action.
  await page.evaluate("switchTab('vlake');_vlSortSet('duzina');_vlTraziSet('T1');_tabFilter('pending');_tabRemember('vlake');localStorage.setItem('tvlake_akt_proj','P')")
  await page.reload();await page.wait_for_function('_startupRestore._done');await page.evaluate(SEED)
  await page.evaluate("switchTab('vlake');rndList()")
  assert await page.evaluate("_vlSort==='duzina'&&_vlTrazi==='T1'")
  assert await page.locator('#data-vl-controls button[aria-pressed=true]').inner_text()=='Za slanje'
  await page.get_by_role('button',name='Očisti filtere',exact=True).click();assert await page.evaluate("_vlTrazi===''&&!_vlSamoStrme")
  await page.evaluate("_vlTraziSet('P only');_tabRemember('vlake');_aktivniProjektId='Q';rndList()")
  assert await page.evaluate("_vlTrazi===''")
  await page.evaluate("_tabRemember('vlake');_aktivniProjektId='P';rndList()")
  assert await page.evaluate("_vlTrazi==='P only'")
  await page.evaluate("sbUser={id:'Other'};rndList()")
  assert await page.evaluate("_vlTrazi===''")
  # Header navigation must actually show the Projects tab and escaped project name.
  await page.evaluate(SEED);await page.evaluate("_projekti[0].gj='<img id=injected src=x>';_applyVlakeRows([{nm:'T1',br:1,kr:0,projekt_id:'P',pts:[{la:44.9,lo:16},{la:44.901,lo:16.001}]}]);switchTab('vlake');_tabReset()")
  assert await page.locator('#injected').count()==0
  await page.locator('.vph-nav').click();assert await page.evaluate("_activeTab==='projekat'")
  # Small-screen design: actual filtered lists and map favorite control.
  await page.evaluate("_loadmapManageShown=[{name:'Native fixture'}];_loadmapToggleFav(0)")
  assert await page.evaluate("_mapFavs.some(f=>f.sqliteId==='Native fixture')")
  await page.evaluate("_loadmapManageShown=[{name:'Native fixture'}];_loadmapToggleFav(0)")
  assert await page.evaluate("!_mapFavs.some(f=>f.sqliteId==='Native fixture')")
  await page.evaluate("_projekti[0].gj='Gospodarska jedinica · Test';closeVlakaPopup();_delCancel()")
  out=ROOT/'outputs/ui-preview';out.mkdir(parents=True,exist_ok=True)
  for theme in ['day','dark']:
   for w,h in [(320,568),(390,800),(568,320)]:
    await page.set_viewport_size({'width':w,'height':h});await page.evaluate("t=>{document.documentElement.dataset.fieldTheme=t;switchTab('vlake');_vlTraziSet('T1');}",theme)
    assert await page.locator('#panel').evaluate('e=>e.scrollWidth<=e.clientWidth+1')
    await page.screenshot(path=str(out/f'audit-vlake-{theme}-{w}.png'))
  assert not errors,errors
  assert not [r for r in requests if r['method'] in ['POST','PUT','PATCH','DELETE']],requests
  await browser.close();print('Pregled 1/2: KML šrafure, native delete failure/IDB, foto race, kolegina vlaka/hide/realtime/bafer, aktivacija/odvajanje projekata, Enter/brisanje/scope, stvarni restart/filteri/nalozi, navigacija/escape i favorite: OK (puni app CPU4x, bez server upisa)')
if __name__=='__main__':asyncio.run(main())
