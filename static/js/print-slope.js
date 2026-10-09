/* Vektorski poligoni postojećeg DEM >30% maskiranja, samo za štampu. */
(function(root){
'use strict';
function maskPath(data,width,height){
 const filled=(x,y)=>x>=0&&y>=0&&x<width&&y<height&&data[(y*width+x)*4+3]>0;
 const edges=new Map(),key=(x,y)=>x+','+y;
 function edge(x,y,nx,ny){const k=key(x,y);if(!edges.has(k))edges.set(k,[]);edges.get(k).push([nx,ny]);}
 for(let y=0;y<height;y++)for(let x=0;x<width;x++)if(filled(x,y)){
  if(!filled(x,y-1))edge(x,y,x+1,y);if(!filled(x+1,y))edge(x+1,y,x+1,y+1);
  if(!filled(x,y+1))edge(x+1,y+1,x,y+1);if(!filled(x-1,y))edge(x,y+1,x,y);
 }
 const paths=[];
 while(edges.size){const start=edges.keys().next().value.split(',').map(Number),ring=[start];let p=start,dx=1,dy=0;
  do{const k=key(...p),next=edges.get(k);if(!next?.length)break;
   let index=next.findIndex(n=>n[0]-p[0]===-dy&&n[1]-p[1]===dx);if(index<0)index=0;
   const n=next.splice(index,1)[0];if(!next.length)edges.delete(k);dx=n[0]-p[0];dy=n[1]-p[1];
   const a=ring.at(-2),b=ring.at(-1);if(a&&(b[0]-a[0])*dy===(b[1]-a[1])*dx)ring.pop();ring.push(n);p=n;
  }while(p[0]!==start[0]||p[1]!==start[1]);
  if(ring.length>=4)paths.push('M'+ring.map(p=>p.join(' ')).join('L')+'Z');
 }
 return paths.join('');
}
let saved=new Map(),observer=null,frame=null;
function containers(){const all=[];
 try{if(map.hasLayer(_OVL.slope))all.push(_OVL.slope.getContainer());}catch(e){}
 try{const layer=root.ProjectTerrain?.slopeLayer?.();if(layer&&map.hasLayer(layer))all.push(layer.getContainer());}catch(e){}
 return all.filter(Boolean);
}
function refresh(){
 if(!document.body.classList.contains('stampa-on'))return;
 for(const [canvas,state]of saved)if(!canvas.isConnected){state.svg.remove();saved.delete(canvas);}
 for(const container of containers())for(const canvas of container.querySelectorAll('canvas.leaflet-tile-loaded')){
  if(saved.has(canvas))continue;
  try{
   const path=maskPath(canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data,canvas.width,canvas.height);
   if(!path)continue;
   const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 '+canvas.width+' '+canvas.height);svg.setAttribute('width',canvas.width);svg.setAttribute('height',canvas.height);svg.setAttribute('class','leaflet-tile leaflet-tile-loaded stp-slope-polygon');svg.setAttribute('aria-label','Nagib terena preko 30 posto');svg.style.cssText=canvas.style.cssText;svg.style.opacity='1';svg.style.pointerEvents='none';
   const polygon=document.createElementNS(svg.namespaceURI,'path');polygon.setAttribute('d',path);polygon.setAttribute('fill','#dc2626');polygon.setAttribute('fill-opacity','.6');polygon.setAttribute('fill-rule','evenodd');polygon.setAttribute('stroke','none');svg.append(polygon);
   saved.set(canvas,{svg,visibility:canvas.style.visibility});canvas.style.visibility='hidden';canvas.after(svg);
  }catch(e){/* Izvor nije čitljiv: sačuvaj postojeći prikaz. */}
 }
}
function start(){stop();observer=new MutationObserver(()=>{if(frame!==null)return;frame=requestAnimationFrame(()=>{frame=null;refresh();});});observer.observe(document.getElementById('map'),{subtree:true,childList:true,attributes:true,attributeFilter:['class']});refresh();}
function stop(){observer?.disconnect();observer=null;if(frame!==null)cancelAnimationFrame(frame);frame=null;for(const [canvas,state]of saved){canvas.style.visibility=state.visibility;state.svg.remove();}saved.clear();}
root.PrintSlope={maskPath,start,refresh,stop};if(typeof module!=='undefined'&&module.exports)module.exports=root.PrintSlope;
})(typeof window!=='undefined'?window:globalThis);
