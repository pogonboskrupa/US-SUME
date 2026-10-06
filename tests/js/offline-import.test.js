'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync('index.html','utf8'),moduleSrc=fs.readFileSync('static/js/offline-import.js','utf8');
async function workerCase({short=false,quota=false,delay=false}={}){
 let revoked=0,closed=0,flushed=false,written=[],terminated=false,progress=[];
 const input=new Blob([new Uint8Array(5*1024*1024).fill(73)]);
 const handle={write(bytes,{at}){if(quota)throw Error('QuotaExceededError');written.push([at,bytes]);return short?bytes.length-1:bytes.length;},truncate(){},flush(){flushed=true;},getSize(){return input.size;},close(){closed++;}};
 const blobs=new Map();let seq=0;
 class Worker{
  constructor(url){this.url=url;}
  postMessage(m){Promise.resolve().then(async()=>{const source=await blobs.get(this.url).text();if(terminated)return;const self={postMessage:data=>{if(!terminated)this.onmessage({data});}};const navigator={storage:{getDirectory:async()=>({getFileHandle:async()=>({createSyncAccessHandle:async()=>{if(delay)await new Promise(r=>setTimeout(r,30));return handle;}})})}};vm.runInNewContext(source,{self,navigator,Uint8Array,Date,Error});await self.onmessage({data:m});});}
  terminate(){terminated=true;}
 }
 const window={Worker,URL:{createObjectURL:b=>{const id='blob:'+seq++;blobs.set(id,b);return id;},revokeObjectURL:()=>revoked++}};
 vm.runInNewContext(moduleSrc,{window,Blob,DOMException,Error});
 const job=window.OfflineMapImport.copy(input,'candidate',p=>progress.push(p));
 if(delay)job.cancel();
 if(short||quota||delay)await assert.rejects(job.promise,e=>delay?e.name==='AbortError':/Nepotpun|Quota/.test(e.message));else{assert.equal(await job.promise,input.size);assert.equal(written.length,2);assert.ok(written.every(([at,b])=>b.every(v=>v===73)));assert.ok(flushed);assert.equal(progress.at(-1).done,input.size);}
 assert.equal(revoked,1);if(!delay)assert.equal(closed,1,'Handle mora biti zatvoren prije završne poruke');
}
async function persistenceCase({failure=false,cancel=false}={}){
 const store={name:'test',opfs:true,opfsName:'previous.sqlmap'},files=new Set(['previous.sqlmap']);let resolveCopy,rejectCopy,published=0;
 const sl={name:'test',fmt:'rmaps',meta:{},saved:false},layers=[sl],last={value:JSON.stringify({type:'tl',key:'topo'})};
 const root={getFileHandle:async name=>({getFile:async()=>({size:100})}),removeEntry:async name=>files.delete(name)};
 const context={Map,Date,Math,JSON,Error,console,setTimeout,_sqlIdbOpen:async()=>({transaction:()=>({objectStore:()=>({get:()=>{const r={result:{...store}};queueMicrotask(()=>r.onsuccess());return r;}})})}),_sqlLayers:layers,_mainMiniDbs:{},_LASTMAP_KEY:'last',navigator:{storage:{getDirectory:async()=>root}},document:{getElementById:()=>null},localStorage:{getItem:()=>last.value},_saveLastMap:()=>{throw Error('Druga podloga ne smije biti promijenjena');},showToast:()=>{},_sqlmapRenderLayers:()=>{},_lsRenderSqlite:()=>{},OfflineMapImport:{copy(file,path,onProgress){files.add(path);onProgress({done:50});return{promise:new Promise((r,j)=>{resolveCopy=r;rejectCopy=j;}),cancel:()=>rejectCopy(new DOMException('Prekinuto','AbortError'))};}},_sqlWCall:async m=>{if(m.type==='idb-meta')return{ok:true,entry:{...store}};if(m.type==='idb-save-meta'){if(failure)return{ok:false,error:'Quota'};Object.assign(store,{opfsName:m.opfsName});published++;}return{ok:true};}};
 const block=html.slice(html.indexOf('const _sqlImports = new Map();'),html.indexOf('async function sqlmapLoadFile(file)'));
 vm.createContext(context);vm.runInContext(block+'\nthis.save=_sqlImportSave;this.cancel=_sqlImportCancel;this.jobs=_sqlImports;',context);
 const result=context.save({size:100},sl);await new Promise(r=>setImmediate(r));
 assert.equal(sl.saved,false);assert.equal(store.opfsName,'previous.sqlmap');assert.equal(context.jobs.size,1);
 if(cancel)await context.cancel('test');else resolveCopy(100);await result;
 assert.equal(published,failure||cancel?0:1);assert.equal(sl.saved,!(failure||cancel));assert.equal(context.jobs.size,0);
 if(failure||cancel){assert.equal(store.opfsName,'previous.sqlmap');assert.deepEqual([...files],['previous.sqlmap']);}else{assert.ok(files.has(store.opfsName));assert.ok(!files.has('previous.sqlmap'));}
 assert.deepEqual(JSON.parse(last.value),{type:'tl',key:'topo'});
}
(async()=>{for(const opts of [{},{short:true},{quota:true},{delay:true}])await workerCase(opts);for(const opts of [{},{failure:true},{cancel:true}])await persistenceCase(opts);console.log('Offline uvoz: stvarni worker/5 MB/4 MB blokovi, bytes, kratki upis, quota, cancel, trajnost i sigurna zamjena — 7 provjera OK');})().catch(e=>{console.error(e);process.exit(1);});
