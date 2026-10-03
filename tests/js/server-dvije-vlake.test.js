'use strict';
// Izvorni tokovi slanja/preuzimanja, dva korisnika i dvije uzastopne vlake.
// Server i karta su lažni; nema produkcijskih mrežnih poziva.
const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict');
const html = fs.readFileSync('index.html', 'utf8');
function fn(name) {
  const start = html.search(new RegExp('(?:async )?function ' + name + '\\('));
  if(start < 0 && name === '_vlakePreuzmiStranice') return ''; // poređenje sa izvornom 2.1.0
  assert.ok(start >= 0, name);
  let depth = 0;
  for (let i = html.indexOf('{', start); i < html.length; i++) {
    if (html[i] === '{') depth++;
    if (html[i] === '}' && --depth === 0) return html.slice(start, i + 1);
  }
  throw Error(name);
}
const pts = [{la:44,lo:16,al:500},{la:44.01,lo:16.01,al:510}];
function setup(uid = 'member') {
  const store = new Map(), messages = [], requests = [], database = [];
  const projects = [{id:'P',korisnik_id:'owner',clanovi:[{korisnik_id:'member'}]}];
  const elements = new Map();
  const e = {
    sbUser:{id:uid},sbProfile:{sumarija:'S'},vlake:[],_vlakaSaveTimers:{},_projekti:projects,
    _aktivniProjektId:'P',kolegeMap:{},kolegeVlake:[],kolegeLabels:[],kolegeVlakeMap:{},
    KORISNIK_PAL:['green'],_KVC_KEY:'kvc',_serverSaljem:false,_serverPrimljenoBusy:false,
    _syncInProgress:false,_syncMrezaPalaU:0,_SERVER_SAMO_LOKALNO:new Set(),_SERVER_ZADNJE_KEY:'last',
    localStorage:{getItem:k=>store.get(k)||null,setItem(k,v){if(e.quota)throw Error('QuotaExceeded');store.set(k,v);}},
    navigator:{onLine:true},document:{getElementById(id){if(!elements.has(id))elements.set(id,{style:{},innerHTML:''});return elements.get(id);}},
    showToast:m=>messages.push(m),_escHtml:String,_mrezaSila(){},_updSyncBadge(){},_updSyncBadgeUskoro(){},
    _serverSazetakRender(){},openSyncQueuePanel(){},rndProjektiList(){},rndKolegeVlakeList(){},
    getOdjel:()=> '105',isReadOnly:()=> false,isAdmin:()=> false,isVodeci:()=> false,
    attachPolyClick(poly,key){poly.clickKey=key;},_saveLocalVlake(){},_updateVlakaSyncIcon(){},_placeLabelMarkers:()=> [],
    _serverNaCekanju:()=>({stavki:e.ol.loadQueue().length}),
    setTimeout:(f)=>setTimeout(f,0),clearTimeout,setInterval:()=>1,clearInterval(){},
    map:{removeLayer(){},},console,
    L:{polyline(coords,options){return {coords,options,addTo(){return this;},bindTooltip(){return this;},on(){return this;},setLatLngs(v){this.coords=v;},setStyle(v){Object.assign(this.options,v);}};}}
  };
  e.sb={from(table){
    const call={table,mode:'select',filters:[],start:0,end:999};
    const q={
      select(){return q;},eq(k,v){call.filters.push(r=>r[k]===v);return q;},neq(k,v){call.filters.push(r=>r[k]!==v);return q;},
      is(k,v){call.filters.push(r=>(r[k]??null)===v);return q;},in(k,vs){call.filters.push(r=>vs.includes(r[k]));return q;},
      order(){return q;},range(a,b){call.start=a;call.end=b;return q;},maybeSingle(){call.single=true;return q;},
      insert(payload){call.mode='insert';call.payload=payload;return q;},update(payload){call.mode='update';call.payload=payload;return q;},
      then(ok,bad){
        requests.push(call);
        if(e.reply)return Promise.resolve(e.reply(call)).then(ok,bad);
        let rows=table==='vlake'?database:table==='projekti'?projects:projects.flatMap(p=>p.clanovi.map(c=>({projekt_id:p.id,...c})));
        rows=rows.filter(r=>call.filters.every(f=>f(r)));
        if(call.mode==='insert'){const r={...call.payload,id:'v'+(database.length+1),rev:1};database.push(r);rows=[r];}
        if(call.mode==='update')for(const r of rows)Object.assign(r,call.payload,{rev:(r.rev||0)+1});
        return Promise.resolve({data:call.single?rows[0]||null:rows.slice(call.start,call.end+1),error:null}).then(ok,bad);
      }
    };return q;
  }};
  vm.createContext(e);
  vm.runInContext(fs.readFileSync('static/js/offline-layer.js','utf8'),e);
  e.ol=vm.runInContext('_OL',e);
  vm.runInContext([
    '_jsonKanon','_vlakaIstiSadrzaj','_vlakaSyncPayload','_sbFlushVlakaImpl','sbFlushVlaka','_flushAllPendingVlake','_retryOrphanVlake',
    '_syncVlakaOperation','_serverSlanjeDozvoljeno','serverPosalji',
    '_serverPrimljenoKljuc','_serverPrimljenoUcitaj','_serverPrimljenoZapamti','_serverPrimljenoRender',
    '_kvcSave','_kvcLoad','_vlakePreuzmiStranice','sbLoadKolegeVlake','serverPreuzmiDijeljeno'
  ].map(fn).join('\n'),e);
  // Ručni gate i stvarna potvrda svake vlake; puni procesor ima zasebne regresije.
  e._processOfflineQueue=async()=>{
    if(!e._serverSaljem)return;
    for(const op of e.ol.loadQueue(true)){
      const err=await e._syncVlakaOperation(op);
      if(!err)e.ol.removeFromQueue(op._qid);
    }
  };
  const row=(nm,kid='owner')=>({id:nm,projekt_id:'P',korisnik_id:kid,nm,pts,updated_at:'2026-10-02',rev:1});
  return {e,store,messages,requests,database,projects,row};
}
const tests=[];const test=(name,f)=>tests.push([name,f]);
test('prva poslana, druga u debounce-u: jedan novi pritisak šalje obje bez duplikata',async()=>{
  const h=setup('owner'),e=h.e;
  e.vlake.push({nm:'T1',projektId:'P',pts,color:'green',br:1,kr:0});
  await e.sbFlushVlaka(0);await e.serverPosalji();
  assert.equal(h.database.length,1);assert.equal(e.vlake[0].sbId,'v1');
  e.vlake.push({nm:'T2',projektId:'P',pts,color:'green',br:2,kr:0});e._vlakaSaveTimers[1]=12345;
  assert.equal(e.ol.loadQueue().length,0);
  await Promise.all([e.serverPosalji(),e.serverPosalji()]);
  assert.deepEqual(h.database.map(r=>r.nm),['T1','T2']);assert.equal(e.vlake[1].sbId,'v2');
  assert.equal(e.ol.loadQueue().length,0);assert.equal(e._serverSaljem,false);
});
test('prazan red ne onemogućava dugme: neposlana lokalna vlaka se može pripremiti',()=>{
  const h=setup('owner');h.e.vlake.push({nm:'T2',projektId:'P',pts});
  h.e._mrezaStanje=()=> 'dobra';h.e._serverZadnje=()=> 0;
  vm.runInContext(fn('_serverSazetakRender'),h.e);h.e._serverSazetakRender();
  assert.equal(h.e.document.getElementById('syncq-posalji').disabled,false);
});
test('vlaka bez reda i timera se oporavi pri ručnom slanju',async()=>{
  const h=setup('owner');h.e.vlake.push({nm:'T2',projektId:'P',pts,color:'green'});
  await h.e.serverPosalji();assert.equal(h.database.length,1);assert.equal(h.database[0].nm,'T2');
});
test('vlasnik projekta preuzima obje vlake člana i odmah ih vidi na karti',async()=>{
  const h=setup('owner');h.database.push(h.row('T1','member'),h.row('T2','member'));
  await h.e.serverPreuzmiDijeljeno();assert.equal(h.e.kolegeVlake.length,2);
  assert.equal(h.e._serverPrimljenoUcitaj().length,2);assert.ok(h.messages.some(m=>m.includes('Preuzeto 2')));
});
test('član već vidi prvu: osvježavanje nacrta i drugu bez promjene projekta',async()=>{
  const h=setup();h.database.push(h.row('T1'));await h.e.serverPreuzmiDijeljeno();
  assert.equal(h.e.kolegeVlake.length,1);h.database.push(h.row('T2'));await h.e.serverPreuzmiDijeljeno();
  assert.equal(h.e.kolegeVlake.length,2);assert.deepEqual(Object.keys(h.e.kolegeVlakeMap).sort(),['owner::T1','owner::T2']);
});
test('zastarjela lista kolega ne odbacuje vlaku drugog člana istog projekta',async()=>{
  const h=setup('owner');h.projects[0].clanovi=[];h.database.push(h.row('T2','new-member'));
  await h.e.sbLoadKolegeVlake();assert.equal(h.e.kolegeVlake.length,1);
});
test('preuzimanje svih stranica (201 vlaka), bez odsijecanja na prvom odgovoru',async()=>{
  const h=setup();for(let i=1;i<=201;i++)h.database.push(h.row('T'+i));
  await h.e.serverPreuzmiDijeljeno();assert.equal(h.e.kolegeVlake.length,201);
  assert.deepEqual(h.requests.filter(r=>r.table==='vlake').map(r=>r.start),[0,100,200,201]);
});
test('pad druge stranice ostavlja raniji keš i kartu, bez lažnog uspjeha',async()=>{
  const h=setup();h.database.push(h.row('T1'));await h.e.serverPreuzmiDijeljeno();const before=h.store.get('kvc');
  h.messages.length=0;h.e.reply=call=>call.table==='vlake'?{data:call.start===0?Array(100).fill(h.row('T2')):null,error:call.start===100?{message:'fetch failed'}:null}:call.table==='projekt_clanovi'?{data:[{projekt_id:'P'}]}:{data:h.projects};
  await h.e.serverPreuzmiDijeljeno();assert.equal(h.store.get('kvc'),before);assert.equal(h.e.kolegeVlake.length,1);
  assert.ok(!h.messages.some(m=>m.includes('✓ Preuzeto')));
});
for(const what of ['nalog','projekat'])test('zakašnjeli odgovor poslije promjene: '+what,async()=>{
  const h=setup();h.e.reply=()=>{if(what==='nalog')h.e.sbUser={id:'next'};else h.e._aktivniProjektId='next';return {data:[h.row('T2')]};};
  await h.e.sbLoadKolegeVlake();assert.equal(h.e.kolegeVlake.length,0);assert.equal(h.store.get('kvc'),undefined);
});
test('stariji paralelni odgovor ne zamjenjuje noviju kartu/keš',async()=>{
  const h=setup();let release;h.e.reply=()=>new Promise(r=>release=r);
  const old=h.e.sbLoadKolegeVlake();await Promise.resolve();h.e.reply=null;
  await h.e.sbLoadKolegeVlake([h.row('T2')]);const before=h.store.get('kvc');
  release({data:[h.row('T1')]});await old;
  assert.equal(h.store.get('kvc'),before);assert.ok(h.e.kolegeVlakeMap['owner::T2']);
  assert.ok(!h.e.kolegeVlakeMap['owner::T1']);
});
test('oštećen red ne šalje i ne javlja da je sve poslano',async()=>{
  const h=setup('owner');h.store.set(h.e.ol.QUEUE,'{bad');await h.e.serverPosalji();
  assert.equal(h.requests.length,0);assert.equal(h.store.get(h.e.ol.QUEUE),'{bad');
  assert.ok(!h.messages.some(m=>/Sve.*poslano/.test(m)));
});
test('puna memorija pri pripremi nove vlake ne javlja potvrdu slanja',async()=>{
  const h=setup('owner');h.e.vlake.push({nm:'T2',projektId:'P',pts});h.e.quota=true;
  await h.e.serverPosalji();assert.equal(h.requests.length,0);assert.equal(h.e.vlake.length,1);
  assert.ok(h.messages.some(m=>m.includes('Priprema')));assert.ok(!h.messages.some(m=>/Sve.*poslano/.test(m)));
});
test('puna memorija pri preuzimanju ne javlja uspjeh',async()=>{
  const h=setup();h.database.push(h.row('T2'));h.e.quota=true;await h.e.serverPreuzmiDijeljeno();
  assert.ok(!h.messages.some(m=>m.includes('✓ Preuzeto')));assert.ok(h.messages.some(m=>m.includes('nije uspjelo')));
});
(async()=>{let failures=0;for(const[name,f]of tests){try{await f();console.log('OK '+name);}catch(e){failures++;console.error('FAIL '+name+'\n'+e.stack);}}console.log(`${tests.length-failures}/${tests.length}`);if(failures)process.exitCode=1;})();
