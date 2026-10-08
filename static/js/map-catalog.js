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
    el.innerHTML=rows.length?rows.map(row=>'<article class="installed-map'+(row.active?' is-active':'')+'">'+localPreview(row.name)+'<div class="catalog-copy"><b>'+esc(row.name)+'</b><small>'+esc(row.sl?String(row.sl.fmt||'SQLite').toUpperCase()+' · lokalni fajl':row.error?'Otvaranje nije uspjelo':'Sačuvana · trenutno nije učitana')+'</small><span class="catalog-status">'+(row.active?'✓ Aktivna karta':row.error?'Potrebno ponovno otvaranje':'Dostupna na telefonu')+'</span></div><button type="button" data-map-action="open" data-map-name="'+esc(row.name)+'">'+(row.active?'Prikaži':row.error?'Pokušaj':'Otvori')+'</button></article>').join(''):'<div class="catalog-empty"><b>Nema lokalnih karata</b><p>Učitaj MBTiles, SQLite ili raster GeoPackage za cijelo područje rada bez interneta.</p><button type="button" onclick="closeLayerSheet();openLoadMapScreen()">Učitaj kartu</button></div>';
    previews(rows);
  }
  function renderOffline(){
    const el=document.getElementById('ls-sqlite-in-grid');if(!el)return;
    const rows=localRows(),count=document.getElementById('ls-offline-count');
    if(count)count.textContent=rows.length+' '+(rows.length===1?'karta':'karata')+' na uređaju';
    el.innerHTML=rows.length?rows.map(row=>'<article class="offline-map-card'+(row.active?' is-active':'')+'">'+localPreview(row.name)+'<div class="catalog-copy"><span class="catalog-status">'+(row.active?'✓ Aktivna karta':row.error?'⚠ Nije otvorena':'Bez interneta')+'</span><b>'+esc(row.name)+'</b><small>'+esc(row.sl?String(row.sl.fmt||'SQLite').toUpperCase()+' · sačuvana na uređaju':row.error?'Pokušaj ponovno otvaranje':'Sačuvana · otvara se na zahtjev')+'</small></div><button type="button" data-map-action="open" data-map-name="'+esc(row.name)+'" aria-label="'+esc('Prikaži kartu '+row.name)+'" aria-pressed="'+row.active+'">'+(row.active?'Prikaži':row.error?'Pokušaj ponovo':'Otvori kartu')+'</button></article>').join(''):'<div class="catalog-empty"><b>Još nema offline karata</b><p>Učitaj MBTiles / SQLite fajl ili skini kartu za svoje područje rada.</p></div>';
    previews(rows);
  }
  async function openLocal(name){
    let i=local().findIndex(sl=>sl.name===name);
    if(i<0&&deferred().some(row=>row.name===name)){await sqlmapRetryOne(name);i=local().findIndex(sl=>sl.name===name);}
    if(i<0){showToast('Lokalna karta nije dostupna. Učitaj fajl ponovo.');renderInstalled();return;}
    setLayerSqlite(i);
    if(typeof _loadmapThumb==='function')_loadmapThumb(name,true);
  }
  const identity=fav=>JSON.stringify([fav.id||null,fav.type,fav.tlKey||fav.sqliteId||'',fav.name]);
  const findFav=key=>_mapFavs.findIndex(fav=>identity(fav)===key);
  function favoriteState(fav){
    if(fav.type==='sqlite'){
      const sl=local().find(sl=>sl.name===fav.sqliteId),saved=!!sl||deferred().some(row=>row.name===fav.sqliteId);
      return {active:!!sl?.visible&&map.hasLayer(sl.layer),available:saved,subtitle:'Lokalni fajl · '+(sl?'spremno bez interneta':saved?'sačuvana na telefonu':'fajl nije dostupan'),label:saved?'Offline karta':'Nedostaje fajl'};
    }
    const available=!!TL[fav.tlKey]||['_granice','_nagib'].includes(fav.tlKey);
    return {active:fav.tlKey===_activeLayerKey(),available,subtitle:['_granice','_nagib'].includes(fav.tlKey)?'Topo + '+(fav.tlKey==='_nagib'?'nagib terena':'granice odjela'):'Online podloga · offline samo sačuvani dijelovi',label:available?'Online / keš':'Sloj nedostupan'};
  }
  function renderFavorites(){
    const el=document.getElementById('mapfav-grid');if(!el)return;
    const count=document.getElementById('mapfav-count');if(count)count.textContent=_mapFavs.length+' sačuvanih karata';
    el.innerHTML=(_mapFavs.length?_mapFavs.map(fav=>{
      const s=favoriteState(fav),key=esc(identity(fav));
      return '<article class="mfav-card'+(s.active?' active':'')+'"><button type="button" class="mfav-activate" data-fav-action="open" data-fav-key="'+key+'" '+(!s.available?'disabled':'')+' aria-label="'+esc('Otvori '+fav.name)+'" aria-pressed="'+s.active+'"><span class="mfav-preview">'+_mapFavThumbHtml(fav)+'</span><span class="mfav-copy"><span class="catalog-status">'+(s.active?'✓ Aktivna karta':esc(s.label))+'</span><b>'+esc(fav.name)+'</b><small>'+esc(s.subtitle)+'</small></span></button><button type="button" class="mfav-edit-btn" data-fav-action="edit" data-fav-key="'+key+'" aria-label="'+esc('Uredi '+fav.name)+'">⋮</button></article>';
    }).join(''):'<div class="catalog-empty"><b>Tvoje najčešće karte na jednom mjestu</b><p>Aktiviraj kartu pa je dodaj ovdje za brži pristup.</p></div>')+'<button type="button" class="mfav-add-card" onclick="mapFavAddCurrent()"><span>＋</span><span>Dodaj trenutnu kartu</span></button>';
    if(typeof _loadmapThumb==='function')for(const fav of _mapFavs)if(fav.type==='sqlite')_loadmapThumb(fav.sqliteId);
  }
  async function favoriteAction(action,key){
    const i=findFav(key);if(i<0){renderFavorites();return;}const fav=_mapFavs[i];
    if(action==='edit'){_mapFavMenu(i);return;}
    const state=favoriteState(fav);if(!state.available){showToast('Karta više nije dostupna. Učitaj odgovarajući fajl.');return;}
    if(fav.type==='sqlite')await openLocal(fav.sqliteId);else setLayer(fav.tlKey);
    closeMapFavs();
  }
  root.MapCatalog={renderInstalled,renderOffline,renderFavorites,openLocal,localRows,favoriteState,identity};
  document.addEventListener('click',e=>{
    const button=e.target.closest('[data-map-action],[data-fav-action]');if(!button)return;
    if(button.dataset.mapAction==='open')openLocal(button.dataset.mapName);
    else if(button.dataset.favAction)favoriteAction(button.dataset.favAction,button.dataset.favKey);
  });
})(window);
