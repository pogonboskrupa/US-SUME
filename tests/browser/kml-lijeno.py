"""v4.7.2: lijeno učitavanje granica/sakrivenih slojeva i razbijanje velikog MultiGeometry Placemarka.
Stvarni Leaflet, DOMParser i stvarne funkcije iz glavni.js."""
import asyncio,mimetypes,os,sys,importlib.util
from pathlib import Path
from playwright.async_api import async_playwright
spec=importlib.util.spec_from_file_location('base',Path(__file__).with_name('menu-tools.py'));b=importlib.util.module_from_spec(spec);spec.loader.exec_module(b)
js='''
const map=L.map('map',{zoomControl:false,preferCanvas:true}).setView([44.8,16.2],12);
let kmlLs=[],sbUser={id:'A'},_dozKmlSelMode=false,_dozDrawType=null;const _kmlOpenPopup=()=>{};
const _KML_PO_DIJELOVIMA_MIN=1200000,_KML_VELIKI_PM=150000,_LOCAL_KML_KEY='tvlake_local_kml';
const _kmlStore=new Map();const _kmlcGet=async k=>_kmlStore.get(k);
const applyKmlStyle=()=>{},rndGraniceModal=()=>{},_rndOznakePanel=()=>{},showToast=()=>{};
function _kmlGrupa(){return L.featureGroup();}
'''
for n in ['_escHtml','_pcsRazmak','pcs','_parseKmlExtData','_coordsCentroid','_kmlLabelMarker','_kmlPointClick','_kmlGrpClick','_kmlGrpTip','_bindKmlPopup','pkml','_kmlRazbijPm','_kmlGrupaIzSadrzaja','_kmlLijenoUcitaj','_kmlLijenoUcitajSve']:
    js+='\n'+b.function(n)
