'use strict';
const assert=require('node:assert/strict');const {maskPath}=require('../../static/js/print-slope.js');
function mask(w,h,filled){const d=new Uint8ClampedArray(w*h*4);for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(filled(x,y))d[(y*w+x)*4+3]=200;return maskPath(d,w,h);}
function area(path){let sum=0;for(const ring of path.match(/M[^Z]+Z/g)||[]){const p=ring.slice(1,-1).split('L').map(s=>s.split(' ').map(Number));for(let i=0;i<p.length;i++){const a=p[i],b=p[(i+1)%p.length];sum+=(a[0]*b[1]-b[0]*a[1])/2;}}return sum;}
assert.equal(mask(3,3,()=>false),'');assert.equal(area(mask(3,3,()=>true)),9);
assert.equal(area(mask(3,3,(x,y)=>x!==1||y!==1)),8,'Rupa ostaje prazna');
assert.equal(area(mask(2,2,(x,y)=>x===y)),2,'Dodir u uglu ne popunjava prazne ćelije');
assert.equal(area(mask(4,3,(x,y)=>x<2||y===2)),8,'Krivudava maska prati klasifikaciju');
console.log('OK print DEM masks: empty/full, holes, corner touches and winding boundaries preserve classified area');
