/* Rad na terenu za sve prijavljene korisnike: lokalni pregled, bez novih mrežnih poziva. */
(function(root){
'use strict';
let query='',limit=20,selected='',lastCount=0,viewOwner=null;
const allowed=()=>!!sbUser?.id&&!!sbProfile;
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
 text('trn-profile-role',isAdmin()?'Administratorski teren':isSpdField()?'ŠPD US ŠUME · terenski nadzor':sbProfile.sumarija||'Terenski rad');
 const project=typeof _projekti!=='undefined'?_projekti.find(p=>p.id===_aktivniProjektId):null;
 text('trn-active-project',project?['Odjel '+(project.odjel||'—'),project.gj].filter(Boolean).join(' · '):'Bez aktivnog projekta');
 const explorer=root.Explorer,check=el('trn-explorer-toggle');if(check)check.checked=explorer?.enabledPreference??true;
 text('trn-explorer-state',explorer?.active?'Odredište: '+(explorer.destination?.name||'Odabrana lokacija'):'Odaberi odredište za prikaz u smjeru kretanja.');
 text('trn-explorer-open',explorer?.active?'Nastavi navođenje':'Odaberi odredište');
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
function open(){if(!allowed())return;closeMenuDropdown();switchTab('teren');el('teren-panel').scrollTop=0;}
function explorerToggle(on){if(!allowed())return;root.Explorer?.setPreference(!!on);render(false);}
function explorerOpen(){if(!allowed())return;switchTab('karta');if(root.Explorer?.active){root.Explorer.setExplorerEnabled(root.Explorer.enabledPreference);root.Explorer.setVisible(true);}else showGuideChoice();}
root.TerenWorkspace={open,explorerToggle,explorerOpen,render,rows,search,more,jump,note,measure};
})(window);
