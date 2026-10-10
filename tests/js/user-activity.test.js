'use strict';
const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
async function main(){
 let now=1000000,calls=[],listeners={},interval,answer={error:null};const store=new Map();
 const env={Date:class extends Date{static now(){return now;}},Map,Number,Promise,AbortController,console,clearTimeout,setTimeout,
 localStorage:{setItem:(k,v)=>store.set(k,v),getItem:k=>store.get(k)||null,removeItem:k=>store.delete(k)},navigator:{onLine:false},
 document:{visibilityState:'visible',addEventListener:(ev,fn)=>listeners[ev]=fn},addEventListener:(ev,fn)=>listeners[ev]=fn,setInterval:fn=>interval=fn,
 sbUser:{id:'A'},sb:{rpc:async(name,args)=>{calls.push({name,args,uid:env.sbUser.id});return answer;}},recOn:false,recPaused:false,_lastGpsFixTime:0};
 vm.createContext(env);vm.runInContext(fs.readFileSync('static/js/user-activity.js','utf8'),env);
 assert.equal(calls.length,0,'Prijava/otvaranje ne označava aktivnost');listeners.pointerdown({isTrusted:false});assert.equal(store.size,0);
 listeners.pointerdown({isTrusted:true});assert.equal(calls.length,0);assert.equal(store.get('dendro_activity_pending_v1:A'),String(now));
 env.sbUser={id:'B'};env.navigator.onLine=true;await env.UserActivity.flush();assert.equal(calls.length,0,'Tuđa offline aktivnost nije poslana za novi nalog');
 env.sbUser={id:'A'};await env.UserActivity.flush();assert.equal(calls.length,1);assert.equal(calls[0].name,'app_record_activity_for_user');assert.equal(calls[0].args.p_user_id,'A');assert.equal(Date.parse(calls[0].args.p_observed_at),now);assert.equal(store.size,0);
 now+=1000;listeners.keydown({isTrusted:true});await Promise.resolve();assert.equal(calls.length,1,'Slanje se ograničava na minutu');
 now+=61000;env.document.visibilityState='hidden';listeners.pointerdown({isTrusted:true});assert.equal(store.get('dendro_activity_pending_v1:A'),String(1001000));
 env.document.visibilityState='visible';env.recOn=true;env.recPaused=true;env._lastGpsFixTime=now;interval();await new Promise(resolve=>setImmediate(resolve));assert.equal(store.get('dendro_activity_pending_v1:A'),undefined,'Pauza nije nova aktivnost');
 now+=61000;env.recPaused=false;env._lastGpsFixTime=now;interval();await new Promise(resolve=>setImmediate(resolve));await Promise.resolve();assert.equal(calls.length,3,'Aktivno GPS snimanje bilježi rad bez dodira');
 console.log('OK activity: trusted work, offline owner, event timestamp, throttle, pause and fresh GPS');
}
main().catch(e=>{console.error(e);process.exit(1)});
