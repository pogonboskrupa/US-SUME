'use strict';
const fs=require('fs'),assert=require('assert');
const sql=fs.readFileSync('supabase/migrations/20261101_karte_katalog_admin.sql','utf8');
const js=fs.readFileSync('static/js/map-downloads.js','utf8');
let n=0;const t=(m,f)=>{f();n++;console.log('  ok  '+m);};
t('migracija: upis samo kroz funkcije koje provjeravaju je_admin()',()=>{
  for(const fn of ['admin_set_karta_katalog','admin_reset_karta_katalog']){
    const body=sql.slice(sql.indexOf('function public.'+fn));assert(/je_admin\(\)/.test(body.slice(0,400)),fn);}
  assert(!/for (insert|update|delete)/i.test(sql),'nema direktne politike upisa');
  assert(/for select to authenticated using \(public\.je_odobren\(\)\)/.test(sql));
});
t('JS: sakrivene karte vidi samo admin, a izmjene idu kroz RPC',()=>{
  assert(/catalog\.filter\(s=>adm\|\|!ovrOf\(s\)\?\.sakriveno\)/.test(js));
  assert(/admin_set_karta_katalog/.test(js)&&/sb\.from\('karte_katalog'\)/.test(js));
  assert(/admin\.hidden=!adm|admEl\.hidden=!adm/.test(js));
});
t('JS: ključ izmjene je naziv fajla, ne GitHub asset id',()=>{assert(/ovr\.get\(s\.name\)/.test(js));assert(/p_kljuc:s\.name/.test(js));});
console.log(n+' prošlo, 0 palo');
