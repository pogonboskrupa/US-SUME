'use strict';
const assert=require('node:assert/strict'),fs=require('fs');
const src=require('./_izvor').izvor();
const sql=fs.readFileSync(__dirname+'/../../supabase/migrations/20261109_admin_salje_svima.sql','utf8');
// Server: samo admin zaobilazi šumariju
assert(/if not v_ja_admin and/.test(sql),'ograničenje šumarije samo za ne-admina');
// Klijent: admin ide kroz birač sa pretragom i listu svih korisnika
const f=src.slice(src.indexOf('async function podaciPosalji'),src.indexOf('// Admin šalje BILO KOM'));
assert(/isAdmin\(\)/.test(f)&&/_primaociSvi\(\)/.test(f)&&/_primaocBiraj\(/.test(f));
assert(/admin_get_all_users/.test(src.slice(src.indexOf('async function _primaociSvi'))));
assert(/prim-trazi/.test(src)&&/prim-sifra/.test(src),'birač ima pretragu i šifru kao sekundarnu opciju');
// Birač: filtriranje po imenu/šumariji ponovo mapira originalni indeks
const m=src.match(/const nadjeni = lista\.map\(\(k, idx\) => \(\{ k, idx \}\)\)/);
assert(m,'indeks u listi ostaje originalni, ne pozicija u filtriranom prikazu');
console.log('OK admin salje svima');
