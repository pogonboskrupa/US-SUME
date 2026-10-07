'use strict';
const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const elements=new Map(),calls=[],timers=new Map();let seq=0,state={ok:true,state:'idle'},rows=[],imports=0,shows=0;
for(const id of ['download','status','progress','cancel'])elements.set('loadmap-unsko-'+id,{dataset:{}});
const root={document:{getElementById:id=>elements.get(id)},navigator:{onLine:true}};
const box={window:root,Map,Promise,Error,setTimeout:(f,t)=>{const id=++seq;timers.set(id,{f,t});return id;},clearTimeout:id=>timers.delete(id),
 _sqlWCall:async()=>({ok:true,rows}),sqlmapLoadFile:async f=>{imports++;rows=[{name:'Unsko_2021-2031',meta:{_nativeId:f.nativeId}}];},_loadmapShow:async()=>{shows++;}};
vm.runInNewContext(fs.readFileSync('static/js/map-downloads.js','utf8'),box);const api=root.MapDownloads;
root.AndroidMapDownloads={request:(id,text)=>{const m=JSON.parse(text);calls.push(m);if(m.type==='start')state={ok:true,state:'downloading',bytes:42,total:100};if(m.type==='installed')state={...state,state:'installed'};if(m.type==='cancel')state={ok:true,state:'idle'};queueMicrotask(()=>api.reply(id,state));}};
(async()=>{
 await api.resume();root.navigator.onLine=false;await api.start();assert.equal(calls.filter(m=>m.type==='start').length,0);
 root.navigator.onLine=true;await api.start();assert.equal(elements.get('loadmap-unsko-progress').value,42);
 state={...state,state:'paused'};await api.resume();assert.match(elements.get('loadmap-unsko-status').textContent,/Čekam vezu/);
 await api.cancel();assert.equal(elements.get('loadmap-unsko-progress').hidden,true);
 state={ok:true,state:'ready',file:{name:'Unsko_2021-2031.sqlitedb',nativeId:'map-id',size:100}};
 await Promise.all([api.resume(),api.resume()]);assert.equal(imports,1);assert.equal(calls.filter(m=>m.type==='installed').length,1);
 await api.resume();assert.equal(imports,1);await api.start();assert.equal(shows,1);
 // Crash after catalogue commit, before ack: same native ID under a user-renamed title must survive.
 state={...state,state:'ready'};rows=[{name:'Moja preimenovana karta',meta:{_nativeId:'map-id'}}];await api.resume();assert.equal(imports,1);assert.equal(rows[0].name,'Moja preimenovana karta');
 state={ok:true,state:'ready',file:{nativeId:'other-id'}};box.sqlmapLoadFile=async()=>{throw Error('Baza nije rasterska karta');};await api.resume();assert.match(elements.get('loadmap-unsko-status').textContent,/nije dodana/);assert.equal(elements.get('loadmap-unsko-download').disabled,false);
 assert.equal([...timers.values()].filter(t=>t.t===30000).length,0);
 console.log('Download: offline gate, progress, pause/cancel, automatic installation once, restart/rename reconciliation, invalid-file failure — OK');
})().catch(e=>{console.error(e);process.exitCode=1;});
