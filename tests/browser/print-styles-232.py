"""Stvarni Leaflet: isti lager na karti/legendi, štampa stilova i sigurno vraćanje."""
import asyncio,importlib.util,mimetypes,os
from pathlib import Path
from playwright.async_api import async_playwright
spec=importlib.util.spec_from_file_location('base',Path(__file__).with_name('menu-tools.py'));b=importlib.util.module_from_spec(spec);spec.loader.exec_module(b)
start=b.SOURCE.index('const _STP_FORMATI =');code=b.SOURCE[start:b.SOURCE.index("map.on('moveend zoomend'",start)]
code+='\n'+b.function('_escHtml')
setup='''
const map=L.map('map').setView([44.9,16],14);map.createPane('vlakeLabels');
const showToast=()=>{},_niceScaleLen=()=>100,_fmtScaleLen=x=>String(x),_aktivniProjektId='P',_projekti=[{id:'P',odjel:'105',gj:'Una'}];
const vlake=[{kr:0,poly:L.polyline([[44.899,15.999],[44.901,16.001]],{color:'#1122aa',weight:4,dashArray:'8 4',lineCap:'butt'}).addTo(map)}];
const kolegeVlakeMap={B:{kr:0,poly:L.polyline([[44.898,16],[44.902,16.002]],{color:'#aacc33',weight:3}).addTo(map)}};
const privateLine=L.polyline([[44.898,15.998],[44.902,15.998]],{color:'#880088',weight:2,dashArray:'8 2 2 2',opacity:.7}).addTo(map);
const otherLine=L.polyline([[44.897,15.997],[44.903,16.003]],{color:'#339977',weight:2,dashArray:'6 3'}).addTo(map);
const DemFixture=L.GridLayer.extend({createTile(){const c=document.createElement('canvas');c.width=c.height=256;const ctx=c.getContext('2d');ctx.fillStyle='rgba(230,100,35,.8)';ctx.fillRect(40,40,140,120);ctx.clearRect(90,90,30,30);return c;}});const _OVL={slope:new DemFixture().addTo(map)};
const hiddenLine=L.polyline([[44.9,16],[44.903,16.004]],{color:'#ee33ee'});
const kmlLs=[{name:'Granica sa privatnim',_key:'private',grp:L.layerGroup([privateLine]).addTo(map)},{name:'Odjel 105',_key:'department',grp:L.layerGroup([otherLine]).addTo(map)},{name:'Sakriven sloj',grp:L.layerGroup([hiddenLine])}];
'''
setup+=code+'''
vlake[0].lagerMk=L.marker([44.899,15.999],{icon:L.divIcon({className:'vlaka-lager-mk',html:_stpLagerSvg()})}).addTo(map);
stampaOtvori();_stpUredi();_stpLegStavka('lager',true);
'''
fixture='''<!doctype html><html lang="bs"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/static/libs/leaflet.min.css"><style>'''+b.styles+'''#wrapper{position:fixed;inset:0}#main{position:absolute;inset:0}#map{position:absolute;inset:0;background:#e4ecd9}</style></head><body><div id="wrapper"><div id="main"><div id="map"><div id="print-naslov" class="stp-el"></div><div id="print-legend" class="stp-el"></div><div id="print-scalebar" class="stp-el"><div id="psb-mj"></div><div id="psb-bar"></div><span id="psb-mid"></span><span id="psb-full"></span></div></div></div></div><div id="stampa-kontrole"></div><script src="/static/libs/leaflet.min.js"></script><script src="/static/js/print-slope.js"></script><script>'''+setup+'</script></body></html>'
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
  assert await page.evaluate("privateLine.options.color==='#ff0000' && privateLine.options.dashArray===null && otherLine.options.color==='#339977' && otherLine.options.dashArray==='6 3'")
  await page.wait_for_function('document.querySelector(".stp-slope-polygon path")')
  assert await page.evaluate("[...document.querySelectorAll('.stp-slope-polygon path')].every(p=>p.getAttribute('fill')==='#dc2626'&&p.getAttribute('fill-rule')==='evenodd')")
  assert await page.evaluate("vlake[0].poly.options.weight===1.4 && vlake[0].poly.options.dashArray==='6 4' && vlake[0].poly.options.vlakaOutline===false")
  assert 'Sakriven sloj' not in await page.locator('#stk-uredi').inner_text()
  assert await page.evaluate("document.querySelector('.vlaka-lager-mk svg').innerHTML === [...document.querySelectorAll('#print-legend .pl-row')].find(r=>r.textContent==='Lager').querySelector('svg').innerHTML")
  legend=await page.locator('#print-legend').inner_html();assert '#1122aa' in legend and 'stroke-dasharray="6 4"' in legend
  assert await page.evaluate("[...document.querySelectorAll('#print-legend .pl-row')].find(r=>r.textContent==='Traktorska vlaka').querySelectorAll('line').length===1")
  # Stvarna UI promjena mijenja SVG kartu i legendu, a ne samo polje obrasca.
  await page.locator('details').first.evaluate('(e)=>e.open=true')
  await page.locator('[aria-label="Boja Vlake"]').evaluate("e=>{e.value='#aa1133';e.dispatchEvent(new Event('change',{bubbles:true}))}")
  assert await page.evaluate("vlake[0].poly.options.color==='#aa1133' && kolegeVlakeMap.B.poly.options.color==='#aa1133'")
  assert '#aa1133' in await page.locator('#print-legend').inner_html()
  await page.evaluate("_stpStil(_stpSlojevi().findIndex(r=>r.id==='kml:private'),'color','#000000')")
  assert await page.evaluate("privateLine.options.color==='#ff0000'")
  for w,h in [(320,568),(390,800),(568,320)]:
   await page.set_viewport_size({'width':w,'height':h});await page.evaluate('_stpRaspored()')
   assert await page.locator('#stampa-kontrole').evaluate('(e)=>e.scrollWidth<=e.clientWidth')
   await page.screenshot(path=str(b.OUT/f'print-styles-232-{w}.png'))
  await page.emulate_media(media='print');assert await page.evaluate("getComputedStyle(document.querySelector('#stampa-kontrole')).display==='none'")
  assert await page.evaluate("privateLine._path.getAttribute('stroke')==='#ff0000' && !privateLine._path.getAttribute('stroke-dasharray')")
  await page.pdf(path=str(b.OUT/'print-styles-232.pdf'),prefer_css_page_size=True)
  await page.emulate_media(media='screen');await page.evaluate('_stpZatvoriInterno()')
  assert await page.evaluate("privateLine.options.color==='#880088' && privateLine.options.dashArray==='8 2 2 2' && privateLine.options.opacity===.7 && vlake[0].poly.options.color==='#1122aa' && kolegeVlakeMap.B.poly.options.color==='#aacc33'")
  assert await page.locator('.stp-slope-polygon').count()==0
  assert await page.evaluate("[..._OVL.slope.getContainer().querySelectorAll('canvas')].every(c=>c.style.visibility!=='hidden')")
  assert await page.evaluate('vlake[0].poly.options.weight===4')
  await page.evaluate('stampaOtvori()');assert await page.evaluate("vlake[0].poly.options.color==='#1122aa' && privateLine.options.color==='#ff0000'")
  assert not errors,errors;await browser.close()
 print('OK: Leaflet + PDF; isti lager, privatna crvena puna, stvarni stilovi kolega/KML, uređivanje i vraćanje karte, 320px bez prelijevanja')
if __name__=='__main__':asyncio.run(main())
