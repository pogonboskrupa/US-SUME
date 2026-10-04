/* Smjer privlačenja: projektant bira razdjelnicu; izgled je lokalna postavka projekta. */
(function(root){
'use strict';
let roadSource=null,roadGrid=new Map(),longSegments=[],picking=null;
const modes=['auto','start','end','both','off'];
const defaults={visible:true,inherit:true,color:'#2563eb',width:2.5,size:30,count:0,separator:true};
const node=id=>document.getElementById(id),uid=()=>typeof sbUser!=='undefined'?sbUser?.id||'guest':'guest';
const object=value=>value&&typeof value==='object'&&!Array.isArray(value)?value:{};
const bounded=(value,min,max,fallback)=>Number.isFinite(value)&&value>=min&&value<=max?value:fallback;
function cleanSettings(value){const s=object(value);return {visible:typeof s.visible==='boolean'?s.visible:true,inherit:typeof s.inherit==='boolean'?s.inherit:true,color:/^#[\da-f]{6}$/i.test(s.color||'')?s.color:defaults.color,width:bounded(s.width,1,6,defaults.width),size:bounded(s.size,18,48,defaults.size),count:Number.isInteger(s.count)?bounded(s.count,0,8,0):0,separator:typeof s.separator==='boolean'?s.separator:true};}
function markerPlan(length,mode,split=null,count=0){
 if(mode==='off'||!mode||!(length>0))return [];
 const n=Number.isInteger(count)&&count>0?Math.min(8,count):length>300?2:1;
 if(mode!=='both')return Array.from({length:n},(_,i)=>({f:(i+.5)/n,sign:mode==='start'?-1:1}));
 // Bez projektantske razdjelnice nema automatske polovice, ni za stare postavke.
 if(!Number.isFinite(split)||split<=0||split>=1)return [];
 const total=Math.max(2,n),left=Math.max(1,Math.min(total-1,Math.round(total*split))),right=total-left;
 return [...Array.from({length:left},(_,i)=>({f:split*(i+.5)/left,sign:-1})),{f:split,sign:0},...Array.from({length:right},(_,i)=>({f:split+(1-split)*(i+.5)/right,sign:1}))];
}
function segmentDistance(pt,a,b){const cos=Math.cos(pt.la*Math.PI/180),X=p=>(p[1]-pt.lo)*111320*cos,Y=p=>(p[0]-pt.la)*111320,ax=X(a),ay=Y(a),dx=X(b)-ax,dy=Y(b)-ay,t=Math.max(0,Math.min(1,-(ax*dx+ay*dy)/(dx*dx+dy*dy||1)));return Math.hypot(ax+dx*t,ay+dy*t);}
function routeDistance(a,b){return Math.hypot((b.lo-a.lo)*111320*Math.cos((a.la+b.la)/2*Math.PI/180),(b.la-a.la)*111320);}
function routeProjection(pts,point,preferred=null){
 if(!Array.isArray(pts)||pts.length<2||![point?.la,point?.lo].every(Number.isFinite)||pts.some(p=>![p?.la,p?.lo].every(Number.isFinite)))return null;
 const cos=Math.cos(point.la*Math.PI/180);let at=0,best=null;
 for(let i=1;i<pts.length;i++){const a=pts[i-1],b=pts[i],ax=(a.lo-point.lo)*111320*cos,ay=(a.la-point.la)*111320,dx=(b.lo-a.lo)*111320*cos,dy=(b.la-a.la)*111320,t=Math.max(0,Math.min(1,-(ax*dx+ay*dy)/(dx*dx+dy*dy||1))),distance=Math.hypot(ax+t*dx,ay+t*dy),len=routeDistance(a,b),atM=at+t*len;
  if(!best||distance<best.distance-.01||(Math.abs(distance-best.distance)<=.01&&Number.isFinite(preferred)&&Math.abs(atM-preferred)<Math.abs(best.atM-preferred)))best={la:a.la+t*(b.la-a.la),lo:a.lo+t*(b.lo-a.lo),atM,distance};at+=len;
 }
 return at>0?{...best,totalM:at,f:best.atM/at}:null;
}
function chooseEnd(startDistance,endDistance){if(!Number.isFinite(Math.min(startDistance,endDistance))||Math.min(startDistance,endDistance)>250)return null;return startDistance<=endDistance?'start':'end';}
const cell=p=>[Math.floor(p[0]/.005),Math.floor(p[1]/.005)],key=p=>p[0]+'_'+p[1];
function roadIndex(){const source=typeof _puteviLayerFg!=='undefined'?_puteviLayerFg:null;if(source===roadSource)return;roadSource=source;roadGrid=new Map();longSegments=[];if(!source?.toGeoJSON)return;
 const add=line=>{for(let i=1;i<line.length;i++){const a=[line[i-1][1],line[i-1][0]],b=[line[i][1],line[i][0]],u=cell(a),v=cell(b),seg=[a,b];if((Math.abs(u[0]-v[0])+1)*(Math.abs(u[1]-v[1])+1)>200){longSegments.push(seg);continue;}for(let y=Math.min(u[0],v[0]);y<=Math.max(u[0],v[0]);y++)for(let x=Math.min(u[1],v[1]);x<=Math.max(u[1],v[1]);x++){const k=key([y,x]);if(!roadGrid.has(k))roadGrid.set(k,[]);roadGrid.get(k).push(seg);}}};
 for(const f of source.toGeoJSON().features||[]){if(f.geometry?.type==='LineString')add(f.geometry.coordinates);if(f.geometry?.type==='MultiLineString')f.geometry.coordinates.forEach(add);}
}
function nearest(pt){roadIndex();const c=cell([pt.la,pt.lo]),segments=new Set(longSegments);for(let y=-1;y<=1;y++)for(let x=-1;x<=1;x++)for(const s of roadGrid.get(key([c[0]+y,c[1]+x]))||[])segments.add(s);let best=Infinity;for(const [a,b]of segments)best=Math.min(best,segmentDistance(pt,a,b));return best;}
function storeKey(project){return 'tvlake_direction_v1_'+encodeURIComponent(uid())+'_'+encodeURIComponent(project||'legacy');}
function prefsKey(project){return 'tvlake_direction_style_v1_'+encodeURIComponent(uid())+'_'+encodeURIComponent(project||'legacy');}
function read(key){try{return object(JSON.parse(localStorage.getItem(key)||'{}'));}catch(e){return {};}}
function settingsFor(project){return cleanSettings(read(prefsKey(project)));}
function identity(v){return (v.korisnikId||v.korisnik_id||uid())+':'+v.nm;}
function recordFor(v){const value=read(storeKey(v.projektId))[identity(v)];return typeof value==='string'?{mode:modes.includes(value)?value:'auto'}:{...object(value),mode:modes.includes(value?.mode)?value.mode:'auto'};}
function modeFor(v){return recordFor(v).mode;}
function splitFor(v){const split=recordFor(v).split;const p=split?routeProjection(v.pts,split,split.atM):null;return p&&p.distance<=40?p:null;}
function actualMode(v){const mode=modeFor(v);if(mode==='both')return splitFor(v)?mode:null;if(mode!=='auto')return mode;if(v.pts.length<2)return null;if(v.lagerPt)return chooseEnd(segmentDistance(v.pts[0],[v.lagerPt.la,v.lagerPt.lo],[v.lagerPt.la,v.lagerPt.lo]),segmentDistance(v.pts.at(-1),[v.lagerPt.la,v.lagerPt.lo],[v.lagerPt.la,v.lagerPt.lo]));if(v.naPutu||v.na_putu)return 'end';const road=chooseEnd(nearest(v.pts[0]),nearest(v.pts.at(-1)));return road||(v.lager?'start':null);}
function writeRecord(v,record){try{const key=storeKey(v.projektId),data=read(key);data[identity(v)]=record;localStorage.setItem(key,JSON.stringify(data));return true;}catch(e){showToast('Smjer nije sačuvan. Provjeri memoriju telefona.');return false;}}
function safeColor(color){return /^#[\da-f]{6}$/i.test(color||'')?color:defaults.color;}
function svg(s,color,sign,angle=0){const path=sign===0?'M 0 -6 V 6 M -3 -3 L 0 -6 L 3 -3':'M -9 0 H 9 M 4 -5 L 9 0 L 4 5',height=Math.round(s.size*.74),label=sign===0?'Razdjelnica koju je odabrao projektant':'Smjer prema izlazu na put';return '<svg class="vlaka-direction-icon" width="'+s.size+'" height="'+height+'" viewBox="-15 -11 30 22" aria-label="'+label+'" style="transform:rotate('+angle+'deg)"><path d="'+path+'" fill="none" stroke="white" stroke-width="'+(s.width+2)+'" stroke-linejoin="round" vector-effect="non-scaling-stroke"/><path d="'+path+'" fill="none" stroke="'+safeColor(color)+'" stroke-width="'+s.width+'" stroke-linejoin="round" vector-effect="non-scaling-stroke"/></svg>';}
function clear(v){for(const m of v._directionMarkers||[])map.removeLayer(m);const old=new Set(v._directionMarkers||[]);if(v.extraLabels)v.extraLabels=v.extraLabels.filter(m=>!old.has(m));if(v.labels)v.labels=v.labels.filter(m=>!old.has(m));v._directionMarkers=[];}
function draw(v,shared=false,settings=null){clear(v);const s=settings||settingsFor(v.projektId);if(!s.visible||!v.poly||!map.hasLayer(v.poly)||v.pts?.length<2)return;
 const plan=markerPlan(calcL(v.pts),actualMode(v),splitFor(v)?.f,s.count),color=s.inherit?(typeof _vlakaPrikazColor==='function'?_vlakaPrikazColor(v):v.color):s.color;
 for(const p of plan){if(p.sign===0&&!s.separator)continue;const point=ptAtFrac(v.pts,p.f),before=ptAtFrac(v.pts,Math.max(0,p.f-.02)),after=ptAtFrac(v.pts,Math.min(1,p.f+.02)),a=map.latLngToLayerPoint([before.la,before.lo]),b=map.latLngToLayerPoint([after.la,after.lo]),angle=Math.atan2(b.y-a.y,b.x-a.x)*180/Math.PI+(p.sign<0?180:0),height=Math.round(s.size*.74);
  const marker=L.marker([point.la,point.lo],{pane:'vlakeLabels',interactive:false,zIndexOffset:480,icon:L.divIcon({className:'vlaka-direction-marker',iconSize:[s.size,height],iconAnchor:[s.size/2,height/2],html:svg(s,color,p.sign,angle)})}).addTo(map);marker._directionSign=p.sign;marker._directionFraction=p.f;v._directionMarkers.push(marker);}
 if(shared){v.labels=v.labels||[];v.labels.push(...v._directionMarkers);}else{v.extraLabels=v.extraLabels||[];v.extraLabels.push(...v._directionMarkers);}
}
function scopeStamp(){return uid()+':'+(typeof _aktivniProjektId!=='undefined'?_aktivniProjektId:'');}
function allRoutes(){return [...(typeof vlake!=='undefined'?vlake:[]).map((v,i)=>({v,shared:false,key:'own:'+i})),...Object.entries(typeof kolegeVlakeMap!=='undefined'?kolegeVlakeMap:{}).map(([key,v])=>({v,shared:true,key:'peer:'+key}))];}
function pickAlive(){return picking&&picking.scope===scopeStamp()&&picking.name===identity(picking.v)&&allRoutes().some(r=>r.v===picking.v)&&map.hasLayer(picking.v.poly);}
function refresh(project){if(picking&&!pickAlive())cancelPick();const styles=new Map();for(const r of allRoutes()){if(project!==undefined&&r.v.projektId!==project)continue;if(!styles.has(r.v.projektId))styles.set(r.v.projektId,settingsFor(r.v.projektId));draw(r.v,r.shared,styles.get(r.v.projektId));}refreshPanel();refreshRecording();}
function popupTarget(){return typeof _vpSharedKey!=='undefined'&&_vpSharedKey?kolegeVlakeMap[_vpSharedKey]:typeof _vpIdx!=='undefined'?vlake[_vpIdx]:null;}
function popup(v){const mode=modeFor(v),actual=actualMode(v),split=splitFor(v);let note=mode==='both'?(split&&split.f>0&&split.f<1?'Razdjelnica na '+Math.round(split.atM)+' m od početka. Svaka strana vodi prema svom izlazu na put.':split?'Razdjelnica označena. Nastavi snimanje prema drugom izlazu na put.':'Odaberi razdjelnicu; ranija automatska sredina više se ne koristi.'):mode==='auto'&&!actual?'Put nije pronađen unutar 250 m od krajeva. Izaberi smjer ručno.':'Smjer i izgled možeš podesiti u Projektu → Strelice prema putu.';
 return '<section class="vp-direction"><label for="vp-direction-mode">Smjer privlačenja prema putu</label><select id="vp-direction-mode" onchange="VlakaDirection.setPopup(this.value)">'+[['auto','Automatski prema najbližem putu'],['start','Prema početku vlake'],['end','Prema kraju vlake'],['both','Dva izlaza na put — odaberi razdjelnicu'],['off','Bez oznake smjera']].map(([value,label])=>'<option value="'+value+'" '+(mode===value?'selected':'')+'>'+label+'</option>').join('')+'</select><p>'+note+'</p>'+(mode==='both'?'<button type="button" onclick="VlakaDirection.pickPopup()">Odaberi / pomjeri razdjelnicu</button>':'')+'<p>Dva smjera koristi samo kada vlaka izlazi na put na oba kraja. Razdjelnicu određuje projektant. Postavke se čuvaju na ovom telefonu.</p></section>';
}
function updatePopup(v){const el=document.querySelector('.vp-direction');if(el)el.outerHTML=popup(v);}
function setPopup(mode){if(!modes.includes(mode))return;const v=popupTarget();if(!v)return;if(mode==='both'){startPick(v,!!_vpSharedKey);return;}if(!writeRecord(v,{mode}))return;draw(v,!!_vpSharedKey);updatePopup(v);refreshRecording();}
function cancelPick(){if(picking){map.off('click',picking.handler);map.getContainer().style.cursor=picking.cursor;picking=null;}if(typeof map!=='undefined')map.getContainer().classList.remove('direction-picking');if(node('direction-pick-toolbar'))node('direction-pick-toolbar').hidden=true;}
function startPick(v,shared=false){
 if(!v?.poly||v.pts?.length<2||!v.projektId||v.projektId!==_aktivniProjektId){showToast('Aktiviraj projekat ove vlake i prikaži je na karti.');return;}
 if((typeof ProjectTerrain!=='undefined'&&ProjectTerrain.isDrawing())||(typeof ReferenceVlake!=='undefined'&&ReferenceVlake.isMarking())){showToast('Prvo završi ili otkaži trenutno označavanje karte.');return;}
 cancelPick();if(typeof closeVlakaPopup==='function')closeVlakaPopup();if(typeof switchTab==='function')switchTab('karta');map.invalidateSize();map.fitBounds(v.poly.getBounds(),{padding:[40,110],maxZoom:18,animate:false});
 const cursor=map.getContainer().style.cursor;picking={v,shared,name:identity(v),scope:scopeStamp(),cursor,handler:null};picking.handler=e=>{
  if(!pickAlive()){cancelPick();return;}const p=routeProjection(v.pts,{la:e.latlng.lat,lo:e.latlng.lng});if(!p||p.distance>40){showToast('Dodirni ovu vlaku. Približi kartu za precizan izbor.');return;}if(p.atM<1||p.totalM-p.atM<1){showToast('Odaberi razdjelnicu između dva kraja vlake.');return;}
  if(!writeRecord(v,{mode:'both',split:{la:p.la,lo:p.lo,atM:p.atM}}))return;cancelPick();draw(v,shared);refreshPanel();refreshRecording();showToast('Razdjelnica sačuvana na '+Math.round(p.atM)+' m od početka vlake.');
 };map.on('click',picking.handler);map.getContainer().classList.add('direction-picking');map.getContainer().style.cursor='crosshair';
 const bar=node('direction-pick-toolbar');if(bar){bar.hidden=false;node('direction-pick-title').textContent=v.nm+' · dva izlaza na put';}showToast('Dodirni vlaku gdje odlučuješ razdvojiti smjer prema dva izlaza na put.');
}
function pickPopup(){const v=popupTarget();if(v)startPick(v,!!_vpSharedKey);}
function markRecording(){if(typeof recPaused!=='undefined'&&recPaused){showToast('Nastavi GPS snimanje prije označavanja razdjelnice.');return;}const v=typeof recOn!=='undefined'&&recOn&&typeof actI!=='undefined'?vlake[actI]:null;if(!v||v.pts.length<2){showToast('Sačekaj najmanje dvije sačuvane GPS tačke.');return;}const last=v.pts.at(-1),p=routeProjection(v.pts,last,Infinity);if(!p)return;
 // Zadnja sačuvana GPS tačka, ne centar karte; atM razlikuje povratak na isti položaj.
 const total=v.pts.reduce((sum,pt,i)=>sum+(i?routeDistance(v.pts[i-1],pt):0),0);if(!writeRecord(v,{mode:'both',split:{la:last.la,lo:last.lo,atM:total}}))return;draw(v);refreshRecording();showToast('Razdjelnica označena na zadnjoj GPS tački. Nastavi prema drugom izlazu na put.');
}
function refreshRecording(){const b=node('rec-direction-split');if(!b)return;const v=typeof recOn!=='undefined'&&recOn&&typeof actI!=='undefined'?vlake[actI]:null;b.hidden=!v;const paused=typeof recPaused!=='undefined'&&recPaused;b.disabled=!v||v.pts.length<2||paused;b.textContent=paused?'Nastavi GPS snimanje za razdjelnicu ovdje':v&&modeFor(v)==='both'?'Dva izlaza na put · Promijeni razdjelnicu ovdje':'Dva izlaza na put · Razdjelnica ovdje';}
function change(prop,value){if(!_aktivniProjektId){showToast('Prvo aktiviraj projekat.');return;}if(!Object.hasOwn(defaults,prop))return;if(['visible','inherit','separator'].includes(prop)){if(typeof value!=='boolean')return;}else if(prop==='color'){if(!/^#[\da-f]{6}$/i.test(value))return;}else{value=Number(value);if(!Number.isFinite(value))return;}
 const candidate={...settingsFor(_aktivniProjektId),[prop]:value};if(prop==='color')candidate.inherit=false;const s=cleanSettings(candidate);if(s[prop]!==value)return;try{localStorage.setItem(prefsKey(_aktivniProjektId),JSON.stringify(s));}catch(e){showToast('Izgled strelica nije sačuvan. Provjeri memoriju telefona.');refreshPanel();return;}refresh(_aktivniProjektId);
}
function resetStyle(){if(!_aktivniProjektId)return;try{localStorage.setItem(prefsKey(_aktivniProjektId),JSON.stringify(defaults));}catch(e){showToast('Izgled strelica nije sačuvan.');return;}refresh(_aktivniProjektId);}
function focusRoute(){const r=allRoutes().find(r=>r.key===node('project-arrow-route')?.value);if(!r||r.v.projektId!==_aktivniProjektId)return;if(typeof switchTab==='function')switchTab('karta');map.invalidateSize();map.fitBounds(r.v.poly.getBounds(),{padding:[35,60],maxZoom:18,animate:false});if(r.shared)showKolegeVlakaInfo(r.key.slice(5),r.v.poly.getBounds().getCenter());else showVlakaPopup(Number(r.key.slice(4)),r.v.poly.getBounds().getCenter());}
function refreshPanel(){const context=node('project-arrow-context');if(!context)return;const active=typeof _aktivniProjektId!=='undefined'?_aktivniProjektId:null,s=settingsFor(active),project=(typeof _projekti!=='undefined'?_projekti:[]).find(p=>p.id===active);context.textContent=active?[project?.gj,project?.odjel?'Odjel '+project.odjel:active].filter(Boolean).join(' · '):'Aktiviraj projekat za strelice.';
 for(const [id,prop]of [['project-arrow-visible','visible'],['project-arrow-inherit','inherit'],['project-arrow-separator','separator'],['project-arrow-color','color'],['project-arrow-width','width'],['project-arrow-size','size'],['project-arrow-count','count']]){const el=node(id);if(!el)continue;el.disabled=!active;if(el.type==='checkbox')el.checked=s[prop];else el.value=s[prop];}
 if(node('project-arrow-width-value'))node('project-arrow-width-value').textContent=s.width+' px';if(node('project-arrow-size-value'))node('project-arrow-size-value').textContent=s.size+' px';if(node('project-arrow-preview'))node('project-arrow-preview').innerHTML=svg(s,s.inherit?(typeof getBojaVlake==='function'?getBojaVlake():s.color):s.color,1);
 const select=node('project-arrow-route');if(select){const routes=allRoutes().filter(r=>r.v.projektId===active&&!r.v._deleted&&r.v.poly).sort((a,b)=>String(a.v.nm).localeCompare(String(b.v.nm),'bs',{numeric:true})||identity(a.v).localeCompare(identity(b.v))),signature=JSON.stringify(routes.map(r=>[r.key,r.v.nm,r.v.ime||r.v.projektantIme,identity(r.v)]));
  if(select.dataset.routes!==signature){const value=select.value;select.replaceChildren();for(const r of routes){const option=document.createElement('option');option.value=r.key;option.textContent=r.v.nm+' · '+(r.v.ime||r.v.projektantIme||(r.shared?'Kolega':typeof getIme==='function'?getIme():'Ti'));select.append(option);}if(routes.some(r=>r.key===value))select.value=value;select.dataset.routes=signature;}select.disabled=!active||!routes.length;if(node('project-arrow-edit'))node('project-arrow-edit').disabled=select.disabled;
 }
}
root.VlakaDirection={markerPlan,segmentDistance,chooseEnd,routeProjection,cleanSettings,settingsFor,prefsKey,storeKey,identity,recordFor,modeFor,splitFor,actualMode,draw,refresh,popup,setPopup,clear,change,resetStyle,refreshPanel,startPick,pickPopup,cancelPick,isPicking:()=>!!picking,markRecording,refreshRecording,focusRoute};
if(typeof module!=='undefined'&&module.exports)module.exports=root.VlakaDirection;
if(typeof document!=='undefined'){document.addEventListener('keydown',e=>{if(e.key==='Escape')cancelPick();});document.addEventListener('DOMContentLoaded',()=>{if(typeof map==='undefined')return;map.on('zoomend',()=>{if(typeof _vlakaStilApply==='function')_vlakaStilApply();refresh();});if(node('direction-pick-toolbar')&&typeof L!=='undefined')L.DomEvent.disableClickPropagation(node('direction-pick-toolbar'));refresh();},{once:true});}
})(typeof window!=='undefined'?window:globalThis);
