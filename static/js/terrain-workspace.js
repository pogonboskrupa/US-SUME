/* Teren za ŠPD i admina: lokalni pregled, bez novih mrežnih poziva. */
(function(root){
'use strict';
let query='',limit=20,selected='',lastCount=0,viewOwner=null;
const allowed=()=>typeof isAdmin==='function'&&isAdmin() || typeof isSpdField==='function'&&isSpdField();
const el=id=>document.getElementById(id);
function text(id,value){const e=el(id);if(e&&e.textContent!==String(value))e.textContent=value;}
function syncOwner(){
 const uid=sbUser?.id||null;if(uid===viewOwner)return;
 viewOwner=uid;query='';limit=20;selected='';lastCount=0;
 const input=el('trn-search');if(input)input.value='';text('trn-result-count','');
}
function render(full){
 syncOwner();
 if(!allowed())return;
 text('trn-profile-name',[sbProfile?.ime,sbProfile?.prezime].filter(Boolean).join(' ')||'Terenski pregled');
 text('trn-profile-role',isAdmin()?'Administratorski teren':'ŠPD US ŠUME · terenski nadzor');
 const fresh=!!(gpsOn&&lastP&&typeof _lastGpsFixTime!=='undefined'&&Date.now()-_lastGpsFixTime<=30000);
 text('trn-ready-gps',fresh?'Pozicija dostupna':gpsOn?'Čekam svjež signal':'GPS isključen');
 const gps=el('trn-ready-gps');if(gps)gps.dataset.state=fresh?'ok':'waiting';
 let sl=null;try{const key=_activeLayerKey();if(key?.startsWith('_sqlite_'))sl=_sqlLayers[Number(key.slice(8))];}catch(e){}
 text('trn-ready-map',sl?(sl.saved?'Lokalna karta spremna':'Karta otvorena · kopija u toku'):'Provjeri offline podlogu');
 text('trn-ready-map-name',sl?.name||'Učitaj kartu prije izlaska na teren');
 text('trn-ready-track',_tragOn?(_tragPaused?'Obilazak pauziran':'Obilazak se snima'):'Obilazak nije pokrenut');
 text('trn-ready-track-note',_tragOn?'Sačuvaj trag po završetku':'Pokreni Snimi trag za zapis kretanja');
 text('trn-stat-points',_tacke.length);text('trn-stat-tracks',_tragRegistry.length);text('trn-stat-measurements',_msrRegistry.length);
}
function rows(items,kind,label){
 syncOwner();
 if(selected!==kind){selected=kind;limit=20;}
 const matched=query?items.filter(r=>String(label(r)||'').toLocaleLowerCase().includes(query)):items;
 lastCount=matched.length;
 text('trn-result-count',matched.length?'Prikazano '+Math.min(limit,matched.length)+' od '+matched.length+(query?' rezultata':' zapisa'):'Nema rezultata za ovu pretragu');
 const button=el('trn-more');if(button)button.hidden=matched.length<=limit;
 return matched.slice(0,limit);
}
function search(value){query=String(value||'').trim().toLocaleLowerCase().slice(0,160);limit=20;_trnPodaciRender(true);}
function more(){limit=Math.min(lastCount,limit+20);_trnPodaciRender(true);}
function jump(id){el(id)?.scrollIntoView({block:'start',behavior:'auto'});}
async function note(){
 if(!allowed())return;
 if(!lastP){showToast('Uključi GPS prije bilježenja tačke.');return;}
 const owner=sbUser?.id,position={la:lastP.la,lo:lastP.lo};
 const name=await _dlgPrompt('Naziv zapažanja na ovoj poziciji','',{title:'Terensko zapažanje',okLabel:'Sačuvaj tačku'});
 if(name==null||!String(name).trim())return;
 if(sbUser?.id!==owner||!allowed()){showToast('Nalog je promijenjen — tačka nije dodana.');return;}
 _createTacka(position.la,position.lo,String(name).trim().slice(0,160));
 query='';limit=20;const input=el('trn-search');if(input)input.value='';
 terenSetTab('tacke');render(false);jump('trn-records');
}
function measure(mode){if(!allowed())return;switchTab('karta');_izmjeriPick(mode);}
root.TerenWorkspace={render,rows,search,more,jump,note,measure};
})(window);
