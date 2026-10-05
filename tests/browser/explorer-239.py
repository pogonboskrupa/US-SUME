"""Explorer uz cijeli stvarni DOM/CSS aplikacije i stvarni GPS/kompas adapter.
GPS/auth su kontrolisani; nema poziva produkciji. Regresija skrivenog dlg-sheet.
"""
import asyncio,importlib.util,os,re,mimetypes
from pathlib import Path
from playwright.async_api import async_playwright
ROOT=Path(__file__).resolve().parents[2]
spec=importlib.util.spec_from_file_location('ex',Path(__file__).with_name('explorer-236.py'));ex=importlib.util.module_from_spec(spec);spec.loader.exec_module(ex)
source=ex.b.SOURCE
html=re.sub(r'<script\b[^>]*>.*?</script>','',source,flags=re.S)
# Cijelo tijelo/stylesheet aplikacije; mijenjamo samo vanjske ulaze i init auth.
html=html.replace('</head>','<script src="/static/libs/leaflet.min.js"></script><script src="/static/js/explorer-navigation.js"></script></head>')
adapter=re.search(r'window\.Explorer = ExplorerNavigation\.create\(\{.*?\n\}\);',source,re.S)[0]
js=ex.js.replace("L.DomEvent.disableClickPropagation(document.getElementById('record-control'));",'')
js=re.sub(r'window\.Explorer=ExplorerNavigation\.create\(\{.*?\}\);',lambda m:adapter,js,count=1,flags=re.S)
js=js.replace("switchTab=t=>{_activeTab=t;window.Explorer?.setVisible(t==='karta')},",'')
js=js.replace('_updFabVisibility=()=>{}',"_updFabVisibility=()=>{const a=document.getElementById('action-bar');a.style.display='flex';document.body.classList.add('ab-on');document.documentElement.style.setProperty('--ab-h',a.offsetHeight+'px')}")
js+='\n'+ex.b.function('switchTab')
js='let _onPLastFixTs=0,_mapFullScreen=false;const msrStop=()=>{},_setMapUIVisible=()=>{};\n'+js+'''
const fixtureTick=tick;
tick=function(h,age=0,accuracy=6){_onPLastFixTs=Date.now()-age;fixtureTick(h,age,accuracy)};
document.getElementById('auth-screen').style.display='none';
document.getElementById('wrapper').style.display='flex';
switchTab('karta');
lastP=null;_compassLastUpdT=0;
'''
html=html.replace('</body>','<script>'+js+'</script></body>')

