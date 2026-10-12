"""Stvarni modal i tabovi zapisa: mali ekrani, offline, fokus i navigacija."""
import asyncio, importlib.util, os
from pathlib import Path
from playwright.async_api import async_playwright
ROOT=Path(__file__).resolve().parents[2]
spec=importlib.util.spec_from_file_location('fixture_tools',ROOT/'tests/browser/menu-tools.py')
f=importlib.util.module_from_spec(spec);spec.loader.exec_module(f)
body=f.section('<div id="mjtrg-sheet-bg"','<!-- OFFLINE MODAL -->')
js='''let _mjtrgReturnFocus=null,_aktivniProjektId='p',_projekti=[{id:'p',odjel:'107',gj:'Grmeč'}];
let _msrRegistry=[{id:'m1'}],_tragRegistry=[{id:'t1'},{id:'t2'}],_tragOn=true,_tragPaused=false;
let _tragoviTab='trg',_TV_TAB_KEY='fixture_tab',calls=[];
const switchTab=t=>{calls.push(['tab',t]);document.getElementById('records').hidden=t!=='tragovi'},
_msrSetMode=t=>calls.push(['mode',t]),_mjtrgTab=t=>calls.push(['pane',t]);
function _tragoviRender(){document.getElementById('trg-pane').hidden=_tragoviTab!=='trg';document.getElementById('msr-pane').hidden=_tragoviTab!=='msr'}
'''+ '\n'.join(f.function(n) for n in ['toggleMjtrgDropdown','closeMjtrgDropdown','_mjtrgDialogKey','_mjtrgSaved','_tragoviSetTab'])
html='<html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>'+f.styles+'</style></head><body><button id="menu-btn" onclick="toggleMjtrgDropdown()">Mjerenja i tragovi</button>'+body+'<div id="records" hidden><div id="trg-pane">Tragovi</div><div id="msr-pane" hidden>Mjerenja</div></div><script>'+js+'</script></body></html>'
async def main():
 out=ROOT/'outputs/ui-preview';out.mkdir(parents=True,exist_ok=True)
 async with async_playwright() as p:
  browser=await p.chromium.launch(executable_path=os.environ.get('UI_CHROMIUM') or None,args=['--no-sandbox'])
  context=await browser.new_context(offline=True)
  page=await context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  await page.route('**/*',lambda r:r.fulfill(status=200,content_type='text/html',body=html))
  await page.goto('http://fixture.test/')
  for theme in ['day','dark']:
   for w,h in [(320,568),(390,800),(568,320),(800,600)]:
    await page.set_viewport_size({'width':w,'height':h})
    await page.evaluate('(t)=>document.documentElement.dataset.fieldTheme=t',theme)
    await page.locator('#menu-btn').click()
    assert await page.locator('#mjtrg-dropdown').is_visible()
    assert await page.locator('#mjtrg-project').inner_text()=='Odjel 107 · Grmeč'
    assert await page.locator('#mjtrg-msr-count').inner_text()=='1'
    assert await page.locator('#mjtrg-trg-count').inner_text()=='2'
    assert await page.locator('#mjtrg-rec-status').is_visible()
    b=await page.locator('#mjtrg-dropdown').bounding_box();assert b['x']>=0 and b['y']>=0 and b['x']+b['width']<=w and b['y']+b['height']<=h,b
    assert await page.evaluate('document.querySelector(".mt-body").scrollWidth<=document.querySelector(".mt-body").clientWidth')
    heights=await page.locator('#mjtrg-dropdown button').evaluate_all('(bs)=>bs.map(b=>b.getBoundingClientRect().height)');assert min(heights)>=44,heights
    await page.screenshot(path=str(out/f'measurements-235-{theme}-{w}x{h}.png'))
    await page.locator('#mjtrg-close').focus();await page.keyboard.press('Shift+Tab')
    assert await page.evaluate('document.activeElement===document.querySelector(".mt-foot button")')
    await page.keyboard.press('Tab');assert await page.locator('#mjtrg-close').evaluate('(e)=>document.activeElement===e')
    await page.keyboard.press('Escape');assert not await page.locator('#mjtrg-dropdown').is_visible()
    assert await page.locator('#menu-btn').evaluate('(e)=>document.activeElement===e')
  assert await page.evaluate('_msrRegistry.length===1 && _tragRegistry.length===2 && _tragOn===true && !_tragPaused')
  await page.set_viewport_size({'width':390,'height':800})
  for i,mode in enumerate(['dist','area','nagib',None]):
   await page.evaluate('calls=[]');await page.locator('#menu-btn').click();await page.locator('.mt-tool').nth(i).click()
   expected=([['mode',mode]] if mode else [])+[['tab','mjtrg'],['pane','msr' if mode else 'trg']]
   assert await page.evaluate('calls')==expected
   assert not await page.locator('#mjtrg-sheet-bg').is_visible()
  for i,tab in enumerate(['msr','trg']):
   await page.locator('#menu-btn').click();await page.locator('.mt-saved button').nth(i).click()
   assert await page.locator('#records').is_visible()
   assert await page.locator('#'+tab+'-pane').is_visible()
   assert await page.evaluate('localStorage.getItem(_TV_TAB_KEY)')==tab
  await page.evaluate('''_projekti[0].gj='<img src=x onerror=alert(1)>'+ 'a'.repeat(200);_tragPaused=true;''')
  await page.locator('#menu-btn').click();assert await page.locator('#mjtrg-project img').count()==0
  assert await page.locator('#mjtrg-rec-status').inner_text()=='Snimanje traga pauzirano'
  assert await page.evaluate('document.querySelector(".mt-body").scrollWidth<=document.querySelector(".mt-body").clientWidth')
  await page.locator('#mjtrg-close').click()
  await page.evaluate('_aktivniProjektId=null;_msrRegistry=[];_tragRegistry=[];_tragOn=false')
  await page.locator('#menu-btn').click()
  assert await page.locator('#mjtrg-project').inner_text()=='Nema aktivnog projekta'
  assert await page.locator('#mjtrg-msr-count').inner_text()=='0'
  assert not await page.locator('#mjtrg-rec-status').is_visible()
  await page.locator('#mjtrg-sheet-bg').click(position={'x':1,'y':1})
  assert not await page.locator('#mjtrg-dropdown').is_visible()
  assert await page.evaluate('_msrRegistry.length+_tragRegistry.length')==0
  assert not errors,errors
  await browser.close()
  print('Mjerenja: 8 pregleda, offline, 4 alata, 2 registra, duži nazivi, brojači, tastatura i zatvaranje — OK')
if __name__=='__main__':asyncio.run(main())
