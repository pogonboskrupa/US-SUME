/* Obrada DEM-a. Interpolacija ne povećava rezoluciju izvornog modela. */
(function(root){
  'use strict';
  const valid=v=>Number.isFinite(v)&&v>-12000&&v<10000;
  function blend(values,weights){
    let sum=0,total=0;
    for(let i=0;i<values.length;i++)if(weights[i]>1e-12){
      if(!valid(values[i]))return NaN;
      sum+=values[i]*weights[i];total+=weights[i];
    }
    return total?sum/total:NaN;
  }
  function bilinear(data,width,height,x,y){
    if(!width||!height||!Number.isFinite(x)||!Number.isFinite(y))return NaN;
    x=Math.max(0,Math.min(width-1,x));y=Math.max(0,Math.min(height-1,y));
    const x0=Math.floor(x),y0=Math.floor(y),x1=Math.min(width-1,x0+1),y1=Math.min(height-1,y0+1),dx=x-x0,dy=y-y0;
    return blend([data[y0*width+x0],data[y0*width+x1],data[y1*width+x0],data[y1*width+x1]],[(1-dx)*(1-dy),dx*(1-dy),(1-dx)*dy,dx*dy]);
  }
  function tileSample(tiles,fx,fy){
    const x=fx*256-.5,y=fy*256-.5,x0=Math.floor(x),y0=Math.floor(y),dx=x-x0,dy=y-y0;
    const at=(px,py)=>{const tx=Math.floor(px/256),ty=Math.floor(py/256),tile=tiles.get(tx+':'+ty);return tile?tile[(py-ty*256)*256+px-tx*256]:NaN;};
    return blend([at(x0,y0),at(x0+1,y0),at(x0,y0+1),at(x0+1,y0+1)],[(1-dx)*(1-dy),dx*(1-dy),(1-dx)*dy,dx*dy]);
  }
  function gradient(elev,px,py,metres){
    if(!valid(elev[py*256+px])||!Number.isFinite(metres)||metres<=0)return {percent:NaN,bearing:NaN};
    // Razmak do susjeda najmanje približno 30 m; z14 je interpoliran DEM.
    const r=Math.max(1,Math.min(32,Math.round(30/metres)));
    const x0=Math.max(0,px-r),x1=Math.min(255,px+r),y0=Math.max(0,py-r),y1=Math.min(255,py+r);
    const a=elev[py*256+x0],b=elev[py*256+x1],c=elev[y0*256+px],d=elev[y1*256+px];
    if(![a,b,c,d].every(valid))return {percent:NaN,bearing:NaN};
    const dx=(b-a)/((x1-x0)*metres),dy=(d-c)/((y1-y0)*metres);
    return {percent:Math.hypot(dx,dy)*100,bearing:(Math.atan2(-dx,dy)*180/Math.PI+360)%360};
  }
  root.DemQuality={valid,blend,bilinear,tileSample,gradient};
  if(typeof module!=='undefined'&&module.exports)module.exports=root.DemQuality;
})(typeof window!=='undefined'?window:globalThis);
