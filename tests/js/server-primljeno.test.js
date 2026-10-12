'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync('index.html','utf8');
function fn(name){const start=html.search(new RegExp('(?:async )?function '+name+'\\('));assert.ok(start>=0,name);
 let d=0;for(let i=html.indexOf('{',start);i<html.length;i++){if(html[i]==='{')d++;if(html[i]==='}'&&--d===0)return html.slice(start,i+1);}}
function env(){const store=new Map(),el={innerHTML:''},requests=[],messages=[];
 const e={sbUser:{id:'me'},sbProfile:{},_projekti:[{id:'shared',korisnik_id:'other',gj:'GJ',odjel:'105',clanovi:[{korisnik_id:'me'}]},
 {id:'owned',korisnik_id:'me',clanovi:[]},{id:'unrelated',korisnik_id:'other',clanovi:[]}],
 kolegeMap:{other:{ime:'Projektant Test'}},localStorage:{getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v)},
 document:{getElementById:()=>el},_escHtml:s=>String(s).replaceAll('<','&lt;').replaceAll('"','&quot;'),
 _aktivniProjektId:null,_serverPrimljenoBusy:false,navigator:{onLine:true},_mrezaSila(){},_OL:{PROJEKTI:'projects',save(){}},
 showToast:m=>messages.push(m),rndProjektiList(){},setTimeout:(f)=>{f();return 1;},
 _kvcSave:(id,rows)=>e._serverPrimljenoZapamti(id,rows)};
 const responses={projekt_clanovi:[{projekt_id:'shared'}],projekti:[{id:'shared',korisnik_id:'other',gj:'GJ',odjel:'105'}],
 vlake:[{id:'v1',projekt_id:'shared',korisnik_id:'other',nm:'T1',pts:[[44,16],[45,17]],updated_at:'2026-10-02'}]};
 e.sb={from(table){requests.push(table);let offset=0,end=Infinity;const q={select(){return q;},eq(){return q;},neq(){return q;},in(){return q;},order(){return q;},
 range(a,b){offset=a;end=b;return q;},then(ok,bad){return Promise.resolve(e.response?e.response(table):{data:responses[table],error:null}).then(r=>({...r,data:Array.isArray(r.data)?r.data.slice(offset,end+1):r.data})).then(ok,bad);}};return q;}};
 vm.createContext(e);vm.runInContext(['_vlakePreuzmiStranice','_serverPrimljenoKljuc','_serverPrimljenoUcitaj','_serverPrimljenoZapamti','_serverPrimljenoRender','serverPreuzmiDijeljeno'].map(fn).join('\n'),e);
 return {e,store,el,requests,messages};}
const row={id:'v1',nm:'T1',korisnik_id:'other',pts:[[44,16],[45,17]],updated_at:'2026-10-02'};
const tests=[];const test=(n,f)=>tests.push([n,f]);
test('prikazuje dodanu vlaku vlasnika projekta, ime i projekat',()=>{const h=env();h.e._serverPrimljenoZapamti('shared',[row]);
 assert.equal(h.e._serverPrimljenoUcitaj().length,1);assert.match(h.el.innerHTML,/T1/);assert.match(h.el.innerHTML,/Projektant Test/);assert.match(h.el.innerHTML,/105/);});
test('vlastite vlake i tuđi projekti bez članstva nisu u pregledu',()=>{const h=env();
 for(const id of ['unrelated'])h.e._serverPrimljenoZapamti(id,[row]);h.e._serverPrimljenoZapamti('shared',[{...row,korisnik_id:'me'}]);
 assert.equal(h.e._serverPrimljenoUcitaj().length,0);});
test('ponovljeno preuzimanje ne dodaje duplikat; izmjena dobije oznaku ažurirano',()=>{const h=env();
 h.e._serverPrimljenoZapamti('shared',[row]);h.e._serverPrimljenoZapamti('shared',[row]);assert.equal(h.e._serverPrimljenoUcitaj().length,1);
 h.e._serverPrimljenoZapamti('shared',[{...row,updated_at:'2026-10-03'}]);assert.equal(h.e._serverPrimljenoUcitaj()[0].vrsta,'Ažurirano');});
test('pregled radi offline bez zahtjeva i izolovan je po nalogu',()=>{const h=env();h.e._serverPrimljenoZapamti('shared',[row]);
 h.e.navigator.onLine=false;h.e._serverPrimljenoRender();assert.match(h.el.innerHTML,/T1/);assert.equal(h.requests.length,0);
 h.e.sbUser={id:'next'};h.e._serverPrimljenoRender();assert.doesNotMatch(h.el.innerHTML,/T1/);});
test('ručno preuzimanje samo čita server i pamti sažetak dijeljenih podataka',async()=>{const h=env();await h.e.serverPreuzmiDijeljeno();
 assert.deepEqual(h.requests,['projekt_clanovi','projekti','projekti','vlake','vlake']);assert.equal(h.e._serverPrimljenoUcitaj().length,1);assert.equal(h.e._serverPrimljenoBusy,false);});
test('mrežni pad zadržava prethodni pregled i ne javlja uspjeh',async()=>{const h=env();h.e._serverPrimljenoZapamti('shared',[row]);
 h.e.response=()=>({error:{message:'fetch failed'}});await h.e.serverPreuzmiDijeljeno();assert.equal(h.e._serverPrimljenoUcitaj().length,1);
 assert.ok(h.messages.some(m=>m.includes('nije uspjelo')));});
test('realtime grupiše događaje u jedan upis po projektu',()=>{const h=env();const timers=[],saves=[];
 h.e.setTimeout=f=>{timers.push(f);return timers.length;};h.e._kvcSave=(id,rows)=>saves.push({id,rows});
 vm.runInContext('let _serverPrimljenoRtTimer=null;const _serverPrimljenoRtRows=new Map();'+fn('_serverPrimljenoRealtime'),h.e);
 h.e._serverPrimljenoRealtime({...row,projekt_id:'shared'});h.e._serverPrimljenoRealtime({...row,projekt_id:'shared',updated_at:'next'});
 assert.equal(timers.length,1);timers[0]();assert.equal(saves.length,1);assert.equal(saves[0].rows.length,1);
 assert.equal(saves[0].rows[0].updated_at,'next');});
test('realtime nakon promjene naloga ne upisuje stari odgovor',()=>{const h=env();const timers=[];
 h.e.setTimeout=f=>{timers.push(f);return timers.length;};
 vm.runInContext('let _serverPrimljenoRtTimer=null;const _serverPrimljenoRtRows=new Map();'+fn('_serverPrimljenoRealtime'),h.e);
 h.e._serverPrimljenoRealtime({...row,projekt_id:'shared'});h.e.sbUser={id:'next'};timers[0]();assert.equal(h.store.size,0);});
test('promjena korisnika dok odgovor putuje ne kešira podatke za novi nalog',async()=>{const h=env();h.e.response=()=>{h.e.sbUser={id:'next'};return{data:[],error:null};};
 await h.e.serverPreuzmiDijeljeno();assert.equal(h.e._serverPrimljenoUcitaj().length,0);assert.equal(h.requests.length,1);});
(async()=>{let failed=0;for(const[n,f]of tests){try{await f();console.log('OK '+n);}catch(e){failed++;console.log('FAIL '+n+': '+e.message);}}
 console.log(`${tests.length-failed}/${tests.length}`);if(failed)process.exitCode=1;})();

