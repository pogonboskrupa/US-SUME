/* Fixed-source Android downloads. No raster bytes enter the WebView heap. */
(function(root){
  'use strict';
  const pending=new Map();let seq=0,timer=null,busy=false,installing=false,last={state:'idle'};
  const available=()=>!!root.AndroidMapDownloads?.request;
  const el=id=>root.document?.getElementById(id);
  function request(msg){
    if(!available())return Promise.resolve({ok:false,error:'Preuzimanje karte dostupno je u Android aplikaciji.'});
    return new Promise(resolve=>{
      const id=++seq,t=setTimeout(()=>{pending.delete(id);resolve({ok:false,error:'Veza s preuzimanjem nije odgovorila. Pokušaj ponovo.'});},30000);
      pending.set(id,{resolve,t});try{root.AndroidMapDownloads.request(id,JSON.stringify(msg));}
      catch(e){clearTimeout(t);pending.delete(id);resolve({ok:false,error:e.message});}
    });
  }
  function reply(id,result){const p=pending.get(id);if(p){clearTimeout(p.t);pending.delete(id);p.resolve(result);}}
  function render(s){
    last=s;const button=el('loadmap-unsko-download'),status=el('loadmap-unsko-status'),progress=el('loadmap-unsko-progress'),cancel=el('loadmap-unsko-cancel');
    const active=['resolving','downloading','paused','ready'].includes(s.state)||installing;
    let text='',label='Skini kartu';
    if(!available())text='Preuzimanje je dostupno u Android aplikaciji.';
    else if(installing||s.state==='ready'){text='Pripremam kartu za korištenje…';label='Dodajem kartu…';}
    else if(s.state==='resolving'){text='Povezujem se s kartom…';label='Pripremam preuzimanje…';}
    else if(s.state==='downloading'||s.state==='paused'){
      const bytes=Math.max(0,s.bytes||0),total=s.total>0?s.total:1567670272;
      text=(s.state==='paused'?'Čekam vezu — preuzimanje će se nastaviti. ':'Preuzimam: ')+(bytes/1e9).toFixed(2)+' / '+(total/1e9).toFixed(2)+' GB';label='Preuzimanje u toku…';
    }else if(s.state==='installed'){text='✓ Spremna za korištenje bez interneta';label='Prikaži kartu';}
    else if(s.state==='failed'){text=s.error||'Preuzimanje nije uspjelo. Pokušaj ponovo.';label='Pokušaj ponovo';}
    if(button){button.textContent=label;button.disabled=active||busy||!available();}
    if(status){status.textContent=text;status.dataset.state=s.state;}
    if(progress){progress.hidden=!['downloading','paused'].includes(s.state);progress.max=s.total>0?s.total:1567670272;progress.value=Math.max(0,s.bytes||0);}
    if(cancel){cancel.hidden=!active||installing||s.state==='ready';cancel.disabled=busy;}
  }
  function schedule(s){clearTimeout(timer);timer=null;if(['resolving','downloading','paused','ready'].includes(s.state))timer=setTimeout(()=>resume(),1500);}
  async function install(s){
    if(installing||!s.file?.nativeId)return s;
    installing=true;render(s);
    try{
      const list=await _sqlWCall({type:'list'});
      if(!list.ok)throw Error('Ne mogu otvoriti popis karata. Pokušaj ponovo.');
      // Completion and catalogue commit may straddle a process restart. Never re-import or overwrite a renamed map.
      if(!(list.rows||[]).some(m=>m.meta?._nativeId===s.file.nativeId))await sqlmapLoadFile(s.file);
      const result=await request({type:'installed',nativeId:s.file.nativeId});if(!result.ok)throw Error(result.error);
      return result;
    }catch(e){return {state:'failed',error:'Karta nije dodana: '+e.message};}
    finally{installing=false;}
  }
  async function resume(){
    if(busy||installing)return;busy=true;
    try{
      let s=await request({type:'status'});if(!s.ok)s={state:'failed',error:s.error};
      if(s.state==='ready')s=await install(s);
      last=s;schedule(s);
    }finally{busy=false;render(last);}
  }
  async function start(){
    if(busy||installing)return;clearTimeout(timer);timer=null;
    if(last.state==='installed'){
      const list=await _sqlWCall({type:'list'}),map=(list.rows||[]).find(m=>m.meta?._nativeId===last.file?.nativeId);
      if(map){await _loadmapShow(map.name);return;}
      // A deleted catalogue entry is not an installed map. Re-register the verified native file.
      await install({state:'ready',file:last.file});return resume();
    }
    if(root.navigator?.onLine===false){render({state:'failed',error:'Za skidanje karte uključi internet.'});return;}
    busy=true;render({state:'resolving'});
    try{let s=await request({type:'start'});if(!s.ok)s={state:'failed',error:s.error};if(s.state==='ready')s=await install(s);last=s;schedule(s);}
    finally{busy=false;render(last);}
  }
  async function cancel(){if(busy||installing)return;clearTimeout(timer);timer=null;busy=true;
    try{const s=await request({type:'cancel'});last=s.ok?s:{state:'failed',error:s.error};}finally{busy=false;render(last);}}
  root.MapDownloads={available,request,reply,resume,start,cancel};
})(typeof window!=='undefined'?window:globalThis);
