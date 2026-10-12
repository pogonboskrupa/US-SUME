'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync('index.html','utf8');
const start=html.indexOf('function _sqlTileBmpEvict(');let end,depth=0;
for(let i=html.indexOf('{',start);i<html.length;i++){if(html[i]==='{')depth++;if(html[i]==='}'&&--depth===0){end=i+1;break;}}
function check(low,high){let closed=0;const cache=new Map();for(let i=0;i<low;i++)cache.set('map/10/'+i+'/1',{close(){closed++;}});for(let i=0;i<high;i++)cache.set('map/17/'+i+'/1',{close(){closed++;}});const env={_sqlTileBmpCache:cache,_SQL_TILE_BMP_MAX:300,_SQL_OVERVIEW_Z:13};vm.createContext(env);vm.runInContext(html.slice(start,end),env);env._sqlTileBmpEvict();return{cache,closed};}
let failures=0;
for(const[name,run]of [
 ['pregledne pločice također poštuju tvrdu granicu keša',()=>{const h=check(1000,0);assert.ok(h.cache.size<=300,'ostalo '+h.cache.size);assert.equal(h.closed,0);}],
 ['detaljne pločice se izbacuju prije preglednih',()=>{const h=check(250,100);assert.equal(h.cache.size,250);assert.equal([...h.cache.keys()].filter(k=>k.includes('/10/')).length,250);}],
 ['keš ispod granice se ne prazni',()=>assert.equal(check(100,100).cache.size,200)]
]){try{run();console.log('OK '+name);}catch(e){failures++;console.log('FAIL '+name+': '+e.message);}}
if(failures)process.exitCode=1;
