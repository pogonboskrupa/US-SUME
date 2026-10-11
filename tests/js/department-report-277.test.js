const assert=require('node:assert/strict'),turf=require('../../static/libs/turf.min.js');
const {calculate,slopeIndex,aspectIndex}=require('../../static/js/department-report-worker.js');
for(const [p,c]of [[0,0],[9.999,0],[10,1],[19.999,1],[20,2],[30,3],[40,4],[50,5],[180,5],[-1,-1],[NaN,-1]])assert.equal(slopeIndex(p),c);
for(const [b,c]of [[0,0],[44.9,0],[45,1],[134.9,1],[135,2],[224.9,2],[225,3],[314.9,3],[315,0]])assert.equal(aspectIndex(b,20),c);
assert.equal(aspectIndex(0,0),-1);
const z=12,x0=570800,y0=377800,width=48,height=32,world=256*2**z;
const ll=(x,y)=>[x/world*360-180,Math.atan(Math.sinh(Math.PI*(1-2*y/world)))*180/Math.PI];
const rect=(x,y,w,h)=>[ll(x,y),ll(x+w,y),ll(x+w,y+h),ll(x,y+h),ll(x,y)];
const geometry={type:'Polygon',coordinates:[rect(x0,y0,width,height),rect(x0+20,y0+12,8,8)]};
const metres=Math.cos(ll(x0,y0+height/2)[1]*Math.PI/180)*156543.03392/2**z;
function input(dx,dy,missing=false){const tiles=[];
 for(let y=Math.floor(y0/256)-1;y<=Math.floor((y0+height)/256)+1;y++)for(let x=Math.floor(x0/256)-1;x<=Math.floor((x0+width)/256)+1;x++){
  const elev=Float32Array.from({length:65536},(_,i)=>missing&&x*256+i%256>x0+32?NaN:600+metres*((x*256+i%256-x0)*dx+(y*256+Math.floor(i/256)-y0)*dy));tiles.push({x,y,elev});
 }return {geometry,z,x0,y0,width,height,tiles};}
for(const [dx,dy,dir]of [[.15,0,3],[-.15,0,1],[0,.35,0],[0,-.35,2]]){
 const r=calculate(input(dx,dy),turf);assert(Math.abs(r.stats.slopeMean-Math.hypot(dx,dy)*100)<.02);assert.equal(r.stats.coverage,100);assert.equal(r.stats.slopeCoverage,100);assert(Math.abs(r.stats.aspect[dir].percent-100)<1e-8);assert(r.stats.min<r.stats.mean&&r.stats.mean<r.stats.max);assert.equal(r.mask[14*width+22],0);assert.equal(r.classes[14*width+22],-1);
 assert(Math.abs(r.stats.slope.reduce((n,r)=>n+r.ha,0)-turf.area(turf.feature(geometry))/10000)<1e-8);
}
const flat=calculate(input(0,0),turf);assert.equal(flat.stats.flat,100);assert.equal(flat.stats.aspect.reduce((n,r)=>n+r.percent,0),0);assert(Math.abs(flat.stats.mean-600)<1e-8);
const partial=calculate(input(.35,0,true),turf);assert(partial.stats.coverage<100&&partial.stats.coverage>0);assert(partial.stats.slopeCoverage<partial.stats.coverage);assert.equal(partial.stats.slope[0].percent,0,'Nedostajući DEM se ne prikazuje kao ravan teren');
const pieces=input(.15,0);pieces.geometry={type:'MultiPolygon',coordinates:[[rect(x0,y0,8,8)],[rect(x0+40,y0+24,8,8)]]};const p=calculate(pieces,turf);assert.equal(p.mask[16*width+24],0);assert.equal(p.stats.coverage,100);
const mixed=input(0,0);for(const tile of mixed.tiles)for(let i=0;i<65536;i++){const gx=tile.x*256+i%256-x0;tile.elev[i]=600+metres*(Math.min(gx,24)*.15+Math.max(0,gx-24)*.45);}
const m=calculate(mixed,turf);assert(m.edges.length>0);assert(m.stats.slope[1].percent>20&&m.stats.slope[4].percent>20);
const unavailable=input(.2,0);unavailable.tiles.forEach(t=>t.elev.fill(NaN));assert.throws(()=>calculate(unavailable,turf),/nije dostupan/);
assert.throws(()=>calculate({...input(0,0),width:160001},turf),/Preveliko/);

