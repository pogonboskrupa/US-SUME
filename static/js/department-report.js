/* Izvještaj odjela: nezavisna granica, ručni izbor odsjeka i lokalni DEM rezultat. */
(function(root){
 'use strict';
 const node=id=>document.getElementById(id),SKEY='tvlake_department_report_v1_',COLORS=['#36856b','#789a39','#c2a036','#cf7532','#b94c4f','#78456e'],ACOLORS=['#3588bd','#39926c','#d88438','#875caa'];
 let owner=null,state={},result=null,draft=null,draftLayer=null,boundary=null,terrain=null,edges=null,worker=null,cancelWorker=null,generation=0,busy=false,loaded=null;
 const uid=()=>typeof sbUser!=='undefined'?sbUser?.id:null,key=()=>SKEY+encodeURIComponent(owner||''),valid=()=>owner&&uid()===owner;
 const toast=s=>showToast(s),number=(n,d=1)=>Number.isFinite(n)?n.toLocaleString('bs',{maximumFractionDigits:d}):'—';
 function save(){if(!valid())return false;try{localStorage.setItem(key(),JSON.stringify(state));return true;}catch(e){toast('Izbor nije sačuvan — provjeri memoriju uređaja');return false;}}
 async function restore(){
  if(!uid()){toast('Prijavi se za izvještaj odjela');return;}
  if(owner!==uid()){reset();owner=uid();}
  if(loaded!==owner){const current=owner;try{state=JSON.parse(localStorage.getItem(key())||'{}');}catch(e){state={};}
   const stored=await _kmlcGet(key());if(uid()!==current||owner!==current)return false;if(stored&&state.geometry&&stored.signature===JSON.stringify(state.geometry))result=stored.result;loaded=owner;
  }
  showLayers();return true;
 }
 async function open(){
  if(!await restore())return;
  if(draft){toast('Završi crtanje granice');return;}
  closeMenuDropdown();closeLayerSheet();closeOznakePanel();map.closePopup();node('department-report').hidden=false;render();showLayers();
 }
 function hide(){node('department-report').hidden=true;}
 function close(){hide();cancelDraw(false);}
 function geometryBounds(g){return L.geoJSON(g).getBounds();}
 function clearLayers(){for(const l of [boundary,terrain,edges])if(l)map.removeLayer(l);boundary=terrain=edges=null;}
 function showLayers(){
  clearLayers();if(!valid()||!state.geometry||state.visible===false)return;
  // Izračun mora ostati vidljiv i preko KML-a s punom ispunom; klik ide izvornom sloju.
  if(!map.getPane('departmentReport'))map.createPane('departmentReport');Object.assign(map.getPane('departmentReport').style,{zIndex:'445',pointerEvents:'none'});
  boundary=L.geoJSON(state.geometry,{pane:'departmentReport',interactive:false,style:{color:'#2563eb',weight:2.5,fillOpacity:0}}).addTo(map);
  if(!result||state.mode==='none')return;
  const r=result,values=state.mode==='aspect'?r.aspects:r.classes,colors=state.mode==='aspect'?ACOLORS:COLORS;
  const image=document.createElement('canvas');image.width=r.width;image.height=r.height;const ctx=image.getContext('2d'),pixels=ctx.createImageData(r.width,r.height);
  for(let i=0;i<values.length;i++){if(values[i]<0)continue;const c=colors[values[i]];pixels.data[i*4]=parseInt(c.slice(1,3),16);pixels.data[i*4+1]=parseInt(c.slice(3,5),16);pixels.data[i*4+2]=parseInt(c.slice(5,7),16);pixels.data[i*4+3]=190;}ctx.putImageData(pixels,0,0);
  const geometry=state.geometry,polys=geometry.type==='Polygon'?[geometry.coordinates]:geometry.coordinates;
  const Layer=L.GridLayer.extend({createTile(coords){const canvas=document.createElement('canvas');canvas.width=canvas.height=256;const c=canvas.getContext('2d');c.beginPath();
   for(const poly of polys)for(const ring of poly){ring.forEach((p,i)=>{const point=L.CRS.EPSG3857.latLngToPoint(L.latLng(p[1],p[0]),coords.z),x=point.x-coords.x*256,y=point.y-coords.y*256;i?c.lineTo(x,y):c.moveTo(x,y);});c.closePath();}
   c.clip('evenodd');c.imageSmoothingEnabled=false;const scale=2**(coords.z-r.z);c.drawImage(image,r.x0*scale-coords.x*256,r.y0*scale-coords.y*256,r.width*scale,r.height*scale);return canvas;
  }});
  terrain=new Layer({pane:'departmentReport',bounds:geometryBounds(geometry),maxNativeZoom:r.z,maxZoom:22,keepBuffer:1,updateWhenIdle:true}).addTo(map);
  if(state.lines!==false&&state.mode!=='aspect'&&r.edges?.length)edges=L.polyline(r.edges,{pane:'departmentReport',color:'#243646',weight:.8,opacity:.8,interactive:false}).addTo(map);
  boundary.bringToFront?.();
 }
 function render(){
  const s=result?.stats,area=state.geometry?turf.area(turf.feature(state.geometry))/10000:null;
  node('dr-name').value=state.name||'';node('dr-selection').textContent=state.geometry?number(area,2)+' ha · '+(state.count?state.count+' odsjeka / poligona':'ručno nacrtana granica')+(state.source?' · '+state.source:''):'Odaberi prostor za analizu.';
  node('dr-mode').value=state.mode||'slope';node('dr-lines').checked=state.lines!==false;node('dr-visible').checked=state.visible!==false;
  for(const id of ['dr-calculate','dr-view','dr-remove'])node(id).disabled=busy||!state.geometry;
  node('dr-calculate').textContent=busy?'Računam…':'Izračunaj teren';node('dr-cancel-calc').hidden=!busy;
  node('dr-result').hidden=!s;
  node('dr-status').textContent=busy?'DEM se učitava i obrađuje. Možeš zatvoriti ovaj prozor.':s?'Izračunato '+new Date(state.calculatedAt||Date.now()).toLocaleString('bs')+' · DEM Mapzen / EU-DEM · uzorak oko '+number(s.resolution,0)+' m.':'DEM se koristi iz memorije; ako nedostaje, preuzima se uz internet.';
  if(!s)return;
  node('dr-elevation').innerHTML='<div><small>Najniže</small><b>'+number(s.min,0)+' m</b></div><div><small>Prosjek</small><b>'+number(s.mean,0)+' m</b></div><div><small>Najviše</small><b>'+number(s.max,0)+' m</b></div>';
  node('dr-terrain-summary').textContent='Površina '+number(s.areaHa,2)+' ha · prosječan nagib '+number(s.slopeMean)+'% · najveći nagib '+number(s.slopeMax)+'%';
  const rows=arr=>arr.map(r=>'<div class="dr-stat-row"><span><i style="background:'+r.color+'"></i>'+r.name+'</span><div><b>'+number(r.percent)+'%</b><small>'+number(r.ha,2)+' ha</small></div><progress max="100" value="'+r.percent+'" aria-label="'+r.name+'" style="--dr-color:'+r.color+'"></progress></div>').join('');
  node('dr-slopes').innerHTML=rows(s.slope);node('dr-aspects').innerHTML=rows(s.aspect);
  node('dr-coverage').textContent='Visine dostupne za '+number(s.coverage)+'% površine; nagib za '+number(s.slopeCoverage)+'%.'+(s.flat>.01?' Ravno / bez određene ekspozicije: '+number(s.flat)+'%.':'')+' Razredi su 0–<10%, 10–<20%, 20–<30%, 30–<40%, 40–<50% i ≥50%. Udio površine je DEM procjena.';
 }
 function cancelCalculation(){++generation;cancelWorker?.();worker=null;busy=false;render();}
 async function setGeometry(geometry,count=0,source=''){
  if(!valid())return false;cancelCalculation();
  const current=owner,persistKey=key(),candidate={...state,geometry,count,source,visible:true,mode:'slope',calculatedAt:null};const old=state;state=candidate;if(!save()){state=old;return false;}result=null;cancelDraw(false);await _kmlcDelete(persistKey);if(uid()!==current||owner!==current)return false;showLayers();await open();return true;
 }
 function choose(){if(!valid()||busy)return;if(recOn||_tragOn||_dozGpsOn||activeTool!=='select'){toast('Završi snimanje ili crtanje prije izbora odjela');return;}cancelDraw(false);DoznakaProjectBoundary.startForReport({hide,confirmed:async(g,count,source)=>{if(valid())await setGeometry(g,count,source);},cancel:()=>{if(valid())open();}});}
 function legacy(){const d=ProjectTerrain.dataFor();if(!d?.ring){toast('Aktivni projekat nema sačuvan nacrt');return;}const ring=d.ring.map(p=>[p[1],p[0]]);ring.push(ring[0]);setGeometry({type:'Polygon',coordinates:[ring]},0,'Poligon aktivnog projekta');}
 function addPoint(ll){if(!draft||!valid())return;if(draft.points.length>=500){toast('Najviše 500 tačaka');return;}const point=[ll.lat,ll.lng];if(draft.points.length&&map.distance(draft.points.at(-1),point)<1)return;draft.points.push(point);drawRender();}
 function drawClick(e){addPoint(e.latlng);}
 function drawRender(){if(draftLayer)map.removeLayer(draftLayer);draftLayer=null;if(draft?.points.length)draftLayer=L.polyline([...draft.points,...(draft.points.length>2?[draft.points[0]]:[])],{color:'#2563eb',weight:3,dashArray:'6 5',interactive:false}).addTo(map);node('dr-draw-count').textContent=(draft?.points.length||0)+' tačaka';node('dr-draw-save').disabled=(draft?.points.length||0)<3;}
 function draw(){if(!valid()||busy)return;if(recOn||_tragOn||_dozGpsOn||_msrOn||_guideOn||_dozKmlSelMode||_dozDrawType!==null||activeTool!=='select'){toast('Završi aktivni alat ili snimanje');return;}cancelDraw(false);hide();map.closePopup();switchTab('karta');draft={points:[],doubleZoom:map.doubleClickZoom.enabled(),actionDisplay:node('action-bar').style.display,tabDisplay:node('tab-bar').style.display};node('action-bar').style.display='none';node('tab-bar').style.display='none';map.doubleClickZoom.disable();map.on('click',drawClick);node('dr-draw-toolbar').hidden=false;drawRender();}
 function cancelDraw(reopen=true){if(draft){map.off('click',drawClick);if(draft.doubleZoom)map.doubleClickZoom.enable();node('action-bar').style.display=draft.actionDisplay;node('tab-bar').style.display=draft.tabDisplay;map.invalidateSize();}draft=null;if(draftLayer)map.removeLayer(draftLayer);draftLayer=null;node('dr-draw-toolbar').hidden=true;if(reopen&&valid())open();}
 async function finish(){if(!draft||!valid())return;const r=ProjectTerrain.validateRing(draft.points);if(r.error){toast(r.error);return;}const ring=r.ring.map(p=>[p[1],p[0]]);ring.push(ring[0]);const geometry={type:'Polygon',coordinates:[ring]};if(await setGeometry(geometry))cancelDraw(false);}
 function view(){if(!valid()||!state.geometry)return;hide();switchTab('karta');map.invalidateSize();map.fitBounds(geometryBounds(state.geometry),{padding:[35,35],maxZoom:17});showLayers();}
 async function remove(){if(!valid()||busy||!state.geometry)return;const current=owner,persistKey=key(),g=state.geometry;if(!await _dlgConfirm('Ukloniti granicu i izvještaj? Učitani fajlovi i projekti ostaju sačuvani.',{danger:true}))return;if(uid()!==current||g!==state.geometry)return;const old=state;state={};if(!save()){state=old;return;}result=null;clearLayers();render();await _kmlcDelete(persistKey);}
 function change(field,value){if(!valid())return;if(field==='name')state.name=String(value).slice(0,120);else if(field==='mode'){if(!['slope','aspect','none'].includes(value))return;state.mode=value;}else if(['lines','visible'].includes(field))state[field]=!!value;else return;if(save()){render();showLayers();}}
 async function calculate(){
  if(busy||!valid()||!state.geometry)return;const current=owner,persistKey=key(),token=++generation,geometry=state.geometry;let errorText='';busy=true;render();
  if(navigator.onLine!==false)_mrezaSila(60000);
  const check=()=>valid()&&owner===current&&token===generation&&state.geometry===geometry;
  try{
   const bounds=geometryBounds(geometry);let z=12,x0,y0,width,height;
   do{x0=Math.floor(_termLon2x(bounds.getWest(),z)*256);y0=Math.floor(_termLat2y(bounds.getNorth(),z)*256);width=Math.ceil(_termLon2x(bounds.getEast(),z)*256)-x0;height=Math.ceil(_termLat2y(bounds.getSouth(),z)*256)-y0;if(width*height<=160000&&Math.ceil(width/256)*Math.ceil(height/256)<=36)break;z--;}while(z>=4);
   if(z<4)throw Error('Izaberi manji prostor');
   const jobs=[];for(let y=Math.floor(y0/256)-1;y<=Math.floor((y0+height)/256)+1;y++)for(let x=Math.floor(x0/256)-1;x<=Math.floor((x0+width)/256)+1;x++)jobs.push({x,y});
   if(jobs.length>81)throw Error('Izaberi manji prostor');
   const tiles=[];let cursor=0,done=0;await Promise.all(Array.from({length:3},async()=>{while(cursor<jobs.length&&check()){const job=jobs[cursor++],src=await _getTerrariumTile(z,job.x,job.y);if(src){try{tiles.push({...job,elev:_terrariumDecodeTile(src)});}finally{src.close?.();}}done++;if(check())node('dr-status').textContent='DEM '+done+'/'+jobs.length+' pločica';}}));
   if(!check())return;if(!tiles.length)throw Error('Nema sačuvanog DEM-a. Poveži internet pa ponovi izračun.');
   const next=await new Promise((resolve,reject)=>{const w=new Worker('static/js/department-report-worker.js');worker=w;const stop=()=>{clearTimeout(timer);w.terminate();if(worker===w){worker=null;cancelWorker=null;}};const timer=setTimeout(()=>{stop();reject(Error('Obrada traje predugo. Izaberi manje područje.'));},45000);cancelWorker=()=>{stop();reject(Error('Izračun prekinut'));};w.onmessage=e=>{stop();e.data.ok?resolve(e.data.result):reject(Error(e.data.error));};w.onerror=()=>{stop();reject(Error('DEM obrada nije uspjela'));};try{w.postMessage({geometry,z,x0,y0,width,height,tiles},tiles.map(t=>t.elev.buffer));}catch(e){stop();reject(e);}});
   if(!check())return;result=next;state.calculatedAt=Date.now();save();if(!await _kmlcSave(persistKey,{signature:JSON.stringify(geometry),result:next})&&check())toast('Izvještaj prikazan, ali nije sačuvan za ponovno otvaranje');
   if(check()){render();showLayers();}
  }catch(e){if(check()){errorText=e.message;toast(e.message);}}
  finally{if(check()){busy=false;render();if(errorText)node('dr-status').textContent=errorText;}}
 }
 function reset(){++generation;cancelWorker?.();worker=null;busy=false;cancelDraw(false);clearLayers();owner=null;loaded=null;state={};result=null;hide();}
 root.DepartmentReport={open,restore,close,hide,choose,legacy,draw,addPoint,finish,cancelDraw,calculate,cancelCalculation,view,remove,change,reset,isDrawing:()=>!!draft,undo:()=>{draft?.points.pop();drawRender();},snapshot:()=>({state,result,busy})};
 document.addEventListener('keydown',e=>{if(e.key==='Escape'){if(draft)cancelDraw();else if(!node('department-report').hidden)close();}});
})(typeof window!=='undefined'?window:globalThis);
