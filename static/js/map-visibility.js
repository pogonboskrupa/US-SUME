// Grupni prikaz terenskih oznaka. Vidljivost ne briše i ne šalje podatke.
(function () {
  'use strict';
  const categories={photos:'Fotografije',tracks:'Tragovi',points:'Tačke',measurements:'Mjerenja',labels:'Tekstualne oznake'};
  let scope=null,prefs={};
  function sync(){const uid=sbUser?.id||'guest';if(scope===uid)return;scope=uid;try{const value=JSON.parse(localStorage.getItem('tvlake_map_visibility_'+uid)||'{}');prefs=value&&typeof value==='object'&&!Array.isArray(value)?value:{};}catch(e){prefs={};}}
  function enabled(category){sync();return category==='tracks'||prefs[category]!==false;}
  function photoKey(f,shared){return JSON.stringify([shared?'shared':'own',Number(f.ts),Number(f.la),Number(f.lo)]);}
  function photoVisible(f,shared){sync();return enabled('photos')&&prefs.photoHidden?.[photoKey(f,shared)]!==true;}
  function photoSet(f,shared,on,defer){
    sync();prefs.photoHidden=prefs.photoHidden&&typeof prefs.photoHidden==='object'&&!Array.isArray(prefs.photoHidden)?prefs.photoHidden:{};
    if(on&&!enabled('photos')){for(const [list,isShared] of [[_locFotos,false],[_sharedFotos,true]])for(const other of list)prefs.photoHidden[photoKey(other,isShared)]=true;prefs.photos=true;}
    prefs.photoHidden[photoKey(f,shared)]=!on;
    if(!defer){apply('photos');persist();render();}
  }
  function photosSet(rows,on){for(const r of rows)photoSet(r.ref,r.shared,on,true);apply('photos');persist();render();}
  function persist(){try{localStorage.setItem('tvlake_map_visibility_'+scope,JSON.stringify(prefs));}catch(e){showToast('Prikaz je promijenjen; postavka nije sačuvana.');}}
  function layers(category){
    if(category==='photos')return [..._locFotos,..._sharedFotos].map(f=>f.marker).filter(Boolean);
    if(category==='points')return _tacke.map(t=>t.marker).filter(Boolean);
    if(category==='labels')return textLabels.map(t=>t.marker).filter(Boolean);
    if(category==='measurements')return _msrSavedLayer?[_msrSavedLayer]:[];
    return _tragRegistry.flatMap(t=>[_tragLayers[t.id],_tragHitLayers[t.id],_tragLenMk[t.id]]).filter(Boolean);
  }
  function apply(category){if(category==='tracks')return;
    if(category==='photos'){for(const [list,shared]of [[_locFotos,false],[_sharedFotos,true]])for(const f of list){if(!f.marker)continue;if(photoVisible(f,shared)){if(!map.hasLayer(f.marker))f.marker.addTo(map);}else if(map.hasLayer(f.marker))map.removeLayer(f.marker);}return;}
    for(const layer of layers(category)){if(enabled(category)){if(!map.hasLayer(layer))layer.addTo(map);}else if(map.hasLayer(layer))map.removeLayer(layer);}}
  function set(category,on){
    sync();if(category!=='all'&&!Object.hasOwn(categories,category))return;
    for(const key of category==='all'?Object.keys(categories):[category]){
      if(key==='tracks'){
        for(const t of _tragRegistry){t.visible=!!on;_tragRegAddLayer(t);}
        _tragRegSave();
      }else{prefs[key]=!!on;if(key==='photos'&&on)prefs.photoHidden={};apply(key);}
    }
    persist();
    if(!on)map.closePopup();
    _tragoviRender();
  }
  function model(){
    sync();return Object.entries(categories).map(([key,label])=>{
      let total,visible;
      if(key==='tracks'){total=_tragRegistry.length;visible=_tragRegistry.filter(t=>t.visible!==false).length;}
      else if(key==='measurements'){total=_msrRegistry.length;visible=enabled(key)?total:0;}
      else{const list=layers(key);total=list.length;visible=list.filter(l=>map.hasLayer(l)).length;}
      return {key,label,total,visible};
    });
  }
  function render(){
    const el=document.getElementById('tv-visibility');if(!el)return;
    el.innerHTML='<div class="tv-visibility-head"><div><b>Prikaz na karti</b><small>Sačuvani podaci · aktivno snimanje ostaje vidljivo</small></div><div><button onclick="_tvVisibilitySet(\'all\',true)">Prikaži sve</button><button onclick="_tvVisibilitySet(\'all\',false)">Sakrij sve</button></div></div>'+model().map(r=>'<div class="tv-visibility-row"><div><b>'+r.label+'</b><small>'+r.visible+' / '+r.total+' vidljivo</small></div><button '+(!r.total?'disabled ':'')+'aria-pressed="'+(r.visible===r.total&&r.total>0)+'" onclick="_tvVisibilitySet(\''+r.key+'\','+(r.visible===0)+')">'+(r.visible?'Sakrij':'Prikaži')+'</button></div>').join('');
  }
  Object.assign(window,{_tvCategoryOn:enabled,_tvVisibilitySet:set,_tvVisibilityRender:render,_tvVisibilityModel:model,_tvPhotoVisible:photoVisible,_tvPhotoSet:photoSet,_tvPhotosSet:photosSet,_tvPhotoKey:photoKey});
  for(const key of Object.keys(categories))apply(key);
})();
