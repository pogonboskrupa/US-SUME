// Uređivanje učitanih slojeva: iste kontrole u listi i popupu na karti.
'use strict';
const _LE_COLORS=['#ef4444','#f97316','#eab308','#22c55e','#06b6d4','#3b82f6','#8b5cf6','#ffffff','#94a3b8','#000000'];
const _LE_PATTERNS=[['solid','Puna'],['diagonal','Kosa /'],['diagonal-rev','Kosa \\'],['crosshatch','Mreža'],['horizontal','Vodoravna'],['vertical','Uspravna'],['dots','Tačke']];
function _layerStyleControls(i) {
  const k=kmlLs[i];if(!k)return '';
  const esc=s=>_escHtml(String(s??'')), color=c=>/^#[a-f\d]{6}$/i.test(c)?c:'#22c55e';
  const palette=(prop,col)=>'<div class="le-colors">'+_LE_COLORS.map(c=>'<button type="button" class="le-swatch" aria-label="Boja '+c+'" aria-pressed="'+(col===c)+'" style="--swatch:'+c+'" onclick="_layerStyleChange('+i+',\''+prop+'\',\''+c+'\')"></button>').join('')+'<label class="le-custom">Druga boja<input type="color" aria-label="Prilagođena boja" value="'+color(col)+'" onchange="_layerStyleChange('+i+',\''+prop+'\',this.value)"></label></div>';
  const range=(prop,label,min,max,step,value,unit)=>'<label class="le-range"><span>'+label+'<output>'+value+unit+'</output></span><input type="range" aria-label="'+label+'" min="'+min+'" max="'+max+'" step="'+step+'" value="'+value+'" oninput="this.previousElementSibling.querySelector(\'output\').textContent=this.value+\''+unit+'\';_layerStyleChange('+i+',\''+prop+'\',this.value,false)" onchange="_layerStyleChange('+i+',\''+prop+'\',this.value)"></label>';
  const hasPoly=_kmlGrpHasPolygon(i),lineOpacity=Math.round((k.opacity??.9)*100),fillOpacity=Math.round((k.fillOpacity??.35)*100);
  const dashes=[['','Puna'],['6 4','Isprekidana'],['12 6','Duge crte'],['2 4','Tačkasta']];
  return '<div class="le-style" data-layer="'+i+'"><div class="le-preview" aria-label="Pregled stila"><svg viewBox="0 0 260 46" role="img" aria-label="Linija i ispuna"><path d="M12 34 L68 12 L128 30 L192 12 L248 33" fill="none" stroke="'+color(k.col)+'" stroke-width="'+(k.weight||2)+'" stroke-opacity="'+(k.opacity??.9)+'" stroke-dasharray="'+esc(k.dash||'')+'"/></svg><span>Stil cijelog fajla</span></div>'+
    '<section class="le-section"><h4>Linija i obrub</h4>'+palette('col',k.col)+range('weight','Debljina',1,8,.5,k.weight||2,' px')+'<div class="le-options">'+dashes.map(([v,l])=>'<button type="button" aria-pressed="'+((k.dash||'').replaceAll(',',' ')===v)+'" onclick="_layerStyleChange('+i+',\'dash\',\''+v+'\')">'+l+'</button>').join('')+'</div>'+range('opacity','Vidljivost linije',5,100,5,lineOpacity,'%')+'</section>'+
    (hasPoly?'<section class="le-section"><label class="le-switch"><span><b>Ispuna poligona</b><small>Oboji površinu unutar granice</small></span><input type="checkbox" '+(k.fill?'checked':'')+' onchange="_layerStyleChange('+i+',\'fill\',this.checked)"></label>'+(k.fill?palette('fillCol',k.fillCol||k.col)+'<div class="le-options">'+_LE_PATTERNS.map(([v,l])=>'<button type="button" aria-pressed="'+((k.fillPattern||'solid')===v)+'" onclick="_layerStyleChange('+i+',\'fillPattern\',\''+v+'\')">'+l+'</button>').join('')+'</div>'+range('fillOpacity','Jačina ispune',5,100,5,fillOpacity,'%'):'')+'</section>':'')+'</div>';
}
function _layerStyleChange(i,prop,value,commit=true) {
  const k=kmlLs[i];if(!k)return;
  if(['opacity','fillOpacity'].includes(prop))value=Math.max(.05,Math.min(1,Number(value)/100));
  else if(prop==='weight')value=Math.max(1,Math.min(8,Number(value)));
  else if(['col','fillCol'].includes(prop)){if(!/^#[a-f\d]{6}$/i.test(value))return;}
  else if(prop==='fill')value=!!value;
  else if(prop==='fillPattern'){if(!_LE_PATTERNS.some(p=>p[0]===value))return;}
  else if(prop==='dash'){if(!['','6 4','12 6','2 4'].includes(value))return;}
  else return;
  if(typeof value==='number'&&!Number.isFinite(value))return;
  k[prop]=value;applyKmlStyle(i);
  if(!commit)return;
  try {saveKmlStyles();}catch(e){showToast('⚠ Stil nije sačuvan — provjeri memoriju telefona');return;}
  document.querySelectorAll('.le-style[data-layer="'+i+'"]').forEach(el=>{el.outerHTML=_layerStyleControls(i);});
  _layerPopupLayout();
}
function _layerEditorHtml(i) {
  const k=kmlLs[i];if(!k)return '';
  return '<section class="le-editor" onclick="event.stopPropagation()"><header class="le-heading"><span>UREĐIVANJE SLOJA</span><b>'+_escHtml(k.name)+'</b><small>Stil se primjenjuje odmah i čuva na telefonu.</small></header><div class="le-fields"><label>Naziv fajla<input type="text" maxlength="160" value="'+_escHtml(k.name)+'" onchange="_kmlSetNameR('+i+',this.value)"></label><label>Odjel / oznaka<input type="text" maxlength="80" value="'+_escHtml(k.tag||'')+'" placeholder="npr. Odjel 105" onchange="_kmlSaveTag('+i+',this.value)"></label></div>'+_layerStyleControls(i)+'<div class="le-actions"><button type="button" onclick="_ozZoomKml('+i+')">Prikaži na karti</button><button type="button" class="le-danger" onclick="_layerRemove('+i+')">Ukloni sloj</button></div></section>';
}
function _layerPopupHtml(layer,uid) {
  const esc=s=>_escHtml(String(s??'')),i=_kmlPopFindIdx(uid),k=kmlLs[i],attrs=Object.entries(layer._kmlExtData||{});
  const type=layer._kmlIsPolygon?'Poligon':layer._kmlIsPoint?'Tačka':'Linija';
  return '<article class="le-popup" onclick="event.stopPropagation()"><header class="le-heading"><span>'+type+' · '+esc(k?.name||'Učitani sloj')+'</span><b id="'+uid+'-nm">'+esc(layer._kmlName||'Bez naziva')+'</b></header>'+
    (layer._kmlDesc?'<p class="le-description">'+esc(layer._kmlDesc)+'</p>':'')+
    '<div class="le-actions"><button type="button" onclick="_kmlPopEditStart(\''+uid+'\')">Naziv i opis</button><button type="button" onclick="_kmlPopStyleToggle(\''+uid+'\')">Stil fajla</button><button type="button" onclick="_kmlPopZoom(\''+uid+'\')">Približi</button></div>'+
    '<div id="'+uid+'-edit" class="le-fields" style="display:none"><label>Naziv objekta<input id="'+uid+'-name-in" maxlength="160" value="'+esc(layer._kmlName)+'"></label><label>Opis / napomena<textarea id="'+uid+'-desc-in" rows="3" maxlength="2000">'+esc(layer._kmlDesc)+'</textarea></label><small>'+(k?._key?'Izmjena naziva i opisa važi za ovaj prikaz server fajla.':'Naziv i opis čuvaju se u lokalnom fajlu.')+'</small><div class="le-actions"><button type="button" onclick="_kmlPopSave(\''+uid+'\')">'+(k?._key?'Primijeni':'Sačuvaj')+'</button><button type="button" onclick="_kmlPopCancel(\''+uid+'\')">Odustani</button></div></div>'+
    '<div id="'+uid+'-style" style="display:none">'+_layerStyleControls(i)+'</div>'+
    (attrs.length?'<details class="le-attributes"><summary>Atributi objekta ('+attrs.length+')</summary><dl>'+attrs.map(([key,value])=>'<div><dt>'+esc(key)+'</dt><dd>'+esc(value)+'</dd></div>').join('')+'</dl></details>':'')+'</article>';
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
