'use strict';
const assert=require('node:assert/strict'),fs=require('fs');
const src=require('./_izvor').izvor();
const html=fs.readFileSync(__dirname+'/../../index.html','utf8');
const dl=fs.readFileSync(__dirname+'/../../static/js/map-downloads.js','utf8');
const cat=fs.readFileSync(__dirname+'/../../static/js/map-catalog.js','utf8');
// Podrazumijevani omiljeni: server karta, Google 2., kombinacije sa nagibom/ekspozicijom
assert(/tvlake_mapfav_auto_v2/.test(src)&&/tlKey: '📡 Google'/.test(src));
assert(/ovl: 'slope'/.test(src)&&/ovl: 'ekspo'/.test(src)&&/function _mapFavServerKarta/.test(src));
assert(/_mapFavServerKarta\(row\.name\)/.test(dl),'skinuta karta ide u omiljene sa kombinacijama');
assert(/_mapFavMigrirajServer/.test(src)&&/tvlake_mapfav_srv_v1/.test(src),'postojeće server karte dobijaju kombinacije');
assert(/mfav-tag/.test(cat)&&/data-kind/.test(cat),'kartica pokazuje vrstu');
assert(/_mapFavPrimijeniOvl\(fav\.ovl/.test(cat),'aktivacija primjenjuje sloj');
// Ekspozicija kao podloga ostaje podržana
assert(/key === '_ekspo'/.test(src));
// Pulsirajuća lokacija
assert(/loc-puls/.test(src)&&/@keyframes locPuls/.test(html)&&/render-lite \.loc-puls2/.test(html));
// Ponašanje: redoslijed server karta → Google → ostalo, bez duplikata
const body=src.slice(src.indexOf('function _mapFavKljuc'),src.indexOf('// Privremeni DEM sloj'));
let favs=[{id:'x',name:'Moja',type:'tl',tlKey:'⛰ Topo'}],saved=0;
const api=new Function('_mapFavs','_mapFavSave',body+';return {_mapFavServerKarta,_mapFavDodajAuto,_mapFavUredi};')(favs,()=>saved++);
api._mapFavDodajAuto({name:'Google satelit',type:'tl',tlKey:'📡 Google'});
assert(api._mapFavServerKarta('Karta A')===true);
assert(api._mapFavServerKarta('Karta A')===false,'ponovo ne dodaje');
const imena=favs.map(f=>f.name);
assert.deepEqual(imena.slice(0,2),['Karta A','Google satelit']);
assert(imena.includes('Karta A + Nagib')&&imena.includes('Karta A + Ekspozicija'));
assert.equal(favs.length,5);
// v4.0.9: automatske stavke prate ZADNJU skinutu kartu (jedna grupa), redoslijed karta, Google, nagib, ekspozicija
assert(api._mapFavServerKarta('Karta B')===true);
assert.deepEqual(favs.map(f=>f.name),['Karta B','Google satelit','Karta B + Nagib','Karta B + Ekspozicija','Moja'],'stara karta se zamjenjuje, korisnikova ostaje');
// ručni redoslijed se ne prepisuje
favs.forEach(f=>{f.rucno=1;});favs.reverse();const prije=favs.map(f=>f.name).join('|');api._mapFavUredi();
assert.equal(favs.map(f=>f.name).join('|'),prije,'ručni redoslijed ostaje');
assert(/function _mapFavPomjeri/.test(src)&&/Pomjeri gore/.test(src)&&/Pomjeri dolje/.test(src),'uređivanje: pomjeranje');
assert(/mfav-sek/.test(cat)&&/Brzi izbor/.test(cat),'sekcije u prikazu');
console.log('OK omiljene auto + puls');
