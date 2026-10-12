"""Puni app pod CPU 6x i Android profilom od 4 GB: paneli i karta ostaju nacrtani."""
import asyncio,mimetypes,os
from pathlib import Path
from playwright.async_api import async_playwright

ROOT=Path(__file__).resolve().parents[2]

async def main():
 out=ROOT/'outputs/289';out.mkdir(parents=True,exist_ok=True)
 async with async_playwright() as p:
  browser=await p.chromium.launch(headless=True,executable_path=os.environ.get('UI_CHROMIUM') or None)
  ctx=await browser.new_context(service_workers='block',viewport={'width':360,'height':740},device_scale_factor=3)
  await ctx.add_init_script("""
   Object.defineProperty(navigator,'deviceMemory',{get:()=>4,configurable:true});
   Object.defineProperty(navigator,'hardwareConcurrency',{get:()=>4,configurable:true});
   window.AndroidDevice={status:()=>JSON.stringify({manufacturer:'TEST',memoryGb:4,availableMemoryGb:1.1,lowRam:false})};
   Object.defineProperty(navigator,'onLine',{get:()=>false,configurable:true});
   const uid='11111111-1111-4111-8111-111111111111';
   localStorage.setItem('tvlake_ol_profile',JSON.stringify({ts:Date.now(),data:{id:uid,odobren:true,sumarija:'TEST',ime:'Sporiji',prezime:'Telefon'}}));
   localStorage.setItem('tvlake_device_last_user',uid);
  """)
  errors=[];page=await ctx.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
  async def route(r):
   url=r.request.url
   if not url.startswith('http://slow.test/'):
    await r.abort();return
   name=url.split('slow.test/',1)[1].split('?',1)[0] or 'index.html';f=ROOT/name
   if f.is_file():await r.fulfill(content_type=mimetypes.guess_type(str(f))[0] or 'application/octet-stream',body=f.read_bytes())
   else:await r.fulfill(status=404,body='local test')
  await ctx.route('**/*',route);await ctx.route_web_socket('**/*',lambda ws:ws.close())
  cdp=await ctx.new_cdp_session(page);await cdp.send('Emulation.setCPUThrottlingRate',{'rate':6})
  await page.goto('http://slow.test/');await page.wait_for_function("_startupRestore._done&&window.DendroRender&&typeof map!=='undefined'")
  await page.evaluate("""()=>{
   sbUser={id:'11111111-1111-4111-8111-111111111111'};
   sbProfile={id:sbUser.id,odobren:true,sumarija:'TEST',ime:'Sporiji',prezime:'Telefon'};_revealApp();
   const list=document.getElementById('vl');list.innerHTML=Array.from({length:60},(_,i)=>'<div class="vrow"><div class="vcard-info"><div class="vcard-name">T'+(i+1)+'</div><div class="vcard-sub">Test prikaza · '+(100+i)+' m</div></div></div>').join('');
  }""")
  profile=await page.evaluate("""()=>({
   dataset:document.documentElement.dataset.renderProfile,mode:DendroRender.state.mode,
   zoom:map.options.zoomAnimation,base:Object.values(TL).map(x=>x.options.keepBuffer),
   overlays:Object.values(_OVL).map(x=>x.options.keepBuffer),cache:_SQL_TILE_BMP_MAX,
   content:getComputedStyle(document.querySelector('.vrow')).contentVisibility
  })""")
  assert profile['dataset']=='lite' and profile['mode']=='lite',profile
  assert profile['zoom'] is False and max(profile['base'])==2 and max(profile['overlays'])==1,profile
  assert profile['cache']==72 and profile['content']=='visible',profile
  for tab in ['projekat','vlake','doznaka','karta']:
   await page.evaluate('(t)=>switchTab(t)',tab);await page.wait_for_timeout(120)
   assert await page.locator('#wrapper').is_visible()
   assert await page.evaluate("""()=>{const w=document.getElementById('wrapper').getBoundingClientRect();return w.width>300&&w.height>600&&getComputedStyle(document.getElementById('wrapper')).opacity==='1'}""")
  await page.evaluate('toggleMenuDropdown()');await page.wait_for_timeout(120)
  assert await page.locator('#menu-dropdown').is_visible()
  assert await page.evaluate("getComputedStyle(document.querySelector('#menu-dropdown')).backdropFilter==='none'")
  await page.evaluate('closeMenuDropdown()')
  pressure=await page.evaluate("""async()=>{
   for(let i=0;i<100;i++){const c=document.createElement('canvas');c.width=c.height=256;_sqlTileBmpCache.set('stress/'+i,c);}
   let released=0;const queued=()=>{};queued._odustani=()=>released++;_mainTileQueue.push(queued);_wTileStack.push(queued);
   DendroRender.pressure(15);await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
   const mapBox=document.getElementById('map').getBoundingClientRect(),bar=document.getElementById('tab-bar').getBoundingClientRect();
   // Vidljive pločice u redu NE smiju biti odbačene (ostale bi prazne do pomaka karte).
   const kept=_mainTileQueue.includes(queued)&&_wTileStack.includes(queued);
   for(const q of [_mainTileQueue,_wTileStack]){const i=q.indexOf(queued);if(i>=0)q.splice(i,1);}
   return {cache:_sqlTileBmpCache.size,max:_SQL_TILE_BMP_MAX,main:_MAIN_TILE_MAX_INFLIGHT,worker:_W_TILE_MAX_INFLIGHT,released,kept,map:[mapBox.width,mapBox.height],bar:[bar.width,bar.height],opacity:getComputedStyle(document.getElementById('wrapper')).opacity};
  }""")
  assert pressure['cache']==0 and pressure['max']==48 and pressure['main']<=3 and pressure['worker']<=2,pressure
  assert pressure['released']==0 and pressure['kept'] and min(pressure['map'])>300 and pressure['bar'][0]>300 and pressure['bar'][1]>40 and pressure['opacity']=='1',pressure
  await page.screenshot(path=str(out/'slow-phone-stable.png'),full_page=True)
  assert not errors,errors
  await browser.close()
 print('PASS: puni app CPU 6x / 4 GB profil, paneli + karta, smanjeni tile budžet i Android memory-pressure oporavak')

if __name__=='__main__':asyncio.run(main())
