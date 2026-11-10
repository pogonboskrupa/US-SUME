'use strict';
const assert = require('assert'), { izvor } = require('./_izvor');
const src = izvor();
const a = src.indexOf('let _primljeniBusy = false'), b = src.indexOf('// ── Panel "Primljeni podaci" ──');
assert(a > 0 && b > a);
const kod = src.slice(a, b);
const KML = '<?xml version="1.0"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document><Placemark><Point><coordinates>16,44,0</coordinates></Point></Placemark></Document></kml>';
class FakeDOMParser { parseFromString(t) { const ok = /<kml[\s>]/.test(t); return { querySelector: q => q === 'parsererror' ? null : (ok ? {} : null) }; } }
function mk(opts) {
  const log = { saved: [], deleted: [], toasts: [], order: [], rpc: null }, store = {};
  const rows = opts.rows || [];
  const sb = {
    from: () => ({
      select: (cols) => ({ eq: (_, v) => ({
        order: () => ({ limit: async () => { log.cols = cols; return { data: rows.map(r => { const { sadrzaj, ...z } = r; return z; }) }; } }),
        maybeSingle: async () => { log.sadrzajZa = (log.sadrzajZa || []).concat(v); const r = rows.find(x => x.id === v); return { data: r ? { sadrzaj: r.sadrzaj } : null }; }
      }) }),
      delete: () => ({ eq: async (_, id) => { log.deleted.push(id); log.order.push('server-delete:' + id); return {}; } })
    }),
    rpc: async (n, p) => { log.rpc = { n, p }; return opts.rpcErr ? { error: opts.rpcErr } : { data: 'x' }; }
  };
  const env = {
    sb, sbUser: { id: 'me' }, sbProfile: { sumarija: 'S' }, kolegeMap: { k1: { ime: 'Kolega Jedan' } }, document: { visibilityState: 'visible', getElementById: () => null },
    navigator: {}, window: {}, DOMParser: FakeDOMParser, Blob, localStorage: { getItem: k => store[k] ?? null, setItem: (k, v) => { store[k] = v; } },
    _withTimeout: p => p, _mrezaProbaj: () => true, _mrezaSila() {}, showToast: m => log.toasts.push(m),
    _kmlcSave: async (k) => { log.order.push('save:' + k); if (opts.saveFail) return false; log.saved.push(k); return true; }, _kmlcDelete: async () => {},
    _localSetKriticno: (k, v) => { store[k] = v; return true; }, isAdmin: () => false, isSpdField: () => false, _shareKolege: () => [{ id: 'k1', ime: 'Kolega Jedan' }], _dlgActions: async () => 0,
    _escHtml: x => x, _isNetworkErr: () => false, _sesijaPinom: async () => true,
  };
  env._dlgPrompt = async () => opts.sifraUnos ?? null; env._dlgActions = opts.akcije || (async () => 0); env.navigator = { clipboard: { writeText: async () => {} } };
  const rpcOrig = sb.rpc; sb.rpc = async (n, p) => { log.rpcs = (log.rpcs || []); log.rpcs.push({ n, p }); if (opts.rpcFn) return opts.rpcFn(n, p); return rpcOrig(n, p); };
  const api = new Function(...Object.keys(env), kod + ';return {_primljeniSync,_primljeniUcitaj,podaciPosalji,_kmlJeIspravan,primljeniPreuzmiSifrom};')(...Object.values(env));
  return { api, log, store };
}
(async () => {
  // primanje: lokalni upis PRIJE brisanja sa servera
  let t = mk({ rows: [{ id: 'r1', from_id: 'k1', vrsta: 'trag', naziv: 'Trag 1', sadrzaj: KML, created_at: new Date().toISOString() }] });
  await t.api._primljeniSync(true);
  assert.deepStrictEqual(t.log.order, ['save:primljeno:r1', 'server-delete:r1']);
  // zaglavlja bez sadržaja; sadržaj se preuzima samo za stavku koje nema na telefonu
  assert(!/sadrzaj/.test(t.log.cols)); assert.deepStrictEqual(t.log.sadrzajZa, ['r1']);
  await t.api._primljeniSync(true); assert.deepStrictEqual(t.log.sadrzajZa, ['r1'], 'već sačuvano se ne preuzima ponovo');
  const l = t.api._primljeniUcitaj(); assert.strictEqual(l.length, 1); assert.strictEqual(l[0].odIme, 'Kolega Jedan'); assert(!l[0].vidjeno);
  // neuspjeli lokalni upis → NE briše se sa servera (podatak ne smije nestati)
  t = mk({ saveFail: true, rows: [{ id: 'r2', from_id: 'k1', vrsta: 'kml', naziv: 'X', sadrzaj: KML, created_at: new Date().toISOString() }] });
  await t.api._primljeniSync(true);
  assert.deepStrictEqual(t.log.deleted, []); assert.strictEqual(t.api._primljeniUcitaj().length, 0);
  // neispravan sadržaj → ne čuva se, ukloni se sa servera
  t = mk({ rows: [{ id: 'r3', from_id: 'k1', vrsta: 'kml', naziv: 'X', sadrzaj: 'nije kml', created_at: new Date().toISOString() }] });
  await t.api._primljeniSync(true);
  assert.deepStrictEqual(t.log.saved, []); assert.deepStrictEqual(t.log.deleted, ['r3']);
  // ponovljeno povlačenje istog reda ne pravi duplikat (samo ponovi brisanje)
  t = mk({ rows: [{ id: 'r4', from_id: 'k1', vrsta: 'trag', naziv: 'T', sadrzaj: KML, created_at: new Date().toISOString() }] });
  await t.api._primljeniSync(true); await t.api._primljeniSync(true);
  assert.strictEqual(t.api._primljeniUcitaj().length, 1); assert.strictEqual(t.log.saved.length, 1);
  // obavijest o novom
  assert(t.log.toasts.some(m => /Primljeno/.test(m)));
  // slanje
  t = mk({}); await t.api.podaciPosalji('trag', 'Moj trag', KML);
  assert.strictEqual(t.log.rpc.n, 'posalji_podatke'); assert.strictEqual(t.log.rpc.p.p_to, 'k1'); assert.strictEqual(t.log.rpc.p.p_vrsta, 'trag');
  t = mk({ rpcErr: { message: 'Could not find the function public.posalji_podatke' } }); await t.api.podaciPosalji('trag', 'T', KML);
  assert(t.log.toasts.some(m => /migracije/.test(m)), 'objašnjenje kad migracija nije pokrenuta');
  // prevelik
  t = mk({}); await t.api.podaciPosalji('kml', 'Veliki', 'x'.repeat(3000000)); assert.strictEqual(t.log.rpc, null);
  // šifra: opcija iza kolega; šalje bez p_to, prikazuje šifru
  let prikazano = null;
  t = mk({ akcije: async (naslov, lista) => { if (/Šifra:/.test(naslov)) { prikazano = naslov; return 2; } return lista.length - 2; }, rpcFn: async (n) => n === 'posalji_podatke_sifrom' ? { data: 'ABCD2345' } : { data: null } });
  await t.api.podaciPosalji('trag', 'Moj trag', KML);
  assert.strictEqual(t.log.rpcs[0].n, 'posalji_podatke_sifrom'); assert(!('p_to' in t.log.rpcs[0].p)); assert(/ABCD 2345/.test(prikazano));
  // bez kolega (terenski profil) šifra je i dalje dostupna
  const t0 = mk({ akcije: async (naslov, lista) => { assert.strictEqual(lista.length, 3, 'kolega + šifra + odustani'); return 2; }, rpcFn: async () => ({ data: 'ZZZZ2222' }) });
  // preuzimanje: lokalno spremi PRIJE potvrde; neispravna šifra → nema upisa
  t = mk({ sifraUnos: 'abcd-2345', rpcFn: async (n) => n === 'preuzmi_podatke_sifrom' ? { data: [{ vrsta: 'trag', naziv: 'Sifrom', sadrzaj: KML, od_ime: 'Neko Treći' }] } : { data: null } });
  await t.api.primljeniPreuzmiSifrom();
  // v3.5.7: šifra je za više korisnika — klijent je ne "troši" (bez potvrde/brisanja)
  assert.deepStrictEqual(t.log.rpcs.map(x => x.n), ['preuzmi_podatke_sifrom']);
  assert.strictEqual(t.log.rpcs[0].p.p_sifra, 'ABCD2345'); assert.strictEqual(t.api._primljeniUcitaj()[0].odIme, 'Neko Treći');
  assert(t.log.order[0].startsWith('save:primljeno:sifra_ABCD2345'), 'upis lokalno');
  // isti korisnik drugi put istu šifru: ne preuzima ponovo (bez duple kopije)
  await t.api.primljeniPreuzmiSifrom();
  assert.strictEqual(t.log.rpcs.length, 1); assert(t.log.toasts.some(m => /već preuzeo/.test(m)));
  t = mk({ sifraUnos: 'ABCD2345', rpcFn: async () => ({ data: [] }) });
  await t.api.primljeniPreuzmiSifrom();
  assert.strictEqual(t.api._primljeniUcitaj().length, 0); assert(t.log.toasts.some(m => /nije ispravna/.test(m)));
  t = mk({ sifraUnos: 'ABCD2345', saveFail: true, rpcFn: async (n) => n === 'preuzmi_podatke_sifrom' ? { data: [{ vrsta: 'trag', naziv: 'X', sadrzaj: KML }] } : { data: null } });
  await t.api.primljeniPreuzmiSifrom();
  assert(!t.log.rpcs.some(x => x.n === 'potvrdi_preuzimanje_sifrom'), 'neuspjeh lokalnog upisa NE potvrđuje (podatak ostaje na serveru)');
  t = mk({ sifraUnos: 'kratko' }); await t.api.primljeniPreuzmiSifrom(); assert(t.log.toasts.some(m => /5 cifara/.test(m)));
  // _msrToKml
  const m = src.slice(src.indexOf('function _msrToKml'), src.indexOf('function _msrPosalji'));
  const toKml = new Function('_hexToKmlColor', '_escXml', m + ';return _msrToKml;')(() => 'ff0000ff', x => x);
  const k1 = toKml({ name: 'P', mode: 'area', pts: [{ lat: 1, lng: 2 }, { lat: 1, lng: 3 }, { lat: 2, lng: 3 }] });
  assert(/<Polygon>/.test(k1) && /2,1,0 3,1,0 3,2,0 2,1,0/.test(k1), 'poligon je zatvoren');
  assert(/<LineString>/.test(toKml({ name: 'L', mode: 'dist', pts: [{ lat: 1, lng: 2 }, { lat: 1, lng: 3 }] })));
  // migracija: nema insert politike, provjera šumarije na serveru
  const sql = require('fs').readFileSync(__dirname + '/../../supabase/migrations/20261106_primljeni_podaci.sql', 'utf8');
  const sql2 = require('fs').readFileSync(__dirname + '/../../supabase/migrations/20261107_primljeni_sifrom.sql', 'utf8');
  assert(/claimed_by <> auth\.uid\(\)/.test(sql2) && /podaci_sifre_pokusaji/.test(sql2) && /interval '2 days'/.test(sql2) && /enable row level security/.test(sql2) && !/create policy/i.test(sql2), 'šifre: bez politika, 2 dana, ograničenje pokušaja');
  const sql3 = require('fs').readFileSync(__dirname + '/../../supabase/migrations/20261108_sifra_vise_preuzimanja.sql', 'utf8');
  assert(!/claimed_by/.test(sql3.split('-- ====')[2] || sql3.slice(sql3.indexOf('create or replace'))) && /podaci_sifre_pokusaji/.test(sql3) && !/delete from public\.podaci_sifre where sifra/.test(sql3), 'šifra za više korisnika, bez brisanja pri potvrdi');
  assert(/distinct from v_ja_sum/.test(sql) && !/for insert/i.test(sql) && /to_id = auth\.uid\(\)/.test(sql) && /zzz_odobren/.test(sql));
  console.log('primljeni-podaci: ok');
})().catch(e => { console.error(e); process.exit(1); });
// "Na karti" drugi put ne pravi novu kopiju sloja; Sakrij umjesto Kopiraj u popupu; tačka centra ispod popupa
(function () {
  const f = src.slice(src.indexOf('async function _primljeniNaKarti'), src.indexOf('async function _primljeniPreimenuj'));
  assert(/x\.lokalno && kmlLs\.find/.test(f) && /x\.lokalno = ime; _primljeniSpremi\(lista\)/.test(f), 'primljeni: bez duplih kopija');
  assert(f.indexOf('kmlLs.find') < f.indexOf('_localLayerKml('), 'provjera prije uvoza');
  const le = require('fs').readFileSync(__dirname + '/../../static/js/layer-editor.js', 'utf8');
  assert(/btn\('_kmlPopSakrij','sakrij','Sakrij'\)/.test(le) && !/_kmlPopKopiraj/.test(le) && /function _kmlPopSakrij/.test(le), 'popup: Sakrij');
  assert(/map\.on\('popupopen', \(\) => document\.body\.classList\.add\('popup-otvoren'\)\)/.test(src));
  assert(/body\.popup-otvoren #main:not\(\.drawing-active\) #map-center-dot \{ visibility:hidden; \}/.test(src));
  console.log('primljeni bez duplikata / popup Sakrij / tačka centra: ok');
})();
