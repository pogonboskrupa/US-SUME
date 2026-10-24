// Offline prijava poslije ODJAVE: provjera ime+PIN ne smije zavisiti od `tvlake_saved_user` koji odjava briše.
const assert = require('node:assert/strict'), fs = require('fs'), path = require('path'), vm = require('vm');
const src = require('./_izvor').izvor();
function blok(od, do_) { const a = src.indexOf(od); assert.ok(a > 0, od); const b = src.indexOf(do_, a); assert.ok(b > a, do_); return src.slice(a, b); }
const kod = blok("const _OFFCRED_KEY", "(function _offCredMigracija") + blok("async function _offCredProvjeri", "\n}\n") + "\n}\n";
const ls = {}; const localStorage = { getItem: k => k in ls ? ls[k] : null, setItem: (k, v) => { ls[k] = String(v); }, removeItem: k => { delete ls[k]; } };
const ctx = { localStorage, crypto: globalThis.crypto, TextEncoder, Uint8Array, Array, JSON, String, btoa, unescape, encodeURIComponent };
vm.createContext(ctx); vm.runInContext(kod, ctx);
(async () => {
  await ctx._offCredSpremi('Nedim', 'Ćehić', '1234', 'u1');
  assert.equal(await ctx._offCredProvjeri('nedim', ' Ćehić ', '1234'), 'u1', 'velika/mala slova i razmaci ne smiju smetati');
  assert.equal(await ctx._offCredProvjeri('Nedim', 'Ćehić', '9999'), null, 'pogrešan PIN');
  assert.equal(await ctx._offCredProvjeri('Neko', 'Drugi', '1234'), null, 'nepoznat korisnik');
  assert.ok(!JSON.stringify(ls).includes('1234'), 'PIN se ne smije čuvati otvoreno');
  // odjava: _clearSavedUser briše SAMO tvlake_saved_user
  ls.tvlake_saved_user = '{"ime":"Nedim","pin":"1234"}'; delete ls.tvlake_saved_user;
  assert.equal(await ctx._offCredProvjeri('Nedim', 'Ćehić', '1234'), 'u1', 'odjava ne briše provjeru');
  ls['tvlake_offline_cred_v1'] = '{{kvar'; assert.equal(await ctx._offCredProvjeri('Nedim', 'Ćehić', '1234'), null, 'korumpiran zapis ne baca');
  assert.equal(await ctx._offCredSpremi('', '', '', ''), false);
  // doLogin: odjava ne smije brisati trajni zapis; prijava ga piše; offline grana ga koristi
  const logout = blok("async function doLogout()", "// Trajno briše privatne");
  assert.ok(!logout.includes('_OFFCRED_KEY') && !logout.includes('_offCred'), 'doLogout ne dira offline provjeru');
  const login = blok("async function doLogin()", "// --- Register ---");
  assert.ok(login.includes('_offCredProvjeri') && login.includes('_offCredSpremi'), 'doLogin koristi provjeru');
  assert.equal((login.match(/await prijavaIzKesa\(\)/g) || []).length, 3, 'sva tri poziva čekaju async provjeru');
  console.log('offline-prijava-poslije-odjave: OK');
})().catch(e => { console.error(e); process.exit(1); });
