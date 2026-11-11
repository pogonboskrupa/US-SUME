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
 assert(/Kolege \(' \+ _kontaktiLokalno\(\)\.length/.test(src),'dugme Kolege u Primljenim podacima');
 console.log('OK kontakti');
})().catch(e=>{console.error(e);process.exit(1);});
