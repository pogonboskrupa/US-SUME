'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync('index.html','utf8');
function fn(name){const start=html.search(new RegExp('(?:async )?function '+name+'\\('));assert.ok(start>=0,name);let d=0;
 for(let i=html.indexOf('{',start);i<html.length;i++){if(html[i]==='{')d++;if(html[i]==='}'&&--d===0)return html.slice(start,i+1);}}
function gps(){const durable=[],writes=[];let fail=false,seq=0,wait=null;
 const e={_dozGpsOn:true,_dozGpsProjId:'project',_dozGpsUserId:'user',sbUser:{id:'user'},_dozGpsSessionId:'session',
  _dozGpsPaused:false,_dozGpsStopping:false,_dozGpsPts:[],_dozGpsFullPts:[],_dozGpsLen:0,_dozGpsMaxSpd:0,
  _dozGpsSpdSum:0,_dozGpsSpdCnt:0,_dozGpsElevData:[],_dozGpsBuffered:0,_dozLiveUpisPao:false,
  _dozSelId:null,_DOZ_GPS_MIN_DIST:3,_dozGpsTrackLayer:{},dst:(a,b,c,d)=>Math.abs(a-c)*100000,
  _genUUID:()=>String(++seq),_dozUpdGpsStats(){},_dozCheckBandCross(){},_dozGpsDodajSegment(){},
  localStorage:{setItem(k,v){writes.push(v);}},showToast(){},
  FieldStore:{async append(p,s){if(wait)await wait;if(fail)throw Error('quota');durable.push({p,s});},async finish(){if(fail)throw Error('quota');}},
  _dozGpsWatchId:null,_dozGpsPausedTime:0,_dozGpsPauseStart:0,_dozPauseWin:[],_pauziZavrsi(){},_bgRecStopIfIdle(){},
  document:{getElementById:()=>({style:{}})},navigator:{geolocation:{clearWatch(){}}},map:{removeLayer(){}}};
 vm.createContext(e);vm.runInContext(['_dozProcessGpsPoint','_dozBufferTrackPoint','_dozSaveLivePts','dozStopGPS'].map(fn).join('\n'),e);
 return {e,durable,writes,fail:v=>fail=v,wait:p=>wait=p};}
const tests=[];function test(n,f){tests.push([n,f]);}
function tools(){let hit=false,lookups=0;
 const e={document:{addEventListener(){}},_activeLayerKey:()=> 'base',TL:{base:{options:{},getTileUrl(c){return 'tile:'+this._tileZoom+':'+c.x+':'+c.y;}}},
  caches:{async match(){lookups++;return hit?{ok:true,headers:{get:()=> 'image/png'}}:undefined;}},setTimeout:f=>f(),_sqlLayers:[]};
 vm.createContext(e);vm.runInContext(fs.readFileSync('static/js/field-tools.js','utf8'),e);
 return {e,hit:v=>hit=v,lookups:()=>lookups};}
test('prazan keš nikad ne potvrđuje offline podlogu; puna provjera potvrđuje odabrani zoom',async()=>{const h=tools();
 const bounds={getWest:()=>0,getEast:()=>0,getNorth:()=>0,getSouth:()=>0};
 assert.equal((await h.e._fieldTileCoverage(bounds,15)).ok,false);h.hit(true);
 assert.equal((await h.e._fieldTileCoverage(bounds,15)).ok,true);assert.equal(h.lookups(),2);});
test('veliki obuhvat prekida provjeru prije hiljada keš lookup-a',async()=>{const h=tools();
 const bounds={getWest:()=>-170,getEast:()=>170,getNorth:()=>70,getSouth:()=>-70};
 assert.equal((await h.e._fieldTileCoverage(bounds,17)).ok,false);assert.equal(h.lookups(),0);});
test('obnova sa istim ID-jem ne prepisuje noviji lokalni zapis',()=>{const h=tools();
 const old={id:'record',name:'new'},copy={id:'record',name:'old'};
 const rows=h.e._fieldMerge([old],[copy,{id:'added'}]);assert.equal(rows.length,2);assert.equal(rows[0].name,'new');});
test('2000 GPS tačaka koristi pojedinačne IDB upise i ne serijalizuje localStorage bafer',async()=>{const h=gps();
 for(let i=0;i<2000;i++)await h.e._dozProcessGpsPoint(44+i/10000,16,400,5,1,1000+i*5000);
 assert.equal(h.durable.length,2000);assert.equal(h.writes.length,0);assert.equal(h.durable.at(-1).s.count,2000);
 assert.equal(h.e._dozGpsFullPts.length,2000);});
test('nepotvrđena transakcija ne pomjera GPS liniju',async()=>{const h=gps();let release;h.wait(new Promise(r=>release=r));
 const p=h.e._dozProcessGpsPoint(44,16,400,5,1,1000);await Promise.resolve();assert.equal(h.e._dozGpsPts.length,0);
 release();await p;assert.equal(h.e._dozGpsPts.length,1);});
test('istovremeni callbacki obrađuju se redom',async()=>{const h=gps();
 await Promise.all([h.e._dozProcessGpsPoint(44,16,400,5,1,1000),h.e._dozProcessGpsPoint(44.01,16,410,5,1,2000)]);
 assert.equal(h.e._dozGpsPts.length,2);assert.equal(h.durable[1].s.count,2);assert.ok(Math.abs(h.e._dozGpsLen-1000)<0.0001);});
test('pad upisa pa noviji fix prvo ponavlja neuspjeli fix',async()=>{const h=gps();h.fail(true);
 await assert.rejects(h.e._dozProcessGpsPoint(44,16,400,5,1,1000));assert.equal(h.e._dozGpsPts.length,0);
 h.fail(false);await h.e._dozProcessGpsPoint(44.01,16,410,5,1,2000);
 assert.deepEqual(h.durable.map(x=>x.p.latitude),[44,44.01]);assert.equal(h.e._dozLiveUpisPao,false);});
test('promjena naloga ne prenosi neuspjeli fix u novi projekat',async()=>{const h=gps();h.fail(true);
 await assert.rejects(h.e._dozProcessGpsPoint(44,16,400,5,1,1000));h.fail(false);
 h.e.sbUser={id:'next'};h.e._dozGpsUserId='next';h.e._dozGpsProjId='next-project';
 await h.e._dozProcessGpsPoint(45,17,400,5,1,2000);
 assert.equal(h.durable.length,1);assert.equal(h.durable[0].p.user_id,'next');assert.equal(h.durable[0].p.latitude,45);});
test('neuspjeli završetak čuva aktivno snimanje',async()=>{const h=gps();h.fail(true);await h.e.dozStopGPS();
 assert.equal(h.e._dozGpsOn,true);assert.equal(h.e._dozGpsUserId,'user');assert.equal(h.e._dozGpsStopping,false);});
test('završetak čeka potvrdu tačke koja je u letu',async()=>{const h=gps();let release;h.wait(new Promise(r=>release=r));
 const p=h.e._dozProcessGpsPoint(44,16,400,5,1,1000);const stop=h.e.dozStopGPS();
 await Promise.resolve();assert.equal(h.e._dozGpsOn,true);release();await p;await stop;assert.equal(h.e._dozGpsOn,false);assert.equal(h.durable.length,1);});
(async()=>{let bad=0;for(const[n,f]of tests){try{await f();console.log('OK '+n);}catch(e){bad++;console.error('FAIL '+n,e);}}
 console.log(`${tests.length-bad}/${tests.length}`);if(bad)process.exitCode=1;})();
