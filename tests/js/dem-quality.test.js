'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const q=require('../../static/js/dem-quality.js'),html=fs.readFileSync('index.html','utf8');
function fn(name){const start=html.indexOf('function '+name+'(');assert(start>=0);let pos=html.indexOf('{',start),n=0;for(let i=pos;i<html.length;i++){if(html[i]==='{')n++;if(html[i]==='}'&&!--n)return html.slice(start,i+1);}throw Error(name);}
assert.equal(q.bilinear([100,NaN,NaN,NaN],2,2,0,0),100);
assert(Number.isNaN(q.bilinear([100,NaN,100,100],2,2,.1,.1)));
assert.equal(q.bilinear([100,110,120,130],2,2,2,2),130,'rub se ne ekstrapolira');
assert.equal(q.bilinear([450],1,1,3,3),450);
// Analitička ravnina preko četiri susjedne pločice: stvarna polupikselska koordinata.
const tiles=new Map();for(let ty=0;ty<2;ty++)for(let tx=0;tx<2;tx++)tiles.set(tx+':'+ty,Float64Array.from({length:65536},(_,i)=>300+(tx*256+i%256)*.1+(ty*256+Math.floor(i/256))*.2));
for(const [x,y]of [[255.25,255.75],[255.99,128.12],[256.01,256.01],[100.5,220.2]])assert(Math.abs(q.tileSample(tiles,(x+.5)/256,(y+.5)/256)-(300+x*.1+y*.2))<1e-9);
tiles.get('1:1')[0]=NaN;assert(Number.isNaN(q.tileSample(tiles,1,1)));
for(const metres of [6.7,13.5,27,54]){const plane=Float64Array.from({length:65536},(_,i)=>100+(i%256)*metres*.3+Math.floor(i/256)*metres*.4);
 for(const [x,y]of [[0,0],[0,120],[255,255],[128,128]]){const g=q.gradient(plane,x,y,metres);assert(Math.abs(g.percent-50)<1e-9);assert(Math.abs(g.bearing-323.130102354156)<1e-8);}
 plane[128*256+128]=NaN;assert(Number.isNaN(q.gradient(plane,128,128,metres).percent));}
const ctx={DemQuality:q,Math,Number,Float32Array};vm.createContext(ctx);vm.runInContext(fn('_demGridBoundsAndStep')+'\n'+fn('_demBilinearElev'),ctx);
for(const [s,n,w,e]of [[44.9,44.9,16,16],[44.9,44.912,16,16.007],[44,45,15,17]]){
 const g=ctx._demGridBoundsAndStep({getSouth:()=>s,getNorth:()=>n,getWest:()=>w,getEast:()=>e},60);
 assert(g.rows>=2&&g.cols>=2&&g.rows<=120&&g.cols<=120);assert(s+(g.rows-1)*g.step>=n-1e-12);assert(w+(g.cols-1)*g.step>=e-1e-12);
}
assert.equal(ctx._demBilinearElev({grid:[0,10,20,30],rows:2,cols:2,south:0,west:0,step:1},.5,.5),15);
console.log('OK: analitičke ravnine na četiri zuma i rubovima, šavovi pločica, NoData, pokrivenost i interpolacija DEM grida');
