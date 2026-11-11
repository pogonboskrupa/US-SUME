'use strict';
const assert=require('node:assert/strict');
const src=require('./_izvor').izvor();
const a=src.indexOf('const _GJ_MOJE_KEY'),b=src.indexOf('function _gjFieldHtml');
const code=src.slice(a,b);
function mk(krupa){const ls={};const S={sbUser:{id:'u1'},_GJ_OPTIONS:['RISOVAC KRUPA','GOMILA'],_npIsKrupa:()=>krupa,
 localStorage:{getItem:k=>ls[k]??null,setItem:(k,v)=>{ls[k]=v;}}};
 return {S,run:(e)=>new Function('S','with(S){'+code+';return '+e+'}')(S)};}
let m=mk(true);assert.deepEqual(m.run('_gjOpcije()'),['RISOVAC KRUPA','GOMILA'],'Krupa: fiksni spisak');
m=mk(false);assert.deepEqual(m.run('_gjOpcije()'),[],'ostale: prazno');
m.run("(_gjZapamti('Una'),_gjZapamti('una'),_gjZapamti(' Sana '),_gjZapamti(''),0)");
assert.deepEqual(m.run('_gjOpcije()'),['Sana','Una'],'pamti bez duplikata, sortirano');
m.run("(S.sbUser={id:'u2'},0)");assert.deepEqual(m.run('_gjOpcije()'),[],'po korisniku');
const k=mk(true);k.run("(_gjZapamti('X'),0)");assert.deepEqual(k.run('_gjMoje()'),[],'Krupa ne pamti');
assert(!/\.\.\._GJ_OPTIONS/.test(src),'dropdowni idu kroz _gjOpcije');
console.log('OK gj moje');
