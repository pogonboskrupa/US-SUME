// Uređivanje učitanih slojeva: iste kontrole u listi i popupu na karti.
'use strict';
const _LE_COLORS=['#ef4444','#f97316','#eab308','#22c55e','#06b6d4','#3b82f6','#8b5cf6','#ffffff','#94a3b8','#000000'];
const _LE_PATTERNS=[['solid','Puna'],['diagonal','Kosa /'],['diagonal-rev','Kosa \\'],['crosshatch','Mreža'],['horizontal','Vodoravna'],['vertical','Uspravna'],['dots','Tačke']];
const _lePendingStyles=new Map();
function _layerLeaves(k) {
  const out=[];const walk=g=>g?.eachLayer?.(l=>{if(l.eachLayer&&!l._kmlIsPolygon&&!l._kmlIsPoint)walk(l);else if(l.getLatLngs||l.getLatLng)out.push(l);});walk(k?.grp);return out;
}
function _layerColor(c){return /^#[a-f\d]{6}$/i.test(c)?c:'#22c55e';}
function _layerPreview(i,compact=false) {
  const k=kmlLs[i];if(!k)return '';
  const layers=_layerLeaves(k),l=layers.find(l=>l._kmlIsPolygon)||layers[0],poly=!!l?._kmlIsPolygon;
  const rings=[];const walk=a=>{if(!a?.length)return;if(a[0]?.lat!==undefined)rings.push(a);else a.forEach(walk);};
  if(l?.getLatLngs)walk(l.getLatLngs());else if(l?.getLatLng)rings.push([l.getLatLng()]);
  let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity;
  for(const ring of rings)for(const p of ring){minX=Math.min(minX,p.lng);maxX=Math.max(maxX,p.lng);minY=Math.min(minY,p.lat);maxY=Math.max(maxY,p.lat);}
  const w=maxX-minX||.001,h=maxY-minY||.001,scale=Math.min(230/w,76/h);
  const xy=p=>[(130+(p.lng-(minX+maxX)/2)*scale).toFixed(1),(50-(p.lat-(minY+maxY)/2)*scale).toFixed(1)].join(' ');
  const d=rings.slice(0,12).map(r=>{const sample=r.length>100?r.filter((_,i)=>i===r.length-1||i%Math.ceil(r.length/100)===0):r;return sample.map((p,j)=>(j?'L':'M')+xy(p)).join(' ')+(poly?' Z':'');}).join(' ');
  const fill=poly&&k.fill?(k.fillOpacity??.35):0,color=_layerColor(k.col),fillCol=_layerColor(k.fillCol||k.col),pattern=k.fillPattern||'solid';
  const id='le-pat-'+i+(compact?'c':'f'),patternShape=pattern==='dots'?'<circle cx="4" cy="4" r="1.3"/>':pattern==='horizontal'?'<path d="M0 4H8"/>':pattern==='vertical'?'<path d="M4 0V8"/>':pattern==='diagonal-rev'?'<path d="M0 0L8 8M-4 4L4 12M4-4L12 4"/>':pattern==='crosshatch'?'<path d="M0 0L8 8M0 8L8 0"/>':'<path d="M0 8L8 0M-4 4L4-4M4 12L12 4"/>';
  const defs=poly&&pattern!=='solid'?'<defs><pattern id="'+id+'" width="8" height="8" patternUnits="userSpaceOnUse" stroke="'+fillCol+'" fill="'+fillCol+'" stroke-width="1.4">'+patternShape+'</pattern></defs>':'';
  const geometry=d&&!l?._kmlIsPoint?'<path d="'+d+'" stroke="'+color+'" stroke-width="'+(k.weight??2)+'" stroke-opacity="'+(k.opacity??.9)+'" stroke-dasharray="'+_escHtml(k.dash||'')+'" fill="'+(pattern==='solid'?fillCol:'url(#'+id+')')+'" fill-opacity="'+fill+'" fill-rule="evenodd" stroke-linejoin="round"/>':'<circle cx="130" cy="50" r="6" fill="'+color+'"/>';
  return '<div class="le-preview'+(compact?' le-preview-compact':'')+'" aria-label="Pregled stila"><svg viewBox="0 0 260 100" role="img" aria-label="'+(poly?'Poligon':'Linija')+' · pregled stila">'+defs+geometry+'</svg>'+(compact?'':'<span>Pregled geometrije iz fajla</span><div class="le-preview-meta"><b>'+Number(k.weight??2)+' px</b><b>'+Math.round((k.opacity??.9)*100)+'% linija</b>'+(poly?'<b>'+(fill===0?'Bez ispune · klikabilno':Math.round(fill*100)+'% ispuna')+'</b>':'')+'</div>')+'</div>';
}
function _layerCardHtml(i) {
  const k=kmlLs[i];if(!k?.grp)return '';
  const leaves=_layerLeaves(k).filter(l=>l._kmlName!==undefined||l.options?.interactive!==false);
  const poly=leaves.filter(l=>l._kmlIsPolygon).length,points=leaves.filter(l=>l._kmlIsPoint).length,lines=leaves.length-poly-points;
  const meta=[poly?poly+' poligona':'',lines?lines+' linija':'',points?points+' tačaka':''].filter(Boolean).join(' · ');
  const fill=poly?' · '+(k.fill&&(k.fillOpacity??.35)>0?Math.round((k.fillOpacity??.35)*100)+'% ispuna':'bez ispune'):'';
  const canReset=!!(k._key&&_globalKmlStyles[k._key]);
  const role=window.GithubLayers?.role(k),source=role?'GITHUB · '+(role==='boundaries'?'GRANICE':'PUTEVI'):k._key?'SERVER':'LOKALNI FAJL';
  return '<article class="le-layer-card'+(k.vis?'':' hidden-layer')+'" data-layer="'+i+'"><div class="le-card-main">'+_layerPreview(i,true)+'<div class="le-card-info"><small>'+source+'</small><b>'+_escHtml(k.name)+'</b><span>'+meta+'</span><span>'+Number(k.weight??2)+' px · '+Math.round((k.opacity??.9)*100)+'% linija'+fill+'</span></div></div><div class="le-card-actions"><button type="button" onclick="_glKmlToggleEdit('+i+')" aria-expanded="'+(_kmlEditIdx===i)+'">'+(_kmlEditIdx===i?'Zatvori stil':'Uredi stil')+'</button><button type="button" onclick="_ozZoomKml('+i+')">Na kartu</button><button type="button" class="oz-vis-btn'+(k.vis?' on':'')+'" onclick="togK('+i+')" aria-label="'+(k.vis?'Sakrij':'Prikaži')+' '+_escHtml(k.name)+'" title="'+(k.vis?'Sakrij':'Prikaži')+'"><svg class="ic"><use href="#ic-'+(k.vis?'prikazi':'sakrij')+'"/></svg></button>'+(canReset?'<button type="button" onclick="resetLayerToGlobal('+i+')" aria-label="Vrati zadani stil" title="Vrati zadani stil">↻</button>':'')+'</div></article>';
}
function _layerStyleControls(i) {
  const k=kmlLs[i];if(!k)return '';
  const palette=(prop,col)=>'<div class="le-colors">'+_LE_COLORS.map(c=>'<button type="button" class="le-swatch" aria-label="'+(prop==='fillCol'?'Boja ispune ':'Boja ')+c+'" aria-pressed="'+(col===c)+'" style="--swatch:'+c+'" onclick="_layerStyleChange('+i+',\''+prop+'\',\''+c+'\')"></button>').join('')+'<label class="le-custom">Druga boja<input type="color" aria-label="'+(prop==='fillCol'?'Prilagođena boja ispune':'Prilagođena boja')+'" value="'+_layerColor(col)+'" onchange="_layerStyleChange('+i+',\''+prop+'\',this.value)"></label></div>';
  const range=(prop,label,min,max,step,value,unit)=>'<label class="le-range"><span>'+label+'<output>'+value+unit+'</output></span><input type="range" aria-label="'+label+'" min="'+min+'" max="'+max+'" step="'+step+'" value="'+value+'" oninput="this.previousElementSibling.querySelector(\'output\').textContent=this.value+\''+unit+'\';_layerStyleChange('+i+',\''+prop+'\',this.value,false)" onchange="_layerStyleChange('+i+',\''+prop+'\',this.value)"></label>';
  const hasPoly=_kmlGrpHasPolygon(i),lineOpacity=Math.round((k.opacity??.9)*100),fillOpacity=Math.round((k.fillOpacity??.35)*100);
  const dashes=[['','Puna'],['6 4','Isprekidana'],['12 6','Duge crte'],['2 4','Tačkasta']];
  return '<div class="le-style" data-layer="'+i+'">'+_layerPreview(i)+
    (hasPoly?'<div class="le-presets"><button type="button" onclick="_layerPreset('+i+',\'outline\')" aria-pressed="'+(!k.fill||k.fillOpacity===0)+'">Samo obrub</button><button type="button" onclick="_layerPreset('+i+',\'filled\')" aria-pressed="'+(k.fill&&k.fillOpacity>0)+'">Obrub i ispuna</button></div>':'')+
    '<section class="le-section"><h4><span class="le-step">1</span> Linija i obrub</h4><label class="le-caption">Boja linije</label>'+palette('col',k.col)+range('weight','Debljina',.5,12,.5,k.weight??2,' px')+'<div class="le-options">'+dashes.map(([v,l])=>'<button type="button" aria-pressed="'+((k.dash||'').replaceAll(',',' ')===v)+'" onclick="_layerStyleChange('+i+',\'dash\',\''+v+'\')">'+l+'</button>').join('')+'</div>'+range('opacity','Vidljivost linije',0,100,1,lineOpacity,'%')+'</section>'+
    (hasPoly?'<section class="le-section"><h4><span class="le-step">2</span> Ispuna poligona</h4><label class="le-switch"><span><b>Uključi ispunu</b><small>Prozirna površina ostaje klikabilna</small></span><input type="checkbox" '+(k.fill?'checked':'')+' onchange="_layerStyleChange('+i+',\'fill\',this.checked)"></label><div class="le-fill-controls"'+(k.fill?'':' hidden')+'><label class="le-caption">Boja ispune</label>'+palette('fillCol',k.fillCol||k.col)+range('fillOpacity','Jačina ispune',0,100,1,fillOpacity,'%')+'<small class="le-note">0%: potpuno prozirno. Dodir poligona otvara informacije.</small><details class="le-patterns"><summary>Uzorak ispune</summary><div class="le-options">'+_LE_PATTERNS.map(([v,l])=>'<button type="button" aria-pressed="'+((k.fillPattern||'solid')===v)+'" onclick="_layerStyleChange('+i+',\'fillPattern\',\''+v+'\')">'+l+'</button>').join('')+'</div></details></div></section>':'')+'</div>';
}
function _layerStyleRefresh(i) {
  document.querySelectorAll('.le-style[data-layer="'+i+'"]').forEach(el=>{
    const focus=el.contains(document.activeElement)?document.activeElement.getAttribute('aria-label'):null;
    const open=!!el.querySelector('.le-patterns[open]'),wrapper=document.createElement('div');wrapper.innerHTML=_layerStyleControls(i);
    const next=wrapper.firstElementChild;el.replaceWith(next);if(open)next.querySelector('.le-patterns')?.setAttribute('open','');
    if(focus)Array.from(next.querySelectorAll('[aria-label]')).find(e=>e.getAttribute('aria-label')===focus)?.focus({preventScroll:true});
  });
  document.querySelectorAll('.le-layer-card[data-layer="'+i+'"]').forEach(el=>{el.outerHTML=_layerCardHtml(i);});
  _layerPopupLayout();
}
function _layerStyleChange(i,prop,value,commit=true) {
  const k=kmlLs[i];if(!k)return;
  if(['opacity','fillOpacity'].includes(prop))value=Math.max(0,Math.min(1,Number(value)/100));
  else if(prop==='weight')value=Math.max(.5,Math.min(12,Number(value)));
  else if(['col','fillCol'].includes(prop)){if(!/^#[a-f\d]{6}$/i.test(value))return;}
  else if(prop==='fill')value=!!value;
  else if(prop==='fillPattern'){if(!_LE_PATTERNS.some(p=>p[0]===value))return;}
  else if(prop==='dash'){if(!['','6 4','12 6','2 4'].includes(value))return;}
  else return;
  if(typeof value==='number'&&!Number.isFinite(value))return;
  k[prop]=value;
  const pending=_lePendingStyles.get(k);if(pending&&typeof cancelAnimationFrame==='function')cancelAnimationFrame(pending);
  _lePendingStyles.delete(k);
  const apply=()=>{_lePendingStyles.delete(k);const index=kmlLs.indexOf(k);if(index<0)return;applyKmlStyle(index);document.querySelectorAll('.le-style[data-layer="'+index+'"] .le-preview').forEach(e=>e.outerHTML=_layerPreview(index));};
  if(!commit&&typeof requestAnimationFrame==='function'){_lePendingStyles.set(k,requestAnimationFrame(apply));return;}
  apply();
  if(!commit)return;
  try {saveKmlStyles();}catch(e){showToast('⚠ Stil nije sačuvan — provjeri memoriju telefona');return;}
  _layerStyleRefresh(i);
  if(typeof GithubLayers!=='undefined')GithubLayers.render();
}
function _layerPreset(i,mode) {
  const k=kmlLs[i];if(!k)return;
  k.fill=mode==='filled';if(k.fill&&(k.fillOpacity??0)===0)k.fillOpacity=.2;
  _layerStyleChange(i,'fill',k.fill);
}
function _layerEditorHtml(i) {
  const k=kmlLs[i];if(!k)return '';
  return '<section class="le-editor" onclick="event.stopPropagation()"><header class="le-heading"><span>STIL I PODACI FAJLA</span><b>'+_escHtml(k.name)+'</b><small>Promjene se odmah vide na karti i pamte na telefonu.</small></header>'+_layerStyleControls(i)+'<details class="le-file-details"><summary>Naziv i oznaka fajla</summary><div class="le-fields"><label>Naziv fajla<input type="text" maxlength="160" value="'+_escHtml(k.name)+'" onchange="_kmlSetNameR('+i+',this.value)"></label><label>Odjel / oznaka<input type="text" maxlength="80" value="'+_escHtml(k.tag||'')+'" placeholder="npr. Odjel 105" onchange="_kmlSaveTag('+i+',this.value)"></label></div></details><div class="le-actions"><button type="button" onclick="_ozZoomKml('+i+')">Prikaži na karti</button><button type="button" class="le-danger" onclick="_layerRemove('+i+')">Ukloni sloj</button></div></section>';
}
function _layerInfo(layer) {
  const attrs=new Map(Object.entries(layer._kmlExtData||{})),description=String(layer._kmlDesc||'');
  let text=description;
  if(/<[a-z][\s\S]*>/i.test(description)){
    const doc=new DOMParser().parseFromString(description,'text/html');
    doc.querySelectorAll('script,style,iframe,object,embed,img,link').forEach(e=>e.remove());
    doc.querySelectorAll('tr').forEach(tr=>{const cells=tr.querySelectorAll('td,th');if(cells.length>=2){const key=cells[0].textContent.trim(),value=cells[1].textContent.trim();if(key&&!attrs.has(key))attrs.set(key,value);}});
    doc.querySelectorAll('table').forEach(e=>e.remove());text=doc.body.textContent.trim();
  }
  return {attrs:[...attrs],text};
}
function _layerPopupHtml(layer,uid) {
  const esc=s=>_escHtml(String(s??'')),i=_kmlPopFindIdx(uid),k=kmlLs[i],info=_layerInfo(layer),attrs=info.attrs;
  const type=layer._kmlIsPolygon?'Poligon':layer._kmlIsPoint?'Tačka':'Linija';
  let measure='';
  try{const feature=layer.toGeoJSON();if(layer._kmlIsPolygon&&typeof turf!=='undefined')measure=(turf.area(feature)/10000).toFixed(2).replace('.',',')+' ha';else if(!layer._kmlIsPoint&&typeof turf!=='undefined')measure=Math.round(turf.length(feature,{units:'kilometers'})*1000)+' m';}catch(e){}
  return '<article class="le-popup" onclick="event.stopPropagation()"><header class="le-heading"><span>'+type+' · '+esc(k?.name||'Učitani sloj')+'</span><b id="'+uid+'-nm">'+esc(layer._kmlName||'Bez naziva')+'</b></header>'+
    (measure?'<div class="le-object-measure">'+esc(measure)+'<span>Izračunato iz geometrije</span></div>':'')+
    (info.text?'<p class="le-description">'+esc(info.text)+'</p>':'')+
    (attrs.length?'<details class="le-attributes" open><summary>Informacije o objektu ('+attrs.length+')</summary><dl>'+attrs.map(([key,value])=>'<div><dt>'+esc(key)+'</dt><dd>'+esc(value||'—')+'</dd></div>').join('')+'</dl></details>':'')+
    '<div class="le-actions"><button type="button" onclick="_kmlPopEditStart(\''+uid+'\')">Naziv i opis</button><button type="button" onclick="_kmlPopStyleToggle(\''+uid+'\')">Stil fajla</button><button type="button" onclick="_kmlPopZoom(\''+uid+'\')">Približi</button></div>'+
    '<div id="'+uid+'-edit" class="le-fields" style="display:none"><label>Naziv objekta<input id="'+uid+'-name-in" maxlength="160" value="'+esc(layer._kmlName)+'"></label><label>Opis / napomena<textarea id="'+uid+'-desc-in" rows="3" maxlength="2000">'+esc(layer._kmlDesc)+'</textarea></label><small>'+(k?._key?'Izmjena naziva i opisa važi za ovaj prikaz server fajla.':'Naziv i opis čuvaju se u lokalnom fajlu.')+'</small><div class="le-actions"><button type="button" onclick="_kmlPopSave(\''+uid+'\')">'+(k?._key?'Primijeni':'Sačuvaj')+'</button><button type="button" onclick="_kmlPopCancel(\''+uid+'\')">Odustani</button></div></div>'+
    '<div id="'+uid+'-style" style="display:none">'+_layerStyleControls(i)+'</div></article>';
}

// Leaflet update() ponovo postavlja HTML i uklanja otvorene kontrole.
// Nakon promjene sadržaja izmjeri postojeći DOM i pomjeri popup u vidljivi dio.
function _layerPopupLayout() {
  const popup=map._popup;if(!popup)return;
  const element=popup.getElement(),content=element?.querySelector('.leaflet-popup-content');
  if(content)content.style.maxHeight=Math.max(80,Math.min(500,window.innerHeight*.64,map.getSize().y-100))+'px';
  popup._updateLayout();popup._updatePosition();
  // Mjeri stvarni prozor nakon proširenja; CSS max-height nije Leaflet maxHeight.
  const box=element.getBoundingClientRect(),area=map.getContainer().getBoundingClientRect(),pad=12,topPad=56;
  const dx=box.left<area.left+pad?box.left-area.left-pad:Math.max(0,box.right-area.right+pad);
  const dy=box.top<area.top+topPad?box.top-area.top-topPad:Math.max(0,box.bottom-area.bottom+pad);
  if(dx||dy)map.panBy([dx,dy],{animate:false});
}

async function _layerRemove(i) {
  const k=kmlLs[i],owner=sbUser?.id;if(!k)return;
  if(!await _dlgConfirm(k._key?'Ukloniti offline kopiju? Fajl ostaje na serveru.':'Trajno ukloniti lokalni sloj s telefona?',{danger:true})||sbUser?.id!==owner)return;
  const current=kmlLs.indexOf(k);if(current<0)return;
  if(k._key)await _srvDelete([k._key]);else delK(current);
}
