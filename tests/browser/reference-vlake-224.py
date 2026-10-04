"""Pravi Leaflet i raster: oznake/linije, izbor, import, maska, brzo skrivanje i smjerovi."""
import asyncio,importlib.util,mimetypes,os
from pathlib import Path
from playwright.async_api import async_playwright
spec=importlib.util.spec_from_file_location('project',Path(__file__).with_name('project-vlake-220.py'));u=importlib.util.module_from_spec(spec);spec.loader.exec_module(u);b=u.b
start=b.SOURCE.index('let _refVisible =');code=b.SOURCE[start:b.SOURCE.index('// ─── Repozitorij referentnih slika',start)]
code+='\n'.join(b.function(n) for n in ['ReferenceVlakePreset','_refDetModeChanged','_refPickColorFromMap','refKartaRunDetect','_refKartaDoDetect','_refRemoveSmallComponents','_refBoldFilter','_zhangSuenThin','_traceSkeleton','_dpSimplify2D','_refJoinPaths','_saveLocalVlake','calcL','ptAtFrac','ptDist'])
code+='''
map.createPane('vlakeLines');
const LOCAL_VLAKE_KEY='fixture-ref-vlake',graniceOdjeli=[];let _refDetectedLines=[];
let saveCalls=[],confirmWait=null;const _dlgConfirm=async()=>true,_dlgPrompt=async()=> 'T7';
const _vlakeRenderer=L.canvas({pane:'vlakeLines'}),_refRepoLoad=()=>{},_oslobodiPaneRenderer=()=>{},_mean=a=>a.reduce((s,v)=>s+v,0)/a.length;
const updateVlakaLabel=()=>{},sbFlushVlaka=i=>saveCalls.push(vlake[i].nm),rndList=()=>{},updBan=()=>{},updOvl=()=>{},updProjStats=()=>{},_updVlakeMapVisibility=()=>{};
let _puteviLayerFg=null;
const words=[{text:'T12',x0:180,y0:100,x1:240,y1:132,line:'1'},{text:'T3',x0:550,y0:310,x1:598,y1:340,line:'2'},{text:'ODJEL',x0:90,y0:50,x1:190,y1:75,line:'3'},{text:'105',x0:200,y0:50,x1:248,y1:75,line:'3'}];
let holdOCR=false,ocrId=null;
window.AndroidReferenceOcr={recognize:(id,data)=>{ocrId=id;if(!holdOCR)setTimeout(()=>ReferenceVlake.ocrReply({id,words}),5)}};
function makePaper(){const c=document.createElement('canvas');c.width=800;c.height=600;const x=c.getContext('2d');x.fillStyle='#fff';x.fillRect(0,0,800,600);x.lineWidth=4;x.strokeStyle='#111';x.strokeRect(30,40,730,520);x.beginPath();x.moveTo(70,160);x.lineTo(350,160);x.stroke();x.strokeStyle='#1e40af';x.beginPath();x.moveTo(440,360);x.lineTo(740,360);x.moveTo(70,450);x.lineTo(330,450);x.stroke();x.font='bold 30px Arial';x.fillStyle='#111';x.fillText('T12',180,130);x.fillStyle='#1e40af';x.fillText('T3',550,338);x.fillStyle='#111';x.fillText('ODJEL 105',90,75);x.fillText('T7',120,435);return c.toDataURL();}
window.refReady=new Promise(resolve=>window.addEventListener('DOMContentLoaded',async()=>{await fixtureReady;map.createPane('refKarte');map.getPane('refKarte').style.zIndex='620';_refImg=new Image();await new Promise(r=>{_refImg.onload=r;_refImg.src=makePaper()});_refBounds=[[44.89,16],[44.91,16.03]];document.querySelector('#refkarta-ctrl').style.display='';_placeRefOverlay();_puteviLayerFg=L.geoJSON({type:'FeatureCollection',features:[{type:'Feature',geometry:{type:'LineString',coordinates:[[16,44.899],[16,44.904]]}}]});resolve();},{once:true}));
'''
ref=b.section('      <!-- REFERENTNA KARTA -->','    </div><!-- /panel -->')
quick=b.section('      <div id="reference-quick-controls">','      <!-- Kolege live indicator -->')
fixture=u.fixture.replace("switchTab=()=>{},selI","switchTab=()=>{document.querySelector('#fixture-ref').style.display='none'},selI").replace('</body>','<div id="fixture-ref" style="display:none;position:fixed;inset:12px 0 88px;overflow:auto;background:var(--field-card);z-index:1800;padding:12px">'+ref+'</div>'+quick+'<script>'+code+'</script><script src="/static/js/reference-vlake.js"></script><script src="/static/js/vlaka-direction.js"></script></body>')
async def main():
 b.OUT.mkdir(parents=True,exist_ok=True)
 async with async_playwright() as p:
  browser=await p.chromium.launch(headless=True,**({'executable_path':os.environ['UI_CHROMIUM']} if os.environ.get('UI_CHROMIUM') else {}));page=await browser.new_page(viewport={'width':390,'height':800},has_touch=True);errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  async def route(r):
   if r.request.url=='https://ui.test/':await r.fulfill(content_type='text/html',body=fixture)
   elif r.request.url.startswith('https://ui.test/'):
    f=b.ROOT/r.request.url.split('ui.test/',1)[1].split('?',1)[0];await r.fulfill(content_type=mimetypes.guess_type(str(f))[0] or 'application/octet-stream',body=f.read_bytes()) if f.is_file() else await r.fulfill(status=404,body='fixture')
   else:await r.abort()
  await page.route('**/*',route);await page.goto('https://ui.test/');await page.evaluate('refReady');await page.evaluate("document.querySelector('#fixture-project').style.display='none'");assert not errors,errors
  opts={'threshold':120,'minLength':25,'mode':'dark','color':None,'tolerance':70,'bold':0,'join':14}
  await page.evaluate('(o)=>ReferenceVlake.detect(o)',opts)
  assert await page.evaluate('_refDetectedLines.map(r=>r.nm)')==['T3','T12'],await page.locator('#refkarta-detect-status').inner_text()
  # Linije bez T oznake i granica nisu predložene; originalni brojevi se čuvaju.
  await page.context.set_offline(True)
  await page.evaluate('(o)=>ReferenceVlake.detect(o)',opts);assert await page.evaluate('_refDetectedLines.length')==2
  await page.evaluate("()=>{window.beforeCount=vlake.length;window.oldSet=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k===LOCAL_VLAKE_KEY)throw new DOMException('full','QuotaExceededError');return oldSet.call(this,k,v)};}")
  await page.evaluate('ReferenceVlake.importSelected()');assert await page.evaluate('vlake.length===beforeCount&&saveCalls.length===0&&_refDetectedLines.length===2')
  await page.evaluate('Storage.prototype.setItem=oldSet;ReferenceVlake.importSelected()')
  assert await page.evaluate('saveCalls')==['T3','T12'],await page.evaluate('({saveCalls,count:vlake.length,rows:_refDetectedLines.map(r=>r.nm)})');assert await page.evaluate("JSON.parse(localStorage.getItem(LOCAL_VLAKE_KEY)).some(v=>v.nm==='T12'&&v.projekt_id==='P')")
  await page.context.set_offline(False)
  await page.evaluate('(o)=>ReferenceVlake.detect(o)',opts);assert await page.evaluate('_refDetectedLines.length')==0;assert 'Već postoji' in await page.locator('#refkarta-results').inner_text()
  # Refitting ostaje skriven i ne briše geometriju; radi i za server overlay.
  await page.click('#refkarta-quick');assert await page.evaluate("map.getPane('refKarte').style.visibility")=='hidden';await page.evaluate('_placeRefOverlay()');assert await page.evaluate("map.getPane('refKarte').style.visibility")=='hidden'
  await page.click('#refkarta-quick');assert await page.evaluate("map.getPane('refKarte').style.visibility")=='';assert await page.locator('#refkarta-vis').is_checked()
  await page.evaluate("_refRepoOverlays.test=L.imageOverlay(_refImg.src,_refBounds,{pane:'refKarte'}).addTo(map);refKartaSetVisible(false);ReferenceVlake.refreshQuick()")
  await page.click('#refkarta-quick');assert await page.evaluate("map.getPane('refKarte').style.visibility")=='hidden';await page.click('#refkarta-quick')
  # Rukopis koji OCR nije pročitao: stvarni natpis ručno, bez native mosta.
  await page.evaluate('window.savedOCR=window.AndroidReferenceOcr;delete window.AndroidReferenceOcr')
  # Stvarni dodir kroz postojeći klikabilni marker; nakon kraja/otkaza klikovi se vraćaju.
  await page.evaluate("()=>{window.labelLL=L.latLng(ReferenceVlake.pixelToLL(140,425));map.setView(labelLL,15,{animate:false});window.markerClicks=0;window.blockingMarker=L.marker(labelLL,{icon:L.divIcon({className:'reference-test-marker',html:'<b style=\"display:block;background:red;width:40px;height:40px\">X</b>',iconSize:[40,40],iconAnchor:[20,20]}),bubblingMouseEvents:false}).on('click',()=>markerClicks++).addTo(map);}")
  await page.evaluate('ReferenceVlake.addLabel()');assert await page.evaluate('ReferenceVlake.isMarking()')
  await page.keyboard.press('Escape');assert await page.evaluate("!ReferenceVlake.isMarking()&&!map.getContainer().classList.contains('reference-marking')")
  await page.evaluate('ReferenceVlake.addLabel()')
  xy=await page.evaluate('()=>{const p=map.latLngToContainerPoint(labelLL),r=map.getContainer().getBoundingClientRect();return {x:r.left+p.x,y:r.top+p.y}}')
  await page.touchscreen.tap(xy['x'],xy['y']);assert await page.evaluate('markerClicks')==0
  assert not await page.evaluate('ReferenceVlake.isMarking()');await page.evaluate('(o)=>ReferenceVlake.detect(o)',opts)
  assert await page.evaluate('_refDetectedLines.map(r=>r.nm)')==['T7'],await page.locator('#refkarta-detect-status').inner_text()
  assert await page.evaluate("!map.getContainer().classList.contains('reference-marking')")
  await page.touchscreen.tap(xy['x'],xy['y']);assert await page.evaluate('markerClicks')==1
  await page.evaluate('async()=>{map.removeLayer(blockingMarker);await ReferenceVlake.importSelected();window.AndroidReferenceOcr=savedOCR}')
  # Nov projekat/poravnanje otkazuje odgovor starog OCR-a.
  await page.evaluate("()=>{holdOCR=true;window.oldDetect=ReferenceVlake.detect("+str(opts).replace('None','null').replace("'",'"')+");}")
  await page.evaluate("_aktivniProjektId='Q';ReferenceVlake.ocrReply({id:ocrId,words})");await page.evaluate('oldDetect');assert await page.evaluate('_refDetectedLines.length')==0
  await page.evaluate("_aktivniProjektId='P';holdOCR=false;_refCPs=[{imgX:0,imgY:0,lat:44.9,lng:16},{imgX:800,imgY:0,lat:44.901,lng:16.009},{imgX:800,imgY:600,lat:44.895,lng:16.008}]")
  assert await page.evaluate('''()=>{const ll=ReferenceVlake.pixelToLL(400,300),actual=map.latLngToLayerPoint(ll),a=map.latLngToLayerPoint([44.9,16]),b=map.latLngToLayerPoint([44.895,16.008]);return Math.hypot(actual.x-(a.x+b.x)/2,actual.y-(a.y+b.y)/2)<2}''')
  await page.evaluate('_refCPs=[];_placeRefOverlay()')
  # Jedna/dvije strelice, srednji dvosmjer, lokalna postavka po nalogu.
  await page.evaluate("()=>{window.dirV=vlake.find(v=>v.nm==='T12');_vpIdx=vlake.indexOf(dirV);_vpSharedKey=null;const p=ptAtFrac(dirV.pts,.2),atM=VlakaDirection.routeProjection(dirV.pts,p).atM;localStorage.setItem(VlakaDirection.storeKey('P'),JSON.stringify({[VlakaDirection.identity(dirV)]:{mode:'both',split:{...p,atM}}}));VlakaDirection.draw(dirV);}")
  assert await page.evaluate('dirV._directionMarkers.length')==3
  await page.evaluate("VlakaDirection.setPopup('start')");assert await page.evaluate('dirV._directionMarkers.length')==2
  await page.evaluate("sbUser={id:'B'}");assert await page.evaluate('VlakaDirection.modeFor(dirV)')=='auto';await page.evaluate("sbUser={id:'A'}")
  # Stvarni Leaflet Canvas: tačke su krugovi, crtice imaju kratke vidljive razmake.
  for z in [13,15,17]:
   for mode in ['dash','dot']:
    result=await page.evaluate("""async ({z,mode})=>{map.setZoom(z,{animate:false});map.invalidateSize();const renderer=L.canvas({pane:'vlakeLines'}),ll=[map.containerPointToLatLng([35,110]),map.containerPointToLatLng([350,110])],line=L.polyline(ll,{color:'#ff00ff',weight:4,..._vlakaStroke(mode,4,z),renderer,pane:'vlakeLines'}).addTo(map);await new Promise(r=>setTimeout(r,80));const y=Math.round(map.latLngToLayerPoint(map.containerPointToLatLng([40,110])).y-renderer._bounds.min.y),x=Math.round(map.latLngToLayerPoint(map.containerPointToLatLng([40,110])).x-renderer._bounds.min.x),pixels=renderer._container.getContext('2d').getImageData(x,y,280,1).data;let runs=[],last=null,count=0;for(let i=0;i<280;i++){const ink=pixels[i*4]>200&&pixels[i*4+1]<80&&pixels[i*4+2]>200&&pixels[i*4+3]>100;if(ink===last)count++;else{if(last!==null)runs.push({ink:last,count});last=ink;count=1;}}map.removeLayer(line);map.removeLayer(renderer);return runs.slice(1,-1);} """,{'z':z,'mode':mode})
    ink=[r['count'] for r in result if r['ink']];gaps=[r['count'] for r in result if not r['ink']]
    assert len(ink)>10 and max(gaps)<=5,(z,mode,result)
    if mode=='dot':assert max(ink)<=5,(z,mode,result)
    else:assert min(ink)>=5 and max(ink)<=10,(z,mode,result)
  for theme in ['day','dark']:
   for w,h in [(320,568),(390,800),(568,320),(800,600)]:
    await page.set_viewport_size({'width':w,'height':h});await page.evaluate("t=>{document.documentElement.dataset.fieldTheme=t;document.querySelector('#fixture-project').style.display='none';document.querySelector('#fixture-ref').style.display='block';document.querySelector('#fixture-ref').scrollTop=0}",theme)
    assert await page.locator('#fixture-ref').evaluate('(e)=>e.scrollWidth<=e.clientWidth+1');await page.screenshot(path=str(b.OUT/f'reference-panel-{theme}-{w}-{h}.png'))
    await page.evaluate("document.querySelector('#fixture-ref').style.display='none'");await b.bounds(page,'#refkarta-quick',w,h)
    await page.screenshot(path=str(b.OUT/f'reference-quick-{theme}-{w}-{h}.png'))
  await page.evaluate('refKartaRemove()');assert await page.evaluate('_refImg') is None;assert not errors,errors;await browser.close()
 print('OK: vrai raster, T-only filtering, original T numbers, online detection, offline import, duplicate protection, hidden fit, repo quick-toggle, stale OCR, affine coordinates, direction and 16 PNG')
if __name__=='__main__':asyncio.run(main())
