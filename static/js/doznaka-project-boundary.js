// Izbor odsjeka i spajanje u granicu novog projekta. Union radi offline, izvan UI niti.
(function(root){
 'use strict';
 function merge(features,t){
  if(!features.length)throw Error('Izaberi barem jedan poligon');
  let joined=features[0];
  if(t){for(let i=1;i<features.length;i++){joined=t.union(joined,features[i]);if(!joined)throw Error('Poligoni se ne mogu spojiti');}return {geometry:joined.geometry||joined,areaHa:t.area(joined)/10000};}
  const polys=features.flatMap(f=>{const g=f.geometry||f;return g.type==='Polygon'?[g.coordinates]:g.type==='MultiPolygon'?g.coordinates:[];});
  if(!polys.length)throw Error('Nema poligona');return {geometry:polys.length===1?{type:'Polygon',coordinates:polys[0]}:{type:'MultiPolygon',coordinates:polys},areaHa:null};
 }
 if(typeof module!=='undefined'&&module.exports){module.exports={merge};return;}
 if(typeof document==='undefined'){
  importScripts('../libs/turf.min.js');root.onmessage=e=>{try{root.postMessage({ok:true,...merge(e.data,turf)});}catch(err){root.postMessage({ok:false,error:err.message});}};return;
 }
 const el=id=>document.getElementById(id);
 let sources=[],items=[],selectedSource=0,previous=null,shown=[],pendingDownload=false,busy=false,owner=null;
 const styles=new Map(),visibility=new Map();
 function getSources(){
  const result=[];for(const k of kmlLs){if(!k.grp)continue;const rows=[];const walk=g=>g.eachLayer(l=>{if(l._kmlIsPolygon)rows.push({layer:l});else if(l.eachLayer)walk(l);});walk(k.grp);if(rows.length)result.push({k,rows});}
  return result.sort((a,b)=>(GithubLayers.role(b.k)==='boundaries')-(GithubLayers.role(a.k)==='boundaries'));
 }
 function remember(){previous={boundary:_dozCreateBoundary,area:_dozCreateAreaHa};owner=sbUser?.id;_dozKmlSelSavedGj=_dozCreateGj;_dozKmlSelSavedOdjel=_dozCreateOdjel;}
 function download(){remember();pendingDownload=true;dozCloseCreateOdjel();closeLayerImport();_openLayerSheet();_lsTab('granice');}
 function afterDownload(){if(!pendingDownload)return;pendingDownload=false;if(sbUser?.id!==owner)return;closeLayerSheet();_dozNewOdjelDrawGj=_dozKmlSelSavedGj;_dozNewOdjelDrawOdjel=_dozKmlSelSavedOdjel;dozShowCreateOdjel(true);}
 function start(){
  if(_dozGpsOn||_dozDrawType!==null){showToast('Završi snimanje ili crtanje prije izbora granice');return;}
  sources=getSources();if(!sources.length){download();showToast('Preuzmi Granice odjela pa izaberi poligone');return;}
  remember();selectedSource=0;items=sources[0].rows;_dozKmlSelLayers=[];styles.clear();visibility.clear();dozCloseCreateOdjel();switchTab('karta');map.closePopup();
  _dozKmlSelMode=true;source(0);el('doz-kmlsel-banner').style.display='flex';el('action-bar').style.display='none';el('tab-bar').style.display='none';
  el('doz-kmlsel-label').textContent='Dodirni poligone svog odjela';
  el('doz-picker-view').checked=true;map.invalidateSize();showMap();
 }
 function allows(layer){return items.some(row=>row.layer===layer);}
 function source(index){
  clear();selectedSource=Number(index)||0;items=sources[selectedSource]?.rows||[];
  const k=sources[selectedSource]?.k;if(k?.grp){if(!visibility.has(k))visibility.set(k,map.hasLayer(k.grp));if(!map.hasLayer(k.grp))k.grp.addTo(map);}
  render();
 }
 function toggle(layer){
  if(busy||!allows(layer)||sbUser?.id!==owner)return;
  const idx=_dozKmlSelLayers.indexOf(layer);
  if(idx>=0){_dozKmlSelLayers.splice(idx,1);layer.setStyle(styles.get(layer)||{});}else{
   if(!styles.has(layer))styles.set(layer,{...layer.options});layer.setStyle({color:'#f59e0b',fillColor:'#f59e0b',fillOpacity:.35,opacity:1,weight:3});_dozKmlSelLayers.push(layer);
  }update();
 }
 function clear(){if(busy)return;_dozKmlSelLayers.forEach(l=>l.setStyle(styles.get(l)||{}));_dozKmlSelLayers=[];update();}
 function update(){
  const count=_dozKmlSelLayers.length,ha=_dozKmlSelLayers.reduce((n,l)=>n+_dozCalcGeomAreaHa(l.toGeoJSON()),0),text=`${count} odsjeka / poligona · ${fmtHa(ha)}`;
  el('doz-kmlsel-info').textContent=text;el('doz-picker-count').textContent=text;
  el('doz-picker-confirm').disabled=busy||!count;document.querySelectorAll('#doz-kmlsel-banner .confirm').forEach(b=>b.disabled=busy||!count);
  el('doz-picker-confirm').textContent=busy?'Spajam odsjeke…':'✓ Potvrdi granicu';
  document.querySelectorAll('#doz-picker-list input').forEach(cb=>{cb.checked=_dozKmlSelLayers.includes(items[Number(cb.dataset.index)]?.layer);cb.disabled=busy;});
  document.querySelectorAll('#doz-boundary-picker button:not(#doz-picker-confirm),#doz-picker-source,#doz-picker-view').forEach(control=>control.disabled=busy);
  el('doz-picker-all').disabled=busy||!shown.length||shown.length>300;
 }
 function openPicker(){
  el('doz-picker-source').replaceChildren(...sources.map((s,i)=>{const o=document.createElement('option');o.value=i;o.textContent=s.k.name+' · '+s.rows.length+' poligona';return o;}));el('doz-picker-source').value=selectedSource;
  el('doz-boundary-picker').hidden=false;render();
 }
 function showMap(){el('doz-boundary-picker').hidden=true;map.invalidateSize();}
 function render(){
  const onlyView=el('doz-picker-view').checked,bounds=map.getBounds(),center=map.getCenter();
  shown=items.map((row,index)=>({...row,index})).filter(row=>!onlyView||bounds.intersects(row.layer.getBounds()));
  shown.sort((a,b)=>center.distanceTo(a.layer.getBounds().getCenter())-center.distanceTo(b.layer.getBounds().getCenter()));
  const list=el('doz-picker-list');list.replaceChildren();for(const row of shown.slice(0,80)){
   const label=document.createElement('label'),cb=document.createElement('input'),copy=document.createElement('span'),name=document.createElement('b'),meta=document.createElement('small');
   cb.type='checkbox';cb.dataset.index=row.index;cb.checked=_dozKmlSelLayers.includes(row.layer);cb.onchange=()=>toggle(row.layer);
   name.textContent='Poligon '+(row.index+1);meta.textContent=fmtHa(_dozCalcGeomAreaHa(row.layer.toGeoJSON()));copy.append(name,meta);
   const locate=document.createElement('button');locate.type='button';locate.textContent='↗';locate.setAttribute('aria-label','Prikaži '+name.textContent+' na karti');locate.onclick=e=>{e.preventDefault();map.fitBounds(row.layer.getBounds(),{padding:[30,90],maxZoom:16});showMap();};label.append(cb,copy,locate);list.append(label);
  }
  if(!shown.length){const p=document.createElement('p');p.textContent='Nema poligona u ovom izboru. Promijeni sloj ili pomjeri kartu do odjela.';list.append(p);}
  if(shown.length>80){const p=document.createElement('p');p.textContent=`Prikazano 80 od ${shown.length}. Približi kartu svom odjelu ili biraj direktno na karti.`;list.append(p);}
  el('doz-picker-all').disabled=busy||!shown.length||shown.length>300;el('doz-picker-all').textContent='Odaberi sve prikazane ('+shown.length+')';update();
 }
 function selectVisible(){if(busy||!shown.length||shown.length>300)return;for(const row of shown)if(!_dozKmlSelLayers.includes(row.layer)){if(!styles.has(row.layer))styles.set(row.layer,{...row.layer.options});row.layer.setStyle({color:'#f59e0b',fillColor:'#f59e0b',fillOpacity:.35,opacity:1,weight:3});_dozKmlSelLayers.push(row.layer);}update();}
 function finishUi(){
  for(const [l,style] of styles)try{l.setStyle(style);}catch(e){}
  for(const [k,wasVisible] of visibility){if(!wasVisible)map.removeLayer(k.grp);}
  styles.clear();visibility.clear();_dozKmlSelMode=false;_dozKmlSelLayers=[];el('doz-boundary-picker').hidden=true;el('doz-kmlsel-banner').style.display='none';el('action-bar').style.display='';el('tab-bar').style.display='';map.invalidateSize();GithubLayers.render();
 }
 function restoreCreate(){_dozNewOdjelDrawGj=_dozKmlSelSavedGj;_dozNewOdjelDrawOdjel=_dozKmlSelSavedOdjel;dozShowCreateOdjel(true);}
 function cancel(){if(busy)return;finishUi();if(sbUser?.id!==owner)return;_dozCreateBoundary=previous?.boundary||null;_dozCreateAreaHa=previous?.area??null;restoreCreate();}
 function calculate(features){
  if(!root.Worker)return Promise.resolve(merge(features,typeof turf==='undefined'?null:turf));
  return new Promise((resolve,reject)=>{const w=new Worker('static/js/doznaka-project-boundary.js');const timer=setTimeout(()=>{w.terminate();reject(Error('Spajanje traje predugo. Izaberi manje odsjeka.'));},30000);const done=()=>{clearTimeout(timer);w.terminate();};w.onmessage=e=>{done();e.data.ok?resolve(e.data):reject(Error(e.data.error));};w.onerror=()=>{done();reject(Error('Spajanje nije uspjelo; izbor je sačuvan.'));};w.postMessage(features);});
 }
 async function confirm(){
  if(busy||!_dozKmlSelLayers.length)return;if(sbUser?.id!==owner){finishUi();return;}
  const picked=[..._dozKmlSelLayers],features=picked.map(l=>l.toGeoJSON());busy=true;update();
  try{
   const result=await calculate(features);if(sbUser?.id!==owner){finishUi();return;}
   _dozCreateBoundary=result.geometry;_dozCreateAreaHa=result.areaHa??_dozCalcGeomAreaHa(result.geometry);finishUi();restoreCreate();
  }catch(e){showToast('⚠ '+e.message);}finally{busy=false;update();}
 }
 root.DoznakaProjectBoundary={start,allows,toggle,update,render,source,openPicker,showMap,selectVisible,clear,cancel,confirm,download,afterDownload};
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&_dozKmlSelMode&&!busy){e.preventDefault();cancel();}});
})(typeof self!=='undefined'?self:globalThis);
