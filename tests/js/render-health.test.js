const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../..');
const {detect}=require(path.join(root,'static/js/render-health.js'));

let p=detect({deviceMemory:4,hardwareConcurrency:8},{});
assert.equal(p.mode,'lite');assert.equal(p.tileBuffer,2);assert.equal(p.sqlCache,72);assert.equal(p.animations,false);
p=detect({deviceMemory:8,hardwareConcurrency:8},{});
assert.equal(p.mode,'full');assert.equal(p.tileBuffer,4);assert.equal(p.sqlCache,160);assert.equal(p.animations,true);
p=detect({deviceMemory:8,hardwareConcurrency:8},{memoryGb:3.8,lowRam:false});
assert.equal(p.mode,'lite','APK stvarni RAM ima prednost nad zaokruženim browser signalom');
p=detect({hardwareConcurrency:4},{memoryGb:8,lowRam:false});assert.equal(p.mode,'lite');
p=detect({},{});assert.equal(p.mode,'full','bez dokaza se funkcionalnost ne degradira');
p=detect({deviceMemory:8,hardwareConcurrency:8},{memoryGb:12,lowRam:true});assert.equal(p.mode,'lite');

const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
assert(html.includes("zoomAnimation:_renderCfg.animations"));
assert(!html.includes('keepBuffer:6'),'stari buffer je držao stotine 256px tekstura po sloju');
assert(html.includes("window.DendroRender?.onPressure(() => _renderRecover(true))"));
assert(html.includes('content-visibility:visible!important'));
const java=fs.readFileSync(path.join(root,'android/app/src/main/java/ba/spd/uss/vlake/MainActivity.java'),'utf8');
assert(java.includes('.put("memoryGb"'));
assert(java.includes("dendro-memory-pressure"));
assert(java.includes('onTrimMemory(int level)'));
console.log('OK: lite/full profil, manji tile/GPU budžet, Android memory-pressure oporavak i pouzdan prikaz lista');
