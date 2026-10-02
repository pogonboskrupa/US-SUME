// Lokalni KML/SHP uvoz. Bez servera; sačuvaj sadržaj prije dodavanja na kartu.
'use strict';
let _layerImportBusy = false;
let _layerCommitTail = Promise.resolve();
function openLayerImport() {
  document.getElementById('layer-import-modal').style.display = 'flex';
  layerImportTab('kml');
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
function _localLayerKml(name,content,owner=sbUser?.id) {
  const operation=_layerCommitTail.catch(()=>{}).then(()=>_localLayerKmlImpl(name,content,owner));
  _layerCommitTail=operation;return operation;
}
async function _localLayerKmlImpl(name,content,owner) {
  if(sbUser?.id!==owner)throw Error('Nalog je promijenjen; uvoz je prekinut');
  const doc=new DOMParser().parseFromString(content,'text/xml');
  if(doc.querySelector('parsererror') || !doc.querySelector('kml'))throw Error('Neispravan KML fajl');
  const store=JSON.parse(localStorage.getItem(_LOCAL_KML_KEY)||'{}');
  let unique=name,n=2;
  while(Object.prototype.hasOwnProperty.call(store,unique)||kmlLs.some(k=>!k._key&&(k._origName||k.name)===unique))unique=name.replace(/\.kml$/i,'')+' ('+(n++)+').kml';
  const col=KCOLS[kmlCI%KCOLS.length],grp=pkml(doc,col);
  if(!grp.getLayers().length)throw Error('KML nema tačaka, linija ili poligona za prikaz');
  if(!await _localKmlSaveContent(unique,content,col,owner))throw Error('Sloj nije trajno sačuvan — provjeri slobodnu memoriju');
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
