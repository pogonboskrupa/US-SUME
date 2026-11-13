// v4.4.2: koordinate KML tačke u jednom redu (Y/X); kamionski putevi sa servera — klik zadano isključen.
const fs=require('fs'),assert=require('assert');
const le=fs.readFileSync('static/js/layer-editor.js','utf8'),li=fs.readFileSync('static/js/local-layer-import.js','utf8'),src=require('./_izvor').izvor();
const f=le.slice(le.indexOf('function _layerMjere('),le.indexOf('function _layerPopupHtml('));
const _layerMjere=new Function('wgsToMGI','turf',f+';return _layerMjere;')((la,lo)=>({y:6353191,x:4963584}),undefined);
const r=_layerMjere({_kmlIsPoint:true,getLatLng:()=>({lat:44.8,lng:16.1})});
assert.deepEqual(r,[['Koordinate','Y 6353191  ·  X 4963584']],'jedan red koordinata');
assert(/role\(layer\)==='roads'\)layer\.klikOff=true/.test(li),'nov uvoz puteva: klik isključen');
assert(/!layer\.klikRucno&&globalThis\.GithubLayers\?\.role\(layer\)==='roads'\)layer\.klikOff=true/.test(src),'obnova: isključen osim ručnog izbora');
assert(/k\.klikRucno = true;/.test(src),'ručni izbor se pamti');
console.log('ok tačka / put');
