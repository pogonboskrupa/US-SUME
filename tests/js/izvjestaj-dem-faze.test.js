'use strict';
const assert=require('node:assert/strict'),fs=require('fs');
const dr=fs.readFileSync(__dirname+'/../../static/js/department-report.js','utf8');
const src=require('./_izvor').izvor();
// Prva faza samo iz keša, mreža tek ako ništa nije potpuno sačuvano
assert(/for\(const samoKes of \[true,false\]\)/.test(dr),'dvije faze');
assert(/\{samoKes:true\}/.test(dr));
// Prekid kad pločice zaredom ne stižu + budžet vremena + slab signal bez rubnih pločica
assert(/\+\+niz>=3/.test(dr)&&/NET_BUDZET/.test(dr)&&/nuzne\.length>6/.test(dr)&&/\(samoKes\|\|!slaba\)\?nuzne\.concat\(rubne\):nuzne/.test(dr));
// _getTerrariumTile poštuje samoKes (bez mreže)
const f=src.slice(src.indexOf('async function _getTerrariumTile'),src.indexOf('function _terrariumDecodeTile'));
assert(/opts&&opts\.samoKes\)return null/.test(f)&&f.indexOf('opts&&opts.samoKes')<f.indexOf('_fetchT('),'samoKes vraća prije mreže');
console.log('OK izvjestaj dem faze');
