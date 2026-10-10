/* Lokalna projekcija: vlastita geometrija i rezultat, odvojeni od stvarne doznake. */
(function(root){
'use strict';
const node=id=>document.getElementById(id),uid=()=>sbUser?.id,project=()=>_dozOdjeli.find(p=>p.id===_dozSelId),scope=()=>uid()&&project()?uid()+':'+project().id:null;
const COLORS=['#2563eb','#b45309','#15803d','#9333ea','#be123c','#0e7490','#a16207','#4f46e5','#047857','#c2410c','#7e22ce','#475569'];
let current=null,prefs={},result=null,resultSignature=null,busy=false,worker=null,cancelWorker=null,token=0,loaded=false,layer=null,legend=null,limit=30,message='';
const key=()=> 'tvlake_doznaka_plan_v1_'+encodeURIComponent(current||''),n=(v,d=1)=>Number.isFinite(v)?v.toLocaleString('bs',{maximumFractionDigits:d}):'—';
function geometry(){const b=_dozGetBoundaryGeoJSON(project());return prefs.geometry||b?.geometry||null;}
const config=()=>({width:Number(prefs.width??15),crew:Number(prefs.crew??2),pace:Number(prefs.pace??3),leapfrog:prefs.leapfrog!==false});
const signature=()=>JSON.stringify({geometry:geometry(),options:config()});
const valid=()=>current&&current===scope();
function save(){if(!valid())return false;try{localStorage.setItem(key(),JSON.stringify(prefs));return true;}catch(e){showToast('Plan nije sačuvan — provjeri memoriju uređaja');return false;}}
function clearMap(){if(layer)map.removeLayer(layer);layer=null;legend?.remove();legend=null;}
function cancel(){++token;cancelWorker?.();worker?.terminate();worker=null;cancelWorker=null;busy=false;message='Izračun prekinut; prethodni plan je sačuvan.';render();}
function reset(){cancel();clearMap();current=null;prefs={};result=null;resultSignature=null;loaded=false;limit=30;message='';node('doz-plan-modal').hidden=true;}
async function sync(){
 const next=scope();if(next!==current){reset();current=next;if(!next)return;try{prefs=JSON.parse(localStorage.getItem(key())||'{}');if(!prefs||typeof prefs!=='object'||Array.isArray(prefs))prefs={};}catch(e){prefs={};}
  const expected=current,stamp=signature(),generation=token;loaded=true;render();const data=await _kmlcGet(key());if(!valid()||current!==expected||signature()!==stamp||token!==generation)return;if(data?.signature===stamp){result=data.result;resultSignature=stamp;showMap();}render();
 }else if(loaded){if(result&&resultSignature!==signature()){cancel();result=null;clearMap();message='Granica je izmijenjena. Ponovo izračunaj plan.';}render();}
}
async function open(){await sync();if(!valid())return;if(recOn||_tragOn||_dozGpsOn||_dozDrawType!==null){showToast('Završi snimanje ili crtanje prije planiranja');return;}closeMenuDropdown();closeLayerSheet();map.closePopup();node('doz-plan-modal').hidden=false;render();showMap();node('dp-width-choice').focus();}
function close(){node('doz-plan-modal').hidden=true;}
function person(id){const saved=prefs.people?.[id]||{};return {name:String(saved.name||'Projektant '+(id+1)).slice(0,60),color:/^#[\da-f]{6}$/i.test(saved.color||'')?saved.color:COLORS[id%COLORS.length]};}
function change(field,value){if(!valid())return;
 if(['width','crew','pace'].includes(field)){const v=Number(value),min=field==='width'?5:1,max=field==='width'?100:field==='crew'?12:30;if(!Number.isFinite(v)||v<min||v>max||(field!=='width'&&!Number.isInteger(v))){message='Unesi '+(field==='width'?'širinu od 5 do 100 m.':field==='crew'?'1 do 12 projektanata.':'1 do 30 prolaza dnevno.');render();return;}prefs[field]=v;if(busy)cancel();result=null;clearMap();message='Postavke su izmijenjene. Izračunaj novi plan.';}
 else if(field==='leapfrog'){prefs.leapfrog=!!value;if(busy)cancel();result=null;clearMap();}
 else if(field==='day'){prefs.day=Math.max(0,Number(value)||0);}
 else if(field==='visible'||field==='legendMin')prefs[field]=!!value;
 else return;if(save()){render();showMap();}
}
function setPerson(id,field,value){if(!valid()||!['name','color'].includes(field)||!Number.isInteger(id)||id<0||id>=config().crew)return;if(field==='color'&&!/^#[\da-f]{6}$/i.test(value))return;prefs.people||={};prefs.people[id]={...person(id),[field]:String(value).slice(0,60)};if(save()){render();showMap();}}
function boundaryFromProject(){if(!valid())return;cancel();delete prefs.geometry;delete prefs.count;delete prefs.source;result=null;clearMap();save();render();}
function choose(){if(!valid()||busy)return;const owner=current;clearMap();DoznakaProjectBoundary.startForReport({hide:close,cancel:()=>{if(valid()&&current===owner)open();},confirmed:async(g,count,source)=>{if(!valid()||current!==owner)return;cancel();prefs.geometry=g;prefs.count=count;prefs.source=source;result=null;clearMap();save();await open();}});}
function selectDay(day){change('day',day);}
function render(){
 const p=project(),g=valid()?geometry():null,o=config(),entry=node('doz-plan-summary');
 if(entry)entry.textContent=!p?'Odaberi odjel':result?n(result.daysNeeded,0)+' radnih dana · '+result.bands.length+' novih pojaseva':g?'Izohipsni pojasevi i procjena radnih dana':'Prvo odredi poligon odjela';
 node('dp-project').textContent=p?.name||'Odjel';node('dp-boundary').textContent=g?(prefs.count?prefs.count+' odsjeka · ':'')+n(turf.area(turf.feature(g))/10000,2)+' ha'+(prefs.source?' · '+prefs.source:' · granica projekta'):'Odjel nema poligon. Izaberi odsjeke iz Granica.';
 const custom=prefs.custom||![10,15,20].includes(o.width);node('dp-width-choice').value=custom?'custom':String(o.width);node('dp-width-custom-row').hidden=!custom;node('dp-width').value=o.width;node('dp-crew').value=o.crew;node('dp-pace').value=o.pace;node('dp-leapfrog').checked=o.leapfrog;node('dp-visible').checked=prefs.visible!==false;
 node('dp-calculate').disabled=busy||!g;node('dp-calculate').textContent=busy?'Planiram pojaseve…':'Izračunaj projekciju';node('dp-cancel').hidden=!busy;node('dp-view').disabled=!result;node('dp-result').hidden=!result;node('dp-status').textContent=message||(busy?'Učitavam DEM i obrađujem izohipse…':'DEM iz memorije koristi se i bez interneta. Ako nedostaje, preuzima se uz internet.');
 const people=node('dp-people');if(people.dataset.crew!==String(o.crew)||people.dataset.scope!==String(current)){people.replaceChildren();for(let id=0;id<Math.min(12,Math.max(1,o.crew));id++){const row=document.createElement('label'),color=document.createElement('input'),name=document.createElement('input');color.type='color';color.setAttribute('aria-label','Boja projektanta '+(id+1));color.onchange=()=>setPerson(id,'color',color.value);name.type='text';name.maxLength=60;name.setAttribute('aria-label','Naziv projektanta '+(id+1));name.onchange=()=>setPerson(id,'name',name.value);row.append(color,name);people.append(row);}people.dataset.crew=o.crew;people.dataset.scope=current;}
 [...people.children].forEach((row,id)=>{const value=person(id);row.children[0].value=value.color;row.children[1].value=value.name;});
 if(!result)return;
 node('dp-days-needed').textContent=n(result.daysNeeded,0);node('dp-total-bands').textContent=result.bands.length;node('dp-area').textContent=n(result.stats.areaHa,2)+' ha';
 node('dp-model').textContent=result.stats.flat?'Ravan DEM: pojasevi prate dužu stranu odjela.':`Pojasevi prate DEM izohipse, od nižeg dijela prema višem. DEM uzorak oko ${n(result.stats.demResolution,0)} m; zadana širina je približna na promjenjivim padinama.`;
 node('dp-model').textContent+=' Plan cijelog odjela; već odrađeni GPS pojasevi nisu oduzeti. Povratak po istom pojasu ne povećava površinu.';
 const select=node('dp-day');select.replaceChildren();const all=document.createElement('option');all.value='0';all.textContent='Cijeli plan';select.append(all);for(const day of result.days){const option=document.createElement('option');option.value=day.day;option.textContent='Dan '+day.day+' · '+day.bands+' novih pojaseva';select.append(option);}select.value=String(prefs.day??1);
 const days=node('dp-days');days.replaceChildren();for(const d of result.days.slice(0,limit)){const button=document.createElement('button');button.type='button';button.className='dp-day-row';button.setAttribute('aria-pressed',String(Number(prefs.day??1)===d.day));button.onclick=()=>selectDay(d.day);const title=document.createElement('b'),copy=document.createElement('span');title.textContent='Dan '+d.day;copy.textContent=d.bands+' novih · '+d.guides+' praćenja · '+n(d.areaHa,2)+' ha';button.append(title,copy);days.append(button);}node('dp-more').hidden=result.days.length<=limit;
 const rows=node('dp-pass-list');rows.replaceChildren();const day=Number(prefs.day??1)||1;
 for(const pass of result.passes.filter(p=>p.day===day)){const block=document.createElement('div'),title=document.createElement('b');block.className='dp-pass';title.textContent='Prolaz '+pass.number+' · '+(pass.direction==='naprijed'?'→ polazak':'← povratak');block.append(title);for(const slot of pass.slots){const row=document.createElement('div'),dot=document.createElement('i'),text=document.createElement('span');dot.style.background=person(slot.person).color;text.textContent=person(slot.person).name+' · pojas '+(slot.band+1)+(slot.guide?' · prati svoj prethodni pojas':' · novi pojas');row.append(dot,text);block.append(row);}rows.append(block);}
 const totals=node('dp-totals');totals.replaceChildren();for(const p of result.people){const row=document.createElement('div'),dot=document.createElement('i'),copy=document.createElement('span');dot.style.background=person(p.id).color;copy.textContent=person(p.id).name+' · '+p.bands+' novih · '+p.guides+' praćenja · '+n(p.areaHa,2)+' ha';row.append(dot,copy);totals.append(row);}
}
function showMap(){
 clearMap();if(!valid()||!result||prefs.visible===false)return;const day=Number(prefs.day??1),selected=result.bands.map((b,id)=>({...b,id})).filter(b=>!day||b.day===day);
 if(!map.getPane('doznakaPlan'))map.createPane('doznakaPlan');Object.assign(map.getPane('doznakaPlan').style,{zIndex:'435'});
 const renderer=L.canvas({pane:'doznakaPlan',padding:.2}),placed=[];layer=L.featureGroup().addTo(map);
 for(const b of selected){const col=person(b.person).color;L.geoJSON(b.geometry,{pane:'doznakaPlan',renderer,interactive:false,style:{color:col,weight:.8,opacity:.85,fillColor:col,fillOpacity:.18}}).addTo(layer);
  if(b.lines.length)L.polyline(b.lines.map(c=>c.map(p=>[p[1],p[0]])),{pane:'doznakaPlan',renderer,color:col,weight:2.4,interactive:false}).addTo(layer);
  if(day&&selected.length<45){const line=b.lines.slice().sort((a,c)=>turf.length(turf.lineString(c))-turf.length(turf.lineString(a)))[0];
   const candidates=line?[.5,.2,.8,.35,.65].map(f=>turf.along(turf.lineString(line),turf.length(turf.lineString(line))*f).geometry.coordinates):[turf.pointOnFeature(turf.feature(b.geometry)).geometry.coordinates];
   for(const mid of candidates){const point=map.latLngToContainerPoint([mid[1],mid[0]]);if(placed.some(p=>Math.abs(p.x-point.x)<70&&Math.abs(p.y-point.y)<24))continue;placed.push(point);L.marker([mid[1],mid[0]],{pane:'doznakaPlan',interactive:false,icon:L.divIcon({className:'dp-band-label',html:'<span style="--dp-color:'+col+'">'+(b.id+1)+' · P'+(b.person+1)+'</span>',iconSize:[66,20],iconAnchor:[33,10]})}).addTo(layer);break;}
  }
 }
 if(day)for(const p of result.passes.filter(p=>p.day===day))for(const s of p.slots.filter(s=>s.guide)){const b=result.bands[s.band];if(b.lines.length)L.polyline(b.lines.map(c=>c.map(p=>[p[1],p[0]])),{pane:'doznakaPlan',renderer,color:person(s.person).color,weight:3,dashArray:'4 5',interactive:false}).addTo(layer);}
 legend=document.createElement('section');legend.className='dr-map-legend dp-map-legend';const head=document.createElement('header'),title=document.createElement('button'),min=document.createElement('button'),hide=document.createElement('button');title.type=min.type=hide.type='button';title.className='dr-legend-drag';title.textContent=day?'PLAN · Dan '+day:'PLAN · '+result.daysNeeded+' dana';title.onclick=open;min.textContent=prefs.legendMin?'＋':'−';min.setAttribute('aria-label','Minimiziraj ili proširi legendu plana');min.onclick=()=>change('legendMin',!prefs.legendMin);hide.textContent='×';hide.setAttribute('aria-label','Sakrij plan s karte');hide.onclick=()=>change('visible',false);head.append(title,min,hide);legend.append(head);
 const body=document.createElement('div');body.className='dr-legend-body';body.hidden=!!prefs.legendMin;for(const p of result.people){const row=document.createElement('div'),swatch=document.createElement('i'),name=document.createElement('span');swatch.style.background=person(p.id).color;name.textContent=person(p.id).name;row.append(swatch,name);body.append(row);}const note=document.createElement('small');note.textContent='Puna linija: novi pojas · crtice: prati svoj prethodni. Plan nije izvršena doznaka.';body.append(note);legend.append(body);map.getContainer().append(legend);L.DomEvent.disableClickPropagation(legend);L.DomEvent.disableScrollPropagation(legend);
}
function view(){if(!valid()||!result)return;prefs.visible=true;save();close();switchTab('karta');map.invalidateSize();map.fitBounds(L.geoJSON(geometry()).getBounds(),{padding:[30,60],maxZoom:17});showMap();}
async function calculate(){
 if(busy||!valid()||!geometry())return;const owner=current,stamp=signature(),g=geometry(),o=config(),job=++token;busy=true;message='';render();
 const alive=()=>valid()&&current===owner&&token===job&&signature()===stamp;
 try{
  if(navigator.onLine!==false)_mrezaSila(60000);
  const box=L.geoJSON(g).getBounds();let z=13;const jobs=[];
  const xa=Math.floor(_termLon2x(box.getWest(),z))-1,xb=Math.floor(_termLon2x(box.getEast(),z))+1,ya=Math.floor(_termLat2y(box.getNorth(),z))-1,yb=Math.floor(_termLat2y(box.getSouth(),z))+1;
  if((xb-xa+1)*(yb-ya+1)>81)throw Error('Izaberi manje odsjeka za ovu projekciju.');
  for(let y=ya;y<=yb;y++)for(let x=xa;x<=xb;x++)jobs.push({x,y});
  const tiles=[];let cursor=0,done=0;await Promise.all(Array.from({length:3},async()=>{while(cursor<jobs.length&&alive()){const tile=jobs[cursor++],src=await _getTerrariumTile(z,tile.x,tile.y);if(src)try{tiles.push({...tile,elev:_terrariumDecodeTile(src)});}finally{src.close?.();}done++;if(alive())node('dp-status').textContent='DEM '+done+'/'+jobs.length+' pločica';}}));
  if(!alive())return;if(!tiles.length)throw Error('Nema sačuvanog DEM-a. Poveži internet pa ponovi.');
  const next=await new Promise((resolve,reject)=>{const w=new Worker('static/js/doznaka-plan-worker.js');worker=w;const stop=()=>{clearTimeout(timer);w.terminate();if(worker===w){worker=null;cancelWorker=null;}};const timer=setTimeout(()=>{stop();reject(Error('Obrada traje predugo. Izaberi manje odsjeka.'));},60000);cancelWorker=()=>{stop();reject(Error('Izračun prekinut'));};w.onmessage=e=>{stop();e.data.ok?resolve(e.data.result):reject(Error(e.data.error));};w.onerror=()=>{stop();reject(Error('Planiranje izohipsi nije uspjelo'));};w.postMessage({geometry:g,options:o,z,tiles},tiles.map(t=>t.elev.buffer));});
  if(!alive())return;result=next;resultSignature=stamp;prefs.day=1;prefs.visible=true;prefs.calculatedAt=Date.now();const savedPrefs=save(),saved=await _kmlcSave(key(),{signature:stamp,result:next});if(!alive())return;message=saved&&savedPrefs?'Plan sačuvan na uređaju.':'Plan prikazan, ali nije sačuvan. Provjeri memoriju uređaja.';showMap();
 }catch(e){if(alive())message=e.message;}
 finally{if(alive()){busy=false;render();}}
}
root.DoznakaPlan={open,close,sync,reset,cancel,change,setPerson,choose,boundaryFromProject,calculate,view,selectDay,more:()=>{limit+=30;render();},snapshot:()=>({current,prefs,result,busy,message}),widthChoice:value=>{prefs.custom=value==='custom';if(value==='custom'){save();render();node('dp-width').focus();}else change('width',value);}};
let zoomTimer;map.on('zoomend',()=>{clearTimeout(zoomTimer);zoomTimer=setTimeout(()=>{if(valid()&&result&&prefs.visible!==false)showMap();},100);});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!node('doz-plan-modal').hidden){e.preventDefault();close();}});
})(typeof window!=='undefined'?window:globalThis);
