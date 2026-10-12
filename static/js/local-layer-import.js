// Lokalni KML/SHP uvoz. Bez servera; sačuvaj sadržaj prije dodavanja na kartu.
'use strict';
let _layerImportBusy = false;
let _layerCommitTail = Promise.resolve();
function openLayerImport() {
  document.getElementById('layer-import-modal').style.display = 'flex';
  layerImportTab('kml');
  layerImportRenderList();
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
function _localLayerKml(name,content,owner=sbUser?.id,driveSource=null,fmt='') {
  const operation=_layerCommitTail.catch(()=>{}).then(()=>_localLayerKmlImpl(name,content,owner,driveSource,fmt));
  _layerCommitTail=operation;return operation;
}
async function _localLayerKmlImpl(name,content,owner,driveSource,fmt='') {
  if(sbUser?.id!==owner)throw Error('Nalog je promijenjen; uvoz je prekinut');
  const doc=new DOMParser().parseFromString(content,'text/xml');
  if(doc.querySelector('parsererror') || !doc.querySelector('kml'))throw Error('Neispravan KML fajl');
  const store=JSON.parse(localStorage.getItem(_LOCAL_KML_KEY)||'{}');
  let unique=name,n=2;
  while(Object.prototype.hasOwnProperty.call(store,unique)||kmlLs.some(k=>!k._key&&(k._origName||k.name)===unique))unique=name.replace(/\.kml$/i,'')+' ('+(n++)+').kml';
  const col=KCOLS[kmlCI%KCOLS.length],grp=pkml(doc,col);
  if(!grp.getLayers().length)throw Error('KML nema tačaka, linija ili poligona za prikaz');
  if(!await _localKmlSaveContent(unique,content,col,owner,driveSource,fmt))throw Error('Sloj nije trajno sačuvan — provjeri slobodnu memoriju');
  if(sbUser?.id!==owner)throw Error('Nalog je promijenjen; uvoz je prekinut');
  kmlCI++;
  const layer={name:unique,_origName:unique,_driveSource:driveSource,fmt,grp,col,dash:'',weight:2,opacity:.9,vis:true,fill:false,fillCol:col,fillPattern:'solid',fillOpacity:.35,tag:name.match(/^(\d+)/)?.[1]||'',_loadedAt:Date.now()};
  layer.onlyPolygon=globalThis.GithubLayers?.defaultOnlyPolygon(layer)===true;
  kmlLs.push(layer);
  if(!layer.onlyPolygon||globalThis.GithubLayers?.selecting())grp.addTo(map);
  _glCollapsed.delete('Lokalni / —');rndGraniceModal();
  try{const bounds=grp.getBounds();if(bounds.isValid())map.fitBounds(bounds,{padding:[20,20]});}catch(e){}
  return unique;
}
async function layerImportFiles(input,type) {
  if(_layerImportBusy)return;
  const files=Array.from(input.files || []);input.value='';if(!files.length)return;
  const owner=sbUser?.id,status=document.getElementById('layer-import-status');
  _layerImportBusy=true;status.hidden=false;status.dataset.ton='rad';status.textContent='Učitavam i pripremam sloj…';
  document.querySelectorAll('#layer-import-modal .layer-pick').forEach(b=>b.disabled=true);
  try {
    const rows=type==='shp'?await _layerReadShp(files,document.getElementById('layer-shp-crs').value):await Promise.all(files.map(async f=>({name:f.name,content:await f.text()})));
    if(sbUser?.id!==owner)throw Error('Nalog je promijenjen; uvoz je prekinut');
    for(const row of rows)await _localLayerKml(row.name,row.content,owner,null,type==='shp'?'shp':'');
    status.dataset.ton='ok';
    status.textContent='✓ '+_layerBrojRijec(rows.length,'sloj učitan','sloja učitana','slojeva učitano')+' — prikazano na karti i sačuvano za offline rad.';
    showToast('✓ Slojevi su učitani i sačuvani na telefonu');
  } catch(e) {status.dataset.ton='greska';status.textContent='⚠ '+e.message;showToast('⚠ Uvoz nije završen: '+e.message);}
  finally {_layerImportBusy=false;document.querySelectorAll('#layer-import-modal .layer-pick').forEach(b=>b.disabled=false);layerImportRenderList();}
}

// ── Pregled uvezenih slojeva u samom prozoru za uvoz ─────────────────────────
// Ranije je na dnu pisalo samo "Slojeve poslije pronađi u Granicama odjela /
// Oznakama" — korisnik nije mogao provjeriti da li je fajl stvarno dodan bez
// odlaska na drugi ekran. Lista radi nad istim kmlLs i istim togK/delK kao
// Granice i Preglednik oznaka, pa se stanje nigdje ne razilazi.
function _layerBrojRijec(n,jed,dva,mn){const d=n%10,s=n%100;return n+' '+(d===1&&s!==11?jed:d>=2&&d<=4&&(s<12||s>14)?dva:mn);}
function _layerIzvor(k){return k._driveSource?'KARTA APP':k.fmt==='shp'?'SHP':'KML';}
function _layerVrijeme(ts){
  if(!ts)return '';const d=new Date(ts),p=n=>String(n).padStart(2,'0');
  return p(d.getDate())+'.'+p(d.getMonth()+1)+'. '+p(d.getHours())+':'+p(d.getMinutes());
}
// Lokalni slojevi (bez _key = nisu serverski/bucket), najnoviji prvi; indeks
// ostaje STVARNI indeks u kmlLs (pozicija u listi nije indeks — vidi CLAUDE.md).
function _layerLokalni(){
  if(typeof kmlLs==='undefined')return [];
  return kmlLs.map((k,i)=>({k,i})).filter(x=>!x.k._key).sort((a,b)=>(b.k._loadedAt||0)-(a.k._loadedAt||0));
}
let _layerListSve=false;
// Otvoreni editori stila se pamte po OBJEKTU sloja, ne po indeksu — indeks se
// pomjeri čim se neki sloj ukloni.
const _layerImportStil=new Set();
function layerImportStil(i){
  const k=kmlLs[i];if(!k)return;
  _layerImportStil.has(k)?_layerImportStil.delete(k):_layerImportStil.add(k);
  layerImportRenderList();
  if(_layerImportStil.has(k))document.querySelector('#layer-loaded-list .layer-row[data-layer="'+i+'"]')?.scrollIntoView({block:'nearest',behavior:'smooth'});
}
function layerImportRenderList(){
  const list=document.getElementById('layer-loaded-list'),cnt=document.getElementById('layer-loaded-count');
  if(!list)return;
  const rows=_layerLokalni(),esc=typeof _escHtml==='function'?_escHtml:(v=>String(v));
  if(cnt)cnt.textContent=rows.length?'('+rows.length+')':'';
  if(!rows.length){list.innerHTML='<p class="layer-empty">Još nema uvezenih slojeva. Izaberi fajl iznad — pojavit će se ovdje i na karti.</p>';return;}
  const MAX=6,vidljivi=_layerListSve?rows:rows.slice(0,MAX);
  list.innerHTML=vidljivi.map(({k,i})=>{
    const n=typeof _kmlFeatureCount==='function'?_kmlFeatureCount(k.grp):0,izv=_layerIzvor(k);
    const stil=_layerImportStil.has(k)&&typeof _layerStyleControls==='function';
    return '<div class="layer-row'+(k.vis?'':' is-hidden')+(stil?' is-editing':'')+'" data-layer="'+i+'">'
      +'<span class="layer-swatch" style="background:'+esc(k.col||'#64748b')+'" aria-hidden="true"></span>'
      +'<span class="layer-row-copy"><b>'+esc(k.name)+'</b><small><i class="layer-src">'+izv+'</i>'+_layerBrojRijec(n,'objekat','objekta','objekata')
      +(k._loadedAt?' · '+_layerVrijeme(k._loadedAt):'')+(k.vis?'':' · sakriven')+'</small></span>'
      +'<span class="layer-row-actions">'
      +'<button type="button" onclick="layerImportStil('+i+')" aria-expanded="'+stil+'" aria-label="Linija i ispuna sloja '+esc(k.name)+'">'+(stil?'Zatvori stil':'Linija i ispuna')+'</button>'
      +'<button type="button" onclick="layerImportToggle('+i+')" aria-label="'+(k.vis?'Sakrij':'Prikaži')+' sloj '+esc(k.name)+'">'+(k.vis?'Sakrij':'Prikaži')+'</button>'
      +'<button type="button" onclick="layerImportZoom('+i+')" aria-label="Prikaži sloj '+esc(k.name)+' na karti">Na karti</button>'
      +'<button type="button" class="layer-del" onclick="layerImportDelete('+i+')" aria-label="Ukloni sloj '+esc(k.name)+'">Ukloni</button>'
      +'</span>'+(stil?'<div class="layer-row-style">'+_layerStyleControls(i)+'</div>':'')+'</div>';
  }).join('')+(rows.length>MAX?'<button type="button" class="layer-more" onclick="_layerListSve=!_layerListSve;layerImportRenderList()">'+(_layerListSve?'Prikaži manje':'Prikaži sve ('+rows.length+')')+'</button>':'');
}
function layerImportToggle(i){if(typeof togK==='function'&&kmlLs[i])togK(i);layerImportRenderList();}
function layerImportZoom(i){
  const k=kmlLs[i];if(!k||!k.grp)return;
  if(!k.vis&&typeof togK==='function')togK(i);
  try{const b=k.grp.getBounds();if(b.isValid())map.fitBounds(b,{padding:[30,30]});}catch(e){}
  closeLayerImport();
}
async function layerImportDelete(i){
  const k=kmlLs[i];if(!k)return;
  const ok=typeof _dlgConfirm==='function'?await _dlgConfirm('Ukloniti sloj „'+k.name+'“ sa ovog telefona? Original fajl ostaje tamo odakle si ga učitao.',{title:'Ukloni sloj',danger:true,okLabel:'Ukloni'}):true;
  if(!ok)return;
  const j=kmlLs.indexOf(k);if(j<0)return;   // lista se mogla promijeniti dok je dijalog bio otvoren
  _layerImportStil.delete(k);
  if(delK(j)!==false)showToast('Sloj uklonjen');
  layerImportRenderList();window.KmlDownloads?.render?.();
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
  const pending=new Map(),messages=new Map();let files=[],githubFiles=[],refreshing=false,githubRefreshing=false;
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
  function stored(){try{return Object.entries(JSON.parse(localStorage.getItem(_LOCAL_KML_KEY)||'{}'));}catch(e){return [];}}
  function local(id){return stored().find(([name,s])=>s._driveSource?.id===id)||null;}
  // Isti fajl objavljen u novijem releaseu ima NOV asset id. Bez poređenja po
  // nazivu preuzet sloj bi izgledao nepreuzet čim se objavi nova verzija.
  const githubId=id=>String(id||'').startsWith('github-kml-');
  function localByName(s){return stored().find(([name,d])=>d._driveSource&&githubId(d._driveSource.id)===githubId(s.id)&&d._driveSource.name===s.name)||null;}
  // GitHub vraća releaseove od najnovijeg; isti naziv iz starijih releaseova se
  // ne nudi ponovo (stariji primjerak je izgledao kao nepreuzet sloj).
  function newestOnly(items){const seen=new Set();return items.filter(s=>{const k=s.name.toLocaleLowerCase('bs');if(seen.has(k))return false;seen.add(k);return true;});}
  function renderList(id,items,github=false){
    const list=el(id);if(!list)return;list.replaceChildren();
    const query=(github?'':el('kml-drive-search')?.value||'').trim().toLocaleLowerCase('bs');
    for(const s of (github?newestOnly(items):items).filter(s=>s.name.toLocaleLowerCase('bs').includes(query))){
      const saved=local(s.id),older=!saved&&localByName(s),state=messages.get(s.id),row=document.createElement('article');row.className='kml-drive-row';
      const icon=document.createElement('span');icon.className='kml-drive-icon';icon.textContent='KML';icon.setAttribute('aria-hidden','true');
      const copy=document.createElement('div');copy.className='kml-drive-copy';const name=document.createElement('b');name.textContent=s.name;
      const meta=document.createElement('small');meta.textContent=sizeText(s.size)+' · '+(saved?'Sačuvano na telefonu':older?'Na telefonu je starija verzija':github?'GitHub · '+(s.release||'KARTE'):'KARTA APP');
      const status=document.createElement('span');status.className='kml-drive-status';status.setAttribute('role','status');status.textContent=state?.message||(saved?'✓ Preuzeto · dostupno bez interneta':older?'Objavljena je nova verzija'+(s.release?' ('+s.release+')':''):s.tooLarge?'Veće od 32 MB — podijeli sloj':'');
      copy.append(name,meta,status);const button=document.createElement('button');button.type='button';button.dataset.sourceId=s.id;
      button.textContent=state?.busy?(state.phase||'Preuzimam…'):saved?'Prikaži':older?'Ažuriraj':'Preuzmi i dodaj';if(saved)button.classList.add('kml-drive-saved');button.disabled=_layerImportBusy||!!state?.busy||!!s.tooLarge||!available();button.onclick=()=>start(s.id);
      row.append(icon,copy,button);list.append(row);
    }
    if(items.length&&!list.childElementCount){const p=document.createElement('p');p.textContent='Nema fajlova s tim nazivom.';list.append(p);}
  }
  function render(){
    renderList('kml-drive-list',files);renderList('kml-github-list',githubFiles,true);
    if(el('kml-github-refresh'))el('kml-github-refresh').disabled=githubRefreshing||!available()||_layerImportBusy;
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
    const source=[...files,...githubFiles].find(s=>s.id===id);if(!source||_layerImportBusy||!available())return;
    const owner=sbUser?.id;if(!owner){showToast('Prijavi se prije dodavanja sloja');return;}
    let saved=local(id);const older=!saved&&localByName(source);
    // Bez interneta stara verzija je i dalje upotrebljiva — prikaži nju.
    if(!saved&&older&&navigator.onLine===false)saved=older;
    if(!saved&&navigator.onLine===false){messages.set(id,{message:'Za preuzimanje novog sloja uključi internet.'});render();return;}
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
        const bounds=layer.grp.getBounds();if(bounds.isValid())map.fitBounds(bounds,{padding:[20,20]});closeLayerImport();closeLayerSheet();
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
        const added=await _localLayerKml(/\.kml$/i.test(source.name)?source.name:source.name+'.kml',content,owner,{id,size:source.size,name:source.name,release:source.release||'',provider:id.startsWith('github-kml-')?'github':'drive'});
        if(older)replaceOlder(older[0],added);
        await request({type:'release',sourceId:id});
        if(id.startsWith('github-kml-'))closeLayerSheet();
      }
      messages.delete(id);{const st=el('layer-import-status');if(st){st.hidden=false;st.dataset.ton='ok';st.textContent='✓ Sloj je na karti i sačuvan za offline rad.';}}showToast('✓ KML sloj je spreman za offline rad');root.DoznakaProjectBoundary?.afterDownload();
    }catch(e){messages.set(id,{message:e.message||'KML nije dodan. Pokušaj ponovo.'});}
    finally{_layerImportBusy=false;document.querySelectorAll('#layer-import-modal .layer-pick').forEach(b=>b.disabled=false);render();if(typeof layerImportRenderList==='function')layerImportRenderList();}
  }
  // Nova verzija zamjenjuje staru tek kad je trajno sačuvana; stil i naziv
  // koje je korisnik podesio prelaze na nju.
  function replaceOlder(oldName,newName){
    const old=kmlLs.find(k=>!k._key&&(k._origName||k.name)===oldName),neu=kmlLs.find(k=>!k._key&&(k._origName||k.name)===newName);
    if(!old||!neu||old===neu)return;
    for(const p of ['name','col','dash','weight','opacity','fill','fillCol','fillPattern','fillOpacity','tag','onlyPolygon'])if(old[p]!==undefined)neu[p]=old[p];
    if(old.vis===false){neu.vis=false;map.removeLayer(neu.grp);}
    delK(kmlLs.indexOf(old));
    const i=kmlLs.indexOf(neu);if(i>=0){applyKmlStyle(i);try{saveKmlStyles();}catch(e){}}
    root.GithubLayers?.render();
  }
  async function refreshGithub(){
    if(githubRefreshing)return;githubRefreshing=true;render();const note=el('kml-github-message');
    if(note)note.textContent=available()?'Provjeravam GitHub slojeve…':'Preuzimanje slojeva dostupno je u Android aplikaciji.';
    try{
      const cached=await request({type:'list',provider:'github',refresh:false});if(cached.ok){githubFiles=(cached.files||[]).filter(valid);render();}
      const offline=navigator.onLine===false,r=offline?cached:await request({type:'list',provider:'github',refresh:true});
      if(r.ok)githubFiles=(r.files||[]).filter(valid);
      if(note)note.textContent=!r.ok?r.error:r.stale?r.error:offline?'Sačuvan popis · za nove fajlove uključi internet.':!githubFiles.length?'Još nema KML slojeva. Objavi ih u KARTE → Releases i osvježi.':'';
    }finally{githubRefreshing=false;render();}
  }
  root.KmlDownloads={request,reply,refresh,refreshGithub,render,start,newestOnly};
})(typeof window!=='undefined'?window:globalThis);

