'use strict';
const assert=require('node:assert/strict'),turf=require('../../static/libs/turf.min.js'),api=require('../../static/js/doznaka-plan-worker.js');
const z=13,world=256*2**z,R=6371000,rad=Math.PI/180,origin=[16,44.9],cos=Math.cos(origin[1]*rad);
const ll=(x,y)=>[origin[0]+x/(R*cos*rad),origin[1]+y/(R*rad)],xy=p=>[(p[0]-origin[0])*R*cos*rad,(p[1]-origin[1])*R*rad];
const ring=(x,y,w,h)=>[ll(x,y),ll(x+w,y),ll(x+w,y+h),ll(x,y+h),ll(x,y)],rect=turf.polygon([ring(0,0,300,120)]).geometry;
function input(geometry,height,options={width:15,crew:2,pace:3}){
 const box=turf.bbox(turf.feature(geometry)),tx=lng=>Math.floor((lng+180)/360*2**z),ty=lat=>Math.floor((1-Math.asinh(Math.tan(lat*rad))/Math.PI)/2*2**z),tiles=[];
 const lon=x=>x/world*360-180,lat=y=>Math.atan(Math.sinh(Math.PI*(1-2*y/world)))/rad;
 for(let y=ty(box[3])-1;y<=ty(box[1])+1;y++)for(let x=tx(box[0])-1;x<=tx(box[2])+1;x++){
  const elev=Float32Array.from({length:65536},(_,i)=>{const p=xy([lon(x*256+i%256),lat(y*256+Math.floor(i/256))]);return height(...p);});tiles.push({x,y,elev});
 }return {geometry,z,tiles,options};
}
let tests=0;function test(name,fn){fn();tests++;console.log('OK:',name);}
const plane=input(rect,(_,y)=>420+.3*y),result=api.calculate(plane,turf);
test('Planarni DEM: površina bez dupliranja, izohipse i približan razmak po terenu',()=>{
 assert.equal(result.bands.length,9);assert.equal(result.daysNeeded,3);assert(Math.abs(result.stats.areaHa-result.stats.coveredHa)<1e-8);
 assert(result.bands.every(b=>b.lines.length>0),'Prva izohipsa se ne smije izgubiti u Turf 6');
 for(const b of result.bands)for(const line of b.lines)for(const p of line){assert(turf.booleanPointInPolygon(turf.point(p),turf.feature(rect)));assert(Math.abs(420+.3*xy(p)[1]-b.elevation)<.05);}
 const centers=result.bands.slice(1,-1).map(b=>xy(b.lines[0][0])[1]);for(let i=1;i<centers.length;i++)assert(Math.abs((centers[i]-centers[i-1])*Math.sqrt(1+.3**2)-15)<.03);
});
test('Dva projektanta: najviši prati svoj pojas, zatim mijenjaju red',()=>{
 assert.deepEqual(result.passes.slice(0,3).map(p=>p.slots.map(s=>[s.person,s.band,s.guide])),[[[0,0,false],[1,1,false]],[[1,1,true],[0,2,false]],[[0,2,true],[1,3,false]]]);
 assert.equal(result.days[0].bands,4);assert.equal(result.days[0].guides,2);assert.equal(result.people.reduce((n,p)=>n+p.bands,0),9);
 const assigned=result.passes.flatMap(p=>p.slots.filter(s=>!s.guide).map(s=>s.band));assert.equal(new Set(assigned).size,9);
 for(const day of result.days)assert(day.passes<=3);assert(Math.abs(result.people.reduce((n,p)=>n+p.areaHa,0)-result.stats.areaHa)<1e-8);
});
test('Tri projektanta i jedan projektant: kružni red, ograničen dnevni učinak',()=>{
 const bands=Array.from({length:15},()=>({component:0,areaHa:.5,lengthM:100}));const r=api.schedule(bands,{width:10,crew:3,pace:3});
 assert.deepEqual(r.passes.slice(0,4).map(p=>p.slots.map(s=>s.person)),[[0,1,2],[2,0,1],[1,2,0],[0,1,2]]);assert.equal(r.daysNeeded,3);assert.equal(r.bands.length,15);assert(r.people.every(p=>p.bands===5));
 const single=api.schedule(Array.from({length:7},()=>({component:0,areaHa:1,lengthM:100})),{crew:1,pace:2});assert.equal(single.daysNeeded,4);assert(single.passes.every(p=>p.slots.length===1&&!p.slots[0].guide));
 const fresh=api.schedule(Array.from({length:7},()=>({component:0,areaHa:1,lengthM:100})),{crew:3,pace:2,leapfrog:false});assert.equal(fresh.daysNeeded,2);assert(fresh.passes.every(p=>p.slots.every(s=>!s.guide)));
});
test('Odvojeni odsjeci počinju novim nizom, bez povratka preko drugog odsjeka',()=>{
 const r=api.schedule([{component:0,areaHa:1,lengthM:50},{component:0,areaHa:1,lengthM:50},{component:1,areaHa:1,lengthM:50},{component:1,areaHa:1,lengthM:50}],{crew:2,pace:2});assert(r.passes.every(p=>p.slots.every(s=>!s.guide)));assert.equal(r.daysNeeded,1);
});
test('Krivudave izohipse, rupa i više poligona: puna površina bez pokrivanja rupe',()=>{
 const geometry={type:'MultiPolygon',coordinates:[[ring(0,0,300,150),ring(120,40,40,40).reverse()],[ring(340,0,100,150)]]};
 const height=(x,y)=>500+.4*y+8*Math.sin(x/80),r=api.calculate(input(geometry,height,{width:10,crew:3,pace:2}),turf);assert(Math.abs(r.stats.areaHa-r.stats.coveredHa)/r.stats.areaHa<1e-8);assert.equal(r.stats.components,2);
 assert(r.bands.every(b=>!turf.booleanPointInPolygon(turf.point(ll(140,60)),turf.feature(b.geometry))));
 for(const b of r.bands)for(const line of b.lines)for(const p of line)assert(Math.abs(height(...xy(p))-b.elevation)<.07,'Linija prati interpolirani DEM');
 for(let i=1;i<r.bands.length;i++){const prev=r.bands[i-1],now=r.bands[i];if(prev.component===now.component)assert(prev.level<=now.level);}
 // Stvarne unutrašnje probe: jedan pokrivač, bez preklopa, rupa ili vanjske površine.
 for(let y=2.3;y<150;y+=7.1)for(let x=2.7;x<440;x+=11.3){const p=turf.point(ll(x,y)),hit=turf.booleanPointInPolygon(p,turf.feature(geometry)),count=r.bands.filter(b=>turf.booleanPointInPolygon(p,turf.feature(b.geometry),{ignoreBoundary:true})).length;assert.equal(count,hit?1:0);}
});
test('Širi pojasevi smanjuju broj prolaza; ravan teren je jasno označen',()=>{
 const narrow=api.calculate({...plane,options:{width:10,crew:2,pace:3}},turf),wide=api.calculate({...plane,options:{width:20,crew:2,pace:3}},turf);assert(narrow.bands.length>wide.bands.length);assert(narrow.daysNeeded>=wide.daysNeeded);
 const flat=api.calculate(input(rect,()=>600),turf);assert(flat.stats.flat);assert(flat.bands.every(b=>b.elevation===null));assert(Math.abs(flat.stats.coveredHa-flat.stats.areaHa)<1e-8);
});
test('Nedostajući DEM, neispravni parametri i prevelik odjel nemaju lažni plan',()=>{
 const missing=input(rect,()=>NaN);assert.throws(()=>api.calculate(missing,turf),/DEM nije potpun/);
 for(const o of [{width:0},{width:101},{crew:0},{crew:13},{crew:1.5},{pace:0},{pace:31}])assert.throws(()=>api.options(o));
 assert.throws(()=>api.calculate({...plane,geometry:turf.polygon([ring(0,0,26000,120)]).geometry},turf),/manji prostor/);
});
console.log('PASS:',tests,'semantičkih provjera DEM plana, površina i rasporeda');
