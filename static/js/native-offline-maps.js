/* Android SAF raster maps: metadata in the existing catalogue, bytes stay in the document. */
(function(root){
  'use strict';
  const pending=new Map(),loaded=new Map();let seq=0;
  const available=()=>!!root.AndroidOfflineMaps?.request;
  function request(msg){
    if(!available())return Promise.resolve({ok:false,error:'Ova karta je povezana s Android fajlom — odaberi je na ovom uređaju'});
    return new Promise(resolve=>{
      const id=++seq,timer=setTimeout(()=>{pending.delete(id);resolve({ok:false,error:'timeout'});},180000);
      pending.set(id,{resolve,timer});
      try{root.AndroidOfflineMaps.request(id,JSON.stringify(msg));}catch(e){clearTimeout(timer);pending.delete(id);resolve({ok:false,error:e.message});}
    });
  }
  function reply(id,result){
    const p=pending.get(id);if(!p)return;
    if(result.progress!=null){
      const percent=result.total>0?Math.floor(result.progress*100/result.total)+'%':Math.floor(result.progress/1048576)+' MB';
      const text='⏳ Čuvam kartu iz odabranog izvora: '+percent;
      if(typeof _loadmapStatus==='function')_loadmapStatus(text);
      if(typeof _sqlmapStatus==='function')_sqlmapStatus(text);
      return;
    }
    clearTimeout(p.timer);pending.delete(id);p.resolve(result);
  }
  function handle(msg){
    if(msg.type==='load-native'||(msg.type==='load-idb'&&msg.meta?._nativeId)){
      const nativeId=msg.nativeId||msg.meta._nativeId;
      return request({type:'open',nativeId}).then(r=>{if(r.ok)loaded.set(msg.name,nativeId);return r;});
    }
    const nativeId=loaded.get(msg.name);
    if(msg.type==='tile'&&nativeId)return (async()=>{
      const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),20000);
      try{
        const r=await fetch('/offline-maps/'+nativeId+'/'+msg.z+'/'+msg.x+'/'+msg.y,{signal:controller.signal,cache:'no-store'});
        return r.ok?{data:new Uint8Array(await r.arrayBuffer())}:r.status===404?{data:null}:{ok:false,error:'Greška čitanja karte'};
      }catch(e){return {ok:false,error:e.name==='AbortError'?'timeout':e.message};}finally{clearTimeout(timer);}
    })();
    if(msg.type==='close'&&nativeId){loaded.delete(msg.name);return request({type:'close',nativeId});}
    return null;
  }
  function rename(oldName,newName){if(loaded.has(oldName)){loaded.set(newName,loaded.get(oldName));loaded.delete(oldName);}}
  async function remove(nativeId){if(!nativeId)return;const r=await request({type:'remove',nativeId});if(!r.ok)throw Error(r.error);for(const [n,id]of loaded)if(id===nativeId)loaded.delete(n);}
  async function clear(){if(available()){const r=await request({type:'clear'});if(!r.ok)throw Error(r.error);}loaded.clear();}
  root.NativeOfflineMaps={available,request,reply,handle,rename,remove,clear};
})(typeof window!=='undefined'?window:globalThis);
