'use strict';
// Cijeli ručni tok: stvarni red, priprema, potvrde i GPS serije. Server/IDB su lažni.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync(process.env.US_SUME_TEST_SOURCE || 'index.html','utf8');
function fn(name){const start=html.search(new RegExp('(?:async )?function '+name+'\\('));assert.ok(start>=0,name);let depth=0;for(let i=html.indexOf('{',start);i<html.length;i++){if(html[i]==='{')depth++;if(html[i]==='}'&&--depth===0)return html.slice(start,i+1);}throw Error(name);}
const names=['dst','addPt','scheduleVlakaSave','_jsonKanon','_vlakaIstiSadrzaj','_vlakaSyncPayload','_sbFlushVlakaImpl','sbFlushVlaka','_flushAllPendingVlake','_retryOrphanVlake','_syncVlakaOperation','_serverSlanjeDozvoljeno','_serverNaCekanju','serverPosalji','_isNetworkErr','_isAuthErr','_serverPrivremeno','_processOfflineQueue','_dozTackaKljuc','_dozPosaljiKomad','_dozPosaljiPojedinacno','_sendDozTrackPoint','_dozBufferTrackPoint','_serverPodaciJednaki','_serverInsertPotvrdjeno','_dozUpisiZonu','dozConfirmSave'];
function setup({legacy=false}={}){
 const store=new Map(),messages=[],requests=[],pending=[],db={vlake:[],doz_area_markings:[],doz_track_points:[]},elements=new Map();let seq=0,loaded=false;
 const e={console,sbUser:{id:'A'},sbProfile:{id:'A',sumarija:'Bos.Krupa'},vlake:[],_vlakaSaveTimers:{},_projekti:[{id:'P',korisnik_id:'A'}],_aktivniProjektId:'P',recOn:false,bufLayers:[],activeTool:null,
  _serverSaljem:false,_SERVER_ZADNJE_KEY:'last',_SERVER_SAMO_LOKALNO:new Set(['upsert_trag','delete_trag','upsert_log','upsert_labels']),_syncInProgress:false,_syncRerun:false,_syncMrezaPalaU:0,_syncOdgodaT:null,_SYNC_PAUZA_MS:20000,
  _DOZ_TRACK_BUF_KEY:'tvlake_doz_track_buf',_DOZ_KOMAD:100,_dozGpsSessionId:'session',_dozLiveUpisPao:false,_dozMarkings:[],_dozSelId:'D',_dozDrawType:'priority',_dozSaveInFlight:false,_dozPendingSavePolygon:null,
  localStorage:{getItem:k=>store.get(k)||null,setItem(k,v){if(e.quota)throw Error('QuotaExceeded');store.set(k,String(v));},removeItem:k=>store.delete(k)},navigator:{onLine:true},
  document:{getElementById(id){if(!elements.has(id))elements.set(id,{style:{},value:'',innerHTML:''});return elements.get(id);}},
  _lsJsonMemo:k=>JSON.parse(store.get(k)||'[]'),_genUUID:()=> 'client-'+(++seq),showToast:m=>messages.push(m),
  _mrezaProbaj:()=>true,_mrezaSila(){},_serverSazetakRender(){},_updSyncBadge(){},_updSyncBadgeUskoro(){},_updateVlakaSyncIcon(){},_saveLocalVlake(){},
  getOdjel:()=> '105',isReadOnly:()=>false,updateVlakaLabel(){},updBan(){},updOvl(){},rndList(){},_scheduleOvlRnd(){},drawBuffers(){},
  _dozCacheLayers(){},dozRenderMapLayers(){},dozRenderDetail(){},dozCancelDraw(){},_dozCalcGeomAreaHa:()=>1,
  openSyncQueuePanel(){},setTimeout:(f,ms)=>setTimeout(f,ms===2500?60000:0),clearTimeout,setInterval:()=>1,clearInterval(){}};
 if(!legacy)e.FieldStore={get ready(){return loaded;},count:uid=>loaded?pending.filter(p=>p.user_id===uid).length:0,
  async init(){if(e.initError)throw e.initError;await Promise.resolve();loaded=true;if(e.afterInit)e.afterInit();},
  async append(p){pending.push({...p});loaded=true;},async read(uid){await this.init();return pending.filter(p=>p.user_id===uid).map(p=>({...p}));},
  async acknowledge(uid,ids){for(let i=pending.length-1;i>=0;i--)if(pending[i].user_id===uid&&ids.includes(pending[i]._qid))pending.splice(i,1);}};
 e.sb={auth:{refreshSession:async()=>({data:{}})},rpc:async()=>({error:{code:'PGRST202'}}),from(table){
  const call={table,mode:'select',filters:[],limit:Infinity};const q={
   select:()=>q,eq(k,v){call.filters.push(r=>r[k]===v);return q;},is(k,v){call.filters.push(r=>(r[k]??null)===v);return q;},
   gte(k,v){call.filters.push(r=>r[k]>=v);return q;},lte(k,v){call.filters.push(r=>r[k]<=v);return q;},limit(n){call.limit=n;return q;},
   maybeSingle(){call.single=true;return q;},single(){call.single=true;return q;},
   insert(p){call.mode='insert';call.payload=p;return q;},update(p){call.mode='update';call.payload=p;return q;},
   then(ok,bad){requests.push(call);const error=e.error?.(call);if(error)return Promise.resolve({data:null,error}).then(ok,bad);
    let rows=(db[table]||[]).filter(r=>call.filters.every(f=>f(r)));
    if(call.mode==='insert'){rows=(Array.isArray(call.payload)?call.payload:[call.payload]).map(p=>({...p,id:p.id||'server-'+(++seq),rev:1}));db[table].push(...rows);}
    if(call.mode==='update')rows.forEach(r=>Object.assign(r,call.payload,{rev:r.rev+1}));
    if(e.afterWrite&&call.mode!=='select')e.afterWrite(call);
    return Promise.resolve({data:call.single?rows[0]||null:rows.slice(0,call.limit),error:e.lostReply?.(call)||null}).then(ok,bad);
   }};return q;}};
 vm.createContext(e);vm.runInContext(fs.readFileSync('static/js/offline-layer.js','utf8'),e);e.ol=vm.runInContext('_OL',e);vm.runInContext(names.map(fn).join('\n'),e);e.window=e;e._dozOdjeli=[{id:'D',name:'Doznaka 105'}];e.kolegeMap={};vm.runInContext(fs.readFileSync('static/js/server-panel.js','utf8'),e);
 const point=(i,uid='A')=>({_qid:'gps-'+uid+'-'+i,user_id:uid,project_id:'D',latitude:44+i*.001,longitude:16,altitude:300,accuracy:5,recorded_at:new Date(Date.UTC(2026,9,2,10,0,i)).toISOString()});
 const addVlaka=(nm,recorded)=>{const i=e.vlake.length;e.vlake.push({nm,projektId:'P',br:i+1,kr:0,color:'green',pts:[],poly:{addLatLng(){}}});e.recOn=recorded;e.addPt(i,44,16,300);e.addPt(i,44.001,16,310);e.recOn=false;return e.vlake[i];};
 return {e,store,messages,requests,pending,db,point,addVlaka};
}
const tests=[];const test=(n,f)=>tests.push([n,f]);
test('jedan pritisak šalje nacrtanu vlaku, GPS vlaku, zonu i GPS pojas, bez automatskog slanja',async()=>{
 const h=setup(),e=h.e;h.addVlaka('T1',false);h.addVlaka('T2',true);
 e._dozPendingSavePolygon={type:'Polygon',coordinates:[[[16,44],[16.01,44],[16,44.01],[16,44]]]};
 e.document.getElementById('doz-save-label').value='Zaštitna zona';await e.dozConfirmSave();
 for(let i=0;i<205;i++)await e._dozBufferTrackPoint(h.point(i));
 await e._processOfflineQueue(true);assert.equal(h.requests.length,0);
 await e.serverPosalji();assert.deepEqual(h.db.vlake.map(r=>r.nm),['T1','T2']);
 const receipts=JSON.parse(h.store.get('tvlake_server_transfers_v1_A'));assert.ok(receipts['project:P'].ts>0);assert.ok(receipts['doz:D'].ts>0);
 assert.equal(h.db.vlake[0].pts.length,2);assert.equal(h.db.vlake[1].projekt_id,'P');
 assert.equal(h.db.doz_area_markings.length,1);assert.equal(h.db.doz_area_markings[0].label,'Zaštitna zona');assert.equal(h.db.doz_area_markings[0].boundary_geojson.type,'Polygon');
 assert.equal(h.db.doz_track_points.length,205);assert.equal(h.pending.length,0);assert.equal(e.ol.loadQueue().length,0);
 assert.deepEqual(h.requests.filter(r=>r.table==='doz_track_points'&&r.mode==='insert').map(r=>r.payload.length),[100,100,5]);
 await e.serverPosalji();assert.equal(h.db.vlake.length,2);assert.equal(h.db.doz_track_points.length,205);assert.ok(h.messages.some(m=>m.includes('Sve poslano')));
});
test('odmah poslije restarta učitava GPS dnevnik prije provjere da je sve poslano',async()=>{
 const h=setup();h.pending.push(h.point(1));assert.equal(h.e.FieldStore.ready,false);await h.e.serverPosalji();assert.equal(h.db.doz_track_points.length,1);assert.equal(h.pending.length,0);
});
test('neuspjelo otvaranje GPS dnevnika ne proglašava prazan red poslanim',async()=>{
 const h=setup();h.pending.push(h.point(1));h.e.initError=Error('IDB blocked');await h.e.serverPosalji();assert.equal(h.requests.length,0);assert.equal(h.pending.length,1);assert.ok(h.messages.some(m=>m.includes('Priprema')));assert.ok(!h.messages.some(m=>/Sve.*poslano/.test(m)));
});
test('mrežni pad ostavlja oboje vlaka i GPS pojas za sljedeći pokušaj',async()=>{
 const h=setup();h.addVlaka('T1',false);h.addVlaka('T2',true);h.pending.push(h.point(1));h.e.error=c=>c.mode==='insert'?{message:'Failed to fetch'}:null;
 await h.e.serverPosalji();assert.equal(h.e.ol.loadQueue().length,2);assert.equal(h.pending.length,1);assert.equal(h.db.vlake.length,0);assert.equal(h.store.has('tvlake_server_transfers_v1_A'),false);
 h.e.error=null;await h.e.serverPosalji();assert.equal(h.db.vlake.length,2);assert.equal(h.db.doz_track_points.length,1);assert.equal(h.pending.length,0);
});
test('RLS odbijena GPS tačka ostaje lokalno; uspješne potvrde se uklone pojedinačno',async()=>{
 const h=setup();h.pending.push(h.point(1),h.point(2));await h.e.FieldStore.init();h.e.error=c=>c.table==='doz_track_points'&&c.mode==='insert'&&(Array.isArray(c.payload)||c.payload.latitude===44.002)?{code:'42501',message:'permission denied'}:null;
 await h.e.serverPosalji();assert.equal(h.db.doz_track_points.length,1);assert.equal(h.pending.length,1);assert.equal(h.pending[0]._qid,'gps-A-2');assert.ok(h.messages.some(m=>m.includes('djelimično')));
});
test('izgubljen odgovor nakon upisa pojasa ne pravi duple tačke pri ponovnom slanju',async()=>{
 const h=setup();h.pending.push(h.point(1),h.point(2));await h.e.FieldStore.init();h.e.lostReply=c=>c.table==='doz_track_points'&&c.mode==='insert'?{message:'Failed to fetch'}:null;
 await h.e.serverPosalji();assert.equal(h.pending.length,2);assert.equal(h.db.doz_track_points.length,2);h.e.lostReply=null;
 await h.e.serverPosalji();assert.equal(h.pending.length,0);assert.equal(h.db.doz_track_points.length,2);
});
test('promjena naloga tokom pripreme ne šalje GPS tačke drugog korisnika',async()=>{
 const h=setup();h.pending.push(h.point(1));h.e.afterInit=()=>{h.e.sbUser={id:'B'};};await h.e.serverPosalji();assert.equal(h.requests.length,0);assert.equal(h.pending.length,1);assert.ok(h.messages.some(m=>m.includes('promijenjen nalog')));
});
test('nova GPS tačka nastala tokom slanja ostaje u dnevniku za sljedeći pritisak',async()=>{
 const h=setup();h.pending.push(h.point(1));await h.e.FieldStore.init();let added=false;h.e.afterWrite=c=>{if(c.table==='doz_track_points'&&!added){h.pending.push(h.point(2));added=true;}};
 await h.e.serverPosalji();assert.equal(h.db.doz_track_points.length,1);assert.equal(h.pending.length,1);assert.equal(h.pending[0]._qid,'gps-A-2');await h.e.serverPosalji();assert.equal(h.db.doz_track_points.length,2);assert.equal(h.pending.length,0);
});
test('legacy GPS bafer se šalje i bez FieldStore-a, tuđi zapisi ostaju',async()=>{
 const h=setup({legacy:true});h.store.set(h.e._DOZ_TRACK_BUF_KEY,JSON.stringify([h.point(1),h.point(2,'B')]));await h.e.serverPosalji();assert.equal(h.db.doz_track_points.length,1);assert.equal(JSON.parse(h.store.get(h.e._DOZ_TRACK_BUF_KEY))[0].user_id,'B');
});
test('puna memorija pri spremanju zone ne zatvara crtež niti javlja lažni uspjeh',async()=>{
 const h=setup();const polygon={type:'Polygon',coordinates:[[[16,44],[16.01,44],[16,44.01],[16,44]]]};h.e._dozPendingSavePolygon=polygon;h.e.quota=true;
 await h.e.dozConfirmSave();assert.equal(h.e._dozPendingSavePolygon,polygon);assert.equal(h.e._dozMarkings.length,0);assert.equal(h.e._dozSaveInFlight,false);assert.ok(!h.messages.some(m=>m.includes('Zona sačuvana')));
});
(async()=>{let failed=0;for(const[n,f]of tests){try{await f();console.log('OK '+n);}catch(e){failed++;console.error(n+'\n'+e.stack);}}console.log(`${tests.length-failed}/${tests.length}`);if(failed)process.exitCode=1;})();
