'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync('index.html','utf8');
function fn(n){const start=html.search(new RegExp('(?:async )?function '+n+'\\('));let d=0;for(let i=html.indexOf('{',start);i<html.length;i++){if(html[i]==='{')d++;if(html[i]==='}'&&--d===0)return html.slice(start,i+1);}throw Error(n);}
function setup(type, result, switchOwner=false){
 const op={type,_qid:'q1',_uid:'u1',payload:{id:'id',_tempId:'id',status:'active'}};
 const store=new Map([['q',JSON.stringify([op])]]),errors=[],calls=[];
 const env={sbUser:{id:'u1'},sbProfile:{},_serverSlanjeDozvoljeno:()=>true,_serverSaljem:true,
 _updSyncBadgeUskoro(){},_updSyncBadge(){},_mrezaProbaj:()=>true,_SERVER_SAMO_LOKALNO:new Set(),
 _DOZ_TRACK_BUF_KEY:'gps',_genUUID:()=> 'g',showToast(){},console,setTimeout(){},
 localStorage:{getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v)},
 _OL:{QUEUE:'q',loadQueue:()=>JSON.parse(store.get('q')),removeFromQueue:()=>store.set('q','[]'),
 bumpRetry:(k,n,e)=>{errors.push(e);return false;},odgodi(){},load:()=>[],save:()=>{calls.push('save');}},
 vlake:[],_projekti:[],_aktivniProjektId:null,_dozMarkings:[],_dozOdjeli:[],_dozSelId:null,
 _DOZ_TREES_DATA_KEY:'trees',DOZ_ENG_COLORS:['green'],_updVlakeMapVisibility(){},rndProjektiList(){},
 sb:{from:table=>{calls.push(table);const q={};for(const k of ['update','eq','select','insert','single'])q[k]=()=>q;
 q.then=(r,j)=>{if(switchOwner)env.sbUser={id:'u2'};return Promise.resolve(result).then(r,j);};return q;}}
 };
 vm.createContext(env);vm.runInContext('let _syncInProgress=false,_syncRerun=false,_syncMrezaPalaU=0,_syncOdgodaT=null;const _SYNC_PAUZA_MS=20000;'+['_isNetworkErr','_isAuthErr','_serverPrivremeno','_processOfflineQueue'].map(fn).join('\n'),env);
 return{env,store,errors,calls,run:()=>env._processOfflineQueue(true)};
}
const tests=[];function test(n,f){tests.push([n,f]);}
test('nepoznata operacija ostaje u redu s objašnjenjem',async()=>{const h=setup('future_operation',{});await h.run();assert.equal(JSON.parse(h.store.get('q')).length,1);assert.equal(h.errors[0]?.code,'UNSUPPORTED_OPERATION');assert.equal(h.calls.length,0);});
for(const type of ['upsert_doz_status','delete_doz_marking']){
 test(type+': nula izmijenjenih redova nije potvrda uspjeha',async()=>{const h=setup(type,{data:[],error:null});await h.run();assert.equal(JSON.parse(h.store.get('q')).length,1);assert.equal(h.errors[0]?.code,'NO_CONFIRMATION');});
 test(type+': potvrđen red se uklanja iz queue',async()=>{const h=setup(type,{data:[{id:'id'}],error:null});await h.run();assert.equal(h.store.get('q'),'[]');assert.equal(h.errors.length,0);});
}
for(const type of ['insert_projekt','insert_doz_project'])test(type+': odgovor starog naloga ne mijenja podatke novog',async()=>{const h=setup(type,{data:{id:'id'},error:null},true);await h.run();assert.equal(JSON.parse(h.store.get('q')).length,1);assert.equal(h.calls.includes('save'),false);assert.equal(h.calls.includes('doz_project_members'),false);});
test('ručno slanje ne nastavlja pod novim nalogom niti javlja lažni uspjeh',async()=>{
 let sends=0;const messages=[];
 const env={sbUser:{id:'u1'},sbProfile:{},navigator:{onLine:true},
 _serverSaljem:false,_syncInProgress:false,_syncMrezaPalaU:0,
 _flushAllPendingVlake:async()=>{},_retryOrphanVlake:async()=>{},
 _serverNaCekanju:()=>({stavki:1}),_SERVER_SAMO_LOKALNO:new Set(),
 _OL:{QUEUE:'q',loadQueue:()=>[{_uid:'u2',type:'insert_projekt'}]},localStorage:{setItem(){}},
 _mrezaSila(){},_serverSazetakRender(){},_updSyncBadge(){},
 showToast:m=>messages.push(m),setInterval:()=>1,clearInterval(){},
 document:{getElementById:()=>null},
 _processOfflineQueue:async()=>{sends++;env.sbUser={id:'u2'};}};
 vm.createContext(env);vm.runInContext(fn('serverPosalji'),env);await env.serverPosalji();
 assert.equal(sends,1);assert.equal(env._serverSaljem,false);
 assert.ok(messages.some(m=>m.includes('nalog')));
 assert.ok(!messages.some(m=>m.includes('Sve poslano')));
});
(async()=>{let failed=0;for(const[n,f]of tests){try{await f();console.log('OK '+n);}catch(e){failed++;console.log('FAIL '+n+': '+e.message);}}console.log(`${tests.length-failed}/${tests.length}`);if(failed)process.exitCode=1;})();