// Analitičke ravni: profil mora potvrditi Δh / vodoravnu dužinu, u oba smjera.
function verifyProfiles(r,shape,expected){
 assert.equal(r.profileInfo.areaPerLineHa,3);assert.equal(r.profileInfo.available,r.slopeProfiles.length);
 assert.equal(r.profileInfo.target,r.profileInfo.available+r.profileInfo.unavailable);
 for(const p of r.slopeProfiles){
  assert(p.distance>=1&&Number.isFinite(p.percent)&&p.percent>=0);
  assert(p.topElevation>=p.bottomElevation);
  assert(Math.abs(p.drop-(p.topElevation-p.bottomElevation))<1e-8);
  assert(Math.abs(p.percent-p.drop/p.distance*100)<1e-8);
  const coords=p.points.map(([lat,lng])=>[lng,lat]);
  assert(Math.abs(p.distance-turf.length(turf.lineString(coords),{units:'kilometers'})*1000)<1e-8);
  if(expected!==undefined)assert(Math.abs(p.percent-expected)<.1,`P${p.id}: ${p.percent}, expected ${expected}`);
  for(let i=1;i<coords.length;i++)for(let k=0;k<=40;k++){
   const point=coords[i-1].map((v,j)=>v+(coords[i][j]-v)*k/40);
   assert(turf.booleanPointInPolygon(turf.point(point),turf.feature(shape)),`Profil P${p.id} izlazi iz odjela ili prelazi rupu`);
  }
 }
}
for(const [dx,dy] of [[.15,0],[-.15,0],[0,.35],[0,-.35],[.15,.35],[-.15,-.35]]){
 const r=calculate(input(dx,dy),turf);verifyProfiles(r,geometry,Math.hypot(dx,dy)*100);
 assert.equal(r.profileInfo.target,Math.ceil(r.stats.areaHa/3));assert.equal(r.profileInfo.unavailable,0);
 assert(r.slopeProfiles.some(p=>p.points[0][1]<ll(x0+20,y0)[0])&&r.slopeProfiles.some(p=>p.points[0][1]>ll(x0+28,y0)[0]),'Profili pokrivaju oba dijela odjela');
}
verifyProfiles(flat,geometry,0);assert(flat.slopeProfiles.every(p=>p.flat));
verifyProfiles(partial,geometry,35);assert(partial.profileInfo.unavailable>0,'Nedostajući DEM ne pravi nulti profil');
verifyProfiles(p,pieces.geometry,15);assert.equal(p.profileInfo.unavailable,0);
assert(p.slopeProfiles.some(row=>row.points[0][1]<ll(x0+8,y0)[0])&&p.slopeProfiles.some(row=>row.points[0][1]>ll(x0+40,y0)[0]),'Svaki odvojeni odsjek ima profil');
verifyProfiles(m,geometry);assert(m.slopeProfiles.some(p=>p.percent<20)&&m.slopeProfiles.some(p=>p.percent>40));
const thin=input(.15,0);thin.geometry={type:'Polygon',coordinates:[rect(x0,y0,width,height),rect(x0+23.4,y0+4,.2,24)]};
const thinResult=calculate(thin,turf);verifyProfiles(thinResult,thin.geometry,15);
const concave=input(.15,0);concave.geometry={type:'Polygon',coordinates:[[ll(x0,y0),ll(x0+48,y0),ll(x0+48,y0+10),ll(x0+12,y0+10),ll(x0+12,y0+32),ll(x0,y0+32),ll(x0,y0)]]};
verifyProfiles(calculate(concave,turf),concave.geometry,15);
const hills=input(0,0);for(const tile of hills.tiles)for(let i=0;i<65536;i++){const x=tile.x*256+i%256-x0,y=tile.y*256+Math.floor(i/256)-y0;tile.elev[i]=700+metres*(2*Math.sin(x/9)+4*Math.cos(y/8));}
verifyProfiles(calculate(hills,turf),geometry);
console.log('OK: DEM razredi i ekspozicije; profili na 3 ha, Δh/udaljenost, ravni teren, obje strane odjela, rupe/uske rupe, konkavnost, odvojeni odsjeci i nedostajući DEM');
