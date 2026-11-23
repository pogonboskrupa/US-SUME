// v4.4.8: admin šalje obavijest o ažuriranju; obrisan primljeni sloj briše i zapis u Primljenim; badge na dugmetu Meni.
const fs=require('fs'),assert=require('assert');const src=require('./_izvor').izvor();
const mig=fs.readFileSync('supabase/migrations/20261121_obavijest_azuriranje.sql','utf8');
assert(/je_admin\(\)/.test(mig)&&/admin_posalji_azuriranje/.test(mig)&&/'kml'/.test(mig)&&/like '⬆ Nova verzija%'/.test(mig),'migracija: admin, vrsta kml (radi i na starim), zamjena stare obavijesti');
const ex=n=>{const i=src.indexOf('function '+n+'(');let d=0,j=src.indexOf('{',i);for(let k=j;;k++){if(src[k]==='{')d++;else if(src[k]==='}'&&--d===0)return src.slice(i,k+1);}};
const _verCmp=(a,b)=>{const pa=a.split('.').map(Number),pb=b.split('.').map(Number);for(let i=0;i<4;i++){const d=(pa[i]||0)-(pb[i]||0);if(d)return d<0?-1:1}return 0};
let lista=[{id:'a',naziv:'⬆ Nova verzija v4.4.8 — Meni → Ažuriraj aplikaciju'},{id:'b',naziv:'⬆ Nova verzija v4.4.2 — Meni → Ažuriraj aplikaciju'},{id:'c',naziv:'Foto 13.11.'}];const obrisani=[];
const f=new Function('APP_VER','_verCmp','_primljeniUcitaj','_primljeniSpremi','_kmlcDelete','_primljeniBadge','document',ex('_primAzurVerzija')+ex('_primAzurOcisti')+';return {_primAzurVerzija,_primAzurOcisti};');
const api=f('v4.4.5',_verCmp,()=>lista,l=>{lista=l;return true},k=>{obrisani.push(k);return Promise.resolve()},()=>{},{getElementById:()=>null});
assert.equal(api._primAzurVerzija(lista[0]),'4.4.8');assert.equal(api._primAzurVerzija(lista[2]),null);
api._primAzurOcisti();
assert.deepEqual(lista.map(x=>x.id),['a','c'],'obavijest za verziju koju već imam nestaje, nova ostaje, foto se ne dira');
assert.deepEqual(obrisani,['primljeno:b']);
assert(/azuriranje|adminPosaljiAzuriranje/.test(src)&&/admin_posalji_azuriranje/.test(src));
assert(/onclick="azurirajAplikaciju\(\)">⬇ Ažuriraj/.test(src),'primljena obavijest ima dugme Ažuriraj');
const d=src.slice(src.indexOf('function delK('),src.indexOf('function delK(')+1400);
assert(/_kmlcDelete\('primljeno:' \+ x\.id\)/.test(d)&&/x\.lokalno !== ime/.test(d),'brisanje sloja briše i primljeni zapis');
assert(/data-primljeno|setAttribute\('data-primljeno'/.test(src)&&/ima-primljeno/.test(fs.readFileSync('static/css/field-design.css','utf8')),'badge na dugmetu Meni');
console.log('ok primljeno / azuriranje');
