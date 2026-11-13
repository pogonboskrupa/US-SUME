// v4.4.7: panel za uređivanje mjerenja — boja, debljina, vrsta linije, ispuna (čuva se u mjerenju, crta na karti).
const assert=require('assert'),fs=require('fs');const src=require('./_izvor').izvor(),html=fs.readFileSync('index.html','utf8');
for(const id of ['mqm-boje','mqm-deb','mqm-dash','mqm-fill'])assert(html.includes('id="'+id+'"'),id);
assert(/function _mqmStil\(/.test(src)&&/_msrRegSave\(\);\s*\n\s*if \(k === 'color'\)/.test(src),'promjena se odmah sprema');
assert(/gw = m\.weight \|\| _lineStyle\.msrW \|\| 4, gd = m\.dash \|\| null/.test(src),'sačuvano mjerenje koristi svoju debljinu i vrstu linije');
assert(/dashArray: gd,\s*\n\s*fillColor: color/.test(src)&&/dashArray:gd, opacity:1\.0/.test(src),'poligon i linija crtaju vrstu linije');
assert((src.match(/_mqmIzgledOsvjezi\(\);/g)||[]).length>=2,'panel se popunjava pri otvaranju (novo i postojeće)');
console.log('ok izgled mjerenja');
