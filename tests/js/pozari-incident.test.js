'use strict';
const fs=require('fs'),path=require('path'),assert=require('assert');
const html=fs.readFileSync(path.join(__dirname,'../../index.html'),'utf8');
function fn(n){const s=html.indexOf('function '+n+'(');assert.ok(s>=0,'nedostaje '+n);let i=html.indexOf('{',s),d=0;for(;i<html.length;i++){if(html[i]==='{')d++;else if(html[i]==='}'&&!--d)return html.slice(s,i+1);}throw Error('nezatvorena '+n);}
const src=['_poziOrijent','_poziSegmentiSijeku','_poziVrstaPrepreke','_poziPragIzmedju','_poziTrajanje','_poziPovrsPouzdanost','_poziAnimKoraci'].map(fn).join('\n');
const api=new Function(src+';return {_poziSegmentiSijeku,_poziVrstaPrepreke,_poziPragIzmedju,_poziTrajanje,_poziPovrsPouzdanost,_poziAnimKoraci}')();
let ok=0;function t(n,f){try{f();console.log('  ✔ '+n);ok++;}catch(e){console.error('  ✘ '+n+'\n    '+e.message);process.exitCode=1;}}
console.log('Požari v1.3 — prepreke i incident:');
t('rijeka je tvrda prepreka',()=>assert.equal(api._poziVrstaPrepreke('Rijeka Una'),'voda'));
t('put, potok i greben usporavaju spajanje',()=>['Šumski put','potok','glavni greben'].forEach(x=>assert.equal(api._poziVrstaPrepreke(x),'usporava')));
t('segment preko rijeke se prepoznaje',()=>assert.ok(api._poziSegmentiSijeku({la:0,lo:0},{la:1,lo:1},{la:0,lo:1},{la:1,lo:0})));
t('voda obara prag na nulu',()=>assert.equal(api._poziPragIzmedju({la:0,lo:0},{la:1,lo:1},450,[{a:{la:0,lo:1},b:{la:1,lo:0},vrsta:'voda'}]),0));
t('put sužava prag na 55%',()=>assert.equal(api._poziPragIzmedju({la:0,lo:0},{la:1,lo:1},450,[{a:{la:0,lo:1},b:{la:1,lo:0},vrsta:'usporava'}]),247.50000000000003));
t('trajanje daje dane, sate i minute',()=>assert.equal(api._poziTrajanje(0,(2*1440+3*60+7)*60000),'2 d 3 h 7 min'));
t('površina sa više senzora i preleta ima visoku pouzdanost',()=>{const pts=Array.from({length:8},(_,i)=>({dt:'2026-09-'+String(10+(i%3)).padStart(2,'0')+'T'+String(i).padStart(2,'0')+':00:00Z'}));assert.equal(api._poziPovrsPouzdanost({broj:8,sateliti:['A','B'],pts},{haUkupno:40}).id,'visoka');});
t('UI razdvaja satelit, EFFIS i teren',()=>['Satelitska procjena','EFFIS (zaseban sloj)','Terenska granica'].forEach(x=>assert.ok(html.includes(x))));
t('UI ima animaciju, odjele, operativne tačke i PDF',()=>['Razvoj požara kroz vrijeme','Operativne tačke','Zahvaćeni odjeli','PDF izvještaj / štampa'].forEach(x=>assert.ok(html.includes(x))));
t('tekuća godina se zakazuje u pozadini',()=>assert.ok(html.includes('function _povGodLoadPozadina(')));
t('pojas projekcije je iznad karte i otvara detalje incidenta',()=>{assert.ok(html.includes("map.createPane('pozariPovrsPane')"));assert.ok(html.includes("pane:'pozariPovrsPane', interactive:true"));assert.ok(html.includes("l.on('click',()=>_poziMapOtvori(g,tr))"));});
t('detalji i Play se prikazuju direktno na karti',()=>['pozi-map-hud','Početak požara','Ukupna procjena','▶ Play','Karta kumulativno prikazuje tačke'].forEach(x=>assert.ok(html.includes(x))));
t('vremenska crta grupiše detekcije po danima',()=>{const k=api._poziAnimKoraci({pts:[{dt:'2026-09-10T08:00:00Z'},{dt:'2026-09-10T18:00:00Z'},{dt:'2026-09-12T09:00:00Z'}]});assert.equal(k.length,2);assert.equal(k[0].broj,2);assert.equal(k[0].cut,Date.parse('2026-09-10T18:00:00Z'));});
t('replay filtrira samo odabrani incident, ne sve požare',()=>{const a={id:'A',pts:[{dt:'2026-09-10T08:00:00Z'},{dt:'2026-09-12T08:00:00Z'}],d:1},b={id:'B',pts:[{dt:'2026-09-12T08:00:00Z'}],d:2};const run=new Function('_poziAnimCut','_poziAnimSel','_poziEvts','_poziIncKljuc','_poziGrupisi','_poziPts','_poziRefTacka','_poziGrupeBlizu',fn('_poziAnimGrupe')+';return _poziAnimGrupe()');const out=run(Date.parse('2026-09-10T23:00:00Z'),'A',[a,b],g=>g._animKljuc||g.id,pts=>[{id:'A',pts,la:1,lo:1}],[],()=>({}),x=>x);assert.equal(out.length,2);assert.equal(out[0].pts.length,1);assert.equal(out[1],b);assert.equal(out[0]._animKljuc,'A');});
t('pojedinačni požar koristi manji marker',()=>assert.ok(html.includes('poz-mk-pojedinac')));
console.log('\n'+ok+' prošlo, '+(process.exitCode?1:0)+' palo');
