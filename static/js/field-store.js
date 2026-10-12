// Terenski dnevnik: pojedinačni GPS upisi, potvrda tek na transaction.complete.
// Ne šalje mrežne zahtjeve; baze svih naloga ostaju odvojene indeksima vlasnika.
(function(root) {
  'use strict';
  let opening, migration, loaded = false;
  const pending = new Map();
  const counts = new Map();
  const legacyKey = 'tvlake_doz_track_buf';
  function open() {
    if (opening) return opening;
    opening = new Promise((resolve,reject) => {
      const r = indexedDB.open('tvlake-field-journal',1);
      r.onupgradeneeded = () => {
        const db=r.result;
        const p=db.createObjectStore('pending',{keyPath:'_qid'});p.createIndex('owner','user_id');
        db.createObjectStore('receipts',{keyPath:'_qid'});
        const s=db.createObjectStore('sessions',{keyPath:'id'});s.createIndex('owner','uid');
        const pts=db.createObjectStore('points',{keyPath:'_qid'});pts.createIndex('session','sessionId');pts.createIndex('owner','user_id');
      };
      r.onsuccess=()=>{const db=r.result;db.onversionchange=()=>{db.close();opening=null;};resolve(db);};
      r.onerror=()=>{opening=null;reject(r.error);};
      r.onblocked=()=>{opening=null;reject(new Error('Zatvori drugi prozor aplikacije da se otvori pohrana'));};
    });
    return opening;
  }
  async function transact(names,mode,work) {
    const db=await open();
    return new Promise((resolve,reject)=>{
      let tx;
      try { try {tx=db.transaction(names,mode,{durability:'strict'});}catch(e){tx=db.transaction(names,mode);} }
      catch(e){reject(e);return;}
      let result;
      tx.oncomplete=()=>resolve(result);
      tx.onabort=tx.onerror=()=>reject(tx.error || new Error('Terenski upis nije potvrđen'));
      try {work(tx,value=>{result=value;});}catch(e){tx.abort();reject(e);}
    });
  }
  function all(store,index,value,done) {
    const r=index ? store.index(index).getAll(value) : store.getAll();
    r.onsuccess=()=>done(r.result);
  }
  function validPoint(p) {
    return p && typeof p.user_id==='string' && typeof p.project_id==='string' &&
      Number.isFinite(p.latitude) && Math.abs(p.latitude)<=90 && Number.isFinite(p.longitude) &&
      Math.abs(p.longitude)<=180 && Number.isFinite(Date.parse(p.recorded_at));
  }
  async function init() {
    if (migration) return migration;
    migration=(async()=>{
      const raw=localStorage.getItem(legacyKey);
      if (raw && raw!=='[]') {
        const rows=JSON.parse(raw);
        if (!Array.isArray(rows) || rows.some(p=>!validPoint(p))) throw new Error('Stari GPS bafer je oštećen — original je sačuvan');
        const imported=rows.map(p=>({...p,_qid:p._qid || 'legacy:'+p.user_id+':'+p.project_id+':'+p.recorded_at+':'+p.latitude+':'+p.longitude}));
        await transact(['pending','receipts'],'readwrite',tx=>{for(const p of imported){
          const r=tx.objectStore('receipts').get(p._qid);r.onsuccess=()=>{if(!r.result)tx.objectStore('pending').put(p);};
        }});
        // Ponovno čitanje potvrđuje sve identitete PRIJE uklanjanja stare kopije.
        await transact(['pending','receipts'],'readonly',tx=>{
          for(const p of imported){const receipt=tx.objectStore('receipts').get(p._qid);receipt.onsuccess=()=>{
            if(receipt.result)return;
            const r=tx.objectStore('pending').get(p._qid);r.onsuccess=()=>{
            if (!r.result || JSON.stringify(r.result)!==JSON.stringify(p)) tx.abort();
            };
          };}
        });
        if (localStorage.getItem(legacyKey)===raw) localStorage.removeItem(legacyKey);
      }
      const rows=await transact(['pending'],'readonly',(tx,done)=>all(tx.objectStore('pending'),null,null,done));
      pending.clear();counts.clear();for(const p of rows){pending.set(p._qid,p);counts.set(p.user_id,(counts.get(p.user_id)||0)+1);}loaded=true;
    })();
    try {await migration;}finally{migration=null;}
  }
  async function append(point,session) {
    if (!loaded || localStorage.getItem(legacyKey)) await init();
    if (!validPoint(point)) throw new Error('Neispravna GPS tačka');
    const row={...point};
    await transact(['pending','points','sessions'],'readwrite',tx=>{
      tx.objectStore('pending').put(row);
      if(session){
        tx.objectStore('points').put({...row,sessionId:session.id,seq:session.count});
        tx.objectStore('sessions').put({...session,active:true,ts:Date.parse(row.recorded_at)});
      }
    });
    if(!pending.has(row._qid))counts.set(row.user_id,(counts.get(row.user_id)||0)+1);
    pending.set(row._qid,row);
  }
  async function acknowledge(uid,ids) {
    await init();
    const own=[...new Set(ids)].filter(id=>pending.get(id)?.user_id===uid);
    await transact(['pending','receipts'],'readwrite',tx=>{for(const id of own){
      tx.objectStore('receipts').put({_qid:id,uid});tx.objectStore('pending').delete(id);
    }});
    for(const id of own){pending.delete(id);counts.set(uid,Math.max(0,(counts.get(uid)||0)-1));}
  }
  function view(uid,projectId) {return [...pending.values()].filter(p=>p.user_id===uid && (!projectId || p.project_id===projectId));}
  async function read(uid) {await init();return view(uid);}
  async function finish(id,uid) {
    if(!id)return;
    await transact(['sessions'],'readwrite',tx=>{
      const st=tx.objectStore('sessions'),r=st.get(id);
      r.onsuccess=()=>{if(r.result?.uid===uid)st.put({...r.result,active:false});};
    });
  }
  async function live(uid) {
    const sessions=await transact(['sessions'],'readonly',(tx,done)=>all(tx.objectStore('sessions'),'owner',uid,done));
    const s=sessions.filter(s=>s.active).sort((a,b)=>b.ts-a.ts)[0];
    if(!s)return null;
    const points=await transact(['points'],'readonly',(tx,done)=>all(tx.objectStore('points'),'session',s.id,done));
    points.sort((a,b)=>(a.seq??Date.parse(a.recorded_at))-(b.seq??Date.parse(b.recorded_at)));
    return {...s,projId:s.projId,pts:points.map(p=>[p.latitude,p.longitude]),
      fullPts:points.map(p=>({lat:p.latitude,lon:p.longitude,ele:p.altitude??0,time:p.legacy?null:p.recorded_at,spd:p.speed??0}))};
  }
  async function seedSession(session,coords) {
    await transact(['sessions','points'],'readwrite',tx=>{
      tx.objectStore('sessions').put({...session,active:true,count:coords.length});
      coords.forEach((p,i)=>tx.objectStore('points').put({_qid:session.id+':legacy:'+i,sessionId:session.id,
        seq:i+1,user_id:session.uid,project_id:session.projId,latitude:p[0],longitude:p[1],legacy:true,
        recorded_at:new Date(session.ts).toISOString()}));
    });
  }
  async function exportOwner(uid,projectId) {
    await init();
    return transact(['pending','sessions','points'],'readonly',(tx,done)=>{
      const result={},put=(key,rows)=>{result[key]=rows;if(Object.keys(result).length===3)done(result);};
      all(tx.objectStore('pending'),'owner',uid,rows=>put('pending',rows.filter(p=>!projectId||p.project_id===projectId)));
      all(tx.objectStore('sessions'),'owner',uid,rows=>put('sessions',rows.filter(s=>!projectId||s.projId===projectId)));
      all(tx.objectStore('points'),'owner',uid,rows=>put('points',rows.filter(p=>!projectId||p.project_id===projectId)));
    });
  }
  async function importOwner(uid,data) {
    const rows=data.pending || [],sessions=data.sessions || [],points=data.points || [];
    const sessionIds=new Set(sessions.map(s=>s.id));
    if(rows.concat(points).some(p=>!validPoint(p)||p.user_id!==uid||!p._qid) || sessions.some(s=>s.uid!==uid||!s.id))
      throw new Error('Backup sadrži neispravne podatke ili drugi nalog');
    if(points.some(p=>!sessionIds.has(p.sessionId)))throw new Error('GPS tačka nema vlastitu sesiju u kopiji');
    await init();
    await transact(['pending','sessions','points','receipts'],'readwrite',tx=>{
      // Dodavanje samo nedostajućih: obnovljena kopija ne prepisuje noviji rad.
      for(const [name,list] of [['pending',rows],['sessions',sessions],['points',points]])for(const row of list){
        const st=tx.objectStore(name),r=st.get(name==='sessions'?row.id:row._qid);r.onsuccess=()=>{
          if(r.result)return;
          if(name==='pending'){const receipt=tx.objectStore('receipts').get(row._qid);receipt.onsuccess=()=>{if(!receipt.result)st.add(row);};}
          else st.add(row);
        };
      }
    });
    loaded=false;await init();
  }
  root.FieldStore={init,append,acknowledge,read,view,finish,live,seedSession,exportOwner,importOwner,
    count:uid=>counts.get(uid)||0,get ready(){return loaded;}};
})(globalThis);
