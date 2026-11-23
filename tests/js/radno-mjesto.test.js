'use strict';
// v4.7.5: radno mjesto korisnika — spisak sa servera (admin dodaje/sklanja), filter u Korisnicima i Grupama.
const assert = require('node:assert/strict'), fs = require('fs');
const src = require('./_izvor').izvor();
const fn = n => { const m = new RegExp('(?:async )?function ' + n + '\\(').exec(src); assert(m, n); let d = 0, i = src.indexOf('{', m.index + m[0].length - 1); for (; i < src.length; i++) { if (src[i] === '{') d++; else if (src[i] === '}' && !--d) break; } return src.slice(m.index, i + 1); };
const cst = n => { const a = src.indexOf('const ' + n + ' = ['); assert(a >= 0, n); return src.slice(a, src.indexOf('];', a) + 2); };
let ok = 0; const t = (n, f) => { f(); ok++; console.log('OK ' + n); };
const esc = x => String(x).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

const env = spisak => new Function('_escHtml', '_rmSpisak', cst('_RADNA_MJESTA_ZADANA') + fn('_rmSvi') + fn('_rmLista') + fn('_rmNaziv') + fn('_rmOpcije') + 'return {_rmLista,_rmNaziv,_rmOpcije,_RADNA_MJESTA_ZADANA};')(esc, spisak);

t('zadani spisak: traženih 8 mjesta + Terenski radnik, isti kodovi kao migracija', () => {
  const { _RADNA_MJESTA_ZADANA: z } = env(null);
  assert.deepEqual(z.map(x => x[1]), ['Upravnik šumarije', 'Pomoćnik upravnika', 'Tehnolog', 'Poslovođa iskorištavanja', 'Poslovođa uzgoja', 'Primač šume na panju', 'Otpremač', 'Radnik u primci', 'Terenski radnik']);
  const m = fs.readFileSync(__dirname + '/../../supabase/migrations/20261124_radno_mjesto.sql', 'utf8');
  for (const [k, n] of z) assert(m.includes("('" + k + "','" + n + "',"), k);
});

t('spisak sa servera: sklonjeno se ne nudi, ali ostaje izabrano onome ko ga ima', () => {
  const e = env([{ kod: 'teren', naziv: 'Terenski radnik', aktivno: true }, { kod: 'rm_x', naziv: 'Lugar', aktivno: true }, { kod: 'stari', naziv: 'Stari', aktivno: false }]);
  assert.deepEqual(e._rmLista(), [['teren', 'Terenski radnik'], ['rm_x', 'Lugar']]);
  assert.equal(e._rmNaziv('stari'), 'Stari');
  assert.equal(e._rmNaziv('nema'), 'Nepoznato radno mjesto');
  assert.equal(e._rmNaziv(''), '');
  assert(/value="stari" selected>Stari \(sklonjeno\)/.test(e._rmOpcije('stari')));
  assert(!/Stari/.test(e._rmOpcije('teren')));
});

t('filter Korisnika po radnom mjestu (bez = odabrano prazno, ne "ne znam")', () => {
  const f = new Function(fn('_admFiltriraj') + 'return _admFiltriraj;')();
  const u = [{ id: 1, radno_mjesto: 'teren' }, { id: 2, radno_mjesto: '' }, { id: 3, radno_mjesto: undefined }, { id: 4, radno_mjesto: 'upravnik' }];
  assert.deepEqual(f(u, { rm: 'teren' }).map(x => x.id), [1]);
  assert.deepEqual(f(u, { rm: '-' }).map(x => x.id), [2]);
  assert.deepEqual(f(u, {}).map(x => x.id), [1, 2, 3, 4]);
});

t('admin: kartica, izbor u Upravljaj, filter + ⚙ Spisak, Grupe editor', () => {
  const k = fn('_admKarticaHtml');
  assert(/_admRmIzbor\('\$\{uid\}'/.test(k) && /class="adm-rm/.test(k));
  const r = fn('_adminRenderUsers');
  assert(/_admPostaviRm\(this\.value\)/.test(r) && /onclick="_rmUpravljaj\(\)"/.test(r) && /rm: _admRmFilter/.test(r));
  const g = fn('_grupaUredi');
  assert(/id="gr-rm"/.test(g) && /rf === '-' \? rm : \(rf && rm !== rf\)/.test(g) && /_rmListaUcitaj\(\)/.test(g));
  assert(/sb\.rpc\('admin_set_radno_mjesto', \{ p_user: uid, p_rm: v \}\)/.test(fn('adminSetRadnoMjesto')));
  const u = fn('_rmUpravljaj');
  assert(/admin_radno_mjesto_dodaj/.test(u) && /admin_radno_mjesto_skloni/.test(u) && /_dlgConfirm/.test(u));
});

t('Moj nalog: kartica za sve korisnike, čuva preko RPC-a', () => {
  const html = fs.readFileSync(__dirname + '/../../index.html', 'utf8');
  assert(/<form id="nalog-rm-kartica" class="nalog-kartica" onsubmit="nalogSacuvajRadnoMjesto\(\);return false"/.test(html));
  assert(/_nalogRmPripremi\(\);\s*m\.hidden = false;/.test(fn('nalogOtvori')));
  const s = fn('nalogSacuvajRadnoMjesto');
  assert(/sb\.rpc\('postavi_svoje_radno_mjesto', \{ p_rm: v \}\)/.test(s) && /_profileSave\(sbProfile\)/.test(s));
});
console.log(ok + ' prošlo, 0 palo');
