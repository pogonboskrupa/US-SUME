const fs=require('fs'),assert=require('assert');
const li=fs.readFileSync(__dirname+'/../../static/js/local-layer-import.js','utf8');
const gl=fs.readFileSync(__dirname+'/../../static/js/app/glavni.js','utf8');
// klik zadano isključen za kamionski put i kad nije sa servera (po nazivu)
const m=li.match(/function klikOffZadano\(k\)\{[^\n]*\}/);assert(m,'klikOffZadano postoji');
const normal=s=>String(s||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase();
const role=()=>'';
const f=new Function('normal','role',m[0]+';return klikOffZadano;')(normal,role);
assert.strictEqual(f({name:'Kamionski put.kml'}),true);
assert.strictEqual(f({_origName:'KAMIONSKI PUTEVI 2021'}),true);
assert.strictEqual(f({name:'Granice odjela'}),false);
assert(/klikOffZadano\(layer\)\)layer\.klikOff=true/.test(li),'uvoz koristi pravilo');
assert(/!layer\.klikRucno&&globalThis\.GithubLayers\?\.klikOffZadano\(layer\)/.test(gl),'obnova poštuje ručni izbor');
// oznake mjerenja: skala po zumu, jedna varijabla na pane-u, ne na cijeloj karti
assert(/scale\(var\(--msr-k,1\)\)/.test(gl));
assert(/map\.getPane\('vlakeLabels'\)/.test(gl)&&/setProperty\('--msr-k'/.test(gl));
const k=z=>Math.round(Math.max(0.5,Math.min(1,0.5+(z-13)*0.125))*100)/100;
assert.strictEqual(k(18),1);assert.strictEqual(k(12),0.5);assert(k(15)<k(16)&&k(16)<k(17));
console.log('OK kamionski-klik-skala-oznaka');

// v4.6.4: zadano isključen klik mora važiti i za LINIJE i za sve putanje učitavanja.
{
  const fs=require('fs'),path=require('path');
  const src=fs.readFileSync(path.join(__dirname,'../../static/js/app/glavni.js'),'utf8');
  const assert=require('assert');
  assert(/klikRucno !== true && k\.klikOff !== true && globalThis\.GithubLayers\?\.klikOffZadano/.test(src),'default u applyKmlStyle');
  assert(/!l\._kmlIsPoint && !l\._kmlIsPolygon\) \{ l\._kmlKlikOff/.test(src),'linije poštuju klikOff');
  assert(/if \(l\._kmlKlikOff\) continue;/.test(src),'hit-test preskače linije sa isključenim klikom');
  console.log('ok v4.6.4 linije');
}

// v4.6.5: visina za nagib mjerenja je prosjek devet DEM uzoraka.
{
  const src=require('fs').readFileSync(require('path').join(__dirname,'../../static/js/app/glavni.js'),'utf8');
  const assert=require('assert');
  assert(/async function _msrDemElev\(lat, lng\) \{\s*const c = await _msrDemElevTacka/.test(src),'_msrDemElev uprosjecuje');
  assert(/async function _msrDemElevTacka\(lat, lng\)/.test(src),'jedna tacka ostaje');
  console.log('ok v4.6.5 glađenje');
}

// v4.6.6: offline karta ne traži pločice daleko ispod najnižeg nivoa u fajlu.
{
  const src=require('fs').readFileSync(require('path').join(__dirname,'../../static/js/app/glavni.js'),'utf8');
  const assert=require('assert');
  assert(/sqlMinZoom:Math\.max\(0,minNative-_SQL_DALEKO_NIVOA\)/.test(src)&&src.split('sqlMinZoom:Math.max').length===3,'oba sloja imaju sqlMinZoom');
  assert(/_update\(center\) \{\s*try \{\s*const mz = this\.options\.sqlMinZoom/.test(src),'_update preskace daleki zum');
  assert(!/minZoom:Math\.max\(0,minNative/.test(src.replace(/sqlMinZoom/g,'')),'nema Leaflet minZoom (ogranicio bi odzumiravanje mape)');
  console.log('ok v4.6.6 daleki zum');
}
