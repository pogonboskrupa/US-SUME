/* Zajedničke granice paralelnih GPS pojaseva. Ulazni GPS tragovi ostaju isti. */
(function(root){
  'use strict';
  function build(tracks,boundary,radius,turf){
    if((tracks?.length||0)<2||!boundary||!Number.isFinite(radius)||radius<=0)return null;
    const R=6371000,toRad=Math.PI/180,box=turf.bbox(boundary),lon=(box[0]+box[2])/2,lat=(box[1]+box[3])/2,cos=Math.cos(lat*toRad);
    if(cos<.1||box[2]-box[0]>2||box[3]-box[1]>2)return null;
    const local=p=>[(p[0]-lon)*toRad*R*cos,(p[1]-lat)*toRad*R];
    let longest=null,len=0;
    for(const t of tracks){const pts=t.line?.geometry?.coordinates;if(!pts||pts.length<2)return null;const a=local(pts[0]),b=local(pts[pts.length-1]),d=Math.hypot(b[0]-a[0],b[1]-a[1]);if(d>len){len=d;longest=[a,b];}}
    if(len<10)return null;
    let ex=(longest[1][0]-longest[0][0])/len,ey=(longest[1][1]-longest[0][1])/len;
    if(ex<0||(Math.abs(ex)<.001&&ey<0)){ex=-ex;ey=-ey;}
    const from=(u,v)=>{const x=u*ex-v*ey,y=u*ey+v*ex;return [lon+x/(R*cos)/toRad,lat+y/R/toRad];};
    const lines=[];
    for(const t of tracks){let pts=t.line.geometry.coordinates.map(p=>{const [x,y]=local(p);return [x*ex+y*ey,-x*ey+y*ex];});
      if(pts[0][0]>pts[pts.length-1][0])pts.reverse();
      if(pts[pts.length-1][0]-pts[0][0]<10)return null;
      for(let i=1;i<pts.length;i++)if(pts[i][0]<pts[i-1][0]-2)return null;
      pts.sort((a,b)=>a[0]-b[0]);
      const clean=[];for(const p of pts){if(!p.every(Number.isFinite))return null;if(!clean.length||p[0]-clean[clean.length-1][0]>.05)clean.push(p);else clean[clean.length-1][1]=(clean[clean.length-1][1]+p[1])/2;}
      lines.push({track:t,pts:clean,min:clean[0][0]-radius,max:clean[clean.length-1][0]+radius,lower:[],upper:[],shared:false});
    }
    const lo=Math.min(...lines.map(l=>l.min)),hi=Math.max(...lines.map(l=>l.max));
    if((hi-lo)/10>4000)return null;
    const stations=new Set(lines.flatMap(l=>[l.min,l.max]));for(let u=lo;u<hi;u+=10)stations.add(u);stations.add(hi);
    const us=[...stations].sort((a,b)=>a-b);
    const sample=(line,u)=>{const p=line.pts;if(u<=p[0][0])return p[0][1];if(u>=p[p.length-1][0])return p[p.length-1][1];
      let a=0,b=p.length-1;while(b-a>1){const m=(a+b)>>1;p[m][0]<=u?a=m:b=m;}const f=(u-p[a][0])/(p[b][0]-p[a][0]);return p[a][1]+f*(p[b][1]-p[a][1]);};
    for(let i=0;i<us.length-1;i++){
      const u0=us[i],u1=us[i+1];if(u1-u0<1e-7)continue;
      const active=lines.filter(l=>l.min<=u0+1e-7&&l.max>=u1-1e-7).map(l=>({line:l,a:sample(l,u0),b:sample(l,u1)})).sort((a,b)=>(a.a+a.b)-(b.a+b.b));
      for(let k=1;k<active.length;k++)if(active[k].a-active[k-1].a<.5||active[k].b-active[k-1].b<.5)return null; // presjek/dupli trag: konzervativni GPS bafer
      for(let k=0;k<active.length;k++){
        const cur=active[k],below=active[k-1],above=active[k+1];
        const low0=below?cur.a-Math.min(radius,(cur.a-below.a)/2):cur.a-radius;
        const low1=below?cur.b-Math.min(radius,(cur.b-below.b)/2):cur.b-radius;
        const high0=above?cur.a+Math.min(radius,(above.a-cur.a)/2):cur.a+radius;
        const high1=above?cur.b+Math.min(radius,(above.b-cur.b)/2):cur.b+radius;
        if((below&&cur.a-below.a<=2*radius&&cur.b-below.b<=2*radius)||(above&&above.a-cur.a<=2*radius&&above.b-cur.b<=2*radius))cur.line.shared=true;
        cur.line.lower.push([u0,low0],[u1,low1]);cur.line.upper.push([u0,high0],[u1,high1]);
      }
    }
    if(!lines.some(l=>l.shared))return null;
    const bands=[];
    try{for(const l of lines){
      if(l.lower.length<2)continue;
      const ring=[...l.lower,...l.upper.slice().reverse()].map(p=>from(p[0],p[1]));ring.push(ring[0]);
      const source=l.shared?turf.polygon([ring]):turf.buffer(l.track.line,radius,{units:'meters',steps:4});
      const polygon=turf.intersect(source,boundary);if(!polygon)continue;
      bands.push({uid:l.track.uid,polygon,areaHa:turf.area(polygon)/10000,startedAt:l.track.startedAt,endedAt:l.track.endedAt,joined:l.shared});
    }}catch(e){return null;}
    return bands.length?bands:null;
  }
  root.DozBands={build};if(typeof module!=='undefined'&&module.exports)module.exports=root.DozBands;
})(typeof window!=='undefined'?window:globalThis);
