"""Stvarni login gate/provjera/probni timer; kontrolisani server, bez produkcijskih poziva."""
import asyncio,importlib.util,os
from pathlib import Path
from playwright.async_api import async_playwright
ROOT=Path(__file__).resolve().parents[2]
spec=importlib.util.spec_from_file_location('b',Path(__file__).with_name('menu-tools.py'));b=importlib.util.module_from_spec(spec);spec.loader.exec_module(b)
body=b.section('<div id="auth-pending-form"','<div class="auth-card-foot"')
js='''let sbUser={id:'self'},sbProfile=null,_appEntered=false,_accessTrialStop=null,calls=[],recOn=true,recPaused=false,_tragOn=true,_tragPaused=false,_dozGpsOn=true,_dozGpsPaused=false;
const work={vlake:[{id:'t1'}],tragovi:[{id:'r1'}]};let serverProfile=null;
const sb={from:()=>({select:()=>({eq:()=>({single:async()=>({data:serverProfile,error:null})})})}),rpc:()=>{calls.push('unsafe-rpc');throw Error('Stari RPC ne smije biti pozvan')}};
const _authNaslov=()=>{},showToast=t=>calls.push(t),_checkDeviceUserSwitch=async()=>{},_setOfflineMode=()=>{},_profileSave=p=>calls.push('profile'),
_revealApp=()=>{document.getElementById('wrapper').hidden=false;calls.push('enter')},_startupRestore=()=>{_appEntered=true},_showAuthScreen=()=>document.getElementById('wrapper').hidden=true,
toggleRecPause=()=>{recPaused=true;calls.push('pause-vlaka')},togTragPause=()=>{_tragPaused=true;calls.push('pause-trag')},dozPauseGPS=()=>{_dozGpsPaused=true;calls.push('pause-doznaka')},stopTackaNav=()=>calls.push('stop-nav');
'''+ '\n'.join(b.function(n) for n in ['showApp','authShowPending','_authRecheck','_accessTrialArm','_registracijaIstekla'])
html='<html><head><meta charset="utf-8"><script src="/access-policy.js"></script></head><body><div id="auth-login-form"></div><div id="auth-reg-form"></div><div id="auth-err"></div>'+body+'<div id="wrapper" hidden>APP</div><script>'+js+'</script></body></html>'
async def main():
 async with async_playwright() as p:
  browser=await p.chromium.launch(executable_path=os.environ.get('UI_CHROMIUM') or None,args=['--no-sandbox']);context=await browser.new_context(offline=True);page=await context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  async def route(r):
   await r.fulfill(status=200,content_type='application/javascript' if r.request.url.endswith('.js') else 'text/html',body=(ROOT/'static/js/access-policy.js').read_text() if r.request.url.endswith('.js') else html)
  await page.route('**/*',route);await page.goto('http://fixture.test/')
  await page.evaluate('sbProfile={id:"self",odobren:false,is_admin:false,prvo_odobren_at:null,probni_do:new Date(Date.now()+1200).toISOString()};serverProfile=sbProfile;window.snapshot=JSON.stringify(work);showApp()')
  await page.wait_for_function('!document.getElementById("wrapper").hidden');assert await page.evaluate('calls.includes("enter")')
  await page.wait_for_function('document.getElementById("wrapper").hidden',timeout=2500)
  assert await page.locator('#auth-pending-form').is_visible();assert await page.evaluate('calls.includes("pause-vlaka")&&calls.includes("pause-trag")&&calls.includes("pause-doznaka")&&JSON.stringify(work)===snapshot&&sbUser.id==="self"')
  assert 'zahtjev' in (await page.locator('#auth-pending-form').inner_text()).lower();assert 'nalog se briše' not in await page.locator('#auth-pending-form').inner_text()
  await page.evaluate('serverProfile={...sbProfile,odobren:true,prvo_odobren_at:new Date().toISOString()};_authRecheck()')
  await page.wait_for_function('!document.getElementById("wrapper").hidden');assert not await page.evaluate('calls.includes("unsafe-rpc")')
  assert await page.evaluate('JSON.stringify(work)===snapshot&&sbUser.id==="self"&&recPaused&&_tragPaused&&_dozGpsPaused')
  await page.evaluate('sbProfile={...serverProfile,odobren:false,probni_do:new Date(Date.now()+86400000).toISOString()};serverProfile=sbProfile;showApp()')
  await page.wait_for_function('document.getElementById("wrapper").hidden');assert await page.locator('#auth-pending-form').is_visible()
  await page.evaluate('_registracijaIstekla()');assert await page.evaluate('sbUser.id==="self"&&JSON.stringify(work)===snapshot')
  assert not errors,errors
  await browser.close();print('Probni pristup: stvarni gate/timer/provjera, pauza bez brisanja, adminovo odobrenje/opoziv — OK')
if __name__=='__main__':asyncio.run(main())
