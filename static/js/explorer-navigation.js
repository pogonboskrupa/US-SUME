/* Explorer: lokalni prikaz navigacije, bez promjene GPS snimanja i podataka. */
(function(root){
'use strict';
const finite=v=>typeof v==='number'&&Number.isFinite(v),norm=a=>(a%360+360)%360;
function rotate(p,a){const c=Math.cos(a),s=Math.sin(a);return {x:p.x*c-p.y*s,y:p.x*s+p.y*c};}
function distance(a,b){const r=Math.PI/180,lat=(b.la-a.la)*r,lon=(b.lo-a.lo)*r,x=Math.sin(lat/2)**2+Math.cos(a.la*r)*Math.cos(b.la*r)*Math.sin(lon/2)**2;return 6371000*2*Math.atan2(Math.sqrt(x),Math.sqrt(1-x));}
function bearing(a,b){const r=Math.PI/180,d=(b.lo-a.lo)*r;return norm(Math.atan2(Math.sin(d)*Math.cos(b.la*r),Math.cos(a.la*r)*Math.sin(b.la*r)-Math.sin(a.la*r)*Math.cos(b.la*r)*Math.cos(d))*180/Math.PI);}
/* Leaflet ostaje u svom koordinatnom prostoru. Samo tokom praćenja koristi
 * veći kvadratni viewport u zasebnom rotiranom omotaču; kontrole ostaju ravne.
 * Interakcije se vraćaju prije Pregleda karte. Ne mijenjamo Leaflet prototipe. */
function camera(map){
 const container=map.getContainer(),originalSize=map.getSize,originalMouse=map.mouseEventToContainerPoint;
 let world=null,anchor=null,side=0,size=null,angle=0,handlers=[],changing=false;
 function measure(){size=originalSize.call(map);side=Math.ceil(Math.hypot(size.x,size.y));if(world){world.style.width=world.style.height=side+'px';world.style.left=(size.x-side)/2+'px';world.style.top=(size.y-side)/2+'px';}}
 function block(e){if(e.target!==container&&!world?.contains(e.target))return;e.stopImmediatePropagation();if(e.cancelable)e.preventDefault();}
 const events=['click','dblclick','contextmenu','mousedown','touchstart','wheel'];
 return {
  get active(){return !!world;},get changing(){return changing;},get angle(){return angle;},get size(){return size||originalSize.call(map);},
  start(){
   if(world)return;
   const center=map.getCenter();map.stop();anchor=document.createComment('Explorer viewport');
   map._mapPane.parentNode.insertBefore(anchor,map._mapPane);
   world=document.createElement('div');world.className='ex-world';container.appendChild(world);world.appendChild(map._mapPane);
   measure();
   map.getSize=function(){return root.L.point(side,side);};
   map.mouseEventToContainerPoint=function(e){const p=originalMouse.call(map,e),v=rotate({x:p.x-size.x/2,y:p.y-size.y/2},angle*Math.PI/180);return root.L.point(v.x+side/2,v.y+side/2);};
   handlers=['dragging','touchZoom','doubleClickZoom','scrollWheelZoom','boxZoom','keyboard'].map(k=>({h:map[k],enabled:!!map[k]?.enabled()}));
   handlers.forEach(x=>x.h?.disable());events.forEach(e=>container.addEventListener(e,block,{capture:true,passive:false}));
   changing=true;try{map.setView(center,map.getZoom(),{animate:false,reset:true});}finally{changing=false;}
  },
  update(pos,heading,y){
   if(!world)return;
   angle=norm(heading||0);world.style.transform='rotate('+(-angle)+'deg)';
   const v=rotate({x:0,y:y-size.y/2},angle*Math.PI/180),p=map.project([pos.la,pos.lo],map.getZoom());
   changing=true;try{map.setView(map.unproject(root.L.point(p.x-v.x,p.y-v.y),map.getZoom()),map.getZoom(),{animate:false});}finally{changing=false;}
  },
  resize(){if(!world)return;const center=map.getCenter();map._sizeChanged=true;measure();changing=true;try{map.setView(center,map.getZoom(),{animate:false,reset:true});}finally{changing=false;}},
  screenPoint(ll){const p=map.latLngToContainerPoint(ll);if(!world)return p;const v=rotate({x:p.x-side/2,y:p.y-side/2},-angle*Math.PI/180);return root.L.point(v.x+size.x/2,v.y+size.y/2);},
  stop(){
   if(!world)return;
   const center=map.getCenter();map.stop();map.getSize=originalSize;map.mouseEventToContainerPoint=originalMouse;
   anchor.parentNode.insertBefore(map._mapPane,anchor);anchor.remove();world.remove();world=null;angle=0;
   events.forEach(e=>container.removeEventListener(e,block,true));handlers.forEach(x=>{if(x.enabled)x.h?.enable();});handlers=[];
   map.invalidateSize({animate:false,pan:false});map.setView(center,map.getZoom(),{animate:false,reset:true});
  }
 };
}
function create(options){
 const map=options.map,view=camera(map),g=id=>document.getElementById(id);
 let target=null,follow=true,visible=true,timer=null,goal=null,course=null,previous=null,lastView=0,lastCamera=null,pending=null,deferred=null,session=0,blocked=false,chrome=null,fieldRoom=0,overlays=[];
 const preferenceKey='tvlake_explorer_view_v1';
 function preference(){try{return root.localStorage.getItem(preferenceKey)!=='false';}catch(e){return true;}}
 const ui=(id,text)=>{const el=g(id);if(el&&el.textContent!==String(text))el.textContent=text;};
 function heading(now){const c=options.getCompass();if(c&&finite(c.value)&&now-c.ts<5000)return {value:norm(c.value),source:'Kompas'};if(course&&now-course.ts<12000)return {value:course.value,source:'Smjer kretanja'};return null;}
 const overlaySelector='[aria-modal="true"],[role="dialog"],.rs-sheet,.ab-pop,#menu-dropdown,#layer-sheet,#tacka-modal,#profil-modal,#trag-reg-modal,#dlg-overlay,#mapfav-modal,#granice-modal,#offline-modal,#sqlmap-modal,#tem-modal,#stil-modal,#upd-bg,#trag-quick-meta,#guide-draw-banner,#draw-banner,#doz-draw-banner,#project-draw-toolbar,#msr-draw-banner';
 const reserveIds=['action-bar','rec-banner','rec-bar'];
 function shown(el){return !!el&&!el.hidden&&el.getClientRects().length>0&&root.getComputedStyle(el).visibility!=='hidden';}
 function paint(){
  const show=!!target&&visible&&!blocked,key=show+'|'+follow;
  if(chrome===key)return;chrome=key;
  document.body.classList.toggle('explorer-follow',show&&follow);
  if(!show)view.stop();
  if(g('explorer-top'))g('explorer-top').hidden=!show;
  if(g('tacka-nav-panel'))g('tacka-nav-panel').style.display=show?'flex':'none';
  if(!show&&g('explorer-you'))g('explorer-you').hidden=true;
 }
 function syncOverlays(){
  const was=blocked;blocked=overlays.some(shown)||!!map._popup?.isOpen();
  paint();if(was!==blocked){lastView=0;lastCamera=null;}schedule();
 }
 function watchChrome(){
  overlays=Array.from(document.querySelectorAll(overlaySelector));
  const reserve=reserveIds.map(g).filter(Boolean),nodes=new Set([...overlays,...reserve]);
  // Pratimo i roditelje: dialog može biti otvoren, a njegova pozadina sakrivena.
  for(const el of Array.from(nodes))for(let parent=el.parentElement;parent;parent=parent.parentElement)nodes.add(parent);
  if(root.MutationObserver){const observer=new root.MutationObserver(syncOverlays);nodes.forEach(el=>observer.observe(el,{attributes:true,attributeFilter:['style','class','hidden','open']}));}
  if(root.ResizeObserver){const observer=new root.ResizeObserver(()=>{if(target)schedule();});reserve.forEach(el=>observer.observe(el));}
  syncOverlays();
 }
 function layout(){
  const r=map.getContainer().getBoundingClientRect(),top=g('explorer-top'),panel=g('tacka-nav-panel');
  let edge=Math.min(r.bottom,root.innerHeight);
  for(const id of reserveIds){const el=g(id);if(!shown(el))continue;const b=el.getBoundingClientRect();if(b.bottom>r.top&&b.top<edge&&b.right>r.left&&b.left<r.right)edge=Math.max(r.top,b.top);}
  const crowded=edge-r.top<(root.innerHeight<=480?280:400);if(document.body.classList.contains('explorer-crowded')!==crowded)document.body.classList.toggle('explorer-crowded',crowded);
  if(top){top.style.top=(r.top+10)+'px';top.style.left=(r.left+10)+'px';top.style.width=Math.max(0,r.width-20)+'px';top.hidden=crowded;}
  if(panel){panel.style.bottom=Math.max(8,root.innerHeight-edge+10)+'px';panel.style.left=(r.left+10)+'px';panel.style.width=Math.max(0,r.width-20)+'px';panel.style.maxHeight=Math.max(44,edge-r.top-20)+'px';}
  const min=(crowded?0:(top?.offsetHeight||60))+24,max=edge-r.top-(panel?.offsetHeight||170)-25;
  fieldRoom=max-min;
  return Math.max(20,Math.min(r.height-20,min+Math.max(0,max-min)*.76));
 }
 function render(){
  pending=null;if(!target)return;
  const now=Date.now(),pos=options.getPosition(),gps=options.isGpsOn(),fresh=pos&&finite(pos.ts)&&now-pos.ts>=0&&now-pos.ts<20000;
  const ac=pos&&finite(pos.ac)&&pos.ac>=0?pos.ac:null,valid=pos&&finite(pos.la)&&finite(pos.lo);
  const h=heading(now),dist=valid?distance(pos,target):null,arrived=gps&&fresh&&now-pos.ts<5000&&ac!=null&&ac<=15&&dist<=15;
  const status=!gps?'GPS isključen':!valid?'Tražim GPS signal':!fresh?'GPS pozicija zastarjela':ac==null?'GPS preciznost nepoznata':ac>35?'Slab GPS · ±'+Math.round(ac)+' m':'GPS ±'+Math.round(ac)+' m';
  ui('ex-gps',status+(gps&&fresh&&now-pos.ts>=5000?' · prije '+Math.floor((now-pos.ts)/1000)+' s':''));g('ex-gps')?.setAttribute('data-state',gps&&fresh&&ac!=null&&ac<=35?'ok':'warn');
  ui('tnp-name',target.name||'Odabrana lokacija');
  ui('tnp-air',arrived?'Stigao si':gps&&fresh&&dist!=null?(dist>=1000?(dist/1000).toFixed(2)+' km':Math.round(dist)+' m'):'—');
  ui('ex-distance-label',arrived?'U krugu od 15 m · provjeri cilj':'Do cilja · zračna udaljenost');
  ui('ex-heading',h?h.source+' · '+Math.round(h.value)+'°':'Smjer nije dostupan');
  const arrow=g('ex-direction-arrow');
  if(valid&&h&&gps&&fresh){
   const b=bearing(pos,target),rel=(b-h.value+540)%360-180;
   if(arrow){arrow.style.transform='rotate('+rel+'deg)';arrow.style.opacity='1';}
   ui('ex-instruction',arrived?'Odredište je blizu':Math.abs(rel)<20?'Cilj je ispred tebe':Math.abs(rel)>150?'Cilj je iza tebe':rel<0?'Cilj je lijevo od tebe':'Cilj je desno od tebe');
   options.onBearing?.(b);
  }else{if(arrow)arrow.style.opacity='.25';ui('ex-instruction',!gps?'Uključi GPS za praćenje':!fresh?'Čekam novu GPS poziciju':'Okreni telefon ili kreni za smjer');}
  if(g('ex-follow'))g('ex-follow').checked=follow;
  ui('ex-mode',follow?'EXPLORER · PRATI ME':'NAVIGACIJA · PREGLED KARTE');
  const start=g('ex-gps-start');if(start)start.hidden=gps;
  const usable=visible&&!blocked,y=usable?layout():0;
  if(usable&&follow&&valid&&fresh&&gps&&now-lastView>=250){
   lastView=now;const angle=h?.value??view.angle;
   const changed=!view.active||!lastCamera||distance(pos,lastCamera)>=1||Math.abs((angle-lastCamera.angle+540)%360-180)>=1.5||lastCamera.zoom!==map.getZoom()||Math.abs(lastCamera.y-y)>1;
   if(changed){if(!view.active)view.start();view.update(pos,angle,y);lastCamera={...pos,angle,y,zoom:map.getZoom()};}
  }else if(usable&&follow&&valid&&fresh&&gps&&deferred==null){
   deferred=root.setTimeout(()=>{deferred=null;render();},Math.max(1,250-(now-lastView)));
  }
  const you=g('explorer-you');if(you){you.hidden=!(usable&&fieldRoom>=20&&follow&&fresh&&valid&&gps&&view.active);if(!you.hidden){const p=view.screenPoint([pos.la,pos.lo]),r=map.getContainer().getBoundingClientRect();you.style.left=(r.left+p.x)+'px';you.style.top=(r.top+p.y)+'px';you.dataset.heading=h?'known':'none';}}
  if(g('ex-north'))g('ex-north').style.transform='rotate('+(-view.angle)+'deg)';
 }
 function schedule(){if(target&&pending==null)pending=root.requestAnimationFrame(render);}
 function stop(){
  session++;if(timer)root.clearInterval(timer);timer=null;if(pending!=null)root.cancelAnimationFrame(pending);pending=null;if(deferred!=null)root.clearTimeout(deferred);deferred=null;
  view.stop();lastCamera=null;if(goal){map.removeLayer(goal);goal=null;}target=null;course=null;previous=null;
  document.body.classList.remove('explorer-follow','explorer-nav','explorer-crowded');chrome=null;
  if(g('tacka-nav-panel'))g('tacka-nav-panel').style.display='none';if(g('explorer-top'))g('explorer-top').hidden=true;
  if(g('explorer-you'))g('explorer-you').hidden=true;
 }
 function inspect(){if(!target)return;follow=false;view.stop();paint();render();}
 const api={
  get active(){return !!target;},get following(){return !!target&&follow&&visible&&!blocked;},get angle(){return view.angle;},get destination(){return target;},get session(){return session;},screenPoint:ll=>view.screenPoint(ll),
  start(t){
   if(!t||!finite(t.la)||!finite(t.lo)||Math.abs(t.la)>90||Math.abs(t.lo)>180)return false;
   stop();if(g('tnp-elev')){g('tnp-elev').style.display='none';g('tnp-elev').textContent='';}map.invalidateSize({animate:false,pan:false});target={...t};follow=preference();visible=true;lastView=0;session++;
   goal=root.L.circleMarker([t.la,t.lo],{radius:9,color:'#fff',weight:3,fillColor:'#16a34a',fillOpacity:1,interactive:false}).addTo(map);
   document.body.classList.add('explorer-nav');syncOverlays();
   if(map.getZoom()<16||map.getZoom()>19)map.setZoom(17,{animate:false});
   render();timer=root.setInterval(render,1000);return true;
  },
  stop,inspect,
  rename(name){if(target){target.name=String(name||'Odabrana lokacija');schedule();}},
  setExplorerEnabled(on){
   if(!target)return false;on=!!on;try{root.localStorage.setItem(preferenceKey,String(on));}catch(e){}
   if(!target)return;if(!on){inspect();return;}follow=true;lastCamera=null;lastView=0;paint();render();
  },
  toggleFollow(){api.setExplorerEnabled(!follow);},
  onHeading:schedule,
  onFix(p){
   if(!target)return;
   const now=Date.now(),ts=finite(p.ts)?p.ts:now;
   if(finite(p.heading)&&finite(p.speed)&&p.speed>=.6&&finite(p.ac)&&p.ac<=35)course={value:norm(p.heading),ts};
   else if(previous&&ts-previous.ts>0&&ts-previous.ts<12000&&finite(p.ac)&&p.ac<=20&&previous.ac<=20&&distance(previous,p)>Math.max(5,p.ac))course={value:bearing(previous,p),ts};
   previous={...p,ts};schedule();
  },
  setVisible(on){visible=!!on;paint();if(target&&visible&&!blocked){lastView=0;render();}},
  requestCompass:async function(){
   const token=session;
   try{if(root.DeviceOrientationEvent?.requestPermission){const result=await root.DeviceOrientationEvent.requestPermission();if(result!=='granted'&&token===session)options.toast?.('Dozvola za kompas nije odobrena; smjer kretanja se koristi kada je dostupan.');}}
   catch(e){if(token===session)options.toast?.('Kompas nije dostupan; kreni da GPS odredi smjer.');}
   schedule();
  },
  zoom(d){map.setZoom(Math.max(14,Math.min(20,map.getZoom()+d)),{animate:false});lastView=0;render();},
  overview(){inspect();const p=options.getPosition();if(p&&finite(p.la)&&finite(p.lo))map.fitBounds(root.L.latLngBounds([[p.la,p.lo],[target.la,target.lo]]),{padding:[40,80],maxZoom:17});else map.setView([target.la,target.lo],17);},
  refresh:render
 };
 root.addEventListener('resize',()=>{if(target){view.resize();lastView=0;schedule();}});
 map.on('moveend',()=>{if(target&&follow&&visible&&!blocked&&view.active&&!view.changing){lastCamera=null;schedule();}});
 if(root.ResizeObserver){const observer=new root.ResizeObserver(()=>{if(target&&visible){view.resize();lastView=0;schedule();}});observer.observe(map.getContainer());}
 document.addEventListener('visibilitychange',()=>{if(!document.hidden&&target){lastView=0;schedule();}});
 map.on('popupopen popupclose',syncOverlays);
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',watchChrome,{once:true});else watchChrome();
 return api;
}
root.ExplorerNavigation={create,distance,bearing,rotate};
})(window);
