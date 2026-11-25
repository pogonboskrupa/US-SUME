/* Pregled lokalnih karata i omiljenih: postojeći mehanizmi učitavanja. */
(function(root){
  'use strict';
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const local=()=>typeof _sqlLayers!=='undefined'?_sqlLayers:[];
  const deferred=()=>typeof _sqlRestoreFailed!=='undefined'?_sqlRestoreFailed:[];
  const icon=id=>'<svg class="ic"><use href="#ic-'+id+'"/></svg>';
  function localPreview(name){
    let thumb='';try{thumb=localStorage.getItem('lm_thumb_'+name)||'';}catch(e){}
    const saved=/^data:image\/(png|jpeg|webp);base64,[a-z\d+/=]+$/i.test(thumb);
    return '<span class="installed-preview"><img data-map-preview="'+esc(name)+'" loading="lazy" decoding="async" src="'+esc(saved?thumb:'static/img/map-previews/local.svg')+'" alt="'+esc(saved?'Pregled karte '+name:'Ilustracija lokalne karte')+'"><span class="installed-preview-tag">'+(saved?'Isječak karte':'Otvori za pregled')+'</span></span>';
  }
  function previews(rows){if(typeof _loadmapThumb==='function')for(const row of rows)if(row.sl)_loadmapThumb(row.name);}
  function localRows(){
    const rows=new Map(local().map(sl=>[sl.name,{name:sl.name,sl,active:!!sl.visible&&map.hasLayer(sl.layer)}]));
    for(const item of deferred())if(!rows.has(item.name))rows.set(item.name,{name:item.name,active:false,deferred:!!item.deferred,error:!item.deferred});
    return [...rows.values()].sort((a,b)=>Number(b.active)-Number(a.active)||a.name.localeCompare(b.name,'bs',{numeric:true}));
  }
  function renderInstalled(){
    const el=document.getElementById('installed-local-list');if(!el)return;
    const rows=localRows(),count=document.getElementById('installed-local-count');if(count)count.textContent=rows.length+' karata na telefonu';
    el.innerHTML=rows.length?rows.map(row=>'<article class="installed-map'+(row.active?' is-active':'')+'">'+localPreview(row.name)+'<div class="catalog-copy"><b>'+esc(row.name)+'</b><small>'+esc(row.sl?String(row.sl.fmt||'SQLite').toUpperCase()+' · lokalni fajl':row.error?'Otvaranje nije uspjelo':'Sačuvana · trenutno nije učitana')+'</small><span class="catalog-status">'+(row.active?'● Trenutno prikazana':row.error?'Potrebno ponovno otvaranje':'Dostupna na telefonu')+'</span></div><button type="button" data-map-action="open" data-map-name="'+esc(row.name)+'">'+(row.active?'Prikaži':row.error?'Pokušaj':'Otvori')+'</button></article>').join(''):'<div class="catalog-empty"><b>Nema lokalnih karata</b><p>Učitaj MBTiles, SQLite ili raster GeoPackage za cijelo područje rada bez interneta.</p><button type="button" onclick="closeLayerSheet();openLoadMapScreen()">Učitaj kartu</button></div>';
    previews(rows);
  }
  function renderOffline(){
    const el=document.getElementById('ls-sqlite-in-grid');if(!el)return;
    const rows=localRows(),count=document.getElementById('ls-offline-count');
    if(count)count.textContent=rows.length+' '+(rows.length===1?'karta':'karata')+' na uređaju';
    el.innerHTML=rows.length?rows.map(row=>'<article class="offline-map-card'+(row.active?' is-active':'')+'">'+localPreview(row.name)+'<div class="catalog-copy"><span class="catalog-status">'+(row.active?'● Trenutno prikazana':row.error?'⚠ Nije otvorena':'Spremna bez interneta')+'</span><b>'+esc(row.name)+'</b><small>'+esc(row.sl?String(row.sl.fmt||'SQLite').toUpperCase()+' · sačuvana na uređaju':row.error?'Pokušaj ponovno otvaranje':'Sačuvana · otvara se na zahtjev')+'</small></div><button type="button" data-map-action="open" data-map-name="'+esc(row.name)+'" aria-label="'+esc('Prikaži kartu '+row.name)+'" aria-pressed="'+row.active+'">'+(row.active?'✓ Prikazana':row.error?'Pokušaj ponovo':'Prikaži kartu')+'</button></article>').join(''):'<div class="catalog-empty"><b>Još nema offline karata</b><p>Učitaj MBTiles / SQLite fajl ili skini kartu za svoje područje rada.</p></div>';
    previews(rows);
  }
  async function openLocal(name){
    let i=local().findIndex(sl=>sl.name===name);
    if(i<0&&deferred().some(row=>row.name===name)){await sqlmapRetryOne(name);i=local().findIndex(sl=>sl.name===name);}
    if(i<0){showToast('Lokalna karta nije dostupna. Učitaj fajl ponovo.');renderInstalled();return;}
    setLayerSqlite(i);
    if(typeof _loadmapThumb==='function')_loadmapThumb(name,true);
  }
  const identity=fav=>JSON.stringify([fav.id||null,fav.type,fav.tlKey||fav.sqliteId||'',fav.name,fav.ovl||'']);
  const findFav=key=>_mapFavs.findIndex(fav=>identity(fav)===key);
  function favoriteState(fav){
    if(fav.type==='sqlite'){
      const sl=local().find(sl=>sl.name===fav.sqliteId),saved=!!sl||deferred().some(row=>row.name===fav.sqliteId);
      const ovlOn=fav.ovl?(typeof _OVL!=='undefined'&&_OVL[fav.ovl]&&map.hasLayer(_OVL[fav.ovl])):!(typeof _OVL!=='undefined'&&['slope','ekspo'].some(id=>_OVL[id]&&map.hasLayer(_OVL[id])&&!_ovlState[id]));
      return {active:!!sl?.visible&&map.hasLayer(sl.layer)&&!!ovlOn,available:saved,subtitle:(fav.ovl==='slope'?'Boje po strmini terena · ':fav.ovl==='ekspo'?'Boje po strani svijeta · ':fav.auto==='srv'?'Skinuta sa servera · ':'Lokalni fajl · ')+(sl?'radi bez interneta':saved?'sačuvana na telefonu':'fajl nije dostupan'),label:!saved?'Nedostaje fajl':fav.ovl==='slope'?'Offline + nagib':fav.ovl==='ekspo'?'Offline + ekspozicija':'Offline karta'};
    }
    const available=!!TL[fav.tlKey]||['_granice','_nagib','_ekspo'].includes(fav.tlKey);
    return {active:fav.tlKey===_activeLayerKey(),available,subtitle:['_granice','_nagib','_ekspo'].includes(fav.tlKey)?'Topo + '+(fav.tlKey==='_nagib'?'nagib terena':fav.tlKey==='_ekspo'?'ekspozicija':'granice odjela'):'Online podloga · offline samo sačuvani dijelovi',label:available?'Online / keš':'Sloj nedostupan'};
  }
  // Brzi izbor (v5.0.1): Google satelit UVIJEK, pa do dvije offline karte sa telefona — zadnje
  // skinuta/učitana prva (savedAt iz liste karata, setRecent). Nagib i ekspozicija su dugmad na
  // kartici offline karte, ne zasebne kartice. Ispod su karte koje je korisnik sam dodao.
  const GOOGLE='📡 Google',BRZO_MAX=2;let recent=null;
  function setRecent(rows){recent=(rows||[]).filter(r=>r&&r.name).sort((a,b)=>(b.savedAt||0)-(a.savedAt||0)).map(r=>({name:r.name,savedAt:r.savedAt||0,srv:!!r.meta?._nativeId}));}
  function offlineNajnovije(){
    const naTel=new Set(local().map(sl=>sl.name));for(const r of deferred())if(!r.error)naTel.add(r.name);
    let red=[];
    if(recent)red=recent.filter(r=>naTel.has(r.name));
    else{let srv=[];try{srv=JSON.parse(localStorage.getItem('tvlake_mapfav_srv_v1')||'[]');}catch(e){}
      red=[...srv].reverse().filter(n=>naTel.has(n)).map(name=>({name,savedAt:0,srv:true}));}
    for(const n of naTel)if(!red.some(r=>r.name===n))red.push({name:n,savedAt:0});
    return red.slice(0,BRZO_MAX);
  }
  const datum=t=>{if(!t)return '';const d=new Date(t);return d.getDate()+'.'+(d.getMonth()+1)+'.'+d.getFullYear()+'.';};
  const ovlNa=id=>typeof _OVL!=='undefined'&&!!_OVL[id]&&map.hasLayer(_OVL[id]);
  function googleCard(){
    const ok=typeof TL!=='undefined'&&!!TL[GOOGLE],akt=ok&&_activeLayerKey()===GOOGLE;
    return '<article class="mfav-card mfav-brzo'+(akt?' active':'')+(!ok?' nedostupna':'')+'"><button type="button" class="mfav-activate" data-brzo="google" '+(ok?'':'disabled')+' aria-label="Otvori Google satelit" aria-pressed="'+akt+'"><span class="mfav-preview" data-kind="sat"><span class="mfav-sat-art" aria-hidden="true"></span><i class="mfav-tag">SATELIT</i></span><span class="mfav-copy"><span class="catalog-status">'+(akt?'✓ Prikazana':'Online podloga')+'</span><b>Google satelit</b><small>Treba internet · već gledani dijelovi rade i offline</small></span></button></article>';
  }
  function offlineCard(r,i){
    const sl=local().find(x=>x.name===r.name),akt=!!sl&&!!sl.visible&&map.hasLayer(sl.layer),nag=akt&&ovlNa('slope'),eks=akt&&ovlNa('ekspo'),n=esc(r.name);
    // Korisnik je kartu možda već dodao u omiljene pod svojim nazivom — taj naziv ima prednost.
    const svoj=_mapFavs.find(f=>f.type==='sqlite'&&!f.ovl&&f.auto!=='srv'&&f.sqliteId===r.name),naziv=esc(svoj?svoj.name:r.name);
    const chip=(ovl,txt,on)=>'<button type="button" class="mfav-chip'+(on?' on':'')+'" data-brzo="off" data-map-name="'+n+'" data-ovl="'+ovl+'" aria-pressed="'+on+'">'+txt+'</button>';
    return '<article class="mfav-card mfav-brzo'+(akt?' active':'')+'"><button type="button" class="mfav-activate" data-brzo="off" data-map-name="'+n+'" data-ovl="" aria-label="'+esc('Otvori '+r.name)+'" aria-pressed="'+(akt&&!nag&&!eks)+'"><span class="mfav-preview" data-kind="off">'+_mapFavThumbHtml({type:'sqlite',sqliteId:r.name,name:r.name})+'<i class="mfav-tag">'+(i===0?'NAJNOVIJA':'OFFLINE')+'</i></span><span class="mfav-copy"><span class="catalog-status">'+(akt?'✓ Prikazana'+(nag?' · nagib':eks?' · ekspozicija':''):'Radi bez interneta')+'</span><b>'+naziv+'</b><small>'+(svoj&&svoj.name!==r.name?n+' · ':'')+(r.savedAt?(r.srv?'Skinuta ':'Učitana ')+datum(r.savedAt):'Sačuvana na telefonu')+'</small></span></button><div class="mfav-chips" role="group" aria-label="'+esc('Prikaz karte '+r.name)+'">'+chip('','Samo karta',akt&&!nag&&!eks)+chip('slope','+ Nagib',nag)+chip('ekspo','+ Ekspozicija',eks)+'</div></article>';
  }
  function renderFavorites(){
    const el=document.getElementById('mapfav-grid');if(!el)return;
    const kind=fav=>fav.type==='tl'&&fav.tlKey===GOOGLE?'sat':fav.type==='sqlite'?'off':'tl';
    const tag=fav=>fav.ovl==='slope'?'NAGIB':fav.ovl==='ekspo'?'EKSPOZ.':kind(fav)==='sat'?'SATELIT':kind(fav)==='off'?'OFFLINE':'ONLINE';
    const card=fav=>{
      const s=favoriteState(fav),key=esc(identity(fav));
      return '<article class="mfav-card'+(s.active?' active':'')+(!s.available?' nedostupna':'')+'"><button type="button" class="mfav-activate" data-fav-action="open" data-fav-key="'+key+'" '+(!s.available?'disabled':'')+' aria-label="'+esc('Otvori '+fav.name)+'" aria-pressed="'+s.active+'"><span class="mfav-preview" data-kind="'+kind(fav)+'"'+(fav.ovl?' data-ovl="'+fav.ovl+'"':'')+'>'+_mapFavThumbHtml(fav)+'<i class="mfav-tag">'+tag(fav)+'</i></span><span class="mfav-copy"><span class="catalog-status">'+(s.active?'✓ Prikazana':esc(s.label))+'</span><b>'+esc(fav.name)+'</b><small>'+esc(s.subtitle)+'</small></span></button><button type="button" class="mfav-edit-btn" data-fav-action="edit" data-fav-key="'+key+'" aria-label="'+esc('Uredi '+fav.name)+'">⋮</button></article>';
    };
    // Automatske stavke (karta sa servera i njene kombinacije, Google) su u Brzom izboru — u
    // "Moje karte" ostaje samo ono što je korisnik sam dodao.
    const off=offlineNajnovije(),uBrzom=new Set(off.map(r=>r.name));
    // Ista offline karta (bez nagiba/ekspozicije) koja je već u Brzom izboru se ne ponavlja.
    const moje=_mapFavs.filter(fav=>fav.auto!=='srv'&&!(fav.type==='tl'&&fav.tlKey===GOOGLE)&&!(fav.type==='sqlite'&&!fav.ovl&&uBrzom.has(fav.sqliteId)));
    const count=document.getElementById('mapfav-count');
    if(count)count.textContent='Satelit · '+off.length+' offline '+(off.length===1?'karta':'karte')+' · '+moje.length+' '+(moje.length===1?'moja':'mojih');
    const prazno='<div class="mfav-prazno"><b>Nema offline karte na telefonu</b><span>Skini kartu sa servera ili učitaj MBTiles — zadnja skinuta se pojavi ovdje.</span><button type="button" onclick="closeMapFavs();openLoadMapScreen()">Učitaj kartu</button></div>';
    el.innerHTML='<h4 class="mfav-sek"><b>Brzi izbor</b><span>satelit i zadnje skinute offline karte</span></h4>'+googleCard()+(off.length?off.map(offlineCard).join(''):prazno)
      +'<h4 class="mfav-sek"><b>Moje karte</b><span>'+(moje.length?'⋮ preimenuj, pomjeri, ukloni':'dodaj kartu koju često koristiš')+'</span></h4>'+moje.map(card).join('')
      +'<button type="button" class="mfav-add-card" onclick="mapFavAddCurrent()"><span>＋</span><span>Dodaj trenutnu kartu</span></button>';
    if(typeof _loadmapThumb==='function'){for(const r of off)_loadmapThumb(r.name);for(const fav of moje)if(fav.type==='sqlite')_loadmapThumb(fav.sqliteId);}
  }
  async function brzoAction(btn){
    if(btn.dataset.brzo==='google'){if(typeof TL!=='undefined'&&TL[GOOGLE]){setLayer(GOOGLE);if(typeof _mapFavPrimijeniOvl==='function')_mapFavPrimijeniOvl(null);}closeMapFavs();return;}
    await openLocal(btn.dataset.mapName);
    if(typeof _mapFavPrimijeniOvl==='function')_mapFavPrimijeniOvl(btn.dataset.ovl||null);
    closeMapFavs();
  }
  async function favoriteAction(action,key){
    const i=findFav(key);if(i<0){renderFavorites();return;}const fav=_mapFavs[i];
    if(action==='edit'){_mapFavMenu(i);return;}
    const state=favoriteState(fav);if(!state.available){showToast('Karta više nije dostupna. Učitaj odgovarajući fajl.');return;}
    if(fav.type==='sqlite'){await openLocal(fav.sqliteId);if(typeof _mapFavPrimijeniOvl==='function')_mapFavPrimijeniOvl(fav.ovl||null);}else setLayer(fav.tlKey);
    closeMapFavs();
  }
  root.MapCatalog={renderInstalled,renderOffline,renderFavorites,openLocal,localRows,favoriteState,identity,setRecent,offlineNajnovije};
  document.addEventListener('click',e=>{
    const button=e.target.closest('[data-map-action],[data-fav-action],[data-brzo]');if(!button)return;
    if(button.dataset.brzo){if(!button.disabled)brzoAction(button);}
    else if(button.dataset.mapAction==='open')openLocal(button.dataset.mapName);
    else if(button.dataset.favAction)favoriteAction(button.dataset.favAction,button.dataset.favKey);
  });
})(window);
