// Lokalni KML/SHP uvoz. Bez servera; sačuvaj sadržaj prije dodavanja na kartu.
'use strict';
let _layerImportBusy = false;
let _layerCommitTail = Promise.resolve();
function openLayerImport() {
  document.getElementById('layer-import-modal').style.display = 'flex';
  layerImportTab('kml');
  if(typeof window!=='undefined')window.KmlDownloads?.refresh();
}
function closeLayerImport() { document.getElementById('layer-import-modal').style.display = 'none'; }
function layerImportTab(tab) {
  for (const type of ['kml','shp']) {
    document.getElementById('layer-import-'+type).hidden = type !== tab;
    document.getElementById('layer-tab-'+type).setAttribute('aria-selected',String(type===tab));
  }
}
function _layerXml(value) { return String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c])); }
function _layerGeometryKml(g) {
  if (!g) return '';
  const coordinates = a => a.map(c=>c.slice(0,3).join(',')).join(' ');
  const point = c => '<Point><coordinates>'+coordinates([c])+'</coordinates></Point>';
  const line = c => '<LineString><coordinates>'+coordinates(c)+'</coordinates></LineString>';
  const polygon = rings => '<Polygon>'+rings.map((r,i)=>'<'+(i?'inner':'outer')+'BoundaryIs><LinearRing><coordinates>'+coordinates(r)+'</coordinates></LinearRing></'+(i?'inner':'outer')+'BoundaryIs>').join('')+'</Polygon>';
  const multi = parts => '<MultiGeometry>'+parts.join('')+'</MultiGeometry>';
  switch(g.type) {
    case 'Point': return point(g.coordinates);
    case 'MultiPoint': return multi(g.coordinates.map(point));
    case 'LineString': return line(g.coordinates);
    case 'MultiLineString': return multi(g.coordinates.map(line));
    case 'Polygon': return polygon(g.coordinates);
    case 'MultiPolygon': return multi(g.coordinates.map(polygon));
    case 'GeometryCollection': return multi(g.geometries.map(_layerGeometryKml));
    default: throw Error('Nepodržana geometrija: '+g.type);
  }
}
function _layerTransformGeometry(g,crs) {
  if (!g) return;
  const convert = a => {
    if (!Array.isArray(a)) throw Error('Neispravna geometrija');
    if (Array.isArray(a[0])) return a.map(convert);
    if (a.length<2 || !Number.isFinite(a[0]) || !Number.isFinite(a[1])) throw Error('Neispravne koordinate');
    const xy = crs ? proj4(crs,'EPSG:4326',a.slice(0,2)) : a.slice(0,2);
    if (!Number.isFinite(xy[0]) || !Number.isFinite(xy[1]) || Math.abs(xy[0])>180 || Math.abs(xy[1])>90) throw Error('Koordinate nisu na ispravnom mjestu — provjeri projekciju');
    return Number.isFinite(a[2]) ? [...xy,a[2]] : xy;
  };
  if(g.coordinates)g.coordinates=convert(g.coordinates);
  if(g.geometries)g.geometries.forEach(x=>_layerTransformGeometry(x,crs));
}
function _layerCrs(prj,mode,sample) {
  if(mode && mode!=='auto') return mode==='EPSG:4326' ? null : mode;
  if(prj?.trim()) {
    try { proj4(prj,'EPSG:4326',sample); return prj; } catch(e) {}
    if(/Zone_6|6500000|31276|3908/i.test(prj))return 'EPSG:31276';
    if(/Zone_5|5500000|31275/i.test(prj))return 'EPSG:31275';
    throw Error('Projekcija iz .prj nije prepoznata — izaberi je u postavkama uvoza');
  }
  if(Math.abs(sample[0])<=180 && Math.abs(sample[1])<=90)return null;
  throw Error('Dodaj .prj fajl ili izaberi projekciju za ove koordinate');
}
async function _layerReadShp(files,mode='auto') {
  if(typeof shapefile==='undefined' || typeof proj4==='undefined')throw Error('Biblioteka za SHP nije dostupna');
  const byName = new Map();
  for(const file of files) {
    const name=file.name.toLowerCase();
    if(byName.has(name))throw Error('Dva fajla imaju isti naziv: '+file.name);
    if(file.size>32*1024*1024)throw Error('Fajl je veći od 32 MB: '+file.name);
    byName.set(name,file);
  }
  const shapes=files.filter(f=>/\.shp$/i.test(f.name));
  if(!shapes.length)throw Error('Izaberi .shp zajedno s pratećim fajlovima istog naziva');
  const result=[];
  for(const shp of shapes) {
    const base=shp.name.replace(/\.shp$/i,''),comp=ext=>byName.get(base.toLowerCase()+ext);
    const dbf=comp('.dbf'),prj=comp('.prj'),cpg=comp('.cpg');
    const [shpBuf,dbfBuf,prjText,cpgText]=await Promise.all([shp.arrayBuffer(),dbf?dbf.arrayBuffer():undefined,prj?prj.text():'',cpg?cpg.text():'']);
    const code=cpgText.trim().replace(/\s/g,'');
    const encoding=!code?'windows-1252':/^(65001|utf-?8)$/i.test(code)?'utf-8':/^\d+$/.test(code)?'windows-'+code:code;
    const source=await shapefile.open(shpBuf,dbfBuf,{encoding});
    const placemarks=[];let crs,seen=0;
    while(true) {
      const row=await source.read();if(row.done)break;
      const f=row.value;if(!f.geometry)continue;
      const sample=_firstCoord(f.geometry);if(!sample)throw Error('SHP sadrži neispravnu geometriju');
      if(crs===undefined)crs=_layerCrs(prjText,mode,sample);
      _layerTransformGeometry(f.geometry,crs);
      const attrs=f.properties || {};
      const name=['ODJEL','OznakaOdj','Odjel','ODSJEK','Odsjek','NAZIV','Naziv','NAME','Name','Oznaka','Broj','ID'].map(k=>attrs[k]).find(v=>v!=null) ?? base;
      const ext=Object.entries(attrs).map(([k,v])=>'<Data name="'+_layerXml(k)+'"><value>'+_layerXml(typeof v==='object'&&v!==null?JSON.stringify(v):v)+'</value></Data>').join('');
      placemarks.push('<Placemark><name>'+_layerXml(name)+'</name><ExtendedData>'+ext+'</ExtendedData>'+_layerGeometryKml(f.geometry)+'</Placemark>');
      if(++seen>50000)throw Error('SHP ima više od 50.000 objekata — podijeli sloj na manje dijelove');
      if(seen%100===0)await new Promise(r=>setTimeout(r,0));
    }
    if(!seen)throw Error('SHP nema geometrije za prikaz: '+shp.name);
    result.push({name:base+'.kml',count:seen,content:'<?xml version="1.0" encoding="UTF-8"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document>'+placemarks.join('')+'</Document></kml>'});
  }
  return result;
}
function _localLayerKml(name,content,owner=sbUser?.id,driveSource=null) {
  const operation=_layerCommitTail.catch(()=>{}).then(()=>_localLayerKmlImpl(name,content,owner,driveSource));
  _layerCommitTail=operation;return operation;
}
async function _localLayerKmlImpl(name,content,owner,driveSource) {
  if(sbUser?.id!==owner)throw Error('Nalog je promijenjen; uvoz je prekinut');
  const doc=new DOMParser().parseFromString(content,'text/xml');
  if(doc.querySelector('parsererror') || !doc.querySelector('kml'))throw Error('Neispravan KML fajl');
  const store=JSON.parse(localStorage.getItem(_LOCAL_KML_KEY)||'{}');
  let unique=name,n=2;
  while(Object.prototype.hasOwnProperty.call(store,unique)||kmlLs.some(k=>!k._key&&(k._origName||k.name)===unique))unique=name.replace(/\.kml$/i,'')+' ('+(n++)+').kml';
  const col=KCOLS[kmlCI%KCOLS.length],grp=pkml(doc,col);
  if(!grp.getLayers().length)throw Error('KML nema tačaka, linija ili poligona za prikaz');
  if(!await _localKmlSaveContent(unique,content,col,owner,driveSource))throw Error('Sloj nije trajno sačuvan — provjeri slobodnu memoriju');
  if(sbUser?.id!==owner)throw Error('Nalog je promijenjen; uvoz je prekinut');
  kmlCI++;grp.addTo(map);
  kmlLs.push({name:unique,_origName:unique,grp,col,dash:'',weight:2,opacity:.9,vis:true,fill:false,fillCol:col,fillPattern:'solid',fillOpacity:.35,tag:name.match(/^(\d+)/)?.[1]||'',_loadedAt:Date.now()});
  _glCollapsed.delete('Lokalni / —');rndGraniceModal();
  try{const bounds=grp.getBounds();if(bounds.isValid())map.fitBounds(bounds,{padding:[20,20]});}catch(e){}
  return unique;
}
async function layerImportFiles(input,type) {
  if(_layerImportBusy)return;
  const files=Array.from(input.files || []);input.value='';if(!files.length)return;
  const owner=sbUser?.id,status=document.getElementById('layer-import-status');
  _layerImportBusy=true;status.textContent='Učitavam i pripremam sloj…';
  document.querySelectorAll('#layer-import-modal .layer-pick').forEach(b=>b.disabled=true);
  try {
    const rows=type==='shp'?await _layerReadShp(files,document.getElementById('layer-shp-crs').value):await Promise.all(files.map(async f=>({name:f.name,content:await f.text()})));
    if(sbUser?.id!==owner)throw Error('Nalog je promijenjen; uvoz je prekinut');
    for(const row of rows)await _localLayerKml(row.name,row.content,owner);
    status.textContent='✓ Učitano '+rows.length+' slojeva. Prikazani su na karti i sačuvani za offline rad.';
    showToast('✓ Slojevi su učitani i sačuvani na telefonu');
  } catch(e) {status.textContent='⚠ '+e.message;showToast('⚠ Uvoz nije završen: '+e.message);}
  finally {_layerImportBusy=false;document.querySelectorAll('#layer-import-modal .layer-pick').forEach(b=>b.disabled=false);}
}
async function _localLayerSnapshot() {
  const store=JSON.parse(localStorage.getItem(_LOCAL_KML_KEY)||'{}');
  for(const [name,data] of Object.entries(store))if(data.cacheKey){
    const content=await _kmlcGet(data.cacheKey);if(typeof content!=='string')throw Error('Nedostaje lokalni sloj: '+name);
    data.content=content;delete data.cacheKey;
  }
  return store;
}
async function _localLayerBackupValue(name,data,owner=sbUser?.id) {
  if(typeof data.content!=='string')return data;
  const cacheKey='local-kml:backup:'+_genUUID();
  await _kmlcSave(cacheKey,data.content);
  if(await _kmlcGet(cacheKey)!==data.content)throw Error('Lokalni sloj nije vraćen: '+name);
  if(sbUser?.id!==owner)throw Error('Nalog je promijenjen; obnova sloja je prekinuta');
  const value={...data,cacheKey};delete value.content;return value;
}