async def main():
 out=ROOT/'outputs/ui-preview';out.mkdir(parents=True,exist_ok=True)
 async with async_playwright() as p:
  browser=await p.chromium.launch(executable_path=os.environ.get('UI_CHROMIUM') or None,args=['--no-sandbox']);context=await browser.new_context(offline=True,viewport={'width':390,'height':800});page=await context.new_page();errors=[]
  page.on('pageerror',lambda e:errors.append(str(e)))
  async def route(r):
   u=r.request.url
   if u=='http://fixture.test/':await r.fulfill(status=200,content_type='text/html',body=html)
   elif '/tile/' in u:await r.fulfill(status=200,content_type='image/svg+xml',body=ex.tile)
   elif u.startswith('http://fixture.test/'):
    path=ROOT/u.split('fixture.test/',1)[1].split('?',1)[0]
    if path.is_file():await r.fulfill(status=200,content_type=mimetypes.guess_type(path)[0] or 'application/octet-stream',body=path.read_bytes())
    else:await r.fulfill(status=404,body='fixture')
   else:await r.abort()
  await page.route('**/*',route);await page.goto('http://fixture.test/');await page.wait_for_function('!!window.Explorer')
  assert await page.locator('[role="dialog"]').count()>=12
  # Stari getClientRects uslov pogrešno bi blokirao ovu zatvorenu potvrdu.
  assert await page.evaluate('(()=>{const e=document.getElementById("dlg-sheet");return e.getClientRects().length>0&&getComputedStyle(e).visibility!=="hidden"&&e.getBoundingClientRect().top>=innerHeight-1})()')
  await page.evaluate('vodiMeDoTacke(0)');await page.wait_for_function('!!document.querySelector(".ex-world")',timeout=2000)
  assert await page.locator('#tacka-nav-panel').is_visible()
  assert 'ČEKAM GPS' in await page.locator('#ex-mode').inner_text()
  assert await page.locator('#tnp-air').inner_text()=='—';assert not await page.locator('#explorer-you').is_visible()
  assert 'rotateX(48deg)' in await page.locator('.ex-world').get_attribute('style')
  await page.screenshot(path=str(out/'explorer-239-cijela-app-ceka-gps.png'))
  for w,h in [(390,800),(320,568),(568,320),(800,600)]:
   await page.set_viewport_size({'width':w,'height':h});await page.evaluate('lastP={la:44.9,lo:16,ac:6,al:510};tick(35)');await page.wait_for_timeout(350)
   assert await page.locator('#tacka-nav-panel').is_visible()
   rect=await page.locator('#tacka-nav-panel').bounding_box();assert rect['x']>=0 and rect['x']+rect['width']<=w+1 and rect['y']>=0 and rect['y']+rect['height']<=h+1,rect
   assert await page.locator('#ex-follow').is_checked()
   assert await page.evaluate('!!document.querySelector(".ex-world")&&!map.dragging.enabled()')
   point=await page.evaluate('(()=>{const p=Explorer.screenPoint([lastP.la,lastP.lo]),r=map.getContainer().getBoundingClientRect();return {x:p.x+r.left,y:p.y+r.top}})()')
   probe=await page.locator('.perspective-probe').bounding_box();assert abs(probe['x']+probe['width']/2-point['x'])<3 and abs(probe['y']+probe['height']/2-point['y'])<3,(probe,point)
   await page.screenshot(path=str(out/f'explorer-239-cijela-app-{w}x{h}.png'))
  await page.set_viewport_size({'width':390,'height':800});await page.evaluate('tick(35)');target=await page.evaluate('Explorer.destination')
  # Stvarni animirani dialog zatvara kameru, pa je vraća PO završetku tranzicije.
  await page.evaluate('document.getElementById("dlg-sheet").classList.add("show");document.getElementById("dlg-overlay").classList.add("show")');await page.wait_for_timeout(350)
  assert not await page.locator('#tacka-nav-panel').is_visible();assert not await page.evaluate('!!document.querySelector(".ex-world")')
  await page.evaluate('document.getElementById("dlg-sheet").classList.remove("show");document.getElementById("dlg-overlay").classList.remove("show")')
  await page.wait_for_function('!!document.querySelector(".ex-world")',timeout=2000)
  assert await page.evaluate('Explorer.destination')==target
  # Naknadno kreiran modal (npr. ažuriranje) mora jednako suspendovati prikaz.
  await page.evaluate('window.dynamicDialog=document.createElement("div");dynamicDialog.setAttribute("role","dialog");dynamicDialog.style="position:fixed;inset:0;z-index:1000000;background:white";document.body.appendChild(dynamicDialog)')
  await page.wait_for_function('!document.querySelector(".ex-world")');assert not await page.locator('#tacka-nav-panel').is_visible()
  await page.evaluate('dynamicDialog.remove()');await page.wait_for_function('!!document.querySelector(".ex-world")')
  # Izgubljen GPS ne vraća neprimjetno standardnu kartu i ne lažira dolazak.
  await page.evaluate('tick(35,30000)');assert await page.locator('#tnp-air').inner_text()=='—';assert not await page.locator('#explorer-you').is_visible();assert await page.evaluate('!!document.querySelector(".ex-world")')
  await page.locator('#ex-follow').uncheck();assert not await page.evaluate('!!document.querySelector(".ex-world")');assert await page.evaluate('map.dragging.enabled()&&Explorer.active')
  await page.locator('#ex-follow').check();await page.wait_for_function('!!document.querySelector(".ex-world")')
  await page.evaluate('stopTackaNav()');assert not await page.evaluate('Explorer.active');assert await page.evaluate('map.dragging.enabled()')
  assert not errors,errors
  await browser.close();print('Explorer: cijeli DOM/CSS app + stvarni adapter, zatvoreni/animirani/novi dialog, GPS čekanje/gubitak, 4 prikaza — OK')
if __name__=='__main__':asyncio.run(main())
