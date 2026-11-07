"""KML sa 5578 tačaka: jedan canvas za sve tačke (ne sloj po tački), klik/hover i dalje rade. Stvarni kod."""
import asyncio,mimetypes,os,sys,importlib.util
from pathlib import Path
from playwright.async_api import async_playwright
spec=importlib.util.spec_from_file_location('base',Path(__file__).with_name('menu-tools.py'));b=importlib.util.module_from_spec(spec);spec.loader.exec_module(b)
N=5578
js='''
const map=L.map('map',{zoomControl:false,preferCanvas:true}).setView([44.5,16.5],11);
const kmlLs=[];let _dozKmlSelMode=false,_dozDrawType=null;const opened=[];
const _kmlOpenPopup=(l,ll)=>opened.push(l._kmlName);
const _KML_CULL_MIN=800,_KML_TACKE_MIN=300;let _KmlCullGroup=null,_KmlTackeSloj=null;
map.on('click',e=>{const kl=_kmlHitTest(e.latlng);if(kl)_kmlOpenPopup(kl,e.latlng);});
'''
for n in ['_escHtml','pcs','_parseKmlExtData','_coordsCentroid','_kmlLabelMarker','_kmlPointClick','_kmlGrpClick','_kmlGrpTip','_bindKmlPopup','_kmlTackeKlasa','_kmlGrupa','pkmlStyled','_kmlHitTest','_kmlRingDistPx','_distToSegPx','kmlPoints']:
    try: js+='\n'+b.function(n)
    except Exception as e: print('preskočeno',n,file=sys.stderr)
html='<!DOCTYPE html><html><head><meta charset="utf-8"><link rel="stylesheet" href="/static/libs/leaflet.min.css"><style>#map{position:fixed;inset:0}</style></head><body><div id="map"></div><script src="/static/libs/leaflet.min.js"></script><script>'+js+'</script></body></html>'
async def main():
 async with async_playwright() as p:
  browser=await p.chromium.launch(executable_path=os.environ.get('UI_CHROMIUM') or None,args=['--no-sandbox']);page=await browser.new_page(viewport={'width':1000,'height':700});errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  async def route(r):
   if r.request.url=='https://fixture.test/':await r.fulfill(content_type='text/html',body=html)
   elif r.request.url.startswith('https://fixture.test/static/'):
    f=b.ROOT/r.request.url.split('fixture.test/',1)[1];await r.fulfill(content_type=mimetypes.guess_type(f)[0] or 'text/plain',body=f.read_bytes())
   else:await r.abort()
  await page.route('**/*',route);await page.goto('https://fixture.test/')
  res=await page.evaluate('''async(N)=>{
   const prije=Object.keys(map._layers).length;
   let s='<kml><Document>';
   for(let i=0;i<N;i++){const la=44.3+(i%80)*0.004,lo=16.2+Math.floor(i/80)*0.004;s+=`<Placemark><name>T ${i}</name><Point><coordinates>${lo},${la},0</coordinates></Point></Placemark>`;}
   s+='</Document></kml>';
   const g=pkmlStyled(new DOMParser().parseFromString(s,'text/xml'),{color:'#f00',weight:2,opacity:0.9});
   g.addTo(map);kmlLs.push({grp:g,vis:true,name:'x'});
   let cnt=0;g.eachLayer(()=>cnt++);
   const i=1234,ll=L.latLng(44.3+(i%80)*0.004,16.2+Math.floor(i/80)*0.004);
   map.setView(ll,14,{animate:false});
   await new Promise(r=>setTimeout(r,150));
   const c=document.querySelector('.kml-tacke-canvas'),pt=map.latLngToContainerPoint(ll);
   const cr=c.getBoundingClientRect(),dpr=c.width/cr.width;
   const px=c.getContext('2d').getImageData(Math.round((pt.x-cr.left)*dpr),Math.round((pt.y-cr.top)*dpr),1,1).data;
   return {cnt,naKarti:Object.keys(map._layers).length-prije,canvasi:document.querySelectorAll('.kml-tacke-canvas').length,pe:getComputedStyle(c).pointerEvents,alpha:px[3],x:pt.x,y:pt.y};}''',N)
  print(res)
  assert res['cnt']==N and res['naKarti']<=2,res   # grupa + canvas sloj, ne 5578
  assert res['canvasi']==1 and res['pe']=='none' and res['alpha']>0,res
  await page.mouse.move(res['x']+30,res['y']+30);await page.mouse.move(res['x'],res['y'],steps=4);await page.wait_for_timeout(150)
  await page.mouse.move(res['x']+1,res['y']+1,steps=2);await page.wait_for_timeout(150)
  assert 'T 1234' in await page.locator('.leaflet-tooltip').inner_text()
  await page.mouse.click(res['x'],res['y']);await page.wait_for_timeout(100)
  assert await page.evaluate('opened')==['T 1234'],await page.evaluate('opened')
  # zum mijenja projekciju; stil se primjenjuje; uklanjanje briše canvas
  z=await page.evaluate('''async()=>{map.setZoom(12,{animate:false});await new Promise(r=>setTimeout(r,120));const g=kmlLs[0].grp;
   g.eachLayer(l=>l.setStyle({color:'#00f',fillColor:'#00f'}));g._tackeSloj.redraw();const z=g._tackeSloj._pz.z;
   map.removeLayer(g);return {z,ostalo:document.querySelectorAll('.kml-tacke-canvas').length,lay:Object.keys(map._layers).length}}''')
  assert z['z']==12 and z['ostalo']==0,z
  assert not errors,errors
  print('PASS: 5578 tačaka = 1 canvas, hover/klik/zum/stil/uklanjanje')
  await browser.close()
asyncio.run(main())
