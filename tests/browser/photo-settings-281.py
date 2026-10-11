"""Stvarni foto markeri: individualno/grupno sakrivanje, zoom, server refresh i restart."""
import asyncio,ast,mimetypes,os,json
from pathlib import Path
from playwright.async_api import async_playwright
ROOT=Path(__file__).resolve().parents[2];OUT=ROOT/'outputs/281';OUT.mkdir(parents=True,exist_ok=True)
source=ast.parse(Path(__file__).with_name('day-all-panels-275.py').read_text());AUDIT=next(ast.literal_eval(n.value) for n in source.body if isinstance(n,ast.Assign) and any(isinstance(t,ast.Name) and t.id=='AUDIT' for t in n.targets))
SETUP="""()=>{sbUser={id:'11111111-1111-4111-8111-111111111111'};sbProfile={id:sbUser.id,odobren:true,sumarija:'TEST'};_revealApp();sbInitData=async()=>{};window.photoRow={id:'shared-1',korisnik_id:'colleague',la:44.902,lo:16.002,ts:777,thumb:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aE4sAAAAASUVORK5CYII=',full_img:null};sb={from:()=>{const q={select:()=>q,eq:()=>q,neq:()=>q,filter:async()=>({data:[photoRow],error:null})};return q;},auth:{signOut:async()=>({error:null})}};map.setView([44.902,16.002],16,{animate:false});_updMapScale();}"""
async def main():
 async with async_playwright() as p:
  browser=await p.chromium.launch(executable_path=os.environ.get('UI_CHROMIUM') or None);ctx=await browser.new_context(service_workers='block',viewport={'width':390,'height':800});errors=[];writes=[]
  async def route(r):
   url=r.request.url
   if not url.startswith('https://device.test/'):
    if r.request.method not in ['GET','HEAD']:writes.append(url)
    await r.abort();return
   name=url.split('device.test/',1)[1].split('?',1)[0] or 'index.html';f=ROOT/name
   if name=='GRANICE.kml':await r.fulfill(content_type='application/xml',body='<kml><Document/></kml>')
   elif f.is_file():await r.fulfill(content_type=mimetypes.guess_type(str(f))[0] or 'application/octet-stream',body=f.read_bytes())
   else:await r.fulfill(status=404,body='fixture')
  await ctx.route('**/*',route);await ctx.route_web_socket('**/*',lambda ws:ws.close())
  await ctx.add_init_script("""Object.defineProperty(navigator,'onLine',{get:()=>false,configurable:true});navigator.geolocation.watchPosition=()=>1;navigator.geolocation.clearWatch=()=>{};const id='11111111-1111-4111-8111-111111111111';localStorage.setItem('tvlake_ol_profile',JSON.stringify({ts:Date.now(),data:{id,odobren:true,sumarija:'TEST',ime:'Adnan',prezime:'Mahmic'}}));localStorage.setItem('tvlake_device_last_user',id);
   // _done označava početak obnove; fotografije se stvarno obnavljaju iza painta.
   // Posmatraj stvarni poziv, bez preskakanja obnove ili proizvoljnog sleepa.
   window.testFotoRestoreDone=false;document.addEventListener('DOMContentLoaded',()=>{const original=_restoreFotos;window._restoreFotos=function(...args){const r=original.apply(this,args);window.testFotoRestoreDone=true;return r;};});""")
  page=await ctx.new_page();page.on('pageerror',lambda e:errors.append(str(e)));await page.goto('https://device.test/');await page.wait_for_function('testFotoRestoreDone&&typeof _tvPhotoSet==="function"');await page.evaluate(SETUP)
  await page.evaluate("async()=>{for(let i=0;i<2;i++){const f={la:44.902,lo:16.001+i*.002,ts:100+i,thumb:photoRow.thumb,full:photoRow.thumb};f.marker=_buildFotoMarker(f.la,f.lo,f.thumb,f.full,i,f.ts,true);_locFotos.push(f)}_saveFotos();await sbLoadSharedFotos();}")
  assert await page.evaluate('_locFotos.length===2&&_sharedFotos.length===1&&[..._locFotos,..._sharedFotos].every(f=>map.hasLayer(f.marker))')
  await page.evaluate("openOznakePanel();_libraryFilter('photos')");await page.locator('.ml-card').first.get_by_role('button',name='Sakrij',exact=True).click()
  hidden=await page.evaluate('_locFotos.map(f=>!_tvPhotoVisible(f,false))');assert hidden.count(True)==1
  await page.evaluate('_tvPhotoSet(_sharedFotos[0],true,false);closeOznakePanel()')
  async def zoom(z):await page.evaluate('(z)=>{map.setZoom(z,{animate:false});_updMapScale()}',z)
  await zoom(8);assert await page.evaluate('[..._locFotos,..._sharedFotos].every(f=>!map.hasLayer(f.marker))')
  await zoom(16);assert await page.evaluate('_locFotos.map(f=>!map.hasLayer(f.marker))')==hidden;assert await page.evaluate('!map.hasLayer(_sharedFotos[0].marker)')
  await page.evaluate('sbLoadSharedFotos()');assert await page.evaluate('_sharedFotos.length===1&&!map.hasLayer(_sharedFotos[0].marker)')
  # Grupa se pamti; eksplicitno prikazivanje jedne slike ne vraća druge.
  await page.evaluate("_tvVisibilitySet('photos',false);_tvPhotoSet(_locFotos[0],false,true)");await zoom(8);await zoom(16)
  assert await page.evaluate('map.hasLayer(_locFotos[0].marker)&&!map.hasLayer(_locFotos[1].marker)&&!map.hasLayer(_sharedFotos[0].marker)')
  await page.reload();await page.wait_for_function('testFotoRestoreDone&&typeof _tvPhotoSet==="function"');await page.evaluate(SETUP);await page.evaluate('sbLoadSharedFotos()');await zoom(8);await zoom(16)
  assert await page.evaluate('_locFotos.length===2&&map.hasLayer(_locFotos[0].marker)&&!map.hasLayer(_locFotos[1].marker)&&!map.hasLayer(_sharedFotos[0].marker)')
  await page.evaluate("_tvVisibilitySet('all',false)");await page.reload();await page.wait_for_function('testFotoRestoreDone&&typeof _tvPhotoSet==="function"');await page.evaluate(SETUP);await page.evaluate('sbLoadSharedFotos()');await zoom(8);await zoom(16)
  assert await page.evaluate("['photos','tracks','points','measurements','labels'].every(k=>!_tvCategoryOn(k))&&[..._locFotos,..._sharedFotos].every(f=>!map.hasLayer(f.marker))")
  # Nova primljena slika pri velikoj razmjeri ostaje izvan prikaza i uz uključen foto sloj.
  await page.evaluate("_tvVisibilitySet('photos',true)");await zoom(8);await page.evaluate('sbLoadSharedFotos()');assert await page.evaluate('[..._locFotos,..._sharedFotos].every(f=>!map.hasLayer(f.marker))');await zoom(16);assert await page.evaluate('[..._locFotos,..._sharedFotos].every(f=>map.hasLayer(f.marker))')
  for theme in ['day','dark']:
   for w,h in [(320,568),(390,800),(800,480)]:
    await page.set_viewport_size({'width':w,'height':h});await page.evaluate('(t)=>{document.documentElement.dataset.fieldTheme=t;document.querySelector(".mdrop-scroll").scrollTop=0}',theme);await page.locator('#menu-btn').click()
    first=await page.locator('#menu-dropdown .mdrop-scroll button:visible').first.get_attribute('id');assert first=='mdrop-server',first
    assert await page.locator('#mdrop-server').evaluate('(e)=>getComputedStyle(e).backgroundColor!==getComputedStyle(document.querySelector("#menu-installed-maps")).backgroundColor')
    if theme=='day':assert not await page.evaluate(AUDIT,'#menu-dropdown'),await page.evaluate(AUDIT,'#menu-dropdown')
    assert await page.locator('.mdrop-scroll').evaluate('(e)=>e.scrollWidth<=e.clientWidth+1');await page.screenshot(path=str(OUT/f'menu-server-{theme}-{w}.png'));await page.evaluate('closeMenuDropdown()')
  # Stvarni klik zadržava postojeće otvaranje sekcije, bez automatskog slanja.
  await page.locator('#menu-btn').click();await page.locator('#mdrop-server').click();assert await page.locator('#syncq-panel').is_visible();assert not await page.locator('#menu-dropdown').is_visible()
  assert not errors,errors;assert not writes,writes
  (OUT/'photo-settings.json').write_text(json.dumps({'passed':True,'own':2,'shared':1,'zoom_cycles':5,'restarts':2,'errors':errors,'external_writes':writes},indent=2));await ctx.close();await browser.close()
 print('PASS: pojedinačno/grupno Sakrij, zoom, primljene fotografije, restart/pamćenje svih grupa, Server prvi/različita boja, 6 prikaza i klik')
if __name__=='__main__':asyncio.run(main())
