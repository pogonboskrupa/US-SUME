"""Ponovno otvaranje: stvarni KML/SHP, IDB, stilovi i trajni izbori; bez servera."""
import asyncio,importlib.util,mimetypes,os
from pathlib import Path
from playwright.async_api import async_playwright
ROOT=Path(__file__).resolve().parents[2]
spec=importlib.util.spec_from_file_location('menu',Path(__file__).with_name('menu-tools.py'));b=importlib.util.module_from_spec(spec);spec.loader.exec_module(b)
names=['loadKmlStyleFor','_kmlStyleToLeaflet','pkmlStyled','_coordsCentroid','_kmlLabelMarker','_loadOneKml','_loadOneShp','_prjToProj4','_reprojectGeometry','_fetchBucketFile','_kmlcInit','_serverKmlRestore','_bufSavePrefs','_bufRestorePrefs','_syncBufRadiusEverywhere','_bufGetColor','_bufGetOpacity','_bufColChange','_bufOpacityChange','_hexToRgbCsv','_hexToRgb','_lsTab']
extra='''let _globalKmlStyles={},bufRadius=40,_dozBufRadius=40,bufLayers=[],_dozBufLayers=[],_dozTreePts=[];
const drawBuffers=()=>{},dozDrawBuf=()=>{},dozTreesAnalyze=()=>{},_instUpdateStats=()=>{},_lsRenderSqlite=()=>{};
const SUPA_KEY='fixture',_fetchT=()=>{throw Error('Restoring must not fetch')};
'''+ '\n'.join(b.function(n) for n in names)
dom='<select id="buf-sel"><option>60</option><option selected>80</option><option>100</option><option>120</option></select><select id="doz-buf-sel"><option>60</option><option>80</option><option>100</option><option>120</option></select><input id="buf-col-pick" type="color" value="#60a5fa"><input id="buf-opacity" type="range" value="18"><span id="buf-opacity-lbl"></span><div id="buf-col-swatch"></div>'+''.join('<button id="ls-tab-'+p+'"></button><div id="ls-pane-'+p+'"></div>' for p in ['karte','offline','inst','granice'])
html=b.fixture.replace('</body>',dom+'<script>'+extra+'</script></body>')
kml='<kml><Placemark><name>Odjel 105</name><Polygon><outerBoundaryIs><LinearRing><coordinates>16,44.9 16.01,44.9 16.01,44.91 16,44.91 16,44.9</coordinates></LinearRing></outerBoundaryIs></Polygon></Placemark></kml>'
async def main():
 async with async_playwright() as p:
  browser=await p.chromium.launch(**({'executable_path':os.environ['UI_CHROMIUM']} if os.environ.get('UI_CHROMIUM') else {}));page=await browser.new_page();errors=[];network=[];page.on('pageerror',lambda e:errors.append(str(e)))
  async def route(r):
   if r.request.url=='https://ui.test/':await r.fulfill(content_type='text/html',body=html)
   elif r.request.url.startswith('https://ui.test/static/'):
    f=ROOT/r.request.url.split('ui.test/',1)[1];await r.fulfill(content_type=mimetypes.guess_type(f)[0] or 'application/octet-stream',body=f.read_bytes())
   else:network.append(r.request.url);await r.abort()
  await page.route('**/*',route);await page.goto('https://ui.test/')
  await page.evaluate('''async data=>{
    await _localKmlSaveContent('lokalno.kml',data,'#16a34a');await _localKmlRestore();
    Object.assign(kmlLs[0],{col:'#dc2626',dash:'6,4',weight:5,opacity:.55,vis:false,fill:true,fillCol:'#2563eb',fillPattern:'diagonal',fillOpacity:.23,tag:'105'});map.removeLayer(kmlLs[0].grp);
    await _kmlcSave('file:karte/server.kml',data);
    localStorage.setItem(_KML_USER_STYLES_KEY,JSON.stringify({'karte/server.kml':{col:'#9333ea',weight:4,opacity:.6,vis:false,fill:true,fillCol:'#f97316',fillPattern:'solid',fillOpacity:.42,tag:'206'},'karte/neotvoreno.kml':{col:'#000000',vis:false}}));
    kmlLs.push({_key:'karte/server.kml',grp:null,_downloaded:false,vis:true});saveKmlStyles();kmlLs.pop();
    _syncBufRadiusEverywhere(120);document.getElementById('buf-col-pick').value='#16a34a';_bufColChange('#16a34a');document.getElementById('buf-opacity').value=35;_bufOpacityChange(35);_lsTab('offline');
  }''',kml)
  await page.evaluate('''async data=>{await _kmlcSave('file:karte/odjeli.shp',new Uint8Array(data.shp).buffer);await _kmlcSave('file:karte/odjeli.dbf',new Uint8Array(data.dbf).buffer);
    const styles=JSON.parse(localStorage.getItem(_KML_USER_STYLES_KEY));styles['karte/odjeli.shp']={col:'#0891b2',weight:3,vis:true,fill:true,fillCol:'#dc2626',fillPattern:'solid',fillOpacity:.31,tag:'107'};localStorage.setItem(_KML_USER_STYLES_KEY,JSON.stringify(styles));}''',{'shp':list(b.polygon()),'dbf':list(b.dbf())})
  await page.reload();await page.evaluate('''async()=>{_bufRestorePrefs();_lsTab(localStorage.getItem('tvlake_layer_sheet_tab'));await _localKmlRestore();await _kmlcInit();await Promise.all([_serverKmlRestore(),_serverKmlRestore()]);}''')
  assert await page.evaluate('kmlLs.length')==3
  result=await page.evaluate('''()=>kmlLs.map(k=>{let leaf;const walk=g=>g.eachLayer(l=>{if(l._kmlIsPolygon)leaf=l;else if(l.eachLayer)walk(l)});walk(k.grp);return {name:k._origName||k._key,col:k.col,tag:k.tag,vis:k.vis,on:map.hasLayer(k.grp),fill:k.fill,pattern:k.fillPattern,options:leaf?.options};})''')
  rows={k['name']:k for k in result}
  local=rows['lokalno.kml'];assert local['col']=='#dc2626' and local['tag']=='105' and not local['on'] and local['pattern']=='diagonal' and local['options']['weight']==5 and local['options']['opacity']==.55,local
  server=rows['karte/server.kml'];assert not server['on'] and not server['vis'] and server['tag']=='206' and server['options']['fillColor']=='#f97316' and server['options']['fillOpacity']==.42,server
  shp=rows['karte/odjeli.shp'];assert shp['on'] and shp['tag']=='107' and shp['options']['fillColor']=='#dc2626' and shp['options']['fillOpacity']==.31,shp
  assert await page.evaluate('JSON.parse(localStorage.getItem(_KML_USER_STYLES_KEY))["karte/neotvoreno.kml"].vis===false')
  assert await page.evaluate('bufRadius===60&&_dozBufRadius===60&&document.getElementById("buf-sel").value==="120"&&document.getElementById("doz-buf-sel").value==="120"&&document.getElementById("buf-col-pick").value==="#16a34a"&&document.getElementById("buf-opacity").value==="35"')
  assert await page.locator('#ls-tab-offline').get_attribute('aria-selected')=='true'
  # Sakrivanje i izmjena samo jednog fajla čuva ostale stilove i kopije.
  await page.evaluate('kmlLs.find(k=>k._key==="karte/odjeli.shp").vis=false;saveKmlStyles()');await page.reload();await page.evaluate('''async()=>{await _kmlcInit();await _serverKmlRestore();}''')
  assert await page.evaluate('kmlLs.length===2&&kmlLs.every(k=>!k.vis&&!map.hasLayer(k.grp))')
  assert not errors,errors
  assert not network,network
  await browser.close()
 print('Restart: lokalni/server KML i stvarni SHP iz IDB, puna ispuna/stil/vidljivost, neotvoreni stilovi, bafer i podtab; bez mreže: OK')
if __name__=='__main__':asyncio.run(main())
