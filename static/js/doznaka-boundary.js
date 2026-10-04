/* Prijedlog granice iz vidljive topo podloge. Ručna geometrija se mijenja samo potvrdom. */
(function(root){
'use strict';
const fail=reason=>({ok:false,reason});
const dist=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
function projection(p,a,b){const dx=b[0]-a[0],dy=b[1]-a[1],l=Math.hypot(dx,dy),t=((p[0]-a[0])*dx+(p[1]-a[1])*dy)/(l*l||1);return {t,d:dist(p,[a[0]+Math.max(0,Math.min(1,t))*dx,a[1]+Math.max(0,Math.min(1,t))*dy]),l};}
function area(points){return Math.abs(points.reduce((s,p,i)=>{const q=points[(i+1)%points.length];return s+p[0]*q[1]-q[0]*p[1];},0))/2;}
function crosses(p){const orient=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);for(let i=0;i<p.length;i++)for(let j=i+2;j<p.length;j++){if(i===0&&j===p.length-1)continue;const a=p[i],b=p[(i+1)%p.length],c=p[j],d=p[(j+1)%p.length];if(orient(a,b,c)*orient(a,b,d)<0&&orient(c,d,a)*orient(c,d,b)<0)return true;}return false;}
function intersection(a,b,c,d){const x=b[0]-a[0],y=b[1]-a[1],u=d[0]-c[0],v=d[1]-c[1],det=x*v-y*u;if(Math.abs(det)<1e-6)return null;const t=((c[0]-a[0])*v-(c[1]-a[1])*u)/det;return [a[0]+t*x,a[1]+t*y];}
function simplify(points,tolerance=3){
 if(points.length<=3)return points.map(p=>p.slice());const keep=new Set([0,points.length-1]),stack=[[0,points.length-1]];
 while(stack.length){const [a,b]=stack.pop();let max=tolerance,at=-1;for(let i=a+1;i<b;i++){const d=projection(points[i],points[a],points[b]).d;if(d>max){max=d;at=i;}}if(at>=0){keep.add(at);stack.push([a,at],[at,b]);}}
 return [...keep].sort((a,b)=>a-b).map(i=>points[i].slice());
}
function detect(input){
 const {width:W,height:H,points,words=[],color='auto'}=input,data=new Uint8ClampedArray(input.data),radius=Math.max(4,Math.min(100,Number(input.radius)||25));
 if(!Number.isInteger(W)||!Number.isInteger(H)||W<16||H<16||W*H>1500000||data.length!==W*H*4)return fail('Prevelik ili neispravan izrez karte.');
 if(!Array.isArray(points)||points.length<3||points.length>64||points.some(p=>p.length!==2||!p.every(Number.isFinite)||p[0]<0||p[1]<0||p[0]>=W||p[1]>=H)||crosses(points)||area(points)<100)return fail('Nacrtaj jednostavnu približnu granicu, bez ukrštanja.');
 const mask=new Uint8Array(W*H),queue=new Int32Array(W*H);
 for(let i=0;i<mask.length;i++){const k=i*4,r=data[k],g=data[k+1],b=data[k+2];if(data[k+3]<200)continue;if(r<85&&g<85&&b<100)mask[i]=1;else if(b>70&&b>r*1.25+15&&b>g*1.1+5&&r<140&&g<180)mask[i]=2;}
 for(const box of words){if(![box.x0,box.y0,box.x1,box.y1].every(Number.isFinite))continue;for(let y=Math.max(0,Math.floor(box.y0)-1);y<Math.min(H,Math.ceil(box.y1)+1);y++)mask.fill(0,y*W+Math.max(0,Math.floor(box.x0)-1),y*W+Math.min(W,Math.ceil(box.x1)+1));}
 const components=[];
 for(let seed=0;seed<mask.length;seed++){
  const ink=mask[seed];if(!ink)continue;let head=0,tail=1,n=0,sx=0,sy=0,sxx=0,syy=0,sxy=0;queue[0]=seed;mask[seed]=0;
  while(head<tail){const at=queue[head++],x=at%W,y=Math.floor(at/W);n++;sx+=x;sy+=y;sxx+=x*x;syy+=y*y;sxy+=x*y;for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){if(!dx&&!dy||x+dx<0||x+dx>=W||y+dy<0||y+dy>=H)continue;const j=at+dy*W+dx;if(mask[j]===ink){mask[j]=0;queue[tail++]=j;}}}
  if(n<16)continue;const x=sx/n,y=sy/n,a=sxx/n-x*x,b=sxy/n-x*y,c=syy/n-y*y,delta=Math.hypot(a-c,2*b),major=(a+c+delta)/2,minor=Math.max(0,(a+c-delta)/2),length=Math.sqrt(12*major+1),thickness=Math.sqrt(12*minor+1),angle=.5*Math.atan2(2*b,a-c);
  // Odvojene debele crtice, ne tanke izohipse, zatvoreni simboli ili neprekinuti put.
  if(length<8||length>100||thickness<2.4||thickness>16||length/thickness<2.3||n/(length*thickness)<.4)continue;
  components.push({p:[x,y],length,ink,ux:Math.cos(angle),uy:Math.sin(angle)});
 }
 function forColor(ink){
  const sides=points.map(()=>[]);
  for(const c of components.filter(c=>c.ink===ink)){
   let nearest=null;points.forEach((a,i)=>{const b=points[(i+1)%points.length],p=projection(c.p,a,b),alignment=Math.abs(((b[0]-a[0])*c.ux+(b[1]-a[1])*c.uy)/(p.l||1));if(p.d<=radius&&p.t>=0&&p.t<=1&&alignment>.65&&(!nearest||p.d<nearest.d))nearest={...p,i};});
   if(nearest)sides[nearest.i].push({...c,t:nearest.t});
  }
  let count=0;
  for(let i=0;i<sides.length;i++){
   const s=sides[i].sort((a,b)=>a.t-b.t),a=points[i],b=points[(i+1)%points.length],len=dist(a,b);
   if(s.length<3||(s.at(-1).t-s[0].t)<.6||s[0].t*len>Math.max(radius,s[0].length*2)||(1-s.at(-1).t)*len>Math.max(radius,s.at(-1).length*2))return null;
   let gaps=0;for(let j=1;j<s.length;j++){const along=(s[j].t-s[j-1].t)*len,space=along-(s[j].length+s[j-1].length)/2;if(along<3||space<-3||space>Math.max(45,(s[j].length+s[j-1].length)*2))return null;if(space>1)gaps++;}
   if(gaps<2)return null;count+=s.length;
  }
  const corners=points.map((p,i)=>{const prev=sides[(i+sides.length-1)%sides.length],next=sides[i],a=prev.at(-2).p,b=prev.at(-1).p,c=next[0].p,d=next[1].p;let q=intersection(a,b,c,d);if(!q){const dx=d[0]-c[0],dy=d[1]-c[1],t=((p[0]-c[0])*dx+(p[1]-c[1])*dy)/(dx*dx+dy*dy||1);q=[c[0]+t*dx,c[1]+t*dy];}return dist(q,p)<=radius*1.5?q:null;});
  if(corners.some(p=>!p))return null;
  const ring=[];for(let i=0;i<points.length;i++){ring.push(corners[i]);for(const c of sides[i])if(projection(c.p,corners[i],corners[(i+1)%points.length]).t>0&&projection(c.p,corners[i],corners[(i+1)%points.length]).t<1)ring.push(c.p);}
  const simple=simplify([...ring,ring[0]],1.5).slice(0,-1),ratio=area(simple)/area(points);
  if(simple.length<3||simple.length>200||simple.some(p=>p[0]<0||p[1]<0||p[0]>=W||p[1]>=H)||crosses(simple)||ratio<.5||ratio>2)return null;
  return {ok:true,points:simple,dashes:count,color:ink===1?'black':'blue'};
 }
 const black=color!=='blue'?forColor(1):null,blue=color!=='black'?forColor(2):null;
 if(black&&blue)return fail('Vidljive su dvije moguće granice. Izaberi crnu ili plavu boju i ponovi.');
 return black||blue||fail('Nema jasnog niza debelih isprekidanih linija uz cijelu granicu. Približi kartu ili nacrtaj bliže granici.');
}
const api={detect,simplify,area,crosses};
if(typeof module!=='undefined'&&module.exports){module.exports=api;return;}
if(typeof document==='undefined'){root.onmessage=e=>{try{root.postMessage(detect(e.data));}catch(err){root.postMessage(fail(err.message));}};return;}
let generation=0,busy=false,worker=null,preview=null,proposal=null,stamp='',source=null,workerReject=null;
const $=id=>document.getElementById(id),message=s=>{const el=$('doz-boundary-status');if(el)el.textContent=s;};
function online(){try{return navigator.onLine!==false&&(!root.AndroidReferenceOcr?.isOnline||root.AndroidReferenceOcr.isOnline());}catch(e){return false;}}
function scope(){return JSON.stringify([typeof sbUser!=='undefined'?sbUser?.id:null,typeof _aktivniProjektId!=='undefined'?_aktivniProjektId:null,_dozDrawType,_dozNewOdjelDrawGj,_dozNewOdjelDrawOdjel,_dozDrawPts]);}
function base(){const key=typeof _activeLayerKey==='function'?_activeLayerKey():null;if(key?.startsWith('_sqlite_'))return _sqlLayers[Number(key.slice(8))]?.layer;if(key==='⛰ Topo'||key==='_nagib'||key==='_granice')return TL['⛰ Topo'];return null;}
function refresh(){const box=$('doz-boundary-tools');if(!box)return;box.hidden=_dozDrawType!=='__boundary__';$('doz-boundary-detect').disabled=busy||_dozDrawPts.length<3||!online();$('doz-boundary-detect').textContent=busy?'Prepoznavanje…':'Prepoznaj granicu · online';$('doz-boundary-accept').hidden=!proposal;$('doz-boundary-keep').hidden=!proposal&&!busy;$('doz-boundary-color').disabled=busy;$('doz-boundary-radius').disabled=busy;}
function invalidate(){generation++;if(worker){worker.terminate();worker=null;}if(workerReject){workerReject(Error('Prepoznavanje je otkazano.'));workerReject=null;}if(preview){map.removeLayer(preview);preview=null;}proposal=null;source=null;stamp='';busy=false;if($('doz-boundary-status'))message('Crne/plave debele crtice na topo karti. Ručna granica ostaje do potvrde.');refresh();}
function assertSource(ticket){if(ticket!==generation||scope()!==stamp||base()!==source)throw Error('Granica ili karta je promijenjena. Pokreni prepoznavanje ponovo.');if(!online())throw Error('Prepoznavanje traži internet. Ručna granica je sačuvana.');}
async function capture(ticket){
 const bounds=L.latLngBounds(_dozDrawPts.map(p=>[p.lat,p.lng]));
 map.fitBounds(bounds,{animate:false,paddingTopLeft:[35,35],paddingBottomRight:[35,Math.min($('doz-draw-banner').getBoundingClientRect().height+65,map.getSize().y*.65)],maxZoom:18});
 // Nema crtanja dok fitBounds pomjera centar; pozivatelj je već pauzirao režim Crtaj.
 const end=Date.now()+6500;while(Date.now()<end){assertSource(ticket);if(!source.isLoading?.()&&Object.values(source._tiles||{}).some(t=>t.current&&t.loaded))break;await new Promise(r=>setTimeout(r,150));}
 assertSource(ticket);
 const size=map.getSize(),scale=Math.min(2,1400/Math.max(size.x,size.y),Math.sqrt(1500000/(size.x*size.y))),canvas=document.createElement('canvas');canvas.width=Math.floor(size.x*scale);canvas.height=Math.floor(size.y*scale);
 const ctx=canvas.getContext('2d',{willReadFrequently:true}),rect=map.getContainer().getBoundingClientRect(),coverage=document.createElement('canvas');coverage.width=canvas.width;coverage.height=canvas.height;const cover=coverage.getContext('2d');let tiles=0;
 for(const tile of Object.values(source._tiles||{})){
  const el=tile.el;if(!tile.current||!tile.loaded||!el||el._empty||(el.tagName==='IMG'&&(!el.complete||!el.naturalWidth)))continue;
  const r=el.getBoundingClientRect(),x=(r.left-rect.left)*scale,y=(r.top-rect.top)*scale,w=r.width*scale,h=r.height*scale;
  if(x+w<=0||y+h<=0||x>=canvas.width||y>=canvas.height)continue;
  ctx.drawImage(el,x,y,w,h);cover.fillRect(x,y,w,h);tiles++;
 }
 if(!tiles)throw Error('Topo karta još nije učitana. Sačekaj prikaz ili odaberi instaliranu topografsku kartu.');
 let pixels;try{pixels=ctx.getImageData(0,0,canvas.width,canvas.height);}catch(e){throw Error('Ova podloga ne dozvoljava čitanje slike. Odaberi instaliranu topografsku kartu.');}
 const points=simplify(_dozDrawPts.map(p=>{const xy=map.latLngToContainerPoint(p);return [xy.x*scale,xy.y*scale];}),3);
 const centre=map.getCenter(),metresPerPixel=156543.03392*Math.cos(centre.lat*Math.PI/180)/Math.pow(2,map.getZoom())/scale,radius=Number($('doz-boundary-radius').value)/metresPerPixel;
 if(radius>100)throw Error('Područje pretrage je preširoko u ovom prikazu. Izaberi 20 m ili udalji kartu.');
 const loaded=cover.getImageData(0,0,canvas.width,canvas.height).data;
 for(let i=0;i<points.length;i++){const a=points[i],b=points[(i+1)%points.length],steps=Math.ceil(dist(a,b));for(let s=0;s<=steps;s++){const x=Math.round(a[0]+(b[0]-a[0])*s/(steps||1)),y=Math.round(a[1]+(b[1]-a[1])*s/(steps||1));if(x<0||y<0||x>=canvas.width||y>=canvas.height||!loaded[(y*canvas.width+x)*4+3])throw Error('Dio približne granice je izvan učitane karte. Sačekaj učitavanje svih pločica.');}}
 // Georeferencija je zamrznuta prije OCR/worker čekanja; kasniji pomak karte ne mijenja koordinate.
 const zoom=map.getZoom(),origin=map.getPixelOrigin().subtract(map._getMapPanePos()),toLL=p=>map.unproject(L.point(p[0]/scale,p[1]/scale).add(origin),zoom);
 return {canvas,input:{width:canvas.width,height:canvas.height,data:pixels.data.buffer,points,radius,color:$('doz-boundary-color').value},toLL};
}
function inWorker(input){return new Promise((resolve,reject)=>{worker=new Worker('static/js/doznaka-boundary.js');const w=worker,timer=setTimeout(()=>{w.terminate();if(worker===w){worker=null;workerReject=null;}reject(Error('Prepoznavanje traje predugo. Pokušaj manji poligon.'));},15000);const done=()=>{clearTimeout(timer);w.terminate();if(worker===w){worker=null;workerReject=null;}};workerReject=e=>{done();reject(e);};w.onmessage=e=>{done();resolve(e.data);};w.onerror=()=>{done();reject(Error('Prepoznavanje nije dostupno. Ručna granica je sačuvana.'));};w.postMessage(input,[input.data]);});}
async function start(){
 if(busy)return;if(!online()){message('Prepoznavanje radi samo uz internet. Ručno crtanje radi i bez signala.');refresh();return;}if(_dozDrawType!=='__boundary__'||_dozDrawPts.length<3)return;
 invalidate();source=base();if(!source){message('Uključi Topo ili instaliranu topografsku kartu prije prepoznavanja.');return;}
 if(_dozDrawEnabled)dozToggleDrawMode();busy=true;stamp=scope();const ticket=generation;refresh();message('Učitavanje topo podloge…');
 try{
  const shot=await capture(ticket);assertSource(ticket);message('Provjera natpisa i debelih isprekidanih linija…');
  // OCR uklanja tekst iz kandidata; granice se prepoznaju iz geometrije piksela.
  shot.input.words=await root.ReferenceVlake?.readWords(shot.canvas)||[];assertSource(ticket);
  const result=await inWorker(shot.input);assertSource(ticket);if(!result.ok)throw Error(result.reason);
  proposal=result.points.map(p=>{const ll=shot.toLL(p);return {lat:ll.lat,lng:ll.lng};});
  preview=L.polygon(proposal,{color:'#16a34a',weight:3,fillOpacity:.06,interactive:false}).addTo(map);
  message('Zelena: prijedlog ('+result.dashes+' crtica). Plava: tvoja granica. Provjeri cijeli odjel.');
 }catch(e){if(ticket===generation){proposal=null;message(e.message+' Ručna granica nije izmijenjena.');}}
 finally{if(ticket===generation){busy=false;refresh();}}
}
function accept(){if(!proposal)return;try{assertSource(generation);}catch(e){invalidate();message(e.message);return;}const points=proposal.map(p=>({...p}));invalidate();_dozDrawPts=points;_dozDragLastPt=null;_dozRedrawPreview();$('doz-draw-count').textContent=points.length+' tačaka';message('Prijedlog prihvaćen. Možeš doraditi tačke; Završi vraća granicu u obrazac odjela.');refresh();}
root.DoznakaBoundary={...api,start,accept,invalidate,refresh,isBusy:()=>busy};
function init(){if(!$('doz-boundary-tools'))return;refresh();window.addEventListener('online',refresh);window.addEventListener('offline',()=>{invalidate();message('Prepoznavanje traži internet. Ručno crtanje ostaje dostupno.');});map.on('layerremove',e=>{if(source===e.layer)invalidate();});}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})(typeof window!=='undefined'?window:globalThis);
