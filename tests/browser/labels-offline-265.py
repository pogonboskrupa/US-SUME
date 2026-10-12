"""Stvarni Leaflet/editor/dijalog: ID tipovi, trajno brisanje i offline katalog."""
import asyncio,importlib.util,mimetypes,os
from pathlib import Path
from playwright.async_api import async_playwright
ROOT=Path(__file__).resolve().parents[2]
spec=importlib.util.spec_from_file_location('b',Path(__file__).with_name('menu-tools.py'));b=importlib.util.module_from_spec(spec);spec.loader.exec_module(b)
code='''let textLabels=[],sbUser={id:'A'},sbProfile={sumarija:'Test'},_tlSelColor=null;
const map=L.map('map').setView([44.9,16],13),showToast=()=>{},_tvCategoryOn=()=>true;
let _sqlLayers=[],_sqlRestoreFailed=[],_mapFavs=[];const _activeLayerKey=()=>'';
const _GUIDE_ROUTES_KEY='fixture_routes';let _guideActiveRouteId=null;
const _guideClearResult=()=>{},_guideRenderRoutes=()=>{},fmtL=n=>n+' m';
const _instUpdateStats=()=>{},closeLayerSheet=()=>{},openLoadMapScreen=()=>{},_loadmapTab=()=>{};
function setLayerSqlite(i){_sqlLayers.forEach((l,j)=>{l.visible=j===i;if(j===i)l.layer.addTo(map);else map.removeLayer(l.layer)});_lsRenderSqlite()}
let removed=[];const sqlmapRemove=async i=>{removed.push(_sqlLayers[i].name);_sqlLayers.splice(i,1)};
const sqlmapRetryOne=async name=>{_sqlRestoreFailed=_sqlRestoreFailed.filter(r=>r.name!==name);_sqlLayers.push({name,fmt:'mbtiles',visible:false,layer:L.layerGroup()})};
function seed(id){closeTextDialog();textLabels.forEach(l=>map.removeLayer(l.marker));textLabels=[{id,lat:44.9,lng:16,text:'60',size:18,color:'#ffffff'}];textLabels[0].marker=createTextMarker(textLabels[0]);saveTextLabels();openTextDialog(44.9,16,id)}
'''
code+='\n'+(ROOT/'static/js/offline-layer.js').read_text()
code+='\n'+b.section('let _dlgResolve = null;', 'function _tastaturaPoljeVidljivo(')
code+='\n'+b.section('async function _dlgConfirm(', 'async function _dlgPrompt(')
code+='\n'+'\n'.join(b.function(n) for n in ['openTextDialog','selectLabelColor','closeTextDialog','confirmTextLabel','createTextMarker','deleteTextLabel','saveTextLabels','sbSaveTextLabels','sbLoadTextLabelsDB','escHtml','_escHtml','_lsTab','_lsRenderSqlite','sqlmapConfirmDelete','_guideRoutesLoad','_guideRoutesStore','_guideDeleteRoute','_guideAskDeleteRoute','_guideRoutePopupHtml'])
html='<!DOCTYPE html><html lang="bs"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/static/libs/leaflet.min.css"><style>'+b.styles+'\n#map{position:fixed;inset:0;background:#dae8ce}</style></head><body>'+b.sprite+'<div id="map"></div>'+b.section('<div id="dlg-overlay"','<!-- Fullscreen foto')+b.section('<div id="layer-sheet-bg"','<div id="syncq-bg"')+'<script src="/static/libs/leaflet.min.js"></script><script>'+code+'</script><script src="/static/js/map-catalog.js"></script></body></html>'
async def main():
 out=ROOT/'outputs/ui-preview';out.mkdir(parents=True,exist_ok=True)
 async with async_playwright() as p:
  browser=await p.chromium.launch(**({'executable_path':os.environ['UI_CHROMIUM']} if os.environ.get('UI_CHROMIUM') else {}));page=await browser.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  async def route(r):
   if r.request.url=='https://fixture.test/':await r.fulfill(content_type='text/html',body=html)
   elif r.request.url.startswith('https://fixture.test/static/'):
    f=ROOT/r.request.url.split('fixture.test/',1)[1];await r.fulfill(content_type=mimetypes.guess_type(f)[0] or 'text/plain',body=f.read_bytes())
   else:await r.abort()
  await page.route('**/*',route);await page.goto('https://fixture.test/')
  # Reprodukcija: server/cache string, novi broj i nebrojčani ID bez inline JS interpolacije.
  for id in ['1760000000000',1760000000001,"uuid-'\"-oznaka"]:
   await page.evaluate('seed',id);await page.fill('#tl-text','61');await page.locator('#tl-save').click()
   assert await page.evaluate('textLabels[0].text')=='61'
   await page.evaluate('openTextDialog(44.9,16,textLabels[0].id)');await page.locator('#tl-delete').click();await page.locator('#dlg-cancel').click();await page.wait_for_timeout(450)
   assert await page.evaluate('textLabels.length')==1
   await page.locator('#tl-delete').click();await page.locator('#dlg-ok').click();await page.wait_for_timeout(450)
   assert await page.evaluate('textLabels.length===0&&!document.getElementById("text-dialog")&&_OL.load(_OL.LABELS).length===0')
   await page.reload();await page.evaluate('sbLoadTextLabelsDB()');assert await page.evaluate('textLabels.length')==0
  # Nedostatak prostora: brisanje/edit ne smiju ukloniti lokalni zapis ni marker.
  await page.evaluate("seed('1760000000000');window.oldSet=Storage.prototype.setItem;Storage.prototype.setItem=function(){throw new Error('quota')};void 0")
  await page.fill('#tl-text','62');await page.locator('#tl-save').click();assert await page.evaluate('textLabels[0].text')=='60'
  await page.locator('#tl-delete').click();await page.locator('#dlg-ok').click();await page.wait_for_timeout(450)
  assert await page.evaluate('textLabels.length===1&&map.hasLayer(textLabels[0].marker)')
  await page.evaluate('Storage.prototype.setItem=oldSet;void 0');await page.locator('#tl-delete').click();await page.evaluate("sbUser={id:'B'}");await page.locator('#dlg-ok').click();await page.wait_for_timeout(450)
  assert await page.evaluate('textLabels.length')==1
  await page.evaluate("sbUser={id:'A'};closeTextDialog()")
  # Popup rute koristi vlastiti ID, bez undefined t i native confirm.
  await page.evaluate("_guideRoutesStore([{id:'route',name:'Ruta',pts:[]}]);L.popup().setLatLng([44.9,16]).setContent(_guideRoutePopupHtml({id:'route',name:'Ruta',pts:[]})).openOn(map)")
  await page.locator('.trag-popup button').last.click();await page.locator('#dlg-cancel').click();await page.wait_for_timeout(450);assert await page.evaluate('_guideRoutesLoad().length')==1
  await page.locator('.trag-popup button').last.click();await page.locator('#dlg-ok').click();await page.wait_for_timeout(450);assert await page.evaluate('_guideRoutesLoad().length')==0
  # Lista promijenjena tokom potvrde: briše se uhvaćena karta, ne susjedna.
  await page.evaluate("_sqlLayers=[{name:'A'},{name:'B'},{name:'C'}];window.deletePromise=sqlmapConfirmDelete(1);void 0")
  await page.evaluate('_sqlLayers.shift()');await page.locator('#dlg-ok').click();await page.wait_for_timeout(450)
  assert await page.evaluate("removed.join()==='B'&&_sqlLayers.length===1&&_sqlLayers[0].name==='C'")
  await page.evaluate("_sqlLayers=[{name:'Unsko_2021-2031 — puni naziv karte',fmt:'mbtiles',visible:true,layer:L.layerGroup().addTo(map)}];_sqlRestoreFailed=[{name:'Unsko_2010-2020',deferred:true},{name:'Neispravna <karta>',error:true}];document.getElementById('layer-sheet').style.display='block';_lsTab('offline')")
  assert await page.locator('#ls-pane-offline .offline-map-card').count()==3
  assert await page.locator('#ls-pane-karte .offline-map-card').count()==0
  await page.locator('[data-map-name="Unsko_2010-2020"]').click();assert await page.evaluate("_sqlLayers.some(l=>l.name==='Unsko_2010-2020'&&l.visible)")
  for theme in ['day','dark']:
   for w,h in [(320,568),(390,800),(568,320),(1200,800)]:
    await page.set_viewport_size({'width':w,'height':h});await page.evaluate('(t)=>document.documentElement.dataset.fieldTheme=t',theme)
    await b.bounds(page,'#layer-sheet',w,h);await page.screenshot(path=str(out/f'offline-265-{theme}-{w}x{h}.png'))
    await page.evaluate("document.getElementById('layer-sheet').style.display='none';seed('1760000000000')");await b.bounds(page,'#text-dialog',w,h)
    await page.locator('#tl-delete').click();await page.wait_for_timeout(350);await page.screenshot(path=str(out/f'label-delete-265-{theme}-{w}x{h}.png'));await page.locator('#dlg-cancel').click();await page.wait_for_timeout(450)
    await page.evaluate("closeTextDialog();document.getElementById('layer-sheet').style.display='block';_lsTab('offline')")
  await page.evaluate("_sqlLayers=[];_sqlRestoreFailed=[];_lsRenderSqlite()");assert await page.locator('#ls-sqlite-in-grid .catalog-empty b').inner_text()=='Još nema offline karata'
  assert not errors,errors;await browser.close();print('OK: oznake ID/edit/delete/reload/quota/nalog; ruta popup; index race; offline katalog; 16 prikaza')
if __name__=='__main__':asyncio.run(main())
