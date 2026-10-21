"""Labele vlaka/kraka: paralelno s linijom, povuci + zarotiraj (labela imena i lager), declutter rotiranih labela.
Stvarni Leaflet i stvarni kod iz index.html / static/js/vlaka-lager.js."""
import asyncio,importlib.util,mimetypes,os
from pathlib import Path
from playwright.async_api import async_playwright
spec=importlib.util.spec_from_file_location('base',Path(__file__).with_name('menu-tools.py'));b=importlib.util.module_from_spec(spec);spec.loader.exec_module(b)
js='''
const map=L.map('map',{zoomControl:false,preferCanvas:true}).setView([44.9,16],16);map.createPane('vlakeLabels');map.getPane('vlakeLabels').style.zIndex=401;
let vlake=[],recOn=false,activeTool='select',_vsdOn=false,_vpIdx=null;const toasts=[],flushed=[],saved=[];
const showToast=m=>toasts.push(m),sbFlushVlaka=i=>flushed.push(vlake[i].nm),_saveLocalVlake=()=>{saved.push(1);return true},closeVlakaPopup=()=>{},_lineStyle={lagerScale:100},_scheduleDeclutterLabels=()=>{};
const sbUser=null,_aktivniProjektId='P1',_loadBoje=()=>({}),kolegeVlakeMap={};
const _stpLagerSvg=(w,h)=>'<svg width="'+w+'" height="'+h+'" style="display:block"><rect width="'+w+'" height="'+h+'" fill="#92400e"/></svg>';
'''
for n in ['_escHtml','ptDist','calcL','_parentOf','_labelFracs','_labelHtml','_lblIcon','_lblDuzinaM','_lblIdealno','_lblObb','_lblObbPresjek','_declutterVlakaLabels','_lblBroj','_lblJunkcije','_lblZauzetoOd','_lblOvrAll','_lblKljuc','_lblOvrGet','_lblOvrSet','_lblOvrDel','_lblOvrSnimi','_lblNapraviPrimarni','updateVlakaLabel','_lblIdx','_lblClamp','_lblTrenutniUgao','_lblMarkSel','_lblSelect','_lblDragKraj','_lagerSnimi','_lagerDragKraj','_lblRotiraj','_lblSnimi','_lblKorak','_lblAuto','_lblBarGradi','_lblBarOsvjezi','_lblEditToggle']:
    js+='\n'+b.function(n)
