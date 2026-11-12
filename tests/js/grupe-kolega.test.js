'use strict';
// v4.2.0: admin povezuje kolege u grupe; korisnik vidi samo kolege iz svojih grupa kao prijedlog za slanje.
const assert = require('node:assert/strict'), fs = require('fs');
const src = require('./_izvor').izvor();
const sql = fs.readFileSync(__dirname + '/../../supabase/migrations/20261115_grupe_kolega.sql', 'utf8');
// Server
for (const f of ['admin_grupe_lista', 'admin_grupa_spremi', 'admin_grupa_obrisi']) {
  const i = sql.indexOf('function public.' + f), tijelo = sql.slice(i, sql.indexOf('end; $$;', i));
  assert(/if not public\.je_admin\(\) then raise exception/.test(tijelo), f + ' je samo za admina');
}
assert(/kolege_grupe_clanovi \(grupa_id, korisnik_id\)|primary key \(grupa_id, korisnik_id\)/.test(sql), 'korisnik može biti u više grupa (par grupa+korisnik)');
assert(/enable row level security/.test(sql) && !/create policy/.test(sql), 'tabele bez politika — samo kroz funkcije');
const kig = sql.slice(sql.indexOf('function public.kolege_iz_grupa'), sql.indexOf('-- Slanje dozvoljeno'));
assert(/on_\.korisnik_id <> auth\.uid\(\)/.test(kig) && !/naziv/.test(kig), 'vraća samo kolege, bez naziva grupe');
assert(/kolege_grupe_clanovi a join public\.kolege_grupe_clanovi b on b\.grupa_id = a\.grupa_id/.test(sql), 'slanje dozvoljeno zajedničkoj grupi');
// Klijent: spisak za izbor = šifra + grupe, bez duplikata, bez imena grupa
const a = src.indexOf('const _GRUPE_KOLEGE_PREF'), b = src.indexOf('// Poziv je dvosmjeran');
const ls = {};
const mk = (kont, grup) => { ls['tvlake_kontakti_v1:ja'] = JSON.stringify(kont); ls['tvlake_grupe_kolege_v1:ja'] = JSON.stringify(grup);
  return new Function('S', 'with(S){' + src.slice(src.indexOf('function _kontaktiLokalno'), src.indexOf('function _kontaktiLista')).split('\n').slice(0, 3).join('\n') + src.slice(a, b) + ';return {lista:_kontaktiLista,grupe:_grupeLokalno};}')(
    { sbUser: { id: 'ja' }, _KONTAKTI_PREF: 'tvlake_kontakti_v1:', _kontaktiKljuc: () => 'tvlake_kontakti_v1:ja', _bojaZaId: () => '#123', localStorage: { getItem: k => ls[k] ?? null } }); };
const api = mk([{ id: 'k1', ime: 'Ana' }, { id: 'k2', ime: 'Boris' }], [{ id: 'k2', ime: 'Boris' }, { id: 'g1', ime: 'Cica', sumarija: 'CAZIN' }]);
assert.deepEqual(api.lista().map(k => k.ime), ['Ana', 'Boris', 'Cica'], 'ista osoba iz šifre i grupe je jednom');
assert(api.lista().every(k => !('grupa' in k) && !('naziv' in k)), 'u spisku za slanje nema grupa');
assert.deepEqual(mk([], []).lista(), []);
ls['tvlake_grupe_kolege_v1:ja'] = '{pokvareno'; assert.deepEqual(mk([], []).grupe().length, 0);
// Osvježavanje i UI
assert(/sb\.rpc\('kolege_iz_grupa'\)/.test(src) && /_GRUPE_KOLEGE_PREF \+ sbUser\.id/.test(src), 'osvježavanje kolega iz grupa');
assert(/if \(isAdmin\(\)\) h \+= _grupeAdminHtml\(\)/.test(src), 'grupe samo adminu u tabu Kolege');
assert(/async function _grupaUredi\(id\)\s*\{\s*if \(!isAdmin\(\)\) return;/.test(src), 'uređivač samo za admina');
assert(/admin_grupa_spremi/.test(src) && /admin_grupa_obrisi/.test(src) && /id="gr-sum"/.test(src), 'spremanje, brisanje, filter po šumariji');
assert(/k\.grupa && !k\.sifra && k\.izvor !== 'sumarija' \? 'predložen'/.test(src), 'korisnik vidi "predložen", ne naziv grupe');
console.log('OK grupe kolega');
