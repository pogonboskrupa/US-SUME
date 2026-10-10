/* Plan doznake: DEM izohipse, bez izmjene stvarnih GPS tragova ili doznake. */
(function(root){
'use strict';
const COLORS=['#2563eb','#b45309','#15803d','#9333ea','#be123c','#0e7490','#a16207','#4f46e5','#047857','#c2410c','#7e22ce','#475569'];
function fitTrace(coords,polygon,t){
 const line=coords.map(p=>p.slice()),cos=Math.cos(line[0][1]*Math.PI/180);
 for(let i=0;i<line.length;i++){
  const p=line[i];if(t.booleanPointInPolygon(t.point(p),polygon))continue;
  // Turf lineSplit zaokružuje presjek na 7 decimala. Vrati milimetarske rubove
  // na izvornu granicu; ne pomjeraj izohipsu izvan odjela ili preko rupe.
  let best=null,distance=Infinity;
  for(const ring of polygon.geometry.coordinates)for(let j=1;j<ring.length;j++){const a=ring[j-1],b=ring[j],dx=(b[0]-a[0])*cos,dy=b[1]-a[1],v=Math.max(0,Math.min(1,((p[0]-a[0])*cos*dx+(p[1]-a[1])*dy)/(dx*dx+dy*dy||1))),q=[a[0]+(b[0]-a[0])*v,a[1]+dy*v],d=Math.hypot((p[0]-q[0])*cos,p[1]-q[1]);if(d<distance){best=q;distance=d;}}
  if(!best||distance*111320>.05)return null;
  const inside=line[i===0?1:i-1];line[i]=[best[0]+(inside[0]-best[0])*1e-8,best[1]+(inside[1]-best[1])*1e-8];
  if(!t.booleanPointInPolygon(t.point(line[i]),polygon))return null;
 }
 return line;
}
function options(value={}){
 const width=Number(value.width??15),crew=Number(value.crew??2),pace=Number(value.pace??3);
 if(!Number.isFinite(width)||width<5||width>100)throw Error('Širina pojasa mora biti od 5 do 100 m.');
 if(!Number.isInteger(crew)||crew<1||crew>12)throw Error('Izaberi od 1 do 12 projektanata.');
 if(!Number.isInteger(pace)||pace<1||pace>30)throw Error('Dnevni broj prolaza mora biti od 1 do 30.');
 return {width,crew,pace,leapfrog:value.leapfrog!==false};
}
function schedule(bands,value){
 const o=options(value),passes=[],people=Array.from({length:o.crew},(_,i)=>({id:i,name:'Projektant '+(i+1),color:COLORS[i],bands:0,guides:0,walks:0,areaHa:0,lengthM:0}));
 let queue=people.map(p=>p.id),anchor=null,lastComponent=null,cursor=0;
 while(cursor<bands.length){
  const first=bands[cursor];if(first.component!==lastComponent){queue=people.map(p=>p.id);anchor=null;lastComponent=first.component;}
  const pass={number:passes.length+1,day:Math.floor(passes.length/o.pace)+1,direction:passes.length%2?'nazad':'naprijed',slots:[]};
  const guide=o.leapfrog&&o.crew>1&&anchor!==null;
  if(guide){const person=people[queue[0]];pass.slots.push({person:person.id,band:anchor,guide:true});person.guides++;person.walks++;person.lengthM+=bands[anchor].lengthM;}
  for(let slot=guide?1:0;slot<o.crew&&cursor<bands.length&&bands[cursor].component===lastComponent;slot++){
   const b=bands[cursor],person=people[queue[slot]];b.person=person.id;b.day=pass.day;b.pass=pass.number;b.color=person.color;
   pass.slots.push({person:person.id,band:cursor,guide:false});person.bands++;person.walks++;person.areaHa+=b.areaHa;person.lengthM+=b.lengthM;anchor=cursor++;
  }
  passes.push(pass);
  // Najviši prati svoj prethodni pojas; ostali iznad njega kružno mijenjaju red.
  const top=pass.slots.at(-1)?.person;if(top!==undefined)queue=[top,...queue.filter(id=>id!==top)];
 }
 const days=Array.from({length:passes.at(-1)?.day||0},(_,i)=>{const rows=passes.filter(p=>p.day===i+1),ids=rows.flatMap(p=>p.slots.filter(s=>!s.guide).map(s=>s.band));return {day:i+1,passes:rows.length,bands:ids.length,guides:rows.reduce((n,p)=>n+p.slots.filter(s=>s.guide).length,0),areaHa:ids.reduce((n,id)=>n+bands[id].areaHa,0),bandIds:ids};});
 return {options:o,bands,passes,people,days,daysNeeded:days.length};
}
function calculate(input,t){
 const o=options(input.options),g=input.geometry?.type==='Feature'?input.geometry.geometry:input.geometry;
 if(!g||!['Polygon','MultiPolygon'].includes(g.type))throw Error('Odjel nema poligon granice.');
 const feature=t.feature(g),bbox=t.bbox(feature),lat0=(bbox[1]+bbox[3])/2,R=6371000,rad=Math.PI/180,cos=Math.cos(lat0*rad);
 const spanX=(bbox[2]-bbox[0])*rad*R*cos,spanY=(bbox[3]-bbox[1])*rad*R;
 if(cos<.1||spanX<=0||spanY<=0||Math.max(spanX,spanY)>25000)throw Error('Izaberi manji prostor za projekciju.');
 const step=Math.max(5,o.width/2,Math.sqrt(spanX*spanY/24000)),nx=Math.ceil(spanX/step)+2,ny=Math.ceil(spanY/step)+2;
 if(nx*ny>30000)throw Error('Odjel je previše izdužen za ovu širinu.');
 const dx=spanX/(nx-2),dy=spanY/(ny-2),ll=(x,y)=>[bbox[0]+(x-.5)*dx/(R*cos*rad),bbox[1]+(y-.5)*dy/(R*rad)];
 const tiles=new Map((input.tiles||[]).map(a=>[a.x+':'+a.y,a.elev])),world=256*2**input.z;
 const pixel=(x,y)=>{const tx=Math.floor(x/256),ty=Math.floor(y/256);return tiles.get(tx+':'+ty)?.[(y-ty*256)*256+x-tx*256]??NaN;};
 const elevation=p=>{const x=(p[0]+180)/360*world,y=(1-Math.asinh(Math.tan(p[1]*rad))/Math.PI)/2*world,ix=Math.floor(x),iy=Math.floor(y),fx=x-ix,fy=y-iy,a=pixel(ix,iy),b=pixel(ix+1,iy),c=pixel(ix,iy+1),d=pixel(ix+1,iy+1);return [a,b,c,d].every(h=>Number.isFinite(h)&&h>-12000&&h<10000)?a*(1-fx)*(1-fy)+b*fx*(1-fy)+c*(1-fx)*fy+d*fx*fy:NaN;};
 const grid=[],heights=new Float64Array(nx*ny);let min=Infinity,max=-Infinity,known=0,inside=0;
 for(let y=0;y<ny;y++)for(let x=0;x<nx;x++){const p=ll(x,y),h=elevation(p);heights[y*nx+x]=h;const hit=t.booleanPointInPolygon(t.point(p),feature);if(hit){inside++;if(Number.isFinite(h))known++;}if(Number.isFinite(h)){min=Math.min(min,h);max=Math.max(max,h);}grid.push(t.point(p,{height:h}));}
 // Ne interpolirati nedostajući DEM kao ravan teren ili izmišljati izohipse.
 if(!known||known!==inside||grid.some(p=>!Number.isFinite(p.properties.height)))throw Error('DEM nije potpun za ovaj odjel. Preuzmi teren uz internet pa ponovi.');
 const flat=max-min<1,gradientBins=Array.from({length:128},()=>[]);
 if(flat){for(let y=0;y<ny;y++)for(let x=0;x<nx;x++)grid[y*nx+x].properties.height=spanX>=spanY?(y-.5)*dy:(x-.5)*dx;min=-Math.max(dx,dy);max=(spanX>=spanY?spanY:spanX)+Math.max(dx,dy);}
 else for(let y=1;y<ny-1;y++)for(let x=1;x<nx-1;x++){const i=y*nx+x,h=heights[i];if(!t.booleanPointInPolygon(grid[i],feature))continue;const slope=Math.hypot((heights[i+1]-heights[i-1])/(2*dx),(heights[i+nx]-heights[i-nx])/(2*dy));const index=Math.min(127,Math.max(0,Math.floor((h-min)/(max-min)*128)));gradientBins[index].push(slope/Math.sqrt(1+slope*slope));}
 const slopes=gradientBins.flat().sort((a,b)=>a-b),fallback=slopes[Math.floor(slopes.length/2)]||.02;
 const breaks=[min-.001];let h=min;
 while(h<max+.001){let delta=o.width;if(!flat){const index=Math.min(127,Math.max(0,Math.floor((h-min)/(max-min)*128))),near=gradientBins.slice(Math.max(0,index-2),Math.min(128,index+3)).flat().sort((a,b)=>a-b);delta=o.width*Math.max(.01,near[Math.floor(near.length/2)]||fallback);}
  h+=Math.max(.1,delta);breaks.push(Math.min(h,max+.001));if(breaks.length>1201)throw Error('Previše pojaseva. Povećaj širinu ili izaberi manje odsjeka.');
 }
 // Turf 6 isolines počinje od drugog break-a; sentinel čuva prvu radnu izohipsu.
 const data=t.featureCollection(grid),iso=t.isobands(data,breaks,{zProperty:'height',breaksProperties:breaks.slice(1).map((_,level)=>({level}))}),mid=breaks.slice(1).map((v,i)=>(v+breaks[i])/2),lines=t.isolines(data,[breaks[0]-1,...mid],{zProperty:'height'}),lineByHeight=new Map(lines.features.map(f=>[f.properties.height,f]));
 const originals=g.type==='Polygon'?[g.coordinates]:g.coordinates,bands=[];
 for(const f of iso.features){if(!f.geometry.coordinates.length)continue;const clipped=t.intersect(f,feature);if(!clipped)continue;const level=f.properties.level;
  for(const part of t.flatten(clipped).features){const areaHa=t.area(part)/10000;if(areaHa<1e-9)continue;const spot=t.pointOnFeature(part),component=originals.findIndex(p=>t.booleanPointInPolygon(spot,t.polygon(p))),center=(breaks[level]+breaks[level+1])/2,contour=lineByHeight.get(center);let traces=[];
   if(contour)for(const coords of contour.geometry.coordinates){if(coords.length<2)continue;const line=t.lineString(coords),pieces=t.lineSplit(line,part).features;for(const piece of pieces.length?pieces:[line]){const length=t.length(piece,{units:'meters'});if(length>.1&&t.booleanPointInPolygon(t.along(piece,length/2000,{units:'kilometers'}),part)){const fitted=fitTrace(piece.geometry.coordinates,part,t);if(fitted)traces.push(fitted);}}}
   const lengthM=traces.reduce((n,c)=>n+t.length(t.lineString(c),{units:'meters'}),0)||areaHa*10000/o.width;
   bands.push({geometry:part.geometry,level,component:Math.max(0,component),elevation:flat?null:center,areaHa,lengthM,lines:traces});
  }
 }
 const areaHa=t.area(feature)/10000,coveredHa=bands.reduce((n,b)=>n+b.areaHa,0);
 if(!bands.length||Math.abs(coveredHa-areaHa)/areaHa>.003)throw Error('Granica nije potpuno obuhvaćena. Provjeri poligon odjela.');
 const componentMin=new Map();for(const b of bands)componentMin.set(b.component,Math.min(componentMin.get(b.component)??Infinity,b.level));
 bands.sort((a,b)=>componentMin.get(a.component)-componentMin.get(b.component)||a.component-b.component||a.level-b.level);
 const result=schedule(bands,o);result.stats={areaHa,coveredHa,min:Math.min(...heights),max:Math.max(...heights),flat,gridStep:Math.max(dx,dy),demResolution:Math.max(30,cos*156543.03392/2**input.z),components:originals.length};return result;
}
if(typeof module!=='undefined'&&module.exports){module.exports={calculate,schedule,options,COLORS};return;}
importScripts('../libs/turf.min.js');root.onmessage=e=>{try{root.postMessage({ok:true,result:calculate(e.data,turf)});}catch(err){root.postMessage({ok:false,error:err.message});}};
})(typeof self!=='undefined'?self:globalThis);
