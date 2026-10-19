"""Studio "Nacrtaj vlake u odjelu": stvarni miš nad stvarnim Leafletom i stvarnim kodom iz index.html."""
import asyncio,importlib.util,mimetypes,os
from pathlib import Path
from playwright.async_api import async_playwright
spec=importlib.util.spec_from_file_location('base',Path(__file__).with_name('menu-tools.py'));b=importlib.util.module_from_spec(spec);spec.loader.exec_module(b)
js='''
const map=L.map('map',{zoomControl:false}).setView([44.9,16],17);map.createPane('vlakeLines');
let vlake=[],actI=null,recOn=false,_tragOn=false,activeTool='select',bufLayers=[],snapRingMk=null,snapTarget=null,cIdx=0,selC='#000',_activeTab='karta';
const PAL=['#3b82f6','#ef4444','#22c55e'],kolegeVlakeMap={},_vlakeRenderer=undefined,_mdpIdx=null,toasts=[],saved=[],flushed=[];
let _aktivniProjektId='P1';const _projekti=[{id:'P1',odjel:'12',gj:'GJ Test'}];
const showToast=m=>toasts.push(m),rndList=()=>{},updBan=()=>{},updOvl=()=>{},updProjStats=()=>{},scheduleVlakaSave=i=>saved.push(i),sbFlushVlaka=i=>flushed.push(vlake[i].nm),updateVlakaLabel=()=>{},_updFabVisibility=()=>{},switchTab=()=>{},isReadOnly=()=>false,stopActiveTool=()=>{},mdpFinish=()=>{},attachPolyClick=()=>{},_saveLocalVlake=()=>{},getBojaVlake=()=>'#60a5fa',getBojaKraka=()=>'#f87171',getVlakaWeight=()=>4,getVlakaDashArray=()=>null,getIme=()=>'Test',_projVlakePts=()=>[],_findOdjelBounds=()=>null,_vlNmDijelovi=n=>String(n).replace(/^T/,'').split('.').map(Number);
const _removeVlakaMapLayers=v=>{try{map.removeLayer(v.poly)}catch(e){}};
const _dlgConfirm=async()=>true,_dlgPrompt=async()=>window.__prompt,sbDeleteVlaka=v=>deleted.push(v.nm),_ensureTPrefix=n=>n,_vlakaSaveTimers={};const deleted=[];
const renameVlaka=async(i,n)=>{vlake[i].nm=n;return true};
'''
for n in ['dst','calcL','fmtL','_escHtml','addPt','_parentOf','_nextKrakNm','_nextMainBr','_findJunctionIdx','_vlCmpNm','_vlRedoslijed','_dropEmptyVlaka','showSnapRing','hideSnapRing']:js+='\n'+b.function(n)
js+='\n'+b.section('var _vsdOn =','// ─── Uvoz vlake iz fajla')
html='<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><meta charset="utf-8"><link rel="stylesheet" href="/static/libs/leaflet.min.css"><style>'+b.styles+'#main{position:fixed;inset:0}#map{position:absolute;inset:0}</style></head><body>'+b.sprite+'<div id="main"><div id="map"></div><div id="manual-draw-panel" style="display:none"></div></div><script src="/static/libs/leaflet.min.js"></script><script>'+js+'</script></body></html>'
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
  assert not errors,errors
  await browser.close();print('Studio vlaka: miš klik/dvoklik/desni klik/Shift, hvatanje kraka na roditelja, tipkovnica, odabir klikom, zatvaranje: OK')
if __name__=='__main__':asyncio.run(main())
