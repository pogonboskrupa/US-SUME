"""Puni proizvodni Teren, ŠPD/admin/projektant uloge i lokalni alati; lažni server."""
import asyncio,json,mimetypes,os
from pathlib import Path
from playwright.async_api import async_playwright
ROOT=Path(__file__).resolve().parents[2]
async def main():
 async with async_playwright() as p:
  browser=await p.chromium.launch(executable_path=os.environ.get('UI_CHROMIUM') or None)
  ctx=await browser.new_context(service_workers='block',viewport={'width':390,'height':800})
  errors=[];writes=[]
  async def route(r):
   if not r.request.url.startswith('http://field.test/'):
    if r.request.method in ['POST','PUT','PATCH','DELETE']:writes.append(r.request.url)
    await r.abort();return
   name=r.request.url.split('field.test/',1)[1].split('?',1)[0] or 'index.html';f=ROOT/name
   if name=='GRANICE.kml':await r.fulfill(content_type='application/xml',body='<kml xmlns="http://www.opengis.net/kml/2.2"><Document/></kml>')
   elif f.is_file():await r.fulfill(content_type=mimetypes.guess_type(str(f))[0] or 'application/octet-stream',body=f.read_bytes())
   else:await r.fulfill(status=404,body='fixture')
  await ctx.route('**/*',route);await ctx.route_web_socket('**/*',lambda ws:ws.close())
  await ctx.add_init_script("Object.defineProperty(navigator,'onLine',{get:()=>false});navigator.geolocation.watchPosition=()=>1;navigator.geolocation.clearWatch=()=>{};")
  page=await ctx.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
  await page.goto('http://field.test/');await page.wait_for_function("document.readyState==='complete'&&!!window.TerenWorkspace")
  await page.evaluate("""async()=>{
   sbUser={id:'11111111-1111-4111-8111-111111111111'};
   window.roleProfile={id:sbUser.id,ime:'Amir',prezime:'Nadzor',sumarija:'ŠPD US ŠUME',is_admin:false,odobren:true,je_vodeci:false};
   sb={from:()=>({select:()=>({eq:()=>({single:async()=>({data:roleProfile,error:null})})})})};
   await sbLoadProfile();_revealApp();gpsOn=true;lastP={la:44.9,lo:16,ac:6,al:450};_lastGpsFixTime=Date.now();_tacke=Array.from({length:62},(_,i)=>({la:44.9+i*.0001,lo:16,nm:'Tačka '+i,ts:Date.now()}));switchTab('teren');
  }""")
  assert await page.locator('#teren-tab-btn').is_visible()
  assert await page.locator('#postavke-tab-btn').count()==0
  await page.locator('#trn-more').click();assert await page.locator('#trn-tacke-list .trn-row').count()==40
  await page.fill('#trn-search','Tačka 42');assert await page.locator('#trn-tacke-list .trn-row').count()==1
  assert await page.locator('#trn-tacke-list .trn-row').evaluate("e=>e.querySelector('.trn-row-main').getAttribute('onclick')")=='terenZoomTacka(42)'
  await page.fill('#trn-search','');await page.locator('#trn-records button').filter(has_text='+ Zapažanje').click()
  await page.fill('#dlg-input','Provjera obilaska');await page.locator('#dlg-ok').click()
  await page.wait_for_function("_tacke.some(t=>t.nm==='Provjera obilaska')")
  await page.evaluate("_lastGpsFixTime=Date.now()-60000;TerenWorkspace.render(false)")
  assert await page.locator('#trn-ready-gps').get_attribute('data-state')=='waiting'
  await page.wait_for_timeout(2800) # Sačekaj da se poruka potvrde završi prije slika.
  out=ROOT/'outputs/ui-preview';out.mkdir(parents=True,exist_ok=True)
  for role in ['spd','admin']:
   await page.evaluate("async r=>{roleProfile={...roleProfile,is_admin:r==='admin'};await sbLoadProfile();switchTab('teren');}",role)
   assert await page.locator('#teren-tab-btn').is_visible()
   for theme in ['dark','day']:
    await page.evaluate('t=>document.documentElement.dataset.fieldTheme=t',theme)
    if theme=='day':
     for accuracy in [6,18,40]:
      await page.evaluate('a=>{lastP.ac=a;_trnPozicijaRender();}',accuracy)
      contrast=await page.locator('#trn-acc').evaluate(r'''e=>{const rgb=s=>s.match(/[\d.]+/g).slice(0,3).map(Number),lum=s=>rgb(s).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4}).reduce((n,v,i)=>n+v*[.2126,.7152,.0722][i],0);let a=lum(getComputedStyle(e).color),b=lum(getComputedStyle(e.closest('.trn-tile')).backgroundColor);return (Math.max(a,b)+.05)/(Math.min(a,b)+.05);}''')
      assert contrast>=4.5,(accuracy,contrast)
     await page.evaluate('lastP.ac=6;_trnPozicijaRender()')
    for width,height in [(320,800),(390,800),(800,650)]:
     await page.set_viewport_size({'width':width,'height':height})
     await page.locator('#teren-panel').evaluate('e=>e.scrollTop=0')
     assert await page.locator('#teren-panel').evaluate('e=>e.scrollWidth<=e.clientWidth+1'),(role,theme,width)
     assert await page.locator('#teren-panel button').evaluate_all("es=>es.filter(e=>e.getClientRects().length).every(e=>e.getBoundingClientRect().height>=43.5)")
     await page.screenshot(path=str(out/f'teren-{role}-{theme}-{width}.png'))
   await page.set_viewport_size({'width':390,'height':800})
   await page.locator('#trn-records').scroll_into_view_if_needed();await page.screenshot(path=str(out/f'teren-{role}-zapisi.png'))
  await page.get_by_role('button',name='Izmjeri površinu',exact=True).click()
  assert await page.evaluate("_msrMode==='area'&&_msrOn")
  await page.evaluate("async()=>{msrStop(true);roleProfile={...roleProfile,is_admin:false,sumarija:'ŠUMARIJA BOS.KRUPA'};await sbLoadProfile();}")
  assert not await page.locator('#teren-tab-btn').is_visible()
  assert await page.locator('#vlake-tab-btn').is_visible()
  assert not errors,errors
  assert not writes,writes
  print(json.dumps({'roles':['spd','admin','projektant'],'search':True,'pagination':True,'namedPoint':True,'measurement':True,'externalWrites':len(writes),'physicalPhone':False}),flush=True)
  await browser.close()
if __name__=='__main__':asyncio.run(main())
