'use strict';
const assert=require('node:assert/strict'),fs=require('fs');
const src=require('./_izvor').izvor();
const sql=fs.readFileSync(__dirname+'/../../supabase/migrations/20261111_sifra_kratka.sql','utf8');
const html=fs.readFileSync(__dirname+'/../../index.html','utf8');
// Server: 5 cifara, stare 8-znakovne ostaju važeće
assert(/\^\[0-9\]\{5\}\$/.test(sql)&&/\[A-HJKMNP-Z2-9\]\{8\}/.test(sql),'constraint dopušta 5 cifara i staru šifru');
assert(/lpad\(v_br::text, 5, '0'\)/.test(sql),'šifra se dopunjava nulama do 5 cifara');
assert(/gen_random_uuid/.test(sql),'CSPRNG izvor');
// Klijent: terenski profil bez spiska korisnika, direktno šifra
const f=src.slice(src.indexOf('async function podaciPosalji'),src.indexOf('// Admin šalje BILO KOM'));
assert(/samoSifra = !admin && isSpdField\(\)/.test(f));
assert(/samoSifra \? \[\]/.test(f),'terenski ne učitava kolege');
assert(/if \(samoSifra\) \{\s*i = 0;/.test(f),'terenski preskače birač');
// Unos: 5 cifara (i stara 8)
const u=src.slice(src.indexOf('async function primljeniPreuzmiSifrom'),src.indexOf('async function primljeniPreuzmiSifrom')+900);
assert(/sifra\.length !== 5 && sifra\.length !== 8/.test(u)&&/5 cifara/.test(u));
// Upute po profilima
assert(/helpTab\('fajlovi'/.test(html)&&/id="help-pane-fajlovi"/.test(html));
assert(/data-uloge="teren"/.test(html)&&/data-uloge="projektant vodeci admin"/.test(html));
assert(/'fajlovi'/.test(src.slice(src.indexOf('function helpTab'),src.indexOf('function helpTab')+500)),'helpTab zna novi pane');
assert(/data-uloge/.test(src.slice(src.indexOf('function showHelp'),src.indexOf('function closeHelp'))),'showHelp bira dio za ulogu');
console.log('OK sifra kratka + upute');
