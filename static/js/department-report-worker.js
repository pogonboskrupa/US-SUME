/* DEM izvještaj: obrada izvan UI niti, sa rupama i više odvojenih odsjeka. */
(function(root){
 'use strict';
 const SLOPES=['0–9%','10–19%','20–29%','30–39%','40–49%','50% i više'];
 const COLORS=['#36856b','#789a39','#c2a036','#cf7532','#b94c4f','#78456e'];
 const ASPECTS=['Sjever','Istok','Jug','Zapad'],ACOLORS=['#3588bd','#39926c','#d88438','#875caa'];
 const slopeIndex=p=>Number.isFinite(p)&&p>=0?Math.min(5,Math.floor(p/10)):-1;
 const aspectIndex=(bearing,percent)=>Number.isFinite(bearing)&&Number.isFinite(percent)&&percent>.01?Math.floor(((bearing+45)%360)/90):-1;
 function contourSegments(tl,tr,br,bl,level,x,y){
  const hit=(a,b)=>(a>=level)!==(b>=level),at=(a,b)=>Math.max(0,Math.min(1,(level-a)/(b-a))),e={};
  if(hit(tl,tr))e.T=[x+at(tl,tr),y];
  if(hit(tr,br))e.R=[x+1,y+at(tr,br)];
  if(hit(bl,br))e.B=[x+at(bl,br),y+1];
  if(hit(tl,bl))e.L=[x,y+at(tl,bl)];
  const keys=Object.keys(e);if(keys.length===2)return [[e[keys[0]],e[keys[1]]]];
  if(keys.length===4){const high=(tl+tr+br+bl)/4>=level;return high===(tl>=level)?[[e.T,e.L],[e.R,e.B]]:[[e.T,e.R],[e.L,e.B]];}
  return [];
 }
 function joinSegments(segments){
  const key=p=>p[0].toFixed(8)+','+p[1].toFixed(8),adj=new Map(),used=new Uint8Array(segments.length);
  segments.forEach((s,id)=>{const a=key(s[0]),b=key(s[1]);if(!adj.has(a))adj.set(a,[]);if(!adj.has(b))adj.set(b,[]);adj.get(a).push({id,to:b,p:s[1]});adj.get(b).push({id,to:a,p:s[0]});});
  const paths=[],starts=[...adj.keys()].sort((a,b)=>(adj.get(a).length===1?0:1)-(adj.get(b).length===1?0:1));
  for(const start of starts){while(adj.get(start).some(e=>!used[e.id])){const first=adj.get(start).find(e=>!used[e.id]),path=[segments[first.id][key(segments[first.id][0])===start?0:1]];let at=start,edge=first;
    while(edge){used[edge.id]=1;path.push(edge.p);at=edge.to;if(at===start)break;edge=adj.get(at)?.find(e=>!used[e.id]);}
    if(path.length>1)paths.push(path);
   }
  }
  return paths;
 }
 function profiles(input,t,sample,lng,lat,mask,areaHa){
  const {geometry,z,x0,y0,width,height}=input,feature=t.feature(geometry),world=256*2**z;
  const valid=h=>Number.isFinite(h)&&h>-12000&&h<10000;
  const metres=y=>Math.cos(lat(y)*Math.PI/180)*156543.03392/2**z;
  const point=(x,y)=>[lng(x),lat(y)],inside=p=>t.booleanPointInPolygon(t.point(point(...p)),feature);
  const heightAt=p=>{const x=p[0]-.5,y=p[1]-.5,a=Math.floor(x),b=Math.floor(y),fx=x-a,fy=y-b;
   const hs=[sample(a,b),sample(a+1,b),sample(a,b+1),sample(a+1,b+1)];if(!hs.every(valid))return NaN;
   return hs[0]*(1-fx)*(1-fy)+hs[1]*fx*(1-fy)+hs[2]*(1-fx)*fy+hs[3]*fx*fy;
  };
  const gradient=p=>{const m=metres(p[1]),r=Math.max(1,Math.round(30/m)),hs=[heightAt([p[0]-r,p[1]]),heightAt([p[0]+r,p[1]]),heightAt([p[0],p[1]-r]),heightAt([p[0],p[1]+r])];
   return hs.every(valid)?[(hs[1]-hs[0])/(2*r*m),(hs[3]-hs[2])/(2*r*m)]:null;
  };
  // Prva presječena granica zaustavlja profil: segment ne preskače ni usku rupu.
  const pixel=p=>[(p[0]+180)/360*world,(1-Math.asinh(Math.tan(p[1]*Math.PI/180))/Math.PI)/2*world];
  const boundaries=[],polys=geometry.type==='Polygon'?[geometry.coordinates]:geometry.coordinates;
  for(const poly of polys)for(const ring of poly)for(let i=1;i<ring.length;i++)boundaries.push([pixel(ring[i-1]),pixel(ring[i])]);
  const cross=(a,b)=>a[0]*b[1]-a[1]*b[0];
  function clipped(a,b){const v=[b[0]-a[0],b[1]-a[1]];let fraction=1;
   for(const [c,d]of boundaries){const w=[d[0]-c[0],d[1]-c[1]],den=cross(v,w);if(Math.abs(den)<1e-12)continue;const q=[c[0]-a[0],c[1]-a[1]],u=cross(q,w)/den,s=cross(q,v)/den;if(u>1e-8&&u<=fraction&&s>=-1e-9&&s<=1+1e-9)fraction=Math.max(0,u-1e-6);}
   const p=[a[0]+v[0]*fraction,a[1]+v[1]*fraction];return inside(p)?{p,end:fraction<1}:null;
  }
  const weights=Array.from({length:height},(_,y)=>metres(y0+y+.5)**2),weight=i=>mask[i]*weights[Math.floor(i/width)];
  const xy=i=>[x0+i%width+.5,y0+Math.floor(i/width)+.5],seen=new Uint8Array(mask.length),groups=[];let total=0;
  // Odvojeni odsjeci dobijaju svoje profile; praznine i nedostajući DEM nisu ravne površine.
  for(let seed=0;seed<mask.length;seed++){if(!mask[seed]||seen[seed])continue;const ids=[seed];seen[seed]=1;let sum=0;
   for(let k=0;k<ids.length;k++){const i=ids[k],x=i%width,y=Math.floor(i/width);sum+=weight(i);
    for(const j of [x>0?i-1:-1,x+1<width?i+1:-1,y>0?i-width:-1,y+1<height?i+width:-1])if(j>=0&&mask[j]&&!seen[j]){seen[j]=1;ids.push(j);}
   }groups.push({ids,weight:sum});total+=sum;
  }
  const target=groups.reduce((n,g)=>n+Math.max(1,Math.ceil(areaHa*g.weight/total/3-1e-9)),0),info={areaPerLineHa:3,target,available:0,unavailable:0,short:0};
  if(target>1200){info.unavailable=target;info.reason='Za linije na svaka 3 ha odaberi manje područje (najviše 1.200 linija).';return {slopeProfiles:[],profileInfo:info};}
  const leaves=[];
  function split(ids,count){if(count<=1||ids.length<2){leaves.push(ids);return;}
   let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity,sum=0;
   for(const i of ids){const [x,y]=xy(i);minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);sum+=weight(i);}
   const axis=maxX-minX>=maxY-minY?0:1,ordered=ids.slice().sort((a,b)=>xy(a)[axis]-xy(b)[axis]),left=Math.floor(count/2),goal=sum*left/count;let acc=0,cut=1;
   for(;cut<ordered.length;cut++){acc+=weight(ordered[cut-1]);if(acc>=goal)break;}
   cut=Math.min(ordered.length-1,cut);split(ordered.slice(0,cut),left);split(ordered.slice(cut),count-left);
  }
  for(const g of groups)split(g.ids,Math.max(1,Math.ceil(areaHa*g.weight/total/3-1e-9)));
  const lines=[];
  for(const ids of leaves){let sum=0,cx=0,cy=0;for(const i of ids){const [x,y]=xy(i),w=weight(i);sum+=w;cx+=x*w;cy+=y*w;}cx/=sum;cy/=sum;
   let anchor=null,best=Infinity,grad=null;for(const i of ids){const p=xy(i),d=(p[0]-cx)**2+(p[1]-cy)**2;if(d>=best||!inside(p)||!valid(heightAt(p)))continue;const g=gradient(p);if(!g)continue;anchor=p;grad=g;best=d;}
   if(!anchor){info.unavailable++;continue;}const flat=Math.hypot(...grad)<.0001;
   function trace(sign){const pts=[anchor];let length=0;
    for(let step=0;step<20&&length<60;step++){const a=pts.at(-1),g=flat?[1,0]:gradient(a);if(!g)break;const norm=Math.hypot(...g);if(norm<.0001)break;
     const distance=Math.min(15,60-length),scale=distance/metres(a[1]),next=clipped(a,[a[0]-sign*g[0]/norm*scale,a[1]-sign*g[1]/norm*scale]);if(!next)break;
     const h0=heightAt(a),h1=heightAt(next.p);if(!valid(h1)||(!flat&&sign*(h0-h1)<-.02))break;
     const d=t.distance(t.point(point(...a)),t.point(point(...next.p)),{units:'kilometers'})*1000;if(d<.5)break;pts.push(next.p);length+=d;if(next.end)break;
    }return pts;
   }
   let path=[...trace(-1).reverse(),...trace(1).slice(1)];if(path.length<2){info.unavailable++;continue;}
   if(heightAt(path[0])<heightAt(path.at(-1)))path.reverse();const coords=path.map(p=>point(...p)),distance=t.length(t.lineString(coords),{units:'kilometers'})*1000;
   if(distance<1){info.unavailable++;continue;}const top=heightAt(path[0]),bottom=heightAt(path.at(-1)),drop=Math.max(0,top-bottom),percent=drop/distance*100;
   lines.push({id:lines.length+1,points:coords.map(p=>[p[1],p[0]]),topElevation:top,bottomElevation:bottom,distance,drop,percent,areaHa:areaHa*sum/total,flat});if(distance<30)info.short++;
  }
  info.available=lines.length;info.unavailable=target-lines.length;return {slopeProfiles:lines,profileInfo:info};
 }
 function calculate(input,t){
  const {geometry,z,x0,y0,width,height}=input;
  if(!Number.isInteger(z)||z<4||z>14||!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||width*height>160000)throw Error('Preveliko područje za izvještaj');
  const feature=t.feature(geometry),tiles=new Map(input.tiles.map(r=>[r.x+':'+r.y,r.elev]));
  const sample=(x,y)=>{x=Math.floor(x);y=Math.floor(y);const tx=Math.floor(x/256),ty=Math.floor(y/256);return tiles.get(tx+':'+ty)?.[(y-ty*256)*256+x-tx*256]??NaN;};
  const lng=x=>x/(256*2**z)*360-180,lat=y=>Math.atan(Math.sinh(Math.PI*(1-2*y/(256*2**z))))*180/Math.PI;
  const inside=(x,y)=>t.booleanPointInPolygon(t.point([lng(x),lat(y)]),feature);
  const classes=new Int8Array(width*height).fill(-1),aspects=new Int8Array(width*height).fill(-1),mask=new Float32Array(width*height),slopes=new Float32Array(width*height).fill(NaN),bands=new Float64Array(6),directions=new Float64Array(4);
  let total=0,valid=0,knownSlope=0,flat=0,min=Infinity,max=-Infinity,sum=0,slopeSum=0,slopeMax=0;
  for(let y=0;y<height;y++){
   const latC=lat(y0+y+.5),metres=Math.cos(latC*Math.PI/180)*156543.03392/2**z,r=Math.max(1,Math.round(30/metres)),weight=metres*metres;
   for(let x=0;x<width;x++){
    const gx=x0+x,gy=y0+y,idx=y*width+x;
    // Četiri poduzorka za udio rubne ćelije; transparentne rupe se ne broje.
    let hits=0;for(const dx of [.25,.75])for(const dy of [.25,.75])if(inside(gx+dx,gy+dy))hits++;
    if(!hits)continue;const w=weight*hits/4;mask[idx]=hits/4;total+=w;
    const h=sample(gx,gy);if(!Number.isFinite(h)||h<=-12000||h>=10000)continue;
    valid+=w;sum+=w*h;min=Math.min(min,h);max=Math.max(max,h);
    const a=sample(gx-r,gy),b=sample(gx+r,gy),c=sample(gx,gy-r),d=sample(gx,gy+r);
    if(![a,b,c,d].every(v=>Number.isFinite(v)&&v>-12000&&v<10000))continue;
    const dx=(b-a)/(2*r*metres),dy=(d-c)/(2*r*metres),percent=Math.hypot(dx,dy)*100,bearing=(Math.atan2(-dx,dy)*180/Math.PI+360)%360;
    const si=slopeIndex(percent),ai=aspectIndex(bearing,percent);slopes[idx]=percent;classes[idx]=si;aspects[idx]=ai;bands[si]+=w;knownSlope+=w;slopeSum+=w*percent;slopeMax=Math.max(slopeMax,percent);if(ai>=0)directions[ai]+=w;else flat+=w;
   }
  }
  if(!total)throw Error('Poligon je premalen za ovaj DEM uzorak');
  if(!valid)throw Error('DEM nije dostupan unutar izabrane granice');
  const areaHa=t.area(feature)/10000,share=v=>v/total*100,rows=(names,colors,weights)=>names.map((name,i)=>({name,color:colors[i],percent:share(weights[i]),ha:areaHa*weights[i]/total}));
  // Granice razreda se interpoliraju kroz stvarne vrijednosti nagiba (marching
  // squares). Raniji horizontalni/vertikalni rub svake DEM ćelije izgledao je
  // kao niz pravougaonika i nije pratio prijelaz obojene površine.
  const edgeBands=[10,20,30,40,50].map((level,i)=>({level,color:COLORS[i+1],segments:[]}));
  for(let y=0;y<height-1;y++)for(let x=0;x<width-1;x++){
   const i=y*width+x,tl=slopes[i],tr=slopes[i+1],bl=slopes[i+width],br=slopes[i+width+1];
   if(![tl,tr,br,bl].every(Number.isFinite))continue;
   for(const band of edgeBands)band.segments.push(...contourSegments(tl,tr,br,bl,band.level,x0+x+.5,y0+y+.5));
  }
  for(const band of edgeBands){band.paths=joinSegments(band.segments).map(path=>path.map(p=>[lat(p[1]),lng(p[0])]));delete band.segments;}
  return {z,x0,y0,width,height,classes,aspects,mask,edgeBands,...profiles(input,t,sample,lng,lat,mask,areaHa),stats:{areaHa,min,max,mean:sum/valid,slopeMean:knownSlope?slopeSum/knownSlope:null,slopeMax:knownSlope?slopeMax:null,coverage:share(valid),slopeCoverage:share(knownSlope),flat:share(flat),resolution:Math.max(30,Math.cos(lat(y0+height/2)*Math.PI/180)*156543.03392/2**z),slope:rows(SLOPES,COLORS,bands),aspect:rows(ASPECTS,ACOLORS,directions)}};
 }
 if(typeof module!=='undefined'&&module.exports){module.exports={calculate,slopeIndex,aspectIndex,contourSegments,joinSegments,SLOPES,COLORS,ASPECTS,ACOLORS};return;}
 importScripts('../libs/turf.min.js');
 root.onmessage=e=>{try{const result=calculate(e.data,turf);root.postMessage({ok:true,result},[result.classes.buffer,result.aspects.buffer,result.mask.buffer]);}catch(err){root.postMessage({ok:false,error:err.message});}};
})(typeof self!=='undefined'?self:globalThis);
