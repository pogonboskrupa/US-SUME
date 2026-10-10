'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync('static/js/terrain-workspace.js','utf8');
function setup(){
 const nodes=new Map(),points=Array.from({length:62},(_,i)=>({nm:'Tačka '+i,index:i})),saved=[];
 const e={Date,isAdmin:()=>true,isSpdField:()=>false,sbUser:{id:'A'},sbProfile:{ime:'Amir',prezime:'Nadzor'},gpsOn:true,lastP:{la:44,lo:16},_lastGpsFixTime:Date.now(),_tragOn:false,_tragPaused:false,_tacke:points,_tragRegistry:[],_msrRegistry:[],_sqlLayers:[{name:'Una',saved:true}],_activeLayerKey:()=> '_sqlite_0',document:{getElementById:id=>{if(!nodes.has(id))nodes.set(id,{textContent:'',dataset:{},value:'',scrollIntoView(){}});return nodes.get(id);}},showToast:()=>{},_createTacka:(...p)=>saved.push(p),_dlgPrompt:async()=> 'Novi nalaz',switchTab:t=>e.tab=t,_izmjeriPick:m=>e.mode=m};
 e.window=e;vm.createContext(e);vm.runInContext(source,e);
 e._trnPodaciRender=()=>{e.visible=e.TerenWorkspace.rows(points,'tacke',p=>p.nm);};e.terenSetTab=()=>e._trnPodaciRender();
 return {e,nodes,points,saved};
}
(async()=>{
 const h=setup(),a=h.e.TerenWorkspace;a.render(true);h.e._trnPodaciRender();assert.equal(h.e.visible.length,20);a.more();assert.equal(h.e.visible.length,40);a.more();assert.equal(h.e.visible.length,60);a.more();assert.equal(h.e.visible.length,62);assert.equal(h.points.length,62);
 a.search('Tačka 42');assert.equal(h.e.visible.length,1);assert.equal(h.e.visible[0].index,42);assert.equal(h.nodes.get('trn-more').hidden,true);a.search('ne postoji');assert.equal(h.e.visible.length,0);
 let answer;h.e._dlgPrompt=()=>new Promise(r=>answer=r);const pending=a.note();h.e.lastP={la:45,lo:17};answer('Zapažanje');await pending;assert.deepEqual(h.saved[0],[44,16,'Zapažanje']);assert.equal(h.nodes.get('trn-search').value,'');
 const switched=a.note();h.e.sbUser={id:'B'};answer('Tuđa tačka');await switched;assert.equal(h.saved.length,1);
 a.measure('area');assert.equal(h.e.mode,'area');assert.equal(h.e.tab,'karta');h.e.isAdmin=()=>false;h.e.isSpdField=()=>false;h.e.mode=null;a.measure('dist');assert.equal(h.e.mode,'dist');h.e.sbUser=null;h.e.mode=null;a.measure('area');assert.equal(h.e.mode,null);
 h.e.sbUser={id:'C'};let enabled=null;h.e.Explorer={enabledPreference:false,setPreference:on=>enabled=on};a.explorerToggle(true);assert.equal(enabled,true);
 console.log('Teren: paginacija, pretraga/identitet, pozicija zapažanja i promjena naloga — OK');
})().catch(e=>{console.error(e);process.exitCode=1;});
