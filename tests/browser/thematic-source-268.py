"""GPKG source palette/ranges/NULL and restore; real user file via GPKG_REAL (not published)."""
import asyncio,importlib.util,mimetypes,os,sqlite3,struct,tempfile,time,json
from pathlib import Path
from playwright.async_api import async_playwright
ROOT=Path(__file__).resolve().parents[2]
spec=importlib.util.spec_from_file_location('base',Path(__file__).with_name('thematic-files-266.py'));b=importlib.util.module_from_spec(spec);spec.loader.exec_module(b)
SPECIES=['Bukva','Jela','Smrca','Hrast_kitnjak','Hrast_luznjak','Pitomi_kesten','Gorski_javor']
COLORS=['#ebdff5','#c19cda','#935bbd','#6e329b','#48146e']
RANGES=[(50,59.9),(60,69.9),(70,79.9),(80,89.9),(90,100)]
LABELS=['Uslovni kandidat','Umjerena pogodnost','Viša pogodnost','Rezervisano','Bez terenske potvrde']
def synthetic(path,legend=True):
 path.write_bytes(b.small);c=sqlite3.connect(path);c.execute('DROP TABLE odsjeci');c.execute('CREATE TABLE odsjeci (fid INTEGER PRIMARY KEY,geom MULTIPOLYGON,naziv TEXT,'+','.join('"'+n+'" REAL' for n in SPECIES)+',Procjena_i_ogranicenja TEXT)')
 c.execute('CREATE TABLE teme (polje TEXT,naziv TEXT,opis TEXT)');c.execute('CREATE TABLE layer_styles (f_table_name TEXT,styleName TEXT,styleQML TEXT,useAsDefault INTEGER,description TEXT)')
 if legend:c.execute('CREATE TABLE legenda (tema TEXT,naziv TEXT,min_vrijednost REAL,max_vrijednost REAL,boja TEXT,alfa INTEGER)')
 for n in SPECIES:
  c.execute('INSERT INTO teme VALUES (?,?,?)',(n,n.replace('_',' '),'Procjena modela; nije vjerovatnoća uspjeha sadnje. NULL nije dokaz neprikladnosti.'))
  if legend:c.executemany('INSERT INTO legenda VALUES (?,?,?,?,?,?)',[(n,LABELS[i],lo,hi,COLORS[i],210) for i,(lo,hi) in enumerate(RANGES)])
  symbols=''.join('<symbol name="%d" alpha=".82"><layer class="SimpleFill"><Option name="color" value="%s,255" /></layer></symbol>'%(i,','.join(str(int(COLORS[i][j:j+2],16)) for j in (1,3,5))) for i in range(5))
  ranges=''.join('<range lower="%s" upper="%s" symbol="%d" label="%s" render="true" />'%(lo,hi,i,LABELS[i]) for i,(lo,hi) in enumerate(RANGES))
  qml='<qgis><renderer-v2 type="graduatedSymbol" attr="'+n+'"><ranges>'+ranges+'</ranges><symbols>'+symbols+'</symbols></renderer-v2></qgis>'
  c.execute('INSERT INTO layer_styles VALUES (?,?,?,?,?)',('odsjeci',n,qml,int(n=='Bukva'),'Procjena'))
 values=[50,59.9,60,69.9,70,79,80,89.9,90,100,None,49,101,59.95]
 for i in range(98):
  x=16+(i%14)*.001;y=44.9+(i//14)*.001
  pts=[(x,y),(x+.0009,y),(x+.0009,y+.0009),(x,y+.0009),(x,y)]
  wkb=struct.pack('<BIII',1,3,1,5)+b''.join(struct.pack('<dd',*p) for p in pts)
  geom=struct.pack('<2sBBi',b'GP',0,1,4326)+struct.pack('<BII',1,6,1)+wkb
  scores=[values[(i+j)%14] for j in range(7)]
  c.execute('INSERT INTO odsjeci VALUES ('+','.join('?' for _ in range(11))+')',(i+1,geom,'Celija_%05d'%(i+1),*scores,'Provjeriti dubinu tla, drenažu i svjetlost.'))
 c.commit();c.close()
def expected(path):
 c=sqlite3.connect('file:'+str(path)+'?mode=ro',uri=True);n=c.execute('SELECT count(*) FROM odsjeci').fetchone()[0];out={}
 for s in SPECIES:
  vals=[x[0] for x in c.execute('SELECT "'+s+'" FROM odsjeci')];counts=[sum(v is not None and lo<=v<=hi for v in vals) for lo,hi in RANGES];out[s.lower()]={'counts':counts,'without':n-sum(counts)}
 c.close();return n,out
async def main():
 with tempfile.TemporaryDirectory() as tmp:
  provided=os.environ.get('GPKG_REAL');primary=Path(provided) if provided else Path(tmp)/'source.gpkg'
  if not provided:synthetic(primary)
  fallback=Path(tmp)/'qml.gpkg';synthetic(fallback,False);n,counts=expected(primary)
  async with async_playwright() as p:
   browser=await p.chromium.launch(executable_path=os.environ.get('UI_CHROMIUM') or None,args=['--no-sandbox']);page=await browser.new_page(viewport={'width':390,'height':800});errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
   async def route(r):
    if r.request.url=='https://fixture.test/':await r.fulfill(content_type='text/html',body=b.html)
    elif r.request.url.startswith('https://fixture.test/static/'):
     f=ROOT/r.request.url.split('fixture.test/',1)[1];await r.fulfill(content_type=mimetypes.guess_type(f)[0] or 'text/plain',body=f.read_bytes())
    else:await r.abort()
   await page.route('**/*',route);await page.goto('https://fixture.test/');await page.evaluate('showTemModal()');start=time.time()
   await page.locator('#tem-file-input').set_input_files(str(primary));await page.evaluate('_temQueue')
   assert await page.evaluate('_temMaps.length===1&&_temMaps[0].theme==="bukva"')
   assert await page.evaluate('_temMaps[0].features.length')==n
   assert await page.evaluate('_temMaps[0].sourceOrder')==[s.lower() for s in SPECIES]
   for col,want in counts.items():
    await page.evaluate('col=>_temApplyTheme(_temMaps[0].id,col)',col)
    result=await page.evaluate('()=>{const m=_temMaps[0],c=m._cls,s=_temStatistika(m);return {colors:c.colors,ranges:c.ranges.map(r=>[r.min,r.max]),counts:s.klase.map(k=>k.n),without:s.bez.n,hidden:m.features.filter(f=>_temKlasaIdx(c,f.attrs[c.col])<0).every(f=>f.polys.every(p=>!p.options.fill&&!p.options.stroke&&!p.options.interactive)),visible:m.features.filter(f=>_temKlasaIdx(c,f.attrs[c.col])>=0).every(f=>f.polys.every(p=>p.options.fill&&p.options.interactive))}}')
    assert result['colors']==COLORS and result['ranges']==[list(r) for r in RANGES],result
    assert result['counts']==want['counts'] and result['without']==want['without'],(col,result,want)
    assert result['hidden'] and result['visible'],col
   # Independent SQLite counts match all features; no quantile recoloring.
   await page.evaluate('_temApplyTheme(_temMaps[0].id,"bukva");_temChoose(_temMaps[0].id);_temEdToggle(_temMaps[0].id)')
   assert await page.locator('.tem-row > .tem-sel').locator('option').count()==8
   for theme in ['day','dark']:
    for w,h in [(320,568),(390,800),(568,320),(1000,700)]:
     await page.set_viewport_size({'width':w,'height':h});await page.evaluate('(t)=>document.documentElement.dataset.fieldTheme=t',theme)
     assert await page.evaluate('(()=>{const b=document.getElementById("tem-modal-body");return b.scrollWidth<=b.clientWidth+1})()'),(theme,w,h)
     await page.screenshot(path=str(ROOT/'outputs/ui-preview'/f'thematic-source-{"user" if provided else "synthetic"}-{theme}-{w}-{h}.png'))
   await page.set_viewport_size({'width':1000,'height':700})
   # Colour-only edit preserves source gaps/labels; reset restores file palette.
   await page.locator('#tem-ed-c-0').fill('#123456');await page.evaluate('_temClassEdApply(_temMaps[0].id)')
   assert await page.evaluate('_temMaps[0]._cls.ranges[0].max===59.9&&_temMaps[0]._cls.colors[0]==="#123456"&&_temKlasaIdx(_temMaps[0]._cls,59.95)===-1')
   await page.evaluate('_temClassEdReset(_temMaps[0].id)');assert await page.evaluate('_temMaps[0]._cls.colors[0]')==COLORS[0]
   # Inspect polygon and render actual colored geometry; popup title is cell name.
   await page.evaluate('()=>{const m=_temMaps[0],f=m.features.find(f=>f.attrs.bukva!=null);window.cellName=f.attrs.naziv;f.polys[0].openPopup();map.fitBounds(f.polys[0].getBounds().pad(1));closeTemModal()}')
   assert await page.locator('.tem-card-hd .odjel').inner_text()==await page.evaluate('cellName')
   await page.screenshot(path=str(ROOT/'outputs/ui-preview'/f'thematic-source-{"user" if provided else "synthetic"}-map.png'))
   # Stored theme/opacity/hide/override restored from original bytes, zero network.
   await page.evaluate('map.closePopup();showTemModal();_temChoose(_temMaps[0].id);_temApplyTheme(_temMaps[0].id,"hrast_luznjak");_temEdToggle(_temMaps[0].id)')
   # Already-open editor follows new theme. Make sure editing is open before DOM inputs.
   if not await page.locator('#tem-ed-c-0').count():await page.evaluate('_temEdToggle(_temMaps[0].id)')
   await page.locator('#tem-ed-c-0').fill('#234567');await page.evaluate('_temClassEdApply(_temMaps[0].id);_temSetOpacity(_temMaps[0].id,.35,true);_temSetVisible(_temMaps[0].id,false)')
   await page.reload();await page.evaluate('_temRestore()')
   assert await page.evaluate('_temMaps[0].theme==="hrast_luznjak"&&!_temMaps[0].visible&&_temMaps[0].opacity===.35&&_temMaps[0]._cls.colors[0]==="#234567"&&_temMaps[0]._cls.ranges[0].max===59.9&&_temMaps[0]._cls.hideMissing')
   await page.evaluate('_temApplyTheme(_temMaps[0].id,null)');assert await page.evaluate('_temMaps[0].features.every(f=>f.polys.every(p=>p.options.fill&&p.options.interactive))')
   await page.reload();await page.evaluate('_temRestore()');assert await page.evaluate('_temMaps[0].theme===null')
   # QML fallback applies same palette without custom legenda table.
   await page.evaluate('showTemModal()');await page.locator('#tem-file-input').set_input_files(str(fallback));await page.evaluate('_temQueue')
   assert await page.evaluate('_temMaps[1].theme==="bukva"&&_temMaps[1]._cls.colors[2]==="#935bbd"&&_temMaps[1]._cls.hideMissing')
   assert not errors,errors
   print(json.dumps({'file':primary.name,'features':n,'speciesCounts':counts,'elapsedSeconds':round(time.time()-start,2),'qmlFallback':True,'physicalPhone':False},ensure_ascii=False))
   await browser.close()
if __name__=='__main__':asyncio.run(main())
