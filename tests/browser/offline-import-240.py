"""Stvarni proizvodni bootstrap i uvoz 1,5 GB: prikaz, OPFS/IDB, offline restart.
Sintetička SQLite baza s dodanim nultim bajtovima; nije mjerenje fizičkog Xiaomija.
"""
import asyncio,json,mimetypes,os,shutil,tempfile,time
from pathlib import Path
from urllib.parse import urlparse
from playwright.async_api import async_playwright
ROOT=Path(__file__).resolve().parents[2]
ORIGIN='http://localhost:8788'
TILE="_sqlLayers.some(sl=>sl.visible&&Object.values(sl.layer._tiles||{}).some(t=>t.el.tagName==='IMG'&&t.el.complete&&t.el.naturalWidth>0&&t.el.src.startsWith('blob:')))"
CENTER="map.setView(map.unproject(L.point(4463.5*256,2940.5*256),13),13,{animate:false});void 0"
async def main():
 with tempfile.TemporaryDirectory() as tmp:
  fixture=Path(tmp)/'uvoz-1500.sqlitedb';shutil.copyfile(ROOT/'tests/fixtures/rmaps-mini.sqlitedb',fixture)
  with fixture.open('r+b') as f:f.truncate(1_500_000_000)
  async with async_playwright() as p:
   context=await p.chromium.launch_persistent_context(str(Path(tmp)/'profile'),executable_path=os.environ.get('UI_CHROMIUM') or None,args=['--no-sandbox'],offline=True,service_workers='block',viewport={'width':390,'height':800});browser=context.browser;page=await context.new_page();errors=[]
   page.on('pageerror',lambda e:errors.append(str(e)))
   page.on('console',lambda m:print('ImportCI '+m.type+': '+m.text,flush=True) if m.type in ['error','warning'] else None)
   async def route(r):
    if not r.request.url.startswith(ORIGIN+'/'):await r.abort();return
    name=urlparse(r.request.url).path.lstrip('/') or 'index.html';path=ROOT/name
    if name=='GRANICE.kml':await r.fulfill(content_type='application/xml',body='<kml xmlns="http://www.opengis.net/kml/2.2"><Document/></kml>')
    elif path.is_file():await r.fulfill(content_type=mimetypes.guess_type(path)[0] or 'application/octet-stream',body=path.read_bytes())
    else:await r.fulfill(status=404,body='fixture')
   await page.route('**/*',route);await page.goto(ORIGIN+'/');await page.wait_for_function("document.readyState==='complete'&&!!window.OfflineMapImport")
   assert await page.evaluate("typeof navigator.storage.getDirectory==='function'"),'OPFS nedostupan'
   await page.evaluate("_revealApp();switchTab('karta');window.fieldSnapshot=JSON.stringify([vlake,_tacke,_tragRegistry]);window.copyHold=true;window.importClock=0;window.copyMs=0;window.originalCopy=OfflineMapImport.copy;OfflineMapImport.copy=(f,n,p)=>{const job=originalCopy(f,n,p);return {cancel:job.cancel,promise:job.promise.then(async bytes=>{window.copyMs=performance.now()-importClock;while(copyHold)await new Promise(r=>setTimeout(r,10));return bytes;})}};openLoadMapScreen();void 0")
   await page.locator('#loadmap-file-input').set_input_files(str(fixture));await page.wait_for_function('!document.getElementById("loadmap-confirm").disabled')
   print('ImportCI pohrana: '+json.dumps(await page.evaluate('navigator.storage.estimate()')),flush=True)
   await page.evaluate('importClock=performance.now();void 0');start=time.monotonic();await page.locator('#loadmap-confirm').click()
   try:await page.wait_for_function("_sqlLayers.some(sl=>sl.name==='uvoz-1500')",timeout=20000)
   except Exception:
    print('ImportCI zastoj: '+json.dumps(await page.evaluate("({status:document.getElementById('loadmap-status').textContent,sql:document.getElementById('sqlmap-status').textContent,layers:_sqlLayers.map(l=>l.name),callbacks:Object.keys(_sqlWCbs),jobs:_sqlImports.size})")),flush=True);print(errors,flush=True);raise
   layer_ms=round((time.monotonic()-start)*1000)
   await page.evaluate(CENTER);await page.wait_for_function(TILE,timeout=20000);tile_ms=round((time.monotonic()-start)*1000)
   assert await page.evaluate("_sqlLayers.find(sl=>sl.name==='uvoz-1500').saved===false&&_sqlImports.size===1&&!document.getElementById('offline-import-status').hidden&&!document.getElementById('loadmap-modal').classList.contains('show')")
   assert await page.evaluate("JSON.stringify([vlake,_tacke,_tragRegistry])===fieldSnapshot")
   # Zadržan je samo povratni rezultat kopiranja radi determinističke provjere;
   # puni fajl se stvarno kopira proizvodnim workerom, bez umjetnog čekanja u mjerenju.
   await page.wait_for_function("_sqlImports.get('uvoz-1500').written===1500000000",timeout=120000);await page.wait_for_function('copyMs>0',timeout=10000);copied_ms=round(await page.evaluate('copyMs'))
   await page.evaluate('copyHold=false;void 0');await page.wait_for_function("_sqlLayers.find(sl=>sl.name==='uvoz-1500').saved&&_sqlImports.size===0",timeout=20000)
   meta=await page.evaluate("(async()=>{const r=await _sqlWCall({type:'list'});const e=r.rows.find(x=>x.name==='uvoz-1500');const fh=await(await navigator.storage.getDirectory()).getFileHandle(e.opfsName);return {saved:e.opfs,path:e.opfsName,size:(await fh.getFile()).size,last:JSON.parse(localStorage.getItem(_LASTMAP_KEY))};})()")
   assert meta['saved'] and meta['size']==1_500_000_000 and meta['last']['opfsName']==meta['path'],meta
   out=ROOT/'outputs/ui-preview';out.mkdir(parents=True,exist_ok=True);await page.screenshot(path=str(out/'offline-import-240-sacuvana.png'))
   start=time.monotonic();await page.reload();await page.wait_for_function("document.readyState==='complete'&&typeof sqlmapRestoreAll==='function'");await page.evaluate('_revealApp();switchTab("karta");window.restartPromise=sqlmapRestoreAll();void 0');await page.wait_for_function("_sqlLayers.some(sl=>sl.name==='uvoz-1500'&&sl.saved)",timeout=20000);await page.evaluate(CENTER);await page.wait_for_function(TILE,timeout=20000);restart_ms=round((time.monotonic()-start)*1000)
   assert await page.evaluate("_sqlLayers.find(sl=>sl.name==='uvoz-1500').opfsName===JSON.parse(localStorage.getItem(_LASTMAP_KEY)).opfsName")
   # Brisanje tokom stvarnog drugog uvoza ne smije kasnije oživjeti kartu.
   await page.evaluate("window.cancelHold=true;window.baseCopy=OfflineMapImport.copy;OfflineMapImport.copy=(f,n,p)=>{const job=baseCopy(f,n,p);return {cancel:()=>{cancelHold=false;job.cancel();},promise:job.promise.then(async bytes=>{while(cancelHold)await new Promise(r=>setTimeout(r,10));return bytes;})}};openLoadMapScreen();void 0")
   await page.locator('#loadmap-file-input').set_input_files(str(fixture));await page.wait_for_function('!document.getElementById("loadmap-confirm").disabled');await page.locator('#loadmap-confirm').click();await page.wait_for_function('_sqlImports.size===1')
   await page.evaluate("window.removePromise=sqlmapRemove(_sqlLayers.findIndex(sl=>sl.name==='uvoz-1500'));void 0");await page.evaluate('removePromise')
   assert await page.evaluate("(async()=>{const r=await _sqlWCall({type:'list'});const root=await navigator.storage.getDirectory();const names=[];for await(const[n]of root.entries())names.push(n);return !_sqlLayers.length&&!r.rows.length&&!names.some(n=>n.endsWith('.sqlmap'));})()")
   assert not errors,errors
   report={'fixture_bytes':1_500_000_000,'browser':browser.version,'layer_ms':layer_ms,'first_visible_tile_ms':tile_ms,'full_copy_ms':copied_ms,'offline_restart_tile_ms':restart_ms,'saved_size_exact':True,'delete_during_import':True,'field_data_unchanged':True,'physical_Xiaomi':False,'fixture':'Mala stvarna RMaps baza, proširena nultim bajtovima do 1,5 GB; držan rezultat do provjere ranog prikaza.'}
   (out/'offline-import-240.json').write_text(json.dumps(report,ensure_ascii=False,indent=2));print(json.dumps(report,ensure_ascii=False),flush=True);await context.close()
if __name__=='__main__':asyncio.run(main())
