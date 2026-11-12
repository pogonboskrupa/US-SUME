'use strict';
const assert=require('node:assert/strict'),fs=require('fs');
const src=require('./_izvor').izvor();
const sql=fs.readFileSync(__dirname+'/../../supabase/migrations/20261112_kontakti.sql','utf8');
// Server: poziv, prihvatanje u oba smjera, slanje dozvoljeno za kontakt
assert(/create or replace function public\.kontakt_poziv_prihvati/.test(sql)&&/insert into public\.kontakti \(a, b\) values \(auth\.uid\(\), r\.from_id\)/.test(sql)&&/values \(r\.from_id, auth\.uid\(\)\)/.test(sql),'veza u oba smjera');
assert(/exists \(select 1 from public\.kontakti c where c\.a = auth\.uid\(\) and c\.b = p_to\)/.test(sql),'posalji_podatke dozvoljava kontakt');
assert(/podaci_sifre_pokusaji/.test(sql),'brana pogađanja koda');
// Klijent
const a=src.indexOf('const _KONTAKTI_PREF'),b=src.indexOf('async function _kontaktiPozovi');
const mk=(ls,rpc)=>{const store=Object.assign({},ls),toasts=[];
 const api=new Function('localStorage','sb','sbUser','showToast','_withTimeout','_mrezaProbaj','_bojaZaId',src.slice(a,b)+';return {_kontaktiLokalno,_kontaktiLista,_kontaktiOsvjezi,_kontaktiSpremi};')(
  {getItem:k=>store[k]??null,setItem:(k,v)=>{store[k]=v;}},{rpc},{id:'ja'},m=>toasts.push(m),p=>p,()=>true,id=>'#'+id);
 return {api,store,toasts};};
