/* Poligon aktivnog odjela i DEM prikaz: lokalno po nalogu/projektu. */
(function(root){
  'use strict';
  const PREFIX='tvlake_project_polygon_v1_',MAX_POINTS=500;
  let mounted='',outline=null,slope=null,aspect=null,draft=null,draftLayer=null;
  const demCache=new Map();
  const node=id=>document.getElementById(id);
  const toast=s=>{if(typeof showToast==='function')showToast(s);};
  const keyFor=(uid,id)=>PREFIX+encodeURIComponent(uid)+'_'+encodeURIComponent(id);
  function scope(){
    const uid=typeof sbUser!=='undefined'?sbUser?.id:null,id=typeof _aktivniProjektId!=='undefined'?_aktivniProjektId:null;
    const project=typeof _projekti!=='undefined'?_projekti.find(p=>p.id===id):null;
    return uid&&id&&project?{uid,id,project,key:keyFor(uid,id)}:null;
  }
  function cleanRing(input){
    if(!Array.isArray(input)||input.length>MAX_POINTS+1)return null;
    const ring=[];
    for(const p of input){
      if(!Array.isArray(p)||p.length!==2||!p.every(Number.isFinite)||Math.abs(p[0])>85||Math.abs(p[1])>180)return null;
      if(!ring.length||p[0]!==ring.at(-1)[0]||p[1]!==ring.at(-1)[1])ring.push(p.slice());
    }
    if(ring.length>1&&ring[0][0]===ring.at(-1)[0]&&ring[0][1]===ring.at(-1)[1])ring.pop();
    return ring.length>=3&&ring.length<=MAX_POINTS?ring:null;
  }
  function cross(a,b,c){return (b[1]-a[1])*(c[0]-a[0])-(b[0]-a[0])*(c[1]-a[1]);}
  function intersects(a,b,c,d){
    const on=(p,q,r)=>Math.abs(cross(p,q,r))<1e-14&&r[0]>=Math.min(p[0],q[0])&&r[0]<=Math.max(p[0],q[0])&&r[1]>=Math.min(p[1],q[1])&&r[1]<=Math.max(p[1],q[1]);
    const x=cross(a,b,c),y=cross(a,b,d),z=cross(c,d,a),w=cross(c,d,b);
    return x*y<0&&z*w<0||on(a,b,c)||on(a,b,d)||on(c,d,a)||on(c,d,b);
  }
  function validateRing(input){
    const ring=cleanRing(input);if(!ring)return {error:'Poligon treba najmanje tri različite tačke (najviše 500).'};
    let area=0;for(let i=0;i<ring.length;i++){const a=ring[i],b=ring[(i+1)%ring.length];area+=a[1]*b[0]-b[1]*a[0];
      for(let j=i+1;j<ring.length;j++){if(j===i+1||i===0&&j===ring.length-1)continue;
        if(intersects(a,b,ring[j],ring[(j+1)%ring.length]))return {error:'Ivice poligona se sijeku. Vrati posljednju tačku i ispravi granicu.'};}}
    if(Math.abs(area)<1e-12)return {error:'Poligon nema površinu. Tačke ne mogu biti na istoj liniji.'};
    return {ring};
  }
  function read(s){
    try{const d=JSON.parse(localStorage.getItem(s.key)||'{}');return {ring:cleanRing(d?.ring),slope:d?.slope===true,aspect:d?.aspect===true,visible:d?.visible!==false};}
    catch(e){return {ring:null,slope:false,aspect:false,visible:true};}
  }
  function write(s,data){
    if(scope()?.key!==s.key)return false;
    try{localStorage.setItem(s.key,JSON.stringify(data));return true;}
    catch(e){toast('Poligon/postavke nisu sačuvani. Provjeri memoriju; nacrt ostaje otvoren.');return false;}
  }
  function tileLat(y,z){return Math.atan(Math.sinh(Math.PI*(1-2*y/Math.pow(2,z))))*180/Math.PI;}
  function gradient(elev,px,py,z,y,pixelMetres){
    const metres=pixelMetres||Math.cos(tileLat(y+(py+.5)/256,z)*Math.PI/180)*156543.03392/Math.pow(2,z);
    const quality=root.DemQuality||(typeof require==='function'?require('./dem-quality.js'):null);
    return quality.gradient(elev,px,py,metres);
  }
  function slopeRGBA(percent){
    if(!Number.isFinite(percent)||percent<=30)return [0,0,0,0];
    const t=Math.min(1,(percent-30)/70);return [Math.round(245-90*t),Math.round(100-80*t),Math.round(35-15*t),200];
  }
  function pixels(elev,coords,mode){
    const out=new Uint8ClampedArray(256*256*4);
    for(let y=0;y<256;y++){const metres=Math.cos(tileLat(coords.y+(y+.5)/256,coords.z)*Math.PI/180)*156543.03392/Math.pow(2,coords.z);for(let x=0;x<256;x++){
      const g=gradient(elev,x,y,coords.z,coords.y,metres);
      const rgba=mode==='slope'?slopeRGBA(g.percent):(Number.isFinite(g.percent)&&g.percent>.01?_aspColor(g.bearing,1.5):[0,0,0,0]);
      out.set(rgba,(y*256+x)*4);
    }}
    return out;
  }
  async function decoded(coords){
    const key=coords.z+'/'+coords.x+'/'+coords.y;if(demCache.has(key))return demCache.get(key);
    const promise=(async()=>{const src=await _getTerrariumTile(coords.z,coords.x,coords.y);if(!src)return null;
      try{return _terrariumDecodeTile(src);}finally{if(typeof src.close==='function')src.close();}})().catch(()=>null);
    demCache.set(key,promise);while(demCache.size>24)demCache.delete(demCache.keys().next().value);
    const result=await promise;if(!result&&demCache.get(key)===promise)demCache.delete(key);return result;
  }
  function status(){
    const el=node('project-terrain-status');if(!el)return;
    const layers=[slope,aspect].filter(Boolean),missing=layers.reduce((n,l)=>n+l._missing,0),ok=layers.reduce((n,l)=>n+l._ready,0);
    el.textContent=!layers.length?'Podaci terena: Mapzen / EU-DEM, približno 30 m u BiH. Za offline rad prethodno preuzmi područje.':missing?'Dio terena nije dostupan. Preuzmi DEM uz internet; prazan dio nije potvrda ravnog terena.':ok?'DEM prikaz učitan; veći zum ne dodaje preciznost. Nagib je u procentima; prag je strogo >30%.':'Učitavam model terena…';
  }
  function makeLayer(mode,ring){
    const owner=scope()?.key;
    const Layer=L.GridLayer.extend({createTile(coords,done){
      const canvas=document.createElement('canvas');canvas.width=canvas.height=256;
      decoded(coords).then(elev=>{
        if(owner!==scope()?.key||![slope,aspect].includes(this)){done(null,canvas);return;}
        if(!elev){this._missing++;status();done(null,canvas);return;}
        const raw=document.createElement('canvas');raw.width=raw.height=256;
        const rc=raw.getContext('2d'),data=rc.createImageData(256,256);data.data.set(pixels(elev,coords,mode));rc.putImageData(data,0,0);
        const ctx=canvas.getContext('2d');ctx.beginPath();
        ring.forEach((p,i)=>{const point=L.CRS.EPSG3857.latLngToPoint(L.latLng(p[0],p[1]),coords.z);const x=point.x-coords.x*256,y=point.y-coords.y*256;i?ctx.lineTo(x,y):ctx.moveTo(x,y);});
        ctx.closePath();ctx.clip();ctx.drawImage(raw,0,0);this._ready++;status();done(null,canvas);
      }).catch(()=>{if(owner===scope()?.key&&[slope,aspect].includes(this)){this._missing++;status();}done(null,canvas);});return canvas;
    }});
    const layer=new Layer({pane:mode==='slope'?'projectSlope':'projectAspect',bounds:L.latLngBounds(ring),minZoom:0,maxNativeZoom:14,maxZoom:22,keepBuffer:1,updateWhenIdle:true,opacity:mode==='slope'?.9:.65});
    layer._ready=0;layer._missing=0;return layer;
  }
  function removeLayers(){for(const layer of [outline,slope,aspect])if(layer)map.removeLayer(layer);outline=slope=aspect=null;}
  function render(s,d){
    const context=node('project-polygon-context');if(!context)return;
    context.textContent=s?[s.project.gj,s.project.odjel?'Odjel '+s.project.odjel:''].filter(Boolean).join(' · '):'Aktiviraj projekat za crtanje granice.';
    const count=node('project-polygon-summary');if(count){let area='';if(d.ring&&typeof turf!=='undefined'){const coords=d.ring.map(p=>[p[1],p[0]]);coords.push(coords[0]);area=(turf.area(turf.polygon([coords]))/10000).toLocaleString('bs',{maximumFractionDigits:2})+' ha · ';}count.textContent=d.ring?area+d.ring.length+' tačaka granice':'Poligon još nije nacrtan.';}
    for(const [id,field]of [['project-polygon-visible','visible'],['project-terrain-slope','slope'],['project-terrain-aspect','aspect']]){const cb=node(id);if(cb){cb.checked=!!d[field];cb.disabled=!s||!d.ring;}}
    for(const id of ['project-polygon-view','project-polygon-delete'])if(node(id))node(id).disabled=!s||!d.ring;
    if(node('project-polygon-draw')){node('project-polygon-draw').disabled=!s;node('project-polygon-draw').textContent=d.ring?'Nacrtaj novu granicu':'Nacrtaj poligon odjela';}
    const legend=node('project-terrain-legend');if(legend){legend.hidden=!(d.ring&&(d.slope||d.aspect));legend.children[0].style.display=d.slope?'block':'none';legend.children[1].style.display=d.aspect?'block':'none';}status();
  }
  function refresh(){
    const s=scope(),d=s?read(s):{ring:null,slope:false,aspect:false,visible:false};
    if(draft&&draft.scope.key!==s?.key)cancel();
    const signature=s?s.key+JSON.stringify(d):'';
    // Projektni prikaz zamjenjuje isti sloj preko cijele karte.
    if(d.ring&&typeof _OVL!=='undefined'&&typeof _ovlState!=='undefined'){
      let changed=false;
      for(const [field,id]of [['slope','slope'],['aspect','ekspo']])if(d[field]){
        if(_OVL[id]&&map.hasLayer(_OVL[id]))map.removeLayer(_OVL[id]);
        if(_ovlState[id]){_ovlState[id]=false;changed=true;}
        if(node('inst-'+id+'-cb'))node('inst-'+id+'-cb').checked=false;
      }
      if(changed){try{localStorage.setItem('tvlake_ovl_state',JSON.stringify(_ovlState));}catch(e){}if(typeof _demLegendUpdate==='function')_demLegendUpdate();}
    }
    if(signature!==mounted){removeLayers();mounted=signature;
      if(s&&d.ring){for(const [pane,z]of [['projectAspect',260],['projectSlope',261],['projectBoundary',395]]){if(!map.getPane(pane))map.createPane(pane);Object.assign(map.getPane(pane).style,{zIndex:String(z),pointerEvents:'none'});}
        if(typeof _hideProjektOdjelHighlight==='function')_hideProjektOdjelHighlight();
        if(d.visible)outline=L.polygon(d.ring,{pane:'projectBoundary',color:'#f97316',weight:3,fillOpacity:.03,interactive:false}).addTo(map);
        if(d.aspect){aspect=makeLayer('aspect',d.ring);aspect.addTo(map);}
        if(d.slope){slope=makeLayer('slope',d.ring);slope.addTo(map);}
      }else if(s&&typeof _refreshProjektOdjelHighlight==='function')_refreshProjektOdjelHighlight();
    }
    render(s,d);
  }
  function toggle(field,on){if(!['visible','slope','aspect'].includes(field))return;const s=scope();if(!s)return;const d=read(s);if(!d.ring)return;if(write(s,{...d,[field]:!!on}))refresh();else render(s,d);}
  function drawRender(){
    if(draftLayer)map.removeLayer(draftLayer);draftLayer=null;
    if(draft?.points.length)draftLayer=L.polyline([...draft.points,...(draft.points.length>2?[draft.points[0]]:[])],{color:'#f97316',weight:3,dashArray:'6 5',interactive:false,pane:'projectBoundary'}).addTo(map);
    if(node('project-draw-count'))node('project-draw-count').textContent=(draft?.points.length||0)+' tačaka · dodirni kartu uz granicu odjela';
    if(node('project-draw-save'))node('project-draw-save').disabled=!draft||draft.points.length<3;
    if(node('project-draw-undo'))node('project-draw-undo').disabled=!draft?.points.length;
  }
  function drawClick(e){if(!draft)return;const p=[e.latlng.lat,e.latlng.lng],last=draft.points.at(-1);if(last&&map.distance(last,p)<1)return;if(draft.points.length>=MAX_POINTS){toast('Najviše 500 tačaka po poligonu.');return;}draft.points.push(p);drawRender();}
  function start(){
    const s=scope();if(!s){toast('Prvo aktiviraj projekat.');return;}
    if((typeof recOn!=='undefined'&&recOn)||(typeof _tragOn!=='undefined'&&_tragOn)||(typeof _dozGpsOn!=='undefined'&&_dozGpsOn)||(typeof _msrOn!=='undefined'&&_msrOn)||(typeof _guideOn!=='undefined'&&_guideOn)||(typeof textToolOn!=='undefined'&&textToolOn)||(typeof _tackaPlaceMode!=='undefined'&&_tackaPlaceMode)||(typeof _mdpIdx!=='undefined'&&_mdpIdx!==null)||(typeof _dozDrawType!=='undefined'&&_dozDrawType!==null)||(typeof activeTool!=='undefined'&&activeTool!=='select')){toast('Završi aktivno snimanje ili alat prije crtanja poligona.');return;}
    cancel();refresh();if(!map.getPane('projectBoundary'))map.createPane('projectBoundary');Object.assign(map.getPane('projectBoundary').style,{zIndex:'395',pointerEvents:'none'});
    draft={scope:s,points:[],doubleZoom:map.doubleClickZoom.enabled()};map.doubleClickZoom.disable();map.getContainer().classList.add('project-drawing');map.on('click',drawClick);
    if(typeof switchTab==='function')switchTab('karta');if(typeof closeVlakaPopup==='function')closeVlakaPopup();node('project-draw-toolbar').hidden=false;drawRender();
  }
  function cancel(){
    if(draft){map.off('click',drawClick);map.getContainer().classList.remove('project-drawing');if(draft.doubleZoom)map.doubleClickZoom.enable();}
    if(draftLayer)map.removeLayer(draftLayer);draftLayer=null;draft=null;if(node('project-draw-toolbar'))node('project-draw-toolbar').hidden=true;
  }
  function finish(){if(!draft)return;const result=validateRing(draft.points);if(result.error){toast(result.error);return;}const s=draft.scope;if(scope()?.key!==s.key){cancel();return;}
    const previous=read(s);if(!write(s,{...previous,ring:result.ring,visible:true}))return;cancel();refresh();toast('Poligon odjela sačuvan na telefonu.');}
  async function del(){const s=scope();if(!s)return;const previous=localStorage.getItem(s.key);if(!read(s).ring)return;
    if(!await _dlgConfirm('Ukloniti nacrtani poligon ovog projekta? Vlake i ostali podaci ostaju sačuvani.',{danger:true}))return;
    if(scope()?.key!==s.key||localStorage.getItem(s.key)!==previous){toast('Projekat ili poligon se promijenio. Ponovi radnju.');return;}
    if(write(s,{ring:null,slope:false,aspect:false,visible:true})){cancel();refresh();}
  }
  function view(){const s=scope(),ring=s?read(s).ring:null;if(!ring)return;if(typeof switchTab==='function')switchTab('karta');map.invalidateSize();map.fitBounds(L.latLngBounds(ring),{padding:[30,30],maxZoom:18});}
  function reset(){cancel();removeLayers();mounted='';demCache.clear();}
  function invalidateDEM(){demCache.clear();for(const l of [slope,aspect])if(l){l._ready=l._missing=0;l.redraw();}status();}
  function dataFor(id){const s=scope();if(!s)return null;id=id||s.id;if(typeof _projekti==='undefined'||!_projekti.some(p=>p.id===id))return null;return read({...s,id,key:keyFor(s.uid,id)});}
  root.ProjectTerrain={slopeLayer:()=>slope,refresh,toggle,start,cancel,finish,del,view,reset,invalidateDEM,dataFor,keyFor,isDrawing:()=>!!draft,undo:()=>{if(draft){draft.points.pop();drawRender();}},cleanRing,validateRing,gradient,slopeRGBA,pixels};
  if(typeof module!=='undefined'&&module.exports)module.exports=root.ProjectTerrain;
  if(typeof document!=='undefined'){
    document.addEventListener('keydown',e=>{if(e.key==='Escape'&&draft)cancel();});
    document.addEventListener('click',e=>{if(draft&&e.target.closest('button')&&!e.target.closest('#project-draw-toolbar')&&!e.target.closest('#map-ctrl-bar'))cancel();},true);
    document.addEventListener('DOMContentLoaded',refresh,{once:true});
  }
})(typeof window!=='undefined'?window:globalThis);
