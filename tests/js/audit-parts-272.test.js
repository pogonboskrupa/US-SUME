'use strict';
// Stvarne funkcije potvrda, lažni odgovori: nema produkcijskih upisa.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync('index.html','utf8');
function fn(name){const start=source.search(new RegExp('(?:async )?function '+name+'\\('));assert.ok(start>=0,name);let depth=0;for(let i=source.indexOf('{',start);i<source.length;i++){if(source[i]==='{')depth++;if(source[i]==='}'&&--depth===0)return source.slice(start,i+1);}throw Error(name);}
function setup(){const calls=[],responses=[],e={console,sbUser:{id:'A'}};e.sb={rpc:async()=>e.rpcResult||{data:null,error:null},from(table){const c={table},q=new Proxy({}, {get(_,key){if(key==='then')return (ok,bad)=>{calls.push(c);return Promise.resolve(responses.shift()||{data:null,error:null}).then(ok,bad);};return (...args)=>{c[key]=args;return q;};}});return q;}};vm.createContext(e);vm.runInContext(['_serverPodaciJednaki','_serverInsertPotvrdjeno','_dozUpisiZonu','_dozTackaKljuc','_dozPosaljiKomad','_sendDozTrackPoint'].map(fn).join('\n'),e);return {e,calls,responses};}
(async()=>{
 const h=setup(),payload={id:'11111111-1111-4111-8111-111111111111',korisnik_id:'A',name:'Odjel',boundary_geojson:{type:'Polygon',coordinates:[[[16,44],[16.1,44],[16,44.1],[16,44]]]},created_at:'2026-10-09T10:00:00Z'};
 h.responses.push({error:{code:'23505'}},{data:{...payload,korisnik_id:'B'}});assert.equal((await h.e._serverInsertPotvrdjeno('projekti',payload)).error.code,'NO_CONFIRMATION');
 h.responses.push({error:{code:'23505'}},{data:{...payload,created_at:'2026-10-09T10:00:00+00:00',boundary_geojson:JSON.stringify(payload.boundary_geojson)}});assert.equal((await h.e._serverInsertPotvrdjeno('projekti',payload)).error,undefined);
 h.responses.push({data:{...payload,boundary_geojson:{type:'Polygon',coordinates:[]}}});assert.equal((await h.e._serverInsertPotvrdjeno('projekti',payload)).error.code,'NO_CONFIRMATION');
 h.responses.push({data:null,error:null});assert.equal((await h.e._serverInsertPotvrdjeno('doz_projects',payload)).error.code,'NO_CONFIRMATION');
 h.responses.push({error:{code:'22P02'}});const before=h.calls.length;assert.equal((await h.e._dozUpisiZonu(payload)).error.code,'22P02');assert.equal(h.calls.length,before+1); // valid UUID: ne izbacuj ID zbog druge loše kolone
 h.responses.push({error:{code:'22P02',message:'invalid input syntax for type bigint: '+payload.id}},{data:{...payload,id:77}});assert.equal((await h.e._dozUpisiZonu(payload)).data.id,77);
 const a={_qid:'a',user_id:'A',project_id:'P',latitude:44,longitude:16,recorded_at:'2026-10-09T10:00:00Z'},b={...a,_qid:'b'};
 h.responses.push({data:[]},{data:[a]});const r=await h.e._dozPosaljiKomad([a,b]);assert.deepEqual(Array.from(r.ok),['a','b']);assert.equal(h.calls.at(-1).insert[0].length,1); // dva receipt-a, jedna logička tačka
 h.responses.push({data:[]});assert.equal((await h.e._sendDozTrackPoint(a)).error.code,'NO_CONFIRMATION'); // RPC void bez potvrde čitanjem
 h.e.rpcResult={error:{code:'PGRST202'}};h.responses.push({data:[]},{data:[]});assert.equal((await h.e._sendDozTrackPoint(a)).error.code,'NO_CONFIRMATION');
 h.responses.push({data:[a]});assert.equal((await h.e._sendDozTrackPoint(a)).error,null);
 console.log('Audit 3/4 potvrde: konflikt vlasnika/sadržaja, povrat izgubljenog odgovora, UUID fallback, deduplikacija GPS i void RPC — OK');
})().catch(e=>{console.error(e);process.exit(1);});
