"""Explorer v4.6.9: kamera klizi između GPS fiksova (CSS tranzicija), ne skače."""
import asyncio,importlib.util,mimetypes,os,re
from pathlib import Path
from playwright.async_api import async_playwright
ROOT=Path(__file__).resolve().parents[2]
spec=importlib.util.spec_from_file_location('e239',Path(__file__).with_name('explorer-239.py'));e239=importlib.util.module_from_spec(spec);spec.loader.exec_module(e239)
ex,html=e239.ex,e239.html
async def main():
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
  await page.evaluate('vodiMeDoTacke(0)');await page.wait_for_function('!!document.querySelector(".ex-world")',timeout=2000)
  info='(()=>{const w=document.querySelector(".ex-world");return {glide:w.classList.contains("ex-glide"),dur:parseFloat(w.style.getPropertyValue("--ex-dur")),tw:getComputedStyle(w).transitionDuration,tp:getComputedStyle(w.querySelector(".leaflet-map-pane")).transitionDuration,rot:parseFloat(/rotate\\((-?[0-9.]+)deg\\)\\s*$/.exec(w.style.transform)[1])}})()'
  await page.evaluate('lastP={la:44.9,lo:16,ac:6,al:510};tick(35)');await page.wait_for_timeout(400)
  a=await page.evaluate(info);assert not a['glide'],a  # prvo postavljanje kamere je trenutno
  await page.wait_for_timeout(900)
  await page.evaluate('lastP={...lastP,la:44.9001,ts:Date.now()};tick(35)');await page.wait_for_timeout(350)
  b=await page.evaluate(info);assert b['glide'] and 300<=b['dur']<=1500,b  # ~11 m pomaka klizi cijeli interval
  assert b['tw']!='0s' and b['tp']!='0s',b  # tranzicija stvarno stoji i na omotaču i na Leaflet panelu
  # Okret 350° -> 10° ne smije zavrtjeti kartu unazad (kratak put preko 0°)
  await page.wait_for_timeout(500);await page.evaluate('tick(350)');await page.wait_for_timeout(350);r1=(await page.evaluate(info))['rot']
  await page.evaluate('tick(10)');await page.wait_for_timeout(350);r2=(await page.evaluate(info))['rot']
  assert abs(r2-r1)<40,(r1,r2)
  # Veliki skok (>80 m): trenutno, bez klizanja preko cijele karte
  await page.wait_for_timeout(500);await page.evaluate('lastP={...lastP,la:44.95,ts:Date.now()};tick(35)');await page.wait_for_timeout(350)
  c=await page.evaluate(info);assert not c['glide'],c
  assert not errors,errors
  await browser.close();print('Explorer glide: prvo postavljanje trenutno, pomak klizi, okret bez 360° skoka, veliki skok trenutan — OK')
if __name__=='__main__':asyncio.run(main())
