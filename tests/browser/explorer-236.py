"""Explorer sa stvarnim Leaflet/canvas/pločicama; offline i kontrolisani GPS/kompas."""
import asyncio,importlib.util,os,json,mimetypes
from pathlib import Path
from playwright.async_api import async_playwright
ROOT=Path(__file__).resolve().parents[2]
spec=importlib.util.spec_from_file_location('base',Path(__file__).with_name('menu-tools.py'));b=importlib.util.module_from_spec(spec);spec.loader.exec_module(b)
body=b.section('<div id="explorer-top"','<!-- Tačka modal')+b.section('<div id="guide-choice-modal"','<!-- PROFIL VISINA MODAL -->')
# Banner se završava prije idućeg modala; koristi stvarni početak i kraj.
a=b.SOURCE.index('<div id="guide-draw-banner">');end=b.SOURCE.index('</div>\n</div>',a)+len('</div>\n</div>');body+=b.SOURCE[a:end]
js='''
let lastP={la:44.9,lo:16,ac:6,al:510,ts:Date.now()},gpsOn=true,_compassHeading=0,_compassLastUpdT=Date.now(),_activeTab='karta';
let _tacke=[{la:44.904,lo:16.001,nm:'Radilište · Odjel 107'},{la:44.902,lo:16.002,nm:'Drugi cilj'}],_tackaNavIdx=null,_tackaRoadLine=null,_tackaAirLine=null,_puteviGeoJSON=null;
let _navLastBrng=null,_navRotMap=0,_navRotTeren=0,_guideOn=false,_guideExplorerPick=false,_guideSession=0,_guidePts=[],_guideMinPts=0,_guideMarkers=[],_guidePreviewLine=null,_guideResultLayer=null,_guideActiveRouteId=null;
let _guideOsrmRoute=()=>new Promise(r=>window.routeRelease=r),_fetchProfileElev=()=>new Promise(r=>window.profileRelease=r);
const _mrezaProbaj=()=>true,_renderElevProfile=()=>calls.push('profil'),_guideEtaHtml=()=>({html:'',durTxt:''}),_guideSimplify=pts=>pts,_guideSaveRoute=()=>calls.push('save');
const _GUIDE_ROUTES_KEY='fixture_routes',calls=[],saved=[{id:'r',name:'Sačuvana ruta',pts:[{la:44.9,lo:16},{la:44.904,lo:16.001}]}];
localStorage.setItem(_GUIDE_ROUTES_KEY,JSON.stringify(saved));
const startGPS=()=>{gpsOn=true;calls.push('gps')},showToast=t=>calls.push(t),switchTab=t=>{_activeTab=t;window.Explorer?.setVisible(t==='karta')},_terenUpdNavTarget=()=>{},_updFabVisibility=()=>{},_msrFetchElev=async()=>520;
const fmtL=m=>Math.round(m)+' m',calcL=pts=>pts.slice(1).reduce((v,p,i)=>v+ExplorerNavigation.distance(pts[i],p),0);
const map=L.map('map',{zoomControl:false,attributionControl:false,preferCanvas:true,fadeAnimation:false,zoomAnimation:false}).setView([44.9,16],17);
L.DomEvent.disableClickPropagation(document.getElementById('record-control'));
L.tileLayer('http://fixture.test/tile/{z}/{x}/{y}.png',{maxZoom:20}).addTo(map);
const routeLine=L.polyline([[44.9,16],[44.901,16.0002],[44.902,16.0007],[44.904,16.001]],{color:'#ec4899',weight:5}).addTo(map);
let clicks=0;map.on('click',e=>{clicks++;window.clicked=e.latlng});
window.Explorer=ExplorerNavigation.create({map,getPosition:()=>lastP,getCompass:()=>({value:_compassHeading,ts:_compassLastUpdT}),isGpsOn:()=>gpsOn,onBearing:v=>_navLastBrng=v,toast:showToast});
function tick(h,age=0,accuracy=6){_compassHeading=h;_compassLastUpdT=Date.now();lastP={...lastP,ac:accuracy,ts:Date.now()-age};Explorer.onFix({...lastP,speed:0,heading:null});Explorer.refresh();}
'''+ '\n'.join(b.function(n) for n in ['vodiMeDoTacke','_clearNavLayers','_showNavPanel','_updateNavPanel','_updateNavElev','stopTackaNav','_haversine','_fmtDist','_bearing','_updateNavArrows','_angContinuity','showGuideChoice','closeGuideChoice','_guideStart','_guideCancel','_guideOnMapClick','_guideAddPoint','_guideUpdBanner','_guideUndo','_guideFinish','_guideExploreRoute','_guideDrawResult','_guideClearResult','_guideRoutesLoad','_guideRenderRoutes','_escHtml'])
html='''<html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/static/libs/leaflet.min.css"><style>'''+b.styles+'''\n[hidden]{display:none!important}html,body{margin:0;width:100%;height:100%;overflow:hidden}#main{position:fixed;inset:0;width:100%;height:100%}#map{width:100%;height:100%}</style><script src="/static/libs/leaflet.min.js"></script><script src="/static/js/explorer-navigation.js"></script></head><body><div id="main"><div id="map"><button id="record-control" style="position:absolute;top:90px;right:10px;z-index:2000" onclick="calls.push('pause')">Pauza</button><div id="nv-badge">NV i koordinate</div><div id="map-ctrl-bar">Alati karte</div></div></div>'''+body+'<script>'+js+'</script></body></html>'
tile=('<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#f0ecd9"/>'+''.join('<path d="M0 '+str(y)+' L256 '+str(y+45)+'" stroke="#b5a382"/>' for y in range(15,256,22))+'<path d="M40 256 L88 160 L165 70 L200 0" fill="none" stroke="#65835f" stroke-width="5"/><text x="22" y="25" fill="#3b5a39" font-size="10">TOPO</text></svg>').encode()
async def main():
 out=ROOT/'outputs/ui-preview';out.mkdir(parents=True,exist_ok=True)
 async with async_playwright() as p:
  browser=await p.chromium.launch(executable_path=os.environ.get('UI_CHROMIUM') or None,args=['--no-sandbox'])
  context=await browser.new_context(offline=True);page=await context.new_page();errors=[];external=[]
  page.on('pageerror',lambda e:errors.append(str(e)))
  async def route(r):
   url=r.request.url
   if url=='http://fixture.test/':await r.fulfill(status=200,content_type='text/html',body=html)
   elif '/tile/' in url:await r.fulfill(status=200,content_type='image/svg+xml',body=tile)
   elif url.startswith('http://fixture.test/static/'):
    path=ROOT/url.split('fixture.test/',1)[1];await r.fulfill(status=200,content_type=mimetypes.guess_type(path)[0] or 'application/javascript',body=path.read_bytes())
   else:external.append(url);await r.abort()
  await page.route('**/*',route);await page.goto('http://fixture.test/');await page.wait_for_function('!!window.Explorer')
  assert not await page.locator('#tacka-nav-panel').is_visible()
  # Oba ulaza koriste stvarni Explorer, bez dodavanja cilja u listu tačaka.
  await page.evaluate('showGuideChoice()');await page.locator('.guide-choice').first.click()
  assert await page.evaluate('_guideOn&&_guideExplorerPick')
  assert not await page.locator('#guide-draw-banner .finish').is_visible()
  await page.evaluate('_guideOnMapClick({lat:44.904,lng:16.001})')
  assert await page.evaluate('Explorer.active && !_guideOn && _tacke.length===2')
  await page.locator('#explorer-top>button').last.click()
  await page.evaluate('vodiMeDoTacke(0)');await page.wait_for_function('!!document.querySelector(".ex-world")')
  for theme in ['day','dark']:
   for w,h in [(320,568),(390,800),(568,320),(800,600)]:
    await page.set_viewport_size({'width':w,'height':h});await page.evaluate('(t)=>document.documentElement.dataset.fieldTheme=t',theme)
    await page.evaluate('tick(35)');await page.wait_for_timeout(300);await page.evaluate('tick(35)')
    for sel in ['#explorer-top','#tacka-nav-panel']:
     r=await page.locator(sel).bounding_box();assert r and r['x']>=0 and r['y']>=0 and r['x']+r['width']<=w+1 and r['y']+r['height']<=h+1,(sel,w,h,r)
    assert await page.evaluate('document.getElementById("tacka-nav-panel").scrollWidth<=document.getElementById("tacka-nav-panel").clientWidth')
    heights=await page.locator('#explorer-top button,#tacka-nav-panel button').evaluate_all('(bs)=>bs.filter(b=>b.getClientRects().length).map(b=>b.getBoundingClientRect().height)');assert min(heights)>=44,heights
    toggle=await page.locator('.ex-toggle').bounding_box();assert toggle['height']>=44;assert await page.locator('#ex-follow').is_checked()
    assert 'GPS ±6 m' in await page.locator('#ex-gps').inner_text()
    await page.screenshot(path=str(out/f'explorer-236-{theme}-{w}x{h}.png'))
  await page.set_viewport_size({'width':390,'height':800})
  # Rotiran raster/canvas, stvarni položaj pri dnu vidljivog polja, bez praznih uglova.
  for heading in [0,90,180,270,359,1]:
   await page.wait_for_timeout(270);await page.evaluate('(h)=>tick(h)',heading)
   await page.wait_for_function('Math.abs(Explorer.angle-'+str(heading)+')<.01',timeout=1500)
   point=await page.evaluate('(()=>{const p=Explorer.screenPoint([lastP.la,lastP.lo]);return {x:p.x,y:p.y,w:document.getElementById("map").clientWidth,h:document.getElementById("map").clientHeight}})()')
   assert abs(point['x']-point['w']/2)<2,point
   assert 90<point['y']<point['h']-120,point
   assert not await page.evaluate('map.dragging.enabled()')
   assert await page.evaluate('map.getSize().x>=Math.hypot(document.getElementById("map").clientWidth,document.getElementById("map").clientHeight)')
  await page.locator('#record-control').click();assert await page.evaluate('calls.includes("pause")')
  # Slab/zastarjeli signal ne smije prijaviti dolazak ili izmišljenu udaljenost.
  await page.evaluate('tick(30,30000,6)');assert 'zastarjela' in await page.locator('#ex-gps').inner_text();assert await page.locator('#tnp-air').inner_text()=='—'
  await page.evaluate('lastP={...lastP,la:44.904,lo:16.001};tick(30,0,70)');assert await page.locator('#tnp-air').inner_text()!='Stigao si'
  await page.evaluate('tick(30,8000,6)');assert await page.locator('#tnp-air').inner_text()!='Stigao si';assert 'prije 8 s' in await page.locator('#ex-gps').inner_text()
  await page.evaluate('tick(30,0,6)');assert await page.locator('#tnp-air').inner_text()=='Stigao si'
  await page.evaluate('_compassLastUpdT=0;lastP={...lastP,la:44.9,ts:Date.now()};Explorer.refresh()');assert await page.locator('#ex-heading').inner_text()=='Smjer nije dostupan'
  await page.evaluate('Explorer.onFix({...lastP,ts:Date.now(),speed:1.3,heading:90});Explorer.refresh()');assert 'Smjer kretanja' in await page.locator('#ex-heading').inner_text()
  await page.evaluate('gpsOn=false;Explorer.refresh()');assert await page.locator('#ex-gps-start').is_visible();assert await page.locator('#tnp-air').inner_text()=='—'
  await page.locator('#ex-gps-start').click();assert await page.evaluate('gpsOn')
  # Pregled vraća stvarne koordinate i gestu, potom nastavi praćenje.
  target=await page.evaluate('Explorer.destination')
  await page.locator('#ex-follow').uncheck();assert not await page.evaluate('!!document.querySelector(".ex-world")');assert await page.evaluate('Explorer.destination')==target
  assert not await page.locator('#ex-follow').is_checked();assert await page.evaluate('localStorage.getItem("tvlake_explorer_view_v1")')=='false'
  assert await page.evaluate('map.dragging.enabled()')
  await page.mouse.click(110,170);assert await page.evaluate('clicks')==1
  assert await page.evaluate('map.distance(clicked,map.containerPointToLatLng(L.point(110,170)))<.1')
  await page.evaluate('stopTackaNav();vodiMeDoTacke(0)');assert not await page.locator('#ex-follow').is_checked();assert not await page.evaluate('Explorer.following');assert await page.evaluate('Explorer.active')
  await page.locator('#ex-follow').check();assert await page.evaluate('Explorer.following');assert await page.evaluate('localStorage.getItem("tvlake_explorer_view_v1")')=='true'
  await page.evaluate('switchTab("projekat")');assert not await page.locator('#tacka-nav-panel').is_visible();assert not await page.evaluate('!!document.querySelector(".ex-world")')
  await page.evaluate('switchTab("karta");tick(20)');assert await page.locator('#tacka-nav-panel').is_visible()
  await page.evaluate('stopTackaNav()');assert await page.evaluate('map.dragging.enabled() && !Explorer.active')
  assert not await page.locator('#explorer-you').is_visible()
  await page.evaluate('_guideExploreRoute("r")');assert await page.evaluate('Explorer.active && _guideResultLayer.length===3')
  await page.evaluate('stopTackaNav();_tacke[0].nm="<img src=x onerror=alert(1)>";vodiMeDoTacke(0)');assert await page.locator('#tnp-name img').count()==0
  await page.evaluate('stopTackaNav()');assert await page.evaluate('map.getContainer().contains(map._mapPane) && !document.querySelector(".ex-world")')
  # Kasni OSRM i profil ne smiju pregaziti novi izbor cilja/Explorer.
  await page.evaluate('_guideStart(false);_guideAddPoint({lat:44.9,lng:16},true);_guideAddPoint({lat:44.904,lng:16.001},false);window.waiting=_guideFinish();void 0')
  await page.evaluate('vodiMeDoTacke(0);routeRelease({pts:[{la:44.9,lo:16},{la:44.904,lo:16.001}],distM:450,osrm:true});void 0')
  await page.evaluate('waiting');assert not await page.evaluate('calls.includes("save")||calls.includes("profil")')
  await page.evaluate('_guideOsrmRoute=async()=>({pts:[{la:44.9,lo:16},{la:44.904,lo:16.001}],distM:450,osrm:true});_guideStart(false);_guideAddPoint({lat:44.9,lng:16},true);_guideAddPoint({lat:44.904,lng:16.001},false);window.waiting=_guideFinish();void 0')
  await page.wait_for_function('!!window.profileRelease')
  await page.evaluate('vodiMeDoTacke(1);profileRelease(null);void 0');await page.evaluate('waiting')
  assert await page.evaluate('Explorer.active&&_tackaNavIdx===1&&!calls.includes("save")&&!calls.includes("profil")')
  await page.evaluate('stopTackaNav()')
  assert not errors,errors
  assert not external,external
  await browser.close();print('Explorer: stvarni Leaflet/canvas/raster offline, 8 pregleda, 6 smjerova, GPS/kompas, oba ulaza i obnova karte — OK')
if __name__=='__main__':asyncio.run(main())
