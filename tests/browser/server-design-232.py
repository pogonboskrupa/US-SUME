"""Pošalji na server: oba smjera, projekti/autori, tri akcenta i mala/dnevna tema."""
import asyncio,importlib.util,mimetypes,os
from pathlib import Path
from playwright.async_api import async_playwright
spec=importlib.util.spec_from_file_location('base',Path(__file__).with_name('menu-tools.py'));b=importlib.util.module_from_spec(spec);spec.loader.exec_module(b)
async def main():
 b.OUT.mkdir(parents=True,exist_ok=True)
 async with async_playwright() as p:
  browser=await p.chromium.launch(headless=True,**({'executable_path':os.environ['UI_CHROMIUM']} if os.environ.get('UI_CHROMIUM') else {}));page=await browser.new_page(viewport={'width':390,'height':800});errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  async def route(r):
   if r.request.url=='https://ui.test/':await r.fulfill(content_type='text/html',body=b.fixture)
   elif r.request.url.startswith('https://ui.test/'):
    f=b.ROOT/r.request.url.split('ui.test/',1)[1].split('?',1)[0]
    if f.is_file():await r.fulfill(content_type=mimetypes.guess_type(str(f))[0] or 'application/octet-stream',body=f.read_bytes())
    else:await r.fulfill(status=404,body='fixture')
   else:await r.abort()
  await page.route('**/*',route);await page.goto('https://ui.test/');assert not errors,errors
  await page.evaluate('''()=>{
    _serverProjektPreuzeto('P',[{id:'T1',nm:'T1',pts:fixturePoints,korisnik_id:'B',projektant_ime:'Amir Kolega'}]);
    _serverProjektPreuzeto('Q',[{id:'T3',nm:'T3',pts:fixturePoints,korisnik_id:'B',projektant_ime:'Amir Kolega'}]);
    _serverDozReceived('D',[{id:'zone',name:'Pojas 3',user_id:'C'}],[{user_id:'C'},{user_id:'C'}],[{user_id:'C',_korisnik:{ime:'Adnan',prezime:'Projektant'}}],'A');
    _serverSaljem=true;_serverTransferConfirmed(fixtureQueue[0],'A');_serverTransferConfirmed(fixtureQueue[1],'A');_serverSaljem=false;openSyncQueuePanel();
  }''')
  for theme in ['day','dark']:
   for w,h in [(320,568),(390,800),(568,320)]:
    await page.set_viewport_size({'width':w,'height':h});await page.evaluate('t=>document.documentElement.dataset.fieldTheme=t',theme)
    for tab in ['received','sent','send']:
     await page.evaluate('t=>_tabServer(t)',tab)
     # Ukupna širina i primarno dugme ostaju upotrebljivi i u landscape-u.
     dims=await page.locator('#syncq-panel').evaluate('(e)=>{const r=e.getBoundingClientRect();return {top:r.top,bottom:r.bottom,width:e.clientWidth,scroll:e.scrollWidth}}')
     assert dims['top']>=-1 and dims['bottom']<=h+1 and dims['scroll']<=dims['width'],dims
     assert await page.locator('#syncq-posalji').is_visible()
     if tab in ['received','sent']:
      await page.locator('#server-'+tab+'-items details').first.evaluate('(e)=>e.open=true')
      await page.locator('#data-server-'+tab).scroll_into_view_if_needed()
      item=await page.locator('#server-'+tab+'-items .sp-transfer-item').first.inner_text()
      assert 'Projekat' in item and ('Adnan Projektant' in item or 'Amir Kolega' in item if tab=='received' else 'Emina Projektant' in item),item
      assert await page.locator('#server-'+tab+'-items .sp-direction-badge').first.is_visible()
     await page.screenshot(path=str(b.OUT/f'server-232-{tab}-{theme}-{w}.png'))
    palette=await page.locator('#data-server-tabs').evaluate('(e)=>[...e.children].map(b=>getComputedStyle(b).color)');assert len(set(palette))==3,palette
  await page.evaluate("_tabServer('received');_serverTransferGroup('day')")
  assert 'Projektant' in await page.locator('#server-received-items').inner_text()
  assert not errors,errors;await browser.close()
 print('OK: novi Server, projekti/autori u oba smjera, tri boje, dani, 320px/landscape/day/dark; 18 PNG')
if __name__=='__main__':asyncio.run(main())
