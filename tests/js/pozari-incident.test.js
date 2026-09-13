'use strict';
const fs=require('fs'),path=require('path'),assert=require('assert');
const html=fs.readFileSync(path.join(__dirname,'../../index.html'),'utf8');
function fn(n){const s=html.indexOf('function '+n+'(');assert.ok(s>=0,'nedostaje '+n);let i=html.indexOf('{',s),d=0;for(;i<html.length;i++){if(html[i]==='{')d++;else if(html[i]==='}'&&!--d)return html.slice(s,i+1);}throw Error('nezatvorena '+n);}
const src=['_poziOrijent','_poziSegmentiSijeku','_poziVrstaPrepreke','_poziPragIzmedju','_poziTrajanje','_poziPovrsPouzdanost'].map(fn).join('\n');
const api=new Function(src+';return {_poziSegmentiSijeku,_poziVrstaPrepreke,_poziPragIzmedju,_poziTrajanje,_poziPovrsPouzdanost}')();
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
t('pojas projekcije je klikabilan i popup prikazuje hektare',()=>{assert.ok(html.includes('function _poziPojasPopupHtml('));assert.ok(/interactive:true/.test(html));});
t('pojedinačni požar koristi manji marker',()=>assert.ok(html.includes('poz-mk-pojedinac')));
console.log('\n'+ok+' prošlo, '+(process.exitCode?1:0)+' palo');
