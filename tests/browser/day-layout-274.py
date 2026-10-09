"""Puni app: karte na uređaju, tim, tastatura, brisanje oznaka i pregled UI; fake server."""
import asyncio,importlib.util,mimetypes,os,tempfile
from pathlib import Path
from playwright.async_api import async_playwright
ROOT=Path(__file__).resolve().parents[2]
spec=importlib.util.spec_from_file_location('raster',ROOT/'tests/browser/load-map-233.py');raster=importlib.util.module_from_spec(spec);spec.loader.exec_module(raster)
OUT=ROOT/'outputs/274';OUT.mkdir(parents=True,exist_ok=True)
A='11111111-1111-4111-8111-111111111111';B='22222222-2222-4222-8222-222222222222'
AUDIT="(selector)=>{const root=document.querySelector(selector);if(!root)return ['MISSING'];const lum=c=>{const v=c.slice(0,3).map(n=>{n/=255;return n<=.04045?n/12.92:((n+.055)/1.055)**2.4});return v[0]*.2126+v[1]*.7152+v[2]*.0722};const rgb=s=>{const m=s.match(/[\\d.]+/g)?.map(Number);return m?.length>=3?m:null};const bg=e=>{let c=[255,255,255];const chain=[];for(let p=e;p;p=p.parentElement)chain.unshift(p);for(const p of chain){let v=rgb(getComputedStyle(p).backgroundColor);if(v){const a=v[3]??1;c=c.map((n,i)=>v[i]*a+n*(1-a))}}return c};return [...root.querySelectorAll('*')].filter(e=>e.getClientRects().length&&getComputedStyle(e).visibility!=='hidden'&&[...e.childNodes].some(n=>n.nodeType===3&&n.textContent.trim())&&!e.closest('svg')&&!e.closest('button:disabled')).map(e=>{const st=getComputedStyle(e),c=rgb(st.color),b=bg(e);if(!c)return null;const a=lum(c),d=lum(b);const ratio=(Math.max(a,d)+.05)/(Math.min(a,d)+.05);return {text:e.textContent.trim().slice(0,55),id:e.id,cl:e.className,fg:c,bg:b,ratio:Math.round(ratio*100)/100}}).filter(x=>x&&x.ratio<4.5)}"
async def main():
 with tempfile.TemporaryDirectory() as tmp:
  path=Path(tmp)/'Odjel_test.mbtiles';raster.mbtiles(path)
  async with async_playwright() as p:
   browser=await p.chromium.launch(executable_path=os.environ.get('UI_CHROMIUM') or None)
   ctx=await browser.new_context(service_workers='block',viewport={'width':390,'height':800});errors=[];writes=[]
   async def route(r):
    url=r.request.url
    if not url.startswith('http://device.test/'):
     if r.request.method not in ['GET','HEAD']:writes.append(url)
     await r.abort();return
    name=url.split('device.test/',1)[1].split('?',1)[0] or 'index.html';f=ROOT/name
    if name=='GRANICE.kml':await r.fulfill(content_type='application/xml',body='<kml><Document/></kml>')
    elif f.is_file():await r.fulfill(content_type=mimetypes.guess_type(str(f))[0] or 'application/octet-stream',body=f.read_bytes())
    else:await r.fulfill(status=404,body='fixture')
   await ctx.route('**/*',route);await ctx.route_web_socket('**/*',lambda ws:ws.close())
   await ctx.add_init_script("""Object.defineProperty(navigator,'onLine',{get:()=>false,configurable:true});navigator.geolocation.watchPosition=()=>1;navigator.geolocation.clearWatch=()=>{};
    const uid='11111111-1111-4111-8111-111111111111';localStorage.setItem('tvlake_ol_profile',JSON.stringify({ts:Date.now(),data:{id:uid,odobren:true,sumarija:'TEST',ime:'Adnan',prezime:'Mahmic'}}));localStorage.setItem('tvlake_device_last_user',uid);""")
   page=await ctx.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
   await page.goto('http://device.test/');await page.wait_for_function('_startupRestore._done&&!!window.VlakaKeyboard')
   await page.evaluate("""()=>{sbUser={id:'11111111-1111-4111-8111-111111111111'};sbProfile={id:sbUser.id,odobren:true,sumarija:'TEST',ime:'Adnan',prezime:'Mahmic'};_revealApp();sbLoadProfile=async()=>{};sbInitData=async()=>{};sbLoadProjekti=async()=>{};sb={auth:{signOut:async()=>({error:null})}};}""")
   await page.evaluate("""()=>{document.documentElement.dataset.fieldTheme='day';_projekti=[{id:'P',gj:'Test',odjel:'105',korisnik_id:sbUser.id,clanovi:[]}];_aktivniProjektId='P';_applyVlakeRows([{nm:'T1',br:1,kr:0,projekt_id:'P',pts:[{la:44.9,lo:16,al:400},{la:44.901,lo:16.001,al:420}]}]);_dozOdjeli=[{id:'d1',name:'Test · 105',status:'active',created_by:sbUser.id,known_area_ha:42}];}""")
   for name,action,selector,close in [
    ('projects',"switchTab('projekat');showProjektDetalji('P')",'#proj-panel',"switchTab('karta')"),
    ('routes',"switchTab('vlake')",'#panel',"switchTab('karta')"),
    ('doznaka',"switchTab('doznaka');dozRenderOdjeli()",'#doznaka-panel',"switchTab('karta')"),
    ('terrain',"switchTab('teren')",'#teren-panel',"switchTab('karta')"),
    ('guide','showGuideChoice()','.guide-sheet','closeGuideChoice()'),
    ('maps','openLoadMapScreen()','#loadmap-modal','closeLoadMapScreen()'),
    ('layers','_openLayerSheet()','#layer-sheet','closeLayerSheet()'),
    ('labels','openOznakePanel()','#oznake-panel','closeOznakePanel()'),
    ('server','openSyncQueuePanel()','#syncq-panel','closeSyncQueuePanel()'),
    ('help','showHelp()','#help-modal','closeHelp()'),
    ('thematic','showTemModal()','#tem-modal','closeTemModal()'),
    ('style','openStilLinija()','#stil-modal','closeStilLinija()'),
    ('tracks','openTragRegistry()','#trag-reg-box','closeTragRegistry()'),
    ('map-manager','openMapManager()','#mapmgr-box','closeMapManager()'),
    ('doznaka-new','dozShowCreateOdjel()','#doz-create-box','dozCloseCreateOdjel()'),
    ('location',"document.getElementById('ab-loc-popup').style.display='block'",'#ab-loc-popup',"document.getElementById('ab-loc-popup').style.display='none'"),
    ('point','_tackaOpenModal()','#tacka-modal','_tackaCancelModal()'),
    ('settings',"switchTab('postavke')",'#postavke-panel',"switchTab('karta')"),
    ('admin',"sbProfile.is_admin=true;adminLoadUsers=async()=>{};_adminUsers=[{id:sbUser.id,ime:'Adnan',prezime:'Mahmic',odobren:true,is_admin:true,sumarija:'TEST'},{id:'33333333-3333-4333-8333-333333333333',ime:'Novi',prezime:'Korisnik',odobren:false,sumarija:'TEST',created_at:new Date().toISOString(),probni_do:new Date(Date.now()+86400000).toISOString()}];switchTab('admin');_adminRenderUsers()",'#admin-panel',"switchTab('karta')")]:
    await page.evaluate(action);await page.wait_for_timeout(250)
    result=await page.evaluate(AUDIT,selector)
    assert not result,(name,result)
    await page.screenshot(path=str(OUT/(name+'-audit.png')))
    await page.evaluate(close)
   assert await page.locator('#field-panel,#mdrop-readiness,button[onclick="openFieldPanel()"]').count()==0
   await page.evaluate("""()=>{switchTab('karta');document.getElementById('nv-val').textContent='1450 m';document.getElementById('omgi-y').textContent='6 353 566';document.getElementById('omgi-x').textContent='4 962 733';document.getElementById('map-scale-val').textContent='50,000';}""")
   for theme in ['day','dark']:
    await page.evaluate('(t)=>document.documentElement.dataset.fieldTheme=t',theme)
    for w,h in [(320,568),(390,800),(568,320),(1280,800)]:
     await page.set_viewport_size({'width':w,'height':h});await page.wait_for_timeout(100)
     gap=await page.evaluate("""()=>{const b=document.getElementById('nv-badge').getBoundingClientRect(),c=document.getElementById('map-ctrl-bar').getBoundingClientRect();return c.top-b.bottom;}""")
     assert gap>=7,(theme,w,h,gap)
     await page.screenshot(path=str(OUT/f'controls-{theme}-{w}.png'))
   assert not errors,errors
   assert not writes,writes
   await browser.close()
 print('PASS day contrast >=4.5 on 19 full app views; controls below wrapped coordinates in both themes, portrait/landscape; readiness section removed')
asyncio.run(main())
