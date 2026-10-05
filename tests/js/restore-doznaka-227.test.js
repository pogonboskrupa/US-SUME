'use strict';
const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict');
const html=fs.readFileSync('index.html','utf8');
function fn(name){let start=html.indexOf('async function '+name+'(');if(start<0)start=html.indexOf('function '+name+'(');assert(start>=0,name);let depth=0;for(let i=html.indexOf('{',start);i<html.length;i++){if(html[i]==='{')depth++;if(html[i]==='}'&&!--depth)return html.slice(start,i+1);}}
const tests=[];function test(n,f){tests.push([n,f]);}
function storage(){const m=new Map();return {m,getItem:k=>m.get(k)||null,setItem(k,v){if(this.fail===k)throw Error('quota');m.set(k,String(v));},removeItem:k=>m.delete(k)};}
function environment(extra={}){const s={console,Date,Number,Set,Map,JSON,performance:{now:()=>1},setTimeout:f=>f(),localStorage:storage(),sbUser:{id:'A'},showToast:()=>{},...extra};vm.createContext(s);return s;}
function visibility(store,user='A'){
 const s=environment({localStorage:store,sbUser:{id:user},window:{},document:{getElementById:()=>null},_locFotos:[],_sharedFotos:[],_tacke:[],textLabels:[],_tragRegistry:[],_tragLayers:{},_tragHitLayers:{},_tragLenMk:{},_msrSavedLayer:null,_msrRegistry:[],_tragRegSave:()=>{},_tragoviRender:()=>{},_tragRegAddLayer:()=>{},map:{hasLayer:l=>l.visible,removeLayer:l=>l.visible=false,closePopup(){}}});
 vm.runInContext(fs.readFileSync('static/js/map-visibility.js','utf8'),s);return s;
}
test('visibility survives a new app instance, account change and delayed point load',()=>{
 const store=storage();let s=visibility(store);s.window._tvVisibilitySet('all',false);s=visibility(store);
 const marker={visible:true,addTo(){this.visible=true;}};s._tacke.push({marker});s.window._tvVisibilityRestore();assert.equal(marker.visible,false);
 assert.equal(s.window._tvCategoryOn('photos'),false);assert.equal(s.window._tvTrackVisible({id:'new',visible:true}),false);
 s.window._tvTrackSet({id:'one'},true);assert.equal(s.window._tvTrackVisible({id:'one',visible:true}),true);assert.equal(s.window._tvTrackVisible({id:'two',visible:true}),false);
 const again=visibility(store);assert.equal(again.window._tvTrackVisible({id:'one',visible:true}),true);
 assert.equal(visibility(store,'B').window._tvCategoryOn('points'),true);
});
test('chosen online base is never replaced by a saved SQL map',async()=>{
 const s=environment({_sqlLayers:[],_sqlRestoreFailed:[],_SQL_CRASH_KEY:'crash',_mapRestoreIndicatorShownAt:null,TL:{},map:{hasLayer:()=>false,removeLayer(){}},document:{getElementById:()=>null},_sqlSkipList:()=>[],_sqlCrashCheck:async()=>false,_mapLoadDiagStep(){},_mapLoadDiagFinish(){},_mapLoadDiagName(){},_mapRestoreIndicatorHide(){},_sqlEnsureBaseLayer(){},_sqlmapRenderLayers(){},_lsRenderSqlite(){},_sqlPrewarm(){},_sqlFailKey:n=>n});
 s.localStorage.setItem('tvlake_last_map',JSON.stringify({type:'tl',key:'🛰 Satelit'}));let loads=0;
 s._sqlWCall=async q=>{if(q.type==='list')return {ok:true,rows:[{name:'Topo 105',savedAt:9}]};loads++;return {ok:true};};
 vm.runInContext(fn('sqlmapRestoreAll'),s);await s.sqlmapRestoreAll();assert.equal(loads,0);assert.equal(s._sqlRestoreFailed[0].deferred,true);assert.equal(JSON.parse(s.localStorage.getItem('tvlake_last_map')).key,'🛰 Satelit');
});
test('old selection continuation cannot restore trees into the new department',async()=>{
 const releases={},restored=[];const s=environment({_dozOdjeli:[{id:'A',name:'Una · 105'},{id:'B',name:'Sana · 206'}],_dozVlakeVisible:false,_dozSelId:null,_dozFitId:null,_OL:{DOZ_SEL_ID:'sel',save(){}},document:{getElementById:()=>({style:{},textContent:''})},_dozClearOverview(){},dozTreesClear(){},dozRenderOdjeli(){},_dozSubProject(){},_dozRestoreBoundaryStyleUI(){},_dozRestoreTreesStyleUI(){},_dozQrRenderReceived(){},_dozRenderStatusRow(){},dozLoadLayers:id=>new Promise(r=>releases[id]=r),_dozAutoLinkVlake(){},_dozTreesRestoreForOdjel:id=>restored.push(id),dozRenderDetail(){}});
 vm.runInContext(fn('dozSelectOdjel'),s);const a=s.dozSelectOdjel('A'),b=s.dozSelectOdjel('B');releases.B();await b;releases.A();await a;assert.deepEqual(restored,['B']);
});
test('Doznaka never links odjel 105 to 5, or a different GJ, or an ambiguous project',()=>{
 const s=environment({_dozLinkedProjektId:null,_projekti:[{id:'five',gj:'Una',odjel:'5'},{id:'wrong-gj',gj:'Sana',odjel:'105'},{id:'correct',gj:'Una',odjel:'105'}],_dozShowLinkedVlake(){}});vm.runInContext(fn('_dozAutoLinkVlake'),s);
 s._dozAutoLinkVlake({name:'Una · 105'});assert.equal(s._dozLinkedProjektId,'correct');s._projekti.push({id:'duplicate',gj:'Una',odjel:'105'});s._dozAutoLinkVlake({name:'Una · 105'});assert.equal(s._dozLinkedProjektId,null);
});
test('zone area subtracts holes and is stable away from coordinate origin',()=>{
 const s=environment();vm.runInContext(fn('_dozCalcGeomAreaHa')+'\n'+fn('_dozCalcArea'),s);
 const outer=[[16,45],[16.01,45],[16.01,45.01],[16,45.01]],hole=[[16.002,45.002],[16.004,45.002],[16.004,45.004],[16.002,45.004]];
 const area=s._dozCalcGeomAreaHa({type:'Polygon',coordinates:[outer,hole]});const full=s._dozCalcGeomAreaHa({type:'Polygon',coordinates:[outer]});assert(area<full&&area>full*.95);
 const coords=outer.map(p=>({lng:p[0],lat:p[1]}));assert.equal(s._dozCalcArea(coords),full*10000);
});
test('GPX/QR source cannot use the previous odjel or previous account',()=>{
 const s=environment({_dozSelId:'B',_dozGpsExportContext:{projectId:'A',userId:'A'},_dozGpsFullPts:[{lat:1}],_dozTragoviPoKorisniku:()=>({A:[{latitude:44,longitude:16,altitude:500,recorded_at:'t'}]})});vm.runInContext(fn('_dozExportPoints'),s);assert.equal(s._dozExportPoints()[0].lat,44);s._dozGpsExportContext.projectId='B';assert.equal(s._dozExportPoints()[0].lat,1);s.sbUser.id='B';assert.equal(s._dozExportPoints().length,0);
});
test('status change is atomic on quota failure; success queues all affected departments',async()=>{
 const s=environment({_dozSelId:'A',_dozOdjeli:[{id:'A',created_by:'A',status:'paused'},{id:'B',created_by:'A',status:'active'}],_genUUID:()=>Math.random().toString(),_dozRenderStatusRow(){},dozRenderOdjeli(){}});s._OL={QUEUE:'queue',DOZ_ODJELI:'departments',loadQueue:()=>JSON.parse(s.localStorage.getItem('queue')||'[]'),save:()=>true};vm.runInContext(fn('dozSetStatus'),s);
 s.localStorage.fail='queue';await s.dozSetStatus('active');assert.equal(s._dozOdjeli[0].status,'paused');assert.equal(s._dozOdjeli[1].status,'active');s.localStorage.fail=null;await s.dozSetStatus('active');const q=JSON.parse(s.localStorage.getItem('queue'));assert.equal(q.length,2);assert(q.every(o=>o._uid==='A'));assert.equal(s._dozOdjeli[1].status,'paused');
});
test('offline OCR is blocked before the native bridge, prior reviewed results survive',async()=>{
 let called=0;const s=environment({navigator:{onLine:false},window:{AndroidReferenceOcr:{recognize(){called++;}}},document:{getElementById:()=>({textContent:''}),addEventListener(){}},_refDetectedLines:[{nm:'T12'}]});vm.runInContext(fs.readFileSync('static/js/reference-vlake.js','utf8'),s);await s.window.ReferenceVlake.detect({});assert.equal(called,0);assert.equal(s._refDetectedLines.length,1);
});
(async()=>{for(const [n,f]of tests){await f();console.log('OK:',n);}console.log(tests.length+' passed');})().catch(e=>{console.error(e);process.exitCode=1;});
