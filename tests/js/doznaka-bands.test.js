'use strict';
const assert=require('node:assert/strict'),turf=require('../../static/libs/turf.min.js'),{build}=require('../../static/js/doznaka-bands.js');
const R=6371000,cos=Math.cos(44.9*Math.PI/180),ll=(x,y)=>[16+x/(R*cos)*180/Math.PI,44.9+y/R*180/Math.PI];
const rect=(x0,y0,x1,y1)=>turf.polygon([[ll(x0,y0),ll(x1,y0),ll(x1,y1),ll(x0,y1),ll(x0,y0)]]),boundary=rect(0,0,500,200);
const line=(uid,y,curve=0)=>({uid,line:turf.lineString(Array.from({length:49},(_,i)=>ll(10+i*10,y+curve*Math.sin(i/5)))),startedAt:'2026-09-21T05:00:00Z',endedAt:'2026-09-21T06:40:00Z'});
const a=line('A',50),b=line('B',80),original=JSON.stringify([a,b]),bands=build([a,b],boundary,20,turf);
assert.equal(bands.length,2);assert(bands.every(b=>b.joined));assert.equal(JSON.stringify([a,b]),original);
const total=turf.area(turf.union(bands[0].polygon,bands[1].polygon)),expected=turf.area(rect(0,30,500,100));assert(Math.abs(total-expected)<.1);
assert(Math.abs(bands.reduce((s,b)=>s+b.areaHa*10000,0)-total)<.1,'nema dvostrukog brojanja');
for(let x=20;x<480;x+=10){for(const y of [64.99,65.01])assert(bands.some(b=>turf.booleanPointInPolygon(turf.point(ll(x,y)),b.polygon)),'zajednička granica bez praznine');}
const curved=build([line('A',50,10),line('B',80,10),line('C',110,10)],boundary,20,turf);assert.equal(curved.length,3);
for(let i=1;i<48;i++){const x=10+i*10,y=65+10*Math.sin(i/5);assert(curved.some(b=>turf.booleanPointInPolygon(turf.point(ll(x,y)),b.polygon)));}
assert.equal(build([a],boundary,20,turf),null);assert.equal(build([a,line('B',150)],boundary,20,turf),null,'velika praznina nije rad');
assert.equal(build([a,{...a,uid:'B'}],boundary,20,turf),null,'dupli trag ne dobija izmišljene granice');
const crossing={uid:'B',line:turf.lineString([ll(10,100),ll(490,0)])};assert.equal(build([a,crossing],boundary,20,turf),null);
const hole=rect(200,40,300,90).geometry.coordinates[0].slice().reverse();const withHole=turf.polygon([...boundary.geometry.coordinates,hole]);
const holed=build([a,b],withHole,20,turf);assert(!holed.some(b=>turf.booleanPointInPolygon(turf.point(ll(250,60)),b.polygon)),'rupa u odjelu ostaje van površine');
const changed=build([a,b],rect(0,0,250,200),20,turf);assert(changed.reduce((s,b)=>s+b.areaHa,0)<bands.reduce((s,b)=>s+b.areaHa,0)*.6,'pojas prati novu granicu');
console.log('OK: zajedničke granice pravih/krivudavih pojaseva, spojena površina, rupe i granice odjela, dupli/presječeni/daleki tragovi, nepromijenjeni GPS podaci');
