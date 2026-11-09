'use strict';
const assert=require('node:assert/strict'),fs=require('fs');
const d=fs.readFileSync(__dirname+'/../../static/js/department-report.js','utf8'),m=fs.readFileSync(__dirname+'/../../static/js/map-library.js','utf8'),c=fs.readFileSync(__dirname+'/../../static/css/map-library.css','utf8');
assert(/#d4118f/.test(d)&&/boundaryHalo=L\.geoJSON/.test(d),'granica odjela: magenta sa oreolom');
assert(/for\(const l of \[boundaryHalo,boundary/.test(d),'oreol se čisti sa granicom');
assert(/ml-own/.test(m)&&/--ml-own/.test(m)&&/\.ml-card\.ml-own/.test(c),'stavka preglednika nosi boju sloja');
assert(/select#library-sort/.test(c),'dropdown sortiranja je obojen');
console.log('OK boje granica/preglednik');
