'use strict';
const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const elements=new Map(),calls=[],timers=new Map(),nodes=[];let seq=0,rows=[],imports=[],shows=0;
class Node {
 constructor(){this.dataset={};this.selectors=new Map();this.children=[];nodes.push(this);}
 set id(v){this._id=v;elements.set(v,this);}get id(){return this._id;}
 querySelector(s){if(!this.selectors.has(s))this.selectors.set(s,new Node());return this.selectors.get(s);}
 appendChild(c){this.children.push(c);}remove(){this.removed=true;}
}
for(const id of ['cards','refresh','message'])elements.set('loadmap-download-'+id,new Node());
const root={document:{getElementById:id=>elements.get(id),createElement:()=>new Node()},navigator:{onLine:true}};
const A='github-karte-v1-0-0',B='source-file-B-252';let files=[{id:A,name:'Unsko_2021-2031.mbtiles',size:1982578688,provider:'GitHub'},{id:B,name:'Druga.mbtiles',size:30000000}];
const known=files.slice(),states=new Map(files.map(s=>[s.id,{ok:true,state:'idle'}]));
const box={window:root,Map,Set,Promise,Error,Number,setTimeout:(f,t)=>{const id=++seq;timers.set(id,{f,t});return id;},clearTimeout:id=>timers.delete(id),
 _sqlWCall:async()=>({ok:true,rows}),sqlmapLoadFile:async f=>{imports.push(f);rows.push({name:f.name.replace(/\.[^.]+$/,''),meta:{_nativeId:f.nativeId}});},_loadmapShow:async()=>{shows++;}};
vm.runInNewContext(fs.readFileSync('static/js/map-downloads.js','utf8'),box);const api=root.MapDownloads;
root.AndroidMapDownloads={request:(id,text)=>{const m=JSON.parse(text);calls.push(m);let r;
 if(m.type==='notice')r={ok:true,open:!!root.noticeOpen},root.noticeOpen=false;else if(m.type==='list')r={ok:true,files};else if(m.type==='statuses')r={ok:true,files:known.map(s=>({...s,status:states.get(s.id)||{state:'idle'}}))};
 else {r=states.get(m.sourceId);if(m.type==='start')r={ok:true,state:'downloading',bytes:42,total:100};if(m.type==='installed')r={...r,state:'installed'};if(m.type==='cancel')r={ok:true,state:'idle'};states.set(m.sourceId,r);}
 queueMicrotask(()=>api.reply(id,r));}};
const card=id=>nodes.find(n=>n.dataset.sourceId===id&&!n.removed),status=id=>card(id).querySelector('.lm-download-status');
(async()=>{
 box.sbUser={id:'tester'};let opened=0;box.openLoadMapScreen=()=>opened++;root.noticeOpen=true;await api.openFromNotification();await api.openFromNotification();assert.equal(opened,1);
 await api.refresh();assert.equal(card(A).querySelector('.lm-download-size').textContent,'1,98 GB · GitHub');
 root.navigator.onLine=false;await api.start(A);assert.equal(calls.filter(m=>m.type==='start').length,0);
 root.navigator.onLine=true;await Promise.all([api.start(A),api.start(B)]);assert.equal(card(A).querySelector('.lm-download-progress').value,42);assert.match(card(A).querySelector('.lm-download-button').textContent,/42%/);
 states.set(A,{...states.get(A),state:'paused'});await api.resume();assert.match(status(A).textContent,/Čekam vezu/);
 await api.cancel(A);assert.equal(card(A).querySelector('.lm-download-progress').hidden,true);assert.equal(states.get(B).state,'downloading');
 // Both completions must install sequentially, exactly once; manual same-name map is retained.
 rows=[{name:'Unsko_2021-2031',meta:{_nativeId:'manual-map'}}];states.set(A,{ok:true,state:'ready',file:{name:files[0].name,nativeId:'map-A',size:files[0].size}});states.set(B,{ok:true,state:'ready',file:{name:files[1].name,nativeId:'map-B',size:files[1].size}});
 await Promise.all([api.resume(),api.resume()]);assert.equal(imports.length,2);assert.equal(rows[0].meta._nativeId,'manual-map');assert.notEqual(imports[0].name,files[0].name);
 await api.resume();assert.equal(imports.length,2);await api.start(A);assert.equal(shows,1);
 states.set(A,{...states.get(A),state:'ready'});rows.find(r=>r.meta._nativeId==='map-A').name='Preimenovana';await api.resume();assert.equal(imports.length,2);assert.equal(rows.find(r=>r.meta._nativeId==='map-A').name,'Preimenovana');
 files.push({id:'source-file-new-252',name:'Treća.mbtiles',size:32});await api.refresh();assert.ok(card('source-file-new-252'));files.pop();await api.refresh();assert.equal(card('source-file-new-252'),undefined);
 states.set(B,{...states.get(B),state:'downloading'});await api.resume();files=files.filter(s=>s.id!==B);await api.refresh();assert.ok(card(B));states.set(B,{state:'idle'});await api.resume();assert.equal(card(B),undefined,'Removed source terminal state clears its pending progress');
 states.set(A,{ok:true,state:'ready',file:{nativeId:'bad-map'}});box.sqlmapLoadFile=async()=>{throw Error('Baza nije rasterska karta');};await api.resume();assert.match(status(A).textContent,/nije dodana/);assert.equal(card(A).querySelector('.lm-download-button').disabled,false);
 assert.equal([...timers.values()].filter(t=>t.t===30000||t.t===60000).length,0);
 console.log('Folder downloads: new/removed maps, per-map pause/cancel, parallel transfers, serialized auto-install, same-title protection, restart/rename and invalid-file failure — OK');
})().catch(e=>{console.error(e);process.exitCode=1;});
