// Server: pregled projekta iz lokalnih podataka; mreža samo na izričit zahtjev.
(function () {
  'use strict';
  let scope = '', active = '', search = '', author = '', page = 0;
  const size = 60, byId = id => document.getElementById(id), esc = s => _escHtml(String(s ?? ''));
  const currentUid = () => sbUser?.id || '';
  function allowed() {
    const uid = currentUid();
    if (!uid) return [];
    return (_projekti || []).filter(p => p.korisnik_id === uid || (p.clanovi || []).some(c => c.korisnik_id === uid) ||
      (typeof isAdmin === 'function' && isAdmin()) || (typeof isVodeci === 'function' && isVodeci()));
  }
  function sync() {
    const uid = currentUid(), projects = allowed();
    if (scope !== uid) { scope = uid; active = ''; search = ''; author = ''; page = 0; }
    if (active !== (_aktivniProjektId || '')) { active = _aktivniProjektId || ''; search = ''; author = ''; page = 0; }
    return projects.find(p => p.id === active) || null;
  }
  function label(p) { return p ? [p.gj, p.odjel ? 'Odjel ' + p.odjel : '', p.datum].filter(Boolean).join(' · ') || 'Projekat' : 'Nije odabran projekat'; }
  function name(uid, row) {
    if (row?.projektant_ime) return row.projektant_ime;
    if (row?.ime) return row.ime;
    if (uid === currentUid()) return [sbProfile?.ime, sbProfile?.prezime].filter(Boolean).join(' ') || 'Ti';
    return kolegeMap?.[uid]?.ime || 'Projektant · ' + String(uid || '').slice(0, 8);
  }
  function metadata(id) {
    try { const m = JSON.parse(localStorage.getItem('tvlake_server_project_v1_' + currentUid() + '_' + id) || 'null');
      return m && Number.isFinite(m.ts) && Array.isArray(m.ids) ? m : null; }
    catch(e) { return null; }
  }
  function downloaded(id, rows) {
    const data = {ts:Date.now(), ids:rows.map(r => r.id).filter(Boolean)};
    try { localStorage.setItem('tvlake_server_project_v1_' + currentUid() + '_' + id, JSON.stringify(data)); return true; }
    catch(e) { return false; }
  }
  function length(pts) {
    if (!Array.isArray(pts) || pts.length < 2 || pts.some(p => !p || !Number.isFinite(p.la) || !Number.isFinite(p.lo) || Math.abs(p.la)>90 || Math.abs(p.lo)>180)) return null;
    return calcL(pts);
  }
  function metres(n) { return n == null ? '—' : Math.round(n).toLocaleString('bs-BA') + ' m'; }
  function model(projectId) {
    const project = projectId ? allowed().find(p=>p.id===projectId) : sync(), uid = currentUid();
    if (!project) return {project:null, rows:[], authors:[], total:0, incomplete:0, downloaded:null};
    const q = _OL.loadQueue().filter(op => !op._uid || op._uid === uid), items = new Map(), ids = new Map();
    const meta = metadata(project.id), currentIds = meta ? new Set(meta.ids) : null;
    function put(row, local = false) {
      if (!row || row.projekt_id !== project.id || !row.korisnik_id) return;
      const key = row.korisnik_id + '::' + row.nm, oldKey = row.id && ids.get(row.id), old = items.get(oldKey || key);
      if (oldKey && oldKey !== key) items.delete(oldKey);
      const value = {...old, ...row, id:row.id || old?.id || null, local:local || old?.local || false};
      items.set(key, value); if (value.id) ids.set(value.id,key);
    }
    (_OL.load(_OL.VLAKE) || []).forEach(r => put(r));
    _kvcLoad(project.id).forEach(r => put({...r, projekt_id:project.id}));
    q.filter(op => op.type === 'upsert_vlaka' && op.payload?.korisnik_id === uid).forEach(op => put(op.payload,true));
    (vlake || []).forEach((v,index) => {
      if(v._deleted || v.projektId!==project.id)return;
      put({id:v.sbId,korisnik_id:uid,projekt_id:v.projektId,nm:v.nm,br:v.br,kr:v.kr,pts:v.pts,projektant_ime:v.projektantIme,
        updated_at:v.updatedAt,boja:v.color,_pendingTimer:typeof _vlakaSaveTimers!=='undefined' && !!_vlakaSaveTimers[index]},true);
    });
    const rows = [...items.values()].map(r => {
      const pending = r.korisnik_id === uid && (!r.id || r._pendingTimer || q.some(o => o.type === 'upsert_vlaka' && o.payload?.korisnik_id === uid &&
        (o.payload.id && o.payload.id === r.id || o.payload.nm === r.nm && o.payload.projekt_id === project.id)));
      const deleting = q.some(o => o.type === 'delete_vlaka' && o.payload?.id === r.id);
      const stale = !!(currentIds && r.id && !currentIds.has(r.id));
      return {...r, ime:name(r.korisnik_id,r), metres:length(r.pts), pending, deleting, stale,
        status:deleting ? 'Brisanje čeka slanje' : pending ? 'Lokalno · za slanje' : stale ? 'Lokalna kopija · nije u zadnjem preuzimanju' : 'Preuzeto / potvrđeno'};
    }).sort((a,b) => String(a.nm).localeCompare(String(b.nm),'bs',{numeric:true}) || a.ime.localeCompare(b.ime,'bs'));
    const authors = new Map();
    for (const r of rows) { const a = authors.get(r.korisnik_id) || {id:r.korisnik_id,ime:r.ime,count:0,total:0,incomplete:0};
      a.count++; a.total += r.metres || 0; if(r.metres == null)a.incomplete++; authors.set(a.id,a); }
    return {project,rows,authors:[...authors.values()].sort((a,b)=>a.ime.localeCompare(b.ime,'bs')),total:rows.reduce((sum,r)=>sum+(r.metres || 0),0),incomplete:rows.filter(r=>r.metres == null).length,downloaded:meta};
  }
  function destination(op) {
    const payload = op.payload || {};
    let id = payload.projekt_id || payload.projektId || (op.type === 'insert_projekt' ? payload.id || payload._tempId : null);
    if(!id && payload.id) id=(vlake || []).find(v=>v.sbId===payload.id)?.projektId || (_OL.load(_OL.VLAKE) || []).find(r=>r.id===payload.id)?.projekt_id;
    const p = (_projekti || []).find(p=>p.id===id);
    const dozId=payload.project_id || (['insert_doz_project','upsert_doz_status'].includes(op.type)?payload.id:null) ||
      (op.type==='delete_doz_marking' && typeof _dozMarkings!=='undefined' ? _dozMarkings.find(m=>m.id===payload.id)?.project_id : null);
    const doz = (_dozOdjeli || []).find(p=>p.id===dozId);
    return {key:id?'project:'+id:dozId?'doz:'+dozId:'shared',label:p?label(p):doz?'Doznaka · '+doz.name:payload.odjel?'Odjel '+payload.odjel:id?'Projekat · '+id:dozId?'Doznaka · '+dozId:'Zajednički podaci',uid:payload.korisnik_id || payload.user_id || op._uid || currentUid()};
  }
  function opContext(op) {
    const dest=destination(op);
    return '<div class="sp-op-context"><b>U projekat: '+esc(dest.label)+'</b><span>Šalje: '+esc(name(dest.uid,op.payload))+'</span></div>';
  }
  function history() {
    try {const h=JSON.parse(localStorage.getItem('tvlake_server_transfers_v1_'+currentUid())||'{}');return h&&typeof h==='object'&&!Array.isArray(h)?h:{};}catch(e){return {};}
  }
  function confirmed(op,owner) {
    if(!_serverSaljem || owner!==currentUid())return;
    try {
      const dest=destination(op),h=history();
      h[dest.key]={ts:Date.now(),uid:owner,ime:name(owner),label:dest.label};
      const entries=Object.entries(h).sort((a,b)=>(b[1]?.ts||0)-(a[1]?.ts||0)).slice(0,100);
      localStorage.setItem('tvlake_server_transfers_v1_'+owner,JSON.stringify(Object.fromEntries(entries)));
    }catch(e){console.warn('Vrijeme slanja nije sačuvano',e);}
  }
  function timestamp(ts) {return Number.isFinite(ts)&&ts>0?new Date(ts).toLocaleString('bs-BA'):'Još nije potvrđeno';}
  function pendingGroups() {
    const uid=currentUid(),groups=new Map(),q=_OL.loadQueue().filter(o=>(!o._uid||o._uid===uid)&&!_SERVER_SAMO_LOKALNO.has(o.type));
    const add=(op,text)=>{const d=destination(op);if(!groups.has(d.key))groups.set(d.key,{...d,items:[]});groups.get(d.key).items.push(text);};
    const labels={upsert_vlaka:'Vlaka',delete_vlaka:'Brisanje vlake',insert_projekt:'Novi projekat',upsert_odjel:'Podaci odjela',insert_doz_project:'Novi odjel doznake',insert_doz_marking:'Nacrtana zona / oznaka doznake',delete_doz_marking:'Brisanje zone doznake',upsert_doz_status:'Status doznake',insert_pozari_arhiva:'Arhiva požara'};
    for(const op of q){const r=op.payload||{};add(op,(labels[op.type]||op.type)+(r.nm?' · '+r.nm:'')+(op.type==='upsert_vlaka'?' · '+metres(length(r.pts)):'')+(op._blocked?' · odbijeno, ponovni pokušaj':''));}
    (vlake||[]).forEach((v,i)=>{if(v._deleted||!v.projektId||v.sbId&&!(typeof _vlakaSaveTimers!=='undefined'&&_vlakaSaveTimers[i]))return;
      if(!q.some(o=>o.type==='upsert_vlaka'&&o.payload?.nm===v.nm&&o.payload?.projekt_id===v.projektId))add({payload:{projekt_id:v.projektId,korisnik_id:uid}},'Vlaka · '+v.nm+' · '+metres(length(v.pts)));});
    let points=[];
    try {points=typeof FieldStore!=='undefined'&&FieldStore.ready?FieldStore.view(uid):JSON.parse(localStorage.getItem(_DOZ_TRACK_BUF_KEY)||'[]').filter(p=>p.user_id===uid);}catch(e){}
    const gps=new Map();for(const p of points){const id=p.project_id;gps.set(id,(gps.get(id)||0)+1);}
    for(const [id,count] of gps)add({payload:{project_id:id,user_id:uid}},'Snimljeni pojas doznake · '+count+' GPS tačaka');
    return [...groups.values()];
  }
  function renderPending() {
    const el=byId('server-send-preview');if(!el)return;
    const groups=pendingGroups();
    const loading=typeof FieldStore!=='undefined'&&!FieldStore.ready;
    el.innerHTML='<h3 class="sp-section-heading">Šta će biti poslano</h3>'+(loading?'<p class="sp-note">Učitavanje lokalnog GPS dnevnika…</p>':'')+(groups.length?groups.map(g=>'<article class="sp-send-group"><small>U projekat</small><b>'+esc(g.label)+'</b><span>Šalje: '+esc(name(g.uid))+'</span><ul>'+g.items.slice(0,40).map(s=>'<li>'+esc(s)+'</li>').join('')+'</ul>'+(g.items.length>40?'<span>Još '+(g.items.length-40)+' stavki — pregledaj Za slanje.</span>':'')+'</article>').join(''):loading?'':'<p class="sp-note">Nema novih podataka za slanje.</p>')+'<p class="sp-note">Dugme šalje navedene izmjene iz svih projekata. Tragovi, dnevnik, tekstualne oznake i fotografije ostaju lokalno.</p>';
  }
  function render() {
    const p = sync(), context=byId('server-project-label');
    if(context)context.textContent=label(p);
    const dz=byId('server-doz-status');
    if(dz){let saved=null;try{saved=JSON.parse(localStorage.getItem('tvlake_server_doz_received_'+currentUid())||'null');}catch(e){}
      dz.textContent=saved?'Doznaka: '+saved.label+' · primljeno '+timestamp(saved.ts):'Preuzmi listu odjela doznake i slojeve trenutno otvorenog odjela.';}
    const who = byId('server-identity');
    if (who) who.textContent = 'Prijavljen: ' + name(currentUid()) + (p ? ' · ' + (p.korisnik_id===currentUid() ? 'Vlasnik projekta' : 'Član / pregled projekta') : '');
    const root = byId('server-project-view'); if (!root) return;
    const m = model(), query = search.trim().toLocaleLowerCase('bs');
    if(author && !m.authors.some(a=>a.id===author))author='';
    const rows = m.rows.filter(r => (!author || r.korisnik_id===author) && (r.nm+' '+r.ime).toLocaleLowerCase('bs').includes(query));
    page = Math.max(0,Math.min(page,Math.ceil(rows.length/size)-1));
    const input = byId('server-project-search'); if(input && input.value !== search) input.value=search;
    const summary=byId('server-project-summary');
    const sent=Object.values(history()).filter(x=>Number.isFinite(x?.ts)).sort((a,b)=>b.ts-a.ts)[0];
    if(summary)summary.innerHTML='<div class="sp-times"><div><span>Posljednje slanje s ovog telefona</span><b>'+esc(timestamp(sent?.ts))+'</b>'+(sent?'<small>'+esc(sent.label)+'<br>Poslao: '+esc(sent.ime)+'</small>':'')+'</div><div><span>Posljednji prijem ovog projekta</span><b>'+esc(timestamp(m.downloaded?.ts))+'</b></div></div>';
    renderPending();
    const authors=byId('server-project-authors');
    if(authors)authors.innerHTML=m.authors.length ? '<div class="sp-authors"><button aria-pressed="'+(!author)+'" data-author="" onclick="_serverProjektAuthor(this.dataset.author)"><b>Svi</b></button>'+m.authors.map(a=>'<button aria-pressed="'+(author===a.id)+'" data-author="'+esc(a.id)+'" onclick="_serverProjektAuthor(this.dataset.author)"><b>'+esc(a.ime)+'</b></button>').join('')+'</div>' : '';
    const list=byId('server-project-list');
    if(list) list.innerHTML=rows.length ? '<div class="sp-table-head"><span>Vlaka / projektant</span><span>Dužina</span></div>'+rows.slice(page*size,(page+1)*size).map(r=>
      '<div class="sp-vlaka"><div><b>'+esc(r.nm)+'</b><span>'+(r.pending||r.deleting?'Šalje: ':'Poslao: ')+esc(r.ime)+(r.korisnik_id===currentUid()?' · ti':'')+'</span><small class="'+(r.pending||r.deleting||r.stale?'sp-pending':'sp-confirmed')+'">'+esc(r.status)+'</small></div><strong>'+metres(r.metres)+'</strong></div>').join('') :
      '<div class="sp-empty">'+(query || author ? 'Nema vlaka za ovu pretragu.' : p ? 'Još nema vlaka na ovom telefonu. Osvježi server da preuzmeš zajednički spisak.' : 'Odaberi ili napravi projekat u sekciji Projekti.')+'</div>';
    const nav=byId('server-project-pager');
    if(nav) nav.innerHTML=rows.length>size ? '<button onclick="_serverProjektPage('+ (page-1)+')" '+(!page?'disabled':'')+'>‹ Prethodno</button><span>'+(page*size+1)+'–'+Math.min(rows.length,(page+1)*size)+' / '+rows.length+'</span><button onclick="_serverProjektPage('+(page+1)+')" '+((page+1)*size>=rows.length?'disabled':'')+'>Sljedeće ›</button>' : '';
    for(const id of ['server-project-print','server-project-map']) if(byId(id)) byId(id).disabled=!p || (id==='server-project-print' && !m.rows.length);
    const download = byId('server-project-refresh'); if(download) download.disabled=_serverPrimljenoBusy || !p;
  }
  function report() {
    const m=model();if(!m.project || !m.rows.length)return;
    const html='<!DOCTYPE html><html lang="bs"><meta charset="utf-8"><title>Vlake projekta</title><style>body{font:14px Arial;color:#172033;margin:30px}table{width:100%;border-collapse:collapse}td,th{padding:9px;border-bottom:1px solid #ccd3dc;text-align:left}td:nth-child(3){text-align:right}h1{font-size:22px}small{color:#475569}tr{break-inside:avoid}</style><h1>'+esc(label(m.project))+'</h1><p>'+m.rows.length+' vlaka · '+metres(m.total)+' ukupno</p><p>Projektanti i vlake — zadnji dostupni podaci na ovom telefonu. Neposlane stavke su označene.</p><table><thead><tr><th>Vlaka</th><th>Projektant</th><th>Dužina</th><th>Status</th></tr></thead><tbody>'+m.rows.map(r=>'<tr><td>'+esc(r.nm)+'</td><td>'+esc(r.ime)+'</td><td>'+metres(r.metres)+'</td><td>'+esc(r.status)+'</td></tr>').join('')+'</tbody></table><p><b>Ukupno: '+metres(m.total)+'</b>'+(m.incomplete?' · Nepotpuna geometrija: '+m.incomplete:'')+'</p></html>';
    const breakdown='<h2>Pregled po projektantima</h2>'+m.authors.map(a=>'<p><b>'+esc(a.ime)+'</b>: '+a.count+' vlaka · '+metres(a.total)+(a.incomplete?' · bez potpune dužine: '+a.incomplete:'')+'</p>').join('');
    _openOrDownloadReport(html.replace('</html>',breakdown+'</html>'),'Vlake_'+m.project.odjel);
  }
  Object.assign(window,{
    _serverPanelSazetak(n,st){renderPending();return '<div class="sp-transfer"><span><b>'+n.stavki+'</b> za slanje'+(n.blok?' · '+n.blok+' odbijeno':'')+(_serverSaljem?' · Šaljem…':serverPosalji._priprema?' · Pripremam…':'')+'</span><span>'+esc(st==='nema'?'Bez veze':st==='slaba'?'Slab signal':'Veza: '+(st==='dobra'?'u redu':'nije izmjerena'))+'</span></div>';},
    _serverTransferConfirmed:confirmed,_serverPendingGroups:pendingGroups,
    async _serverPreuzmiDoznaku(){
      if(_serverPreuzmiDoznaku.busy)return;
      const uid=currentUid();if(!uid)return;
      _serverPreuzmiDoznaku.busy=true;const btn=byId('server-doz-refresh');if(btn)btn.disabled=true;
      try{
        _mrezaSila(60000);
        if(await dozLoadOdjeli()!==true)throw Error('Odjeli nisu preuzeti');
        if(currentUid()!==uid)return;
        const id=typeof _dozSelId!=='undefined'?_dozSelId:null,odjel=(_dozOdjeli||[]).find(o=>o.id===id);
        let label='Lista odjela';
        if(odjel){if(await dozLoadLayers(id,{strict:true})!==true)throw Error('Slojevi nisu preuzeti');label=odjel.name+' — zone, članovi i GPS pojasevi';}
        if(currentUid()!==uid)return;
        localStorage.setItem('tvlake_server_doz_received_'+uid,JSON.stringify({ts:Date.now(),label}));
        showToast(odjel?'✓ Doznaka preuzeta i sačuvana offline':'✓ Odjeli doznake preuzeti. Otvori odjel za njegove zone i pojaseve.');
      }catch(e){showToast('⚠ Preuzimanje doznake nije završeno — '+e.message);}
      finally{_serverPreuzmiDoznaku.busy=false;if(btn)btn.disabled=false;render();}
    },
    _serverPanelRender:render,_serverProjektModel:model,_serverProjektPreuzeto:downloaded,_serverOpContext:opContext,
    _serverProjektAuthor(value){sync();author=String(value);page=0;render();},
    _serverProjektSearch(value){search=String(value);page=0;render();},
    _serverProjektPage(value){page=Math.max(0,value|0);render();byId('server-project-list')?.scrollIntoView({block:'start'});},
    _serverProjektDopuni(id,rows){const m=metadata(id);if(!m)return;let changed=false;for(const r of rows)if(r.id&&!m.ids.includes(r.id)){m.ids.push(r.id);changed=true;}if(changed)try{localStorage.setItem('tvlake_server_project_v1_'+currentUid()+'_'+id,JSON.stringify(m));}catch(e){}},
    async _serverProjektRefresh(){const p=sync();if(!p)return;const uid=currentUid();await serverPreuzmiDijeljeno(p.id);if(currentUid()===uid){render();if(typeof _tabServerCounts==='function')_tabServerCounts();}},
    _serverProjektReport:report,
    async _serverProjektMap(){const p=sync();if(!p)return;const uid=currentUid();closeSyncQueuePanel();await aktivirajProjekt(p.id);if(currentUid()===uid)switchTab('karta');}
  });
})();
