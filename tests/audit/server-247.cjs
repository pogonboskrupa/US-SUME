// Ručna reprodukcija postojećih problema, nije regresijski test željenog
// ponašanja. Pokretanje: node tests/audit/server-247.cjs
'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync('index.html','utf8');
function fn(name){
 const start=html.search(new RegExp('(?:async )?function '+name+'\\('));assert.ok(start>=0,name);
 let depth=0;for(let i=html.indexOf('{',start);i<html.length;i++){
  if(html[i]==='{')depth++;if(html[i]==='}'&&--depth===0)return html.slice(start,i+1);
 }throw Error('Nezatvorena funkcija '+name);
}
const tests=[];function test(name,run){tests.push([name,run]);}
function harness(names){
 const store=new Map(),requests=[],messages=[];
 const owned={id:'owned',korisnik_id:'me',clanovi:[]};
 const shared={id:'shared',korisnik_id:'other',clanovi:[{korisnik_id:'me'}]};
 const e={sbUser:{id:'me'},sbProfile:{odobren:true},_projekti:[owned,shared],_aktivniProjektId:'shared',
 _pdProjektId:'owned',_projLoadGen:0,_deletedProjektIds:new Set(),_serverPrimljenoBusy:false,
 navigator:{onLine:true},_mrezaSila(){},_applyProjektFields(){},_updVlakeMapVisibility(){},
 rndProjektiList(){},rndLog(){},updProjStats(){},_kvcPurgeStale(){},isSpdField:()=>false,isVodeci:()=>false,isAdmin:()=>false,
 showToast:m=>messages.push(m),console,closeDodajClanPanel(){},showProjektDetalji(){},
 sbLoadKolegeVlake:async()=>{},sbLoadProjekti:async()=>{},setTimeout,
 document:{getElementById:()=>({}),querySelectorAll:()=>[{value:'other'}]},
 localStorage:{getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,String(v)),removeItem:k=>store.delete(k)}};
 e._OL={PROJEKTI:'projects',loadQueue:()=>[],load:k=>JSON.parse(store.get(k)||'null'),save:(k,v)=>{store.set(k,JSON.stringify(v));return true;}};
 store.set('projects',JSON.stringify(e._projekti));
 e.sb={from(table){const call={table,op:'select',eqs:{}};const q={
  select(){return q;},insert(rows){call.op='insert';call.rows=rows;return q;},
  eq(k,v){call.eqs[k]=v;return q;},neq(){return q;},in(){return q;},order(){return q;},
  range(){return q;},then(ok,bad){requests.push(call);return Promise.resolve(e.reply(call)).then(ok,bad);}
 };return q;}};
 e.reply=()=>({data:[],error:null});vm.createContext(e);vm.runInContext(names.map(fn).join('\n'),e);
 return {e,store,requests,messages};
}
test('neposlan projekat ipak pokreće direktan INSERT članstva i dobiva 42501',async()=>{
 const h=harness(['confirmDodajClanove']);h.e._projekti[0]._pendingSync=true;
 h.e.reply=()=>({data:null,error:{code:'42501',message:'new row violates row-level security policy for table "projekt_clanovi"'}});
 await h.e.confirmDodajClanove();assert.equal(h.requests.length,1);assert.equal(h.requests[0].table,'projekt_clanovi');
 assert.equal(h.requests[0].op,'insert');assert.equal(h.requests[0].rows[0].projekt_id,'owned');
 assert.match(h.messages[0],/row-level security/);assert.equal(h.e._OL.loadQueue().length,0);
});
test('sbLoadProjekti zanemari grešku članstva i obriše keš vlaka dijeljenog projekta',async()=>{
 const h=harness(['_projektiVratiNeposlane','_kvcPurgeStale','sbLoadProjekti']);
 h.e._KVC_KEY='kvc';h.store.set('kvc',JSON.stringify({shared:{T1:{nm:'T1',pts:[[44,16],[44.1,16.1]]}}}));
 h.e.reply=c=>c.table==='projekti'?{data:[{id:'owned',korisnik_id:'me'}],error:null}:
  {data:null,error:{code:'42501',message:'Pristup odbijen'}};
 await h.e.sbLoadProjekti();assert.equal(h.e._projekti.length,1);assert.equal(h.e._projekti[0].id,'owned');
 assert.equal(h.e._aktivniProjektId,null);assert.equal(JSON.parse(h.store.get('projects')).length,1);
 assert.equal(h.store.get('kvc'),'{}');
});
test('prijem sa praznim RLS rezultatima potvrdi nula projekata i ukloni lokalno članstvo',async()=>{
 const h=harness(['serverPreuzmiDijeljeno']);h.e._serverPrimljenoRender=()=>{};
 const result=await h.e.serverPreuzmiDijeljeno();assert.equal(result.ok,true);assert.equal(result.count,0);
 assert.equal(h.e._projekti[1].clanovi.length,0);assert.match(h.messages[0],/Nema projekata/);
});
test('prijem na keširanom profilu bez potvrđene sesije ipak pokrene upite',async()=>{
 const h=harness(['serverPreuzmiDijeljeno']);h.e._serverPrimljenoRender=()=>{};h.e.sbUser._cachedStub=true;
 await h.e.serverPreuzmiDijeljeno();assert.equal(h.requests.length,2);
});
test('stvarna greška prijema vrati samo ok:false bez koda/uzroka',async()=>{
 const h=harness(['serverPreuzmiDijeljeno']);h.e._serverPrimljenoRender=()=>{};
 h.e.reply=()=>({data:null,error:{code:'42501',message:'Pristup odbijen'}});
 const r=await h.e.serverPreuzmiDijeljeno();assert.equal(r.ok,false);assert.equal(r.error,undefined);
 assert.equal(h.e._projekti[1].clanovi.length,1);assert.ok(!h.messages.some(m=>m.includes('42501')));
});
test('pojedinačne RLS greške GPS tačaka ostanu bez uzroka u povratnom rezultatu',async()=>{
 const h=harness(['_dozPosaljiPojedinacno','_isNetworkErr','_isAuthErr','_serverPrivremeno']);
 h.e._sendDozTrackPoint=async()=>({error:{code:'42501',message:'row-level security'}});
 const r=await h.e._dozPosaljiPojedinacno([{_qid:'a'},{_qid:'b'}]);
 assert.equal(r.ok.length,0);assert.equal(r.error,null);
});
test('PostgreSQL RLS kod 42501 se ispravno razlikuje od mrežnog prekida i JWT isteka',()=>{
 const h=harness(['_isNetworkErr','_isAuthErr']);
 assert.equal(h.e._isNetworkErr({code:'42501',message:'row-level security'}),false);
 assert.equal(h.e._isAuthErr({code:'42501',status:403}),false);
 assert.equal(h.e._isNetworkErr({message:'TypeError: Failed to fetch'}),true);
 assert.equal(h.e._isAuthErr({code:'PGRST301',status:401}),true);
});
(async()=>{for(const [name,run]of tests){await run();console.log('REPRODUCIRANO: '+name);}console.log(tests.length+' audit scenarija potvrđeno; aplikacija nije popravljena ovim testom.');})().catch(e=>{console.error(e);process.exitCode=1;});
