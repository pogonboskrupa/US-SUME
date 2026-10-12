'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const timers=new Set(),sent=[],statuses=[];const root={};
const box={window:root,globalThis:root,Map,Promise,Uint8Array,AbortController,Error,
 setTimeout:(f,t)=>{const id=setTimeout(f,t);timers.add(id);return id;},clearTimeout:id=>{clearTimeout(id);timers.delete(id);},
 _loadmapStatus:t=>statuses.push(t),_sqlmapStatus:t=>statuses.push(t),
 fetch:async(url)=>{sent.push(url);return {ok:true,arrayBuffer:async()=>Uint8Array.from([137,80,78,71]).buffer};}};
vm.runInNewContext(fs.readFileSync('static/js/native-offline-maps.js','utf8'),box);const api=root.NativeOfflineMaps;
(async()=>{
 assert.equal(api.available(),false);assert.equal(api.handle({type:'load-idb',name:'legacy'}),null);
 assert.equal((await api.handle({type:'load-native',name:'missing',nativeId:'missing'})).ok,false);
 root.AndroidOfflineMaps={request:(id,text)=>{const msg=JSON.parse(text);sent.push(msg);queueMicrotask(()=>{api.reply(id,{progress:50,total:100});api.reply(id,{ok:true,fmt:'mbtiles',meta:{_nativeId:msg.nativeId}});});}};
 assert.equal((await api.handle({type:'load-idb',name:'first',meta:{_nativeId:'doc-id'}})).ok,true);
 assert.ok(statuses[0].includes('50%'));let tile=await api.handle({type:'tile',name:'first',z:13,x:4462,y:2940});assert.equal(tile.data[0],137);
 api.rename('first','renamed');assert.equal(api.handle({type:'tile',name:'first',z:13,x:1,y:1}),null);
 assert.equal((await api.handle({type:'tile',name:'renamed',z:13,x:4462,y:2940})).data[0],137);
 await api.handle({type:'close',name:'renamed'});assert.equal(api.handle({type:'tile',name:'renamed'}),null);
 await api.handle({type:'load-native',name:'reopened',nativeId:'doc-id'});await api.remove('doc-id');assert.equal(api.handle({type:'tile',name:'reopened'}),null);

 root.AndroidOfflineMaps.request=(id,text)=>{const msg=JSON.parse(text);queueMicrotask(()=>api.reply(id,{ok:true,meta:{_nativePages:true,_nativeSize:1500000000,_nativeId:msg.nativeId}}));};
 box._sqlWCallWorker=async msg=>{sent.push(msg);return {ok:true,fmt:'rmaps',meta:{_nativePages:true,_nativeId:msg.nativeId}};};
 await api.handle({type:'load-native',name:'candidate',nativeId:'pages-id'});await api.activate('candidate','protected-doc');
 assert.equal(api.handle({type:'tile',name:'protected-doc',z:13,x:1,y:1}),null,'Page documents use the SQL Worker tile engine');
 await api.handle({type:'close',name:'protected-doc'});assert.ok(sent.some(s=>s.type==='rename-live')&&sent.some(s=>s.type==='close'&&s.name==='protected-doc'));
 await api.clear();assert.equal(timers.size,0);console.log('Native maps: legacy fallthrough, absent Android, progress, binary tiles, rename, close, reopen, remove and clear — OK');
})().catch(e=>{for(const t of timers)clearTimeout(t);console.error(e);process.exitCode=1;});
