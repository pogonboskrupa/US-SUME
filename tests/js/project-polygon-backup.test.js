'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{webcrypto}=require('node:crypto');
const geometry=require('../../static/js/project-terrain.js');
function harness(){
 const data=new Map(),messages=[];let failOnce=false;
 const c={ProjectTerrain:geometry,TextEncoder,crypto:webcrypto,Uint8Array,sbUser:{id:'A'},recOn:false,_tragOn:false,_dozGpsOn:false,vlake:[],
  _OL:{PROJEKTI:'projects',QUEUE:'queue',load:k=>JSON.parse(data.get(k)||'{"data":[]}').data,loadQueue:()=>JSON.parse(data.get('queue')||'[]')},
  LOCAL_VLAKE_KEY:'vlake',_TRAG_REG_KEY:'tracks',_MSR_REG_KEY:'measure',_KVC_KEY:'colleagues',_LOCAL_KML_KEY:'kml',_GEOJSON_LS_KEY:'geojson',
  _dlgConfirm:async()=>true,FieldStore:{importOwner:async()=>{}},_applyVlakeRows(){},loadProj(){},_tragRegLoad(){},_msrRegLoad(){},_localKmlRestore:async()=>{},geojsonOdjeliRestore(){},_updSyncBadge(){},rndProjektiList(){},
  localStorage:{getItem:k=>data.get(k)??null,setItem(k,v){if(failOnce&&k===geometry.keyFor('A','P')){failOnce=false;throw Error('quota');}data.set(k,v)},removeItem:k=>data.delete(k)},
  showToast:t=>messages.push(t),document:{getElementById:()=>({value:''}),addEventListener(){}},setInterval(){}};
 vm.createContext(c);vm.runInContext(fs.readFileSync('static/js/field-tools.js','utf8'),c);c.fieldCheckReady=()=>{};
 return {c,data,messages,fail:()=>failOnce=true};
}
const ring=[[44.9,16],[44.9,16.01],[44.91,16.01],[44.91,16]];
async function copy(c,polygon){const data={format:'US-SUME-project-backup',schema:1,uid:'A',scope:{id:'P',doz:false,project:{id:'P'}},vlake:[],kolege:[],queue:[],tracks:[],measurements:[],journal:{pending:[],points:[],sessions:[]},projectPolygon:polygon};return {data,sha256:await c._fieldChecksum(data)};}
async function restore(c,blob){await c.fieldImportBackup({size:500,text:async()=>JSON.stringify(blob)});}
(async()=>{
 const h=harness(),key=geometry.keyFor('A','P'),polygon={ring,slope:true,aspect:false,visible:true};
 await restore(h.c,await copy(h.c,polygon));assert.deepEqual(JSON.parse(h.data.get(key)),polygon);assert(h.messages.at(-1).includes('Kopija vraćena'));
 const newer={...polygon,slope:false};h.data.set(key,JSON.stringify(newer));await restore(h.c,await copy(h.c,polygon));assert.deepEqual(JSON.parse(h.data.get(key)),newer);
 const old=harness();await restore(old.c,await copy(old.c,null));assert.equal(old.data.has(key),false);assert(old.messages.at(-1).includes('Kopija vraćena'));
 const broken=harness();await restore(broken.c,await copy(broken.c,{ring:[[0,0],[1,1],[0,1],[1,0]]}));assert.equal(broken.data.size,0);assert(broken.messages.at(-1).includes('Neispravan poligon'));
 const quota=harness();quota.data.set('vlake','[]');quota.fail();await restore(quota.c,await copy(quota.c,polygon));assert.deepEqual([...quota.data],[['vlake','[]']]);assert(quota.messages.at(-1).includes('quota'));
 console.log('OK: roundtrip poligona, stara kopija, zaštita novijeg poligona, validacija i rollback pri quota grešci');
})().catch(e=>{console.error(e);process.exitCode=1});
