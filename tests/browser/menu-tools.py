"""Stvarni modal, SHP/DBF/proj4, Leaflet i IDB; bez produkcijskih poziva."""
import asyncio, mimetypes, os, re, struct
from pathlib import Path
from playwright.async_api import async_playwright

ROOT=Path(__file__).resolve().parents[2]
SOURCE=(ROOT/'index.html').read_text()
OUT=ROOT/'outputs/ui-preview'

def function(name):
    match=re.search(r'(?:async )?function '+name+r'\(',SOURCE)
    assert match,name
    start=match.start();depth=0
    for i in range(SOURCE.index('{',start),len(SOURCE)):
        depth+=SOURCE[i]=='{';depth-=SOURCE[i]=='}'
        if depth==0:return SOURCE[start:i+1]
    raise ValueError(name)

def section(start,end):
    a=SOURCE.index(start);return SOURCE[a:SOURCE.index(end,a)]

styles='\n'.join(re.findall(r'<style[^>]*>(.*?)</style>',SOURCE[:SOURCE.index('</head>')],re.S))+'\n'+(ROOT/'static/css/field-design.css').read_text()
styles+='\n'+(ROOT/'static/css/server-panel.css').read_text()
sprite_start=SOURCE.rfind('<svg',0,SOURCE.index('<symbol id="ic-zatvori"'))
sprite=SOURCE[sprite_start:SOURCE.index('</svg>',sprite_start)+6]
server_html=section('<div id="syncq-bg"','<!-- Share foto')
body=section('<div id="guide-choice-modal"','<!-- PROFIL VISINA MODAL -->')+section('<div id="layer-import-modal"','<!-- ══ OZNAKE PANEL')
js='''
let sbUser={id:'A'},sbProfile={ime:'Emina',prezime:'Projektant'},lastP={la:44.9,lo:16},_fotoSnapPos=null;
const _LOCAL_KML_KEY='fixture_local',_GUIDE_ROUTES_KEY='fixture_routes',_KML_USER_STYLES_KEY='fixture_styles';let _dozKmlSelMode=false;
const _KMLC_DB='fixture_cache',_KMLC_STORE='files';let _kmlcDB=null,_kmlcKeys=new Set();
let kmlLs=[],kmlCI=0;const KCOLS=['#16a34a','#2563eb'],_glCollapsed=new Set();
const map=L.map('map').setView([44.9,16],13),_genUUID=()=>crypto.randomUUID();
let chosenStart=null,selectedRoute=null,sharedRoute=null,_guideActiveRouteId=null;
const showToast=()=>{},rndGraniceModal=()=>{},_rndOznakePanel=()=>{},_guideClearResult=()=>{};
const _guideStart=x=>{chosenStart=x;closeGuideChoice()},_guideViewRoute=x=>selectedRoute=x,_guideShareRoute=x=>sharedRoute=x;
const onLocPhotoSelected=()=>{};
let _projekti=[{id:'P',korisnik_id:'A',odjel:'105',gj:'Gornja Una'},{id:'Q',korisnik_id:'B',clanovi:[{korisnik_id:'A'}],odjel:'206',gj:'Grmeč'}],_aktivniProjektId='P',_dozOdjeli=[{id:'D',name:'Doznaka 107'}],vlake=[],kolegeMap={B:{ime:'Amir Kolega'}},_vlakaSaveTimers={};
const fixturePoints=[{la:44.9,lo:16},{la:44.901,lo:16}];
const fixtureQueue=[{type:'upsert_vlaka',_uid:'A',_qid:'a',payload:{korisnik_id:'A',projekt_id:'P',nm:'T1',pts:fixturePoints}},{type:'insert_doz_marking',_uid:'A',_qid:'b',payload:{project_id:'D',user_id:'A'}}];
const fixtureRows=[{id:'rB',korisnik_id:'B',projekt_id:'P',nm:'T2',pts:fixturePoints,projektant_ime:'Amir Kolega'}];
const _OL={VLAKE:'vlake',load:()=>fixtureRows,loadQueue:()=>fixtureQueue},_kvcLoad=()=>[],_SERVER_SAMO_LOKALNO=new Set(['upsert_trag','delete_trag','upsert_log','upsert_labels']);
const FieldStore={ready:true,view:()=>[{user_id:'A',project_id:'D'}]},_serverPrimljenoIzKesa=()=>{},_serverPrimljenoRender=()=>{},_serverPrimljenoUcitaj=()=>[],_mrezaStanje=()=> 'dobra',_serverZadnje=()=>0,_serverNaCekanju=()=>({stavki:3,blok:0});
let _serverSaljem=false,_serverPrimljenoBusy=false,_vlTrazi='',_vlSort='naziv',_vlSamoStrme=false,_activeTab='karta',_dozSelId=null,_dozLinkedProjektId=null;
const _OP_LABELS={upsert_vlaka:'Vlaka',insert_doz_marking:'Zona doznake'},serverPosalji=async()=>{exchangeCalls.push('send');if(exchangeHold)await new Promise(r=>exchangeRelease=r);return {ok:true,pending:0}},isAdmin=()=>false,isVodeci=()=>false;

let exchangeCalls=[],exchangeHold=false,exchangeRelease=null;
const _mrezaSila=()=>{},serverPreuzmiDijeljeno=async()=>{exchangeCalls.push('vlake');return {ok:true,count:1,projects:1}},dozLoadOdjeli=async()=>{exchangeCalls.push('doz');return true},dozLoadLayers=async id=>{exchangeCalls.push('doz-'+id);return true};
'''
js+='\n'.join(function(n) for n in ['dst','calcL','openSyncQueuePanel','closeSyncQueuePanel','_serverSazetakRender','_fmtAgo','_escHtml','fmtL','showGuideChoice','closeGuideChoice','_guideRoutesLoad','_guideRoutesStore','_guideDeleteRoute','_guideRenderRoutes','startLocPhoto','_firstCoord','pkml','pcs','_parseKmlExtData','_bindKmlPopup','_kmlcOpen','_kmlcSave','_kmlcGet','_kmlcDelete','_localKmlSaveContent','_localKmlRestore','_localKmlSaveAll','_kmlGrpHasPolygon','applyKmlStyle','_ensureKmlPattern','saveKmlStyles','_kmlPopFindLayer','_kmlPopFindIdx','_kmlPopSave','_kmlPopCancel','_kmlPopEditStart','_kmlPopStyleToggle','_kmlPopStylePanel','_kmlPopupHtml','_kmlOpenPopup','_kmlPopZoom'])
js+='\n'+(ROOT/'static/js/layer-editor.js').read_text()
js+='\n'+'\n'.join(re.findall(r"proj4.defs\('EPSG:3127[56]', [^\n]+",SOURCE))
js+='\n'+(ROOT/'static/js/local-layer-import.js').read_text()+'\n'+(ROOT/'static/js/tab-data.js').read_text()+'\n'+(ROOT/'static/js/server-panel.js').read_text()
fixture='<!DOCTYPE html><html lang="bs"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/static/libs/leaflet.min.css"><style>'+styles+'\n#map{position:fixed;inset:0;background:#e4ecd9}.leaflet-container{background:#e4ecd9}</style></head><body>'+sprite+'<div id="map"></div>'+section('<div id="nv-badge">','<!-- Meni za izbor razmjere -->')+body+server_html+'<button id="camera-test" onclick="startLocPhoto()" style="position:fixed;top:10px;right:10px;z-index:1000">Uslikaj</button><script src="/static/libs/leaflet.min.js"></script><script src="/static/libs/shapefile.min.js"></script><script src="/static/libs/proj4.js"></script><script>'+js+'</script></body></html>'

