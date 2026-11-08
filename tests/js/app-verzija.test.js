'use strict';
// Verzija aplikacije ide uz aktivnost; bez migracije pada na stari RPC.
// Admin prikaz: starija verzija je istaknuta, nepoznato se ne prikazuje kao "nije javio".
const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const {izvor}=require('./_izvor');
function okolina(odgovor){
 const store=new Map(),calls=[],listeners={};
 const env={Date,Map,Number,Promise,AbortController,console,clearTimeout,setTimeout,
  localStorage:{setItem:(k,v)=>store.set(k,v),getItem:k=>store.get(k)||null,removeItem:k=>store.delete(k)},
  navigator:{onLine:true},document:{visibilityState:'visible',addEventListener:(ev,fn)=>listeners[ev]=fn},
  addEventListener:()=>{},setInterval:()=>{},sbUser:{id:'A'},
  sb:{rpc:async(name,args)=>{calls.push({name,args});return odgovor(name);}}};
 vm.createContext(env);
 vm.runInContext('const APP_VER="v3.7.0";'+fs.readFileSync('static/js/user-activity.js','utf8'),env);
 return {env,calls,listeners,store};
}
async function main(){
 {const o=okolina(()=>({error:null}));o.env.AndroidUpdate={};o.listeners.pointerdown({isTrusted:true});await new Promise(r=>setImmediate(r));
  assert.equal(o.calls.length,1);assert.equal(o.calls[0].name,'app_record_activity_ver');
  assert.equal(o.calls[0].args.p_app_ver,'v3.7.0');assert.equal(o.calls[0].args.p_platforma,'apk');assert.equal(o.store.size,0,'Aktivnost potvrđena');}
 {const o=okolina(()=>({error:null}));o.listeners.pointerdown({isTrusted:true});await new Promise(r=>setImmediate(r));
  assert.equal(o.calls[0].args.p_platforma,'web','Bez native mosta = webapp');}
 {const o=okolina(n=>n==='app_record_activity_ver'?{error:{code:'PGRST202'}}:{error:null});
  o.listeners.pointerdown({isTrusted:true});await new Promise(r=>setImmediate(r));
  assert.deepEqual(o.calls.map(c=>c.name),['app_record_activity_ver','app_record_activity_for_user'],'Bez migracije: stari put');
  assert.equal(o.store.size,0,'Aktivnost i dalje zabilježena');}
 // Admin prikaz nad stvarnim kodom
 const s=izvor();
 const fn=n=>{const i=s.indexOf('function '+n+'(');let d=0,j=s.indexOf('{',i);for(;;j++){if(s[j]==='{')d++;else if(s[j]==='}'&&!--d)break;}return s.slice(i,j+1);};
 const ctx={APP_VER:'v3.6.10',_escHtml:x=>String(x)};vm.createContext(ctx);
 vm.runInContext(fn('_admVerUsporedi')+fn('_admVerzijaHtml'),ctx);
 assert.equal(ctx._admVerUsporedi('v3.6.9','v3.6.10'),-1,'Numerički, ne leksikografski');
 assert.equal(ctx._admVerUsporedi('3.7.0','v3.7.0'),0);
 assert.match(ctx._admVerzijaHtml({app_version:'v3.6.9',platforma:'apk'}),/starija/);
 assert.match(ctx._admVerzijaHtml({app_version:'v3.6.9',platforma:'apk'}),/APK/);
 assert.doesNotMatch(ctx._admVerzijaHtml({app_version:'v3.6.10',platforma:'web'}),/starija/);
 assert.match(ctx._admVerzijaHtml({app_version:null}),/još nije javljena/);
 assert.match(ctx._admVerzijaHtml({}),/nije dostupan/);
 assert.match(s,/_admVerzijaHtml\(u\)/,'Kartica korisnika prikazuje verziju');
 console.log('OK app-verzija: slanje uz aktivnost, platforma, rezervni RPC, admin prikaz');
}
main().catch(e=>{console.error(e);process.exit(1)});
