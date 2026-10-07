/* Public folder catalogue; Android owns all large downloads and SQLite bytes. */
(function(root){
  'use strict';
  const pending=new Map(),cards=new Map(),states=new Map(),busy=new Set(),installers=new Map();
  let seq=0,timer=null,polling=false,refreshing=false,catalog=[],installTail=Promise.resolve();
  const sizeText=b=>b>=1e9?(b/1e9).toFixed(2).replace('.',',')+' GB':(Math.max(0,b)/1e6).toFixed(1).replace('.',',')+' MB';
  const active=s=>['resolving','downloading','paused','ready'].includes(s?.state);
  const available=()=>!!root.AndroidMapDownloads?.request;
  const el=id=>root.document?.getElementById(id);
  function request(msg){
    if(!available())return Promise.resolve({ok:false,error:'Preuzimanje karata dostupno je u Android aplikaciji.'});
    return new Promise(resolve=>{
      const id=++seq,t=setTimeout(()=>{pending.delete(id);resolve({ok:false,error:'Pregled karata nije odgovorio. Pokušaj ponovo.'});},msg.type==='list'?60000:30000);
      pending.set(id,{resolve,t});try{root.AndroidMapDownloads.request(id,JSON.stringify(msg));}
      catch(e){clearTimeout(t);pending.delete(id);resolve({ok:false,error:e.message});}
    });
  }
  function reply(id,result){const p=pending.get(id);if(p){clearTimeout(p.t);pending.delete(id);p.resolve(result);}}
  function valid(s){return s&&/^[\w-]{10,100}$/.test(s.id)&&typeof s.name==='string'&&Number.isSafeInteger(s.size)&&s.size>=16;}
  function source(id){return catalog.find(s=>s.id===id)||states.get(id)?.source;}
  function card(s){
    let c=cards.get(s.id);if(c)return c;
    const container=el('loadmap-download-cards');if(!container)return null;
    c=root.document.createElement('section');c.className='lm-download-card';c.dataset.sourceId=s.id;
    c.innerHTML='<div class="lm-download-heading"><span class="lm-download-icon" aria-hidden="true"><svg class="ic"><use href="#ic-uvezi"/></svg></span><div><small>KARTA ZA PREUZIMANJE</small><h3 class="lm-download-title"></h3></div></div><div class="lm-download-meta"><span class="lm-download-size"></span><span>Offline nakon preuzimanja</span></div><button type="button" class="lm-download-button">Skini kartu</button><progress class="lm-download-progress" aria-label="Napredak preuzimanja karte" hidden></progress><div class="lm-download-status" role="status" aria-live="polite"></div><button type="button" class="lm-secondary lm-download-cancel" hidden>Otkaži preuzimanje</button>';
    c.querySelector('.lm-download-button').id='loadmap-download-'+s.id;
    c.querySelector('.lm-download-button').onclick=()=>start(s.id);
    c.querySelector('.lm-download-cancel').onclick=()=>cancel(s.id);
    container.appendChild(c);cards.set(s.id,c);return c;
  }
  function render(){
    const note=el('loadmap-download-notification-note');
    if(note)try{note.hidden=typeof root.AndroidMapDownloads?.notificationsEnabled!=='function'||root.AndroidMapDownloads.notificationsEnabled();}catch(e){note.hidden=true;}
    const visible=new Map(catalog.map(s=>[s.id,s]));
    for(const [id,r]of states)if(active(r.status)||installers.has(id))visible.set(id,visible.get(id)||r.source);
    for(const [id,c]of cards)if(!visible.has(id)){c.remove();cards.delete(id);}
    for(const [id,s]of visible){
      const c=card(s);if(!c)continue;const status=states.get(id)?.status||{state:'idle'},installing=installers.has(id);
      c.querySelector('.lm-download-title').textContent=s.name.replace(/\.[^.]+$/,'');
      c.querySelector('.lm-download-size').textContent=sizeText(s.size);
      const button=c.querySelector('.lm-download-button'),text=c.querySelector('.lm-download-status'),progress=c.querySelector('.lm-download-progress'),stop=c.querySelector('.lm-download-cancel');
      let label='Skini kartu',message='';
      if(installing||status.state==='ready'){label='Dodajem kartu…';message='Pripremam kartu za korištenje…';}
      else if(status.state==='resolving'){label='Pripremam preuzimanje…';message='Povezujem se s kartom…';}
      else if(['downloading','paused'].includes(status.state)){
        const total=status.total>0?status.total:s.size,bytes=Math.max(0,status.bytes||0),percent=Math.min(100,Math.floor(bytes/total*100));
        label=status.state==='paused'?'Čekam internet…':'Preuzimanje · '+percent+'%';message=(status.state==='paused'?'Čekam vezu — preuzimanje će se nastaviti. ':'')+sizeText(bytes)+' / '+sizeText(total)+' · Možeš nastaviti koristiti aplikaciju.';
      }else if(status.state==='installed'){label='Prikaži kartu';message='✓ Spremna za korištenje bez interneta';}
      else if(status.state==='failed'){label='Pokušaj ponovo';message=status.error||'Preuzimanje nije uspjelo. Pokušaj ponovo.';}
      button.textContent=label;button.disabled=busy.has(id)||active(status)||installing||!available();
      if(text.textContent!==message)text.textContent=message;text.dataset.state=status.state;
      progress.hidden=!['downloading','paused'].includes(status.state);progress.max=status.total>0?status.total:s.size;progress.value=Math.max(0,status.bytes||0);
      stop.hidden=!active(status)||status.state==='ready'||installing;stop.disabled=busy.has(id);
    }
    const button=el('loadmap-download-refresh');if(button)button.disabled=refreshing||!available();
  }
  function remember(s,status){states.set(s.id,{source:s,status});render();}
  function schedule(){clearTimeout(timer);timer=null;if([...states.values()].some(r=>active(r.status)))timer=setTimeout(()=>resume(),1500);}
  function install(s,status){
    if(installers.has(s.id))return installers.get(s.id);
    const promise=installTail.then(async()=>{
      try{
        const list=await _sqlWCall({type:'list'});if(!list.ok)throw Error('Ne mogu otvoriti popis karata. Pokušaj ponovo.');
        if(!(list.rows||[]).some(m=>m.meta?._nativeId===status.file.nativeId)){
          // Same Drive title must never overwrite an unrelated local map.
          const file={...status.file},names=new Set((list.rows||[]).map(m=>m.name)),base=file.name.replace(/\.[^.]+$/,''),ext=file.name.slice(base.length);
          if(names.has(base)){let n=1,name;do{name=base+' ('+s.id.slice(-6)+(n>1?' '+n:'')+')';n++;}while(names.has(name));file.name=name+ext;}
          await sqlmapLoadFile(file);
        }
        const r=await request({type:'installed',sourceId:s.id,nativeId:status.file.nativeId});if(!r.ok)throw Error(r.error);return r;
      }catch(e){return {state:'failed',error:'Karta nije dodana: '+e.message};}
    });
    installers.set(s.id,promise);installTail=promise.catch(()=>{});render();
    return promise.finally(()=>{installers.delete(s.id);});
  }
  async function resume(){
    if(polling||!available())return;polling=true;
    try{
      const r=await request({type:'statuses'});if(!r.ok)return;
      for(const item of r.files||[]){
        if(!valid(item))continue;const s=source(item.id)||item;if(busy.has(s.id))continue;
        let status=item.status||{state:'idle'};remember(s,status);
        if(status.state==='ready'&&status.file?.nativeId)status=await install(s,status);
        remember(s,status);
      }
    }finally{polling=false;schedule();render();}
  }
  async function refresh(){
    if(refreshing)return;refreshing=true;render();const message=el('loadmap-download-message');
    if(message)message.textContent=available()?'Provjeravam dostupne karte…':'Preuzimanje karata dostupno je u Android aplikaciji.';
    try{
      const cached=await request({type:'list',refresh:false});
      if(cached.ok){catalog=(cached.files||[]).filter(valid);render();}
      const offline=root.navigator?.onLine===false;
      const r=offline?cached:await request({type:'list',refresh:true});
      if(r.ok){catalog=(r.files||[]).filter(valid);if(message)message.textContent=r.stale?r.error:offline?(catalog.length?'Sačuvan popis karata · preuzimanje treba internet.':'Za pregled dostupnih karata uključi internet.') :!catalog.length?'U folderu trenutno nema dostupnih karata.':'';}
      else if(message)message.textContent=r.error||'Pregled karata nije dostupan.';
    }finally{refreshing=false;render();}
    await resume();
  }
  async function start(id){
    const s=source(id);if(!s||busy.has(id)||installers.has(id))return;
    const previous=states.get(id)?.status;
    if(previous?.state==='installed'){
      const list=await _sqlWCall({type:'list'}),map=(list.rows||[]).find(m=>m.meta?._nativeId===previous.file?.nativeId);
      if(map){await _loadmapShow(map.name);return;}
      remember(s,await install(s,{state:'ready',file:previous.file}));return;
    }
    if(root.navigator?.onLine===false){remember(s,{state:'failed',error:'Za skidanje karte uključi internet.'});return;}
    busy.add(id);remember(s,{state:'resolving'});
    try{let r=await request({type:'start',sourceId:id});if(!r.ok)r={state:'failed',error:r.error};if(r.state==='ready'&&r.file?.nativeId)r=await install(s,r);remember(s,r);}
    finally{busy.delete(id);schedule();render();}
  }
  async function cancel(id){const s=source(id);if(!s||busy.has(id)||installers.has(id))return;busy.add(id);render();
    try{const r=await request({type:'cancel',sourceId:id});remember(s,r.ok?r:{state:'failed',error:r.error});}finally{busy.delete(id);schedule();render();}}
  async function openFromNotification(){
    if(!available()||typeof sbUser==='undefined'||!sbUser)return;
    const r=await request({type:'notice'});if(r.ok&&r.open&&typeof openLoadMapScreen==='function')openLoadMapScreen();
  }
  function notificationSettings(){root.AndroidMapDownloads?.notificationSettings?.();}
  root.MapDownloads={notificationSettings,available,request,reply,resume,refresh,start,cancel,openFromNotification};
})(typeof window!=='undefined'?window:globalThis);
