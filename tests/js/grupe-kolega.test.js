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
assert(/if \(isAdmin\(\)\) h \+= '<button[^']*grupeAdminOtvori\(\)/.test(src), 'dugme prema grupama samo adminu u tabu Kolege');
const html = fs.readFileSync(__dirname + '/../../index.html', 'utf8');
assert(/id="admin-grupe-btn" onclick="grupeAdminOtvori\(\)"/.test(html), 'zasebna sekcija u admin panelu (Korisnici)');
assert(/function grupeAdminOtvori\(\) \{\s*if \(!isAdmin\(\)\)/.test(src), 'sekcija samo za admina');
assert(/function _grupePanelRender/.test(src)&&/Terenski \(/.test(src)&&/Projektanti \(/.test(src)&&/Uredi članove/.test(src), 'panel: članovi podijeljeni na terenske i projektante, uređivanje');
// Primljeno: pretraga i filter po vrsti
{
  const s0 = src.indexOf('function _primListaHtml'), s1 = src.indexOf('function _primFiltriraj');
  const lst = [{id:'1',vrsta:'trag',naziv:'Trag Una',odIme:'Amir',t:1,kb:2},{id:'2',vrsta:'kml',naziv:'Granica',odIme:'Dino',t:1,kb:2},{id:'3',vrsta:'kml',naziv:'Foto 12.11.',odIme:'Amir',t:1,kb:2}];
  const f = new Function('S', 'with(S){' + src.slice(s0, s1) + ';return _primListaHtml;}')({ _primFilter: { q: '', v: '' }, _primRedHtml: x => '[' + x.id + ']', _escHtml: x => x });
  assert.equal(f(lst), '[1][2][3]');
  const g2 = new Function('S', 'with(S){' + src.slice(s0, s1) + ';return _primListaHtml;}')({ _primFilter: { q: 'amir', v: 'kml' }, _primRedHtml: x => '[' + x.id + ']', _escHtml: x => x });
  assert(/\[3\]/.test(g2(lst)) && !/\[1\]|\[2\]/.test(g2(lst)), 'pretraga po pošiljaocu + vrsta');
  assert(/Nema rezultata/.test(new Function('S', 'with(S){' + src.slice(s0, s1) + ';return _primListaHtml;}')({ _primFilter: { q: 'zzz', v: '' }, _primRedHtml: () => '', _escHtml: x => x })(lst)));
}
// Admin picker: grupe kao prečice
assert(/function _primaocBiraj\(lista, naziv, prikaziSumariju, grupe\)/.test(src)&&/id="prim-grupe"/.test(src)&&/const grupe = admin \?/.test(src), 'admin bira primaoce preko grupa');
assert(/async function _grupaUredi\(id\)\s*\{\s*if \(!isAdmin\(\)\) return;/.test(src), 'uređivač samo za admina');
assert(/admin_grupa_spremi/.test(src) && /admin_grupa_obrisi/.test(src) && /id="gr-sum"/.test(src), 'spremanje, brisanje, filter po šumariji');
assert(/k\.grupa && !k\.sifra && k\.izvor !== 'sumarija' \? 'predložen'/.test(src), 'korisnik vidi "predložen", ne naziv grupe');
console.log('OK grupe kolega');
// v4.2.2: zadane kolege po korisniku (jednosmjerno; korisnik i dalje dodaje šifrom)
{
  const z = fs.readFileSync(__dirname + '/../../supabase/migrations/20261116_zadane_kolege.sql', 'utf8');
  for (const f of ['admin_zadane_lista', 'admin_zadane_spremi']) {
    const i = z.indexOf('function public.' + f);
    assert(/if not public\.je_admin\(\) then raise exception/.test(z.slice(i, z.indexOf('end; $$;', i))), f + ' samo admin');
  }
  assert(/primary key \(korisnik_id, kolega_id\)/.test(z) && /enable row level security/.test(z) && !/create policy/.test(z));
  const kig = z.slice(z.indexOf('function public.kolege_iz_grupa'), z.indexOf('create or replace function public.posalji_podatke'));
  assert(/kolege_grupe_clanovi/.test(kig) && /from public\.kolege_zadane z join public\.korisnici k on k\.id = z\.kolega_id/.test(kig) && /where z\.korisnik_id = auth\.uid\(\)/.test(kig), 'meni se vraćaju grupe + zadane (jednosmjerno)');
  assert(/from public\.kolege_zadane z where z\.korisnik_id = auth\.uid\(\) and z\.kolega_id = p_to/.test(z), 'slanje dozvoljeno zadanim kolegama');
  assert(/function _zadaneUredi/.test(src) && /async function _zadaneUredi\(korisnikId\)\s*\{\s*if \(!isAdmin\(\)\) return;/.test(src), 'uređivanje samo admin');
  assert(/admin_zadane_spremi/.test(src) && /admin_zadane_lista/.test(src) && /Zadane kolege po korisniku/.test(src) && /_korisnikJedan\(svi/.test(src));
  assert(/_zadaneAdminUcitaj\(true\)\.then\(\(\) => _grupePanelRender\(\)\)/.test(src), 'panel učitava zadane');
}
{
  const d = fs.readFileSync(__dirname + '/../../supabase/migrations/20261117_zadane_dvosmjerno.sql', 'utf8');
  assert(/drop function if exists public\.admin_zadane_spremi\(uuid, uuid\[\]\)/.test(d), 'stari potpis se uklanja (bez dvosmislenog poziva)');
  assert(/p_dvosmjerno boolean default false/.test(d) && /if not public\.je_admin\(\) then raise exception/.test(d), 'samo admin');
  assert(/select k\.id, p_korisnik, auth\.uid\(\) from public\.korisnici k/.test(d), 'izabrane kolege dobijaju korisnika (povratna veza)');
  assert(/z\.kolega_id = p_korisnik and z\.korisnik_id = any \(v_stari\)/.test(d), 'uklonjeni kolega gubi povratnu vezu');
  assert(/id="zd-dvosmjerno" checked/.test(src) && /p_dvosmjerno: !!q\('#zd-dvosmjerno'\)\?\.checked/.test(src), 'klijent šalje izbor, zadano uključeno');
}
console.log('OK zadane kolege');
