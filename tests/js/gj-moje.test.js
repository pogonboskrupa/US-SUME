'use strict';
// GJ: lista šumarije (admin, keš) + vlastite upisane GJ korisnika, bez duplikata, po korisniku.
const assert=require('node:assert/strict');
const src=require('./_izvor').izvor();
const a=src.indexOf('const _GJ_MOJE_KEY'),b=src.indexOf('function _gjFieldHtml');
const code=src.slice(a,b);
function mk(sum){const ls={};const S={sbUser:{id:'u1'},sbProfile:{sumarija:sum},document:{getElementById:()=>null},
 localStorage:{getItem:k=>ls[k]??null,setItem:(k,v)=>{ls[k]=v;}}};
 return {S,run:(e)=>new Function('S','with(S){'+code+';return '+e+'}')(S)};}
let m=mk('ŠUMARIJA BOS.KRUPA');assert.ok(m.run('_gjOpcije()').includes('Risovac Krupa'),'Krupa: ugrađeni spisak bez keša');
m=mk('ŠUMARIJA CAZIN');assert.deepEqual(m.run('_gjOpcije()'),[],'ostale: prazno');
m.run("(_gjZapamti('Una'),_gjZapamti('una'),_gjZapamti(' Sana '),_gjZapamti(''),0)");
assert.deepEqual(m.run('_gjOpcije()'),['Sana','Una'],'pamti bez duplikata, sortirano');
m.run("(S.sbUser={id:'u2'},0)");assert.deepEqual(m.run('_gjOpcije()'),[],'po korisniku');
const k=mk('ŠUMARIJA BOS.KRUPA');k.run("(_gjZapamti('Gomila'),_gjZapamti('Nova'),0)");assert.deepEqual(k.run('_gjMoje()'),['Nova'],'Krupa pamti samo GJ koje nisu na spisku');
assert(!/\.\.\._GJ_OPTIONS/.test(src),'dropdowni idu kroz _gjOpcije');
console.log('OK gj moje');
