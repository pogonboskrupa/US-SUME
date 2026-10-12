const assert=require('node:assert/strict'),turf=require('../../static/libs/turf.min.js'),{merge}=require('../../static/js/doznaka-project-boundary.js');
const rect=(x,y,w,h)=>turf.polygon([[[x,y],[x+w,y],[x+w,y+h],[x,y+h],[x,y]]]);
const a=rect(16,44.9,.001,.001),b=rect(16.001,44.9,.001,.001),far=rect(16.1,44.9,.001,.001);
const pair=merge([a,b],turf);assert.equal(pair.geometry.type,'Polygon');assert(Math.abs(pair.areaHa-(turf.area(a)+turf.area(b))/10000)<.001);
const overlap=merge([a,a],turf);assert(Math.abs(overlap.areaHa-turf.area(a)/10000)<.001);
const separate=merge([a,far],turf);assert.equal(separate.geometry.type,'MultiPolygon');assert.equal(separate.geometry.coordinates.length,2);
const hole=turf.polygon([[[16,44.9],[16.01,44.9],[16.01,44.91],[16,44.91],[16,44.9]],[[16.002,44.902],[16.004,44.902],[16.004,44.904],[16.002,44.904],[16.002,44.902]]]);
const h=merge([hole,far],null);assert.equal(h.geometry.coordinates[0].length,2);assert.equal(h.geometry.coordinates.length,2);
assert.throws(()=>merge([],turf));console.log('OK: susjedni/odvojeni odsjeci, bez dvostruke površine, rupe i višestruki offline fallback');
