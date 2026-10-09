/* ŠPD lični profil: postojeći lokalni podaci i alati, bez mrežnih upita. */
(function(root){
'use strict';
let owner=null,opener=null;
const el=id=>document.getElementById(id);
const valid=()=>!!(sbUser&&sbProfile?.id===sbUser.id&&isSpdField()&&AccessPolicy.canUse(sbProfile));
function text(id,value){const e=el(id);if(e)e.textContent=String(value);}
function date(ts){const d=new Date(ts),pad=n=>String(n).padStart(2,'0');return Number.isFinite(d.getTime())?pad(d.getDate())+'.'+pad(d.getMonth()+1)+'.'+d.getFullYear()+'. u '+pad(d.getHours())+':'+pad(d.getMinutes()):'—';}
function close(restore=true){
 const panel=el('spd-profile');if(panel)panel.hidden=true;
 const wrapper=el('wrapper');if(wrapper&&owner!==null)wrapper.inert=false;
 owner=null;
 const focus=opener?.isConnected&&opener.getClientRects().length?opener:el('menu-btn');
 if(restore&&focus?.getClientRects().length)focus.focus();
 opener=null;
}
function sync(){
 const active=valid();document.documentElement.dataset.fieldRole=active?'spd':'other';
 for(const id of ['spd-menu-launch','trn-profile-open']){const e=el(id);if(e)e.hidden=!active;}
 for(const id of ['mdrop-upravljanje']){const e=el(id);if(e)e.hidden=active;}
 text('menu-project-section-title',active?'Zapisi i izvoz':'Projekti i izvoz');
 const sub=el('menu-context');if(sub)sub.textContent=active?'Teren, lični zapisi i karte':'Alati, projekti i aplikacija';
 if(!active||owner!==null&&owner!==sbUser.id){
  close(false);
  el('spd-profile')?.querySelectorAll('[data-spd-value]').forEach(e=>e.textContent='');
 }else if(owner!==null)render();
}
function render(){
 if(!valid()||owner!==sbUser.id){close(false);return;}
 const p=sbProfile,name=[p.ime,p.prezime].filter(Boolean).join(' ').trim()||'Terenski korisnik';
 text('spd-name',name);text('spd-avatar',[p.ime,p.prezime].filter(Boolean).map(s=>Array.from(String(s).trim())[0]||'').join('').slice(0,4)||'ŠPD');
 text('spd-unit',p.sumarija);text('spd-version',APP_VER);
 const access=AccessPolicy.state(p),trial=access.kind==='trial';
 const days=Math.ceil(access.remaining/86400000);
 text('spd-access-title',trial?'Probni pristup · još '+days+' '+(days===1?'dan':'dana'):access.allowed?'Pristup omogućen':'Pristup nije odobren');
 text('spd-access-note',trial?'Rok ističe '+date(access.expires)+'. Administrator treba odobriti nalog do tog roka.':access.allowed?'Tvoj nalog može koristiti terenske alate.':'Poveži se na internet da provjeriš status naloga.');
 el('spd-access').dataset.state=trial?'trial':access.allowed?'approved':'blocked';
 text('spd-points',_tacke.length);text('spd-tracks',_tragRegistry.length);text('spd-measurements',_msrRegistry.length);text('spd-photos',_locFotos.length);
 let shared=[];try{shared=_trnSharedLoad();}catch(e){}
 text('spd-projects',Array.isArray(shared)?shared.length:0);
 let sl=null;try{const key=_activeLayerKey();if(key?.startsWith('_sqlite_'))sl=_sqlLayers[Number(key.slice(8))];}catch(e){}
 text('spd-map-title',sl?sl.name||'Lokalna karta':'Nema aktivne lokalne karte');
 text('spd-map-note',sl?(sl.saved?'Kopija sačuvana na telefonu. Provjeri da karta pokriva područje rada.':'Karta je otvorena; spremanje kopije još traje. Sačekaj završetak prije zatvaranja aplikacije.'):'Otvori sačuvanu kartu ili učitaj datoteku za rad bez signala.');
 const fix=typeof _lastGpsFixTime==='undefined'?0:_lastGpsFixTime;
 text('spd-gps',!gpsOn?'Isključen':!lastP||!fix?'Čeka poziciju':Date.now()-fix>30000?'Pozicija zastarjela':lastP.ac!=null&&Number.isFinite(lastP.ac)?'Aktivan · ±'+Math.round(lastP.ac)+' m':'Aktivan · tačnost nepoznata');
 let net='nepoznato';try{net=_isOfflineMode?'nema':_netKvalitet();}catch(e){}
 text('spd-network',navigator.onLine===false||net==='nema'?'Bez interneta':net==='slaba'?'Slaba veza':net==='dobra'?'Veza dostupna':'Veza nije provjerena');
 let pending=0;try{pending=_serverNaCekanju().stavki;}catch(e){}
 text('spd-queue',pending?pending+' čeka slanje':'Nema izmjena za slanje');
 text('spd-sharing',_shareLiveOn?'Uključeno':'Isključeno');
 text('spd-recording',_tragOn?(_tragPaused?'Trag pauziran':'Trag se snima'):'Snimanje nije pokrenuto');
 const day=document.documentElement.dataset.fieldTheme==='day',theme=el('spd-theme');
 theme.setAttribute('aria-pressed',String(day));text('spd-theme-label',day?'Dnevni mod uključen':'Uključi Dnevni mod');
 text('spd-updated','Lokalni pregled · '+date(Date.now()));
}
function open(){
 if(!valid())return;
 closeMenuDropdown();opener=document.activeElement;owner=sbUser.id;
 el('spd-profile').hidden=false;render();el('spd-profile-scroll').scrollTop=0;
 el('wrapper').inert=true;el('spd-close').focus();
}
function action(kind){
 if(!valid()||owner!==sbUser.id){sync();return;}
 if(!AccessPolicy.canUse(sbProfile)){close(false);showToast('Pristup nalogu nije odobren.');return;}
 if(kind==='theme'){toggleFieldTheme();render();return;}
 if(kind==='refresh'){render();return;}
 close(false);
 if(['tacke','trag','msr'].includes(kind)){
  switchTab('teren');TerenWorkspace.search('');terenSetTab(kind);TerenWorkspace.jump('trn-records');
 }else if(kind==='photos'){switchTab('karta');openOznakePanel();_librarySearch('');_libraryFilter('photos');}
 else if(kind==='terrain')switchTab('teren');
 else if(kind==='maps'){switchTab('karta');_openLayerSheet();_lsTab('inst');}
 else if(kind==='project'){switchTab('teren');TerenWorkspace.jump('trn-resources');}
 else if(kind==='backup')_exportFieldRecovery().catch(()=>showToast('Kopija nije izrađena. Pokušaj ponovo.'));
 else if(kind==='queue')openSyncQueuePanel();
 else if(kind==='pin')promijeniPin();
 else if(kind==='update')azurirajAplikaciju();
}
document.addEventListener('keydown',e=>{
 if(owner===null)return;
 if(e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();close();}
 if(e.key==='Tab'){
  const buttons=Array.from(el('spd-profile').querySelectorAll('button,summary')).filter(b=>b.getClientRects().length);
  const first=buttons[0],last=buttons[buttons.length-1];
  if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}
  else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}
 }
},true);
for(const event of ['online','offline'])root.addEventListener(event,()=>{if(owner!==null)render();});
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&owner!==null)render();});
root.SpdProfile={open,close,sync,render,action};
sync();
})(window);
