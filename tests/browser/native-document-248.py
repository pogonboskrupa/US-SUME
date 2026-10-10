"""Real app/Worker/sql.js read-only VFS; controlled Android bridge and binary FD endpoint."""
import asyncio,json,mimetypes,os,shutil,tempfile,time
from pathlib import Path
from urllib.parse import urlparse
from playwright.async_api import async_playwright
ROOT=Path(__file__).resolve().parents[2];ORIGIN='http://localhost:8788';ID='12345678-1234-1234-1234-123456789abc'
async def main():
 with tempfile.TemporaryDirectory() as tmp:
  file=Path(tmp)/'native-source.sqlitedb';shutil.copyfile(ROOT/'tests/fixtures/rmaps-mini.sqlitedb',file)
  with file.open('r+b') as f:f.truncate(1_500_000_000)
  async with async_playwright() as p:
   ctx=await p.chromium.launch_persistent_context(str(Path(tmp)/'profile'),executable_path=os.environ.get('UI_CHROMIUM') or None,args=['--no-sandbox'],offline=True,service_workers='block',viewport={'width':390,'height':800})
   page=await ctx.new_page();errors=[];reads=[];page.on('pageerror',lambda e:errors.append(str(e)))
   async def route(r):
    if not r.request.url.startswith(ORIGIN+'/'):await r.abort();return
    name=urlparse(r.request.url).path.lstrip('/') or 'index.html';path=ROOT/name
    if name.startswith('offline-maps/'):
     parts=name.split('/');assert parts[1]==ID and parts[2]=='read';at,n=map(int,parts[3:]);assert 0<n<=65536
     with file.open('rb') as f:f.seek(at);data=f.read(n)
     reads.append((at,len(data)));await r.fulfill(content_type='application/octet-stream',body=data)
    elif name=='GRANICE.kml':await r.fulfill(content_type='application/xml',body='<kml xmlns="http://www.opengis.net/kml/2.2"><Document/></kml>')
    elif path.is_file():await r.fulfill(content_type=mimetypes.guess_type(path)[0] or 'application/octet-stream',body=path.read_bytes())
    else:await r.fulfill(status=404,body='fixture')
   await ctx.route('**/*',route)
   await ctx.add_init_script("window.AndroidOfflineMaps={preparePicker(){},request(id,text){const m=JSON.parse(text);queueMicrotask(()=>NativeOfflineMaps.reply(id,{ok:true,fmt:'native-pages',meta:{_nativeId:m.nativeId,_nativePages:true,_nativeCopy:false,_nativeSize:1500000000}}));}}")
   await page.goto(ORIGIN+'/');await page.wait_for_function("document.readyState==='complete'&&NativeOfflineMaps.available()")
   await page.evaluate("_revealApp();switchTab('karta');window.fieldBefore=JSON.stringify([vlake,_tacke,_tragRegistry]);openLoadMapScreen();loadmapHandleFiles([{name:'uvezena.sqlitedb',size:1500000000,nativeId:'"+ID+"'}]);void 0")
   await page.wait_for_function("_loadmapPending.length===1&&!document.getElementById('loadmap-confirm').disabled")
   start=time.monotonic();await page.locator('#loadmap-confirm').click();await page.wait_for_function("_sqlLayers.some(l=>l.name==='uvezena'&&l.saved&&l.meta._nativePages)")
   opened=round((time.monotonic()-start)*1000)
   await page.evaluate("window.tileOK=false;_sqlWCall({type:'tile',name:'uvezena',z:13,x:4463,y:2940}).then(r=>tileOK=!!r.data&&r.data[0]===137);void 0");await page.wait_for_function('tileOK')
   assert await page.evaluate("_sqlImports.size===0&&JSON.stringify([vlake,_tacke,_tragRegistry])===fieldBefore&&JSON.parse(localStorage.getItem(_LASTMAP_KEY)).nativeId==='"+ID+"'")
   await page.reload();await page.wait_for_function("document.readyState==='complete'&&typeof fieldBefore==='undefined'&&NativeOfflineMaps.available()")
   await page.evaluate("_revealApp();switchTab('karta');sqlmapRestoreAll();void 0");await page.wait_for_function("_sqlLayers.some(l=>l.name==='uvezena'&&l.visible)&&!sqlmapRestoreAll._running")
   await page.evaluate("window.tileOK=false;_sqlWCall({type:'tile',name:'uvezena',z:13,x:4463,y:2940}).then(r=>tileOK=!!r.data&&r.data[0]===137);void 0");await page.wait_for_function('tileOK')
   await page.evaluate("sqlmapRemove(_sqlLayers.findIndex(l=>l.name==='uvezena'))");assert file.stat().st_size==1_500_000_000
   assert not errors,errors;assert sum(n for a,n in reads)<10*65536,reads
   print(json.dumps({'browser_native_vfs':True,'open_ms':opened,'fd_endpoint_reads':reads,'original_size':file.stat().st_size,'no_full_copy':True,'offline_restart':True,'physical_Android':False}))
   await ctx.close()
asyncio.run(main())
