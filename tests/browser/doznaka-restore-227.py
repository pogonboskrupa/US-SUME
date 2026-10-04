"""Stvarni Doznaka HTML/JS i Leaflet: odjeli, GPS-first UI, GPX i ponovni ulaz."""
import asyncio,importlib.util,mimetypes,os,re
from pathlib import Path
from playwright.async_api import async_playwright
spec=importlib.util.spec_from_file_location('base',Path(__file__).with_name('menu-tools.py'));b=importlib.util.module_from_spec(spec);spec.loader.exec_module(b)
start=b.SOURCE.index('const DOZ_TYPES =');end=b.SOURCE.index('// ─── HELP MODAL',start);code=b.SOURCE[start:end]
html=b.SOURCE[b.SOURCE.index('    <div id="doznaka-panel">'):b.SOURCE.index('    <!-- MAP -->',b.SOURCE.index('    <div id="doznaka-panel">'))]
functions='\n'.join(b.function(n) for n in ['_escHtml','_escXml','fmtL','fmtHa','fmtDateShort','dst','_hexToRgb','_hexToRgbCsv'])
setup='''
let sbUser={id:'A'},sbProfile={ime:'Emina',prezime:'Projektant'},_projekti=[{id:'P',gj:'Una',odjel:'105'}],vlake=[];
const getIme=()=> 'Emina Projektant',showToast=()=>{},_tabContext=()=>{},_mrezaProbaj=()=>false,_serverSlanjeDozvoljeno=()=>false,_dlgConfirm=async()=>true;
const _DOZ_TRACK_BUF_KEY='buffer',_locFotos=[],_sharedFotos=[],_tacke=[],textLabels=[],_tragRegistry=[],_tragLayers={},_tragHitLayers={},_tragLenMk={},_msrRegistry=[];let _msrSavedLayer=null;
const _localSetKriticno=(k,v)=>{try{localStorage.setItem(k,v);return true;}catch(e){return false;}},_genUUID=()=>crypto.randomUUID(),_updSyncBadge=()=>{},_tragRegSave=()=>{},_tragoviRender=()=>{};
const _OL={DOZ_SEL_ID:'selection',DOZ_ODJELI:'odjeli',QUEUE:'queue',load:k=>JSON.parse(localStorage.getItem(k)||'null'),save:(k,v)=>_localSetKriticno(k,JSON.stringify(v)),loadQueue:()=>JSON.parse(localStorage.getItem('queue')||'[]')};
const map=L.map('map').setView([44.9,16],14);map.createPane('tragMsrLines');
function _tragRegAddLayer(t){if(_tragLayers[t.id])map.removeLayer(_tragLayers[t.id]);const l=L.polyline(t.pts);_tragLayers[t.id]=l;if(typeof _tvTrackVisible==='function'?_tvTrackVisible(t):t.visible!==false)l.addTo(map);}
'''
setup+='\n'+functions+'\n'+code+'''
const ring=[[16,44.9],[16.01,44.9],[16.01,44.91],[16,44.91],[16,44.9]];
_dozOdjeli=[{id:'D105',name:'Una · 105',created_by:'A',known_area_ha:87,boundary_geojson:{type:'Polygon',coordinates:[ring]},status:'active',created_at:'2026-10-01'}, {id:'D206',name:'Sana · 206',created_by:'B',status:'paused',created_at:'2026-10-02'}];
_dozSubProject=()=>{};let pendingLoads={};dozLoadLayers=async(id)=>{if(window.holdLoad)await new Promise(r=>pendingLoads[id]=r);_dozMembers=[{user_id:'A',role:'manager',_korisnik:{ime:'Emina',prezime:'Projektant'}}];_dozMarkings=[{id:'local_1',label:'Zaštitna zona',marking_type:'protection',area_ha:1.1,boundary_geojson:{type:'Polygon',coordinates:[ring]}}];_dozTracks=[];dozRenderMapLayers();};
let restored=[];const restoreTrees=_dozTreesRestoreForOdjel;_dozTreesRestoreForOdjel=id=>{restored.push(id);restoreTrees(id);};
dozRenderOdjeli();_tragRegistry.push({id:'walk',visible:true,pts:[[44.9,16],[44.901,16.001]]});_tragRegAddLayer(_tragRegistry[0]);
'''
fixture='<!DOCTYPE html><html lang="bs"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/static/libs/leaflet.min.css"><style>'+b.styles+'''#main{position:fixed;inset:0}#map{position:absolute;inset:0}#doznaka-panel{display:flex;position:absolute;inset:0;z-index:900;width:100%;max-width:420px;overflow:auto;box-sizing:border-box}</style></head><body>'''+b.sprite+'<div id="main"><div id="map"></div>'+html+'</div><script src="/static/libs/leaflet.min.js"></script><script src="/static/libs/turf.min.js"></script><script>'+setup+'</script><script src="/static/js/map-visibility.js"></script></body></html>'
async def main():
 b.OUT.mkdir(parents=True,exist_ok=True)
 async with async_playwright() as p:
  browser=await p.chromium.launch(headless=True,**({'executable_path':os.environ['UI_CHROMIUM']} if os.environ.get('UI_CHROMIUM') else {}));page=await browser.new_page(viewport={'width':390,'height':800});errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  async def route(r):
   if r.request.url=='https://ui.test/':await r.fulfill(content_type='text/html',body=fixture)
   elif r.request.url.startswith('https://ui.test/'):
    f=b.ROOT/r.request.url.split('ui.test/',1)[1].split('?',1)[0]
    if f.is_file():await r.fulfill(content_type=mimetypes.guess_type(str(f))[0] or 'application/octet-stream',body=f.read_bytes())
    else:await r.fulfill(status=404,body='fixture')
   else:await r.abort()
  await page.route('**/*',route);await page.goto('https://ui.test/');assert not errors,errors
  await page.fill('#doz-search','206');assert await page.locator('.doz-odjel-card').count()==1;await page.fill('#doz-search','')
  # Slow old selection cannot restore its trees/link into the new department.
  await page.evaluate("holdLoad=true;window.first=dozSelectOdjel('D105');window.second=dozSelectOdjel('D206');pendingLoads.D206()")
  await page.evaluate('second');await page.evaluate('pendingLoads.D105();first');assert await page.evaluate('restored')==['D206']
  await page.evaluate("holdLoad=false;dozSelectOdjel('D105')");assert 'Emina Projektant' in await page.locator('#doz-context').inner_text()
  assert await page.locator('#doz-panel-detail>.sec').first.get_attribute('id')=='doz-section-gps'
  assert await page.locator('.doz-zone-del').count()==1
  # Exact source and valid XML for special characters in department names.
  await page.evaluate("_dozOdjeli[0].name='Una & <105>';_dozGpsExportContext={projectId:'D206',userId:'A'};_dozGpsFullPts=[{lat:1,lon:1}];_dozTracks=[{user_id:'A',latitude:44.9,longitude:16,altitude:500,recorded_at:'2026-10-04T10:00:00Z'},{user_id:'A',latitude:44.901,longitude:16.001,altitude:510,recorded_at:'2026-10-04T10:10:00Z'}];window.savedBlob=null;URL.createObjectURL=(b)=>{savedBlob=b;return 'blob:test'};HTMLAnchorElement.prototype.click=()=>{};dozExportGPX()")
  text=await page.evaluate('savedBlob.text()');assert '<name>Una &amp; &lt;105&gt;</name>' in text and 'lat="1"' not in text
  assert await page.evaluate("async()=>!new DOMParser().parseFromString(await savedBlob.text(),'application/xml').querySelector('parsererror')")
  assert text.count('<trkseg>')==2
  await page.evaluate("_tvVisibilitySet('all',false)");assert not await page.evaluate("map.hasLayer(_tragLayers.walk)")
  await page.reload();await page.evaluate('_tvVisibilityRestore()');assert not await page.evaluate("map.hasLayer(_tragLayers.walk)");assert not await page.evaluate("_tvCategoryOn('photos')")
  await page.evaluate("dozSelectOdjel('D105')")
  for theme in ['day','dark']:
   for w,h in [(320,568),(390,800),(568,320),(800,600)]:
    await page.set_viewport_size({'width':w,'height':h});await page.evaluate("t=>{document.documentElement.dataset.fieldTheme=t;document.querySelector('#doznaka-panel').scrollTop=0;window.scrollTo(0,0)}",theme)
    assert await page.evaluate("document.querySelector('#doznaka-panel').scrollWidth<=document.querySelector('#doznaka-panel').clientWidth+1")
    colors=await page.evaluate("()=>{const css=getComputedStyle(document.documentElement);return {ink:css.getPropertyValue('--field-ink').trim(),card:css.getPropertyValue('--field-card').trim(),bg:css.getPropertyValue('--field-bg').trim(),head:getComputedStyle(document.querySelector('.doz-detail-hdr')).backgroundColor,kpi:getComputedStyle(document.querySelector('.pm-kpi')).backgroundColor};}")
    def rgb(h):
     h=h.lstrip('#');h=''.join(c*2 for c in h) if len(h)==3 else h
     return 'rgb('+', '.join(str(int(h[i:i+2],16)) for i in [0,2,4])+')'
    assert colors['head']==rgb(colors['card']) and colors['kpi']==rgb(colors['bg']),colors
    assert await page.locator('#doz-detail-name').evaluate('(e)=>getComputedStyle(e).color')==rgb(colors['ink'])
    await page.screenshot(path=str(b.OUT/f'doznaka-{theme}-{w}-{h}.png'))
    await page.get_by_role('button',name='Zone',exact=True).click();await page.wait_for_timeout(450);await page.screenshot(path=str(b.OUT/f'doznaka-zones-{theme}-{w}-{h}.png'))
  assert not errors,errors;await browser.close()
 print('OK: slow selection, correct GPX + XML/gaps, local zone removal button, reload visibility, Doznaka day/dark 16 PNG')
if __name__=='__main__':asyncio.run(main())
