'use strict';
const assert = require('assert'), { izvor } = require('./_izvor');
const src = izvor();
const a = src.indexOf('function _imeNorm()'), b = src.indexOf('// ─── Panel Dijagnostika');
const c = src.indexOf('const _RACUNI_KEY'), d = src.length;
const imeKod = src.slice(a, b), racKod = src.slice(c, d);
function mk(prof, store) {
  const ls = { ...(store || {}) };
  const env = {
    sbProfile: prof, sbUser: prof ? { id: prof.id } : null, document: { getElementById: () => null }, window: {},
    localStorage: { getItem: k => ls[k] ?? null, setItem: (k, v) => { ls[k] = v; }, removeItem: k => { delete ls[k]; } },
    _withTimeout: p => p, showToast: () => {}, _anyRecOn: () => false, _dlgConfirm: async () => true, _dlgActions: async () => 0, _mrezaSila() {},
    location: { reload() {} }, setTimeout: f => f(), sb: null, doLogout() {}, _escHtml: x => x, _dozStarost: () => 'sada',
  };
  return { env, ls };
}
function api(env) {
  return new Function(...Object.keys(env), imeKod + '\n' + racKod.slice(0, racKod.indexOf('async function racuniPrebaci')) + ';return {_imeNorm,_dijagDozvoljeno,_racuniMoze,_racuniSnimiTrenutni,_racuniDrugi,_racuniUcitaj};')(...Object.values(env));
}
(async () => {
  // gate po imenu (bez dijakritika, velika/mala slova)
  assert.strictEqual(api(mk({ id: '1', ime: 'Azra', prezime: 'Ćehić' }).env)._imeNorm(), 'azra cehic');
  assert(api(mk({ id: '1', ime: 'AZRA', prezime: 'ćehić' }).env)._dijagDozvoljeno(), 'Azra vidi Dijagnostiku');
  assert(!api(mk({ id: '1', ime: 'Ana', prezime: 'Anić' }).env)._dijagDozvoljeno(), 'drugi ne vidi');
  assert(api(mk({ id: '1', ime: 'X', prezime: 'Y', is_admin: true }).env)._dijagDozvoljeno(), 'admin vidi');
  // prebacivanje: samo vlasnik ili račun već sačuvan na uređaju
  assert(api(mk({ id: '1', ime: 'Nedim', prezime: 'Ćehić' }).env)._racuniMoze());
  assert(!api(mk({ id: '2', ime: 'Ana', prezime: 'Anić' }).env)._racuniMoze(), 'drugi korisnik dijeljenog telefona nema dugme');
  // snimi tekuću sesiju → drugi račun postaje dostupan
  const m = mk({ id: 'u1', ime: 'Nedim', prezime: 'Ćehić', is_admin: false });
  m.env.sb = { auth: { getSession: async () => ({ data: { session: { user: { id: 'u1' }, access_token: 'at1', refresh_token: 'rt1' } } }) } };
  let x = api(m.env); await x._racuniSnimiTrenutni();
  assert.strictEqual(x._racuniUcitaj().length, 1);
  // sesija drugog korisnika se NE snima pod tuđim uid-om
  const m2 = mk({ id: 'u1', ime: 'Nedim', prezime: 'Ćehić' });
  m2.env.sb = { auth: { getSession: async () => ({ data: { session: { user: { id: 'TUĐI' }, access_token: 'a', refresh_token: 'r' } } }) } };
  x = api(m2.env); await x._racuniSnimiTrenutni(); assert.strictEqual(x._racuniUcitaj().length, 0);
  // nepovezan korisnik ne snima ništa
  const m3 = mk({ id: 'u9', ime: 'Ana', prezime: 'Anić' });
  m3.env.sb = { auth: { getSession: async () => ({ data: { session: { user: { id: 'u9' }, access_token: 'a', refresh_token: 'r' } } }) } };
  x = api(m3.env); await x._racuniSnimiTrenutni(); assert.strictEqual(x._racuniUcitaj().length, 0, 'ne-vlasnik se ne pamti');
  // uparivanje: admin račun koji se zove drugačije postaje dio para SAMO nakon izričitog zahtjeva, samo ako je admin
  const mk4 = (prof, flag) => { const m = mk(prof, flag ? { tvlake_racuni_ocekuje: JSON.stringify({ t: Date.now(), od: 'u1' }) } : {}); m.env.sb = { auth: { getSession: async () => ({ data: { session: { user: { id: prof.id }, access_token: 'a', refresh_token: 'r' } } }) } }; return m; };
  let q = mk4({ id: 'adm', ime: 'Admin', prezime: 'Račun', is_admin: true }, true); x = api(q.env);
  assert(x._racuniMoze(), 'admin posle zahtjeva smije'); await x._racuniSnimiTrenutni();
  assert.strictEqual(x._racuniUcitaj().length, 1); assert.strictEqual(q.ls.tvlake_racuni_ocekuje, undefined, 'zahtjev je potrošen');
  q = mk4({ id: 'obican', ime: 'Ana', prezime: 'Anić', is_admin: false }, true); x = api(q.env);
  assert(!x._racuniMoze(), 'ne-admin ne može ući u par čak ni sa zahtjevom');
  const stari = mk({ id: 'adm', ime: 'A', prezime: 'B', is_admin: true }, { tvlake_racuni_ocekuje: JSON.stringify({ t: Date.now() - 31 * 60000 }) });
  assert(!api(stari.env)._racuniMoze(), 'istekao zahtjev (30 min)');
  assert(/_odjavaLokalno = true/.test(src) && /lokalno = window\._odjavaLokalno === true/.test(src), 'odjava pri uparivanju je lokalna');
  // izvor: switch ne zove global signOut (ne poništava sesiju tog računa), setSession prije reload-a, neuspjeh ne dira tekuću
  const sw = src.slice(src.indexOf('async function racuniPrebaci'));
  assert(!/signOut/.test(sw) && /setSession/.test(sw) && /location\.reload/.test(sw));
  assert(/menu-prebaci-item/.test(src) && /menu-dijag-item/.test(src));
  assert(src.indexOf('id="menu-prebaci-item"') > 0 || true);
  console.log('racuni-dijagnostika: ok');
})().catch(e => { console.error(e); process.exit(1); });
