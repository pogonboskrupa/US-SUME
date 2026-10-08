// Preglednik oznaka: stabilni identiteti, lokalni pregled i izričite radnje.
(function(){
  'use strict';
  const labels={all:'Sve',local:'Učitani fajlovi',photos:'Fotografije',tracks:'Tragovi',server:'Server fajlovi'};
  let owner='',category='all',query='',sort='department',limit=40,opened='',meta={};
  const el=id=>document.getElementById(id),esc=s=>_escHtml(String(s??''));
  function sync(){const uid=sbUser?.id||'guest';if(owner===uid)return;owner=uid;category='all';query='';limit=40;opened='';try{const v=JSON.parse(localStorage.getItem('tvlake_library_meta_'+uid)||'{}');meta=v&&typeof v==='object'&&!Array.isArray(v)?v:{};}catch(e){meta={};}
    sort='department';try{const p=JSON.parse(localStorage.getItem('tvlake_library_view_'+uid)||'{}');category=Object.hasOwn(labels,p.category)?p.category:'all';query=typeof p.query==='string'?p.query.slice(0,160):'';sort=['department','date','proximity','name'].includes(p.sort)?p.sort:'department';}catch(e){}}
  function saveView(){try{localStorage.setItem('tvlake_library_view_'+owner,JSON.stringify({category,query,sort}));}catch(e){showToast('Izbor preglednika nije sačuvan — provjeri prostor.');}}
  function key(type,id){return JSON.stringify([type,String(id)]);}
  function date(value){const n=typeof value==='number'?value:Date.parse(value);return Number.isFinite(n)&&n>0?n:0;}
  function department(value){const s=String(value||'').trim();return s||'Bez odjela';}
  function model(){
    sync();const rows=[];const center=map.getCenter();
    const add=r=>{const m=meta[r.key]||{};r.title=m.title||r.title;r.odjel=department(m.odjel??r.odjel);r.gj=m.gj??r.gj??'';r.note=m.note||'';r.distance=Infinity;try{if(r.position)r.distance=map.distance(center,r.position);}catch(e){}rows.push(r);};
    kmlLs.forEach((k,i)=>{let position;try{const b=k.grp?.getBounds();if(b?.isValid())position=b.getCenter();}catch(e){}
      add({key:key(k._key?'server':'local',k._key||k._origName||k.name),category:k._key?'server':'local',ref:k,index:i,title:k.name||'Fajl',odjel:k.tag||'',gj:k._folder?.split('/')[0]||'',ts:date(k._loadedAt),position,visible:!!k.grp&&k.vis!==false&&map.hasLayer(k.grp),ready:!!k.grp,detail:k.grp?_kmlFeatureCount(k.grp)+' elemenata':'Nije preuzeto',color:k.col});});
    for(const [list,shared]of [[_locFotos,false],[_sharedFotos,true]])for(const f of list)add({key:key('photos',_tvPhotoKey(f,shared)),category:'photos',ref:f,shared,title:'Fotografija',odjel:f.odjel||'',gj:f.gj||'',ts:date(f.ts),position:[f.la,f.lo],visible:!!f.marker&&map.hasLayer(f.marker),ready:true,detail:shared?'Podijeljena fotografija':'Moja fotografija',thumb:f.thumb});
    for(const t of _tragRegistry){const pts=t.pts||[],mid=pts[Math.floor(pts.length/2)];add({key:key('tracks',t.id),category:'tracks',ref:t,title:_tragIme(t),odjel:t.odjel||'',gj:t.gj||'',ts:date(t.date)||date(pts[0]?.[3]),position:mid?[mid[0],mid[1]]:null,visible:typeof _tvTrackVisible==='function'?_tvTrackVisible(t):t.visible!==false,ready:true,detail:_tragFmtLen(_tragCalcLen(pts))+' · '+pts.length+' tačaka',color:t.color});}
    return rows;
  }
  function filtered(){sync();const q=query.trim().toLocaleLowerCase('bs');const rows=model().filter(r=>(category==='all'||r.category===category)&&(!q||[r.title,r.odjel,r.gj,r.note,labels[r.category]].join(' ').toLocaleLowerCase('bs').includes(q)));
    return rows.sort((a,b)=>{let n=0;if(sort==='department')n=(a.odjel==='Bez odjela')-(b.odjel==='Bez odjela')||a.odjel.localeCompare(b.odjel,'bs',{numeric:true})||a.gj.localeCompare(b.gj,'bs');if(sort==='date')n=b.ts-a.ts;if(sort==='proximity')n=a.distance-b.distance;return (Number.isNaN(n)?0:n)||a.title.localeCompare(b.title,'bs',{numeric:true})||a.key.localeCompare(b.key);});}
  function btn(action,k,text,extra=''){return '<button type="button" data-action="'+action+'" data-key="'+esc(k)+'" onclick="_libraryAction(this.dataset.action,this.dataset.key)" '+extra+'>'+text+'</button>';}
  function editor(r){
    if(r.category==='local'||r.category==='server'){_kmlEditIdx=r.index;return _layerEditorHtml(r.index);}
    const field=(name,label,value,type='text')=>'<label>'+label+'<input type="'+type+'" maxlength="160" data-key="'+esc(r.key)+'" data-field="'+name+'" value="'+esc(value)+'" onchange="_libraryEdit(this.dataset.key,this.dataset.field,this.value)"></label>';
    return '<section class="ml-editor"><div class="ml-fields">'+field('title','Naziv',r.title)+field('odjel','Odjel',r.odjel==='Bez odjela'?'':r.odjel)+field('gj','Gospodarska jedinica',r.gj)+(r.category==='tracks'?field('color','Boja traga',/^#[a-f\d]{6}$/i.test(r.ref.color)?r.ref.color:'#f97316','color'):'')+'</div>'+field('note','Opis / napomena',r.note)+(r.category==='tracks'?'<div class="ml-actions">'+btn('track-details',r.key,'Tačke i detaljno uređivanje')+'</div>':'')+'</section>';
  }
  function row(r){
    const when=r.ts?new Date(r.ts).toLocaleDateString('bs-BA'):'Datum nije poznat';
    const dist=Number.isFinite(r.distance)?_tragFmtLen(r.distance)+' od sredine karte':'Položaj nije učitan';
    const image=r.thumb&&/^(data:image\/|https:\/\/)/i.test(r.thumb)?'<img loading="lazy" src="'+esc(r.thumb)+'" alt="Fotografija">':'<span class="ml-kind">'+({local:'KML',server:'SRV',tracks:'GPS',photos:'FOTO'}[r.category])+'</span>';
    const main=r.category==='photos'?btn('open',r.key,image,'class="ml-thumbnail" aria-label="Otvori fotografiju"'):image;
    const actions=r.ready?btn('zoom',r.key,'Na karti')+btn('visibility',r.key,r.visible?'Sakrij':'Prikaži','aria-pressed="'+r.visible+'"')+btn('edit',r.key,opened===r.key?'Zatvori uređivanje':'Uredi'):btn('download',r.key,'↓ Preuzmi za offline');
    const extras=(r.category==='photos'&&!r.shared?btn('share',r.key,'Podijeli fotografiju'):'')+(r.category==='local'?btn('export-file',r.key,'Sačuvaj KML fajl'):'')+(r.category==='tracks'?btn('export',r.key,'Izvezi / podijeli KML'):'')+btn('remove',r.key,r.category==='server'?'Ukloni offline kopiju':r.shared?'Ukloni s ovog telefona':'Obriši','class="ml-danger"');
    return '<article class="ml-card'+(r.visible?'':' ml-hidden')+'" data-category="'+r.category+'" data-row-key="'+esc(r.key)+'"><div class="ml-card-head">'+main+'<div><small>'+labels[r.category]+' · '+(r.ready?(r.visible?'Vidljivo':'Skriveno'):'Na serveru')+'</small><h3>'+esc(r.title)+'</h3><p>'+esc(r.odjel)+(r.gj?' · '+esc(r.gj):'')+'</p><p>'+esc(r.detail)+'</p><small>'+esc(when)+' · '+esc(dist)+'</small></div></div>'+(r.note?'<p class="ml-note">'+esc(r.note)+'</p>':'')+'<div class="ml-actions">'+actions+'</div>'+(opened===r.key&&r.ready?editor(r):'')+(r.ready?'<details class="ml-more"><summary>Više radnji</summary><div class="ml-actions">'+extras+'</div></details>':'')+'</article>';
  }
  function render(){
    if(!el('library-list'))return;const rows=filtered(),all=model();
    const search=el('library-search');if(search&&search.value!==query)search.value=query;
    if(el('library-sort'))el('library-sort').value=sort;
    el('library-tabs').innerHTML=Object.entries(labels).map(([id,label])=>'<button type="button" role="tab" aria-selected="'+(id===category)+'" data-category="'+id+'" onclick="_libraryFilter(this.dataset.category)">'+label+' <span>'+all.filter(r=>id==='all'||r.category===id).length+'</span></button>').join('');
    el('oz-total-badge').textContent=all.length+' stavki';
    el('library-summary').textContent=rows.length+' rezultata · '+rows.filter(r=>r.visible).length+' vidljivo'+(sort==='proximity'?' · prema sredini prikaza karte':'');
    let group='',out='';for(const r of rows.slice(0,limit)){if(sort==='department'&&group!==JSON.stringify([r.gj,r.odjel])){group=JSON.stringify([r.gj,r.odjel]);out+='<div class="ml-group"><div class="ml-group-label"><svg class="ic" aria-hidden="true"><use href="#ic-folder"/></svg><b>'+esc(r.odjel+(r.gj?' · '+r.gj:''))+'</b></div><div><button type="button" data-group="'+esc(group)+'" onclick="_libraryGroup(true,this.dataset.group)">Prikaži</button><button type="button" data-group="'+esc(group)+'" onclick="_libraryGroup(false,this.dataset.group)">Sakrij</button></div></div>';}out+=row(r);}
    el('library-list').innerHTML=out||'<div class="ml-empty">'+(query?'Nema stavki za ovu pretragu.':'Ovdje će biti tvoji fajlovi, fotografije i tragovi.')+'</div>';
    el('library-more').hidden=rows.length<=limit;el('library-more').textContent='Prikaži još ('+Math.max(0,rows.length-limit)+')';
  }
  function visible(rows,on){
    const kml=rows.filter(r=>r.ready&&(r.category==='local'||r.category==='server')),before=kml.map(r=>r.ref.vis);
    for(const r of kml){r.ref.vis=on;on?r.ref.grp.addTo(map):map.removeLayer(r.ref.grp);}
    if(kml.length)try{saveKmlStyles();}catch(e){kml.forEach((r,i)=>{r.ref.vis=before[i];before[i]?r.ref.grp.addTo(map):map.removeLayer(r.ref.grp);});showToast('Prikaz fajlova nije sačuvan — provjeri memoriju.');}
    const photos=rows.filter(r=>r.category==='photos');if(photos.length)_tvPhotosSet(photos,on);
    let changed=false;for(const r of rows){if(r.category==='tracks'){if(typeof _tvTrackSet==='function')_tvTrackSet(r.ref,on);else r.ref.visible=on;_tragRegAddLayer(r.ref);changed=true;}}
    if(changed)_tragRegSave();if(!on)map.closePopup();render();if(typeof _tvVisibilityRender==='function')_tvVisibilityRender();
  }
  async function action(actionName,k){
    let r=model().find(x=>x.key===k);if(!r)return;
    if(actionName==='visibility'){visible([r],!r.visible);return;}
    if(actionName==='edit'){opened=opened===k?'':k;render();return;}
    if(actionName==='zoom'){
      visible([r],true);closeOznakePanel();if(r.category==='local'||r.category==='server')_ozZoomKml(r.index);else if(r.category==='tracks')_tragRegZoom(r.ref.id);else if(r.position){map.setView(r.position,Math.max(map.getZoom(),17));r.ref.marker?.openPopup();}return;
    }
    if(actionName==='open'){closeOznakePanel();await openFotoFullscreen(r.ref.ts,r.shared);return;}
    if(actionName==='share'){closeOznakePanel();await openShareFotoDlg(r.ref.ts);return;}
    if(actionName==='export'){await _tragKmlMeni(r.ref.id);return;}
    if(actionName==='export-file'){
      const uid=sbUser?.id;
      try{const data=JSON.parse(localStorage.getItem(_LOCAL_KML_KEY)||'{}')[r.ref._origName||r.ref.name];const content=data?.cacheKey?await _kmlcGet(data.cacheKey):data?.content;
        if(sbUser?.id!==uid)return;if(typeof content!=='string')throw Error('Sadržaj fajla nije dostupan');
        const a=document.createElement('a');a.download=(r.title.replace(/\.kml$/i,'').replace(/[\\/:*?"<>|]/g,'_')||'sloj')+'.kml';a.href=URL.createObjectURL(new Blob([content],{type:'application/vnd.google-earth.kml+xml'}));a.click();setTimeout(()=>URL.revokeObjectURL(a.href),4000);
      }catch(e){showToast('Izvoz nije uspio: '+e.message);}return;
    }
    if(actionName==='track-details'){closeOznakePanel();switchTab('tragovi');_tvOtvoren=r.ref.id;_tragoviRender();_tragoviToggleEdit(r.ref.id);return;}
    if(actionName==='download'){await _srvDownload([r.ref._key]);render();return;}
    if(actionName==='remove'){
      const uid=sbUser?.id;const message=r.category==='server'?'Ukloniti samo offline kopiju? Fajl ostaje na serveru.':r.category==='photos'&&!r.shared&&r.ref.sbId?'Obrisati fotografiju s telefona i servera?':r.shared?'Ukloniti ovu fotografiju s ovog telefona?':'Trajno obrisati „'+r.title+'“ s telefona?';
      if(!await _dlgConfirm(message,{danger:true})||sbUser?.id!==uid)return;r=model().find(x=>x.key===k);if(!r)return;
      if(r.category==='server')await _srvDelete([r.ref._key]);else if(r.category==='local')delK(r.index);else if(r.category==='tracks')_tragRegDelete(r.ref.id);else if(r.shared){if(r.ref.sbId)_addDismissedFoto(r.ref.sbId);map.removeLayer(r.ref.marker);_sharedFotos.splice(_sharedFotos.indexOf(r.ref),1);}else deleteFoto(r.ref.ts);
      opened='';render();
    }
  }
  function edit(k,field,value){
    const r=model().find(x=>x.key===k);if(!r||!['title','odjel','gj','note','color'].includes(field))return;value=String(value).trim().slice(0,160);
    if(r.category==='tracks'&&field!=='note'){
      if(field==='color'){if(!/^#[a-f\d]{6}$/i.test(value))return;_tragoviSetColor(r.ref.id,value);}else {r.ref[field==='title'?'name':field]=value;_tragRegSave();}
    }else{const next={...meta,[k]:{...meta[k],[field]:value}};try{localStorage.setItem('tvlake_library_meta_'+owner,JSON.stringify(next));meta=next;}catch(e){showToast('Opis nije sačuvan — provjeri memoriju.');return;}}
    render();
  }
  Object.assign(window,{_libraryRender:render,_libraryModel:model,_libraryRows:filtered,_libraryAction:action,_libraryEdit:edit,
    _libraryFilter(value){sync();category=Object.hasOwn(labels,value)?value:'all';limit=40;opened='';saveView();render();},
    _librarySearch(value){sync();query=String(value).slice(0,160);limit=40;saveView();render();},_librarySort(value){sync();sort=['department','date','proximity','name'].includes(value)?value:'department';limit=40;saveView();render();},
    _libraryGroup(on,group){visible(filtered().filter(r=>!group||JSON.stringify([r.gj,r.odjel])===group),!!on);},_libraryMore(){limit+=40;render();}});
  map.on('moveend',()=>{if(sort==='proximity'&&el('oznake-panel')?.style.display!=='none')render();});
})();
