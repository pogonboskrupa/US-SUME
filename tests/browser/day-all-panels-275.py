"""Dnevni mod: svi paneli i podprozori, obje uloge, popunjeni podaci; bez vanjskih upisa."""
import asyncio,importlib.util,mimetypes,os,tempfile,json,sys
from pathlib import Path
from playwright.async_api import async_playwright
ROOT=Path(__file__).resolve().parents[2]
KML='<kml><Document><Placemark><name>GitHub putevi</name><LineString><coordinates>16,44.9 16.001,44.901</coordinates></LineString></Placemark></Document></kml>'
spec=importlib.util.spec_from_file_location('raster',ROOT/'tests/browser/load-map-233.py');raster=importlib.util.module_from_spec(spec);spec.loader.exec_module(raster)
OUT=ROOT/'outputs/275'/os.environ.get('DAY_UI_WIDTH','390');OUT.mkdir(parents=True,exist_ok=True)
A='11111111-1111-4111-8111-111111111111';B='22222222-2222-4222-8222-222222222222'
AUDIT=r"""(selector)=>{
 const root=document.querySelector(selector);if(!root)return [{missing:selector}];
 const rgb=s=>{const m=s.match(/[\d.]+/g)?.map(Number);return m?.length>=3?m:null};
 const mix=(a,b,o)=>b.map((n,i)=>a[i]*o+n*(1-o));
 const lum=c=>{const v=c.map(n=>{n/=255;return n<=.04045?n/12.92:((n+.055)/1.055)**2.4});return v[0]*.2126+v[1]*.7152+v[2]*.0722};
 const ratio=(a,b)=>(Math.max(lum(a),lum(b))+.05)/(Math.min(lum(a),lum(b))+.05);
 const bg=e=>{let c=[255,255,255];const chain=[];for(let p=e;p;p=p.parentElement)chain.unshift(p);for(const p of chain){const st=getComputedStyle(p),v=rgb(st.backgroundColor);if(v)c=mix(v,c,v[3]??1)}return c};
 const path=e=>e.id?'#'+CSS.escape(e.id):e.tagName.toLowerCase()+(typeof e.className==='string'&&e.className.trim()?'.'+e.className.trim().split(/\s+/).join('.'):'' );
 return [root,...root.querySelectorAll('*')].filter(e=>e.getClientRects().length&&getComputedStyle(e).visibility!=='hidden'&&!e.closest('svg,option')&&([ ...e.childNodes].some(n=>n.nodeType===3&&n.textContent.trim())||e.matches('input:not([type=hidden]):not([type=color]):not([type=checkbox]):not([type=radio]):not([type=range]),select,textarea'))).flatMap(e=>{
  const st=getComputedStyle(e),b=bg(e),v=rgb(st.color);if(!v)return [];
  const text=e.matches('input,textarea')?e.value||e.placeholder:e.matches('select')?e.selectedOptions[0]?.textContent:e.textContent.trim();if(!text)return [];
  const states=[['text',v]];if(e.matches('input[placeholder],textarea[placeholder]'))states.push(['placeholder',rgb(getComputedStyle(e,'::placeholder').color)]);
  return states.flatMap(([kind,c])=>{if(!c)return [];let opacity=1;for(let n=e;n;n=n.parentElement)opacity*=Number(getComputedStyle(n).opacity);const fg=mix(c,b,(c[3]??1)*opacity);const r=ratio(fg,b);const min=e.matches(':disabled')?3:4.5;return r>=min?[]:[{selector:path(e),kind,text:text.slice(0,65),fg,bg:b,ratio:+r.toFixed(2),min,style:e.getAttribute('style')}];});
 });
}"""
async def main():
 with tempfile.TemporaryDirectory() as tmp:
  path=Path(tmp)/'Odjel_test.mbtiles';raster.mbtiles(path)
  spec2=importlib.util.spec_from_file_location('theme',ROOT/'tests/browser/thematic-source-268.py');theme=importlib.util.module_from_spec(spec2);spec2.loader.exec_module(theme)
  gpkg=Path(tmp)/'USK_SADNJA_7_VRSTA_PROCJENA_V3.gpkg';theme.synthetic(gpkg)
  async with async_playwright() as p:
   browser=await p.chromium.launch(executable_path=os.environ.get('UI_CHROMIUM') or None)
   ctx=await browser.new_context(service_workers='block',viewport={'width':int(os.environ.get('DAY_UI_WIDTH','390')),'height':800});errors=[];writes=[]
   async def route(r):
    url=r.request.url
    if url=='https://appassets.androidplatform.net/drive-kml/github-kml-27501.kml':
     await r.fulfill(content_type='application/vnd.google-earth.kml+xml',body=KML);return
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
   await page.evaluate("""()=>{document.documentElement.dataset.fieldTheme='day';_projekti=[{id:'P',gj:'Test',odjel:'105',korisnik_id:sbUser.id,clanovi:[]}];_aktivniProjektId='P';_applyVlakeRows([{nm:'T1',br:1,kr:0,projekt_id:'P',pts:[{la:44.9,lo:16,al:400},{la:44.901,lo:16.001,al:420}]}]);_dozOdjeli=[{id:'d1',name:'Test · 105',status:'active',created_by:sbUser.id,known_area_ha:42}];}""")
   await page.evaluate("""()=>{
    kolegeMap={'22222222-2222-4222-8222-222222222222':{ime:'Kolega Projektant',color:'#4ade80'}};
    _projekti[0].clanovi=[{korisnik_id:'22222222-2222-4222-8222-222222222222'}];
    dnevniLog=[{date:'2026-10-10',entries:[{projektId:'P',korisnikId:sbUser.id,projektant:'Adnan Mahmic',odjel:'105',meters:500,activeMin:120,workStart:'08:00',workEnd:'11:00',vlake:[{nm:'T1',m:500}],vlakeNm:['T1']}]}];
    _tragRegistry=[{id:'tr1',name:'Terenski trag',date:new Date().toISOString(),color:'#fbbf24',visible:true,gj:'Test',odjel:'105',pts:[{la:44.9,lo:16,al:400},{la:44.901,lo:16.001,al:420}]}];
    _dozSelId='d1';_dozMembers=[{user_id:sbUser.id,role:'manager',_korisnik:{ime:'Adnan',prezime:'Mahmic',boja:'#4ade80'}}];
    _dozMarkings=Object.keys(DOZ_TYPES).map((k,i)=>({id:'m'+i,marking_type:k,label:DOZ_TYPES[k].label,area_ha:1.2,created_at:new Date().toISOString(),geometry:{type:'Polygon',coordinates:[[[16,44.9],[16.001,44.9],[16.001,44.901],[16,44.9]]]}}));
    window.dayUsers=[{id:sbUser.id,ime:'Admin',prezime:'Test',odobren:true,is_admin:true,sumarija:'TEST',last_active_at:new Date().toISOString()},
     {id:'user-2',ime:'Novi',prezime:'Korisnik',odobren:false,is_admin:false,sumarija:'TEST',created_at:new Date().toISOString(),probni_do:new Date(Date.now()+86400000).toISOString()},
     {id:'user-3',ime:'Pauziran',prezime:'Korisnik',odobren:false,sumarija:'TEST',prvo_odobren_at:new Date().toISOString(),last_active_at:new Date(Date.now()-86400000).toISOString()},
     {id:'user-4',ime:'Vodeći',prezime:'Projektant',odobren:true,je_vodeci:true,sumarija:'TEST',last_active_at:null}];
    adminLoadUsers=async()=>{};_adminUsers=dayUsers;
   }""")
   # Admin promjena pregleda ne smije pokazati dnevnik aktivnog ličnog projekta.
   await page.evaluate("""()=>{const p={id:'Q',odjel:'106',gj:'Test',korisnik_id:'22222222-2222-4222-8222-222222222222',clanovi:[]};_projekti.push(p);sbProfile.is_admin=true;showProjektDetalji('Q');if(document.getElementById('dnevni-log').textContent.includes('Adnan Mahmic'))throw Error('Dnevnik ličnog profila u tuđem projektu');showProjektDetalji('P');if(!document.getElementById('dnevni-log').textContent.includes('Adnan Mahmic'))throw Error('Nedostaje dnevnik projekta P');showProjektiList();_projekti.pop();sbProfile.is_admin=false;
    if(document.querySelector('#ls-pane-karte #putevi-toggle,#ls-pane-karte #ls-tem-box,#wb-toggle'))throw Error('Stari ulaz slojeva');for(const id of ['putevi-toggle','granice-toggle','vl-nagib-toggle'])if(!document.querySelector('#ls-pane-granice #'+id))throw Error('Nedostaje kontrola '+id);
    if(!document.querySelector('#tem-modal #tem-file-input'))throw Error('GPKG uvoz nije u zasebnoj sekciji');}""")
   # Stvarni uvoz fajlova u puni app i stvarni renderer popunjenih lista.
   await page.evaluate('openLoadMapScreen()');await page.locator('#loadmap-file-input').set_input_files(str(path))
   await page.wait_for_function('_loadmapPending.length===1');await page.locator('#loadmap-confirm').click()
   await page.wait_for_function('_sqlLayers.length===1');await page.evaluate('closeLoadMapScreen();showTemModal()')
   await page.locator('#tem-file-input').set_input_files(str(gpkg));await page.evaluate('_temQueue')
   assert await page.evaluate('_temMaps.length===1&&_temMaps[0].features.length===98')
   await page.evaluate("""()=>{
    closeTemModal();const pts=[{lat:44.9,lng:16,elev:400},{lat:44.901,lng:16.001,elev:420},{lat:44.9,lng:16.001,elev:425}];
    _tragRegistry[0].pts=pts;_tragRegistry.push({..._tragRegistry[0],id:'tr2',name:'Sakriveni trag',visible:false});
    _msrRegistry=['dist','area','nagib'].map(mode=>({id:'msr-'+mode,name:'Mjerenje '+mode,date:new Date().toISOString(),mode,pts,gj:'Test',odjel:'105'}));
    textLabels=[{id:'test-text',text:'105',lat:44.9,lng:16,size:18,color:'#ffffff'}];
    sbLoadKolege=async()=>{};
   }""")
   await page.evaluate("""async()=>{
    await _localLayerKml('Odjel_Test.kml','<kml><Document><Placemark><name>Odjel 105</name><Polygon><outerBoundaryIs><LinearRing><coordinates>16,44.9 16.001,44.9 16.001,44.901 16,44.9</coordinates></LinearRing></outerBoundaryIs></Polygon></Placemark></Document></kml>');
    const thumb='data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="46" height="56"><rect width="46" height="56" fill="green"/></svg>');
    _locFotos=[{la:44.9,lo:16,thumb,full:thumb,ts:1760000000000,odjel:'105',gj:'Test',sharedWith:[]}];_locFotoMarkers=[_buildFotoMarker(44.9,16,thumb,thumb,0,_locFotos[0].ts,true,false)];
    _ozCollapsed.clear();
    _serverProjektPreuzeto('P',[{id:'peer-v1',nm:'T7',korisnik_id:'22222222-2222-4222-8222-222222222222',pts:vlake[0].pts}]);
    _serverSaljem=true;_serverTransferConfirmed({type:'upsert_vlaka',payload:{id:'own-v1',projekt_id:'P',nm:'T1',pts:vlake[0].pts}},sbUser.id);_serverSaljem=false;
   }""")
   # Frontend koristi lažni native transport, ali stvarni KML parser i durable IDB čuvanje.
   await page.evaluate("""([content,size])=>{if(!crypto.randomUUID)crypto.randomUUID=()=>Math.random().toString(16).slice(2);Object.defineProperty(navigator,'onLine',{get:()=>true,configurable:true});window.testKmlDownloads=0;window.AndroidKmlDownloads={request(id,raw){const m=JSON.parse(raw);let r={ok:true};if(m.type==='list')r.files=m.provider==='github'?[{id:'github-kml-27501',name:'Putevi Test.kml',size,release:'Granice i putevi'}]:[];if(m.type==='download'){testKmlDownloads++;r.url='https://appassets.androidplatform.net/drive-kml/github-kml-27501.kml'}queueMicrotask(()=>KmlDownloads.reply(id,r));}};}""",[KML,len(KML.encode())])
   await page.evaluate("async()=>{_openLayerSheet();_lsTab('granice');await KmlDownloads.refreshGithub()}")
   await page.get_by_role('button',name='Preuzmi i dodaj',exact=True).click()
   await page.wait_for_function("kmlLs.some(k=>k.name==='Putevi Test.kml')&&document.getElementById('layer-sheet').style.display==='none'")
   assert await page.evaluate('testKmlDownloads')==1
   await page.evaluate("Object.defineProperty(navigator,'onLine',{get:()=>false,configurable:true})")
   await page.evaluate("async()=>{_openLayerSheet();_lsTab('granice');await KmlDownloads.refreshGithub()}")
   await page.locator('#kml-github-list button').click()
   await page.wait_for_function("document.getElementById('layer-sheet').style.display==='none'")
   assert await page.evaluate('testKmlDownloads')==1,'Sačuvani KML ponovo preuzet offline'
   failures={};views=[]
   ctx.set_default_timeout(12000)
   async def check(name,action,selector,close):
    await page.evaluate("()=>{"+action+";}");await page.wait_for_timeout(500 if name=='toast' else 80)
    await page.evaluate("s=>{document.querySelectorAll(s+' details').forEach(e=>e.open=true);document.querySelectorAll(s+' .help-sec-body').forEach(e=>e.classList.add('open'))}",selector)
    result=await page.evaluate(AUDIT,selector);views.append(name)
    if result:failures[name]=result
    if result or '--screens' in sys.argv:await page.screenshot(path=str(OUT/(name+'.png')))
    await page.evaluate("()=>{"+close+";}")
   states=[
    ('menu','toggleMenuDropdown()','#menu-dropdown','closeMenuDropdown()'),
    ('projects-list',"switchTab('projekat');showProjektiList()",'#proj-panel',"switchTab('karta')"),
    ('projects-detail',"switchTab('projekat');showProjektDetalji('P')",'#proj-panel',"switchTab('karta')"),
    ('project-new',"switchTab('projekat');showNovProjektForm()",'#proj-panel',"hideNovProjektForm();switchTab('karta')"),
    ('project-member',"switchTab('projekat');showProjektDetalji('P');openDodajClanPanel()",'#proj-panel',"closeDodajClanPanel();switchTab('karta')"),
    ('routes',"switchTab('vlake')",'#panel',"switchTab('karta')"),
    ('doznaka-list',"switchTab('doznaka');document.querySelector('#doz-panel-list').style.display='flex';document.querySelector('#doz-panel-detail').style.display='none';dozRenderOdjeli()",'#doznaka-panel',"switchTab('karta')"),
    ('doznaka-detail',"switchTab('doznaka');document.querySelector('#doz-panel-list').style.display='none';document.querySelector('#doz-panel-detail').style.display='flex';dozRenderDetail()",'#doznaka-panel',"switchTab('karta')"),
    ('terrain',"switchTab('teren')",'#teren-panel',"switchTab('karta')"),
    ('tracks-tab',"switchTab('tragovi');_tragoviRender()",'#tragovi-panel',"switchTab('karta')"),
    ('guide','showGuideChoice()','.guide-sheet','closeGuideChoice()'),
    ('maps','openLoadMapScreen()','#loadmap-modal','closeLoadMapScreen()'),
    ('layers','_openLayerSheet()','#layer-sheet','closeLayerSheet()'),
    ('labels','openOznakePanel()','#oznake-panel','closeOznakePanel()'),
    ('server','openSyncQueuePanel()','#syncq-panel','closeSyncQueuePanel()'),
    ('help','showHelp()','#help-modal','closeHelp()'),
    ('thematic','showTemModal()','#tem-modal','closeTemModal()'),
    ('style','openStilLinija()','#stil-modal','closeStilLinija()'),
    ('tracks-registry','openTragRegistry()','#trag-reg-box','closeTragRegistry()'),
    ('tracks-edit',"openTragRegistry();_tragRegEditMeta('tr1')",'#trag-reg-box','closeTragRegistry()'),
    ('map-manager','openMapManager()','#mapmgr-box','closeMapManager()'),
    ('map-favorites','openMapFavs()','#mapfav-box','closeMapFavs()'),
    ('doznaka-new','dozShowCreateOdjel()','#doz-create-box','dozCloseCreateOdjel()'),
    ('location',"document.getElementById('ab-loc-popup').style.display='block'",'#ab-loc-popup',"document.getElementById('ab-loc-popup').style.display='none'"),
    ('point','_tackaOpenModal()','#tacka-modal','_tackaCancelModal()'),
    ('text-label','openTextDialog(44.9,16)','#text-dialog','closeTextDialog()'),
    ('print','stampaOtvori()','#stampa-kontrole','stampaZatvori()'),
    ('settings',"switchTab('postavke')",'#postavke-panel',"switchTab('karta')"),
    ('dialog',"_dlg({title:'Potvrdi',msg:'Obrisati oznaku?',mode:'confirm',danger:true})",'#dlg-sheet','_dlgDismiss()'),
    ('prompt',"_dlgPrompt('Broj vlake','T14',{vlakaKeyboard:true})",'#dlg-sheet','_dlgDismiss()')
   ]
   states += [
    ('map-manage',"openLoadMapScreen();_loadmapTab('manage')",'#loadmap-modal','closeLoadMapScreen()'),
    ('thematic-sadnja',"showTemModal();_temSwitchView('sadnja')",'#tem-modal','closeTemModal()'),
    ('thematic-files',"showTemModal();_temSwitchView('files')",'#tem-modal','closeTemModal()'),
    ('thematic-style',"showTemModal();_temSwitchView('style')",'#tem-modal','closeTemModal()'),
    ('thematic-editor',"showTemModal();_temSwitchView('style');_temEdToggle(_temMaps[0].id)",'#tem-modal','closeTemModal()'),
    ('thematic-table',"showTemTable(_temMaps[0].id)",'#tem-table-modal','closeTemTable()'),
    ('thematic-columns',"showTemTable(_temMaps[0].id);_temTblColsMenu()",'#tem-table-modal','closeTemTable()'),
    ('thematic-popup',"map.openPopup(_temPopupHtml(_temMaps[0],_temMaps[0].features[0]),map.getCenter(),{className:'tem-popup'})",'.leaflet-popup-content','map.closePopup()'),
    ('trace-style',"switchTab('tragovi');_tragoviSetTab('trg');_tvOdaberi('tr1');_tragoviToggleEdit('tr1')",'#tragovi-panel',"switchTab('karta')"),
    ('measurements',"switchTab('tragovi');_tragoviSetTab('msr')",'#tragovi-panel',"switchTab('karta')"),
    ('measurements-registry',"openTragRegistry();_msrRegRender();_msrRegEditMeta('msr-dist')",'#trag-reg-box','closeTragRegistry()'),
    ('help-vlake',"showHelp();helpTab('vlake',document.querySelectorAll('.help-tab')[1])",'#help-modal','closeHelp()'),
    ('help-doznaka',"showHelp();helpTab('doznaka',document.querySelectorAll('.help-tab')[2])",'#help-modal','closeHelp()'),
    ('help-symbols',"showHelp();helpTab('simboli',document.querySelectorAll('.help-tab')[3])",'#help-modal','closeHelp()'),
    ('measurement-menu','toggleMjtrgDropdown()','#mjtrg-dropdown','closeMjtrgDropdown()'),
    ('management-list',"document.getElementById('pm-modal').classList.add('show');_pmAdminRows=[{..._projekti[0],projektant:'Adnan',vlake_count:2,vlake_duzina:500}];_pmShowList()",'#pm-box','closeProjectManagement()'),
    ('management-detail',"document.getElementById('pm-modal').classList.add('show');document.querySelector('#pm-list-wrap').style.display='none';document.querySelector('#pm-detail').style.display='block';document.querySelector('#pm-detail').innerHTML=_pmBuildDetail(_projekti[0],[{nm:'T1',projektant_ime:'Adnan',pts:vlake[0].pts}],[])",'#pm-box','closeProjectManagement()')
   ]
   states += [
    ('kml-import',"openLayerImport('kml')",'#layer-import-modal','closeLayerImport()'),
    ('shp-import',"openLayerImport();layerImportTab('shp')",'#layer-import-modal','closeLayerImport()'),
    ('kml-editor',"openOznakePanel();_ozKmlToggleEdit(0)",'#oznake-panel','closeOznakePanel()'),
    ('kml-popup',"_kmlOpenPopup(kmlLs[0].grp.getLayers()[0],map.getCenter());_kmlPopEditStart(kmlLs[0].grp.getLayers()[0]._kmlPopupId)",'.leaflet-popup-content','map.closePopup()'),
    ('photo-popup',"_locFotoMarkers[0].openPopup()",'.leaflet-popup-content','map.closePopup()'),
    ('photo-share',"openShareFotoDlg(_locFotos[0].ts)",'#share-foto-box','closeShareFotoDlg()'),
    ('route-popup',"showVlakaPopup(0,map.getCenter())",'#vlaka-popup','closeVlakaPopup()'),
    ('explorer',"Explorer.start({la:44.904,lo:16.001,name:'Odjel 105'});Explorer.setExplorerEnabled(false)",'#tacka-nav-panel','Explorer.stop()'),
    ('elevation-profile',"showElevProfile(0)",'#profil-box','closeProfilModal()')
   ]
   for role in ['projektant','admin']:
    await page.evaluate('(a)=>{sbProfile.is_admin=a;_revealApp()}',role=='admin')
    for name,action,selector,close in states:
     try:await check(role+'-'+name,action,selector,close)
     except Exception as e:raise RuntimeError(name) from e
    if role=='admin':
     await check('admin-users',"switchTab('admin');_adminRenderUsers()",'#admin-panel',"switchTab('karta')")
     await check('admin-stats',"switchTab('admin');sb.rpc=async()=>({data:[{sumarija:'TEST',korisnika:4,aktivnih_7d:2,projekata:2,maticnih:4,krakova:1,ukupno_m:5400}],error:null});_adminLoadStats();document.getElementById('admin-stats-box').style.display='block'",'#admin-panel',"switchTab('karta')")
     await check('admin-debug',"switchTab('debug');_adminDebugRender()",'#debug-panel',"switchTab('karta')")
   await check('toast',"showToast('Karta je sačuvana')",'#toast-msg',"document.getElementById('toast-msg').style.opacity='0'")
   await check('auth-registration',"document.getElementById('auth-screen').style.display='flex';authShowReg()",'#auth-screen',"authShowLogin();document.getElementById('auth-screen').style.display='none'")
   await check('auth-pending',"document.getElementById('auth-screen').style.display='flex';authShowPending()",'#auth-screen',"authShowLogin();document.getElementById('auth-screen').style.display='none'")
   # Preostali statički podprozori: samo otvaranje prikaza, bez save/delete/GPS poziva.
   roots=['doz-type-picker','doz-draw-banner','doz-gps-modal','share-foto-dlg','foto-fullscreen','auth-screen','profil-modal','sqlmap-modal','izv-modal','offline-modal','cachemgr-modal','tem-table-modal','manual-draw-panel','edit-panel','rec-banner','rec-bar','doz-save-modal','doz-qr-show-modal','doz-qr-scan-modal','del-modal-bg','mjtrg-panel','tacka-nav-panel','share-foto-box','imv-modal','vlaka-popup','nagib-panel']
   for id in roots:
    el=page.locator('#'+id);assert await el.count()==1,id;old=await el.get_attribute('style')
    oldHidden=await el.get_attribute('hidden');await el.evaluate("e=>{e.removeAttribute('hidden');e.style.display='flex';e.querySelectorAll('details').forEach(d=>d.open=true)}")
    result=await page.evaluate(AUDIT,'#'+id);views.append('static-'+id)
    if result:failures['static-'+id]=result;await page.screenshot(path=str(OUT/('static-'+id+'.png')))
    if oldHidden is not None:await el.evaluate("e=>e.setAttribute('hidden','')")
    await el.evaluate('(e,s)=>{if(s===null)e.removeAttribute("style");else e.setAttribute("style",s)}',old)
   (OUT/'contrast-report.json').write_text(json.dumps({'views':views,'failures':failures,'errors':errors,'writes':writes},ensure_ascii=False,indent=2))
   print('Views',len(views),'bad states',len(failures),'bad elements',sum(map(len,failures.values())))
   for name,rows in failures.items():print(name,len(rows),[(r.get('selector'),r.get('ratio'),r.get('text','')[:35]) for r in rows[:8]])
   assert not errors,errors
   assert not writes,writes
   if '--audit' not in sys.argv:assert not failures,failures
   await browser.close()
 print('PASS broad day-mode contrast audit; external writes blocked')
asyncio.run(main())
