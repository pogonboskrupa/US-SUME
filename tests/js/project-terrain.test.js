const assert=require('node:assert/strict');
const t=require('../../static/js/project-terrain.js');
const ring=[[44.9,16],[44.9,16.01],[44.91,16.01],[44.91,16]];
assert.deepEqual(t.validateRing(ring).ring,ring);
assert.deepEqual(t.cleanRing([...ring,ring[0]]),ring);
assert.deepEqual(t.cleanRing([ring[0],ring[0],...ring.slice(1)]),ring);
assert.equal(ring.length,4);
assert(t.validateRing([[0,0],[1,1],[0,1],[1,0]]).error.includes('sijeku'));
assert(t.validateRing([[0,0],[1,1],[2,2]]).error);
for(const value of [[],[[0,0],[1,1]],[[NaN,0],[1,1],[0,1]],[[86,0],[1,1],[0,1]],[[0,181],[1,1],[0,1]],[['0',0],[1,1],[0,1]],Array(502).fill([0,0])])assert.equal(t.cleanRing(value),null);
for(const pct of [-1,0,29.999,30,NaN,Infinity])assert.equal(t.slopeRGBA(pct)[3],0);
assert(t.slopeRGBA(30.001)[3]>0);assert(t.slopeRGBA(80)[0]<t.slopeRGBA(31)[0]);
const z=14,y=5900,py=128;
const lat=Math.atan(Math.sinh(Math.PI*(1-2*(y+(py+.5)/256)/2**z)))*180/Math.PI;
const metres=Math.cos(lat*Math.PI/180)*156543.03392/2**z;
function plane(dx,dy){return Float64Array.from({length:65536},(_,i)=>500+(i%256)*metres*dx+Math.floor(i/256)*metres*dy);}
assert.equal(t.gradient(plane(0,0),100,py,z,y).percent,0);
for(const [dx,dy,bearing]of [[.4,0,270],[-.4,0,90],[0,.4,0],[0,-.4,180]]){
 const g=t.gradient(plane(dx,dy),100,py,z,y);assert(Math.abs(g.percent-40)<1e-8);assert(Math.abs(g.bearing-bearing)<1e-8);
}
assert(Math.abs(t.gradient(plane(.3,.4),100,py,z,y).percent-50)<1e-8);
const low=t.pixels(plane(.1,0),{z,y},'slope'),steep=t.pixels(plane(.45,0),{z,y},'slope');
assert.equal(low.filter((_,i)=>i%4===3).some(Boolean),false);
assert(steep[4*(py*256+100)+3]>0);
assert.notEqual(t.keyFor('A','P'),t.keyFor('B','P'));assert.notEqual(t.keyFor('A','P'),t.keyFor('A','Q'));
console.log('OK: validacija geometrije, granica >30%, metrike i smjerovi DEM-a, izdvajanje naloga/projekta');