def polygon():
    rings=[[(16,44.9),(16,44.91),(16.01,44.91),(16.01,44.9),(16,44.9)],[(16.002,44.902),(16.008,44.902),(16.008,44.908),(16.002,44.908),(16.002,44.902)]]
    pts=sum(rings,[]);size=44+4*len(rings)+16*len(pts);b=bytearray(108+size)
    struct.pack_into('>i',b,0,9994);struct.pack_into('>i',b,24,len(b)//2);struct.pack_into('<ii',b,28,1000,5)
    box=(16,44.9,16.01,44.91);struct.pack_into('<4d',b,36,*box)
    struct.pack_into('>ii',b,100,1,size//2);struct.pack_into('<i4dii',b,108,5,*box,len(rings),len(pts))
    struct.pack_into('<2i',b,152,0,5)
    for i,p in enumerate(pts):struct.pack_into('<2d',b,160+i*16,*p)
    return bytes(b)

def dbf():
    b=bytearray(b' '*147);b[:65]=bytes(65);b[0]=3
    struct.pack_into('<IHH',b,4,1,65,81);b[32:37]=b'NAZIV';b[43]=67;b[48]=80;b[64]=13
    name='Odjel Čuvar & <105>'.encode();b[66:66+len(name)]=name;b[146]=26
    return bytes(b)

def upload(name,body):return {'name':name,'mimeType':'application/octet-stream','buffer':body}

async def bounds(page,selector,width,height):
    d=await page.locator(selector).evaluate('(e)=>{const b=e.getBoundingClientRect();return {left:b.left,right:b.right,top:b.top,bottom:b.bottom,width:e.clientWidth,content:e.scrollWidth}}')
    assert d['left']>=0 and d['right']<=width+1 and d['top']>=0 and d['bottom']<=height+1 and d['content']<=d['width']+1,d

async def main():
    OUT.mkdir(parents=True,exist_ok=True)
    async with async_playwright() as p:
        browser=await p.chromium.launch(headless=True,**({'executable_path':os.environ['UI_CHROMIUM']} if os.environ.get('UI_CHROMIUM') else {}))
        page=await browser.new_page();errors=[]
        page.on('pageerror',lambda e:errors.append(str(e)))
        async def route(r):
            if not r.request.url.startswith('https://ui.test/'):
                await r.abort();return
            path=r.request.url.split('ui.test',1)[1].split('?',1)[0]
            if path=='/':await r.fulfill(content_type='text/html',body=fixture)
            elif path.startswith('/static/libs/'):
                f=ROOT/path.lstrip('/')
                if f.is_file():await r.fulfill(content_type=mimetypes.guess_type(str(f))[0] or 'application/octet-stream',body=f.read_bytes())
                else:await r.fulfill(status=404,body='fixture only')
            else:await r.fulfill(status=404,body='fixture only')
        await page.route('**/*',route);await page.goto('https://ui.test/')
        await page.evaluate("localStorage.setItem(_GUIDE_ROUTES_KEY,JSON.stringify(Array.from({length:18},(_,i)=>({id:'r'+i,name:i===0?'Odjel Čuvar <105>':'Radilište '+i,distM:1200+i*200,durS:300+i*30,osrm:true}))))")
        for theme in ['day','dark']:
            await page.evaluate('(t)=>document.documentElement.dataset.fieldTheme=t',theme)
            for width,height in [(320,568),(390,650),(768,800),(568,320)]:
                await page.set_viewport_size({'width':width,'height':height});await page.evaluate('showGuideChoice()')
                await bounds(page,'.guide-sheet',width,height);await bounds(page,'.guide-body',width,height)
                assert await page.locator('.guide-route').count()==18
                assert await page.locator('#guide-location-status').inner_text()=='GPS pozicija je spremna'
                assert await page.locator('#guide-routes-list img').count()==0
                await page.screenshot(path=str(OUT/f'guide-{theme}-{width}-{height}.png'))
                await page.fill('#guide-routes-search','Čuvar');assert await page.locator('.guide-route').count()==1
                await page.locator('.guide-route-main').click();assert await page.evaluate('selectedRoute')=='r0'
                await page.locator('.guide-route-actions button').first.click();assert await page.evaluate('sharedRoute')=='r0'
                assert await page.locator('.guide-route-actions button').first.evaluate('(e)=>e.getBoundingClientRect().height')>=44
                await page.fill('#guide-routes-search','nema te rute');assert await page.locator('.guide-route').count()==0
                assert len(await page.evaluate('_guideRoutesLoad()'))==18
                await page.evaluate('showGuideChoice()');await page.locator('.guide-choice').first.click();assert await page.evaluate('chosenStart') is True
                await page.evaluate('showGuideChoice()');await page.locator('.guide-choice').nth(1).click();assert await page.evaluate('chosenStart') is False
                await page.evaluate('openLayerImport()');await bounds(page,'.layer-sheet',width,height)
                assert await page.locator('#layer-import-kml').is_visible() and not await page.locator('#layer-import-shp').is_visible()
                await page.click('#layer-tab-shp');assert await page.locator('#layer-tab-shp').get_attribute('aria-selected')=='true'
                await bounds(page,'.layer-body',width,height);assert await page.locator('#layer-import-shp').is_visible()
                await page.screenshot(path=str(OUT/f'layer-import-{theme}-{width}-{height}.png'))
                await page.evaluate('closeLayerImport()')
                await page.evaluate('openSyncQueuePanel();_serverSaljem=true;_serverTransferConfirmed(fixtureQueue[0],"A");_serverSaljem=false;_serverProjektPreuzeto("P",fixtureRows);_serverPanelRender()')
                await bounds(page,'#syncq-panel',width,height)
                assert await page.locator('#server-project-select').count()==0 and await page.locator('.sp-metrics').count()==0
                assert await page.locator('#server-project-label').inner_text()=='Gornja Una · Odjel 105'
                assert 'Emina Projektant' in await page.locator('#server-identity').inner_text()
                await page.evaluate("_tabServer('send')")
                assert await page.locator('.sp-send-group').count()==2
                for summary in await page.locator('.sp-send-group summary').all():await summary.click()
                assert '1 GPS tačaka' in await page.locator('#server-send-preview').inner_text()
                assert 'Amir Kolega' in await page.locator('#server-received-items .sp-item-context').text_content()
                assert 'Poslao: Emina Projektant' in await page.locator('#server-project-summary').inner_text()
                assert 'Još nije potvrđeno' not in await page.locator('#server-project-summary').inner_text()
                scroll=await page.locator('#server-scroll').evaluate('(e)=>({height:e.clientHeight,width:e.clientWidth,content:e.scrollWidth})')
                assert scroll['height']>=35 and scroll['content']<=scroll['width'],scroll
                await page.locator('#server-scroll').evaluate('(e)=>e.scrollTop=0')
                await page.screenshot(path=str(OUT/f'server-send-{theme}-{width}-{height}.png'))
                await page.evaluate("_tabServer('received')")
                assert await page.locator('#data-server-received').is_visible()
                assert not await page.locator('#data-server-sent').is_visible()
                await page.locator('#server-scroll').evaluate('(e)=>e.scrollTop=e.scrollHeight')
                await page.screenshot(path=str(OUT/f'server-project-{theme}-{width}-{height}.png'))
                await page.evaluate("_tabServer('sent')")
                group=page.locator('#server-sent-items details').first
                if not await group.evaluate('(e)=>e.open'):await group.locator('summary').click()
                assert 'Vlaka · T1' in await page.locator('#server-sent-items').inner_text()
                await page.screenshot(path=str(OUT/f'server-sent-{theme}-{width}-{height}.png'))
                await page.evaluate('closeSyncQueuePanel()')

        # Jedno dugme vodi cijelu razmjenu; disabled sprečava drugi pritisak.
        await page.evaluate("openSyncQueuePanel();_dozSelId='D';exchangeCalls=[];exchangeHold=true")
        await page.locator('#syncq-posalji').click();await page.wait_for_function('_serverRazmjena.busy')
        assert await page.locator('#syncq-posalji').is_disabled()
        assert await page.evaluate('exchangeCalls')==['send']
        await page.evaluate('exchangeHold=false;exchangeRelease()');await page.wait_for_function('!_serverRazmjena.busy')
        assert await page.evaluate('exchangeCalls')==['send','vlake','doz','doz-D']
        assert await page.locator('.sp-exchange-steps [data-state=ok]').count()==3
        assert await page.locator('#syncq-preuzmi,#server-doz-refresh,#server-project-refresh').count()==0
        for theme in ['day','dark']:
            for width,height in [(320,568),(390,800),(568,320)]:
                await page.set_viewport_size({'width':width,'height':height});await page.evaluate('(t)=>document.documentElement.dataset.fieldTheme=t',theme)
                await bounds(page,'#syncq-panel',width,height)
                assert await page.locator('#server-scroll').evaluate('e=>e.clientHeight')>=35
                await page.screenshot(path=str(OUT/f'server-exchange-{theme}-{width}-{height}.png'))
        await page.evaluate('closeSyncQueuePanel()')

        await page.set_viewport_size({'width':390,'height':800});await page.evaluate('document.documentElement.dataset.fieldTheme="day";openLayerImport();layerImportTab("shp")')
        await page.locator('#layer-file-shp').set_input_files([upload('Odjeli.SHP',polygon()),upload('odjeli.DBF',dbf()),upload('odjeli.cpg',b'65001'),upload('odjeli.shx',b'')])
        await page.wait_for_function('!_layerImportBusy && document.querySelector("#layer-import-status").textContent.includes("Učitano 1")')
        data=await page.evaluate('''async()=>{const k=kmlLs[0],p=k.grp.getLayers()[0],s=await _localLayerSnapshot();return {count:kmlLs.length,rings:p.getLatLngs().length,name:p._kmlName,attr:p._kmlExtData.NAZIV,bounds:k.grp.getBounds().toBBoxString(),backup:s,meta:JSON.parse(localStorage.getItem(_LOCAL_KML_KEY))}}''')
        assert data['count']==1 and data['rings']==2 and data['name']=='Odjel Čuvar & <105>' and data['attr']==data['name'],data
        assert data['bounds']=='16,44.9,16.01,44.91',data
        assert '<innerBoundaryIs>' in data['backup']['Odjeli.kml']['content'] and 'content' not in data['meta']['Odjeli.kml']
        await page.evaluate('closeLayerImport()');await page.screenshot(path=str(OUT/'shp-converted-map.png'))
        await page.evaluate("document.querySelector('#nv-val').textContent='532 m';document.querySelector('#omgi-y').textContent='6501234';document.querySelector('#omgi-x').textContent='4978901';document.querySelector('#map-scale-val').textContent='25 000'")
        await page.wait_for_function('!map._animatingZoom && !(map._panAnim && map._panAnim._inProgress)')
        for theme in ['day','dark']:
            await page.evaluate('(t)=>document.documentElement.dataset.fieldTheme=t',theme)
            for width,height in [(320,568),(390,650),(768,800),(568,320)]:
                await page.set_viewport_size({'width':width,'height':height})
                await page.evaluate("map.closePopup()")
                await page.locator(".kml-info-popup").wait_for(state="detached")
                await page.evaluate("map.invalidateSize();map.fitBounds(kmlLs[0].grp.getBounds(),{animate:false});_kmlOpenPopup(kmlLs[0].grp.getLayers()[0],kmlLs[0].grp.getBounds().getCenter())")
                await page.get_by_role('button',name='Stil fajla',exact=True).click()
                await page.wait_for_timeout(400)
                await page.screenshot(path=str(OUT/f'kml-style-{theme}-{width}-{height}.png'))
                assert not errors,errors
                await bounds(page,'.leaflet-popup-content',width,height)
                assert await page.locator('.kml-info-popup').evaluate('(e)=>e.getBoundingClientRect().top')>=55
                await bounds(page,'#nv-badge',width,height)
                assert await page.locator('.le-swatch').first.evaluate('(e)=>e.getBoundingClientRect().height')>=44
                await page.screenshot(path=str(OUT/f'kml-style-{theme}-{width}-{height}.png'))
        await page.locator('.le-swatch[aria-label=\"Boja #8b5cf6\"]').click()
        assert await page.locator('.le-popup').is_visible()
        await page.get_by_role('button',name='Isprekidana',exact=True).click()
        await page.get_by_role('button',name='Puna',exact=True).click()
        assert await page.locator('.le-popup').is_visible()
        await page.evaluate("_layerStyleChange(0,'dash','6 4');_layerStyleChange(0,'dash','');_layerStyleChange(0,'col','#8b5cf6');_layerStyleChange(0,'weight',4);_layerStyleChange(0,'fill',true);_layerStyleChange(0,'fillOpacity',45)")
        assert await page.evaluate('kmlLs[0].grp.getLayers()[0].options.dashArray') is None
        await page.evaluate("map.closePopup()")
        await page.locator(".kml-info-popup").wait_for(state="detached")
        await page.evaluate("_kmlOpenPopup(kmlLs[0].grp.getLayers()[0],map.getCenter());_kmlPopEditStart(kmlLs[0].grp.getLayers()[0]._kmlPopupId)")
        await page.locator('.le-fields input').fill('Čuvar <b>105</b>')
        await page.locator('.le-fields textarea').fill('Nova napomena & opis')
        await page.evaluate('_kmlPopSave(kmlLs[0].grp.getLayers()[0]._kmlPopupId)')
        assert await page.locator('.le-description').inner_text()=='Nova napomena & opis'
        assert await page.locator('.le-heading>b').inner_text()=='Čuvar <b>105</b>'
        assert await page.locator('.le-heading>b>b').count()==0
        await page.reload();await page.evaluate('_localKmlRestore()')
        assert await page.evaluate('kmlLs.length')==1
        restored=await page.evaluate('({name:kmlLs[0].grp.getLayers()[0]._kmlName,desc:kmlLs[0].grp.getLayers()[0]._kmlDesc,col:kmlLs[0].col,weight:kmlLs[0].weight,fill:kmlLs[0].fillOpacity})')
        assert restored=={'name':'Čuvar <b>105</b>','desc':'Nova napomena & opis','col':'#8b5cf6','weight':4,'fill':.45},restored
        assert await page.evaluate('kmlLs[0].grp.getLayers()[0].getLatLngs().length')==2
        await page.evaluate('map.fitBounds(kmlLs[0].grp.getBounds())');await page.screenshot(path=str(OUT/'shp-offline-restored.png'))
        await page.evaluate('openLayerImport();layerImportTab("shp")')
        await page.locator('#layer-file-shp').set_input_files([upload('bad.shp',polygon()),upload('bad.prj',b'unknown_projection')])
        await page.wait_for_function('!_layerImportBusy && document.querySelector("#layer-import-status").textContent.includes("nije prepoznata")')
        assert await page.evaluate('kmlLs.length')==1
        await page.click('#layer-tab-kml');await page.locator('#layer-file-kml').set_input_files(upload('broken.kml',b'<kml><broken>'))
        await page.wait_for_function('!_layerImportBusy && document.querySelector("#layer-import-status").textContent.includes("Neispravan KML")')
        assert await page.evaluate('kmlLs.length')==1
        valid=b'<kml><Placemark><name>Lokacija</name><Point><coordinates>16,44.9</coordinates></Point></Placemark></kml>'
        await page.locator('#layer-file-kml').set_input_files([upload('point.kml',valid),upload('point.kml',valid)])
        await page.wait_for_function('!_layerImportBusy && kmlLs.length===3')
        assert await page.evaluate('kmlLs.map(k=>k.name)')==['Odjeli.kml','point.kml','point (2).kml']
        await page.evaluate('closeLayerImport()')
        async with page.expect_file_chooser() as event:await page.click('#camera-test')
        chooser=await event.value;assert not chooser.is_multiple()
        assert await page.locator('#loc-photo-cam').get_attribute('capture')=='environment'
        assert await page.evaluate('_fotoSnapPos.la')==44.9
        assert await page.locator('#loc-photo-gal').count()==0
        assert not errors,errors
        await browser.close()
    print('OK: navigacija/SHP tab 8 veličina i tema; pravi SHP+DBF, rupa, Leaflet, IDB/reload, backup, greške, dupli fajlovi, kamera')

if __name__=='__main__':asyncio.run(main())
