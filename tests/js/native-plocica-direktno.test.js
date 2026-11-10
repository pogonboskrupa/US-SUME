'use strict';
const assert=require('node:assert/strict'),fs=require('fs');
const src=require('./_izvor').izvor();
const nat=fs.readFileSync(__dirname+'/../../static/js/native-offline-maps.js','utf8');
assert(/function tileUrl\(name\)/.test(nat)&&/!e\.pages&&e\.nativeId\?'\/offline-maps\/'\+e\.nativeId:null/.test(nat),'tileUrl samo za native kartu bez straničnog čitača');
const sloj=src.slice(src.indexOf('function _sqlmapCreateLayerW'),src.indexOf('// ── Prikaz slojeva'));
assert(/NativeOfflineMaps\.tileUrl\(name\)/.test(sloj)&&/img\.src = nUrl \+ '\/' \+ z/.test(sloj),'pločica ide direktno u img');
assert(/!_sqlTileNeg\.has\(/.test(sloj),'poznato nepostojeća pločica ne ide na mrežu');
assert(/img\.onerror = \(\) => \{ if \(!kraj\(\)\) return; img\.onerror = null; img\.removeAttribute\('src'\); _tryRead\(0\); \}/.test(sloj),'greška ide starim putem (potvrda + roditelj)');
// _wTileSlot: ograničenje istovremenih i oslobađanje
const ex=n=>{const i=src.indexOf('function '+n+'(');let d=0,j=src.indexOf('{',i);for(let k=j;k<src.length;k++){if(src[k]==='{')d++;else if(src[k]==='}'&&--d===0)return src.slice(i,k+1);}};
const api=new Function('let _wTileActive=0;const _wTileStack=[];const _W_TILE_MAX_INFLIGHT=2;const _now=()=>0;const _tileProf={qWaitN:0,qWaitSum:0,qWaitMax:0};'+ex('_tileUzmiSljedeci')+ex('_wTileSlot')+';return {slot:_wTileSlot,akt:()=>_wTileActive,red:_wTileStack};')();
(async()=>{
  const a=await api.slot(()=>1),b=await api.slot(()=>1);
  assert.equal(api.akt(),2);
  let treci=null;const p3=api.slot(()=>1).then(f=>treci=f);
  await Promise.resolve();assert.equal(treci,null,'treći čeka slot');assert.equal(api.red.length,1);
  a();a();await p3;assert.equal(typeof treci,'function','oslobađanje pušta sljedećeg');assert.equal(api.akt(),2,'dvostruko oslobađanje se ne broji dvaput');
  // napuštena pločica (pri vraća null) dobija null
  let cet='x';const p4=api.slot(()=>null).then(f=>cet=f);b();await p4;assert.equal(cet,null);
  // mikro-mjerenje
  assert(/function _perfTacka/.test(src)&&/o\.mikro = window\._PERF_MIKRO/.test(src));
  console.log('OK native plocica direktno');
})().catch(e=>{console.error(e);process.exit(1);});
