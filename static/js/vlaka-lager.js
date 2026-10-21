/* Veličina lagera prati zajednički/projektni stil; kolegin položaj je lični prikaz. */
(function(root){
'use strict';
let picking=null;
const node=id=>document.getElementById(id);
const uid=()=>typeof sbUser!=='undefined'?sbUser?.id||'guest':'guest';
const project=v=>v?.projektId??v?.projekt_id??null;
const valid=p=>p&&[p.la,p.lo].every(Number.isFinite)&&Math.abs(p.la)<=90&&Math.abs(p.lo)<=180;
const bounded=(n,min,max,otherwise)=>Number.isFinite(n)&&n>=min&&n<=max?n:otherwise;
const identity=v=>typeof VlakaDirection!=='undefined'?VlakaDirection.identity(v):(v.korisnikId||v.korisnik_id||uid())+':'+v.nm;
const stamp=()=>uid()+':'+(typeof _aktivniProjektId!=='undefined'?_aktivniProjektId:'');
const prefsKey=p=>'tvlake_lager_positions_v1_'+encodeURIComponent(uid())+'_'+encodeURIComponent(p||'legacy');
function read(p){try{const x=JSON.parse(localStorage.getItem(prefsKey(p))||'{}');return x&&typeof x==='object'&&!Array.isArray(x)?x:{};}catch(e){return {};}}
function styleFor(v){
 const b=typeof _loadBoje==='function'?_loadBoje(project(v)):{};
 const legacy=typeof _lineStyle!=='undefined'?bounded(_lineStyle.lagerScale,50,250,100):100;
 const scale=bounded(b.lagerScale,50,250,legacy),font=bounded(b.lagerLabel,8,28,Math.max(11,Math.round(11*legacy/100)));
 return {scale,width:Math.round(28*scale/100),height:Math.round(13*scale/100),font};
}
function rows(){return [...(typeof vlake!=='undefined'?vlake:[]).map((v,i)=>({v,shared:false,key:'own:'+i})),...Object.entries(typeof kolegeVlakeMap!=='undefined'?kolegeVlakeMap:{}).map(([key,v])=>({v,shared:true,key:'peer:'+key}))].filter(r=>!r.v._deleted&&r.v.lager&&r.v.pts?.length&&(Number(r.v.kr||0)===0||r.v.naPutu||r.v.na_putu));}
function positionFor(v,shared=false){const saved=shared?read(project(v))[identity(v)]:null;return valid(saved)?saved:valid(v.lagerPt)?v.lagerPt:(v.naPutu||v.na_putu)&&Number(v.kr)>0?v.pts.at(-1):v.pts[0];}
// Ručno zaokretanje lagera (labela uređivanje): ugao se čuva u lagerPt.rot i putuje sa
// lager_pt na server (jsonb, bez migracije). Rotira se simbol + broj oko centra simbola.
function rotOf(v){const r=Number(v&&v.lagerPt&&v.lagerPt.rot);return Number.isFinite(r)?Math.max(-90,Math.min(90,r)):0;}
function content(v){const s=styleFor(v),rot=rotOf(v);const inner=_stpLagerSvg(s.width,s.height,true)+'<div style="color:#fbbf24;font-family:ui-monospace,Roboto Mono,Courier New,monospace;font-weight:900;letter-spacing:.04em;font-size:'+s.font+'px;text-align:center;line-height:1;text-shadow:0 0 3px #000,0 0 3px #000,1px 1px 0 #000,-1px -1px 0 #000;margin-top:1px;pointer-events:none;white-space:nowrap">'+_escHtml(v.lager)+'</div>';
 return rot?'<div style="width:'+s.width+'px;transform-origin:'+s.width/2+'px '+s.height/2+'px;transform:rotate('+rot+'deg)">'+inner+'</div>':inner;}
function icon(v){const s=styleFor(v);return L.divIcon({className:'vlaka-lager-mk',iconSize:[s.width,s.height+s.font+5],iconAnchor:[s.width/2,s.height/2],html:content(v)});}
function alive(){return picking&&picking.scope===stamp()&&rows().some(r=>r.v===picking.v)&&picking.v.poly&&map.hasLayer(picking.v.poly);}
function refresh(){
 if(typeof map==='undefined'||typeof L==='undefined')return;
 if(picking&&!alive())cancelPick();
 for(const r of rows()){
  const v=r.v;
  if(!r.shared){if(v.lagerMk)v.lagerMk.setIcon(icon(v));continue;}
  // Marker je dio postojeće liste labela: sakrivanje i brisanje uklanjaju i lager.
  if(v.lagerMk){map.removeLayer(v.lagerMk);v.labels=(v.labels||[]).filter(m=>m!==v.lagerMk);v.lagerMk=null;}
  const at=positionFor(v,true);if(!v.poly||!map.hasLayer(v.poly)||!valid(at))continue;
  v.lagerMk=L.marker([at.la,at.lo],{icon:icon(v),interactive:false,zIndexOffset:600,pane:'vlakeLabels'}).addTo(map);v.labels=v.labels||[];v.labels.push(v.lagerMk);
 }
 if(typeof _scheduleDeclutterLabels==='function')_scheduleDeclutterLabels();
 renderPanel();
}
function renderPanel(){
 if(!node('lager-scale')||node('vlaka-style-modal')?.hidden!==false)return;
 const target=typeof _vlakaStyleTarget==='function'?_vlakaStyleTarget():null,s=styleFor({projektId:target});
 for(const [id,value]of [['lager-scale',s.scale],['lager-label',s.font]]){node(id).value=value;node(id).disabled=!target;}
 node('lager-scale-value').textContent=s.scale+' %';node('lager-label-value').textContent=s.font+' px';
 node('lager-style-preview').innerHTML=content({projektId:target,lager:'L1'});
 const list=rows().filter(r=>target==='__all__'||project(r.v)===target).sort((a,b)=>String(a.v.lager).localeCompare(String(b.v.lager),'bs',{numeric:true})||String(a.v.nm).localeCompare(String(b.v.nm),'bs',{numeric:true}));
 node('lager-position-count').textContent=list.length;
 const parent=node('lager-position-rows');if(!node('lager-position-list').open){parent.replaceChildren();return;}
 const fragment=document.createDocumentFragment();
 for(const r of list){const wrap=document.createElement('div'),label=document.createElement('b'),meta=document.createElement('span'),button=document.createElement('button');wrap.className='lager-position-row';label.textContent=r.v.lager+' · '+r.v.nm;
 const p=(typeof _projekti!=='undefined'?_projekti:[]).find(p=>p.id===project(r.v));meta.textContent=[r.v.projektantIme||r.v.ime||(r.shared?'Kolega':'Moj lager'),p?.odjel?'Odjel '+p.odjel:''].filter(Boolean).join(' · ');
 button.type='button';button.textContent='Pomjeri lager ↗';button.disabled=project(r.v)!==(typeof _aktivniProjektId!=='undefined'?_aktivniProjektId:null)||!r.v.poly||!map.hasLayer(r.v.poly);if(button.disabled)button.title='Aktiviraj projekat i prikaži vlaku na karti.';button.onclick=()=>startPlace(r.key);wrap.append(label,meta,button);fragment.append(wrap);}
 if(!list.length){const empty=document.createElement('p');empty.className='project-vl-note';empty.textContent='Nema označenih lagera u ovom izboru.';fragment.append(empty);}parent.replaceChildren(fragment);
}
function cancelPick(){const p=picking;picking=null;if(p){map.off('click',p.handler);map.getContainer().style.cursor=p.cursor;}if(typeof map!=='undefined')map.getContainer().classList.remove('lager-positioning');if(node('lager-position-toolbar'))node('lager-position-toolbar').hidden=true;}
function startPlace(key){
 const r=rows().find(r=>r.key===key);
 if(!r||project(r.v)!==(typeof _aktivniProjektId!=='undefined'?_aktivniProjektId:null)||!r.v.poly||!map.hasLayer(r.v.poly)){showToast('Aktiviraj projekat lagera i prikaži vlaku na karti.');return;}
 if((typeof recOn!=='undefined'&&recOn)||(typeof _tragOn!=='undefined'&&_tragOn)||(typeof _dozGpsOn!=='undefined'&&_dozGpsOn)||(typeof activeTool!=='undefined'&&activeTool&&activeTool!=='select')||(typeof _msrOn!=='undefined'&&_msrOn)||(typeof _guideOn!=='undefined'&&_guideOn)||(typeof textToolOn!=='undefined'&&textToolOn)||(typeof _dozDrawType!=='undefined'&&_dozDrawType!==null)||(typeof _dozKmlSelMode!=='undefined'&&_dozKmlSelMode)||(typeof DepartmentReport!=='undefined'&&DepartmentReport.isDrawing())||(typeof ReferenceVlake!=='undefined'&&ReferenceVlake.isMarking())){showToast('Završi snimanje ili označavanje prije pomjeranja lagera.');return;}
 cancelPick();if(typeof VlakaDirection!=='undefined')VlakaDirection.cancelPick();if(typeof closeVlakaStyle==='function')closeVlakaStyle();if(typeof closeMenuDropdown==='function')closeMenuDropdown();if(typeof closeVlakaPopup==='function')closeVlakaPopup();if(typeof switchTab==='function')switchTab('karta');map.invalidateSize();
 const at=positionFor(r.v,r.shared);if(valid(at))map.setView([at.la,at.lo],Math.max(map.getZoom(),16),{animate:false});
 picking={...r,scope:stamp(),cursor:map.getContainer().style.cursor,handler:null};
 picking.handler=e=>{
  if(!alive()){cancelPick();return;}const point={la:e.latlng.lat,lo:e.latlng.lng};if(!valid(point))return;
  if(r.shared){const data=read(project(r.v));data[identity(r.v)]=point;try{localStorage.setItem(prefsKey(project(r.v)),JSON.stringify(data));}catch(e){showToast('Položaj nije sačuvan. Provjeri memoriju telefona.');return;}}
  else{const old=r.v.lagerPt,time=r.v.updatedAt;r.v.lagerPt=point;r.v.updatedAt=new Date().toISOString();if(typeof _saveLocalVlake!=='function'||!_saveLocalVlake()){r.v.lagerPt=old;r.v.updatedAt=time;showToast('Položaj nije sačuvan. Provjeri memoriju telefona.');return;}}
  cancelPick();if(!r.shared){const i=vlake.indexOf(r.v);if(i>=0){updateVlakaLabel(i);sbFlushVlaka(i);}}refresh();showToast(r.shared?'Položaj koleginog lagera sačuvan za tvoj prikaz.':'Novi položaj lagera sačuvan.');
 };
 map.on('click',picking.handler);map.getContainer().classList.add('lager-positioning');map.getContainer().style.cursor='crosshair';node('lager-position-title').textContent=r.v.lager+' · '+r.v.nm;node('lager-position-toolbar').hidden=false;
}
root.VlakaLager={styleFor,positionFor,icon,rotOf,prefsKey,refresh,renderPanel,startPlace,cancelPick,isPicking:()=>!!picking};
if(typeof document!=='undefined'){document.addEventListener('keydown',e=>{if(e.key==='Escape')cancelPick();});document.addEventListener('DOMContentLoaded',()=>{if(typeof map==='undefined')return;L.DomEvent.disableClickPropagation(node('lager-position-toolbar'));map.on('layerremove',()=>{if(picking&&!alive())cancelPick();});refresh();},{once:true});}
})(typeof window!=='undefined'?window:globalThis);
