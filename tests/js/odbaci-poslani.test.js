'use strict';
const assert=require('node:assert/strict'),fs=require('fs');
const src=require('./_izvor').izvor(),sp=fs.readFileSync(__dirname+'/../../static/js/server-panel.js','utf8');
assert(/_serverOdbaci:odbaci/.test(sp)&&/sp-odbaci/.test(sp),'Odbaci dugme po grupi');
assert(/_redUkloni\(mojaGrupa\)/.test(sp)&&/destination\(op\)\.key===key/.test(sp),'uklanja samo stavke te grupe iz reda');
assert(!/FieldStore[^;]*(remove|delete|clear)/.test(sp.slice(sp.indexOf('async function odbaci'),sp.indexOf('_serverOdbaci:odbaci'))),'ne briše lokalne podatke');
// evidencija poslanog
const f=new Function('sbUser','localStorage','Date',src.slice(src.indexOf('function _poslaniKljuc'),src.indexOf('async function _poslaniObrisiSpisak'))+';return {_poslaniDodaj,_poslaniUcitaj};');
const st={};const ls={getItem:k=>st[k]??null,setItem:(k,v)=>{st[k]=v;},removeItem:k=>{delete st[k];}};
const a=f({id:'u1'},ls,Date);
a._poslaniDodaj('trag','Moj trag','Ana, Pero');a._poslaniDodaj('kml','Sloj','🔑 šifra ABCD2345');
const l=a._poslaniUcitaj();assert.equal(l.length,2);assert.equal(l[0].naziv,'Sloj','najnovije prvo');assert.equal(l[1].kome,'Ana, Pero');
for(let i=0;i<150;i++)a._poslaniDodaj('kml','x'+i,'k');assert.equal(a._poslaniUcitaj().length,100,'spisak je ograničen na 100');
// podaciPosalji bilježi uspješna slanja, a Obriši spisak ne dira fajlove
const pp=src.slice(src.indexOf('async function podaciPosalji'),src.indexOf('// Admin šalje BILO KOM'));
assert(/_poslaniDodaj\(vrsta, naziv, ok\.join/.test(pp)&&/_poslaniDodaj\(vrsta, naziv, '🔑 šifra '/.test(pp));
const ob=src.slice(src.indexOf('async function _poslaniObrisiSpisak'),src.indexOf('async function _primljeniObrisiSpisak'));
assert(!/_kmlcDelete|kmlLs/.test(ob),'brisanje spiska poslanog ne dira fajlove');
assert(/Obriši spisak primljenih/.test(src)&&/Obriši spisak poslanih/.test(src));
// podtab: poslano je zaseban prikaz, a otvaranje panela uvijek počinje na primljenom
const r=src.slice(src.indexOf("var _primTab"),src.indexOf('async function _primljeniNaKarti')>0?src.indexOf("function _primljeniRender")+3000:undefined);
assert(/_primTabPostavi/.test(src)&&/prm-tabovi/.test(src)&&/Poslano \(/.test(src));
assert(/if \(!poslano\) \{[\s\S]*?Preuzmi šifrom[\s\S]*?\} else \{[\s\S]*?_poslaniObrisiSpisak/.test(r),'sadržaj je razdvojen po podtabu');
assert(/oznaciVidjeno && !poslano/.test(r),'novo se ne označava viđenim dok je otvoreno Poslano');
assert(/_primTab = 'p';\s*_primljeniRender\(true\)/.test(src),'otvaranje panela počinje na Primljeno');
console.log('OK odbaci + poslani spisak');
