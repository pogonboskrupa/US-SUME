"""Stvarni PNG/Cache Storage, bez produkcijskih servisa."""
import asyncio,importlib.util,mimetypes,os,json,struct,zlib
from pathlib import Path
from playwright.async_api import async_playwright
spec=importlib.util.spec_from_file_location('base',Path(__file__).with_name('menu-tools.py'));b=importlib.util.module_from_spec(spec);spec.loader.exec_module(b)
functions='\n'.join(b.function(n) for n in ['_getTerrariumTile','_terrariumDecodeTile','_nvDemOcitaj'])
setup='''
let online=true;
const map=L.map('map').setView([44.815,15.868],16),_TERR_CACHE='fixture-dem-232',_mrezaProbaj=()=>online,_fetchT=(u,t,o)=>fetch(u,o);
'''+functions
fixture='<html><head><link rel="stylesheet" href="/static/libs/leaflet.min.css"></head><body><div id="map" style="height:600px"></div><script src="/static/libs/leaflet.min.js"></script><script src="/static/js/dem-quality.js"></script><script>'+setup+'</script></body></html>'

def chunk(kind,data):return struct.pack('>I',len(data))+kind+data+struct.pack('>I',zlib.crc32(kind+data)&0xffffffff)
raw=bytearray()
for y in range(256):
 raw.append(0)
 for x in range(256):raw.extend((129,194,0,0) if (x,y)==(128,128) else (0,0,0,255) if (x,y)==(129,128) else (129,194,0,255))
png=b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('>IIBBBBB',256,256,8,6,0,0,0))+chunk(b'IDAT',zlib.compress(raw))+chunk(b'IEND',b'')

async def main():
 b.OUT.mkdir(parents=True,exist_ok=True)
 async with async_playwright() as p:
  browser=await p.chromium.launch(headless=True,**({'executable_path':os.environ['UI_CHROMIUM']} if os.environ.get('UI_CHROMIUM') else {}));page=await browser.new_page(viewport={'width':390,'height':800});errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  async def route(r):
   url=r.request.url
   if url=='https://ui.test/':await r.fulfill(content_type='text/html',body=fixture)
   elif url.startswith('https://ui.test/'):
    f=b.ROOT/url.split('ui.test/',1)[1].split('?',1)[0]
    if f.is_file():await r.fulfill(content_type=mimetypes.guess_type(str(f))[0] or 'application/octet-stream',body=f.read_bytes())
    else:await r.fulfill(status=404,body='fixture')
   elif '/query?' in url:
    await r.fulfill(content_type='application/json',body=json.dumps({'features':[{'attributes':{'SRC_DATE':20190114,'SRC_RES':.31,'SAMP_RES':.3,'NICE_DESC':'Vantor','DrawOrder':80}}]}))
   elif url.startswith('https://s3.amazonaws.com/') or url.startswith('https://tiles.test/'):await r.fulfill(content_type='image/png',body=png)
   else:await r.abort()
  await page.route('**/*',route);await page.goto('https://ui.test/')
  value=await page.evaluate('''async()=>{const src=await _getTerrariumTile(12,1,1),data=_terrariumDecodeTile(src);src.close();return {height:data[0],hole:Number.isNaN(data[128*256+128]),sentinel:Number.isNaN(data[128*256+129]),sample:_nvDemOcitaj(data,.5/256,.5/256,0,0)};}''')
  assert value=={'height':450,'hole':True,'sentinel':True,'sample':450},value
  # Oštećen keš uklanja se i popravlja; kvota ne sprečava online prikaz.
  await page.evaluate("async()=>{const c=await caches.open(_TERR_CACHE);await c.put('https://s3.amazonaws.com/elevation-tiles-prod/terrarium/12/2/1.png',new Response('broken',{headers:{'Content-Type':'image/png'}}));}")
  assert await page.evaluate("async()=>{const a=await _getTerrariumTile(12,2,1);const ok=!!a;a?.close();return ok;}")
  await page.evaluate("()=>{window.oldPut=Cache.prototype.put;Cache.prototype.put=async()=>{throw new DOMException('quota','QuotaExceededError')};}")
  assert await page.evaluate("async()=>{const a=await _getTerrariumTile(12,3,1);const ok=!!a;a?.close();return ok;}")
  await page.evaluate('Cache.prototype.put=oldPut;online=false')
  assert await page.evaluate("async()=>{const a=await _getTerrariumTile(12,1,1);const ok=!!a;a?.close();return ok;}")
  assert await page.evaluate('async()=>await _getTerrariumTile(12,9,9)===null')
  assert not errors,errors;await browser.close()
 print('OK: stvarni Terrarium PNG, transparentni/NoData pikseli, popravka keša, kvota, offline')
if __name__=='__main__':asyncio.run(main())
