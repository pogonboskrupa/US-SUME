// Lokalni terenski pregled i prenosiva kopija: bez mreže i automatskog slanja.
let _fieldPanelToken=0;
function _fieldJson(key,fallback) {
  const raw=localStorage.getItem(key);
  if(!raw)return fallback;
  return JSON.parse(raw);
}
function _fieldScope() {
  const doz=_dozGpsOn || _activeTab==='doznaka';
  const id=doz ? (_dozGpsOn?_dozGpsProjId:_dozSelId) : _aktivniProjektId;
  const p=doz ? _dozOdjeli.find(p=>p.id===id) : _projekti.find(p=>p.id===id);
  const vlakaId=doz?(_dozLinkedProjektId || id):id;
  return {id,p,doz,vlakaId};
}
function _fieldBounds(scope) {
  if(scope.doz && scope.p?.boundary_geojson) {
    try {const gj=typeof scope.p.boundary_geojson==='string'?JSON.parse(scope.p.boundary_geojson):scope.p.boundary_geojson;
      const bounds=L.geoJSON(gj).getBounds();if(bounds.isValid())return {bounds,exact:true};}catch(e){}
  }
  const drawn=!scope.doz&&typeof ProjectTerrain!=='undefined'?ProjectTerrain.dataFor(scope.id)?.ring:null;
  if(drawn)return {bounds:L.latLngBounds(drawn),exact:true};
  const name=String(scope.p?.odjel || scope.p?.name || '').trim().toLowerCase();
  const boundary=name && graniceOdjeli.find(o=>String(o.name).trim().toLowerCase()===name);
  if(boundary?.bounds?.isValid())return {bounds:boundary.bounds,exact:true};
  const pts=vlake.filter(v=>v.projektId===scope.vlakaId).flatMap(v=>v.pts.map(p=>[p.la,p.lo]));
  if(pts.length)return {bounds:L.latLngBounds(pts).pad(0.05),exact:false};
  return {bounds:null,exact:false};
}
function _fieldTileRange(bounds,z) {
  const max=2**z-1;
  const x=lon=>Math.max(0,Math.min(max,Math.floor((lon+180)/360*2**z)));
  const y=lat=>{const r=Math.max(-85.0511,Math.min(85.0511,lat))*Math.PI/180;
    return Math.max(0,Math.min(max,Math.floor((1-Math.log(Math.tan(r)+1/Math.cos(r))/Math.PI)/2*2**z)));};
  return {x0:x(bounds.getWest()),x1:x(bounds.getEast()),y0:y(bounds.getNorth()),y1:y(bounds.getSouth())};
}
async function _fieldTileCoverage(bounds,z) {
  const key=_activeLayerKey(),layer=TL[key];
  if(key?.startsWith('_sqlite_')) {
    const sl=_sqlLayers[Number(key.slice(8))],b=String(sl?.meta?.bounds || '').split(',').map(Number);
    const covers=b.length===4&&b.every(Number.isFinite)&&b[0]<=bounds.getWest()&&b[1]<=bounds.getSouth()&&b[2]>=bounds.getEast()&&b[3]>=bounds.getNorth();
    return {ok:false,text:'Lokalna karta '+(sl?.name || '')+' je otvorena. '+(covers?'Metapodaci obuhvataju projekat, ali nedostajuće pločice nisu provjerene.':'Metapodaci ne potvrđuju pokrivenost cijelog projekta.')};
  }
  if(!layer?.getTileUrl || layer.options.tms || layer.options.layers) return {ok:false,text:'Odabrana podloga traži zasebnu provjeru pokrivenosti.'};
  const r=_fieldTileRange(bounds,z),total=(r.x1-r.x0+1)*(r.y1-r.y0+1);
  if(total>2048)return {ok:false,text:'Područje ima '+total+' pločica — odaberi manji odjel ili niži zoom.'};
  const copy=Object.create(layer);copy._tileZoom=z;copy._globalTileRange={max:{y:2**z-1}};
  let found=0,urls=[];
  for(let x=r.x0;x<=r.x1;x++)for(let y=r.y0;y<=r.y1;y++)urls.push(copy.getTileUrl({x,y,z}));
  for(let i=0;i<urls.length;i+=16) {
    const result=await Promise.all(urls.slice(i,i+16).map(u=>caches.match(u)));
    found+=result.filter(v=>v?.ok && (v.headers.get('content-type') || '').startsWith('image/')).length;
    await new Promise(resolve=>setTimeout(resolve,0));
  }
  return {ok:found===total,text:key+' · zoom '+z+' · '+found+'/'+total+' pločica lokalno. Drugi zoom nivoi nisu provjereni.'};
}
function openFieldPanel() {
  closeMenuDropdown();
  const panel=document.getElementById('field-panel');panel.style.display='flex';
  fieldCheckReady();
}
function closeFieldPanel() {_fieldPanelToken++;document.getElementById('field-panel').style.display='none';}
async function fieldCheckReady() {
  const token=++_fieldPanelToken,uid=sbUser?.id,scope=_fieldScope(),out=document.getElementById('field-check');
  out.textContent='Provjeravam lokalne podatke…';
  try {
    if(!uid || !scope.p) {out.textContent='Prvo odaberi projekat ili odjel u tabu Doznaka.';return;}
    await FieldStore.init();
    const extent=_fieldBounds(scope),items=[];
    const own=vlake.filter(v=>v.projektId===scope.vlakaId),others=_kvcLoad(scope.vlakaId);
    const doz=_OL.load(_OL.DOZ_MEMBERS)?.[uid+':'+scope.id];
    const pending=FieldStore.view(uid,scope.id);
    const last=scope.doz ? doz?.ts : Math.max(0,..._serverPrimljenoUcitaj().filter(p=>p.projektId===scope.id).map(p=>p.ts));
    items.push({ok:true,text:'Projekat: '+(scope.p.name || scope.p.gj || '')+' · '+(scope.p.odjel || '')});
    items.push({ok:extent.exact,text:extent.exact?'Granica odjela dostupna lokalno.':'Granica nije potvrđena. Provjera podloge koristi samo obuhvat vlaka, ako postoji.'});
    items.push({ok:true,text:own.length+' mojih vlaka · '+others.length+' vlaka kolega · '+pending.length+' GPS tačaka čeka ručno slanje.'});
    if(scope.doz)items.push({ok:!!doz,text:doz?'Pojasevi, oznake i članovi u kešu: '+(doz.tracks?.length || 0)+' GPS tačaka.':'Podaci odjela nisu preuzeti u lokalni keš.'});
    if(scope.p.korisnik_id!==uid && !scope.doz)items.push({ok:!!last,text:last?'Zadnji lokalni prijem: '+new Date(last).toLocaleString():'Nema potvrđenog prijema podataka kolega; osvježi panel Server dok imaš vezu.'});
    if(localStorage.getItem(_OFFLINE_DL_INCOMPLETE_KEY))items.push({ok:false,text:'Jedno preuzimanje karte nije završeno; provjeri ga u Offline kartama.'});
    const z=Number(document.getElementById('field-zoom').value);
    if(extent.bounds)items.push(await _fieldTileCoverage(extent.bounds,z));
    else items.push({ok:false,text:'Bez granice ili vlaka ne mogu potvrditi podlogu ovog projekta.'});
    if(token!==_fieldPanelToken || sbUser?.id!==uid)return;
    out.innerHTML=items.map(i=>'<div class="field-row '+(i.ok?'good':'warn')+'">'+(i.ok?'✓ ':'⚠ ')+_escHtml(i.text)+'</div>').join('')+
      '<strong>'+ (items.every(i=>i.ok)?'Spremno za provjereni obuhvat i zoom.':'Priprema nije potpuno potvrđena — pogledaj upozorenja.')+'</strong>';
  } catch(e) {if(token===_fieldPanelToken)out.textContent='⚠ Lokalna provjera nije uspjela: '+e.message;}
}
function _fieldRecordId(row) {return row._qid || row.id || (row.type?row.type+'::'+JSON.stringify(row.payload):row.nm+'::'+(row.projekt_id || row.projektId || ''));}
function _fieldMerge(current,incoming) {
  const ids=new Set(current.map(_fieldRecordId));
  return current.concat(incoming.filter(r=>{const key=_fieldRecordId(r);if(ids.has(key))return false;ids.add(key);return true;}));
}
async function _fieldChecksum(data) {
  const bytes=new TextEncoder().encode(JSON.stringify(data));
  if(!crypto.subtle)throw new Error('Ovaj WebView ne podržava provjeru kopije; ažuriraj WebView');
  const hash=await crypto.subtle.digest('SHA-256',bytes);
  return Array.from(new Uint8Array(hash),b=>b.toString(16).padStart(2,'0')).join('');
}
async function _fieldMakeBackup() {
  const uid=sbUser?.id,scope=_fieldScope();
  if(!uid || !scope.p)throw new Error('Odaberi projekat ili odjel');
  await (_dozProcessGpsPoint._tail || Promise.resolve());
  const data={format:'US-SUME-project-backup',schema:1,uid,createdAt:new Date().toISOString(),
    appVersion:APP_VER,scope:{id:scope.id,doz:scope.doz,project:scope.p,linkedProject:scope.doz?_projekti.find(p=>p.id===scope.vlakaId)||null:null},
    vlake:vlake.filter(v=>v.projektId===scope.vlakaId).map(v=>({id:v.sbId,nm:v.nm,br:v.br,kr:v.kr,pts:v.pts,
      boja:v.color,projekt_id:v.projektId,updated_at:v.updatedAt,lager:v.lager,strana:v.strana,lager_pt:v.lagerPt,na_putu:v.naPutu})),
    projectPolygon:typeof ProjectTerrain!=='undefined'?(ProjectTerrain.dataFor(scope.vlakaId)?.ring?ProjectTerrain.dataFor(scope.vlakaId):null):null,
    kolege:_kvcLoad(scope.vlakaId),
    queue:_OL.loadQueue(true).filter(op=>(!op._uid || op._uid===uid) &&
      [op.payload?.projekt_id,op.payload?.project_id,op.payload?.id].some(id=>id===scope.id || id===scope.vlakaId)),
    tracks:_fieldJson(_TRAG_REG_KEY,[]).filter(t=>t.projektId===scope.id || (!t.projektId && t.gj===scope.p.gj && t.odjel===scope.p.odjel)),
    measurements:_fieldJson(_MSR_REG_KEY,[]).filter(t=>t.projektId===scope.id || (!t.projektId && t.gj===scope.p.gj && t.odjel===scope.p.odjel)),
    dozLayers:_OL.load(_OL.DOZ_MEMBERS)?.[uid+':'+scope.id] || null,
    trees:_fieldJson(_DOZ_TREES_DATA_KEY,{})[scope.id] || null,
    kml:typeof _localLayerSnapshot==='function'?await _localLayerSnapshot():_fieldJson(_LOCAL_KML_KEY,{}),
    geojson:_fieldJson(_GEOJSON_LS_KEY,null),
    boundary:_fieldBounds(scope).exact ? graniceOdjeli.filter(o=>String(o.name).trim().toLowerCase()===String(scope.p.odjel||scope.p.name||'').trim().toLowerCase()).map(o=>({name:o.name,ring:o.ring})):[],
    journal:await FieldStore.exportOwner(uid,scope.id),
    excluded:['rasterske podloge / MBTiles / SQLiteDB / OPFS','fotografije i referentne slike']};
  if(sbUser?.id!==uid)throw new Error('Nalog je promijenjen; izvoz je zaustavljen');
  // Odvoji od živih nizova: novi GPS fiks ne smije mijenjati već hashiranu kopiju.
  const stable=JSON.parse(JSON.stringify(data));
  return {data:stable,sha256:await _fieldChecksum(stable)};
}
async function fieldExportBackup() {
  try {
    const copy=await _fieldMakeBackup(),a=document.createElement('a');
    a.href=URL.createObjectURL(new Blob([JSON.stringify(copy)],{type:'application/json'}));
    a.download='US-SUME-projekat-'+copy.data.scope.id+'-'+Date.now()+'.json';a.click();
    setTimeout(()=>URL.revokeObjectURL(a.href),30000);
    showToast('✓ Kopija pripremljena — sačuvaj fajl izvan aplikacije');
  }catch(e){showToast('⚠ Izvoz nije uspio: '+e.message);}
}
async function _fieldValidateBackup(copy) {
  const d=copy?.data;
  if(d?.format!=='US-SUME-project-backup' || d.schema!==1 || d.uid!==sbUser?.id || !d.scope?.id || d.scope.project?.id!==d.scope.id)
    throw new Error('Nepodržana kopija ili kopija drugog naloga');
  if(await _fieldChecksum(d)!==copy.sha256)throw new Error('Kopija je oštećena ili izmijenjena');
  if(typeof d.scope.doz!=='boolean' || !/^[a-zA-Z0-9_-]{1,120}$/.test(d.scope.id) || ['__proto__','constructor','prototype'].includes(d.scope.id))throw new Error('Neispravan identitet projekta');
  if(d.scope.linkedProject && (!d.scope.doz || !/^[a-zA-Z0-9_-]{1,120}$/.test(d.scope.linkedProject.id) || ['__proto__','constructor','prototype'].includes(d.scope.linkedProject.id)))throw new Error('Neispravan povezani projekat');
  if(!d.journal || !Array.isArray(d.journal.pending) || !Array.isArray(d.journal.points) || !Array.isArray(d.journal.sessions))throw new Error('Nedostaje GPS dnevnik');
  for(const key of ['vlake','kolege','queue','tracks','measurements'])if(!Array.isArray(d[key]))throw new Error('Nedostaje '+key);
  for(const v of d.vlake)if(![d.scope.id,d.scope.linkedProject?.id].includes(v.projekt_id) || !Array.isArray(v.pts) || v.pts.some(p=>!Number.isFinite(p.la)||Math.abs(p.la)>90||!Number.isFinite(p.lo)||Math.abs(p.lo)>180))throw new Error('Neispravna geometrija vlake');
  if(d.projectPolygon && (typeof ProjectTerrain==='undefined'||!ProjectTerrain.validateRing(d.projectPolygon.ring).ring))throw new Error('Neispravan poligon projekta');
  if(d.queue.some(op=>op._uid && op._uid!==d.uid))throw new Error('Tuđe operacije u kopiji');
  return d;
}
async function fieldImportBackup(file) {
  const input=document.getElementById('field-backup-file');
  try {
    if(!file)return;
    if(file.size>30*1024*1024)throw new Error('Kopija je veća od 30 MB');
    if(recOn || _tragOn || _dozGpsOn)throw new Error('Prvo završi snimanje');
    const d=await _fieldValidateBackup(JSON.parse(await file.text())),uid=sbUser.id;
    if(!await _dlgConfirm('Vratiti '+d.vlake.length+' vlaka i '+d.journal.points.length+' GPS tačaka? Postojeći zapisi ostaju; dodaju se samo nedostajući. Podloge i fotografije nisu uključene.',{title:'Obnova sigurnosne kopije',okLabel:'Vrati lokalno'}))return;
    if(sbUser?.id!==uid)throw new Error('Nalog je promijenjen');
    // Jedina izvorna kopija se ne briše. IDB import je transakcijski/idempotentan.
    await FieldStore.importOwner(uid,d.journal);
    if(sbUser?.id!==uid)throw new Error('Nalog je promijenjen; njegov GPS je ostao odvojen');
    const keys=d.scope.doz?[_OL.DOZ_ODJELI]:[_OL.PROJEKTI];
    const changes=new Map();
    for(const key of keys){const rows=_OL.load(key)||[];changes.set(key,JSON.stringify({ts:Date.now(),data:_fieldMerge(rows,[d.scope.project])}));}
    if(d.scope.linkedProject)changes.set(_OL.PROJEKTI,JSON.stringify({ts:Date.now(),data:_fieldMerge(_OL.load(_OL.PROJEKTI)||[],[d.scope.linkedProject])}));
    changes.set(LOCAL_VLAKE_KEY,JSON.stringify(_fieldMerge(_fieldJson(LOCAL_VLAKE_KEY,[]),d.vlake)));
    changes.set(_TRAG_REG_KEY,JSON.stringify(_fieldMerge(_fieldJson(_TRAG_REG_KEY,[]),d.tracks)));
    changes.set(_MSR_REG_KEY,JSON.stringify(_fieldMerge(_fieldJson(_MSR_REG_KEY,[]),d.measurements)));
    changes.set(_OL.QUEUE,JSON.stringify(_fieldMerge(_OL.loadQueue(true),d.queue)));
    const colleaguePid=d.scope.linkedProject?.id || d.scope.id;
    if(d.projectPolygon&&typeof ProjectTerrain!=='undefined'){const key=ProjectTerrain.keyFor(uid,colleaguePid);if(!_fieldJson(key,null)?.ring)changes.set(key,JSON.stringify({ring:ProjectTerrain.validateRing(d.projectPolygon.ring).ring,slope:d.projectPolygon.slope===true,aspect:d.projectPolygon.aspect===true,visible:d.projectPolygon.visible!==false}));}
    const kolege=_fieldJson(_KVC_KEY,{});kolege[colleaguePid] ||= {};
    for(const row of d.kolege){const key=row.korisnik_id+'::'+row.nm;if(!kolege[colleaguePid][key])kolege[colleaguePid][key]=row;}
    changes.set(_KVC_KEY,JSON.stringify(kolege));
    const kml=_fieldJson(_LOCAL_KML_KEY,{});for(const [name,value]of Object.entries(d.kml || {}))if(!Object.prototype.hasOwnProperty.call(kml,name))Object.defineProperty(kml,name,{value:typeof _localLayerBackupValue==='function'?await _localLayerBackupValue(name,value,uid):value,enumerable:true});
    changes.set(_LOCAL_KML_KEY,JSON.stringify(kml));
    if(d.geojson && !localStorage.getItem(_GEOJSON_LS_KEY))changes.set(_GEOJSON_LS_KEY,JSON.stringify(d.geojson));
    if(d.dozLayers){const all=_OL.load(_OL.DOZ_MEMBERS)||{};all[uid+':'+d.scope.id] ||= d.dozLayers;changes.set(_OL.DOZ_MEMBERS,JSON.stringify({ts:Date.now(),data:all}));}
    if(d.trees){const trees=_fieldJson(_DOZ_TREES_DATA_KEY,{});trees[d.scope.id] ||= d.trees;changes.set(_DOZ_TREES_DATA_KEY,JSON.stringify(trees));}
    // Dodatna pripremljena kopija mora stati PRIJE diranja postojećih zapisa.
    const stage='tvlake_field_restore_stage_'+uid;
    localStorage.setItem(stage,JSON.stringify({uid,changes:[...changes]}));
    const originals=new Map([...changes.keys()].map(key=>[key,localStorage.getItem(key)]));
    try {for(const [key,value]of changes)localStorage.setItem(key,value);}
    catch(e){localStorage.removeItem(stage);for(const [key,value]of originals){if(value===null)localStorage.removeItem(key);else localStorage.setItem(key,value);}throw e;}
    localStorage.removeItem(stage);
    if(d.scope.doz)_dozOdjeli=_OL.load(_OL.DOZ_ODJELI)||[];
    _projekti=_OL.load(_OL.PROJEKTI)||[];
    // loadProj obnavlja samo formulare, ne geometriju. Nove vlake dodaj odmah,
    // bez mreže i bez diranja novijih objekata koji su već u memoriji.
    _applyVlakeRows(d.vlake.filter(row=>!vlake.some(v=>v.nm===row.nm && v.projektId===row.projekt_id)));
    loadProj();_tragRegLoad();_msrRegLoad();await _localKmlRestore();geojsonOdjeliRestore();_updSyncBadge();rndProjektiList();
    showToast('✓ Kopija vraćena lokalno — ništa nije poslano na server');fieldCheckReady();
  }catch(e){showToast('⚠ Obnova nije završena: '+e.message+'. Izvorni fajl ostaje sačuvan.');}
  finally{input.value='';}
}
function _fieldStatusUpdate() {
  const el=document.getElementById('field-status');if(!el)return;
  const recording=recOn || _tragOn || _dozGpsOn;
  document.body.classList.toggle('field-recording',!!recording && !!sbUser);
  el.style.display=recording && sbUser?'block':'none';if(!recording){_fieldStatusUpdate._started=0;return;}
  const pts=_dozGpsOn?_dozGpsPts.length:_tragOn?_tragPts.length:vlake[actI]?.pts.length || 0;
  const started=_dozGpsOn?_dozGpsStartTs:_fieldStatusUpdate._started || Date.now();
  _fieldStatusUpdate._started ||= started;
  const minutes=Math.max(0,Math.floor((Date.now()-started)/60000)),acc=_dozGpsOn?_fieldStatusUpdate.accuracyDoz:lastP?.ac;
  const failed=_dozGpsOn?_dozLiveUpisPao:((recOn && _crashUpisPaoV) || (_tragOn && _crashUpisPaoT));
  const quality=_mrezaStanje(),n=_serverNaCekanju();
  const paused=_dozGpsOn?_dozGpsPaused:_tragOn?_tragPaused:recPaused;
  el.textContent=(failed?'⚠ GREŠKA UPISA':paused?'⏸ Pauza':_dozGpsOn?'● Doznaka':_tragOn?'● Trag':'● Vlaka')+' · '+minutes+' min · '+pts+' tač. · GPS '+(acc!=null?Math.round(acc)+' m':'—')+
    ' · '+(failed?'IZVEZI / provjeri memoriju':_dozGpsOn?(pts?'upis potvrđen':'čekam prvi upis'):'auto-save na 30 s')+' · '+
    (quality==='slaba'||quality==='nema'?'lokalno':quality==='nepoznato'?'veza neprovjerena':'mreža dostupna')+' · čeka '+n.stavki;
  el.classList.toggle('warn',!!failed);
  const height=el.offsetHeight+8;
  if(_fieldStatusUpdate._height!==height){document.body.style.setProperty('--field-status-height',height+'px');_fieldStatusUpdate._height=height;}
}
document.addEventListener('DOMContentLoaded',()=>{
  setInterval(()=>{try{_fieldStatusUpdate();}catch(e){}},1000);
});
