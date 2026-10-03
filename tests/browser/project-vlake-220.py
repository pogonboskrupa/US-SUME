"""Stvarni Leaflet: boje vlastitih/koleginih vlaka, projekat, Snimi vlaku i upute."""
import asyncio,importlib.util,mimetypes,os,re
from pathlib import Path
from playwright.async_api import async_playwright
spec=importlib.util.spec_from_file_location('shared',Path(__file__).with_name('server-map-218.py'))
s=importlib.util.module_from_spec(spec);spec.loader.exec_module(s);b=s.b
start=b.SOURCE.index('// Boje i stil prikaza po projektu')
code=b.SOURCE[start:b.SOURCE.index('function buildC()',start)]
code+='\n'.join(b.function(n) for n in ['_patchKolegaVlaka','togSnimVlaku','_openLayerSheet','closeLayerSheet','_lsTab','showHelp','closeHelp','helpTab','toggleHelpSec'])
APP_VERSION=re.search(r"const APP_VER = 'v([^']+)'",b.SOURCE).group(1)
code+="\nconst APP_VER='v"+APP_VERSION+"';"
code+='''
let pickerClicks=0;
const _openVlakaPicker=()=>{pickerClicks++},_schedKolegeFullSync=()=>{};
const _ovlState={},_wbOn=false,_instUpdateStats=()=>{},_lsRenderSqlite=()=>{},_activeLayerKey=()=>'',_lsRenderGranice=()=>{},_lsRenderCache=()=>{},_lsRenderTem=()=>{};
function uiProjectShow(){document.querySelector('#fixture-project').style.display='block';}
window.fixtureReady=(async()=>{
 _OL.loadQueue=()=>[]; // izolovan projekat bez reda slanja iz osnovnog Server testa
 for(const nm of ['T10','T1.10','T1.2']){const poly=L.polyline([[44.9,16],[44.901,16.001]],{color:'#112233'}).addTo(map);vlake.push({nm,kr:nm.includes('.')?1:0,sbId:nm,projektId:'P',color:'#112233',pts:fixturePoints,poly});}
 await sbLoadKolegeVlake([...fixtureRows,{...fixtureRows[0],id:'rC',nm:'T2.1',kr:1}]);_rndBojaPresets();
 document.querySelector('#action-bar').style.display='flex';
 for(const e of document.querySelectorAll('#action-bar>button,#action-bar>div'))if(!['brec','btragovi','ab-loc-wrap'].includes(e.id))e.style.display='none';
 document.querySelector('#btragovi').style.display='flex';uiProjectShow();
})();
'''
colors=b.section('      <!-- BOJE VLAKA -->','      <!-- SREDNJA TRANSPORTNA DISTANCA')
action=b.section('<div id="action-bar">','<!-- Trag quick meta panel')
help_html=b.section('<div id="help-modal">','<!-- M&T BOTTOM SHEET -->')
sheet=b.section('<div id="layer-sheet-bg"','<!-- Modal: učitaj KML') if '<!-- Modal: učitaj KML' in b.SOURCE else b.section('<div id="layer-sheet-bg"','<div id="layer-import-modal"')
markup='<div id="fixture-project" style="position:fixed;inset:12px 0 88px;overflow:auto;z-index:1800;background:var(--field-bg);padding:12px">'+colors+'</div>'+action+help_html+sheet
fixture=s.fixture.replace('</body>',markup+'<script>'+code+'</script></body>')
async def main():
 b.OUT.mkdir(parents=True,exist_ok=True)
 async with async_playwright() as p:
  browser=await p.chromium.launch(headless=True,**({'executable_path':os.environ['UI_CHROMIUM']} if os.environ.get('UI_CHROMIUM') else {}))
  page=await browser.new_page(viewport={'width':390,'height':800});errors=[]
  page.on('pageerror',lambda e:errors.append(str(e)))
  async def route(r):
   if r.request.url=='https://ui.test/':await r.fulfill(content_type='text/html',body=fixture)
   elif r.request.url.startswith('https://ui.test/'):
    f=b.ROOT/r.request.url.split('ui.test/',1)[1].split('?',1)[0]
    if f.is_file():await r.fulfill(content_type=mimetypes.guess_type(str(f))[0] or 'application/octet-stream',body=f.read_bytes())
    else:await r.fulfill(status=404,body='fixture')
   else:await r.abort()
  await page.route('**/*',route);await page.goto('https://ui.test/');await page.evaluate('fixtureReady');assert not errors,errors
  await page.evaluate("_bojaVlChange('#123456');_bojaKrChange('#654321')")
  assert await page.evaluate("vlake[0].poly.options.color==='#123456'&&vlake[1].poly.options.color==='#654321'&&kolegeVlakeMap['B::T2'].poly.options.color==='#123456'&&kolegeVlakeMap['B::T2.1'].poly.options.color==='#654321'")
  names=await page.evaluate('_projektVlakeRows().map(r=>r.nm)')
  assert names==['T1.2','T1.10','T2','T2.1','T10'],names
  assert 'Amir Kolega' in await page.locator('#project-vlake-list').inner_text()
  await page.evaluate("_patchKolegaVlaka({...fixtureRows[0],boja:'#ffffff',kr:0})")
  assert await page.evaluate("kolegeVlakeMap['B::T2'].poly.options.color==='#123456'")
  for theme in ['day','dark']:
   for w,h in [(320,568),(390,800),(568,320),(800,600)]:
    await page.set_viewport_size({'width':w,'height':h})
    await page.evaluate("t=>{document.documentElement.dataset.fieldTheme=t;uiProjectShow();document.querySelector('#fixture-project').scrollTop=0}",theme)
    await b.bounds(page,'#brec',w,h)
    if theme=='day':
     assert await page.locator('.project-colors>div:last-child>div>span').first.evaluate("e=>getComputedStyle(e).color")==await page.locator('#boja-project-context').evaluate("e=>getComputedStyle(e).color")
    assert await page.evaluate("document.querySelector('#fixture-project').scrollWidth<=document.querySelector('#fixture-project').clientWidth+1")
    await page.screenshot(path=str(b.OUT/f'project-colors-{theme}-{w}-{h}.png'))
    await page.locator('#fixture-project').evaluate('(e)=>e.scrollTop=e.scrollHeight')
    await page.screenshot(path=str(b.OUT/f'project-vlake-{theme}-{w}-{h}.png'))
    await page.evaluate('showHelp()');await page.locator('#help-pane-gen .help-sec-hdr').first.click()
    await b.bounds(page,'#help-modal',w,h)
    await page.screenshot(path=str(b.OUT/f'help-{theme}-{w}-{h}.png'))
    await page.evaluate('closeHelp()')
    await page.evaluate("document.querySelector('#help-pane-gen .help-sec-body').classList.remove('open')")
  await page.set_viewport_size({'width':390,'height':800});await page.click('#brec');assert await page.evaluate('pickerClicks')==1
  await page.evaluate("document.querySelector('#fixture-project').style.display='none';_openLayerSheet();_lsTab('inst')")
  assert await page.locator('#ls-pane-inst').is_visible()
  assert not await page.locator('#ls-pane-karte').is_visible()
  await page.evaluate('closeLayerSheet()')
  await page.context.set_offline(True);await page.reload();await page.evaluate('fixtureReady')
  assert await page.evaluate("vlake[0].poly.options.color==='#123456'&&kolegeVlakeMap['B::T2'].poly.options.color==='#123456'")
  await page.evaluate("_aktivniProjektId='Q';_rndBojaPresets()")
  assert await page.evaluate('getBojaVlake()')=='#60a5fa'
  await page.evaluate("_aktivniProjektId='P';sbUser={id:'B'}")
  assert await page.evaluate('getBojaVlake()')=='#60a5fa'
  assert not errors,errors
  await browser.close()
 print('OK: vlastite/kolegine boje, realtime, offline preferencije, numerički spisak, Snimi, instalirane karte i upute; 24 PNG')
if __name__=='__main__':asyncio.run(main())
