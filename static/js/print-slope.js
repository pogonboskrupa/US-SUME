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
let saved=new Map(),observer=null,frame=null,worker=null,taskId=0,epoch=0;
let queue=[],queued=new Set(),running=false,waiting=[];
function containers(){const all=[];
 try{if(map.hasLayer(_OVL.slope))all.push(_OVL.slope.getContainer());}catch(e){}
 try{const layer=root.ProjectTerrain?.slopeLayer?.();if(layer&&map.hasLayer(layer))all.push(layer.getContainer());}catch(e){}
 return all.filter(Boolean);
}
function finish(){if(!running&&!queue.length){for(const resolve of waiting.splice(0))resolve(true);}}
function trace(data,width,height){
 return new Promise(resolve=>{
  try{
   if(!worker)worker=new Worker('static/js/print-slope-worker.js');
   const id=++taskId;
   worker.onmessage=e=>{if(e.data.id===id)resolve(e.data.path||'');};
   worker.onerror=()=>{worker?.terminate();worker=null;resolve(null);};
   worker.postMessage({id,data,width,height},[data.buffer]);
  }catch(e){resolve(null);}
 });
}
function clean(){for(const [canvas,state]of saved)if(!canvas.isConnected){state.svg?.remove();saved.delete(canvas);}}
async function process(){
 if(running)return;running=true;const generation=epoch;
 while(queue.length&&generation===epoch){
  const canvas=queue.shift();
  // Jedna pločica po poslu; glavni thread može obrađivati dodire između poslova.
  await new Promise(resolve=>setTimeout(resolve,0));
  if(generation!==epoch)return;
  if(!canvas.isConnected||!containers().some(c=>c.contains(canvas))){queued.delete(canvas);continue;}
  try{
   const data=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;
   const path=await trace(data,canvas.width,canvas.height);
   if(generation!==epoch)return;
   if(!canvas.isConnected||!containers().some(c=>c.contains(canvas))){queued.delete(canvas);continue;}
   if(path===null){queued.delete(canvas);continue;} // Izvor ostaje vidljiv ako Worker nije dostupan.
   // Pamti i prazne pločice: ne računaj istu masku na svaku promjenu prozora.
   const state={svg:null,visibility:canvas.style.visibility};saved.set(canvas,state);
   if(path){
    const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 '+canvas.width+' '+canvas.height);svg.setAttribute('width',canvas.width);svg.setAttribute('height',canvas.height);svg.setAttribute('class','leaflet-tile leaflet-tile-loaded stp-slope-polygon');svg.setAttribute('aria-label','Nagib terena preko 30 posto');svg.style.cssText=canvas.style.cssText;svg.style.opacity='1';svg.style.pointerEvents='none';
    const polygon=document.createElementNS(svg.namespaceURI,'path');polygon.setAttribute('d',path);polygon.setAttribute('fill','#dc2626');polygon.setAttribute('fill-opacity','.6');polygon.setAttribute('fill-rule','evenodd');polygon.setAttribute('stroke','none');svg.append(polygon);
    state.svg=svg;canvas.style.visibility='hidden';canvas.after(svg);
   }
  }catch(e){/* Sačuvaj postojeći prikaz ako izvor nije čitljiv. */}
  queued.delete(canvas);
 }
 if(generation===epoch){running=false;finish();}
}
function refresh(){
 if(!document.body.classList.contains('stampa-on'))return;
 clean();
 for(const container of containers())for(const canvas of container.querySelectorAll('canvas.leaflet-tile-loaded'))
  if(!saved.has(canvas)&&!queued.has(canvas)){queued.add(canvas);queue.push(canvas);}
 process();
}
function ready(){refresh();if(!running&&!queue.length)return Promise.resolve(true);return new Promise(resolve=>waiting.push(resolve));}
function start(){stop();observer=new MutationObserver(()=>{if(frame!==null)return;frame=requestAnimationFrame(()=>{frame=null;refresh();});});observer.observe(document.getElementById('map'),{subtree:true,childList:true,attributes:true,attributeFilter:['class']});refresh();}
function stop(){epoch++;observer?.disconnect();observer=null;if(frame!==null)cancelAnimationFrame(frame);frame=null;worker?.terminate();worker=null;queue=[];queued.clear();running=false;for(const resolve of waiting.splice(0))resolve(false);for(const [canvas,state]of saved){canvas.style.visibility=state.visibility;state.svg?.remove();}saved.clear();}
root.PrintSlope={maskPath,start,refresh,ready,stop};if(typeof module!=='undefined'&&module.exports)module.exports=root.PrintSlope;
})(typeof window!=='undefined'?window:globalThis);
