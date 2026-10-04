/* Referentna karta: obavezna oznaka T + broj, pregled prije uvoza, offline OCR u APK-u. */
(function(root){
'use strict';
let generation=0,request=0,pending=null,rows=[],snapshot='',manual=[],marking=null,quickHidden=false,importing=false;
const $=id=>document.getElementById(id),say=s=>showToast(s),pause=()=>new Promise(r=>setTimeout(r,20));
function nameOf(text){const m=String(text||'').trim().match(/^T\s*[-–]?\s*([1-9]\d{0,3})$/i);return m?'T'+Number(m[1]):null;}
function validBox(w){return w&&[w.x0,w.y0,w.x1,w.y1].every(Number.isFinite)&&w.x1>w.x0&&w.y1>w.y0;}
function labelsFromWords(words){
 const all=words.filter(validBox),found=[];
 const add=(w,nm)=>{if(!nm)return;const cx=(w.x0+w.x1)/2,cy=(w.y0+w.y1)/2;if(found.some(f=>f.nm===nm&&Math.hypot((f.x0+f.x1)/2-cx,(f.y0+f.y1)/2-cy)<Math.max(12,w.y1-w.y0)))return;found.push({...w,nm});};
 for(const w of all){add(w,nameOf(w.text));if(!/^T$/i.test(w.text?.trim()))continue;
  const candidates=all.filter(n=>n!==w&&n.line===w.line&&/^\d{1,4}$/.test(n.text?.trim())).map(n=>({n,d:Math.hypot(Math.max(0,w.x0-n.x1,n.x0-w.x1),Math.max(0,w.y0-n.y1,n.y0-w.y1))})).sort((a,b)=>a.d-b.d);
  if(candidates.length){const {n,d}=candidates[0],height=Math.min(Math.max(w.x1-w.x0,w.y1-w.y0),Math.max(n.x1-n.x0,n.y1-n.y0));if(d<=height*.9&&(!candidates[1]||candidates[1].d>d+height*.3))add({x0:Math.min(w.x0,n.x0),x1:Math.max(w.x1,n.x1),y0:Math.min(w.y0,n.y0),y1:Math.max(w.y1,n.y1),line:w.line},nameOf('T'+n.text));}
 }
 return found;
}
function distanceToPath(point,path){let best=Infinity;for(let i=1;i<path.length;i++){const a=path[i-1],b=path[i],dx=b[0]-a[0],dy=b[1]-a[1],t=Math.max(0,Math.min(1,((point[0]-a[0])*dx+(point[1]-a[1])*dy)/(dx*dx+dy*dy||1)));best=Math.min(best,Math.hypot(point[0]-a[0]-t*dx,point[1]-a[1]-t*dy));}return best;}
function pathLength(p){let len=0;for(let i=1;i<p.length;i++)len+=Math.hypot(p[i][0]-p[i-1][0],p[i][1]-p[i-1][1]);return len;}
function linkPaths(paths,labels,width,height){
 const choices=[];for(const label of labels){const center=[(label.x0+label.x1)/2,(label.y0+label.y1)/2],h=Math.min(45,Math.max(label.y1-label.y0,label.x1-label.x0)/2),radius=Math.max(20,Math.min(width,height)*.035,h*2.5);
  const near=paths.map((path,index)=>({path,index,d:distanceToPath(center,path)})).filter(p=>p.path.length>=2&&pathLength(p.path)>=Math.max(20,h*2)&&p.d<=radius&&!(Math.hypot(p.path[0][0]-p.path.at(-1)[0],p.path[0][1]-p.path.at(-1)[1])<4)).sort((a,b)=>a.d-b.d);
  if(!near.length)continue;const ambiguous=near.length>1&&near[1].d<near[0].d+Math.max(6,h*.6);
  for(const p of near.slice(0,ambiguous?2:1))choices.push({...p,nm:label.nm,ambiguous,manual:!!label.manual,selected:!ambiguous});
 }
 // Jedna linija sa različitim brojevima je nejasna; nijedan broj se ne bira automatski.
 for(const r of choices)if(choices.some(s=>s.index===r.index&&s.nm!==r.nm)){r.ambiguous=true;r.selected=false;}
 return choices.filter((r,i)=>choices.findIndex(s=>s.nm===r.nm&&s.index===r.index)===i).sort((a,b)=>a.nm.localeCompare(b.nm,'bs',{numeric:true})||a.d-b.d);
}
function currentStamp(){return JSON.stringify([typeof sbUser!=='undefined'?sbUser?.id:null,_aktivniProjektId,_refImg?.src,_refBounds,_refCPs]);}
function pixelToLL(x,y){
 if(_refCPs.length>=2){const pairs=_refCPs.map(cp=>{const p=map.latLngToLayerPoint([cp.lat,cp.lng]);return {x:cp.imgX,y:cp.imgY,X:p.x,Y:p.y};}),M=_refAffineFromPairs(pairs);if(!M)throw Error('Kontrolne tačke nisu validne.');const ll=map.layerPointToLatLng(L.point(M.a*x+M.c*y+M.e,M.b*x+M.d*y+M.f));return [ll.lat,ll.lng];}
 const [[s,w],[n,e]]=_refBounds;return [n-y/_refImg.height*(n-s),w+x/_refImg.width*(e-w)];
}
function existingNames(){if(typeof _projektVlakeRows==='function')return new Set(_projektVlakeRows().map(r=>r.nm));return new Set(vlake.filter(v=>v.projektId===_aktivniProjektId).map(v=>v.nm));}
function stopMark(){if(marking){map.off('click',marking);marking=null;map.getContainer().style.cursor='';}map.getContainer().classList.remove('reference-marking');if($('refkarta-label-cancel'))$('refkarta-label-cancel').hidden=true;}
function invalidate(newImage=false){generation++;stopMark();if(pending){clearTimeout(pending.timer);pending.reject(Error('Prepoznavanje je otkazano.'));pending=null;}rows=[];snapshot='';_refDetectedLines=[];if(newImage)manual=[];if(_refImpGroup){map.removeLayer(_refImpGroup);_refImpGroup=null;}if($('refkarta-imp-ctrl'))$('refkarta-imp-ctrl').style.display='none';if($('refkarta-results'))$('refkarta-results').replaceChildren();}
function refreshQuick(){
 const button=$('refkarta-quick');if(!button)return;const all=[_refOverlay,...Object.values(_refRepoOverlays)].filter(Boolean),visible=all.some(l=>map.hasLayer(l))&&!quickHidden;button.hidden=!all.length;
 button.textContent=visible?'Ref. karta · Sakrij':'Ref. karta · Prikaži';button.setAttribute('aria-pressed',String(visible));button.title=visible?'Sakrij referentne slike':'Prikaži referentne slike';
 if(map.getPane('refKarte'))map.getPane('refKarte').style.visibility=quickHidden?'hidden':'';
 const cb=$('refkarta-vis');if(cb)cb.checked=!!_refOverlay&&map.hasLayer(_refOverlay)&&!quickHidden;
}
function toggleQuick(){const visible=[_refOverlay,...Object.values(_refRepoOverlays)].filter(Boolean).some(l=>map.hasLayer(l))&&!quickHidden;quickHidden=visible;if(!visible&&_refOverlay){_refVisible=true;_refOverlay.addTo(map);}if(quickHidden)stopMark();refreshQuick();}
function showQuick(){quickHidden=false;refreshQuick();}
function selectRow(id,on){const row=rows[Number(id)];if(!row||row.conflict)return;if(on){for(const r of rows)if(r!==row&&(r.nm===row.nm||r.index===row.index))r.selected=false;}row.selected=!!on;render();}
function render(){
 const box=$('refkarta-results');if(!box)return;const names=existingNames();for(const r of rows){r.conflict=names.has(r.nm);if(r.conflict)r.selected=false;}
 box.innerHTML=rows.map((r,i)=>'<label class="ref-result"><input type="checkbox" data-ref-row="'+i+'" '+(r.selected?'checked ':'')+(r.conflict?'disabled':'')+'><span><b>'+r.nm+'</b><small>'+(r.conflict?'Već postoji u projektu — neće biti prepisana':r.ambiguous?'Više mogućih linija — izaberi pravu':r.manual?'Ručno potvrđena oznaka uz liniju':'Oznaka T + broj uz liniju')+'</small></span><button type="button" data-ref-view="'+i+'">Na karti ↗</button></label>').join('');
 _refDetectedLines=rows.filter(r=>r.selected&&!r.conflict);$('refkarta-imp-count').textContent='('+_refDetectedLines.length+' izabranih / '+rows.length+' prijedloga)';$('refkarta-import-btn').disabled=!_refDetectedLines.length||importing;
 if(_refImpGroup)map.removeLayer(_refImpGroup);_refImpGroup=L.layerGroup();
 for(const r of rows){L.polyline(r.latlngs,{pane:'refDetected',color:r.selected?'#16a34a':'#f97316',weight:r.selected?3:2,dashArray:r.selected?null:'7 5',interactive:false}).bindTooltip(r.nm,{permanent:true,direction:'center',className:'ref-name-label'}).addTo(_refImpGroup);}
 if($('refkarta-imp-vis').checked)_refImpGroup.addTo(map);$('refkarta-imp-ctrl').style.display=rows.length?'':'none';
}
async function addLabel(){
 if(!_refImg||!_refBounds){say('Prvo učitaj i poravnaj referentnu kartu.');return;}
 const text=await _dlgPrompt('Upiši oznaku koju vidiš na papiru, npr. T12:', '',{title:'Oznaka vlake na papiru'});if(text===null)return;const nm=nameOf(text);if(!nm){say('Potrebno je slovo T i cijeli broj vlake, npr. T12.');return;}
 const stamp=currentStamp();stopMark();refKartaSetVisible(true);showQuick();if(typeof switchTab==='function')switchTab('karta');say('Dodirni sredinu cijelog natpisa '+nm+' na referentnoj karti.');map.getContainer().style.cursor='crosshair';map.getContainer().classList.add('reference-marking');$('refkarta-label-cancel').hidden=false;
 marking=e=>{if(currentStamp()!==stamp){stopMark();return;}const p=_refLatLngToImgPx(e.latlng);if(!p||!Number.isFinite(p.imgX)||!Number.isFinite(p.imgY)||p.imgX<0||p.imgY<0||p.imgX>_refImg.width||p.imgY>_refImg.height){say('Dodirni oznaku unutar slike.');return;}
  const h=Math.max(8,Math.min(30,_refImg.height*.025)),w=Math.max(10,nm.length*h*.65);manual.push({text:nm,nm,x0:p.imgX-w,y0:p.imgY-h,x1:p.imgX+w,y1:p.imgY+h,manual:true});stopMark();say(nm+' označena. Pokreni detekciju linija.');$('refkarta-detect-status').textContent=manual.length+' ručno označenih natpisa T + broj.';};map.on('click',marking);
}
function ocr(canvas){if(!root.AndroidReferenceOcr?.recognize)return Promise.resolve([]);const id='ref_'+(++request);return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{if(pending?.id===id)pending=null;reject(Error('Prepoznavanje nije završeno. Pokušaj manji izrez slike ili označi natpise ručno.'));},90000);pending={id,resolve,reject,timer};try{AndroidReferenceOcr.recognize(id,canvas.toDataURL('image/png'));}catch(e){clearTimeout(timer);pending=null;reject(e);}});}
function ocrReply(result){if(!pending||pending.id!==result?.id)return;const p=pending;pending=null;clearTimeout(p.timer);result.error?p.reject(Error(result.error)):p.resolve(Array.isArray(result.words)?result.words:[]);}
async function detect(options){
 invalidate();const ticket=generation,stamp=currentStamp(),source=_refImg,status=$('refkarta-detect-status'),alive=()=>ticket===generation&&stamp===currentStamp()&&source===_refImg;
 const scale=Math.min(1,2400/Math.max(source.width,source.height),Math.sqrt(3600000/(source.width*source.height))),W=Math.round(source.width*scale),H=Math.round(source.height*scale),canvas=document.createElement('canvas');canvas.width=W;canvas.height=H;canvas.getContext('2d').drawImage(source,0,0,W,H);
 status.textContent='Čitam oznake T + broj na uređaju…';const words=await ocr(canvas);if(!alive())return;
 const labels=labelsFromWords(words).concat(manual.map(w=>({...w,x0:w.x0*scale,x1:w.x1*scale,y0:w.y0*scale,y1:w.y1*scale})));if(!labels.length){status.textContent='Nijedna čitljiva oznaka T + broj. Dodaj oznake ručno; granice i ostale linije neće biti uvezene.';say(root.AndroidReferenceOcr?'Oznake nisu pročitane. Ručno označi T + broj.':'Automatsko čitanje oznaka dostupno je u novom APK-u. Ovdje označi T + broj ručno.');return;}
 status.textContent='Pronađeno '+labels.length+' oznaka. Povezujem ih s linijama…';await pause();if(!alive())return;
 const small=Math.min(1,1400/Math.max(W,H)),w=Math.round(W*small),h=Math.round(H*small),lineCanvas=document.createElement('canvas');lineCanvas.width=w;lineCanvas.height=h;const ctx=lineCanvas.getContext('2d');ctx.drawImage(canvas,0,0,w,h);const data=ctx.getImageData(0,0,w,h).data,bin=new Uint8Array(w*h);
 for(let i=0;i<bin.length;i++){const r=data[i*4],g=data[i*4+1],b=data[i*4+2];bin[i]=data[i*4+3]>100&&(options.mode==='color'?Math.hypot(r-options.color[0],g-options.color[1],b-options.color[2])<options.tolerance:.299*r+.587*g+.114*b<options.threshold)?1:0;}
 // Tekst prvo čitamo, zatim uklanjamo iz maske linija. Ručna oznaka je samo tačka.
 for(const word of words.filter(validBox).concat(labels.filter(l=>l.manual))){const x0=Math.max(0,Math.floor(word.x0*small)-2),x1=Math.max(0,Math.min(w,Math.ceil(word.x1*small)+2)),y0=Math.max(0,Math.floor(word.y0*small)-2),y1=Math.max(0,Math.min(h,Math.ceil(word.y1*small)+2));for(let y=y0;y<y1;y++)bin.fill(0,y*w+x0,y*w+x1);}
 const ring=typeof ProjectTerrain!=='undefined'?ProjectTerrain.dataFor()?.ring:null,boundary=ring||graniceOdjeli[0]?.ring;
 if(boundary){const mask=document.createElement('canvas');mask.width=w;mask.height=h;const mx=mask.getContext('2d');mx.beginPath();boundary.forEach((p,i)=>{const q=_refLatLngToImgPx(L.latLng(p)),x=q.imgX*scale*small,y=q.imgY*scale*small;i?mx.lineTo(x,y):mx.moveTo(x,y);});mx.closePath();mx.fillStyle='#fff';mx.fill();mx.globalCompositeOperation='destination-out';mx.lineWidth=Math.max(5,w*.009);mx.stroke();const md=mx.getImageData(0,0,w,h).data;for(let i=0;i<bin.length;i++)if(!md[i*4+3])bin[i]=0;}
 _refRemoveSmallComponents(bin,w,h,Math.max(12,w*.012));if(options.bold)_refBoldFilter(bin,w,h,options.bold);await pause();if(!alive())return;
 _zhangSuenThin(bin,w,h);let paths=_traceSkeleton(bin,w,h,Math.max(8,Math.round(options.minLength*scale*small)));if(options.join)paths=_refJoinPaths(paths,Math.max(2,options.join*scale*small));
 const scaledLabels=labels.map(l=>({...l,x0:l.x0*small,x1:l.x1*small,y0:l.y0*small,y1:l.y1*small}));const linked=linkPaths(paths,scaledLabels,w,h);if(!alive())return;
 rows=linked.map(r=>({...r,latlngs:r.path.map(p=>pixelToLL(p[0]/(scale*small),p[1]/(scale*small)))}));snapshot=stamp;
 if(!map.getPane('refDetected'))map.createPane('refDetected');Object.assign(map.getPane('refDetected').style,{zIndex:'625',pointerEvents:'none'});$('refkarta-imp-vis').checked=true;render();status.textContent=labels.length+' oznaka · '+rows.length+' prijedloga uz oznake · ostale linije odbačene. Provjeri izbor na karti.';if(!rows.length)say('Oznake su pročitane, ali linije nisu povezane. Probaj crne/plave linije, manju debljinu ili jasniju sliku.');
}
async function importSelected(){
 if(importing)return;if(!_aktivniProjektId||currentStamp()!==snapshot){invalidate();say('Aktiviraj projekat i ponovi detekciju nakon promjene karte/projekta.');return;}render();const chosen=rows.filter(r=>r.selected&&!r.conflict&&nameOf(r.nm));if(!chosen.length)return;
 const stamp=snapshot;importing=true;try{if(!await _dlgConfirm('Pretvoriti '+chosen.map(r=>r.nm).join(', ')+' u vlake aktivnog projekta? Provjeri da su to trase s papira.'))return;if(currentStamp()!==stamp){say('Projekat ili poravnanje karte se promijenilo. Ponovi detekciju.');return;}
 const existing=existingNames();if(chosen.some(r=>existing.has(r.nm))){render();say('Broj vlake već postoji. Pregledaj izbor ponovo.');return;}
 const created=[];try{for(const r of chosen){const color=getBojaVlake(),poly=L.polyline(r.latlngs,{color,weight:getVlakaWeight(),dashArray:getVlakaDashArray(),lineCap:getVlakaLineCap(),vlakaOutline:typeof getVlakaOutline==='function'?getVlakaOutline():false,opacity:.9,pane:'vlakeLines',renderer:_vlakeRenderer}).addTo(map);poly.bindTooltip(r.nm,{sticky:true});attachPolyClick(poly);const v={nm:r.nm,br:Number(r.nm.slice(1)),kr:0,strana:null,color,lager:'',pts:r.latlngs.map(([la,lo])=>({la,lo,al:0})),poly,wpts:[],sbId:null,projektId:_aktivniProjektId,projektantIme:getIme(),labelMk:null,lagerMk:null,extraLabels:[],updatedAt:new Date().toISOString()};vlake.push(v);created.push(v);}
 if(!_saveLocalVlake())throw Error('Lokalni upis nije uspio. Rezultati ostaju za ponovni pokušaj.');
 }catch(e){for(const v of created){map.removeLayer(v.poly);const i=vlake.indexOf(v);if(i>=0)vlake.splice(i,1);}say(e.message);return;}
 for(const v of created){const i=vlake.indexOf(v);updateVlakaLabel(i);sbFlushVlaka(i);}invalidate();rndList();updBan();updOvl();updProjStats();_updVlakeMapVisibility();say('Sačuvano '+created.length+' vlaka s izvornim T brojevima.');
 }finally{importing=false;if(rows.length)render();}
}
function view(id){const r=rows[Number(id)];if(!r)return;if(typeof switchTab==='function')switchTab('karta');map.fitBounds(L.latLngBounds(r.latlngs),{padding:[30,40],maxZoom:19});}
root.ReferenceVlake={nameOf,labelsFromWords,distanceToPath,linkPaths,pixelToLL,detect,ocrReply,addLabel,stopMark,isMarking:()=>!!marking,invalidate,refreshQuick,toggleQuick,showQuick,importSelected,selectRow,view};
if(typeof module!=='undefined'&&module.exports)module.exports=root.ReferenceVlake;
if(typeof document!=='undefined'){document.addEventListener('change',e=>{if(e.target.dataset?.refRow!==undefined)selectRow(e.target.dataset.refRow,e.target.checked);});document.addEventListener('click',e=>{const b=e.target.closest('[data-ref-view]');if(b)view(b.dataset.refView);});document.addEventListener('keydown',e=>{if(e.key==='Escape')stopMark();});}
})(typeof window!=='undefined'?window:globalThis);
