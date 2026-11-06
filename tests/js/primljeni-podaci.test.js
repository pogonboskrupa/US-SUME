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
      select: () => ({ eq: () => ({ order: () => ({ limit: async () => ({ data: rows }) }) }) }),
      delete: () => ({ eq: async (_, id) => { log.deleted.push(id); log.order.push('server-delete:' + id); return {}; } })
    }),
    rpc: async (n, p) => { log.rpc = { n, p }; return opts.rpcErr ? { error: opts.rpcErr } : { data: 'x' }; }
  };
  const env = {
    sb, sbUser: { id: 'me' }, sbProfile: { sumarija: 'S' }, kolegeMap: { k1: { ime: 'Kolega Jedan' } }, document: { visibilityState: 'visible', getElementById: () => null },
    navigator: {}, window: {}, DOMParser: FakeDOMParser, Blob, localStorage: { getItem: k => store[k] ?? null, setItem: (k, v) => { store[k] = v; } },
    _withTimeout: p => p, _mrezaProbaj: () => true, _mrezaSila() {}, showToast: m => log.toasts.push(m),
    _kmlcSave: async (k) => { log.order.push('save:' + k); if (opts.saveFail) return false; log.saved.push(k); return true; }, _kmlcDelete: async () => {},
    _localSetKriticno: (k, v) => { store[k] = v; return true; }, _shareKolege: () => [{ id: 'k1', ime: 'Kolega Jedan' }], _dlgActions: async () => 0,
    _escHtml: x => x, _isNetworkErr: () => false, _sesijaPinom: async () => true,
  };
  const api = new Function(...Object.keys(env), kod + ';return {_primljeniSync,_primljeniUcitaj,podaciPosalji,_kmlJeIspravan};')(...Object.values(env));
  return { api, log, store };
}
(async () => {
  // primanje: lokalni upis PRIJE brisanja sa servera
  let t = mk({ rows: [{ id: 'r1', from_id: 'k1', vrsta: 'trag', naziv: 'Trag 1', sadrzaj: KML, created_at: new Date().toISOString() }] });
  await t.api._primljeniSync(true);
  assert.deepStrictEqual(t.log.order, ['save:primljeno:r1', 'server-delete:r1']);
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
  assert(t.log.toasts.some(m => /migraciju/.test(m)), 'objašnjenje kad migracija nije pokrenuta');
  // prevelik
  t = mk({}); await t.api.podaciPosalji('kml', 'Veliki', 'x'.repeat(3000000)); assert.strictEqual(t.log.rpc, null);
  // _msrToKml
  const m = src.slice(src.indexOf('function _msrToKml'), src.indexOf('function _msrPosalji'));
  const toKml = new Function('_hexToKmlColor', '_escXml', m + ';return _msrToKml;')(() => 'ff0000ff', x => x);
  const k1 = toKml({ name: 'P', mode: 'area', pts: [{ lat: 1, lng: 2 }, { lat: 1, lng: 3 }, { lat: 2, lng: 3 }] });
  assert(/<Polygon>/.test(k1) && /2,1,0 3,1,0 3,2,0 2,1,0/.test(k1), 'poligon je zatvoren');
  assert(/<LineString>/.test(toKml({ name: 'L', mode: 'dist', pts: [{ lat: 1, lng: 2 }, { lat: 1, lng: 3 }] })));
  // migracija: nema insert politike, provjera šumarije na serveru
  const sql = require('fs').readFileSync(__dirname + '/../../supabase/migrations/20261106_primljeni_podaci.sql', 'utf8');
  assert(/distinct from v_ja_sum/.test(sql) && !/for insert/i.test(sql) && /to_id = auth\.uid\(\)/.test(sql) && /zzz_odobren/.test(sql));
  console.log('primljeni-podaci: ok');
})().catch(e => { console.error(e); process.exit(1); });
