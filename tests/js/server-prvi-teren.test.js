'use strict';
// v4.0.8: pregled slanja/primanja i prve upotrebe na terenu bez signala.
const assert = require('node:assert/strict');
const src = require('./_izvor').izvor();
function fn(name) {
  let i = src.indexOf('async function ' + name + '(');
  if (i < 0) i = src.indexOf('function ' + name + '(');
  assert(i >= 0, name);
  let d = 0, j = src.indexOf('{', src.indexOf(')', i));
  for (let k = j; k < src.length; k++) { if (src[k] === '{') d++; else if (src[k] === '}') { d--; if (!d) return src.slice(i, k + 1); } }
}
(async () => {
  // 1. "Pošalji dalje" šalje i kad je podatak već na karti
  {
    let poslano = null;
    const f = new Function('_primljeniUcitaj', '_kmlcGet', 'podaciPosalji', 'showToast', 'kmlLs', 'return ' + fn('_primljeniDalje'))(
      () => [{ id: 'a', vrsta: 'kml', naziv: 'N', lokalno: 'N.kml' }], async () => '<kml></kml>', (v, n, s) => { poslano = [v, n, s]; }, () => {}, [{ name: 'N.kml', _origName: 'N.kml' }]);
    await f('a');
    assert.deepEqual(poslano, ['kml', 'N', '<kml></kml>'], 'Pošalji dalje mora poslati');
  }
  // 2. Članovi projekata: jedan upit, greška → false
  {
    const mk = (err) => { let n = 0; const sb = { from: () => ({ select: () => ({ in: async (_, ids) => { n++; return err ? { error: { message: 'x' } } : { data: [{ projekt_id: ids[0], korisnik_id: 'k', added_by: 'o' }] }; } }) }) };
      return { f: new Function('sb', 'return ' + fn('_projClanoviUcitaj'))(sb), n: () => n }; };
    let m = mk(false); const l = [{ id: 'p1' }, { id: 'p2' }];
    assert.equal(await m.f(l), true); assert.equal(m.n(), 1, 'jedan upit za sve projekte');
    assert.deepEqual(l[0].clanovi, [{ korisnik_id: 'k', added_by: 'o' }]); assert.deepEqual(l[1].clanovi, []);
    m = mk(true); const l2 = [{ id: 'p1', clanovi: [{ korisnik_id: 'stari' }] }];
    assert.equal(await m.f(l2), false); assert.deepEqual(l2[0].clanovi, [{ korisnik_id: 'stari' }], 'greška ne briše članove');
  }
  // 3. sbLoadProjekti: greška upita članstva ne prepisuje keš projekata kolega ni aktivni projekat
  {
    const p = fn('sbLoadProjekti');
    assert(/error: e2[\s\S]{0,120}if \(e2\) throw e2/.test(p) && /if \(e3\) throw e3/.test(p), 'greške upita vode na keš');
    assert(/if \(pouzdano && _aktivniProjektId/.test(p), 'aktivni projekat se ne briše bez pouzdanih podataka');
    const kes = [{ id: 'moj', korisnik_id: 'u' }, { id: 'tudji', korisnik_id: 'x', clanovi: [{ korisnik_id: 'u' }] }];
    let spremljeno = null; const S = { _projekti: [], _aktivniProjektId: 'tudji', _projLoadGen: 0, uklonjen: false };
    const upit = (rez) => { const o = { select: () => o, eq: () => o, order: () => o, in: () => o, neq: () => o, then: (r) => r(rez) }; return o; };
    const sb = { from: (t) => t === 'projekti' ? upit({ data: [{ id: 'moj', korisnik_id: 'u' }] }) : upit({ error: { message: 'Failed to fetch' } }) };
    const f = new Function('S', 'sb', 'sbUser', 'isSpdField', 'isAdmin', '_deletedProjektIds', '_OL', '_projClanoviUcitaj', '_projektiVratiNeposlane', 'localStorage', '_applyProjektFields', 'rndProjektiList', 'rndLog', 'updProjStats', 'sbSaveOdjel', '_updVlakeMapVisibility', '_kvcPurgeStale',
      'with(S){ return ' + p + ' }')(S, sb, { id: 'u' }, () => false, () => false, new Set(), { PROJEKTI: 'P', load: () => kes, save: (k, v) => { spremljeno = v; } }, async () => true, x => x, { removeItem: () => { S.uklonjen = true; } }, () => {}, () => {}, () => {}, () => {}, () => {}, () => {}, () => {});
    await f();
    assert.deepEqual(spremljeno.map(x => x.id), ['moj', 'tudji'], 'projekat kolege ostaje u kešu');
    assert.equal(S._aktivniProjektId, 'tudji'); assert.equal(S.uklonjen, false);
  }
  // 4. Prijava: bez getUser() poslije prijave, mrežni pad prijave → keš, bez profila se ne ulazi
  {
    const d = fn('doLogin');
    assert(!/sb\.auth\.getUser\(\)/.test(d), 'doLogin ne zove getUser');
    assert(/_isNetworkErr\(error\) && await prijavaIzKesa\(\)/.test(d), 'mrežni pad prijave ide na keš');
    assert(/if \(!sbProfile\) \{ showAuthErr\([^)]*profil nije učitan/.test(d), 'bez profila nema ulaza');
    assert(!/sb\.auth\.getUser\(\)/.test(fn('_sesijaPinom')) && !/sb\.auth\.getUser\(\)/.test(fn('initAuth')), 'ni tiha prijava ne zove getUser');
  }
  // 5. Kolege: RPC tek uz pravu sesiju
  {
    let pin = 0, toast = '';
    const f = new Function('S', '_mrezaSila', '_sesijaPinom', 'showToast', 'with(S){ return ' + fn('_kontaktiSesija') + ' }');
    assert.equal(await f({ sbUser: { id: 'u', _cachedStub: true } }, () => {}, async () => { pin++; return false; }, t => { toast = t; })(), false);
    assert.equal(pin, 1); assert(/signal/.test(toast));
    assert.equal(await f({ sbUser: { id: 'u' } }, () => {}, async () => { pin++; return true; }, () => {})(), true); assert.equal(pin, 1);
    for (const n of ['_kontaktiPozovi', '_kontaktiPrihvati', '_kontaktiUkloniDlg']) assert(/_kontaktiSesija\(\)/.test(fn(n)), n);
  }
  console.log('OK server / prvi teren');
})().catch(e => { console.error(e); process.exit(1); });
