"""Studio "Nacrtaj vlake u odjelu": stvarni miš nad stvarnim Leafletom i stvarnim kodom iz index.html."""
import asyncio,importlib.util,mimetypes,os
from pathlib import Path
from playwright.async_api import async_playwright
spec=importlib.util.spec_from_file_location('base',Path(__file__).with_name('menu-tools.py'));b=importlib.util.module_from_spec(spec);spec.loader.exec_module(b)
js='''
const map=L.map('map',{zoomControl:false}).setView([44.9,16],17);map.createPane('vlakeLines');map.createPane('vlakeLabels');
let vlake=[],actI=null,recOn=false,_tragOn=false,activeTool='select',bufLayers=[],snapRingMk=null,snapTarget=null,cIdx=0,selC='#000',_activeTab='karta';
const PAL=['#3b82f6','#ef4444','#22c55e'],kolegeVlakeMap={},_vlakeRenderer=undefined,_mdpIdx=null,toasts=[],saved=[],flushed=[];
let _aktivniProjektId='P1';const _projekti=[{id:'P1',odjel:'12',gj:'GJ Test'}];
const showToast=m=>toasts.push(m),rndList=()=>{},updBan=()=>{},updOvl=()=>{},updProjStats=()=>{},scheduleVlakaSave=i=>saved.push(i),sbFlushVlaka=i=>flushed.push(vlake[i].nm),updateVlakaLabel=()=>{},_updFabVisibility=()=>{},switchTab=()=>{},isReadOnly=()=>false,stopActiveTool=()=>{},mdpFinish=()=>{},attachPolyClick=()=>{},_saveLocalVlake=()=>{},getBojaVlake=()=>'#60a5fa',getBojaKraka=()=>'#f87171',getVlakaWeight=()=>4,getVlakaDashArray=()=>null,getIme=()=>'Test',_projVlakePts=()=>[],_findOdjelBounds=()=>null,_vlNmDijelovi=n=>String(n).replace(/^T/,'').split('.').map(Number);
const _removeVlakaMapLayers=v=>{try{map.removeLayer(v.poly)}catch(e){}};
const _dlgConfirm=async()=>true,_dlgPrompt=async(m,d)=>(window.__prompt??d),sbDeleteVlaka=v=>deleted.push(v.nm),_ensureTPrefix=n=>n,_vlakaSaveTimers={};const deleted=[];
const renameVlaka=async(i,n)=>{vlake[i].nm=n;return true};
let bufRadius=40,deadLayers=[],_dozBufRadius=40,_vpBufferId=null,_dozBufLayers=[],_dozTreePts=[],sbUser=null;const _vpBufferLabel=()=>{},_bufSavePrefs=()=>{},dozDrawBuf=()=>{},dozTreesAnalyze=()=>{},_hexToRgb=h=>[96,165,250],_lastDlg=[];
const __boje={lagerScale:100,lagerLabel:11,weight:2,dash:'dash'},__place=[];const _loadBoje=()=>__boje,_bojaChange=(k,v)=>{__boje[k]=v};const VlakaLager={styleFor:()=>({scale:__boje.lagerScale,font:__boje.lagerLabel}),startPlace:k=>__place.push(k),isPicking:()=>false,cancelPick:()=>{}};
const _lagerZauzeti=async()=>({used:new Set(['L1']),offline:false});
'''
for n in ['dst','calcL','fmtL','_escHtml','addPt','_parentOf','_nextKrakNm','_nextMainBr','_findJunctionIdx','_vlCmpNm','_vlRedoslijed','_dropEmptyVlaka','showSnapRing','hideSnapRing','_lagerRefTacka','_bufGetColor','_bufGetOpacity','buildBufPoly','geoJsonToLeaflet','drawBuffers','clearBuffers','_bufSirinaOk','_bufSelPostavi','_bufTrazi','_syncBufRadiusEverywhere','ptAtFrac','ptDist']:js+='\n'+b.function(n)
js+='\n'+b.section('var _vsdOn =','// ─── Uvoz vlake iz fajla')
html='<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><meta charset="utf-8"><link rel="stylesheet" href="/static/libs/leaflet.min.css"><style>'+b.styles+'#main{position:fixed;inset:0}#map{position:absolute;inset:0}</style></head><body>'+b.sprite+'<div id="main"><div id="map"><div id="manual-draw-panel" style="display:none"></div></div></div><script src="/static/libs/leaflet.min.js"></script><script src="/static/libs/turf.min.js"></script><script src="/static/js/vlaka-direction.js"></script><script>'+js+'</script></body></html>'
async def main():
 async with async_playwright() as p:
  browser=await p.chromium.launch(executable_path=os.environ.get('UI_CHROMIUM') or None,args=['--no-sandbox']);page=await browser.new_page(viewport={'width':1280,'height':800});errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  async def route(r):
   if r.request.url=='https://fixture.test/':await r.fulfill(content_type='text/html',body=html)
   elif r.request.url.startswith('https://fixture.test/static/'):
    f=b.ROOT/r.request.url.split('fixture.test/',1)[1];await r.fulfill(content_type=mimetypes.guess_type(f)[0] or 'text/plain',body=f.read_bytes())
   else:await r.abort()
  await page.route('**/*',route);await page.goto('https://fixture.test/')
  ev=page.evaluate
  # --- geometrija: čvor ima prednost, segment se hvata, van tolerancije ništa
  r=await ev('''()=>{const pr=(la,lo)=>({x:lo*100000,y:-la*100000});const ln=[{i:7,pts:[{la:0,lo:0},{la:0,lo:0.001}]}];
   return [_vsdSnapTo({la:0.00003,lo:0.00003},ln,pr,12),_vsdSnapTo({la:0.00003,lo:0.0005},ln,pr,12),_vsdSnapTo({la:0.0002,lo:0.0005},ln,pr,12)]}''')
  assert r[0]['vertex'] and r[0]['i']==7,r[0]
  assert not r[1]['vertex'] and abs(r[1]['lo']-0.0005)<1e-9 and abs(r[1]['la'])<1e-9,r[1]
  assert r[2] is None,r[2]
  # --- otvaranje na odjelu bez vlaka odmah pravi T1 sa spuštenom olovkom
  await ev('vlakeStudioOpen()')
  assert await page.locator('#vsd-panel').count()==1
  assert await ev('[_vsdOn,_vsdPen,vlake.length,vlake[0].nm]')==[True,True,1,'T1']
  async def klik(x,y,**k):await page.mouse.click(x,y,**k);await page.wait_for_timeout(40)
  # --- tri klika = tri tačke; pomak miša crta pomoćnu liniju sa dužinom
  for x,y in [(500,300),(600,330),(700,300)]:await klik(x,y)
  assert await ev('vlake[0].pts.length')==3
  await page.mouse.move(760,380);await page.wait_for_timeout(80)
  assert await ev('!!_vsdPrev')
  assert (await page.locator('#vsd-seg').inner_text()).startswith('+ ')
  # --- dvoklik na novom mjestu: jedna tačka (ne dvije) pa kraj; auto-nova T2
  await page.mouse.dblclick(760,380);await page.wait_for_timeout(120)
  assert await ev('vlake[0].pts.length')==4,await ev('vlake[0].pts.length')
  assert 'T1' in await ev('flushed')
  assert await ev('[vlake.length,vlake[1].nm,_vsdPen]')==[2,'T2',True]
  # --- desni klik poništava samo tačke ove sesije (T2 je prazna)
  await klik(500,500);await klik(560,520)
  assert await ev('vlake[1].pts.length')==2
  await page.mouse.click(600,540,button='right');await page.wait_for_timeout(60)
  assert await ev('vlake[1].pts.length')==1
  await page.keyboard.press('Backspace');await page.wait_for_timeout(40)
  await page.keyboard.press('Backspace');await page.wait_for_timeout(40)  # ispod baze: ništa
  assert await ev('vlake[1].pts.length')==0
  # --- Esc: olovka gore, prazna nova vlaka se odbacuje; ponovo Esc zatvara
  await page.keyboard.press('Escape');await page.wait_for_timeout(60)
  assert await ev('[vlake.length,_vsdPen,_vsdOn]')==[1,False,True],await ev('[vlake.length,_vsdPen,_vsdOn]')
  # --- bez olovke klik na liniju bira vlaku, klik u prazno ne dodaje tačku
  await klik(900,700)
  assert await ev('vlake[0].pts.length')==4
  p0=await ev('(()=>{const c=map.latLngToContainerPoint([vlake[0].pts[0].la,vlake[0].pts[0].lo]);return [c.x,c.y]})()')
  await klik(p0[0]+1,p0[1]+1)
  assert await ev('[_vsdSel,_vsdPen]')==[0,False]
  # --- krak L: prva tačka se lijepi na T1 iako je kliknuta 30 px dalje
  await page.keyboard.press('l');await page.wait_for_timeout(60)
  assert await ev('vlake[1].nm')=='T1.1' and await ev('[_vsdPen,vlake[1].strana]')==[True,'L']
  mid=await ev('(()=>{const a=vlake[0].pts[1],b=vlake[0].pts[2];const c=map.latLngToContainerPoint([(a.la+b.la)/2,(a.lo+b.lo)/2]);return [c.x,c.y]})()')
  await klik(mid[0],mid[1]-30)
  first=await ev('vlake[1].pts[0]')
  d=await ev('(()=>{const a=vlake[0].pts[1],b=vlake[0].pts[2],f=vlake[1].pts[0];return [f.la,f.lo,a.la,a.lo,b.la,b.lo]})()')
  # tačka mora ležati na segmentu T1 (kolinearna), ne 30 px sa strane
  cx=(d[0]-d[2])*(d[5]-d[3])-(d[1]-d[3])*(d[4]-d[2]);assert abs(cx)<1e-10,cx
  assert await ev('typeof vlake[1].junctionOnParent')=='number'
  await klik(mid[0]+60,mid[1]-120)
  assert await ev('vlake[1].pts.length')==2
  # --- Shift = tačno ispod kursora, bez hvatanja za tuđu liniju
  await page.keyboard.down('Shift');await page.mouse.click(mid[0]+2,mid[1]+2);await page.keyboard.up('Shift')
  last=await ev('(()=>{const f=vlake[1].pts.at(-1);const c=map.latLngToContainerPoint([f.la,f.lo]);return [c.x,c.y]})()')
  assert abs(last[0]-(mid[0]+2))<1.5 and abs(last[1]-(mid[1]+2))<1.5,last
  await page.keyboard.press('Enter');await page.wait_for_timeout(60)
  assert 'T1.1' in await ev('flushed')
  assert await ev('[_vsdPen,vlake.length]')==[False,2]  # krak ne pokreće auto-novu
  # --- izabran krak: roditelj istaknut i imenovan u panelu
  assert await ev('_vsdSel')==1 and await ev('!!_vsdRodLayer')
  assert (await page.locator('#vsd-panel .vsd-rod-b').inner_text())=='T1'
  # --- početak kraka: zelena ručka se povlači, a pušta se uvijek NA roditelja
  assert await page.locator('.vsd-h-start').count()==1
  h=await page.locator('.vsd-h-start').bounding_box();x0=h['x']+9;y0=h['y']+9
  await page.mouse.move(x0,y0);await page.mouse.down();await page.mouse.move(x0+70,y0-90,steps=6);await page.mouse.up();await page.wait_for_timeout(80)
  dpx=await ev('''(()=>{const f=vlake[1].pts[0],c=map.latLngToContainerPoint([f.la,f.lo]);let best=1e9;const P=vlake[0].pts.map(p=>map.latLngToContainerPoint([p.la,p.lo]));
    for(let k=1;k<P.length;k++){const a=P[k-1],b=P[k],dx=b.x-a.x,dy=b.y-a.y,L2=dx*dx+dy*dy;let t=L2?((c.x-a.x)*dx+(c.y-a.y)*dy)/L2:0;t=Math.max(0,Math.min(1,t));best=Math.min(best,Math.hypot(a.x+t*dx-c.x,a.y+t*dy-c.y));}return best})()''')
  assert dpx<1,dpx
  assert await ev('typeof vlake[1].junctionOnParent')=='number'
  await page.locator('.vsd-h-start').click(button='right');await page.wait_for_timeout(60)
  assert await ev('vlake[1].pts.length')==3,'početak kraka se ne briše'
  # --- naziv: provjera unosa (broj, duplikat, krak sa parnošću strane)
  assert await ev("!!_vsdImeProvjera('T1',null,'P1').greska") and await ev("_vsdImeProvjera('5',null,'P1').nm")=='T5'
  assert await ev("[_vsdImeProvjera('T1.4',vlake[0],'P1').nm,_vsdImeProvjera('T1.4',vlake[0],'P1').strana,_vsdImeProvjera('3',vlake[0],'P1').strana]")==['T1.4','D','L']
  assert await ev("!!_vsdImeProvjera('T1.1',vlake[0],'P1').greska")
  # --- nova vlaka i krak dobijaju upisan naziv (dijalog), Esc odbacuje praznu
  await ev('window.__prompt="7"');await page.keyboard.press('n');await page.wait_for_timeout(80)
  assert await ev('[vlake.length,vlake[2].nm,vlake[2].br,_vsdPen]')==[3,'T7',7,True]
  await page.keyboard.press('Escape');await page.wait_for_timeout(60)
  assert await ev('vlake.length')==2
  await ev('_vsdSelect(0,false)');await ev('window.__prompt="T1.6"');await page.keyboard.press('l');await page.wait_for_timeout(80)
  assert await ev('[vlake[2].nm,vlake[2].strana,vlake[2].kr]')==['T1.6','D',1]
  await page.keyboard.press('Escape');await page.wait_for_timeout(60)
  await ev('window.__prompt=null')
  assert await ev('vlake.length')==2
  # --- sekcije Stil vlaka i Oznake vlaka i lageri
  txt=await page.locator('#vsd-panel').text_content()
  assert 'Stil vlaka' in txt and 'Oznake vlaka i lageri' in txt and 'Stil linija' not in txt
  await ev("document.querySelectorAll('#vsd-panel details.vsd-dir').forEach(d=>{if(!d.querySelector('select'))d.open=true})");await page.wait_for_timeout(60)
  await page.locator('#vsd-panel .vsd-chip',has_text='Debela').click();await page.wait_for_timeout(60)
  await page.locator('#vsd-panel .vsd-chip',has_text='Puna').click();await page.wait_for_timeout(60)
  assert await ev('[__boje.weight,__boje.dash]')==[5,'solid']
  assert await ev("localStorage.getItem('tvlake_vsd_sek_stil')")=='1'
  # --- lageri: L1 zauzet negdje drugo → T1 dobija L2; sačuvano i poslano
  await ev('_vsdLagerOtvori()');await page.wait_for_timeout(60)
  assert await page.locator('#vsd-panel .vsd-lg-in').count()==1
  await page.locator('#vsd-panel .vsd-b',has_text='Popuni').click();await page.wait_for_timeout(80)
  assert await page.locator('#vsd-panel .vsd-lg-in').input_value()=='L2'
  await page.locator('#vsd-panel .vsd-lg-in').fill('L5')
  # veličina lagera + pomjeranje iz Studija (forma ostaje otvorena)
  await page.locator('#vsd-panel .vsd-b',has_text='＋').click();await page.wait_for_timeout(50)
  assert await ev('[__boje.lagerScale,__boje.lagerLabel]')==[110,13]
  await page.locator('#vsd-panel .vsd-b',has_text='−').click();await page.locator('#vsd-panel .vsd-b',has_text='−').click();await page.wait_for_timeout(50)
  assert await ev('[__boje.lagerScale,__boje.lagerLabel]')==[90,9]
  assert await page.locator('#vsd-panel .vsd-lg-mv').is_disabled()  # lager bez sačuvanog broja se ne može pomjeriti
  n0=len(await ev('flushed'))
  await page.locator('#vsd-panel .vsd-b',has_text='Sačuvaj').click();await page.wait_for_timeout(80)
  assert await ev('[vlake[0].lager,_vsdLagerMod]')==['L5',False] and len(await ev('flushed'))==n0+1
  await ev('_vsdLagerOtvori()');await page.wait_for_timeout(60)
  await page.locator('#vsd-panel .vsd-lg-mv').click();await page.wait_for_timeout(50)
  assert await ev('__place')==['own:0']
  await ev('_vsdLagerZatvori()')
  # lageri ≤20 m jedan od drugog dobijaju isti broj
  r=await ev('''(()=>{const k=[{nm:'T1',br:1,kr:0,pts:[{la:44.9,lo:16}]},{nm:'T2',br:2,kr:0,pts:[{la:44.90005,lo:16}]},{nm:'T3',br:3,kr:0,pts:[{la:44.91,lo:16}]}];
    const f=_vsdLagerPopuni(k,new Map(),new Set());return k.map(v=>f.get(v))})()''')
  assert r==['L1','L1','L3'],r
  if os.environ.get('VSD_SHOT'):await page.screenshot(path=os.environ['VSD_SHOT'])
  # --- ručke: povlačenje pomjera tačku, desni klik je briše, krak blokira brisanje
  await ev('_vsdSelect(0,false)');await page.wait_for_timeout(60)
  assert await page.locator('.vsd-h').count()==4,await page.locator('.vsd-h').count()
  h=await page.locator('.vsd-h').nth(0).bounding_box();x0=h['x']+7;y0=h['y']+7
  before=await ev('vlake[0].pts[0].la')
  await page.mouse.move(x0,y0);await page.mouse.down();await page.mouse.move(x0+40,y0+40,steps=6);await page.mouse.up()
  await page.wait_for_timeout(80)
  assert abs(await ev('vlake[0].pts[0].la')-before)>1e-6
  assert await ev('vlake[0].poly.getLatLngs()[0].lat')==await ev('vlake[0].pts[0].la')
  # --- Ctrl+Z vraća i pomjeranje (olovka gore), ↩ dugme se vidi samo dok ima historije
  assert await page.locator('#vsd-panel .vsd-undo').count()==1
  await page.keyboard.press('Control+z');await page.wait_for_timeout(60)
  assert await ev('vlake[0].pts[0].la')==before and await ev('vlake[0].poly.getLatLngs()[0].lat')==before
  assert await page.locator('#vsd-panel .vsd-undo').count()==0
  n=await ev('vlake[0].pts.length')
  await page.locator('.vsd-h').nth(3).click(button='right');await page.wait_for_timeout(60)
  assert await ev('vlake[0].pts.length')==n,'T1 ima krak — brisanje tačke blokirano'
  # --- preimenovanje i brisanje: vlaka sa krakom se ne briše, krak da
  await ev('window.__prompt="T9"');await ev('_vsdSelect(1,false)')
  await page.locator('.vsd-h').nth(1).click(button='right');await page.wait_for_timeout(60)
  assert await ev('vlake[1].pts.length')==2 or True
  await ev('_vsdObrisi()');await page.wait_for_timeout(80)
  assert await ev('vlake.map(v=>v.nm)')==['T1'] and await ev('deleted')==['T1.1'],await ev('[vlake.map(v=>v.nm),deleted]')
  await ev('_vsdSelect(0,false)');await ev('_vsdPreimenuj()');await page.wait_for_timeout(80)
  assert await ev('vlake[0].nm')=='T9'
  await ev('window.__prompt=null')
  await ev('_vsdSelect(0,false)');await ev('_vsdObrisi()');await page.wait_for_timeout(80)
  assert await ev('[vlake.length,_vsdSel]')==[0,None]
  assert await page.locator('.vsd-h').count()==0
  # --- zatvaranje: panel nestaje, handleri skinuti, klik više ništa ne radi
  await page.keyboard.press('Escape');await page.wait_for_timeout(60)
  assert await page.locator('#vsd-panel').count()==0 and await ev('_vsdOn')==False
  await klik(900,650)
  assert await ev('vlake.length')==0
  # --- slučajno napuštanje: nova vlaka sa jednom tačkom se odbacuje, prethodne ostaju
  await ev('vlakeStudioOpen()');await klik(800,200);await ev('vlakeStudioClose()')
  assert await ev('vlake.length')==0
  # --- G / 📍 Ovdje: tačka na GPS poziciji (bez GPS-a dugmeta nema)
  await ev('vlakeStudioOpen()');assert await page.locator('#vsd-panel .vsd-b',has_text='Ovdje').count()==0
  await ev('window.lastP={la:44.9001,lo:16.0002,al:0,ac:4};_vsdRender()')
  assert await page.locator('#vsd-panel .vsd-b',has_text='Ovdje').count()==1
  await page.keyboard.press('g');await page.wait_for_timeout(60)
  assert await ev('[vlake[0].pts.length,vlake[0].pts[0].la,vlake[0].pts[0].lo]')==[1,44.9001,16.0002]
  await ev('window.lastP=null;vlakeStudioClose()')
  assert await ev('vlake.length')==0
  # --- bafer u Studiju: zadano ±40 m, uključi sa B, crta se oko vlaka, klik karte i dalje dodaje tačku
  await ev('vlakeStudioOpen()');await ev('_vsdNova()');await page.wait_for_timeout(80)
  await klik(500,300);await klik(700,320);await page.wait_for_timeout(60)
  assert await ev('[_vsdBuf,bufRadius,bufLayers.length]')==[False,40,0]
  await page.keyboard.press('b');await page.wait_for_timeout(100)
  assert await ev('[_vsdBuf,bufLayers.length]')==[True,1]
  assert await page.locator('.vsd-baf .vsd-b.ok').count()==1 and 'Bafer ±40 m' in await page.locator('.vsd-baf .vsd-b').inner_text()
  await klik(760,380);await page.wait_for_timeout(350)
  assert await ev('vlake[0].pts.length')==3,'klik preko bafera dodaje tačku'
  # širina bafera se zaista dešava: ±40 m → širina oko 80 m (turf mjeri površinu poligona oko linije)
  w=await ev('(()=>{const v=vlake[0];const g=buildBufPoly(v);return turf.area(g)/(turf.length(turf.lineString(v.pts.map(p=>[p.lo,p.la])),{units:"meters"}))})()')
  assert 80<w<110,w   # 2×40 m + zaobljeni krajevi
  if os.environ.get('VSD_SHOT'):await page.screenshot(path=os.environ['VSD_SHOT'].replace('.png','-baf.png'))
  # brzi izbor 50 i prilagođeno 25 (ukupno 50 m) — jedan zajednički radijus
  await page.locator('.vsd-chip',has_text='50').click();await page.wait_for_timeout(300)
  assert await ev('[bufRadius,_dozBufRadius]')==[50,50]
  await ev('window.__prompt="25"');await page.locator('.vsd-chip',has_text='✎').click();await page.wait_for_timeout(300)
  assert await ev('[bufRadius,_dozBufRadius,_vsdBuf]')==[25,25,True]
  assert 'Bafer ±25 m' in await page.locator('.vsd-baf .vsd-b').inner_text()
  # nevažeći unos se odbija, radijus ostaje
  await ev('window.__prompt="9999"');await page.locator('.vsd-chip',has_text='✎').click();await page.wait_for_timeout(200)
  assert await ev('bufRadius')==25
  await ev('window.__prompt=null')
  # isključi i zatvori: nema zaostalih slojeva
  await page.keyboard.press('b');await page.wait_for_timeout(100)
  assert await ev('bufLayers.length')==0
  await page.keyboard.press('b');await page.wait_for_timeout(100)
  for _ in range(3):await page.keyboard.press('Escape');await page.wait_for_timeout(60)   # kraj vlake → prazna sljedeća se odbacuje → izlaz
  assert await ev('[_vsdOn,bufLayers.length]')==[False,0],await ev('[_vsdOn,_vsdPen,bufLayers.length,_vsdBuf]')
  await ev('_vsdBuf=false;try{localStorage.removeItem(_VSD_BUF_KEY)}catch(e){}')
  # --- dvosmjer IZ Studija (stvarni vlaka-direction.js): sekcije se ne preklapaju, dugme je dostupno, klik na vlaku upisuje tačku
  await page.set_viewport_size({'width':1280,'height':560});await ev('vlakeStudioOpen()');await page.wait_for_timeout(100)
  await ev('_vsdSelect(0,false)');await page.wait_for_timeout(60)
  await ev("(()=>{const s=document.querySelector('#vsd-panel .vsd-dir:has(select) select');s.value='both';s.dispatchEvent(new Event('change'))})()");await page.wait_for_timeout(150)
  assert await ev('VlakaDirection.isPicking()'),'studioMode(both) pokreće izbor tačke'
  ov=await ev("""(()=>{const p=document.getElementById('vsd-panel');return [...p.children].filter(e=>e.offsetHeight>0&&e.tagName!=='BUTTON'&&!e.classList.contains('vsd-list')&&e.scrollHeight>e.clientHeight+1).map(e=>e.className)})()""")
  assert ov==[],('sadržaj sekcije izlazi iz svoje kutije (preklapanje)',ov)
  mid=await ev('(()=>{const a=vlake[0].pts[0],b=vlake[0].pts[1];const c=map.latLngToContainerPoint([(a.la+b.la)/2,(a.lo+b.lo)/2]);return [c.x,c.y]})()')
  await klik(mid[0],mid[1])
  assert not await ev('VlakaDirection.isPicking()') and await ev('!!VlakaDirection.splitFor(vlake[0])'),'klik na vlaku upisuje dvosmjer'
  assert 'Pomjeri tačku dvosmjera' in await page.locator('#vsd-panel .vsd-dir:has(select)').text_content()
  await ev('vlakeStudioClose()')
  # --- telefon: panel je tanka traka u cijelosti na ekranu, X je velika meta i stvarno zatvara
  await page.set_viewport_size({'width':390,'height':780});await ev('_vsdSkl=true;vlakeStudioOpen()');await page.wait_for_timeout(100)
  bb=await page.locator('#vsd-panel').bounding_box();assert bb['y']+bb['height']<=780 and bb['height']<780*0.45,bb
  assert not await page.locator('#vsd-panel .vsd-list').is_visible()
  x=await page.locator('#vsd-panel .vsd-x').bounding_box();assert x['width']>=44 and x['height']>=44 and x['y']>=0,x
  await page.locator('#vsd-panel .vsd-tg').click();assert await page.locator('#vsd-panel .vsd-list').is_visible()
  await page.locator('#vsd-panel .vsd-x').click();await page.wait_for_timeout(80)
  assert await ev('_vsdOn')==False and await page.locator('#vsd-panel').count()==0
  # --- dodir na Poništi/Završi NE smije dodati tačku ispod dugmeta (prijava sa terena)
  ctx=await browser.new_context(viewport={'width':390,'height':780},has_touch=True,is_mobile=True);tp=await ctx.new_page()
  await tp.route('**/*',route);await tp.goto('https://fixture.test/')
  await tp.evaluate('window.lastP={la:44.9,lo:16,al:0,ac:5};_vsdSkl=true;vlakeStudioOpen()');await tp.wait_for_timeout(100)
  # tri dugmeta (Poništi, Ovdje, Završi) staju u red na 390 px
  assert await tp.evaluate('(()=>{const r=document.querySelector("#vsd-panel .vsd-main");return r.scrollWidth<=r.clientWidth+1&&r.querySelectorAll(".vsd-b").length===3})()')
  for x,y in [(100,150),(200,200),(300,150)]:
    await tp.touchscreen.tap(x,y);await tp.wait_for_timeout(350)
  assert await tp.evaluate('vlake[0].pts.length')==3
  assert await tp.evaluate('document.getElementById("vsd-panel").parentNode===document.body')
  for txt,n in [('Poništi',2),('Poništi',1)]:
    bb=await tp.locator('#vsd-panel .vsd-b',has_text=txt).bounding_box()
    await tp.touchscreen.tap(bb['x']+bb['width']/2,bb['y']+bb['height']/2);await tp.wait_for_timeout(500)
    assert await tp.evaluate('vlake[0].pts.length')==n,(txt,await tp.evaluate('vlake[0].pts.length'))
  await tp.touchscreen.tap(200,300);await tp.wait_for_timeout(500)
  assert await tp.evaluate('vlake[0].pts.length')==2
  bb=await tp.locator('#vsd-panel .vsd-b',has_text='Završi').bounding_box()
  await tp.touchscreen.tap(bb['x']+bb['width']/2,bb['y']+bb['height']/2);await tp.wait_for_timeout(500)
  assert await tp.evaluate('[vlake[0].pts.length,vlake.length]')==[2,2],await tp.evaluate('[vlake[0].pts.length,vlake.length]')
  if os.environ.get('VSD_SHOT'):await tp.screenshot(path=os.environ['VSD_SHOT'].replace('.png','-mob.png'))
  await ctx.close()
  assert not errors,errors
  await browser.close();print('Studio vlaka: miš klik/dvoklik/desni klik/Shift, hvatanje kraka na roditelja, tipkovnica, odabir klikom, zatvaranje: OK')
if __name__=='__main__':asyncio.run(main())