// Prikaz preuzetih GitHub slojeva: koristi iste grupe i stanje kao preglednik oznaka.
(function(root){
  const normal=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  function role(k){
    if(!k?._driveSource?.id?.startsWith('github-kml-'))return '';
    const text=normal([k._driveSource.name,k._driveSource.release,k._origName,k.name].join(' '));
    return /granice|granic[ae]|boundary/.test(text)?'boundaries':/kamionsk|putevi|roads/.test(text)?'roads':'';
  }
  function layers(type){return typeof kmlLs==='undefined'?[]:kmlLs.filter(k=>k.grp&&role(k)===type);}
  function isBoundary(k){if(!k?.grp||!(role(k)==='boundaries'||/granic|boundary/.test(normal([k._origName,k.name].join(' ')))))return false;let found=false;const walk=g=>g.eachLayer?.(l=>{if(l._kmlIsPolygon)found=true;else if(l.eachLayer)walk(l);});walk(k.grp);return found;}
  // Preuzete granice počinju u režimu izbora poligona pri svakom učitavanju aplikacije.
  // Promjena tokom iste sesije ostaje na snazi; ostali slojevi pamte svoj izbor.
  function defaultOnlyPolygon(k){return !!k?._driveSource?.id&&isBoundary(k)?true:k?.onlyPolygon===true;}
  function selecting(){return !!(root.DepartmentReport?.isDrawing()||(typeof _dozKmlSelMode!=='undefined'&&_dozKmlSelMode)||(typeof _dozDrawType!=='undefined'&&_dozDrawType==='__boundary__'));}
  function sync(){
    if(typeof map==='undefined'||typeof kmlLs==='undefined')return;
    const active=selecting();
    for(const k of kmlLs.filter(k=>isBoundary(k)&&k.onlyPolygon)){
      if(active){if(!map.hasLayer(k.grp))k.grp.addTo(map);}
      else if(map.hasLayer(k.grp))map.removeLayer(k.grp);
    }
    root.DepartmentReport?.refreshSelection?.();
  }
  function onlyPolygon(show,index){
    if(selecting()){showToast('Završi izbor poligona prije promjene prikaza');return;}
    const all=index===undefined? kmlLs.filter(isBoundary):[kmlLs[index]].filter(isBoundary);
    const previous=all.map(k=>k.onlyPolygon);all.forEach(k=>k.onlyPolygon=!!show);
    try{saveKmlStyles();}catch(e){all.forEach((k,i)=>k.onlyPolygon=previous[i]);showToast('Izbor nije sačuvan — provjeri memoriju uređaja');return;}
    // Uobičajeni prikaz ostaje isti nakon isključivanja ove opcije.
    all.forEach(k=>{if(!k.onlyPolygon&&k.vis!==false)k.grp.addTo(map);});sync();rndGraniceModal();
  }
  function render(){
    if(typeof map==='undefined')return;
    sync();
    for(const [type,id] of [['roads','putevi-toggle'],['boundaries','granice-toggle']]){
      const all=layers(type),visible=all.filter(k=>k.vis!==false&&map.hasLayer(k.grp)),cb=document.getElementById(id);
      if(cb){cb.disabled=!all.length||(type==='boundaries'&&all.every(k=>k.onlyPolygon));cb.checked=!!all.length&&visible.length===all.length;cb.indeterminate=visible.length>0&&visible.length<all.length;}
      const status=document.getElementById('github-'+type+'-status');if(status)status.textContent=all.length?(type==='boundaries'&&all.every(k=>k.onlyPolygon)?'Samo za poligon':`${visible.length}/${all.length} prikazano`):'Preuzmi sloj iznad';
      // Preuzeti sloj zamjenjuje stari ugrađeni prikaz, bez dvostrukih linija.
      const old=type==='roads'?[typeof _puteviLayerBg!=='undefined'&&_puteviLayerBg,typeof _puteviLayerFg!=='undefined'&&_puteviLayerFg]:[typeof _geojsonLayer!=='undefined'&&_geojsonLayer];
      if(all.length)old.filter(Boolean).forEach(l=>{if(map.hasLayer(l))map.removeLayer(l);});
    }
    const all=layers('boundaries'),slider=document.getElementById('ls-granice-opacity');if(slider){slider.disabled=!all.length;if(all.length)slider.value=all[0].opacity??.9;}
    const boundaries=kmlLs.filter(isBoundary),cb=document.getElementById('granice-only-polygon');
    if(cb){const n=boundaries.filter(k=>k.onlyPolygon).length;cb.disabled=!boundaries.length||selecting();cb.checked=!!boundaries.length&&n===boundaries.length;cb.indeterminate=n>0&&n<boundaries.length;}
  }
  function toggle(type,show){
    if(typeof _dozKmlSelMode!=='undefined'&&_dozKmlSelMode){showToast('Završi izbor granice prije promjene slojeva');return;}
    for(const k of layers(type)){k.vis=!!show;if(show)k.grp.addTo(map);else map.removeLayer(k.grp);}
    _localKmlSaveAll(false);saveKmlStyles();rndGraniceModal();
  }
  function opacity(value){for(const k of layers('boundaries')){k.opacity=Math.max(0,Math.min(1,Number(value)));applyKmlStyle(kmlLs.indexOf(k));}_localKmlSaveAll(false);saveKmlStyles();render();}
  root.GithubLayers={role,layers,render,toggle,opacity,isBoundary,defaultOnlyPolygon,onlyPolygon,selecting,sync};
  // Druge liste imaju svoje dugme Prikaži; ista postavka vrijedi i za njih.
  map.on?.('layeradd',e=>{if(typeof kmlLs!=='undefined'&&kmlLs.some(k=>k.grp===e.layer&&k.onlyPolygon))queueMicrotask(sync);});render();
})(typeof window!=='undefined'?window:globalThis);