// Izmjena naziva/opisa lokalnog Placemark-a, uz potvrdu trajnog upisa.
function _localLayerPatchFeature(k,pmIndex,name,description,owner=sbUser?.id) {
  const run=async()=>{
    const original=k._origName||k.name;
    const initial=JSON.parse(localStorage.getItem(_LOCAL_KML_KEY)||'{}')[original];
    if(!initial || !Number.isInteger(pmIndex))throw Error('Izvorni objekat nije dostupan');
    const source=initial.cacheKey?await _kmlcGet(initial.cacheKey):initial.content;
    if(typeof source!=='string')throw Error('Nedostaje lokalni fajl');
    const doc=new DOMParser().parseFromString(source,'text/xml'),pm=doc.querySelectorAll('Placemark')[pmIndex];
    if(!pm || doc.querySelector('parsererror'))throw Error('Objekat nije pronađen u fajlu');
    for(const [tag,value]of [['name',name],['description',description]]) {
      let node=[...pm.children].find(n=>n.localName===tag);
      if(!node){node=doc.createElementNS(pm.namespaceURI,tag);pm.insertBefore(node,pm.firstChild);}
      node.textContent=value;
    }
    const content=new XMLSerializer().serializeToString(doc),key='local-kml:edit:'+_genUUID();
    try {
      await _kmlcSave(key,content);
      if(await _kmlcGet(key)!==content)throw Error('Memorija nije potvrdila izmjenu');
      if(sbUser?.id!==owner)throw Error('Nalog je promijenjen');
      const store=JSON.parse(localStorage.getItem(_LOCAL_KML_KEY)||'{}'),current=store[original];
      if(!current || current.cacheKey!==initial.cacheKey || current.content!==initial.content)throw Error('Sloj je promijenjen; otvori ga ponovo');
      store[original]={...current,cacheKey:key};delete store[original].content;
      localStorage.setItem(_LOCAL_KML_KEY,JSON.stringify(store));
    }catch(e){await _kmlcDelete(key);throw e;}
    if(initial.cacheKey)await _kmlcDelete(initial.cacheKey);
  };
  const result=_layerCommitTail.catch(()=>{}).then(run);_layerCommitTail=result;return result;
}

