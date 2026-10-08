"""Stvarni GPKG/MiniSqlite/Leaflet/IDB: više fajlova, tabovi i trajno čuvanje."""
import asyncio,base64,importlib.util,mimetypes,os,re,sqlite3,tempfile
from pathlib import Path
from playwright.async_api import async_playwright
ROOT=Path(__file__).resolve().parents[2]
spec=importlib.util.spec_from_file_location('base',Path(__file__).with_name('menu-tools.py'));b=importlib.util.module_from_spec(spec);spec.loader.exec_module(b)
code='''const _SQLJS_CDN='fixture/',_SQLJS_LOCAL='fixture/';let sbUser={id:'A'};
const map=L.map('map').setView([44.9,16],13);let toasts=[],confirm=true,fitCalls=0;
const showToast=t=>toasts.push(t),_dlgConfirm=async()=>confirm,_dlgPrompt=async()=>null,closeLayerSheet=()=>{},_lsRenderTem=()=>{},KORISNIK_PAL=[];
const origFit=map.fitBounds.bind(map);map.fitBounds=(...a)=>{fitCalls++;return origFit(...a)};
'''
code+='\n'+b.section('const _SQL_WORKER_SRC =','// ── Worker management')
code+='\n'+b.section('const _TEM_REG_KEY','// ── Rekurzivno listanje Supabase bucketa')
code+='\n'+b.section('const _KMLC_DB','async function _kmlcInit(')
code+='\n'+b.function('_escHtml')+'\n'+b.function('_jsAttr')
# Include exactly both real thematic dialogs, no unrelated menu content.
start=b.SOURCE.index('<div id="tem-table-modal"');end=b.SOURCE.index('\n</div>',start)+len('\n</div>')
body=b.section('<div id="tem-modal"','<!-- TEMATSKA KARTA — TABELA ATRIBUTA')+b.SOURCE[start:end]
body+=re.search(r'<input type="file" id="tem-file-input"[\s\S]*?>',b.SOURCE).group()
html='<!DOCTYPE html><html lang="bs"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/static/libs/leaflet.min.css"><style>'+b.styles+'\n#map{position:fixed;inset:0;background:#dae8ce}</style></head><body>'+b.sprite+'<div id="map"></div>'+body+'<script src="/static/libs/leaflet.min.js"></script><script src="/static/libs/proj4.js"></script><script>'+code+'</script></body></html>'
small=(ROOT/'tests/fixtures/tematska-mini.gpkg').read_bytes()
def upload(name,data=small):return {'name':name,'mimeType':'application/geopackage+sqlite3','buffer':data}
async def main():
 out=ROOT/'outputs/ui-preview';out.mkdir(parents=True,exist_ok=True)
 with tempfile.TemporaryDirectory() as d:
  f=Path(d)/'large.gpkg';f.write_bytes(small);c=sqlite3.connect(f)
  rows=c.execute('SELECT geom,odjel,gj,visina,zaliha_m3_ha,cetinari_pct,starost,uredjajni_razred,gazdinska_klasa,minirano FROM odsjeci').fetchall()
  c.executemany('INSERT INTO odsjeci(geom,odjel,gj,visina,zaliha_m3_ha,cetinari_pct,starost,uredjajni_razred,gazdinska_klasa,minirano) VALUES (?,?,?,?,?,?,?,?,?,?)',rows*99);c.commit();c.close();large=f.read_bytes()
 async with async_playwright() as p:
  browser=await p.chromium.launch(**({'executable_path':os.environ['UI_CHROMIUM']} if os.environ.get('UI_CHROMIUM') else {}));page=await browser.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  async def route(r):
   if r.request.url=='https://fixture.test/':await r.fulfill(content_type='text/html',body=html)
   elif r.request.url.startswith('https://fixture.test/static/'):
    f=ROOT/r.request.url.split('fixture.test/',1)[1];await r.fulfill(content_type=mimetypes.guess_type(f)[0] or 'text/plain',body=f.read_bytes())
   else:await r.abort()
  await page.route('**/*',route);await page.goto('https://fixture.test/')
  await page.evaluate('showTemModal()')
  await page.locator('#tem-file-input').set_input_files([upload('Prvi <odjel>.gpkg'),upload('Drugi.gpkg'),upload('Treći.gpkg')])
  await page.evaluate('_temQueue');assert await page.evaluate('_temMaps.length')==3
  assert await page.locator('.tem-file').count()==3 and await page.evaluate('fitCalls')==0
  assert await page.evaluate('Promise.all(_temMaps.map(m=>_kmlcGet(_TEM_IDB_PFX+m.id))).then(x=>x.every(Boolean))')
  assert await page.locator('.tem-file img').count()==0
  # Tabovi ostaju isti DOM objekti; uređivanje i skrol prežive novi import.
  await page.evaluate("window.tab=document.querySelector('[data-tem-view=style]');_temChoose(_temMaps[0].id);_temApplyTheme(_temMaps[0].id,'visina');_temEdToggle(_temMaps[0].id)")
  await page.fill('#tem-ed-lo-0','12');await page.locator('#tem-ed-c-0').fill('#123456')
  await page.evaluate("document.getElementById('tem-modal-body').scrollTop=150;window.oldScroll=document.getElementById('tem-modal-body').scrollTop;window.oldId=_temSelectedId")
  await page.locator('#tem-file-input').set_input_files([upload('Četvrti.gpkg')]);await page.evaluate('_temQueue')
  assert await page.evaluate("_temView==='style'&&_temSelectedId===oldId&&tab===document.querySelector('[data-tem-view=style]')")
  assert await page.locator('#tem-ed-lo-0').input_value()=='12' and await page.locator('#tem-ed-c-0').input_value()=='#123456'
  assert await page.evaluate('Math.abs(document.getElementById("tem-modal-body").scrollTop-oldScroll)<2')
  assert await page.locator('.tem-mc').count()==1 and await page.locator('#tem-ed-lo-0').count()==1
  await page.evaluate("_temClassEdApply(_temMaps[0].id);_temSwitchView('files');_temSetAllVisible(false)")
  assert await page.evaluate('_temMaps.every(m=>!m.visible&&!map.hasLayer(m.grp))')
  await page.locator('.tem-file-check input').nth(1).check()
  assert await page.evaluate('_temMaps[1].visible&&map.hasLayer(_temMaps[1].grp)')
  # Ponovni ulazak bez mreže: pravi page reload i IDB restore, paralelni pozivi bez duplikata.
  await page.reload();await page.evaluate('Promise.all([_temRestore(),_temRestore()]);');await page.evaluate('showTemModal()')
  assert await page.evaluate('_temMaps.length===4&&_temMaps.filter(m=>m.visible).length===1&&_temMaps[0].styles.visina.colors[0]==="#123456"')
  # Veći fajl: heartbeat potvrđuje paint prilike tokom skeniranja, bez promjene taba.
  await page.evaluate("window.ticks=0;window.heart=setInterval(()=>ticks++,0)")
  await page.locator('#tem-file-input').set_input_files([upload('Veliki odjel.gpkg',large)]);await page.evaluate('_temQueue')
  assert await page.evaluate('_temMaps.at(-1).features.length===3000&&ticks>15');await page.evaluate('clearInterval(heart)')
  # Neuspješan primarni IDB ili registar ne smije objaviti/lažno sačuvati kartu.
  await page.evaluate('window.save=_kmlcSave;_kmlcSave=async()=>false')
  await page.locator('#tem-file-input').set_input_files([upload('Nema prostora.gpkg')]);await page.evaluate('_temQueue');assert await page.evaluate('_temMaps.length')==5
  await page.evaluate('_kmlcSave=save;window.set=Storage.prototype.setItem;Storage.prototype.setItem=function(){throw new Error("quota")};void 0')
  await page.locator('#tem-file-input').set_input_files([upload('Pun registar.gpkg')]);await page.evaluate('_temQueue');assert await page.evaluate('_temMaps.length')==5
  await page.evaluate('Storage.prototype.setItem=set;void 0')
  # Loš fajl u grupi ne prekida naredni ispravan.
  await page.locator('#tem-file-input').set_input_files([upload('Loš.gpkg',b'not SQLite'),upload('Peti odjel.gpkg')]);await page.evaluate('_temQueue');assert await page.evaluate('_temMaps.length')==6
  # Zapis nedostupnog fajla ostaje u listi i registru kad se drugi fajl sakrije.
  await page.evaluate("localStorage.setItem(_TEM_REG_KEY,JSON.stringify([...JSON.parse(localStorage.getItem(_TEM_REG_KEY)),{id:'lost',name:'Sačuvan ali nedostupan.gpkg',visible:false}]));_temSetAllVisible(false)")
  assert await page.locator('.tem-file').count()==7
  assert await page.evaluate('JSON.parse(localStorage.getItem(_TEM_REG_KEY)).some(m=>m.id==="lost")')
  # Brisanje traži potvrdu; neuspjelo čuvanje čuva fajl/marker.
  await page.evaluate('confirm=false;_temRemoveMap(_temMaps[0].id)');assert await page.evaluate('_temMaps.length')==6
  await page.evaluate('confirm=true;Storage.prototype.setItem=function(){throw new Error("quota")};_temRemoveMap(_temMaps[0].id)');assert await page.evaluate('_temMaps.length')==6
  await page.evaluate('Storage.prototype.setItem=set;_temRemoveMap("lost")');assert await page.locator('.tem-file').count()==6
  await page.evaluate('window.deleted=_temMaps[0].id;_temRemoveMap(deleted)');assert await page.evaluate('!_temById(deleted)&&!JSON.parse(localStorage.getItem(_TEM_REG_KEY)).some(m=>m.id===deleted)')
  # Kontrole ostaju unutar ekrana u portretnom/pejzažnom i dnevnom/tamnom modu.
  for theme in ['day','dark']:
   await page.evaluate('(t)=>document.documentElement.dataset.fieldTheme=t',theme)
   for width,height in [(320,568),(390,650),(568,320),(1200,800)]:
    await page.set_viewport_size({'width':width,'height':height});await page.evaluate("showTemModal();_temSwitchView('files')")
    for sel in ['.tem-panel','.tem-panel-head','.tem-tabs','#tem-modal-body','.tem-panel-foot']:await b.bounds(page,sel,width,height)
    await page.evaluate('document.getElementById("tem-modal-body").scrollTop=99999')
    assert await page.locator('[data-tem-view=style]').is_visible()
    await page.screenshot(path=str(out/f'thematic-files-{theme}-{width}.png'))
    await page.evaluate("_temChoose(_temMaps[0].id);_temApplyTheme(_temMaps[0].id,'visina');if(_temEdOpenId!==_temMaps[0].id)_temEdToggle(_temMaps[0].id)")
    assert await page.locator('.tem-ed').evaluate('(e)=>e.scrollWidth<=e.clientWidth+1')
    for sel in ['.tem-panel','#tem-modal-body']:await b.bounds(page,sel,width,height)
    await page.screenshot(path=str(out/f'thematic-style-{theme}-{width}.png'))
    await page.evaluate('showTemTable(_temMaps[0].id)');await b.bounds(page,'.ttm-panel',width,height);await page.evaluate('closeTemTable()')
  # Uvoz na starom nalogu nakon odjave ne smije objaviti ni sačuvati kartu.
  await page.evaluate("window.before=JSON.parse(localStorage.getItem(_TEM_REG_KEY)).length;_gpkgLoadFiles([{name:'Stari nalog.gpkg',arrayBuffer:()=>new Promise(r=>window.release=r)}]);void 0")
  await page.wait_for_function('typeof release==="function"');await page.evaluate('_temRemoveAll(true);sbUser={id:"B"};release(new ArrayBuffer(0))');await page.evaluate('_temQueue')
  assert await page.evaluate('_temMaps.length===0&&JSON.parse(localStorage.getItem(_TEM_REG_KEY)).length===before')
  # Migracija legacy fajla: ne briši jedinu kopiju kad upis ne uspije.
  legacy=await browser.new_page();legacy.on('pageerror',lambda e:errors.append(str(e)));await legacy.route('**/*',route);await legacy.goto('https://fixture.test/')
  await legacy.evaluate("""async data=>{window.buf=Uint8Array.from(atob(data),c=>c.charCodeAt(0)).buffer;
    await _kmlcSave(_TEM_IDB_KEY,buf);localStorage.setItem(_TEM_NAME_KEY,'Stara tematska.gpkg');localStorage.setItem(_TEM_THEME_KEY,'visina');
    window.save=_kmlcSave;_kmlcSave=async()=>false;await _temRestore()}""",base64.b64encode(small).decode())
  assert await legacy.evaluate('_temMaps.length===0&&localStorage.getItem(_TEM_NAME_KEY)!==null')
  assert await legacy.evaluate('_kmlcGet(_TEM_IDB_KEY).then(Boolean)')
  await legacy.evaluate('_kmlcSave=save;_temRestore()')
  assert await legacy.evaluate('_temMaps.length===1&&_temMaps[0].theme==="visina"&&localStorage.getItem(_TEM_NAME_KEY)===null')
  # Brisanje dok restore čeka čitanje ne smije vratiti uklonjen fajl.
  await legacy.evaluate("_temRemoveAll(true);_kmlcGet=()=>new Promise(r=>window.release=()=>r(buf));_temRestore();void 0")
  await legacy.wait_for_function('typeof release==="function"');await legacy.evaluate('_temRemoveMap("legacy1")');await legacy.evaluate('release();_temQueue')
  assert await legacy.evaluate('_temMaps.length===0&&JSON.parse(localStorage.getItem(_TEM_REG_KEY)).length===0')
  await legacy.close()
  assert not errors,errors
  await browser.close()
 print('GPKG: pravi višestruki import, 3000 poligona, IDB reload, greške prostora/naloga, vidljivost i 16 rasporeda: OK')
if __name__=='__main__':asyncio.run(main())
