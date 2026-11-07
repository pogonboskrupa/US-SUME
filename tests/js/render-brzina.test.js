'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const src=fs.readFileSync(path.resolve(__dirname,'../../static/js/render-health.js'),'utf8');
let n=0;const t=(m,f)=>{f();n++;console.log('  ok  '+m);};
function load(store,nav){
  const listeners={},raf=[];const timers=[];
  const doc={documentElement:{dataset:{},classList:{toggle(){}}},addEventListener:(e,f)=>{(listeners[e]=listeners[e]||[]).push(f);}};
  const ctx={navigator:nav||{deviceMemory:8,hardwareConcurrency:8},localStorage:{getItem:k=>store[k]??null,setItem:(k,v)=>{store[k]=String(v);},removeItem:k=>{delete store[k];}},document:doc,
    requestAnimationFrame:f=>{raf.push(f);},setTimeout:f=>{timers.push(f);return timers.length;},clearTimeout(){},Date,JSON,console};
  ctx.window=ctx;ctx.globalThis=ctx;ctx.addEventListener=()=>{};
  vm.createContext(ctx);vm.runInContext(src,ctx);
  return {R:ctx.DendroRender,listeners,raf,timers,ctx};
}
t('jak uređaj bez dokaza ostaje pun, slow() ga prebacuje u lagani i pamti',()=>{
  const st={};const {R}=load(st);assert.equal(R.state.lite,false);R.slow('test');
  assert.equal(R.state.lite,true);assert.equal(R.state.animations,false);assert.ok(JSON.parse(st.tvlake_render_slow_v1).ts>0);
});
t('zapamćeno trzanje važi pri sljedećem pokretanju, ali stare od 30 dana ne',()=>{
  assert.equal(load({tvlake_render_slow_v1:JSON.stringify({ts:Date.now()-1000})}).R.state.lite,true);
  assert.equal(load({tvlake_render_slow_v1:JSON.stringify({ts:Date.now()-40*864e5})}).R.state.lite,false);
});
t('izbor korisnika pobjeđuje auto-detekciju u oba smjera',()=>{
  assert.equal(load({tvlake_render_mode:'lite'}).R.state.lite,true);
  const f=load({tvlake_render_mode:'full',tvlake_render_slow_v1:JSON.stringify({ts:Date.now()})},{deviceMemory:2,hardwareConcurrency:4});
  assert.equal(f.R.state.lite,false,'ručni Puni prikaz gazi i slab RAM i zapamćeno trzanje');
});
t('setMode: lite/full/auto, auto briše zapamćeno trzanje',()=>{
  const st={tvlake_render_slow_v1:JSON.stringify({ts:Date.now()})};const {R}=load(st);
  assert.equal(R.state.lite,true);R.setMode('full');assert.equal(R.state.lite,false);assert.equal(st.tvlake_render_mode,'full');
  R.setMode('lite');assert.equal(R.state.lite,true);R.setMode('auto');assert.equal(st.tvlake_render_mode,undefined);assert.equal(st.tvlake_render_slow_v1,undefined);assert.equal(R.state.lite,false);
});
t('slow() ne radi kad je korisnik izabrao Puni prikaz',()=>{
  const {R}=load({tvlake_render_mode:'full'});R.slow('x');assert.equal(R.state.lite,false);
});
function pomicanje(env,okviri,ms){ // simulira jedan dodir-pomak sa zadanim trajanjem okvira
  env.listeners.touchmove.forEach(f=>f());let tm=1000;
  env.raf.splice(0).forEach(f=>f(tm));
  for(let i=0;i<okviri;i++){tm+=ms;const q=env.raf.splice(0);q.forEach(f=>f(tm));}
  env.timers.splice(0).forEach(f=>f()); // istek "mirovanja" završava mjerenje
}
t('trzanje (60 ms po frameu) u 3 pomicanja aktivira lagani prikaz',()=>{
  const e=load({});assert.equal(e.R.state.lite,false);
  pomicanje(e,40,60);pomicanje(e,40,60);assert.equal(e.R.state.lite,false,'dva nisu dovoljna');pomicanje(e,40,60);
  assert.equal(e.R.state.lite,true);
});
t('glatko pomicanje (16 ms) nikad ne aktivira lagani prikaz',()=>{
  const e=load({});for(let i=0;i<6;i++)pomicanje(e,60,16);assert.equal(e.R.state.lite,false);
});
t('kratko pomicanje (< 25 frameova) se ne broji',()=>{
  const e=load({});for(let i=0;i<5;i++)pomicanje(e,10,70);assert.equal(e.R.state.lite,false);
});
const glavni=require('./_izvor').izvor();
t('move handler karte je vremenski ograničen (ne svaki frame)',()=>{
  assert(/_moveZadnji/.test(glavni)&&/DendroRender\?\.state\?\.lite \? 200 : 120/.test(glavni));
});
t('Slojevi karte imaju izbor brzine prikaza',()=>{
  const html=fs.readFileSync(path.resolve(__dirname,'../../index.html'),'utf8');
  assert(/id="render-mode-sel"[^>]*DendroRender\.setMode\(this\.value\)/.test(html));
});
console.log(n+' prošlo, 0 palo');
