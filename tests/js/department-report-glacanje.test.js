'use strict';
// DEM šum (krošnje, ±nekoliko m po ćeliji) ne smije ravnu kosinu od 20 % bojiti kao 30–39 %.
const assert=require('node:assert/strict'),turf=require('../../static/libs/turf.min.js');
const radnik=process.env.DR_WORKER||'../../static/js/department-report-worker.js';
const {calculate}=require(radnik);
const z=12,x0=570800,y0=377800,width=60,height=60,world=256*2**z;
const ll=(x,y)=>[x/world*360-180,Math.atan(Math.sinh(Math.PI*(1-2*y/world)))*180/Math.PI];
const rect=(x,y,w,h)=>[ll(x,y),ll(x+w,y),ll(x+w,y+h),ll(x,y+h),ll(x,y)];
const geometry={type:'Polygon',coordinates:[rect(x0,y0,width,height)]};
const metres=Math.cos(ll(x0,y0+height/2)[1]*Math.PI/180)*156543.03392/2**z;
let seed=12345;const rnd=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
const gauss=s=>s*Math.sqrt(-2*Math.log(rnd()+1e-12))*Math.cos(2*Math.PI*rnd());
function ulaz(nagib,sigma){const tiles=[];
 for(let y=Math.floor(y0/256)-1;y<=Math.floor((y0+height)/256)+1;y++)for(let x=Math.floor(x0/256)-1;x<=Math.floor((x0+width)/256)+1;x++){
  const elev=Float32Array.from({length:65536},(_,i)=>600+metres*(x*256+i%256-x0)*nagib+gauss(sigma));tiles.push({x,y,elev});}
 return {geometry,z,x0,y0,width,height,tiles};}
const r=calculate(ulaz(.20,5),turf).stats;
const strmo=r.slope.slice(3).reduce((n,s)=>n+s.percent,0);
assert(Math.abs(r.slopeMean-20)<2.5,'Srednji nagib ostaje oko stvarnih 20 %, a bio '+r.slopeMean.toFixed(1));
assert(strmo<3,'Ravna kosina od 20 % sa šumom ±5 m: udio razreda 30 %+ mora biti mali, a bio je '+strmo.toFixed(1)+' %');
// Bez šuma izglađivanje ne smije promijeniti ništa.
const cist=calculate(ulaz(.20,0),turf).stats;assert(Math.abs(cist.slopeMean-20)<.02);
console.log('OK izvjestaj odjela: glacanje DEM suma ('+strmo.toFixed(1)+' % u 30 %+ umjesto lazne stope bez glacanja)');
