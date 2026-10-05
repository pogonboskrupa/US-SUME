"""Reprodukcija preklapanja Explorera, stvarnih traka i modalnih prozora."""
import asyncio,importlib.util,os,mimetypes,re
from pathlib import Path
from playwright.async_api import async_playwright
ROOT=Path(__file__).resolve().parents[2]
spec=importlib.util.spec_from_file_location('ex',Path(__file__).with_name('explorer-236.py'));ex=importlib.util.module_from_spec(spec);spec.loader.exec_module(ex)
b=ex.b

def div(name):
 a=b.SOURCE.index('<div id="'+name+'"');depth=0
 for m in re.finditer(r'<div\b[^>]*>|</div>',b.SOURCE[a:]):
  depth+=-1 if m[0]=='</div>' else 1
  if depth==0:return b.SOURCE[a:a+m.end()]
 raise ValueError(name)
extra='''let _mjtrgReturnFocus=null,_projekti=[],_aktivniProjektId=null,_msrRegistry=[],_tragRegistry=[],_tragOn=true,_tragPaused=false;
const _updGpsSwitch=()=>{};
function toggleRecPause(){calls.push('record-pause');document.getElementById('rec-banner').classList.toggle('paused')}
function _krakIzborClose(){document.getElementById('krak-izbor').style.display='none';document.getElementById('krak-izbor-bg').style.display='none'}
'''+ '\n'.join(b.function(n) for n in ['_toggleLocPopup','_izmjeriToggle','toggleMjtrgDropdown','closeMjtrgDropdown','_mjtrgDialogKey','_tragRegVodi','_tragIme'])
html=ex.html.replace('<div id="map">','<div id="map">'+div('rec-banner')).replace('</body>',div('action-bar')+div('mjtrg-sheet-bg')+div('mjtrg-dropdown')+div('krak-izbor-bg')+div('krak-izbor')+div('trag-quick-meta')+'<script>'+extra+'</script></body>')
html=html.replace('</head>','''<style>#main{inset:54px 0 0;height:auto}#action-bar{display:flex}#brec,#brec-nm,#ab-centar,#ab-trag-stats{display:none!important}#ab-pauza{display:flex!important}#rec-parent-row{display:none}#record-control{display:none}#map-ctrl-bar{display:none!important}#action-bar>button{min-height:48px}</style></head>''')
async def main():
 out=ROOT/'outputs/ui-preview';out.mkdir(parents=True,exist_ok=True)
 async with async_playwright() as p:
  browser=await p.chromium.launch(executable_path=os.environ.get('UI_CHROMIUM') or None,args=['--no-sandbox'])
  context=await browser.new_context(offline=True);page=await context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  async def route(r):
   u=r.request.url
   if u=='http://fixture.test/':await r.fulfill(status=200,content_type='text/html',body=html)
   elif '/tile/' in u:await r.fulfill(status=200,content_type='image/svg+xml',body=ex.tile)
   elif u.startswith('http://fixture.test/static/'):
    path=ROOT/u.split('fixture.test/',1)[1];await r.fulfill(status=200,content_type=mimetypes.guess_type(path)[0] or 'application/javascript',body=path.read_bytes())
   elif u.endswith('/forwarder.svg'):await r.fulfill(status=200,content_type='image/svg+xml',body=(ROOT/'forwarder.svg').read_bytes())
   else:await r.abort()
  await page.route('**/*',route);await page.goto('http://fixture.test/');await page.evaluate("document.body.classList.add('ab-on');document.documentElement.style.setProperty('--ab-h',document.getElementById('action-bar').offsetHeight+'px');vodiMeDoTacke(0)")
  for theme in ['day','dark']:
   for w,h in [(320,568),(390,800),(568,320),(800,600)]:
    await page.set_viewport_size({'width':w,'height':h});await page.evaluate('(t)=>document.documentElement.dataset.fieldTheme=t',theme)
    for state in ['normal','record','paused']:
     await page.evaluate('(s)=>{document.getElementById("rec-banner").classList.toggle("show",s!=="normal");document.getElementById("rec-banner").classList.toggle("paused",s==="paused");tick(35)}',state);await page.wait_for_timeout(350)
     nav=await page.locator('#tacka-nav-panel').bounding_box();ab=await page.locator('#action-bar').bounding_box()
     assert nav and nav['y']>=54 and nav['y']+nav['height']<=ab['y']-6,(w,h,state,nav,ab)
     if state!='normal':
      rec=await page.locator('#rec-banner').bounding_box();assert nav['y']+nav['height']<=rec['y']-6,(w,h,state,nav,rec)
     if await page.locator('#explorer-top').is_visible():
      top=await page.locator('#explorer-top').bounding_box();assert top['y']+top['height']+6<=nav['y'],(w,h,state,top,nav)
     assert await page.evaluate('document.getElementById("tacka-nav-panel").scrollWidth<=document.getElementById("tacka-nav-panel").clientWidth')
     await page.locator('#ab-pauza').click();assert await page.evaluate('calls.includes("record-pause")')
     await page.screenshot(path=str(out/f'overlays-237-{theme}-{w}x{h}-{state}.png'))
  await page.set_viewport_size({'width':390,'height':800});await page.evaluate('tick(20)');target=await page.evaluate('Explorer.destination')
  # Nitiži modal mora dobiti čitav dodirni sloj; kamera/cilj se vraćaju tek po zatvaranju.
  for name in ['ab-loc-popup','ab-izmjeri-menu','mjtrg-dropdown','krak-izbor','trag-quick-meta','guide-choice-modal']:
   await page.evaluate('(id)=>document.getElementById(id).style.display="flex"',name);await page.wait_for_timeout(100)
   assert not await page.locator('#tacka-nav-panel').is_visible(),name
   assert not await page.locator('#explorer-top').is_visible(),name
   assert not await page.evaluate('!!document.querySelector(".ex-world")'),name
   assert await page.evaluate('Explorer.destination')==target
   assert await page.evaluate('map.dragging.enabled()'),name
   await page.evaluate('(id)=>document.getElementById(id).style.display="none"',name);await page.wait_for_timeout(350)
   assert await page.locator('#tacka-nav-panel').is_visible(),name
   assert await page.evaluate('Explorer.following'),name
  # Dva otvorena/nested prozora: zatvaranje prvog ne otkriva Explorer ispod drugog.
  await page.evaluate('document.getElementById("krak-izbor").style.display="block";showGuideChoice()');await page.wait_for_timeout(100)
  await page.evaluate('closeGuideChoice()');await page.wait_for_timeout(100);assert not await page.locator('#tacka-nav-panel').is_visible()
  await page.evaluate('_krakIzborClose()');await page.wait_for_timeout(350);assert await page.locator('#tacka-nav-panel').is_visible()
  # Tab/stop ili checkbox ne smiju biti pregazeni zakašnjelim zatvaranjem modala.
  await page.evaluate('showGuideChoice();switchTab("projekat");closeGuideChoice()');await page.wait_for_timeout(350);assert not await page.locator('#tacka-nav-panel').is_visible()
  await page.evaluate('switchTab("karta");Explorer.setExplorerEnabled(false);showGuideChoice();closeGuideChoice()');await page.wait_for_timeout(350)
  assert not await page.locator('#ex-follow').is_checked();assert not await page.evaluate('Explorer.following');assert await page.evaluate('map.dragging.enabled()')
  await page.evaluate('showGuideChoice();stopTackaNav();closeGuideChoice()');await page.wait_for_timeout(350);assert not await page.locator('#tacka-nav-panel').is_visible()
  # Explorer se ne aktivira bez Vodi me; trag ne dobiva lažne tačke/izmjene.
  await page.evaluate('Explorer.setExplorerEnabled(true)');assert not await page.evaluate('Explorer.active');assert not await page.locator('#tacka-nav-panel').is_visible()
  await page.evaluate('_tragRegistry=[{id:"nav",name:"Terenski trag",pts:[[44.89,16],[44.9,16],[44.905,16.01]],visible:false}];window.traceBefore=JSON.stringify(_tragRegistry);_tragRegVodi("nav")');await page.wait_for_timeout(350)
  assert await page.evaluate('Explorer.destination.la===44.9&&Explorer.destination.lo===16&&_tacke.length===2&&JSON.stringify(_tragRegistry)===traceBefore')
  await page.evaluate('stopTackaNav();lastP=null;_tragRegVodi("nav")');assert await page.evaluate('Explorer.destination.la===44.89')
  await page.evaluate('stopTackaNav();_tragRegistry[0].pts=[];_tragRegVodi("nav")');assert not await page.evaluate('Explorer.active')
  assert not errors,errors
  await browser.close();print('Preklapanje: stvarne trake/24 rasporeda/6 prozora, fokus snimanja, obnova cilja i karte — OK')
if __name__=='__main__':asyncio.run(main())
