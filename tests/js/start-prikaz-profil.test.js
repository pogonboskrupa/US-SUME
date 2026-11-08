'use strict';
// Pokretanje: "nasumičan" prikaz karte, zamrzavanje pri odzumiranom velikom sloju, "Nije prijavljen" ~30 s.
const assert = require('assert'), { izvor } = require('./_izvor'); const src = izvor();
const fn = n => { let a = src.indexOf('async function ' + n + '('); if (a < 0) a = src.indexOf('function ' + n + '('); let d = 0, i = src.indexOf('{', a); for (; i < src.length; i++) { if (src[i] === '{') d++; else if (src[i] === '}' && !--d) break; } return src.slice(a, i + 1); };
(async () => {
  // 1) fitBounds na skrivenoj karti čeka vidljivost; na vidljivoj ide odmah
  const blok = src.slice(src.indexOf('(function () {\n  const fitOrig = map.fitBounds.bind(map);'), src.indexOf('})();', src.indexOf('const fitOrig')) + 5);
  let size = { x: 0, y: 0 }; const fits = [];
  const map = { getSize: () => size, invalidateSize() {}, fitBounds(b) { fits.push(b); return this; } };
  new Function('map', 'setTimeout', blok)(map, (f, ms) => setTimeout(f, 1));
  map.fitBounds('B1'); assert.deepStrictEqual(fits, [], 'skrivena karta: bez fitovanja odmah');
  size = { x: 390, y: 700 }; await new Promise(r => setTimeout(r, 30));
  assert.deepStrictEqual(fits, ['B1'], 'fituje se kad karta postane vidljiva');
  map.fitBounds('B2'); assert.deepStrictEqual(fits, ['B1', 'B2']);
  // 2) zadnji prikaz: ne pamti skrivenu kartu, ne prihvata besmislen zum pri startu
  assert(/if \(sz\.x < 50 \|\| sz\.y < 50\) return;/.test(src) && /_lp\.z>=6 && _lp\.z<=22/.test(src));
  // 3) daleko odzumiran veliki sloj: samo "svuda" slojevi, nikad svi
  assert(/> 6000\) cand = new Set\(svuda\);/.test(src) && !/cand = new Set\(Object\.values\(this\._layers\)/.test(src));
  // 4) profil sa rokom: istek → keš ovog korisnika; bez keša se čeka server
  const rok = fn('_sbLoadProfileRok');
  const mk = (cache, sporo) => { const st = { sbProfile: null, sbUser: { id: 'u' }, ui: 0 };
    const f = new Function('st', '_withTimeout', '_profileLoad', '_primijeniUlogeUI', 'sbLoadProfile', 'return (' + rok.replace('async function _sbLoadProfileRok', 'async function').replace(/sbProfile = c/g, 'st.sbProfile = c').replace(/sbUser\?\.id/g, 'st.sbUser.id') + ')')(st,
      (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('t')), 5))]), () => cache, () => st.ui++,
      () => new Promise(r => setTimeout(() => { st.sbProfile = { id: 'u', svjez: 1 }; r(); }, sporo)));
    return { f, st }; };
  let t = mk({ id: 'u', kes: 1 }, 60); await t.f(); assert.strictEqual(t.st.sbProfile.kes, 1, 'istek → keš'); assert.strictEqual(t.st.ui, 1);
  t = mk(null, 30); await t.f(); assert.strictEqual(t.st.sbProfile.svjez, 1, 'bez keša čeka server');
  assert(/await _sbLoadProfileRok\(\);\s*showApp\(\);/.test(fn('doLogin')), 'doLogin koristi rok');
  // 5) meni: dok profil ne stigne "Učitavam profil…", ime se iscrta odmah pri ulazu
  assert(/'Učitavam profil…'/.test(fn('_menuIdentityRender')) && /_revealApp\(\);\n  \/\/ Meni odmah nosi ime[^\n]*\n  try \{ if \(typeof _menuIdentityRender/.test(src));
  console.log('start-prikaz-profil: ok');
})().catch(e => { console.error(e); process.exit(1); });
