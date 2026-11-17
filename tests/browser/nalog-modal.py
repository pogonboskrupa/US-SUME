"""Meni v4.7.0: zaglavlje "Meni · ime · ✕" i modal Moj nalog (stvarni HTML/CSS aplikacije)."""
import asyncio,mimetypes,os,re,sys
from pathlib import Path
from playwright.async_api import async_playwright
sys.path.insert(0,str(Path(__file__).parent))
from _izvor import izvor
ROOT=Path(__file__).resolve().parents[2]
source=izvor()
html=re.sub(r'<script\b[^>]*>.*?</script>','',source,flags=re.S)
def fn(name):
 m=re.search(r'(?:async )?function '+re.escape(name)+r'\(',source);i=m.start();d=0;j=source.index('{',m.end())
 k=j
 while True:
  c=source[k]
  if c=='{':d+=1
  elif c=='}':
   d-=1
   if d==0:break
  k+=1
 return source[i:k+1]
names=['promijeniPin','_nalogInicijali','_nalogEl','_nalogPoruka','_nalogOffline','nalogOtvori','nalogZatvori','nalogPinPrikazi','nalogSacuvajIme','nalogSacuvajPin','urediImePrezime','_menuIdentityRender','closeMenuDropdown','_nalogPripadnostPripremi','nalogSacuvajPripadnost','_jeTerenski','_pripSumarije','_pripadnostOpcije','_pripadnostGreska','_escHtml']
esc=re.search(r"document\.addEventListener\('keydown', e => \{ if \(e\.key === 'Escape' && _nalogEl.*?\}\);",source)[0]
js='''let sbUser={id:'U1'},sbProfile={id:'U1',ime:'Emina',prezime:'Projektant',sumarija:'Bos.Krupa'},APP_VER='v-test',calls=[];
const showToast=t=>calls.push(t),SpdProfile={sync(){}},isVodeci=()=>false,isSpdField=()=>false,_OL={save(){},PROFILE:'p'},_SAVED_USER_KEY='k',_loadSavedUser=()=>null,_primijeniUlogeUI=()=>{},_withTimeout=(p)=>p,_offCredSpremi=async()=>{};
const _SUMARIJE=['ŠPD US ŠUME','ŠUMARIJA CAZIN','ŠUMARIJA KLJUČ'],_profileSave=()=>{};
const sb={rpc:async(n,a)=>{calls.push('rpc:'+n+':'+('p_sumarija' in a?a.p_sumarija:a.p_ime+' '+a.p_prezime));return {error:null}},auth:{updateUser:async o=>{calls.push('pin:'+o.password);return {error:null}}}};
'''+'\n'.join(fn(n) for n in names)+'''
'''+esc+'''
document.getElementById('auth-screen').style.display='none';
document.getElementById('wrapper').style.display='flex';
'''
html=html.replace('</body>','<script>'+js+'</script></body>')
async def main():
 out=ROOT/'outputs/ui-preview';out.mkdir(parents=True,exist_ok=True)
 async with async_playwright() as p:
  browser=await p.chromium.launch(executable_path=os.environ.get('UI_CHROMIUM') or None,args=['--no-sandbox']);errors=[]
  for w,h,tema in [(360,740,'night'),(360,740,'day'),(768,900,'night')]:
   ctx=await browser.new_context(viewport={'width':w,'height':h},offline=False);page=await ctx.new_page()
   page.on('pageerror',lambda e:errors.append(str(e)))
   async def route(r):
    u=r.request.url
    if u=='http://fixture.test/':await r.fulfill(status=200,content_type='text/html',body=html)
    elif u.startswith('http://fixture.test/'):
     path=ROOT/u.split('fixture.test/',1)[1].split('?',1)[0]
     if path.is_file():await r.fulfill(status=200,content_type=mimetypes.guess_type(path)[0] or 'application/octet-stream',body=path.read_bytes())
     else:await r.fulfill(status=404,body='x')
    else:await r.abort()
   await page.route('**/*',route);await page.goto('http://fixture.test/')
   await page.evaluate("document.documentElement.dataset.fieldTheme='%s'"%tema)
   await page.evaluate("document.getElementById('menu-dropdown').style.display='flex';_menuIdentityRender()")
   top=await page.locator('.mdrop-top').inner_text();assert 'Meni' in top and 'Emina Projektant' in top,top
   for zabranjeno in ['Alati','projekti i aplikacija']:assert zabranjeno not in top,top
   assert await page.locator('#menu-user-ini').inner_text()=='EP'
   b=await page.locator('.mdrop-top').bounding_box();x=await page.locator('.mdrop-x').bounding_box()
   assert x['x']+x['width']>=b['x']+b['width']-16,(x,b)  # ✕ skroz desno
   u=await page.locator('#menu-user-btn').bounding_box();assert u['x']+u['width']<=x['x']+1 and u['height']>=44,u
   assert await page.locator('#menu-dropdown').evaluate('e=>e.scrollWidth<=e.clientWidth+1')
   await page.screenshot(path=str(out/f'nalog-meni-{w}-{tema}.png'))
   await page.locator('#menu-user-btn').click()
   assert await page.locator('#nalog-modal').is_visible() and not await page.locator('#menu-dropdown').is_visible()
   assert await page.locator('#nalog-ime').input_value()=='Emina' and await page.locator('#nalog-prezime').input_value()=='Projektant'
   assert (await page.locator('#nalog-uloga').inner_text()).startswith('Projektant')
   assert await page.locator('#nalog-offline').is_hidden()
   # ime: validacija i čuvanje
   await page.fill('#nalog-ime','A');await page.click('#nalog-ime-btn');assert 'bar 2' in await page.locator('#nalog-ime-msg').inner_text()
   await page.fill('#nalog-ime','Amra');await page.fill('#nalog-prezime','Hodžić');await page.click('#nalog-ime-btn');await page.wait_for_function("document.getElementById('nalog-ime-msg').dataset.stanje==='ok'")
   assert 'rpc:promijeni_svoje_ime:Amra Hodžić' in await page.evaluate('calls')
   assert await page.locator('#nalog-ini').inner_text()=='AH' and await page.locator('#menu-user-ini').inner_text()=='AH'
   # PIN
   await page.fill('#nalog-pin1','12');await page.click('#nalog-pin-btn');assert '4–6' in await page.locator('#nalog-pin-msg').inner_text()
   await page.fill('#nalog-pin1','1234');await page.fill('#nalog-pin2','9999');await page.click('#nalog-pin-btn');assert 'poklapaju' in await page.locator('#nalog-pin-msg').inner_text()
   assert not any(c.startswith('pin:') for c in await page.evaluate('calls'))
   await page.fill('#nalog-pin2','1234');await page.click('#nalog-pin-btn');await page.wait_for_function("document.getElementById('nalog-pin-msg').dataset.stanje==='ok'")
   assert 'pin:123400' in await page.evaluate('calls');assert await page.locator('#nalog-pin1').input_value()==''
   await page.click('#nalog-pin-prikazi');assert await page.locator('#nalog-pin1').evaluate('e=>!e.classList.contains("pin-maska")')
   # Pripadnost šumariji: projektant je ne vidi, terenski profil bira i čuva
   assert await page.locator('#nalog-prip-kartica').is_hidden()
   await page.evaluate("sbProfile.sumarija='ŠPD US ŠUME';nalogZatvori();nalogOtvori()")
   assert await page.locator('#nalog-prip-kartica').is_visible()
   opc=await page.locator('#nalog-prip option').all_inner_texts();assert opc==['— nije odabrano —','ŠUMARIJA CAZIN','ŠUMARIJA KLJUČ'],opc
   await page.select_option('#nalog-prip','ŠUMARIJA CAZIN');await page.click('#nalog-prip-btn');await page.wait_for_function("document.getElementById('nalog-prip-msg').dataset.stanje==='ok'")
   assert 'rpc:postavi_svoju_pripadnost:ŠUMARIJA CAZIN' in await page.evaluate('calls') and await page.evaluate('sbProfile.pripadnost')=='ŠUMARIJA CAZIN'
   await page.evaluate("sbProfile.sumarija='Bos.Krupa'")
   sh=await page.locator('.nalog-sheet').bounding_box();assert sh['x']>=-1 and sh['x']+sh['width']<=w+1,sh
   await page.screenshot(path=str(out/f'nalog-modal-{w}-{tema}.png'))
   # offline traka i zatvaranje
   await ctx.set_offline(True);await page.evaluate("Object.defineProperty(navigator,'onLine',{get:()=>false,configurable:true});nalogZatvori();nalogOtvori()")
   assert await page.locator('#nalog-offline').is_visible()
   await page.click('#nalog-ime-btn');assert 'internet' in await page.locator('#nalog-ime-msg').inner_text()
   await page.keyboard.press('Escape');assert await page.locator('#nalog-modal').is_hidden()
   await ctx.close()
  assert not errors,errors
  await browser.close();print('Meni: zaglavlje bez podnaslova, ime→modal, ime/PIN validacija i čuvanje, offline, 3 prikaza — OK')
if __name__=='__main__':asyncio.run(main())