js+='''
const _T=[];const _pk=pkml;pkml=function(){const t=performance.now();const r=_pk.apply(this,arguments);_T.push(performance.now()-t);return r;};
function gen(multi){let s='<?xml version="1.0"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document>';
 const poly=(cx,cy)=>{let c='';for(let k=0;k<=60;k++){const a=k/60*6.2832;c+=(cx+0.002*Math.cos(a)).toFixed(7)+','+(cy+0.0014*Math.sin(a)).toFixed(7)+',0 ';}return '<Polygon><outerBoundaryIs><LinearRing><coordinates>'+c+'</coordinates></LinearRing></outerBoundaryIs></Polygon>';};
 for(let i=0;i<60;i++)s+=`<Placemark><name>O${i}</name><ExtendedData><Data name="Odjel"><value>${i}</value></Data></ExtendedData>${poly(16+i*0.005,44.7)}</Placemark>`;
 s+='<Placemark><name>Velika GJ</name><ExtendedData><Data name="GJ"><value>9</value></Data></ExtendedData><MultiGeometry>';for(let j=0;j<multi;j++)s+=poly(16+(j%40)*0.004,44.8+Math.floor(j/40)*0.003);s+='</MultiGeometry></Placemark>';
 for(let i=0;i<5;i++)s+=`<Placemark><name>Z${i}</name>${poly(16.5,44.9+i*0.004)}</Placemark>`;
 return s+'</Document></kml>';}
function sazetak(g){const r=[];const w=x=>x.eachLayer(l=>{if(l.eachLayer&&!l._kmlName&&!l._latlngs)w(l);else if(l._kmlIsPolygon)r.push(l._kmlPmIndex+'|'+l._kmlName+'|'+JSON.stringify(l._kmlExtData)+'|'+l.getLatLngs()[0].length)});w(g);return r.sort();}
'''
html='<!DOCTYPE html><html><head><meta charset="utf-8"><link rel="stylesheet" href="/static/libs/leaflet.min.css"><style>#map{position:fixed;inset:0}</style></head><body><div id="map"></div><script src="/static/libs/leaflet.min.js"></script><script>'+js+'</script></body></html>'
async def main():
 async with async_playwright() as p:
  br=await p.chromium.launch(executable_path=os.environ.get('UI_CHROMIUM') or None,args=['--no-sandbox']);pg=await br.new_page();errs=[];pg.on('pageerror',lambda e:errs.append(str(e)))
  async def route(r):
   if r.request.url=='https://fixture.test/':await r.fulfill(content_type='text/html',body=html)
   elif r.request.url.startswith('https://fixture.test/static/'):
    f=b.ROOT/r.request.url.split('fixture.test/',1)[1];await r.fulfill(content_type=mimetypes.guess_type(f)[0] or 'text/plain',body=f.read_bytes())
   else:await r.abort()
  await pg.route('**/*',route);await pg.goto('https://fixture.test/')
  # 1) Razbijen MultiGeometry daje ISTE poligone sa istim indeksom Placemarka kao cjelovito parsiranje.
  r=await pg.evaluate('''async()=>{const s=gen(500);const cijelo=sazetak(_pk(new DOMParser().parseFromString(s,'text/xml'),'#f00'));
   _T.length=0;const g=await _kmlGrupaIzSadrzaja(s,'#f00');const dijelovi=sazetak(g);
   return {kb:Math.round(s.length/1000),n:cijelo.length,isto:JSON.stringify(cijelo)===JSON.stringify(dijelovi),poziva:_T.length,velikaIdx:[...new Set(dijelovi.filter(x=>x.includes('|Velika GJ|')).map(x=>x.split('|')[0]))]};}''')
  print(r)
  assert r['isto'] and r['n']==565,r
  assert r['velikaIdx']==['60'],r
  assert r['poziva']>10,r
  # 2) Lijen sloj: prazna grupa dok se ne doda na kartu, tada se učita i zamijeni pravom.
  r=await pg.evaluate('''async()=>{const s=gen(50);_kmlStore.set('ck',s);localStorage.setItem(_LOCAL_KML_KEY,JSON.stringify({'GRANICE.kml':{cacheKey:'ck',vis:true}}));
   const k={name:'GRANICE.kml',_origName:'GRANICE.kml',col:'#f00',vis:true,onlyPolygon:true,_lijeno:true,grp:L.featureGroup()};kmlLs.push(k);
   const ph=k.grp;ph.once('add',()=>{_kmlLijenoUcitaj(k,true);});
   const prije={lijeno:k._lijeno,n:ph.getLayers().length};
   ph.addTo(map);for(let i=0;i<200&&k._lijeno;i++)await new Promise(r=>setTimeout(r,20));
   return {prije,lijeno:k._lijeno,novaNaKarti:map.hasLayer(k.grp),staraNaKarti:map.hasLayer(ph),poligona:sazetak(k.grp).length};}''')
  print(r)
  assert r['prije']=={'lijeno':True,'n':0} and r['lijeno'] is False and r['novaNaKarti'] and not r['staraNaKarti'] and r['poligona']==115,r
  # 3) Sakriven lijen sloj učitan na zahtjev (npr. pretraga granica) ostaje sakriven.
  r=await pg.evaluate('''async()=>{const s=gen(10);_kmlStore.set('ck2',s);const st=JSON.parse(localStorage.getItem(_LOCAL_KML_KEY));st['skriven.kml']={cacheKey:'ck2',vis:false};localStorage.setItem(_LOCAL_KML_KEY,JSON.stringify(st));
   const k={name:'skriven.kml',_origName:'skriven.kml',col:'#00f',vis:false,_lijeno:true,grp:L.featureGroup()};kmlLs.push(k);
   const n=await _kmlLijenoUcitajSve();return {n,lijeno:k._lijeno,naKarti:map.hasLayer(k.grp),poligona:sazetak(k.grp).length};}''')
  print(r)
  assert r=={'n':1,'lijeno':False,'naKarti':False,'poligona':75},r
  # 4) Nema sadržaja (obrisan IDB zapis): sloj više nije lijen i ne pokušava se iznova u petlji.
  r=await pg.evaluate('''async()=>{const k={name:'nema.kml',_origName:'nema.kml',col:'#0f0',vis:false,_lijeno:true,grp:L.featureGroup()};kmlLs.push(k);await _kmlLijenoUcitaj(k);return k._lijeno;}''')
  assert r is False,r
  assert not errs,errs
  print('kml-lijeno: OK');await br.close()
asyncio.run(main())
