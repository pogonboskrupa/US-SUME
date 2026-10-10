// Dijagnostičke reprodukcije nalaza iz ANALIZA_KODA_2026-10-03.md.
// Izvršavaju stvarne izdvojene funkcije uz lažne zavisnosti, bez mreže.
// Očekuju opisano NEISPRAVNO ponašanje verzije 2.1.7; nisu regresije za budući fix.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const root=path.resolve(__dirname,'../..'),html=fs.readFileSync(path.join(root,'index.html'),'utf8');
function fn(name,source=html){const m=source.match(new RegExp('(?:async )?function '+name+'\\('));assert(m,name);let d=0;for(let i=source.indexOf('{',m.index);i<source.length;i++){d+=source[i]==='{';d-=source[i]==='}';if(!d)return source.slice(m.index,i+1);}throw Error(name);}
function env(names,data){const e={console,...data};vm.createContext(e);vm.runInContext(names.map(n=>fn(n)).join('\n'),e);return e;}
const cases=[];const probe=(part,id,run)=>cases.push({part,id,run});
probe('1','A1: stopRec potvrđuje čuvanje i briše snapshot iako flush vrati false',async()=>{
 const store=new Map([['crash','snapshot']]),messages=[],noop=()=>{},el={classList:{remove(){}},style:{}};
 const e=env(['stopRec','_crashClearVlaka'],{recOn:true,recPaused:true,actI:0,vlake:[{nm:'T1',pts:[{},{}]}],_CRASH_VLAKA_KEY:'crash',localStorage:{removeItem:k=>store.delete(k)},_recSegStart:0,_recTimeTimer:null,_recSesijaMs:10,_recPauseWin:[],_precizActive:false,_vlakaSaveTimers:{},bufLayers:[],clearTimeout:noop,
 document:{getElementById:()=>el},_pauziZavrsi:noop,_setFreeView:noop,_clearRecPreview:noop,_clearGpsGapMarkers:noop,_kfReset:noop,_stopGpsWatchdog:noop,_bgRecStopIfIdle:noop,_crashStopIfIdle:noop,updateVlakaLabel:noop,sbFlushVlaka:async()=>false,_OL:{loadQueue:()=>[]},showToast:m=>messages.push(m),_updRecStatusBar:noop,_showLagerDlg:noop,_updFabVisibility:noop});
 e.stopRec();await Promise.resolve();assert.equal(store.has('crash'),false);assert.equal(e.recOn,false);assert(messages.some(m=>m.includes('sačuvana')));return {snapshotPostoji:store.has('crash'),snimanjeAktivno:e.recOn,poruka:messages[0]};
});
probe('1','A2: nastavak od sredine odsiječe tačke prije pokušaja GPS starta',()=>{
 let scheduled=0,starts=0;const e=env(['_nastaviOdTacke'],{vlake:[{nm:'T1',pts:Array.from({length:5},(_,i)=>({la:i,lo:i})),poly:{setLatLngs(){}}}],_clearNastaviMarkers(){},scheduleVlakaSave(){scheduled++;},selI(){},togRec(){starts++;return false;},showToast(){}});
 e._nastaviOdTacke(0,1);assert.equal(e.vlake[0].pts.length,2);assert.equal(scheduled,1);return {prije:5,poslije:e.vlake[0].pts.length,pokusajStarta:starts};
});
probe('2','B1: 23505 druge UNIQUE provjere pretvara se u potvrdu nepostojećeg ID-ja',async()=>{
 let queries=0;const e=env(['_dozUpisiZonu'],{sb:{from(){queries++;return{insert(){return this;},select(){return this;},single:async()=>({data:null,error:{code:'23505',message:'duplicate other_unique_constraint'}})};}}});
 const r=await e._dozUpisiZonu({id:'novi-nepostojeci-id',project_id:'P'});assert.equal(r.error,null);assert.equal(r.data.id,'novi-nepostojeci-id');assert.equal(queries,1);return {vracenaPotvrda:r,brojUpita:queries,provjeraPostojecegReda:false};
});
probe('2','B2: lista odjela bez paginacije zamijeni potpun keš kraćim uspješnim odgovorom',async()=>{
 const projects=Array.from({length:3},(_,i)=>({id:'P'+i,created_by:'A'}));let saved=null,calls=0;
 const e=env(['dozLoadOdjeli'],{sbUser:{id:'A'},document:{getElementById:()=>({innerHTML:''})},_OL:{DOZ_ODJELI:'odjeli',load:()=>projects,save(k,v){saved=v;return true;}},_mrezaProbaj:()=>true,dozRenderOdjeli(){},_dozRenderOverview(){},showToast(){},sb:{from(table){calls++;const q={select:()=>q,eq:()=>q,order:()=>q,or:()=>q,then(ok){return Promise.resolve({data:table==='doz_projects'?projects.slice(0,2):[],error:null}).then(ok);}};return q;}}});
 const success=await e.dozLoadOdjeli();assert.equal(success,true);assert.equal(saved.length,2);assert.equal(calls,2);return {prije:3,sacuvano:saved.length,potvrdjenUspjeh:success};
});
probe('2','B3: niži max-rows u provjeri GPS serije može napraviti duplikat',async()=>{
 const rows=[0,1000,2000].map(t=>({recorded_at:new Date(t).toISOString(),latitude:44+t/100000,longitude:16}));let inserted=[];
 const e=env(['_dozTackaKljuc','_dozPosaljiKomad'],{sb:{from(){let insert=false;const q={select:()=>q,eq:()=>q,gte:()=>q,lte:()=>q,limit:()=>q,insert(p){inserted=p;insert=true;return q;},then(ok){return Promise.resolve({data:insert?null:rows.slice(0,2),error:null}).then(ok);}};return q;}}});
 const input=[rows[0],rows[2]].map((r,i)=>({...r,_qid:'q'+i,user_id:'A',project_id:'P'}));const result=await e._dozPosaljiKomad(input);
 assert.equal(inserted.length,1);assert.equal(inserted[0].recorded_at,rows[2].recorded_at);assert.equal(result.ok.length,2);return {vecPostoji:rows.length,ponovoUbacenih:inserted.length,potvrdjeno:result.ok.length};
});
probe('3','C1: oznaka učitanog KML-a briše drugi sloj koji nije obnovljen',async()=>{
 const storage=new Map([['local',JSON.stringify({'A.kml':{cacheKey:'A'},'B.kml':{cacheKey:'B'}})]]),deleted=[],warnings=[];
 const e=env(['_localKmlRestore','_localKmlSaveAll','saveKmlStyles','_kmlSaveTag'],{console:{warn:(...x)=>warnings.push(x)},sbUser:{id:'U'},_LOCAL_KML_KEY:'local',_KML_USER_STYLES_KEY:'styles',kmlLs:[{name:'A.kml',col:'#000',vis:true}],localStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)},_kmlcGet:async()=>{throw Error('Privremeno nedostupan IDB');},_kmlcDelete:async k=>deleted.push(k),_glCollapsed:new Set(),rndGraniceModal(){},document:{getElementById:()=>({style:{display:'none'}})}});
 await e._localKmlRestore();assert.equal(warnings.length,1);assert.equal(Object.keys(JSON.parse(storage.get('local'))).length,2);
 e._kmlSaveTag(0,'105');assert.deepEqual(Object.keys(JSON.parse(storage.get('local'))),['A.kml']);assert.deepEqual(deleted,['B']);return {nakonGreskeObnove:2,nakonUredjivanja:1,obrisaniSadrzaj:deleted};
});
probe('3','C2: odbijeni cache.put izlazi iz try/catch kao neobrađena Promise greška',async()=>{
 const sw=fs.readFileSync(path.join(root,'sw.js'),'utf8');let response,unhandled;
 const listener=error=>{unhandled=error;};process.once('unhandledRejection',listener);
 try {
  const resp={ok:true,clone(){return this;}},failure=Object.assign(Error('Pun keš pločica'),{name:'QuotaExceededError'});
  const e={caches:{open:async()=>({match:async()=>null,put:()=>Promise.reject(failure)})},fetch:async()=>resp};vm.createContext(e);vm.runInContext(fn('_tileRespond',sw),e);
  e._tileRespond({request:'tile',respondWith:p=>{response=p;}},'tiles');assert.equal(await response,resp);
  await new Promise(resolve=>setImmediate(resolve));assert.equal(unhandled,failure);return {mrezniOdgovor:'uspjeh',neobradjenaGreska:unhandled.name};
 } finally {process.removeListener('unhandledRejection',listener);}
});
probe('3','C3: stari odgovor rute poništi novi izbor nakon otkazivanja',async()=>{
 let resolveRoute,drawn;const pending=new Promise(r=>{resolveRoute=r;}),old=[{la:44,lo:16},{la:45,lo:17}];
 const e=env(['_guideFinish','_guideCancel'],{_guideOn:true,_guidePts:old,_guideMarkers:[],_guidePreviewLine:null,_guideMinPts:0,showToast(){},_mrezaProbaj:()=>true,_guideOsrmRoute:()=>pending,_fetchProfileElev:async()=>null,_guideEtaHtml:()=>({html:'',durTxt:'1 min'}),_guideSimplify:p=>p,_guideSaveRoute(){},_guideDrawResult:p=>{drawn=p;},_renderElevProfile(){},fmtL:String,document:{getElementById:()=>({style:{}})},_updFabVisibility(){}});
 const work=e._guideFinish();e._guideCancel();e._guideOn=true;e._guidePts=[{la:46,lo:18}];resolveRoute({pts:old,distM:1000,durS:60,osrm:true});await work;
 assert.equal(e._guideOn,false);assert.equal(e._guidePts.length,0);assert.equal(drawn,old);return {noviIzborAktivan:e._guideOn,noveTacke:e._guidePts.length,prikazanaStaraRuta:true};
});
probe('3','C4: fotografija dobije potvrdu iako puna slika nije trajno sačuvana',async()=>{
 const store=new Map(),messages=[];const e=env(['onLocPhotoSelected','_saveFotos','_restoreFotos'],{_fotoSnapPos:{la:44,lo:16},_locFotos:[],_FOTO_KEY:'photos',localStorage:{getItem:k=>store.get(k),setItem:(k,v)=>store.set(k,v)},showToast:m=>messages.push(m),_resizeImg:async(f,size)=>size===60?'thumbnail':'full-image',_buildFotoMarker:()=>({}),_kmlcSave:async()=>{throw Error('IDB quota');},_kmlcGet:async()=>null,map:{panTo(){}}});
 await e.onLocPhotoSelected({files:[{}],value:'camera'});assert(messages.some(m=>m.includes('Foto dodano')));assert(!messages.some(m=>m.includes('Greška')||m.includes('Premalo')));
 e._locFotos=[];e._restoreFotos();await Promise.resolve();assert.equal(e._locFotos.length,1);assert.equal(e._locFotos[0].full,null);return {poruka:messages.at(-1),poslijePonovnogOtvaranja:{thumbnail:e._locFotos[0].thumb,punaSlika:e._locFotos[0].full}};
});
(async()=>{const selected=process.argv[2];for(const c of cases){if(selected&&selected!==c.part)continue;console.log('POTVRĐEN NALAZ',c.id,JSON.stringify(await c.run()));}})().catch(e=>{console.error(e);process.exitCode=1;});
