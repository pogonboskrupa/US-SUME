"""Stvarni GPS tok, kontrolni prozor i IDB dnevnik; sintetički fiksevi bez mreže."""
import asyncio,importlib.util,mimetypes,os
from pathlib import Path
from playwright.async_api import async_playwright
spec=importlib.util.spec_from_file_location('doz',Path(__file__).with_name('doznaka-restore-227.py'));d=importlib.util.module_from_spec(spec);spec.loader.exec_module(d);b=d.b
modal=b.section('<!-- DOZ GPS CONTROLS -->','<!-- END DOZ GPS CONTROLS -->')
bar=b.section('<div id="rec-bar">','<div id="action-bar">')
helpers='\n'.join(b.function(n) for n in ['_pauziOtvoriProzor','_pauziZatvoriProzor','_pauziResetuj','_pauziZavrsi','_recBarStanje','_recBarUpdate','_recBarSync','_recBarGo','_recBarKraj','_recBarPauza'])
extra='''
let recOn=false,recPaused=false,_tragOn=false,_activeTab='doznaka',_recBarTimer=null,_dozPauseWin=[],_gpsStabWasOn=true;
let watches=0,clears=0,fixCallback=null,startPromise=null;
const _gpsStabilizeGate=f=>{startPromise=f()},_bgRecStart=()=>{},_bgRecStopIfIdle=()=>{},_crashCheck=async()=>{},stopGPS=()=>{};
Object.defineProperty(navigator,'geolocation',{value:{watchPosition(f){watches++;fixCallback=f;return watches},clearWatch(){clears++}}});
const _tragFmtLen=fmtL;
function switchTab(tab){_activeTab=tab;document.getElementById('doznaka-panel').style.display=tab==='doznaka'?'flex':'none';_recBarSync()}
_dozLiveRacunMozda=()=>{};
async function fix(lat,lng=16,accuracy=5){await fixCallback({timestamp:Date.now(),coords:{latitude:lat,longitude:lng,altitude:480,accuracy,speed:1}});await new Promise(r=>requestAnimationFrame(r))}
'''
html=d.fixture.replace(d.html+'</div>',d.html+modal+'<div id="rec-banner" class="show">Vlaka</div><div id="action-bar">Snimi vlaku</div></div>').replace('</body>',bar+'</body>').replace('<script>'+d.setup, '<script src="/static/js/field-store.js"></script><script>'+d.setup+'\n'+helpers+'\n'+extra)
async def main():
 b.OUT.mkdir(parents=True,exist_ok=True)
 async with async_playwright() as p:
  browser=await p.chromium.launch(executable_path=os.environ.get('UI_CHROMIUM') or None,args=['--no-sandbox']);page=await browser.new_page(viewport={'width':390,'height':800});errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  async def route(r):
   if r.request.url=='https://ui.test/':await r.fulfill(content_type='text/html',body=html)
   elif r.request.url.startswith('https://ui.test/'):
    f=b.ROOT/r.request.url.split('ui.test/',1)[1].split('?',1)[0]
    if f.is_file():await r.fulfill(content_type=mimetypes.guess_type(str(f))[0] or 'application/octet-stream',body=f.read_bytes())
    else:await r.fulfill(status=404,body='fixture')
   else:await r.abort()
  await page.route('**/*',route);await page.goto('https://ui.test/');assert not errors,errors
  await page.evaluate("dozSelectOdjel('D105')")
  await page.locator('#doz-gps-btn').click();await page.evaluate('startPromise')
  assert await page.locator('#doz-gps-modal').is_visible()
  assert await page.evaluate('_activeTab==="karta" && document.getElementById("main").contains(document.getElementById("doz-gps-modal"))')
  assert not await page.locator('#rec-banner').is_visible() and not await page.locator('#action-bar').is_visible() and not await page.locator('#rec-bar').is_visible()
  assert await page.locator('#doz-gps-modal-project').inner_text()=='Una · 105'
  assert await page.locator('#doz-gps-modal-user').inner_text()=='Emina Projektant'
  await page.evaluate('fix(44.9)');await page.evaluate('fix(44.9001)')
  assert await page.evaluate('FieldStore.count("A")')==2
  assert await page.locator('#doz-gps-modal-points').inner_text()=='2'
  # Pause does not create points or inflate active duration.
  await page.locator('#doz-gps-modal-pause').click();await page.evaluate('_dozGpsPauseStart-=65000;_dozGpsStartTs-=65000;_dozGpsControlsSync()')
  assert await page.locator('#doz-gps-modal-time').inner_text()=='00:00:00'
  await page.evaluate('fix(44.901)');assert await page.evaluate('FieldStore.count("A")')==2
  assert 'Nastavi' in await page.locator('#doz-gps-modal-pause').inner_text()
  await page.locator('#doz-gps-modal-pause').click();await page.evaluate('fix(44.9002)')
  assert await page.evaluate('FieldStore.count("A")')==3
  # Minimize/reopen never starts a second watch, and points continue offline.
  await page.get_by_role('button',name='Skloni kontrole',exact=True).click()
  assert not await page.locator('#doz-gps-modal').is_visible()
  assert await page.evaluate('_dozGpsOn && _activeTab==="karta" && watches===1 && clears===0 && _dozGpsControlsTimer===null')
  await page.evaluate('fix(44.9003)');await page.locator('#rb-go').click();assert await page.locator('#doz-gps-modal').is_visible()
  assert await page.locator('#doz-gps-modal-points').inner_text()=='4'
  await page.evaluate('fix(44.901,16,45)');assert await page.evaluate('FieldStore.count("A")')==4
  assert 'Slab signal' in await page.locator('#doz-gps-modal-signal').inner_text()
  # Map remains usable above the floating controls; Escape only minimizes.
  assert await page.locator('.doz-gps-sheet').get_attribute('aria-modal') is None
  assert await page.evaluate('document.elementFromPoint(190,90).closest("#map")!==null')
  await page.locator('.doz-gps-map').focus()
  await page.keyboard.press('Escape');assert await page.evaluate('_dozGpsOn && !clears')
  await page.locator('#rb-go').click()
  for theme in ['day','dark']:
   for w,h in [(320,568),(390,800),(568,320),(800,600)]:
    await page.set_viewport_size({'width':w,'height':h});await page.evaluate('(t)=>document.documentElement.dataset.fieldTheme=t',theme)
    overflow=await page.evaluate('()=>{const e=document.querySelector(".doz-gps-sheet"),r=e.getBoundingClientRect();return {x:r.x,right:r.right,bottom:r.bottom,width:e.clientWidth,scroll:e.scrollWidth}}')
    assert overflow['x']>=0 and overflow['right']<=w and overflow['bottom']<=h and overflow['scroll']<=overflow['width']+1,(theme,w,h,overflow)
    for id in ['doz-gps-modal-pause','doz-gps-modal-stop']:
     assert (await page.locator('#'+id).bounding_box())['height']>=44
    await page.screenshot(path=str(b.OUT/f'doz-gps-{theme}-{w}-{h}.png'))
  # Failed durable finish retains active recording and allows retry.
  await page.evaluate('()=>{window.realFinish=FieldStore.finish;FieldStore.finish=async()=>{throw new Error("quota fixture")}}')
  await page.locator('#doz-gps-modal-stop').click();await page.wait_for_timeout(80)
  assert await page.evaluate('_dozGpsOn && !_dozGpsControlsBusy && !_dozGpsStopping && clears===0')
  assert await page.locator('#doz-gps-modal').is_visible();assert await page.locator('#doz-gps-modal-stop').is_enabled()
  # Finish while paused keeps all committed points/export, disables duplicate clicks.
  await page.locator('#doz-gps-modal-pause').click()
  await page.evaluate('()=>{FieldStore.finish=async(...args)=>{await new Promise(r=>window.releaseFinish=r);return realFinish(...args)}}')
  await page.locator('#doz-gps-modal-stop').click();await page.wait_for_function('!!window.releaseFinish')
  assert await page.locator('#doz-gps-modal-stop').is_disabled();assert await page.locator('#doz-gps-modal-pause').is_disabled()
  assert await page.evaluate('_dozGpsOn');await page.evaluate('releaseFinish()');await page.wait_for_function('!_dozGpsOn')
  assert not await page.locator('#doz-gps-modal').is_visible()
  assert await page.evaluate('clears===1 && _dozGpsFullPts.length===4 && _dozPauseWin.every(p=>p.end!==null) && _dozGpsControlsTimer===null')
  assert await page.evaluate('(async()=>!(await FieldStore.live("A")))()')
  saved=await page.evaluate('(async()=>{const x=await FieldStore.exportOwner("A","D105");return {points:x.points.length,pending:x.pending.length,active:x.sessions.some(s=>s.active)}})()')
  assert saved=={'points':4,'pending':4,'active':False},saved
  # New band resets the paused status; common recording bar still stops rather than reopening.
  await page.evaluate('dozToggleGPS();startPromise');assert await page.locator('#doz-gps-modal').is_visible()
  assert await page.locator('#doz-gps-status').inner_text()=='● Snimanje aktivno'
  await page.evaluate('fix(44.9004)');await page.evaluate('fix(44.9005)')
  await page.evaluate('()=>{FieldStore.finish=realFinish;dozCloseGPSControls()}');await page.locator('#rb-kraj').click();await page.wait_for_function('!_dozGpsOn')
  assert await page.evaluate('watches===2 && clears===2 && FieldStore.count("A")===6')
  await page.reload();assert await page.evaluate('(async()=>{await FieldStore.init();return FieldStore.count("A")})()')==6
  assert not errors,errors
  await browser.close();print('Doznaka GPS: start/pause/resume/minimize/reopen/finish failure/retry/IDB reload, 8 rasporeda — OK')
if __name__=='__main__':asyncio.run(main())
