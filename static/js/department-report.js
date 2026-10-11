/* Izvještaj odjela: nezavisna granica, ručni izbor odsjeka i lokalni DEM rezultat. */
(function(root){
 'use strict';
 const node=id=>document.getElementById(id),SKEY='tvlake_department_report_v1_',COLORS=['#36856b','#789a39','#c2a036','#cf7532','#b94c4f','#78456e'],ACOLORS=['#3588bd','#39926c','#d88438','#875caa'];
 let owner=null,state={},result=null,draft=null,draftLayer=null,boundary=null,terrain=null,edges=null,profileLayer=null,worker=null,cancelWorker=null,generation=0,busy=false,loaded=null,legend=null,hitRenderer=null;
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
 function clearLayers(){if(map.getContainer().querySelector('.dr-profile-popup'))map.closePopup();for(const l of [boundary,terrain,edges,profileLayer])if(l)map.removeLayer(l);boundary=terrain=edges=profileLayer=null;legend?.remove();legend=null;}
 const selecting=()=>!!draft||root.GithubLayers?.selecting();
 function refreshSelection(){
  const active=selecting();if(boundary?.getPane())boundary.getPane().style.pointerEvents=active?'none':'';
  if(boundary)boundary.eachLayer(l=>{if(l._path)l._path.style.pointerEvents=active?'none':'auto';});
  if(legend)legend.hidden=!!active;
 }
 function legendPosition(){
  if(!legend)return;const box=map.getContainer(),rect=box.getBoundingClientRect();let bottom=Math.min(box.clientHeight,innerHeight-rect.top);
  for(const id of ['action-bar','rec-bar']){const bar=node(id);if(bar?.getClientRects().length){const r=bar.getBoundingClientRect();if(r.top>rect.top&&r.top<rect.bottom)bottom=Math.min(bottom,r.top-rect.top);}}
  const p=state.legendPosition||{x:12,y:Math.max(60,bottom-legend.offsetHeight-12)};
  const x=Math.max(6,Math.min(Number(p.x)||0,box.clientWidth-legend.offsetWidth-6)),y=Math.max(50,Math.min(Number(p.y)||0,bottom-legend.offsetHeight-12));
  legend.style.left=x+'px';legend.style.top=y+'px';return {x,y};
 }
 function showLegend(){
  if(!result||state.legendVisible===false||state.mode==='none')return;
  legend=document.createElement('section');legend.id='dr-map-legend';legend.className='dr-map-legend';legend.setAttribute('aria-label','Legenda izvještaja odjela');
  const header=document.createElement('header'),title=document.createElement('button'),min=document.createElement('button'),off=document.createElement('button'),body=document.createElement('div');
  title.type=min.type=off.type='button';title.className='dr-legend-drag';title.textContent=state.name||'Izvještaj odjela';title.setAttribute('aria-label','Pomjeri legendu · strelice na tastaturi');
  min.textContent=state.legendMin?'＋':'−';min.setAttribute('aria-label',state.legendMin?'Proširi legendu':'Minimiziraj legendu');min.setAttribute('aria-expanded',String(!state.legendMin));min.onclick=()=>change('legendMin',!state.legendMin);
  off.textContent='×';off.setAttribute('aria-label','Ugasi legendu');off.onclick=()=>change('legendVisible',false);
  header.append(title,min,off);body.className='dr-legend-body';body.hidden=!!state.legendMin;
  const heading=document.createElement('b');heading.textContent=state.mode==='aspect'?'Ekspozicija · '+number(result.stats.areaHa,2)+' ha':'Nagib terena (%) · '+number(result.stats.areaHa,2)+' ha';body.append(heading);
  const rows=state.mode==='aspect'?result.stats.aspect:result.stats.slope;
  for(const row of rows){const line=document.createElement('div'),swatch=document.createElement('i'),name=document.createElement('span'),share=document.createElement('b');swatch.style.background=row.color;name.textContent=row.name;share.textContent=number(row.percent)+'%';line.append(swatch,name,share);body.append(line);}
  const note=document.createElement('small');note.textContent='DEM procjena · udio površine';body.append(note);
  if(state.mode==='slope'&&state.profiles!==false&&result.slopeProfiles?.length){const hint=document.createElement('small');hint.textContent='P1, P2…: nagib profila niz padinu · 1 na približno 3 ha';body.append(hint);}
  legend.append(header,body);map.getContainer().append(legend);
  L.DomEvent.disableClickPropagation(legend);L.DomEvent.disableScrollPropagation(legend);
  let drag=null;
  title.onpointerdown=e=>{if(e.button!==0)return;e.preventDefault();const p=legendPosition();drag={x0:e.clientX,y0:e.clientY,x:p.x,y:p.y};title.setPointerCapture(e.pointerId);};
  title.onpointermove=e=>{if(!drag)return;state.legendPosition={x:drag.x+e.clientX-drag.x0,y:drag.y+e.clientY-drag.y0};legendPosition();};
  const end=()=>{if(drag){state.legendPosition=legendPosition();save();drag=null;}};title.onpointerup=end;title.onpointercancel=end;
  title.onkeydown=e=>{const delta={ArrowLeft:[-10,0],ArrowRight:[10,0],ArrowUp:[0,-10],ArrowDown:[0,10]}[e.key];if(!delta)return;e.preventDefault();const p=legendPosition();state.legendPosition={x:p.x+delta[0],y:p.y+delta[1]};state.legendPosition=legendPosition();save();};
  legendPosition();refreshSelection();
 }
 function showProfiles(){
  const profiles=result?.slopeProfiles;if(state.mode!=='slope'||state.profiles===false||!profiles?.length)return;
  const geometry=state.geometry,polys=geometry.type==='Polygon'?[geometry.coordinates]:geometry.coordinates,layouts=new Map();
  const project=(p,z)=>L.CRS.EPSG3857.latLngToPoint(L.latLng(p[0],p[1]),z);
  function layout(z){if(layouts.has(z))return layouts.get(z);const occupied=[],rows=profiles.map(p=>{const points=p.points.map(ll=>project(ll,z)),mid=points[Math.floor(points.length/2)],mpp=156543.03392*Math.cos(p.points[0][0]*Math.PI/180)/2**z;
    const label=mpp<=4&&!occupied.some(b=>Math.abs(mid.x-b.x)<72&&Math.abs(mid.y-b.y)<26);if(label)occupied.push(mid);return {p,points,mid,label,xMin:Math.min(...points.map(p=>p.x)),xMax:Math.max(...points.map(p=>p.x)),yMin:Math.min(...points.map(p=>p.y)),yMax:Math.max(...points.map(p=>p.y))};});layouts.set(z,rows);return rows;}
  const Layer=L.GridLayer.extend({createTile(coords){const canvas=document.createElement('canvas');canvas.width=canvas.height=256;canvas.className='dr-profile-tile';const c=canvas.getContext('2d'),ox=coords.x*256,oy=coords.y*256;
   c.beginPath();for(const poly of polys)for(const ring of poly){ring.forEach((ll,i)=>{const p=project([ll[1],ll[0]],coords.z);i?c.lineTo(p.x-ox,p.y-oy):c.moveTo(p.x-ox,p.y-oy);});c.closePath();}c.clip('evenodd');
   for(const row of layout(coords.z)){const {p,points,mid,label}=row;
    if(row.xMax<ox-50||row.xMin>ox+306||row.yMax<oy-30||row.yMin>oy+286)continue;
    c.beginPath();points.forEach((q,i)=>i?c.lineTo(q.x-ox,q.y-oy):c.moveTo(q.x-ox,q.y-oy));c.lineJoin=c.lineCap='round';c.strokeStyle='#fff';c.lineWidth=4;c.stroke();c.strokeStyle='#172f3c';c.lineWidth=2;c.stroke();
    const n=Math.floor(points.length*.65),a=points[Math.max(0,n-1)],b=points[Math.min(points.length-1,n)];
    if(!p.flat&&a&&b){const angle=Math.atan2(b.y-a.y,b.x-a.x);c.save();c.translate(b.x-ox,b.y-oy);c.rotate(angle);c.beginPath();c.moveTo(-7,-4);c.lineTo(0,0);c.lineTo(-7,4);c.strokeStyle='#fff';c.lineWidth=4;c.stroke();c.strokeStyle='#172f3c';c.lineWidth=2;c.stroke();c.restore();}
    if(label){const text='P'+p.id+' · '+number(p.percent,0)+'%';c.font='700 12px system-ui';c.textAlign='center';c.textBaseline='middle';c.strokeStyle='#fff';c.lineWidth=4;c.strokeText(text,mid.x-ox,mid.y-oy-10);c.fillStyle='#172f3c';c.fillText(text,mid.x-ox,mid.y-oy-10);}
   }return canvas;
  }});
  profileLayer=new Layer({pane:'departmentReport',bounds:geometryBounds(geometry),maxZoom:22,keepBuffer:1,updateWhenIdle:true}).addTo(map);
 }
 function profilePopup(p){const mid=p.points[Math.floor(p.points.length/2)];L.popup({maxWidth:280,className:'dr-profile-shell'}).setLatLng(mid).setContent('<div class="dr-profile-popup"><b>Profil P'+p.id+' · '+number(p.percent)+'%</b><span>Visine: '+number(p.topElevation,1)+' → '+number(p.bottomElevation,1)+' m</span><span>Visinska razlika: '+number(p.drop,1)+' m</span><span>Vodoravna dužina: '+number(p.distance,1)+' m</span><small>Nagib = '+number(p.drop,1)+' ÷ '+number(p.distance,1)+' × 100</small><small>Prosjek duž linije · DEM procjena'+(p.distance<30?' · kratak profil':'')+'</small><button type="button" onclick="DepartmentReport.open()">Pregled odjela</button></div>').openOn(map);}
 function viewProfile(id){if(!valid()||!result)return;const p=result.slopeProfiles?.find(p=>p.id===id);if(!p)return;state.visible=true;state.mode='slope';state.profiles=true;if(!save())return;render();hide();switchTab('karta');showLayers();map.fitBounds(L.latLngBounds(p.points),{padding:[45,45],maxZoom:17});profilePopup(p);}
 function renderProfiles(){const toggle=node('dr-profile-toggle'),info=result?.profileInfo,rows=result?.slopeProfiles||[];
  toggle.checked=state.profiles!==false;toggle.disabled=busy||!rows.length;node('dr-profile-info').textContent=!info?'Za linije nagiba ponovi izračun terena.':info.reason||('Profili: '+info.available+'/'+info.target+' · približno jedan na 3 ha.'+(info.unavailable?' Za '+info.unavailable+' mjesta nema dovoljno DEM uzoraka.':'')+(info.short?' Kratki profili: '+info.short+'.':''));
  const list=node('dr-profile-list');list.hidden=!rows.length;node('dr-profile-count').textContent=rows.length;
  const body=node('dr-profile-rows');body.replaceChildren();if(!list.open)return;
  for(const p of rows){const button=document.createElement('button');button.type='button';button.onclick=()=>viewProfile(p.id);const title=document.createElement('b'),meta=document.createElement('span');title.textContent='P'+p.id+' · '+number(p.percent)+'%';meta.textContent='Vodoravno '+number(p.distance,1)+' m · Δh '+number(p.drop,1)+' m';button.append(title,meta);body.append(button);}
 }
 function showLayers(){
  clearLayers();if(!valid()||!state.geometry||state.visible===false)return;
  // Raster i linije ne presreću dodire. Sam poligon izvještaja otvara pregled.
  if(!map.getPane('departmentReport'))map.createPane('departmentReport');Object.assign(map.getPane('departmentReport').style,{zIndex:'445',pointerEvents:'none'});
  if(!map.getPane('departmentReportHit'))map.createPane('departmentReportHit');Object.assign(map.getPane('departmentReportHit').style,{zIndex:'395',pointerEvents:'none'});
  boundary=L.geoJSON(state.geometry,{pane:'departmentReportHit',renderer:(hitRenderer||=L.svg({pane:'departmentReportHit'})),style:{color:'#2563eb',weight:2.5,fill:true,fillOpacity:0}}).addTo(map);
  refreshSelection();
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
  showProfiles();
  boundary.bringToFront?.();
  showLegend();
 }
 function openAt(ll){if(!valid()||selecting()||!state.geometry||state.visible===false||activeTool!=='select'||_msrOn||_guideOn||recOn||_tragOn||_dozGpsOn||_dozDrawType!==null||textToolOn||_tackaPlaceMode)return false;if(!turf.booleanPointInPolygon(turf.point([ll.lng,ll.lat]),turf.feature(state.geometry)))return false;
  if(profileLayer){const at=map.latLngToLayerPoint(ll);let nearest=null,best=10;for(const p of result.slopeProfiles)for(let i=1;i<p.points.length;i++){const d=L.LineUtil.pointToSegmentDistance(at,map.latLngToLayerPoint(p.points[i-1]),map.latLngToLayerPoint(p.points[i]));if(d<best){best=d;nearest=p;}}if(nearest){profilePopup(nearest);return true;}}
  open();return true;}
 const tabs=['overview','slope','aspect'];
 function renderTabs(){
  const selected=tabs.includes(state.tab)?state.tab:'overview';
  for(const tab of tabs){const button=node('dr-tab-'+tab);button.setAttribute('aria-selected',String(tab===selected));button.tabIndex=tab===selected?0:-1;node('dr-panel-'+tab).hidden=tab!==selected;}
 }
 function selectTab(tab,focus=false){
  if(!valid()||!tabs.includes(tab))return;
  const old=state.tab;state.tab=tab;if(!save())state.tab=old;renderTabs();
  if(focus)node('dr-tab-'+(tabs.includes(state.tab)?state.tab:'overview')).focus();
 }
 function tabKey(e,tab){
  let next=tabs.indexOf(tab);if(e.key==='ArrowRight')next=(next+1)%tabs.length;else if(e.key==='ArrowLeft')next=(next+tabs.length-1)%tabs.length;else if(e.key==='Home')next=0;else if(e.key==='End')next=tabs.length-1;else return;e.preventDefault();selectTab(tabs[next],true);
 }
 function viewMode(mode){if(!result||busy||!['slope','aspect'].includes(mode))return;change('mode',mode);view();}
 function render(){
  const s=result?.stats,area=state.geometry?turf.area(turf.feature(state.geometry))/10000:null;
  node('dr-name').value=state.name||'';node('dr-selection').textContent=state.geometry?(state.name?state.name+' · ':'')+number(area,2)+' ha · '+(state.count?state.count+' odsjeka / poligona':'ručno nacrtana granica')+(state.source?' · '+state.source:''):'Odaberi prostor za analizu.';
  node('dr-mode').value=state.mode||'slope';node('dr-lines').checked=state.lines!==false;node('dr-visible').checked=state.visible!==false;
  node('dr-legend-visible').checked=state.legendVisible!==false;node('dr-map-summary').textContent=state.geometry?(state.visible===false?'Izvještaj je sakriven s karte':'Izvještaj je prikazan na karti'):'Odaberi granicu ili nacrtaj odjel';
  for(const id of ['dr-calculate','dr-view','dr-remove'])node(id).disabled=busy||!state.geometry;
  node('dr-calculate').textContent=busy?'Računam…':'Izračunaj teren';node('dr-cancel-calc').hidden=!busy;
  node('dr-result').hidden=!s;
  const editor=node('dr-selection-editor');if(editor.dataset.calculated!==String(!!s)){editor.open=!s;editor.dataset.calculated=String(!!s);}
  renderTabs();node('dr-lines-option').hidden=state.mode==='aspect'||state.mode==='none';
  renderProfiles();
  for(const id of ['dr-slope-map','dr-aspect-map'])node(id).disabled=busy||!s;
  node('dr-status').textContent=busy?'Računam teren… Možeš zatvoriti ovaj prozor.':s?'Izračunato · '+new Date(state.calculatedAt||Date.now()).toLocaleString('bs'):'Izaberi odjel pa izračunaj teren. Za prvi izračun može biti potreban internet.';
  if(!s)return;
  node('dr-elevation').innerHTML='<div><small>Najniže</small><b>'+number(s.min,0)+' m</b></div><div><small>Prosjek</small><b>'+number(s.mean,0)+' m</b></div><div><small>Najviše</small><b>'+number(s.max,0)+' m</b></div>';
  node('dr-terrain-summary').textContent='Površina '+number(s.areaHa,2)+' ha · prosječan nagib '+number(s.slopeMean)+'% · najveći nagib '+number(s.slopeMax)+'%';
  node('dr-area').textContent=number(s.areaHa,2)+' ha';
  node('dr-slope-mean').textContent=number(s.slopeMean)+'%';node('dr-slope-max').textContent=number(s.slopeMax)+'%';
  const dominant=s.aspect.reduce((a,b)=>b.percent>a.percent?b:a);node('dr-aspect-main').textContent=dominant.percent>0?dominant.name:'Ravno / bez ekspozicije';
  node('dr-aspect-flat').textContent=number(s.flat)+'%';
  const rows=arr=>arr.map(r=>'<div class="dr-stat-row"><span><i style="background:'+r.color+'"></i>'+r.name+'</span><div><b>'+number(r.percent)+'%</b><small>'+number(r.ha,2)+' ha</small></div><progress max="100" value="'+r.percent+'" aria-label="'+r.name+'" style="--dr-color:'+r.color+'"></progress></div>').join('');
  node('dr-slopes').innerHTML=rows(s.slope);node('dr-aspects').innerHTML=rows(s.aspect);
  node('dr-coverage').textContent='DEM Mapzen / EU-DEM · uzorak oko '+number(s.resolution,0)+' m. Visine dostupne za '+number(s.coverage)+'% površine; nagib za '+number(s.slopeCoverage)+'%. Površine i teren su DEM procjena.';
 }
 function cancelCalculation(){++generation;cancelWorker?.();worker=null;busy=false;render();}
 async function setGeometry(geometry,count=0,source=''){
  if(!valid())return false;cancelCalculation();
  const current=owner,persistKey=key(),candidate={...state,geometry,count,source,visible:true,mode:'slope',tab:'overview',legendVisible:true,calculatedAt:null};const old=state;state=candidate;if(!save()){state=old;return false;}result=null;cancelDraw(false);await _kmlcDelete(persistKey);if(uid()!==current||owner!==current)return false;showLayers();await open();return true;
 }
 function choose(){if(!valid()||busy)return;if(recOn||_tragOn||_dozGpsOn||activeTool!=='select'){toast('Završi snimanje ili crtanje prije izbora odjela');return;}cancelDraw(false);DoznakaProjectBoundary.startForReport({hide,confirmed:async(g,count,source)=>{if(valid())await setGeometry(g,count,source);},cancel:()=>{if(valid())open();}});}
 function legacy(){const d=ProjectTerrain.dataFor();if(!d?.ring){toast('Aktivni projekat nema sačuvan nacrt');return;}const ring=d.ring.map(p=>[p[1],p[0]]);ring.push(ring[0]);setGeometry({type:'Polygon',coordinates:[ring]},0,'Poligon aktivnog projekta');}
 function addPoint(ll){if(!draft||!valid())return;if(draft.points.length>=500){toast('Najviše 500 tačaka');return;}const point=[ll.lat,ll.lng];if(draft.points.length&&map.distance(draft.points.at(-1),point)<1)return;draft.points.push(point);drawRender();}
 function drawClick(e){addPoint(e.latlng);}
 function drawRender(){if(draftLayer)map.removeLayer(draftLayer);draftLayer=null;if(draft?.points.length)draftLayer=L.polyline([...draft.points,...(draft.points.length>2?[draft.points[0]]:[])],{color:'#2563eb',weight:3,dashArray:'6 5',interactive:false}).addTo(map);node('dr-draw-count').textContent=(draft?.points.length||0)+' tačaka';node('dr-draw-save').disabled=(draft?.points.length||0)<3;}
 function draw(){if(!valid()||busy)return;if(recOn||_tragOn||_dozGpsOn||_msrOn||_guideOn||_dozKmlSelMode||_dozDrawType!==null||activeTool!=='select'){toast('Završi aktivni alat ili snimanje');return;}cancelDraw(false);hide();map.closePopup();switchTab('karta');draft={points:[],doubleZoom:map.doubleClickZoom.enabled(),actionDisplay:node('action-bar').style.display,tabDisplay:node('tab-bar').style.display};node('action-bar').style.display='none';node('tab-bar').style.display='none';map.doubleClickZoom.disable();map.on('click',drawClick);node('dr-draw-toolbar').hidden=false;drawRender();root.GithubLayers?.sync();}
 function cancelDraw(reopen=true){if(draft){map.off('click',drawClick);if(draft.doubleZoom)map.doubleClickZoom.enable();node('action-bar').style.display=draft.actionDisplay;node('tab-bar').style.display=draft.tabDisplay;map.invalidateSize();}draft=null;if(draftLayer)map.removeLayer(draftLayer);draftLayer=null;node('dr-draw-toolbar').hidden=true;root.GithubLayers?.sync();if(reopen&&valid())open();}
 async function finish(){if(!draft||!valid())return;const r=ProjectTerrain.validateRing(draft.points);if(r.error){toast(r.error);return;}const ring=r.ring.map(p=>[p[1],p[0]]);ring.push(ring[0]);const geometry={type:'Polygon',coordinates:[ring]};if(await setGeometry(geometry))cancelDraw(false);}
 function view(){if(!valid()||!state.geometry)return;state.visible=true;save();render();hide();switchTab('karta');map.invalidateSize();map.fitBounds(geometryBounds(state.geometry),{padding:[35,35],maxZoom:17});showLayers();}
 async function remove(){if(!valid()||busy||!state.geometry)return;const current=owner,persistKey=key(),g=state.geometry;if(!await _dlgConfirm('Ukloniti granicu i izvještaj? Učitani fajlovi i projekti ostaju sačuvani.',{danger:true}))return;if(uid()!==current||g!==state.geometry)return;const old=state;state={};if(!save()){state=old;return;}result=null;clearLayers();render();await _kmlcDelete(persistKey);}
 function change(field,value){if(!valid())return;if(field==='name')state.name=String(value).slice(0,120);else if(field==='mode'){if(!['slope','aspect','none'].includes(value))return;state.mode=value;}else if(['lines','profiles','visible','legendVisible','legendMin'].includes(field))state[field]=!!value;else return;if(save()){render();if(field==='legendVisible'||field==='legendMin'){legend?.remove();legend=null;if(state.visible!==false)showLegend();}else showLayers();}}
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
 root.DepartmentReport={open,restore,close,hide,choose,legacy,draw,addPoint,finish,cancelDraw,calculate,cancelCalculation,view,viewMode,viewProfile,renderProfiles,selectTab,tabKey,remove,change,reset,isDrawing:()=>!!draft,undo:()=>{draft?.points.pop();drawRender();},refreshSelection,openAt,snapshot:()=>({state,result,busy})};
 map.on('resize',legendPosition);
 document.addEventListener('keydown',e=>{if(e.key==='Escape'){if(draft)cancelDraw();else if(!node('department-report').hidden)close();}});
})(typeof window!=='undefined'?window:globalThis);