(async()=>{
 let t=mk({}, async()=>({data:[{id:'k1',ime:'Ana A',sumarija:'Cazin'}]}));
 assert.deepEqual(t.api._kontaktiLokalno(),[]);
 const r=await t.api._kontaktiOsvjezi(true);
 assert.equal(r.length,1);assert.equal(t.api._kontaktiLista()[0].ime,'Ana A');
 assert(t.store['tvlake_kontakti_v1:ja'],'sprema se po korisniku');
 assert(t.toasts.some(m=>/Ana A/.test(m)),'obavijest da je kolega dodan');
 // pad mreže ne briše spisak
 t=mk({'tvlake_kontakti_v1:ja':JSON.stringify([{id:'k9',ime:'Stari'}])}, async()=>{throw new Error('Failed to fetch');});
 const r2=await t.api._kontaktiOsvjezi(true);assert.equal(r2[0].id,'k9');assert.equal(t.api._kontaktiLokalno().length,1);
 // korumpiran zapis
 t=mk({'tvlake_kontakti_v1:ja':'{pokvareno'}, async()=>({data:[]}));assert.deepEqual(t.api._kontaktiLokalno(),[]);
 // UI: izbornik, dugme u biraču i u dijalogu fotografije
 assert(/async function kontaktiDodaj/.test(src)&&/id="prim-dodaj"/.test(src)&&/_shareFotoDodajKolegu/.test(src));
 assert(/const teren = isSpdField\(\) && !isAdmin\(\);[\s\S]*let entries = teren \? \[\]/.test(src),'terenski u dijalogu slike ne vidi sve korisnike');
 assert(/_primTabPostavi\(\\'k\\'\)[^;]*Kolege \(' \+ kol\.length/.test(src),'tab Kolege u Primljenim podacima');
 // v4.1.1: jedan kod za više ljudi, dvosmjerno; spisak se osvježava prije izbora primaoca
 const sql=fs.readFileSync(__dirname+'/../../supabase/migrations/20261114_kontakt_poziv_vise.sql','utf8');
 const prih=sql.slice(sql.indexOf('function public.kontakt_poziv_prihvati'));
 assert(!/delete from public\.kontakt_pozivi where kod = v_k/.test(prih),'kod se ne briše pri prihvatanju');
 assert(!/for update/.test(prih)&&/insert into public\.kontakti \(a, b\) values \(auth\.uid\(\), r\.from_id\)/.test(prih)&&/insert into public\.kontakti \(a, b\) values \(r\.from_id, auth\.uid\(\)\)/.test(prih),'veza u oba smjera');
 assert(/where p\.from_id = auth\.uid\(\) order by p\.expires_at desc limit 1/.test(sql)&&!/>= 3 then/.test(sql),'isti važeći kod se dijeli');
 assert(/async function _kontaktiSvjezi/.test(src)&&/const moji = admin \? \[\] : await _kontaktiSvjezi\(\)/.test(src),'spisak se osvježava prije izbora');
 assert(/_kontaktiPozivAktivan\(\) \? 20000 : 120000/.test(src),'češće osvježavanje dok je poziv aktivan');
 assert(/može ga unijeti više kolega|Isti kod daj svim kolegama/.test(src),'tekst poziva kaže da ga može unijeti više ljudi');
 // v4.1.2: tab Kolege — projektanti iz šumarije automatski + kolege iz šifre; terenski samo šifra
 {
  const a=src.indexOf('function _primKolege()'),b=src.indexOf('async function _kontaktiUkloniJednog');
  const mk2=(teren,sh,lok)=>new Function('S','with(S){'+src.slice(a,b)+';return _primKolege();}')({isSpdField:()=>teren,isAdmin:()=>false,_shareKolege:()=>sh,kolegeMap:{a:{sumarija:'KRUPA'}},_kontaktiLokalno:()=>lok,_bojaZaId:()=>'#123'});
  const sh=[{id:'a',ime:'Ana',color:'#1'}],lok=[{id:'a',ime:'Ana'},{id:'z',ime:'Zoran',sumarija:'ŠPD'}];
  let r=mk2(false,sh,lok);assert.deepEqual(r.map(k=>k.ime),['Ana','Zoran']);assert.equal(r[0].izvor,'sumarija');assert.equal(r[0].sifra,true,'ista osoba iz šumarije i šifre je jedan red');assert.equal(r[1].izvor,'sifra');
  r=mk2(true,sh,lok);assert.deepEqual(r.map(k=>k.ime),['Ana','Zoran'],'terenski: samo iz šifre');assert(r.every(k=>k.izvor==='sifra'));
 }
 // v4.1.2: fotografija se šalje kao KML sa slikom u opisu
 {
  const a=src.indexOf('function _fotoToKml'),b=src.indexOf('async function _fotoPosalji');
  const kml=new Function('S','with(S){'+src.slice(a,b)+';return _fotoToKml;}')({_escXml:x=>String(x).replace(/&/g,'&amp;').replace(/</g,'&lt;')})({ts:1762900000000,la:44.9,lo:16.1,odjel:'50',gj:'Risovac Krupa'},'data:image/jpeg;base64,AAAA');
  assert(/<kml[\s>]/.test(kml)&&/<\/kml>\s*$/.test(kml),'ispravan KML okvir (prolazi server provjeru)');
  assert(/<img src="data:image\/jpeg;base64,AAAA"/.test(kml)&&/<coordinates>16\.1,44\.9,0<\/coordinates>/.test(kml)&&/Odjel 50/.test(kml));
  assert(/_fotoPosalji\(\$\{fkey\}\)/.test(src)&&!/openShareFotoDlg\(\$\{fkey\}\)/.test(src),'popup fotografije šalje kao KML');
  const lib=fs.readFileSync(__dirname+'/../../static/js/map-library.js','utf8');assert(/_fotoPosalji\(r\.ref\.ts\)/.test(lib));
  const le=fs.readFileSync(__dirname+'/../../static/js/layer-editor.js','utf8');
  const info=new Function('DOMParser',le.slice(le.indexOf('function _layerInfo'),le.indexOf('// Mjere objekta'))+';return _layerInfo;')(class{parseFromString(h){const d={body:{textContent:'x'},querySelectorAll:()=>[]};return d;}});
  assert.equal(info({_kmlDesc:'<img src="data:image/jpeg;base64,AAAA" width="320"/><p>x</p>'}).slika,'data:image/jpeg;base64,AAAA');
  assert.equal(info({_kmlDesc:'<img src="https://zlo.example/x.jpg">'}).slika,'','vanjski URL se ne prikazuje');
 }
 console.log('OK kontakti');
})().catch(e=>{console.error(e);process.exit(1);});
