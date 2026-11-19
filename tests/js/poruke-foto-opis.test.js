'use strict';
// v4.8.0: poruke kroz sandučić Primljenih podataka (bez migracije) i opis fotografije.
const assert = require('assert'), { izvor } = require('./_izvor');
const src = izvor();
const a = src.indexOf('let _primljeniBusy = false'), b = src.indexOf('// ── Panel "Primljeni podaci" ──');
const kod = src.slice(a, b);
const ex = n => { const i = src.indexOf('function ' + n + '('); assert(i > 0, n); let d = 0, j = src.indexOf('{', i); for (let k = j; ; k++) { if (src[k] === '{') d++; else if (src[k] === '}' && --d === 0) return src.slice(i, k + 1); } };
const _escXml = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
function mk(opts) {
  const store = {}, log = { rpcs: [], dlg: 0, toasts: [] };
  const env = {
    sb: { rpc: async (n, p) => { log.rpcs.push({ n, p }); return opts.rpcErr ? { error: { message: 'x' } } : { data: 'id' }; }, from: () => ({}) },
    sbUser: { id: 'me' }, sbProfile: {}, kolegeMap: {}, document: { getElementById: () => null, visibilityState: 'visible' }, navigator: {}, window: {}, Blob,
    localStorage: { getItem: k => store[k] ?? null, setItem: (k, v) => { store[k] = v; } },
    _withTimeout: p => p, _mrezaProbaj: () => true, _mrezaSila() {}, showToast: m => log.toasts.push(m), _escXml,
    _kmlcSave: async () => true, _kmlcDelete: async () => {}, _localSetKriticno: (k, v) => { store[k] = v; return true; },
    isAdmin: () => false, isSpdField: () => false, _shareKolege: () => [{ id: 'k1', ime: 'Ana' }, { id: 'k2', ime: 'Edin' }],
    _dlgActions: async () => { log.dlg++; return 0; }, _dlgPrompt: async () => null, _escHtml: x => x, _isNetworkErr: () => false, _sesijaPinom: async () => true,
  };
  const api = new Function(...Object.keys(env), kod + ';return {_porukaKml,_porukaIzKml,_porukaJe,_porukaNaziv,_kmlJeIspravan,_primljeniSnimiLokalno,podaciPosalji};')(...Object.values(env));
  return { api, log };
}
(async () => {
  const { api } = mk({});
  const tekst = 'Stižem za 10 min <kod "A"> & ostalo';
  const kml = api._porukaKml(tekst, [44.91234, 16.15678]);
  assert(api._kmlJeIspravan(kml), 'poruka je ispravan KML okvir (server je prima kao vrstu kml)');
  const p = api._porukaIzKml(kml);
  assert.strictEqual(p.tekst, tekst, 'tekst sa posebnim znakovima ostaje isti');
  assert.deepStrictEqual(p.lok, [44.91234, 16.15678]);
  assert.strictEqual(api._porukaIzKml(api._porukaKml('Bez lokacije', null)).lok, null);
  assert.strictEqual(api._porukaIzKml('<kml>nešto drugo</kml>'), null, 'običan KML nije poruka');
  const n = api._porukaNaziv('a'.repeat(200));
  assert(n.startsWith('✉ ') && n.length <= 62, 'naziv je skraćen');
  assert(api._porukaJe({ vrsta: 'kml', naziv: n }) && !api._porukaJe({ vrsta: 'trag', naziv: n }) && !api._porukaJe({ vrsta: 'kml', naziv: 'Granice' }));
  // primanje: tekst i lokacija se upisuju u stavku
  const lista = [];
  const st = await api._primljeniSnimiLokalno(lista, 'r1', 'kml', _escXml('x') && n, 'k1', 'Ana', 1, kml);
  assert.strictEqual(st.poruka, tekst); assert.deepStrictEqual(st.lok, [44.91234, 16.15678]);
  const obican = await api._primljeniSnimiLokalno([], 'r2', 'kml', 'Granice', 'k1', 'Ana', 1, kml);
  assert.strictEqual(obican.poruka, undefined, 'fajl koji nije poruka nema polje poruka');
  // slanje direktno poznatom primaocu: bez izbora, vraća true
  let t = mk({});
  const ok = await t.api.podaciPosalji('kml', n, kml, { kome: 'k2' });
  assert.strictEqual(ok, true); assert.strictEqual(t.log.dlg, 0, 'izbor primaoca se ne otvara');
  assert.strictEqual(t.log.rpcs.find(r => r.n === 'posalji_podatke').p.p_to, 'k2');
  t = mk({ rpcErr: true });
  assert.strictEqual(await t.api.podaciPosalji('kml', n, kml, { kome: 'k2' }), false, 'neuspjeh vraća false (nacrt ostaje)');

  // ── opis fotografije ──
  const fotos = [{ ts: 5, la: 44, lo: 16, thumb: 't' }];
  let saved = 0, tragSaved = 0;
  const meta = { fotos: [{ ts: 5, la: 44, lo: 16 }] }, reg = [{ fotos: [{ ts: 5 }] }];
  const f = new Function('_locFotos', '_saveFotos', '_tragLiveMeta', '_crashSaveTrag', '_tragRegistry', '_tragRegSave',
    'const _FOTO_OPIS_MAX = 500;' + ex('_fotoOpisNormalizuj') + ex('_fotoOpisPostavi') + ';return _fotoOpisPostavi;')(
    fotos, () => saved++, meta, () => {}, reg, () => tragSaved++);
  assert(f(5, '  Suho   stablo\n bukva 60 cm '));
  assert.strictEqual(fotos[0].opis, 'Suho stablo bukva 60 cm');
  assert.strictEqual(meta.fotos[0].opis, fotos[0].opis, 'ista slika u tragu dobija isti opis');
  assert.strictEqual(reg[0].fotos[0].opis, fotos[0].opis);
  assert(saved === 1 && tragSaved === 1);
  f(5, 'x'.repeat(900)); assert.strictEqual(fotos[0].opis.length, 500);
  // opis putuje u KML fotografije i traga, i čuva se lokalno
  assert(/name="Opis"/.test(ex('_fotoToKml')) && /f\.opis/.test(ex('_tragToKml')));
  assert(/opis\?\{opis\}/.test(ex('_saveFotos')) && /opis:opis\|\|''/.test(ex('_restoreFotos')));
  assert(/_fotoOpisPitaj\(ts\);\s*return;/.test(ex('onLocPhotoSelected')), 'opis se nudi i za sliku u tragu');
  assert(/_fotoOpisUredi\(\$\{fkey\}\)/.test(ex('_setupFotoPopup')), 'popup ima dugme Opis');
  // brzi izbor opisa (v4.8.1)
  const g = new Function('const _FOTO_OPIS_MAX = 500;' + ex('_fotoOpisNormalizuj') + 'const _FOTO_OPIS_BRZI = [\'Loš šumski red\', \'Silazak sa vlake\', \'Sanitar\', \'Bezdana\', \'Bespravna sječa\'];' + ex('_fotoOpisSastavi') + ex('_fotoOpisRastavi') + ';return {_fotoOpisSastavi,_fotoOpisRastavi};')();
  assert.strictEqual(g._fotoOpisSastavi(['Sanitar'], ''), 'Sanitar');
  assert.strictEqual(g._fotoOpisSastavi(['Bespravna sječa', 'Loš šumski red'], 'bukva 60 cm'), 'Loš šumski red, Bespravna sječa, bukva 60 cm', 'redoslijed po listi, slobodan tekst na kraju');
  assert.strictEqual(g._fotoOpisSastavi([], '  samo tekst '), 'samo tekst');
  assert.strictEqual(g._fotoOpisSastavi([], ''), '');
  assert.strictEqual(g._fotoOpisSastavi(['Nepoznato'], ''), '', 'izbor van liste se ignoriše');
  // uređivanje: postojeći opis se rastavlja nazad na izbore + tekst i sastavlja istim
  const r = g._fotoOpisRastavi('Loš šumski red, Sanitar, bukva 60 cm');
  assert.deepStrictEqual(r.izabrani, ['Loš šumski red', 'Sanitar']); assert.strictEqual(r.tekst, 'bukva 60 cm');
  assert.strictEqual(g._fotoOpisSastavi(r.izabrani, r.tekst), 'Loš šumski red, Sanitar, bukva 60 cm', 'uredi pa sačuvaj ne mijenja opis');
  assert.deepStrictEqual(g._fotoOpisRastavi('Sanitar').izabrani, ['Sanitar']); assert.strictEqual(g._fotoOpisRastavi('Sanitar').tekst, '');
  assert.strictEqual(g._fotoOpisRastavi('suho stablo').tekst, 'suho stablo'); assert.deepStrictEqual(g._fotoOpisRastavi('suho stablo').izabrani, []);
  console.log('OK poruke + opis fotografije');
})().catch(e => { console.error(e); process.exit(1); });
