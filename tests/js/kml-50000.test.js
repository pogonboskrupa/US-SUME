// KML sa 50 000 tačaka odjednom: hit-test ostaje brz, a tačke nemaju listener/tooltip po sloju.
// Puni test (stvarni Leaflet + DOM parser): tests/browser/kml-50000.py
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync(require('node:path').join(__dirname,'../../index.html'),'utf8');
function fn(name){const m=new RegExp('(?:async )?function '+name+'\\(').exec(html);assert.ok(m,name);let i=html.indexOf('{',m.index),d=0;for(;i<html.length;i++){if(html[i]==='{')d++;else if(html[i]==='}'&&--d===0)break;}return html.slice(m.index,i+1);}
const N=50000;
const pt=(x,y)=>({x,y,distanceTo(o){return Math.hypot(x-o.x,y-o.y)}});
const layers=[];for(let i=0;i<N;i++){const x=(i%250)*40,y=Math.floor(i/250)*40;layers.push({_kmlName:'St '+i,_kmlIsPoint:true,getLatLng:()=>({x,y})});}
const ctx={kmlLs:[{grp:{eachLayer:f=>layers.forEach(f)},vis:true}],map:{latLngToLayerPoint:l=>l,latLngToContainerPoint:l=>pt(l.x,l.y),hasLayer:()=>true},console};
vm.createContext(ctx);vm.runInContext(['_kmlHitTest','_kmlRingDistPx'].map(fn).join('\n'),ctx);
const target=12345,x=(target%250)*40,y=Math.floor(target/250)*40;
const t0=Date.now();const hit=ctx._kmlHitTest({x:x+3,y:y+2});const ms=Date.now()-t0;
assert.equal(hit&&hit._kmlName,'St '+target);assert.ok(ms<500,'hit-test na 50000 tačaka presporo: '+ms+' ms');
assert.equal(ctx._kmlHitTest({x:-500,y:-500}),null);
// invarijante: tačke u pkml/pkmlStyled ne smiju ponovo dobiti per-sloj tooltip/popup listener
for(const name of ['pkml','pkmlStyled']){
  const src=fn(name),i=src.indexOf("getElementsByTagName('Point')"),pointBlock=src.slice(i);
  assert.ok(i>0,name+': tačke moraju ići kroz getElementsByTagName');
  assert.ok(!/bindTooltip|_bindKmlPopup/.test(pointBlock),name+': tačka ne smije imati bindTooltip/_bindKmlPopup po sloju');
  assert.ok(src.includes("g.on('click', _kmlGrpClick)")&&src.includes("g.on('mouseover', _kmlGrpTip)"),name+': grupni handleri');
  assert.ok(!/querySelectorAll\('Placemark'\)/.test(src),name+': Placemark petlja mora biti indeksna');
}
console.log('kml-50000: hit-test',ms,'ms, invarijante OK');