js+='\nconst _LBL_OFFS_PX=9,_LBL_REF_MPP=2.65;var _lblOvrMem=null,_lblEdit=false,_lblSel=null;\n'
js+=(b.ROOT/'static/js/vlaka-lager.js').read_text()
html='<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/static/libs/leaflet.min.css"><style>'+b.styles+'#map{position:fixed;inset:0}</style></head><body><div id="map"></div><div id="lager-position-toolbar" hidden><span id="lager-position-title"></span></div><script src="/static/libs/leaflet.min.js"></script><script>'+js+'</script></body></html>'
LA,LO=44.9,16.0
KX=111320*__import__('math').cos(LA*3.14159265/180)
def mk(x,y):return {'la':LA+y/111320,'lo':LO+x/KX}
async def main():
 async with async_playwright() as p:
  browser=await p.chromium.launch(executable_path=os.environ.get('UI_CHROMIUM') or None,args=['--no-sandbox']);page=await browser.new_page(viewport={'width':1000,'height':700});errors=[];page.on('pageerror',lambda e:errors.append(str(e)+' | '+str(getattr(e,'stack',''))[:600]))
  async def route(r):
   if r.request.url=='https://fixture.test/':await r.fulfill(content_type='text/html',body=html)
   elif r.request.url.startswith('https://fixture.test/static/'):
    f=b.ROOT/r.request.url.split('fixture.test/',1)[1];await r.fulfill(content_type=mimetypes.guess_type(f)[0] or 'text/plain',body=f.read_bytes())
   else:await r.abort()
  await page.route('**/*',route);await page.goto('https://fixture.test/')
  ev=page.evaluate
  # matična vlaka T1 (istok 700 m) sa krakom T1.1 koji polazi sa sredine i ide na sjever
  await ev('''(d)=>{const mkv=(nm,kr,pts,lager)=>({nm,br:1,kr,color:'#22c55e',lager:lager||'',pts,projektId:'P1',poly:null,wpts:[],labelMk:null,lagerMk:null,extraLabels:[],naPutu:false});
   vlake.push(mkv('T1',0,d.t1,'L1'));vlake.push(mkv('T1.1',1,d.k1));vlake.forEach((v,i)=>updateVlakaLabel(i));}''',{'t1':[mk(0,0),mk(350,0),mk(700,0)],'k1':[mk(350,0),mk(350,150),mk(350,300)]})
  r=await ev('''()=>vlake.map(v=>({nm:v.nm,ll:v.labelMk.getLatLng(),deg:v.labelMk._lblDeg}))''')
  t1,k1=r
  x1=(t1['ll']['lng']-16.0)*111320*__import__('math').cos(44.9*3.14159265/180)
  assert abs(t1['deg'])<1 and abs(x1-350)>=40,('T1 labela mora biti paralelna i ne na čvorištu (350 m)',t1,x1)
  y2=(k1['ll']['lat']-44.9)*111320
  assert abs(abs(k1['deg'])-90)<2 and 40<y2<260,('krak: labela uspravna (paralelna) i NE na početku',k1,y2)
  html1=await ev('''()=>vlake.map(v=>v.labelMk.getElement().querySelector('.vlaka-lbl').getAttribute('data-rot'))''')
  assert all(h is not None for h in html1),html1
  # --- uređivanje: uključi, selektuj, rotiraj slajderom, snimi
  await ev('_lblEditToggle(true)')
  assert await page.locator('#lbl-edit-bar').is_visible()
  assert await ev('document.body.classList.contains("lbl-edit-on")')
  assert await ev('vlake.every(v=>v.labelMk.options.draggable&&v.labelMk.options.interactive)')
  # klik na labelu T1 (stvarni miš)
  box=await page.locator('.vlaka-lbl.lbl-edit').first.bounding_box()
  await page.mouse.click(box['x']+box['width']/2,box['y']+box['height']/2)
  assert await ev('_lblSel&&_lblSel.v.nm')=='T1',await ev('_lblSel&&_lblSel.v.nm')
  await page.locator('#lb-rot').fill('30')
  await page.locator('#lb-rot').dispatch_event('change')
  assert await ev('_lblOvrGet(vlake[0]).rot')==30
  assert await ev('JSON.parse(localStorage.getItem("tvlake_lbl_ovr_v1"))["P1|T1"].rot')==30
  assert await ev('vlake[0].labelMk.getElement().querySelector(".vlaka-lbl").getAttribute("data-rot")')=='30.0'
  # --- povlačenje stvarnim mišem: labela se pomjeri, položaj ostaje sačuvan, rotacija ostaje
  box=await page.locator('.vlaka-lbl.lbl-edit').first.bounding_box();before=await ev('vlake[0].labelMk.getLatLng()')
  cx,cy=box['x']+box['width']/2,box['y']+box['height']/2
  await page.mouse.move(cx,cy);await page.mouse.down();await page.mouse.move(cx+25,cy+30,steps=6);await page.mouse.move(cx+60,cy+80,steps=6);await page.mouse.up()
  await page.wait_for_timeout(150)
  after=await ev('vlake[0].labelMk.getLatLng()')
  assert abs(after['lat']-before['lat'])>1e-5 or abs(after['lng']-before['lng'])>1e-5,(before,after)
  o=await ev('_lblOvrGet(vlake[0])');assert o['rot']==30 and abs(o['la']-after['lat'])<1e-9,(o,after)
  # reload podataka: pozicija se vraća iz lokalnog zapisa (restart)
  await ev('()=>{_lblOvrMem=null;updateVlakaLabel(0)}')
  again=await ev('vlake[0].labelMk.getLatLng()');assert abs(again['lat']-after['lat'])<1e-9 and abs(again['lng']-after['lng'])<1e-9
  # --- Auto vraća idealan položaj
  await ev('_lblSelect(vlake[0],"ime")');await page.get_by_text('Auto',exact=True).click()
  assert await ev('_lblOvrGet(vlake[0])') is None
  assert abs(await ev('vlake[0].labelMk._lblDeg'))<1
  # --- lager: povuci + zarotiraj, putuje u lager_pt (server) i šalje se
  assert await ev('!!vlake[0].lagerMk&&vlake[0].lagerMk.options.draggable')
  await ev('_lblSelect(vlake[0],"lager")')
  await page.locator('#lb-rot').fill('-40');await page.locator('#lb-rot').dispatch_event('change')
  lp=await ev('vlake[0].lagerPt');assert lp['rot']==-40 and lp['u']==1,lp
  assert 'rotate(-40deg)' in await ev('vlake[0].lagerMk.getElement().innerHTML')
  assert await ev('flushed.includes("T1")') and await ev('saved.length')>0
  lb=await page.locator('.vlaka-lager-mk').bounding_box()
  await page.mouse.move(lb['x']+lb['width']/2,lb['y']+8);await page.mouse.down();await page.mouse.move(lb['x']+50,lb['y']+60,steps=8);await page.mouse.up();await page.wait_for_timeout(150)
  lp2=await ev('vlake[0].lagerPt');assert lp2['rot']==-40 and (abs(lp2['la']-lp['la'])>1e-6 or abs(lp2['lo']-lp['lo'])>1e-6),(lp,lp2)
  # Auto za lager koji je uredilo ovo uređivanje → nazad na zadani položaj bez lagerPt
  await ev('_lblSelect(vlake[0],"lager")');await page.get_by_text('Auto',exact=True).click()
  assert await ev('vlake[0].lagerPt') is None
  # --- izlazak iz uređivanja
  await ev('_lblEditToggle(false)')
  assert not await page.locator('#lbl-edit-bar').is_visible()
  assert await ev('vlake.every(v=>!v.labelMk.options.draggable)')
  # --- (izvan uređivanja) ručno postavljena (pin) labela ne smije biti sakrivena declutterom, ostale se sklanjaju
  await ev('''()=>{const v=vlake[1],e=v.labelMk.getLatLng();_lblOvrSet(vlake[0],{la:e.lat,lo:e.lng,rot:0});updateVlakaLabel(0);updateVlakaLabel(1);vlake[1].labelMk.setLatLng(vlake[0].labelMk.getLatLng());vlake[1].labelMk.getElement().querySelector('.vlaka-lbl').setAttribute('data-rot','0.0');_declutterVlakaLabels();}''')
  vis=await ev('''()=>vlake.map(v=>v.labelMk.getElement().querySelector('.vlaka-lbl').style.visibility)''')
  assert vis[0]=='' and vis[1]=='hidden',vis
  assert not errors,errors
  await browser.close()
 print('Labele: paralelno s linijom i van čvorišta, povuci+zarotiraj (ime i lager), snimanje/restart, Auto, declutter sa pin prednošću: OK')
if __name__=='__main__':asyncio.run(main())
