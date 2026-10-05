"""Kompletan proizvodni JS/DOM/CSS, kontrolisan GPS i mreža; bez produkcije."""
import asyncio,os,mimetypes
from pathlib import Path
from playwright.async_api import async_playwright
ROOT=Path(__file__).resolve().parents[2]
async def main():
 async with async_playwright() as p:
  browser=await p.chromium.launch(executable_path=os.environ.get('UI_CHROMIUM') or None,args=['--no-sandbox'])
  context=await browser.new_context(offline=True,service_workers='block',viewport={'width':390,'height':800});page=await context.new_page();errors=[]
  page.on('pageerror',lambda e:errors.append(str(e)))
  page.on('crash',lambda _:print('ExplorerCI: PAGE CRASH',flush=True))
  page.on('framenavigated',lambda f:print('ExplorerCI: navigacija '+f.url,flush=True))
  page.on('console',lambda m:print(m.text,flush=True) if m.text.startswith('ExplorerCI') else None)
  async def route(r):
   u=r.request.url
   if not u.startswith('http://full.test/'):await r.abort();return
   name=u.split('full.test/',1)[1].split('?',1)[0] or 'index.html';path=ROOT/name
   if name=='GRANICE.kml':await r.fulfill(content_type='application/xml',body='<kml xmlns="http://www.opengis.net/kml/2.2"><Document/></kml>')
   elif path.is_file():await r.fulfill(content_type=mimetypes.guess_type(path)[0] or 'application/octet-stream',body=path.read_bytes())
   else:await r.fulfill(status=404,body='fixture')
  await page.route('**/*',route);await page.goto('http://full.test/');await page.wait_for_function('document.readyState==="complete"&&!!window.Explorer',timeout=20000)
  assert not errors,errors
  await page.evaluate("window.workBefore=JSON.stringify([vlake,_tacke,_tragRegistry]);_revealApp();switchTab('karta');gpsOn=true;lastP=null;_onPLastFixTs=0;Explorer.start({la:44.904,lo:16.001,name:'CI cilj'});Explorer.setExplorerEnabled(true)")
  await page.wait_for_function('!!document.querySelector(".ex-world")')
  assert 'matrix3d' in await page.locator('.ex-world').evaluate('(e)=>getComputedStyle(e).transform')
  print('ExplorerCI: prije stvarnog onP',flush=True)
  await page.evaluate('window.gpsTrace=[];for(const name of ["_updLocBtn","_addTragPoint","_updMcdDist","_updRecSignal","_precizCollect","_nvZaPoziciju","_updCompassOnMarker","_drawRadiusRings","_updRecPreview","_vlakaProcessGpsPoint"]){const original=window[name];if(typeof original!=="function")continue;window[name]=function(...args){console.log("ExplorerCI: "+name+" start");const result=original.apply(this,args);console.log("ExplorerCI: "+name+" kraj");return result;};}')
  await page.evaluate('_compassHeading=35;_compassLastUpdT=Date.now();onP({timestamp:Date.now(),coords:{latitude:44.9,longitude:16,altitude:510,accuracy:6,speed:0,heading:null}});window.probe=L.marker([44.9,16],{icon:L.divIcon({className:"full-probe",iconSize:[2,2],iconAnchor:[1,1]}),interactive:false}).addTo(map);console.log("ExplorerCI: stvarni onP i marker završeni");void 0')
  await page.wait_for_function('!document.getElementById("explorer-you").hidden')
  await page.wait_for_timeout(400)
  assert await page.evaluate('(()=>{const p=Explorer.screenPoint([44.9,16]),r=map.getContainer().getBoundingClientRect(),b=document.querySelector(".full-probe").getBoundingClientRect();return Math.abs(b.left+b.width/2-r.left-p.x)<3&&Math.abs(b.top+b.height/2-r.top-p.y)<3})()')
  out=ROOT/'outputs/ui-preview';out.mkdir(parents=True,exist_ok=True);await page.screenshot(path=str(out/'explorer-239-kompletan-js.png'))
  await page.evaluate('Explorer.stop();gpsOn=false;map.removeLayer(probe)');assert await page.evaluate('JSON.stringify([vlake,_tacke,_tragRegistry])===workBefore')
  assert not errors,errors
  await browser.close();print('Explorer: kompletan proizvodni bootstrap + stvarni onP/GPS adapter/Leaflet/3D, offline — OK')
if __name__=='__main__':asyncio.run(main())
