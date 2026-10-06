/* Kopiranje velike karte odvojeno od workera koji čita vidljive pločice. */
(function(root){
'use strict';
const source=`
self.onmessage=async({data:m})=>{
 let handle=null,writer=null,error=null;
 try{
  const dir=await navigator.storage.getDirectory(),file=await dir.getFileHandle(m.path,{create:true});
  if(file.createSyncAccessHandle)try{handle=await file.createSyncAccessHandle();}catch(e){if(e.name!=='NotSupportedError')throw e;}
  if(!handle)writer=await file.createWritable();
  // Synchronous file reads stay in this dedicated worker. Bigger blocks
  // reduce Android provider/Blob round trips without loading the whole map.
  let reader=typeof FileReaderSync==='function'?new FileReaderSync():null;
  const chunk=(reader?16:4)*1024*1024;let off=0,last=0;
  self.postMessage({type:'progress',done:0,total:m.file.size});
  while(off<m.file.size){
   const end=Math.min(off+chunk,m.file.size),part=m.file.slice(off,end);
   let bytes;
   try{bytes=reader?reader.readAsArrayBuffer(part):await part.arrayBuffer();}
   catch(e){if(!reader)throw e;reader=null;bytes=await part.arrayBuffer();}
   if(bytes.byteLength!==end-off)throw Error('Nepotpuno čitanje izvornog fajla');
   if(handle){if(handle.write(new Uint8Array(bytes),{at:off})!==bytes.byteLength)throw Error('Nepotpun upis karte');}
   else await writer.write(bytes);
   off+=bytes.byteLength;
   if(Date.now()-last>=250||off===m.file.size){last=Date.now();self.postMessage({type:'progress',done:off,total:m.file.size});}
  }
  if(handle){handle.truncate(off);handle.flush();if(handle.getSize()!==m.file.size)throw Error('Pogrešna veličina sačuvane karte');}
  else {await writer.close();writer=null;}
 }catch(e){error=e.message||String(e);}
 finally{
  if(handle)try{handle.close();}catch(e){}
  if(writer)try{await writer.abort();}catch(e){}
  self.postMessage(error?{type:'error',error}:{type:'done',bytes:m.file.size});
 }
};`;
function copy(file,path,onProgress){
 const url=root.URL.createObjectURL(new Blob([source],{type:'application/javascript'}));
 let worker,settled=false,rejectCopy;
 const promise=new Promise((resolve,reject)=>{
  rejectCopy=reject;
  function end(error,value){if(settled)return;settled=true;worker?.terminate();root.URL.revokeObjectURL(url);error?reject(error):resolve(value);}
  try{
   worker=new root.Worker(url);
   worker.onmessage=({data:d})=>{
    if(settled)return;
    if(d.type==='progress'){onProgress?.(d);return;}
    if(d.type==='done')end(null,d.bytes);
    if(d.type==='error')end(Error(d.error));
   };
   worker.onerror=e=>end(Error(e.message||'Čuvanje karte nije uspjelo'));
   worker.postMessage({file,path});
  }catch(e){end(e);}
 });
 return {promise,cancel(){if(settled)return;settled=true;worker?.terminate();root.URL.revokeObjectURL(url);rejectCopy(new DOMException('Uvoz prekinut','AbortError'));}};
}
root.OfflineMapImport={copy};
})(window);