// Public Drive catalogue. Native downloads stream through a local URL, not a huge JS bridge string.
(function(root){
  const pending=new Map(),messages=new Map();let files=[],refreshing=false;
  const el=id=>document.getElementById(id),available=()=>!!root.AndroidKmlDownloads?.request;
  const sizeText=n=>n<1e6?Math.ceil(n/1024)+' KB':(n/1e6).toFixed(1).replace('.',',')+' MB';
  function request(msg){
    if(!available())return Promise.resolve({ok:false,error:'Preuzimanje iz foldera dostupno je u Android aplikaciji.'});
    return new Promise(resolve=>{
      const id=crypto.randomUUID(),t=setTimeout(()=>{pending.delete(id);resolve({ok:false,error:'Veza je istekla. Pokušaj ponovo.'});},msg.type==='download'?300000:60000);
      pending.set(id,{t,resolve});try{root.AndroidKmlDownloads.request(id,JSON.stringify(msg));}catch(e){reply(id,{ok:false,error:e.message});}
    });
  }
  function reply(id,result){const p=pending.get(id);if(p){clearTimeout(p.t);pending.delete(id);p.resolve(result);}}
  function local(id){try{return Object.entries(JSON.parse(localStorage.getItem(_LOCAL_KML_KEY)||'{}')).find(([name,s])=>s._driveSource?.id===id);}catch(e){return null;}}
  function render(){
    const list=el('kml-drive-list');if(!list)return;list.replaceChildren();
    const query=(el('kml-drive-search')?.value||'').trim().toLocaleLowerCase('bs');
    for(const s of files.filter(s=>s.name.toLocaleLowerCase('bs').includes(query))){
      const saved=local(s.id),state=messages.get(s.id),row=document.createElement('article');row.className='kml-drive-row';
      const icon=document.createElement('span');icon.className='kml-drive-icon';icon.textContent='KML';icon.setAttribute('aria-hidden','true');
      const copy=document.createElement('div');copy.className='kml-drive-copy';const name=document.createElement('b');name.textContent=s.name;
      const meta=document.createElement('small');meta.textContent=sizeText(s.size)+' · '+(saved?'Sačuvano na telefonu':'KARTA APP');
      const status=document.createElement('span');status.className='kml-drive-status';status.setAttribute('role','status');status.textContent=state?.message||(saved?'✓ Dostupno bez interneta':s.tooLarge?'Veće od 32 MB — podijeli sloj':'');
      copy.append(name,meta,status);const button=document.createElement('button');button.type='button';button.dataset.sourceId=s.id;
      button.textContent=state?.busy?(state.phase||'Preuzimam…'):saved?'Prikaži':'Preuzmi i dodaj';button.disabled=_layerImportBusy||!!state?.busy||!!s.tooLarge||!available();button.onclick=()=>start(s.id);
      row.append(icon,copy,button);list.append(row);
    }
    if(files.length&&!list.childElementCount){const p=document.createElement('p');p.textContent='Nema fajlova s tim nazivom.';list.append(p);}
    if(el('kml-drive-refresh'))el('kml-drive-refresh').disabled=refreshing||!available()||_layerImportBusy;
  }
  async function refresh(){
    if(refreshing)return;refreshing=true;render();const note=el('kml-drive-message');
    if(note)note.textContent=available()?'Provjeravam KML fajlove…':'Preuzimanje iz foldera dostupno je u Android aplikaciji.';
    try{
      const cached=await request({type:'list',refresh:false});if(cached.ok){files=(cached.files||[]).filter(valid);render();}
      const offline=navigator.onLine===false,r=offline?cached:await request({type:'list',refresh:true});
      if(r.ok)files=(r.files||[]).filter(valid);
      if(note)note.textContent=!r.ok?r.error:r.stale?r.error:offline?'Sačuvan popis · za nove fajlove uključi internet.':!files.length?'U folderu još nema KML fajlova. Dodaj ih na Drive i osvježi.':'';
    }finally{refreshing=false;render();}
  }
  function valid(s){return s&&/^[\w-]{10,100}$/.test(s.id)&&typeof s.name==='string'&&Number.isSafeInteger(s.size)&&s.size>0;}
  async function start(id){
    const source=files.find(s=>s.id===id);if(!source||_layerImportBusy||!available())return;
    const owner=sbUser?.id;if(!owner){showToast('Prijavi se prije dodavanja sloja');return;}
    const saved=local(id);if(!saved&&navigator.onLine===false){messages.set(id,{message:'Za preuzimanje novog sloja uključi internet.'});render();return;}
    _layerImportBusy=true;messages.set(id,{busy:true,message:saved?'Otvaram sačuvani sloj…':'Preuzimam '+source.name+'…'});
    document.querySelectorAll('#layer-import-modal .layer-pick').forEach(b=>b.disabled=true);render();
    try{
      if(saved){
        const [name,data]=saved,content=data.cacheKey?await _kmlcGet(data.cacheKey):data.content;
        if(typeof content!=='string')throw Error('Nedostaje sadržaj sloja. Ponovo učitaj KML fajl.');
        if(sbUser?.id!==owner)throw Error('Nalog je promijenjen; otvaranje je prekinuto');
        let layer=kmlLs.find(k=>!k._key&&(k._origName||k.name)===name);
        if(!layer){await _localKmlRestore();layer=kmlLs.find(k=>!k._key&&(k._origName||k.name)===name);}
        if(sbUser?.id!==owner)throw Error('Nalog je promijenjen; otvaranje je prekinuto');
        if(!layer)throw Error('Sloj nije moguće prikazati');
        layer.vis=true;layer.grp.addTo(map);_localKmlSaveAll(false);rndGraniceModal();
        const bounds=layer.grp.getBounds();if(bounds.isValid())map.fitBounds(bounds,{padding:[20,20]});closeLayerImport();
      }else{
        const r=await request({type:'download',sourceId:id});if(!r.ok)throw Error(r.error||'Preuzimanje nije uspjelo');
        if(sbUser?.id!==owner)throw Error('Nalog je promijenjen; uvoz je prekinut');
        if(r.url!=='https://appassets.androidplatform.net/drive-kml/'+id+'.kml')throw Error('Nepoznat izvor KML fajla');
        messages.set(id,{busy:true,phase:'Dodajem…',message:'Preuzeto · pripremam prikaz i čuvam sloj…'});render();
        const response=await fetch(r.url);if(!response.ok)throw Error('Preuzeti KML nije dostupan');
        const bytes=await response.arrayBuffer();if(bytes.byteLength!==source.size||bytes.byteLength>32*1024*1024)throw Error('Preuzeti KML nije potpun');
        const encoding=bytes.byteLength>=2&&new Uint8Array(bytes)[0]===255&&new Uint8Array(bytes)[1]===254?'utf-16le':bytes.byteLength>=2&&new Uint8Array(bytes)[0]===254&&new Uint8Array(bytes)[1]===255?'utf-16be':'utf-8';
        const content=new TextDecoder(encoding,{fatal:true}).decode(bytes);
        await new Promise(r=>setTimeout(r,0));
        await _localLayerKml(/\.kml$/i.test(source.name)?source.name:source.name+'.kml',content,owner,{id,size:source.size});
        await request({type:'release',sourceId:id});
      }
      messages.delete(id);if(el('layer-import-status'))el('layer-import-status').textContent='✓ Sloj je na karti i sačuvan za offline rad.';showToast('✓ KML sloj je spreman za offline rad');
    }catch(e){messages.set(id,{message:e.message||'KML nije dodan. Pokušaj ponovo.'});}
    finally{_layerImportBusy=false;document.querySelectorAll('#layer-import-modal .layer-pick').forEach(b=>b.disabled=false);render();}
  }
  root.KmlDownloads={request,reply,refresh,render,start};
})(typeof window!=='undefined'?window:globalThis);
