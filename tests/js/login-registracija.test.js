// Login (v2.9.6): uočljivo dugme registracije i izbor profila karticama.
// Terenski profil mora biti vizuelno odvojen od šumarija, a skriveni
// #reg-sumarija ostaje jedini izvor vrijednosti za doRegister().
'use strict';
const assert = require('node:assert');
const fs = require('node:fs'), path = require('node:path');
const HTML = fs.readFileSync(path.join(__dirname, '../../index.html'), 'utf8');
function extractFn(n) {
  const s = HTML.indexOf('function ' + n + '('); if (s < 0) throw new Error('nema ' + n);
  let d = 0; for (let i = HTML.indexOf('{', s); i < HTML.length; i++) { if (HTML[i] === '{') d++; else if (HTML[i] === '}' && !--d) return HTML.slice(s, i + 1); }
}
let ok = 0, fail = 0;
const t = (n, f) => { try { f(); ok++; } catch (e) { fail++; console.log('PAO:', n, e.message); } };
const reg = HTML.slice(HTML.indexOf('<div id="auth-reg-form"'), HTML.indexOf('<div id="auth-pending-form"'));

function btn(v) { const a = {}; return { dataset: { v }, cls: new Set(), classList: { toggle(c, on) { on ? this._o.cls.add(c) : this._o.cls.delete(c); } }, setAttribute(k, x) { a[k] = x; }, attr: a }; }
t('_regProfil puni skriveni select i označava TAČNO jednu karticu', () => {
  const bs = ['ŠPD US ŠUME', 'ŠUMARIJA CAZIN', 'ŠUMARIJA KLJUČ'].map(btn); bs.forEach(b => b.classList._o = b);
  const sel = { value: '' };
  const doc = { getElementById: id => id === 'reg-sumarija' ? sel : null, querySelectorAll: () => bs };
  const f = new Function('document', extractFn('_regProfil') + '; return _regProfil;')(doc);
  f('ŠUMARIJA CAZIN');
  assert.strictEqual(sel.value, 'ŠUMARIJA CAZIN');
  assert.deepStrictEqual(bs.map(b => b.attr['aria-checked']), ['false', 'true', 'false']);
  f('ŠPD US ŠUME');
  assert.strictEqual(sel.value, 'ŠPD US ŠUME');
  assert.ok(bs[0].cls.has('on') && !bs[1].cls.has('on'));
});
t('svaka kartica ima odgovarajuću opciju u skrivenom selectu (doRegister čita njega)', () => {
  const opts = [...reg.matchAll(/<option(?: value="([^"]*)")?>([^<]*)<\/option>/g)].map(m => m[1] ?? m[2]);
  const karte = [...reg.matchAll(/class="reg-prof[^"]*"[^>]*data-v="([^"]+)"/g)].map(m => m[1]);
  assert.ok(karte.length === 7, 'očekivano 7 kartica, ima ' + karte.length);
  for (const v of karte) assert.ok(opts.includes(v), 'nema opcije ' + v);
});
t('terenski profil je zasebna (narandžasta) kartica, odvojena od mreže šumarija', () => {
  assert.ok(/class="reg-prof reg-prof-teren"[^>]*data-v="ŠPD US ŠUME"/.test(reg));
  assert.strictEqual((reg.match(/reg-prof-sum"/g) || []).length, 6);
  assert.ok(/\.reg-prof-teren\s*\{[^}]*249,115,22/.test(HTML), 'terenski nije narandžast');
});
t('registracija je istaknuto dugme, a ne blijedo sekundarno', () => {
  const login = HTML.slice(HTML.indexOf('<div id="auth-login-form"'), HTML.indexOf('<div id="auth-reg-form"'));
  assert.ok(/class="auth-btn-reg"[^>]*onclick="authShowReg\(\)"/.test(login));
  assert.ok(!/auth-btn-secondary[^>]*authShowReg/.test(login));
  const h = +(HTML.match(/\.auth-btn-reg \{[^}]*min-height:(\d+)px/) || [])[1];
  assert.ok(h >= 48, 'premala dodirna meta: ' + h);
});
console.log(`login-registracija: ${ok} ok, ${fail} palo`);
process.exit(fail ? 1 : 0);
