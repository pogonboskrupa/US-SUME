'use strict';
const assert=require('node:assert/strict'),fs=require('fs');
const d=fs.readFileSync(__dirname+'/../../static/js/department-report.js','utf8'),m=fs.readFileSync(__dirname+'/../../static/js/map-library.js','utf8'),c=fs.readFileSync(__dirname+'/../../static/css/map-library.css','utf8');
assert(/#0fb5a6/.test(d)&&/boundaryHalo=L\.geoJSON/.test(d),'granica odjela: tirkiz sa oreolom');
assert(/for\(const l of \[boundaryHalo,boundary/.test(d),'oreol se čisti sa granicom');
assert(/ml-own/.test(m)&&/--ml-own/.test(m)&&/\.ml-card\.ml-own/.test(c),'stavka preglednika nosi boju sloja');
assert(/select#library-sort/.test(c),'dropdown sortiranja je obojen');
console.log('OK boje granica/preglednik');
// v3.8.2: isključivanje klika na poligone KML fajla
const g=require('./_izvor').izvor(),le=fs.readFileSync(__dirname+'/../../static/js/layer-editor.js','utf8');
assert(/_kmlPopKlikOff/.test(le)&&!/_kmlPopZoom'?,'meta'/.test(le),'popup: Isključi klik umjesto Približi');
assert(/l\._kmlKlikOff = k\.klikOff === true; l\.options\.interactive = !l\._kmlKlikOff/.test(g),'poligon prestaje biti interaktivan');
assert(/\(l\._kmlSakriven \|\| l\._kmlKlikOff\)/.test(g),'hit-test preskače isključen fajl');
assert(/map\.on\('contextmenu'[\s\S]{0,400}_kmlKlikPostavi\(k, false\)/.test(g),'dugi pritisak ponovo uključuje klik');
assert(/klikOff: k\.klikOff===true/.test(g)&&/store\[origName\]\.klikOff/.test(g)&&/klikOff: data\.klikOff===true/.test(g),'stanje se pamti');
assert(/actionName==='klik'/.test(m),'preglednik ima uključi/isključi klik');
console.log('OK klik isključen');
