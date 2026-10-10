"""Stvarna štampa/DEM Worker: gust nagib, dodiri tokom obrade i bez ponovne obrade praznih maski."""
import asyncio,importlib.util,mimetypes,os
from pathlib import Path
from playwright.async_api import async_playwright
spec=importlib.util.spec_from_file_location('print_base',Path(__file__).with_name('print-styles-232.py'));b=importlib.util.module_from_spec(spec);spec.loader.exec_module(b)
fixture=b.fixture.replace('createTile(){','createTile(coords){').replace("ctx.fillRect(40,40,140,120);ctx.clearRect(90,90,30,30);", "if((coords.x+coords.y)%2===0)for(let y=0;y<256;y+=4)for(let x=0;x<256;x+=4)if((x/4+y/4)%2===0)ctx.fillRect(x,y,4,4);")
fixture=fixture.replace('<script src="/static/js/print-slope.js">','''<script>window.printTicks=0;window.maskJobs=0;setInterval(()=>printTicks++,16);const RealWorker=Worker;window.Worker=class extends RealWorker{postMessage(data,transfer){window.maskJobs++;super.postMessage(data,transfer)}};</script><script src="/static/js/print-slope.js">''')
async def main():
 async with async_playwright() as p:
  browser=await p.chromium.launch(executable_path=os.environ.get('UI_CHROMIUM') or None)
  page=await browser.new_page(viewport={'width':390,'height':800});errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  async def route(r):
   if r.request.url=='https://ui.test/':await r.fulfill(content_type='text/html',body=fixture)
   elif r.request.url.startswith('https://ui.test/'):
    f=b.b.ROOT/r.request.url.split('ui.test/',1)[1].split('?',1)[0]
    if f.is_file():await r.fulfill(content_type=mimetypes.guess_type(str(f))[0] or 'application/octet-stream',body=f.read_bytes())
    else:await r.fulfill(status=404,body='fixture')
   else:await r.abort()
  await page.route('**/*',route)
  cdp=await page.context.new_cdp_session(page);await cdp.send('Emulation.setCPUThrottlingRate',{'rate':4})
  await page.goto('https://ui.test/',wait_until='domcontentloaded')
  # Opcije ostaju dostupne dok posao još traje.
  await page.locator('#stampa-kontrole button',has_text='Gotovo').click(timeout=3000)
  ticks=await page.evaluate('async()=>{await PrintSlope.ready();return {ticks:printTicks,jobs:maskJobs,polygons:document.querySelectorAll(".stp-slope-polygon").length}}')
  assert ticks['ticks']>=3 and ticks['jobs']>=4 and ticks['polygons']>=1,ticks
  jobs=ticks['jobs'];await page.evaluate('async()=>{for(let i=0;i<10;i++)PrintSlope.refresh();await PrintSlope.ready()}')
  assert await page.evaluate('maskJobs')==jobs,'Empty/nonempty masks retraced on UI changes'
  await page.evaluate('_stpZatvoriInterno()');assert await page.locator('.stp-slope-polygon').count()==0
  assert await page.evaluate('[..._OVL.slope.getContainer().querySelectorAll("canvas")].every(c=>c.style.visibility!=="hidden")')
  # Zatvaranje dok traje novi posao ne ostavlja kasno dodane poligone.
  await page.evaluate('()=>{stampaOtvori();_stpZatvoriInterno()}');await page.wait_for_timeout(250)
  assert await page.locator('.stp-slope-polygon').count()==0
  assert not errors,errors;await browser.close()
 print('PASS CPU4 print worker, interactive controls during dense DEM conversion, empty-mask cache, cancellation/restore',ticks)
if __name__=='__main__':asyncio.run(main())
