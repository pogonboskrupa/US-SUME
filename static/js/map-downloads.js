/* Raster catalogue; Android owns all large downloads and SQLite bytes. */
(function(root){
  'use strict';
  const pending=new Map(),cards=new Map(),states=new Map(),busy=new Set(),installers=new Map();
  let seq=0,timer=null,polling=false,refreshing=false,catalog=[],installTail=Promise.resolve();
  // Admin izmjene prikaza (tabela karte_katalog): ključ = naziv fajla. Keširano za offline.
  const OVR_KEY='tvlake_karte_katalog_v1';
  let ovr=new Map();
  try{const j=JSON.parse(root.localStorage?.getItem(OVR_KEY)||'[]');if(Array.isArray(j))ovr=new Map(j.filter(r=>r&&typeof r.kljuc==='string').map(r=>[r.kljuc,r]));}catch(e){}
  const isAdmin=()=>{try{return !!(typeof sbProfile!=='undefined'&&sbProfile?.is_admin);}catch(e){return false;}};
  const ovrOf=s=>ovr.get(s.name)||null;
  const defTitle=s=>s.name.replace(/\.[^.]+$/,'').replace(/[_\s-]*github\b/ig,'').trim();
  async function loadOvr(){
    try{
      if(typeof sb==='undefined'||!sb||typeof sbUser==='undefined'||!sbUser||sbUser._cachedStub||!online())return;
      const {data,error}=await sb.from('karte_katalog').select('*');
      if(error||!Array.isArray(data))return;
      ovr=new Map(data.map(r=>[r.kljuc,r]));
      try{root.localStorage?.setItem(OVR_KEY,JSON.stringify(data));}catch(e){}
    }catch(e){}
  }
  async function saveOvr(s,patch){
    const cur=ovrOf(s)||{};const n={sakriveno:!!cur.sakriveno,naziv:cur.naziv||null,opis:cur.opis||null,redoslijed:cur.redoslijed??null,...patch};
    if(typeof sb==='undefined'||!sb||!online()){if(typeof showToast==='function')showToast('⚠ Izmjena traži internet');return false;}
    const {error}=await sb.rpc('admin_set_karta_katalog',{p_kljuc:s.name,p_sakriveno:n.sakriveno,p_naziv:n.naziv,p_opis:n.opis,p_redoslijed:n.redoslijed});
    if(error){if(typeof showToast==='function')showToast('⚠ '+(/Pristup odbijen/i.test(error.message)?'Server ne prepoznaje admin prijavu — prijavi se ponovo':error.message));return false;}
    ovr.set(s.name,{kljuc:s.name,...n});
    try{root.localStorage?.setItem(OVR_KEY,JSON.stringify([...ovr.values()]));}catch(e){}
    render();return true;
  }
  async function adminSakrij(id){const s=source(id);if(!s)return;
    const sad=!!ovrOf(s)?.sakriveno;
    if(!sad&&!(await _dlgConfirm('Sakriti kartu "'+(ovrOf(s)?.naziv||defTitle(s))+'" iz popisa za sve korisnike? Fajl ostaje na serveru, a ti je možeš vratiti.',{title:'Sakrij kartu',okLabel:'Sakrij'})))return;
    await saveOvr(s,{sakriveno:!sad});}
  async function adminUredi(id){const s=source(id);if(!s)return;const o=ovrOf(s)||{};
    const naziv=await _dlgPrompt('Prikazni naziv (prazno = '+defTitle(s)+')',o.naziv||'',{title:'Uredi kartu',okLabel:'Dalje'});if(naziv===null||naziv===undefined)return;
    const opis=await _dlgPrompt('Opis ispod naziva (prazno = bez opisa)',o.opis||'',{title:'Uredi kartu',okLabel:'Dalje'});if(opis===null||opis===undefined)return;
    const red=await _dlgPrompt('Redoslijed u popisu (manji broj = ranije; prazno = zadano)',o.redoslijed??'',{title:'Uredi kartu',inputType:'text',inputMode:'numeric',okLabel:'Sačuvaj'});if(red===null||red===undefined)return;
    const rn=String(red).trim()===''?null:parseInt(red,10);
    if(rn!==null&&!Number.isFinite(rn)){if(typeof showToast==='function')showToast('⚠ Redoslijed mora biti broj');return;}
    if(String(naziv).length>120||String(opis).length>300){if(typeof showToast==='function')showToast('⚠ Naziv najviše 120, opis 300 znakova');return;}
    await saveOvr(s,{naziv:String(naziv).trim()||null,opis:String(opis).trim()||null,redoslijed:rn});}
  const sizeText=b=>b>=1e9?(b/1e9).toFixed(2).replace('.',',')+' GB':(Math.max(0,b)/1e6).toFixed(1).replace('.',',')+' MB';
  const active=s=>['resolving','downloading','paused','ready'].includes(s?.state);
  const available=()=>!!root.AndroidMapDownloads?.request;
  function online(){try{if(typeof root.AndroidMapDownloads?.networkAvailable==='function')return !!root.AndroidMapDownloads.networkAvailable();}catch(e){}return root.navigator?.onLine!==false;}
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
    c.innerHTML='<div class="lm-download-heading"><span class="lm-download-icon" aria-hidden="true"><svg viewBox="0 0 64 64" focusable="false"><use href="static/icons/navigation.svg#dm-load"/></svg></span><div><small>OFFLINE KARTA</small><h3 class="lm-download-title"></h3></div></div><div class="lm-download-meta"><span class="lm-download-size"></span><span class="lm-download-release" hidden></span></div><button type="button" class="lm-download-button">Skini kartu</button><progress class="lm-download-progress" aria-label="Napredak preuzimanja karte" hidden></progress><div class="lm-download-status" role="status" aria-live="polite"></div><button type="button" class="lm-secondary lm-download-cancel" hidden>Otkaži preuzimanje</button><div class="lm-download-opis" hidden></div><div class="lm-download-admin" hidden><button type="button" class="lm-secondary lm-adm-edit">✎ Uredi</button><button type="button" class="lm-secondary lm-adm-hide">Sakrij</button></div>';
    c.querySelector('.lm-download-button').id='loadmap-download-'+s.id;
    c.querySelector('.lm-download-button').onclick=()=>start(s.id);
    c.querySelector('.lm-download-cancel').onclick=()=>cancel(s.id);
    c.querySelector('.lm-adm-edit').onclick=()=>adminUredi(s.id);
    c.querySelector('.lm-adm-hide').onclick=()=>adminSakrij(s.id);
    container.appendChild(c);cards.set(s.id,c);return c;
  }
  function render(){
    const note=el('loadmap-download-notification-note');
    if(note)try{note.hidden=typeof root.AndroidMapDownloads?.notificationsEnabled!=='function'||root.AndroidMapDownloads.notificationsEnabled();}catch(e){note.hidden=true;}
    const adm=isAdmin();
    const sorted=catalog.filter(s=>adm||!ovrOf(s)?.sakriveno).sort((a,b)=>{const ra=ovrOf(a)?.redoslijed,rb=ovrOf(b)?.redoslijed;return (ra??1e9)-(rb??1e9);});
    const visible=new Map(sorted.map(s=>[s.id,s]));
    for(const [id,r]of states)if(active(r.status)||installers.has(id))visible.set(id,visible.get(id)||r.source);
    for(const [id,c]of cards)if(!visible.has(id)){c.remove();cards.delete(id);}
    for(const [id,s]of visible){
      const c=card(s);if(!c)continue;const status=states.get(id)?.status||{state:'idle'},installing=installers.has(id);
      const o=ovrOf(s);
      c.querySelector('.lm-download-title').textContent=(o?.naziv)||defTitle(s);
      const opisEl=c.querySelector('.lm-download-opis');opisEl.textContent=o?.opis||'';opisEl.hidden=!o?.opis;
      const admEl=c.querySelector('.lm-download-admin');admEl.hidden=!adm;
      c.querySelector('.lm-adm-hide').textContent=o?.sakriveno?'Vrati u popis':'Sakrij';
      c.classList?.toggle('lm-skrivena',!!o?.sakriveno);
      c.querySelector('.lm-download-size').textContent=sizeText(s.size);
      const release=c.querySelector('.lm-download-release');release.textContent=(s.release||'').replace(/\bgithub\b/ig,'').replace(/^[\s·-]+|[\s·-]+$/g,'');release.hidden=!release.textContent;
      c.dataset.state=status.state;
      const button=c.querySelector('.lm-download-button'),text=c.querySelector('.lm-download-status'),progress=c.querySelector('.lm-download-progress'),stop=c.querySelector('.lm-download-cancel');
      let label='Skini kartu',message='';
      if(installing||status.state==='ready'){label='Dodajem kartu…';message='Pripremam kartu za korištenje…';}
      else if(status.state==='resolving'){label='Pripremam preuzimanje…';message='Povezujem se s kartom…';}
      else if(['downloading','paused'].includes(status.state)){
        const total=status.total>0?status.total:s.size,bytes=Math.max(0,status.bytes||0),percent=Math.min(100,Math.floor(bytes/total*100));
        label=status.state==='paused'?'Preuzimanje pauzirano':'Preuzimanje · '+percent+'%';message=(status.state==='paused'?(status.message||'Čekam vezu — preuzimanje će se nastaviti.')+' ':'')+sizeText(bytes)+' / '+sizeText(total)+' · Možeš nastaviti koristiti aplikaciju.';
      }else if(status.state==='installed'){label='Prikaži kartu';message='✓ Spremna za korištenje bez interneta';}
      else if(status.state==='failed'){label='Pokušaj ponovo';message=status.error||'Preuzimanje nije uspjelo. Pokušaj ponovo.';}
      button.textContent=label;button.disabled=busy.has(id)||active(status)||installing||!available();
      if(text.textContent!==message)text.textContent=message;text.dataset.state=status.state;
      progress.hidden=!['downloading','paused'].includes(status.state);progress.max=status.total>0?status.total:s.size;progress.value=Math.max(0,status.bytes||0);
      stop.hidden=!active(status)||status.state==='ready'||installing;stop.disabled=busy.has(id);
    }
    const cont=el('loadmap-download-cards');
    if(cont)for(const [id] of visible){const c=cards.get(id);if(c&&c.parentNode===cont)cont.appendChild(c);}
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
    if(refreshing)return;refreshing=true;loadOvr().then(render);render();const message=el('loadmap-download-message');
    if(message)message.textContent=available()?'Provjeravam dostupne karte…':'Preuzimanje karata dostupno je u Android aplikaciji.';
    try{
      const cached=await request({type:'list',refresh:false});
      if(cached.ok){catalog=(cached.files||[]).filter(valid);render();}
      const offline=!online();
      const r=offline?cached:await request({type:'list',refresh:true});
      if(r.ok){catalog=(r.files||[]).filter(valid);if(message)message.textContent=r.stale?r.error:offline?(catalog.length?'Sačuvan popis karata · preuzimanje treba internet.':'Za pregled dostupnih karata uključi internet.') :!catalog.length?'Trenutno nema dostupnih karata.':'';}
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
    if(!online()){remember(s,{state:'failed',error:'Za skidanje karte uključi internet.'});return;}
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
