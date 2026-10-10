"""Novi projekat doznake, izbor više odsjeka i GitHub prikaz slojeva; izolovani servisi."""
import asyncio,importlib.util,mimetypes,os,tempfile,json,sys
from pathlib import Path
from playwright.async_api import async_playwright
ROOT=Path(__file__).resolve().parents[2]
KML='<kml><Document><Placemark><name>GitHub putevi</name><LineString><coordinates>16,44.9 16.001,44.901</coordinates></LineString></Placemark></Document></kml>'
spec=importlib.util.spec_from_file_location('raster',ROOT/'tests/browser/load-map-233.py');raster=importlib.util.module_from_spec(spec);spec.loader.exec_module(raster)
OUT=ROOT/'outputs/276'/os.environ.get('DAY_UI_WIDTH','390');OUT.mkdir(parents=True,exist_ok=True)
A='11111111-1111-4111-8111-111111111111';B='22222222-2222-4222-8222-222222222222'
AUDIT=r"""(selector)=>{
 const root=document.querySelector(selector);if(!root)return [{missing:selector}];
 const rgb=s=>{const m=s.match(/[\d.]+/g)?.map(Number);return m?.length>=3?m:null};
 const mix=(a,b,o)=>b.map((n,i)=>a[i]*o+n*(1-o));
 const lum=c=>{const v=c.map(n=>{n/=255;return n<=.04045?n/12.92:((n+.055)/1.055)**2.4});return v[0]*.2126+v[1]*.7152+v[2]*.0722};
 const ratio=(a,b)=>(Math.max(lum(a),lum(b))+.05)/(Math.min(lum(a),lum(b))+.05);
 const bg=e=>{let c=[255,255,255];const chain=[];for(let p=e;p;p=p.parentElement)chain.unshift(p);for(const p of chain){const st=getComputedStyle(p),v=rgb(st.backgroundColor);if(v)c=mix(v,c,v[3]??1)}return c};
 const path=e=>e.id?'#'+CSS.escape(e.id):e.tagName.toLowerCase()+(typeof e.className==='string'&&e.className.trim()?'.'+e.className.trim().split(/\s+/).join('.'):'' );
 return [root,...root.querySelectorAll('*')].filter(e=>e.getClientRects().length&&getComputedStyle(e).visibility!=='hidden'&&!e.closest('svg,option')&&([ ...e.childNodes].some(n=>n.nodeType===3&&n.textContent.trim())||e.matches('input:not([type=hidden]):not([type=color]):not([type=checkbox]):not([type=radio]):not([type=range]),select,textarea'))).flatMap(e=>{
  const st=getComputedStyle(e),b=bg(e),v=rgb(st.color);if(!v)return [];
  const text=e.matches('input,textarea')?e.value||e.placeholder:e.matches('select')?e.selectedOptions[0]?.textContent:e.textContent.trim();if(!text)return [];
  const states=[['text',v]];if(e.matches('input[placeholder],textarea[placeholder]'))states.push(['placeholder',rgb(getComputedStyle(e,'::placeholder').color)]);
  return states.flatMap(([kind,c])=>{if(!c)return [];let opacity=1;for(let n=e;n;n=n.parentElement)opacity*=Number(getComputedStyle(n).opacity);const fg=mix(c,b,(c[3]??1)*opacity);const r=ratio(fg,b);const min=e.matches(':disabled')?3:4.5;return r>=min?[]:[{selector:path(e),kind,text:text.slice(0,65),fg,bg:b,ratio:+r.toFixed(2),min,style:e.getAttribute('style')}];});
 });
}"""
async def main():
 with tempfile.TemporaryDirectory() as tmp:
  path=Path(tmp)/'Odjel_test.mbtiles';raster.mbtiles(path)
  spec2=importlib.util.spec_from_file_location('theme',ROOT/'tests/browser/thematic-source-268.py');theme=importlib.util.module_from_spec(spec2);spec2.loader.exec_module(theme)
  gpkg=Path(tmp)/'USK_SADNJA_7_VRSTA_PROCJENA_V3.gpkg';theme.synthetic(gpkg)
  async with async_playwright() as p:
   browser=await p.chromium.launch(executable_path=os.environ.get('UI_CHROMIUM') or None)
   ctx=await browser.new_context(service_workers='block',viewport={'width':int(os.environ.get('DAY_UI_WIDTH','390')),'height':800});errors=[];writes=[]
   async def route(r):
    url=r.request.url
    if url=='https://appassets.androidplatform.net/drive-kml/github-kml-27501.kml':
     await r.fulfill(content_type='application/vnd.google-earth.kml+xml',body=KML);return
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

   await page.evaluate("""async()=>{
    if(!crypto.randomUUID)crypto.randomUUID=()=>Math.random().toString(16).slice(2);
    document.documentElement.dataset.fieldTheme='day';window.testBoundaryJobs=[];_processOfflineQueue=async()=>{};_OL.enqueue=job=>{testBoundaryJobs.push(job);return true};
    const poly=(a,b,odjel,odsjek)=>`<Placemark><name>${odjel}</name><description><![CDATA[<table><tr><td>Gj</td><td>0</td></tr><tr><td>Odjel</td><td>${odjel}</td></tr><tr><td>Odsjek</td><td>${odsjek}</td></tr></table>]]></description><Polygon><outerBoundaryIs><LinearRing><coordinates>${a},44.9 ${b},44.9 ${b},44.901 ${a},44.901 ${a},44.9</coordinates></LinearRing></outerBoundaryIs></Polygon></Placemark>`;
    const text='<kml><Document>'+poly(16,16.001,'1','a')+poly(16.001,16.002,'1','b')+poly(17,17.001,'1','c')+'</Document></kml>';
    await _localLayerKml('GRANICE.kml',text,sbUser.id,{id:'github-kml-27601',size:text.length});
    const road='<kml><Placemark><LineString><coordinates>16,44.9 16.003,44.901</coordinates></LineString></Placemark></kml>';
    await _localLayerKml('KAMIONSKI.PUTEVI.kml',road,sbUser.id,{id:'github-kml-27602',size:road.length});
    map.setView([44.9005,16.001],16);GithubLayers.render();_openLayerSheet();_lsTab('granice');
   }""")
   assert await page.evaluate("!document.getElementById('granice-toggle').disabled&&!document.getElementById('putevi-toggle').disabled")
   await page.locator('#granice-toggle').uncheck();await page.locator('#putevi-toggle').uncheck()
   assert await page.evaluate("kmlLs.filter(k=>GithubLayers.role(k)).every(k=>!k.vis&&!map.hasLayer(k.grp))")
   await page.evaluate("closeLayerSheet();dozShowCreateOdjel()")
   assert not await page.locator('#doz-boundary-picker').is_visible()
   assert await page.get_by_role('button',name='Ucrtaj na karti',exact=True).is_visible()
   await page.get_by_role('button',name='Izaberi iz sloja',exact=True).click()
   assert not await page.locator('#doz-boundary-picker').is_visible()
   assert not await page.locator('#doz-create-modal').is_visible()
   assert await page.evaluate("!kmlLs[0].vis&&map.hasLayer(kmlLs[0].grp)"),'Skriveni izabrani sloj treba privremeno prikazati'
   await page.evaluate("map.fire('click',{latlng:L.latLng(44.9005,16.0005)});map.fire('click',{latlng:L.latLng(44.9005,16.0015)})")
   assert await page.evaluate('_dozKmlSelLayers.length')==2,'Ručni klik na oba poligona mora raditi'
   await page.evaluate('DoznakaProjectBoundary.openPicker()')
   assert await page.locator('#doz-picker-list input').count()==2,'Ne smije se nuditi udaljen isti broj odjela'
   contrast=await page.evaluate(AUDIT,'#doz-boundary-picker');assert not contrast,contrast
   await page.screenshot(path=str(OUT/'doznaka-odsjeci-day.png'))
   await page.locator('#doz-picker-all').click();assert await page.evaluate('_dozKmlSelLayers.length')==2
   await page.locator('#doz-picker-confirm').click()
   await page.wait_for_function("!_dozKmlSelMode&&_dozCreateBoundary?.type==='Polygon'")
   assert not await page.locator('#doz-boundary-picker').is_visible()
   result=await page.evaluate("({geom:_dozCreateBoundary,ha:_dozCreateAreaHa,expected:turf.area(turf.polygon([[[16,44.9],[16.002,44.9],[16.002,44.901],[16,44.901],[16,44.9]]]))/10000})")
   assert abs(result['ha']-result['expected'])<.001,result
   assert await page.locator('#doz-create-odjel').input_value()=='','Bez automatskog unosa atributa odjela'
   assert await page.locator('#doz-create-gj').input_value()=='','Bez automatskog unosa atributa GJ'
   await page.locator('#doz-create-odjel').fill('1')
   assert await page.evaluate("!map.hasLayer(kmlLs[0].grp)&&!kmlLs[0].vis"),'Privremeni prikaz ne smije promijeniti trajnu vidljivost'
   await page.locator('#doz-create-gj').fill('Risovac Krupa')
   assert await page.evaluate('_dozCreateBoundary!==null&&_dozCreateOdjel==="1"'),'Unos GJ mora sačuvati izabranu granicu i odjel'
   await page.get_by_role('button',name='Izaberi iz sloja',exact=True).click();await page.evaluate('DoznakaProjectBoundary.openPicker()');await page.locator('#doz-boundary-picker footer').get_by_role('button',name='Odustani',exact=True).click()
   assert await page.evaluate('_dozCreateBoundary!==null&&_dozCreateOdjel==="1"'),'Odustajanje mora sačuvati prethodnu granicu'
   await page.get_by_role('button',name='Ucrtaj na karti',exact=True).click()
   await page.wait_for_function("_dozDrawType==='__boundary__'&&document.getElementById('doz-draw-banner').style.display==='flex'")
   await page.evaluate('dozCancelDraw()')
   assert await page.evaluate('_dozCreateBoundary!==null&&_dozCreateOdjel==="1"'),'Odustajanje od crteža čuva prethodnu granicu'
   await page.locator('#doz-create-submit').click()
   assert await page.evaluate("testBoundaryJobs.length===1&&testBoundaryJobs[0].type==='insert_doz_project'&&testBoundaryJobs[0].payload.boundary_geojson.type==='Polygon'&&testBoundaryJobs[0].payload.name==='RISOVAC KRUPA · 1'")
   # Ručno crtanje je dostupno prije unosa naziva/GJ, bez drugog create modala preko karte.
   await page.evaluate('dozShowCreateOdjel()');await page.get_by_role('button',name='Ucrtaj na karti',exact=True).click()
   await page.wait_for_function("_dozDrawType==='__boundary__'&&document.getElementById('doz-draw-banner').style.display==='flex'")
   assert not await page.locator('#doz-create-modal').is_visible()
   await page.evaluate("dozAddDrawPoint(L.latLng(44.9,16));dozAddDrawPoint(L.latLng(44.9,16.001));dozAddDrawPoint(L.latLng(44.901,16.001));dozFinishDraw()")
   assert await page.evaluate('_dozCreateBoundary.type==="Polygon"&&_dozCreateAreaHa>0')
   await page.evaluate("dozCloseCreateOdjel();GithubLayers.toggle('boundaries',true);GithubLayers.opacity(.45);const k=GithubLayers.layers('boundaries')[0];setKmlColor(kmlLs.indexOf(k),'#dc2626');GithubLayers.toggle('roads',false)")
   await page.reload();await page.wait_for_function('_startupRestore._done&&!!window.DoznakaProjectBoundary')
   await page.evaluate("sbUser={id:'11111111-1111-4111-8111-111111111111'};sbProfile={odobren:true,sumarija:'TEST'}")
   await page.evaluate("async()=>{await _localKmlRestore();GithubLayers.render()}")
   state=await page.evaluate("({b:GithubLayers.layers('boundaries').map(k=>({vis:k.vis,on:map.hasLayer(k.grp),opacity:k.opacity,col:k.col})),r:GithubLayers.layers('roads').map(k=>({vis:k.vis,on:map.hasLayer(k.grp)}))})")
   assert len(state['b'])==1 and state['b'][0]=={'vis':True,'on':True,'opacity':.45,'col':'#dc2626'},state
   assert len(state['r'])==1 and state['r'][0]=={'vis':False,'on':False},state
   assert not errors,errors
   assert not writes,writes
   await ctx.close();await browser.close()
 print('PASS: odmah izbor/crtanje, višestruki odsjeci + worker union, udaljen isti broj, ručni izbor bez atributa, cancel, offline projekt, GitHub prekidači i restart stil/vidljivost')
if __name__=='__main__':asyncio.run(main())
