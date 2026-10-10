/* DEM izvještaj: obrada izvan UI niti, sa rupama i više odvojenih odsjeka. */
(function(root){
 'use strict';
 const SLOPES=['0–9%','10–19%','20–29%','30–39%','40–49%','50% i više'];
 const COLORS=['#36856b','#789a39','#c2a036','#cf7532','#b94c4f','#78456e'];
 const ASPECTS=['Sjever','Istok','Jug','Zapad'],ACOLORS=['#3588bd','#39926c','#d88438','#875caa'];
 const slopeIndex=p=>Number.isFinite(p)&&p>=0?Math.min(5,Math.floor(p/10)):-1;
 const aspectIndex=(bearing,percent)=>Number.isFinite(bearing)&&Number.isFinite(percent)&&percent>.01?Math.floor(((bearing+45)%360)/90):-1;
 function calculate(input,t){
  const {geometry,z,x0,y0,width,height}=input;
  if(!Number.isInteger(z)||z<4||z>14||!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||width*height>160000)throw Error('Preveliko područje za izvještaj');
  const feature=t.feature(geometry),tiles=new Map(input.tiles.map(r=>[r.x+':'+r.y,r.elev]));
  const sample=(x,y)=>{x=Math.floor(x);y=Math.floor(y);const tx=Math.floor(x/256),ty=Math.floor(y/256);return tiles.get(tx+':'+ty)?.[(y-ty*256)*256+x-tx*256]??NaN;};
  const lng=x=>x/(256*2**z)*360-180,lat=y=>Math.atan(Math.sinh(Math.PI*(1-2*y/(256*2**z))))*180/Math.PI;
  const inside=(x,y)=>t.booleanPointInPolygon(t.point([lng(x),lat(y)]),feature);
  const classes=new Int8Array(width*height).fill(-1),aspects=new Int8Array(width*height).fill(-1),mask=new Float32Array(width*height),bands=new Float64Array(6),directions=new Float64Array(4);
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
    const si=slopeIndex(percent),ai=aspectIndex(bearing,percent);classes[idx]=si;aspects[idx]=ai;bands[si]+=w;knownSlope+=w;slopeSum+=w*percent;slopeMax=Math.max(slopeMax,percent);if(ai>=0)directions[ai]+=w;else flat+=w;
   }
  }
  if(!total)throw Error('Poligon je premalen za ovaj DEM uzorak');
  if(!valid)throw Error('DEM nije dostupan unutar izabrane granice');
  const areaHa=t.area(feature)/10000,share=v=>v/total*100,rows=(names,colors,weights)=>names.map((name,i)=>({name,color:colors[i],percent:share(weights[i]),ha:areaHa*weights[i]/total}));
  const edges=[];
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){const i=y*width+x;if(classes[i]<0)continue;
   if(x+1<width&&classes[i+1]>=0&&classes[i]!==classes[i+1])edges.push([[lat(y0+y),lng(x0+x+1)],[lat(y0+y+1),lng(x0+x+1)]]);
   if(y+1<height&&classes[i+width]>=0&&classes[i]!==classes[i+width])edges.push([[lat(y0+y+1),lng(x0+x)],[lat(y0+y+1),lng(x0+x+1)]]);
  }
  return {z,x0,y0,width,height,classes,aspects,mask,edges,stats:{areaHa,min,max,mean:sum/valid,slopeMean:knownSlope?slopeSum/knownSlope:null,slopeMax:knownSlope?slopeMax:null,coverage:share(valid),slopeCoverage:share(knownSlope),flat:share(flat),resolution:Math.max(30,Math.cos(lat(y0+height/2)*Math.PI/180)*156543.03392/2**z),slope:rows(SLOPES,COLORS,bands),aspect:rows(ASPECTS,ACOLORS,directions)}};
 }
 if(typeof module!=='undefined'&&module.exports){module.exports={calculate,slopeIndex,aspectIndex,SLOPES,COLORS,ASPECTS,ACOLORS};return;}
 importScripts('../libs/turf.min.js');
 root.onmessage=e=>{try{const result=calculate(e.data,turf);root.postMessage({ok:true,result},[result.classes.buffer,result.aspects.buffer,result.mask.buffer]);}catch(err){root.postMessage({ok:false,error:err.message});}};
})(typeof self!=='undefined'?self:globalThis);
