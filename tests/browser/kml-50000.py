"""KML sa 50 000 tačaka odjednom: vrijeme parsiranja/crtanja, ispravnost broja i klik. Stvarni kod iz index.html."""
import asyncio,mimetypes,os,sys,importlib.util
from pathlib import Path
from playwright.async_api import async_playwright
spec=importlib.util.spec_from_file_location('base',Path(__file__).with_name('menu-tools.py'));b=importlib.util.module_from_spec(spec);spec.loader.exec_module(b)
N=int(os.environ.get('KML_N','50000'))
js='''
const map=L.map('map',{zoomControl:false,preferCanvas:true}).setView([44.5,16.5],11);
const kmlLs=[];let _dozKmlSelMode=false,_dozDrawType=null;const opened=[];
const _kmlOpenPopup=(l,ll)=>opened.push(l._kmlName);
'''
for n in ['_escHtml','pcs','_parseKmlExtData','_coordsCentroid','_kmlLabelMarker','_kmlPointClick','_kmlGrpClick','_kmlGrpTip','_bindKmlPopup','pkmlStyled','pkml','_kmlHitTest','_kmlRingDistPx','_distToSegPx','kmlPoints']:
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
   let s='<?xml version="1.0"?><kml><Document>';
   for(let i=0;i<N;i++){const la=44.3+(i%250)*0.0012,lo=16.2+Math.floor(i/250)*0.0012;
     s+=`<Placemark><name>St ${i}</name><description>d${i}</description><ExtendedData><Data name="vrsta"><value>bukva</value></Data></ExtendedData><Point><coordinates>${lo},${la},0</coordinates></Point></Placemark>`;}
   s+='</Document></kml>';
   const t0=performance.now();
   const doc=new DOMParser().parseFromString(s,'text/xml');const t1=performance.now();
   const g=pkmlStyled(doc,{color:'#f00',weight:2,opacity:0.9});const t2=performance.now();
   g.addTo(map);const t3=performance.now();
   let cnt=0;g.eachLayer(()=>cnt++);
   await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));const t4=performance.now();
   kmlLs.push({grp:g,vis:true,name:'x'});
   // klik u tačno određenu tačku: indeks 12345
   const i=Math.min(12345,N-1),ll=L.latLng(44.3+(i%250)*0.0012,16.2+Math.floor(i/250)*0.0012);
   map.setView(ll,15,{animate:false});
   const h0=performance.now();const hit=_kmlHitTest(ll);const h1=performance.now();
   return {parse:t1-t0,build:t2-t1,add:t3-t2,paint:t4-t3,cnt,hit:hit&&hit._kmlName,hitMs:h1-h0,mem:performance.memory?.usedJSHeapSize||0,i};}''',N)
  print(res)
  # pravi klik/hover mišem na tačku (propagacija preko grupe, ne listener po tački)
  pt=await page.evaluate('''()=>{const p=map.latLngToContainerPoint(L.latLng(44.3+(12345%250)*0.0012,16.2+Math.floor(12345/250)*0.0012));return [p.x,p.y]}''')
  await page.mouse.move(pt[0]+30,pt[1]+30);await page.mouse.move(pt[0],pt[1],steps=4);await page.wait_for_timeout(150)
  await page.mouse.move(pt[0]+2,pt[1]+2,steps=3);await page.wait_for_timeout(150)
  assert await page.locator('.leaflet-tooltip').count()==1,'tooltip se nije pojavio na hover'
  assert 'St 12345' in await page.locator('.leaflet-tooltip').inner_text()
  await page.mouse.click(pt[0],pt[1]);await page.wait_for_timeout(100)
  assert await page.evaluate('opened')==['St 12345'],await page.evaluate('opened')
  # pkml (lokalni uvoz "Dodaj fajl") i miješani sadržaj: linija + poligon + tačka
  mix=await page.evaluate('''()=>{const d=new DOMParser().parseFromString('<kml><Placemark><name>A</name><LineString><coordinates>16,44,0 16.01,44.01,0</coordinates></LineString></Placemark><Placemark><name>B</name><Polygon><outerBoundaryIs><LinearRing><coordinates>16,44,0 16.02,44,0 16.02,44.02,0 16,44,0</coordinates></LinearRing></outerBoundaryIs></Polygon></Placemark><Placemark><name>C</name><Point><coordinates>16.5,44.5,0</coordinates></Point></Placemark></kml>','text/xml');
   const out=[];for(const f of [pkml,pkmlStyled]){const g=f===pkml?pkml(d,'#f00'):pkmlStyled(d,{color:'#f00'});const k=[];g.eachLayer(l=>{if(l._kmlName!==undefined)k.push(l._kmlName+(l._kmlIsPoint?'P':l._kmlIsPolygon?'G':'L'))});out.push(k.sort().join())}return out}''')
  assert mix==['AL,BG,CP','AL,BG,CP'],mix
  big=await page.evaluate('''async(N)=>{let s='<kml>';for(let i=0;i<N;i++)s+=`<Placemark><name>S${i}</name><Point><coordinates>${16.2+i*1e-5},44.3,0</coordinates></Point></Placemark>`;s+='</kml>';
   const d=new DOMParser().parseFromString(s,'text/xml');const t=performance.now();const g=pkml(d,'#00f');let c=0;g.eachLayer(()=>c++);return {c,ms:performance.now()-t}}''',N)
  assert big['c']==N,big
  print('pkml',big)
  assert not errors,errors
  assert res['cnt']==N,res['cnt']
  assert res['hit']=='St %d'%res['i'],res['hit']
  budget=float(os.environ.get('KML_BUDGET_MS','6000'))
  total=res['parse']+res['build']+res['add']+res['paint']
  assert total<budget,('presporo',total,budget)
  assert res['hitMs']<500,res['hitMs']
  print('kml-50000: OK',round(total),'ms');await browser.close()
asyncio.run(main())
