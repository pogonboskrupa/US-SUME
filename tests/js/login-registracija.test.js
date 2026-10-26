// Login (v2.9.7): prvo se bira ULOGA (Terenski radnik / Projektant), a
// šumarija samo padajućom listom i samo za projektanta. U v2.9.6 su šumarije
// bile kartice pored terenskog profila pa bi terenac dodirnuo "svoju" šumariju.
// Skriveni #reg-sumarija ostaje jedini izvor vrijednosti za doRegister().
'use strict';
const assert = require('node:assert');
const fs = require('node:fs'), path = require('node:path');
const HTML = require('./_izvor').izvor();
function extractFn(n) {
  const s = HTML.indexOf('function ' + n + '('); if (s < 0) throw new Error('nema ' + n);
  let d = 0; for (let i = HTML.indexOf('{', s); i < HTML.length; i++) { if (HTML[i] === '{') d++; else if (HTML[i] === '}' && !--d) return HTML.slice(s, i + 1); }
}
let ok = 0, fail = 0;
const t = (n, f) => { try { f(); ok++; } catch (e) { fail++; console.log('PAO:', n, e.message); } };
const reg = HTML.slice(HTML.indexOf('<div id="auth-reg-form"'), HTML.indexOf('<div id="auth-pending-form"'));

function env() {
  const mk = u => { const o = { dataset: { uloga: u }, cls: new Set(), attr: {} };
    o.classList = { toggle: (c, on) => on ? o.cls.add(c) : o.cls.delete(c) };
    o.setAttribute = (k, x) => { o.attr[k] = x; }; return o; };
  const bs = [mk('teren'), mk('proj')];
  const els = { 'reg-sumarija': { value: '' }, 'reg-sum-izbor': { value: '' }, 'reg-sum-wrap': { hidden: true } };
  const doc = { getElementById: id => els[id] || null, querySelectorAll: () => bs };
  const f = new Function('document', extractFn('_regProfil') + extractFn('_regUloga') + '; return _regUloga;')(doc);
  return { f, bs, els };
}
t('terenski: fiksno ŠPD US ŠUME, lista skrivena i očišćena', () => {
  const e = env();
  e.els['reg-sum-izbor'].value = 'ŠUMARIJA CAZIN';
  e.f('teren');
  assert.strictEqual(e.els['reg-sumarija'].value, 'ŠPD US ŠUME');
  assert.strictEqual(e.els['reg-sum-izbor'].value, '');
  assert.strictEqual(e.els['reg-sum-wrap'].hidden, true);
  assert.deepStrictEqual(e.bs.map(b => b.attr['aria-checked']), ['true', 'false']);
});
t('projektant: lista vidljiva, vrijednost iz liste (prazno dok ne izabere)', () => {
  const e = env();
  e.f('teren'); e.f('proj');
  assert.strictEqual(e.els['reg-sum-wrap'].hidden, false);
  assert.strictEqual(e.els['reg-sumarija'].value, '', 'terenski izbor ne smije ostati kod projektanta');
  e.els['reg-sum-izbor'].value = 'ŠUMARIJA KLJUČ'; e.f('proj');
  assert.strictEqual(e.els['reg-sumarija'].value, 'ŠUMARIJA KLJUČ');
  assert.ok(e.bs[1].cls.has('on') && !e.bs[0].cls.has('on'));
});
t('samo dvije kartice uloge; šumarije su opcije padajuće liste', () => {
  assert.strictEqual((reg.match(/class="reg-prof /g) || []).length, 2);
  assert.ok(!/reg-prof-sum/.test(HTML));
  const lista = reg.slice(reg.indexOf('id="reg-sum-izbor"'), reg.indexOf('</select>', reg.indexOf('id="reg-sum-izbor"')));
  const v = [...lista.matchAll(/<option value="([^"]+)"/g)].map(m => m[1]);
  assert.strictEqual(v.length, 6);
  assert.ok(!v.includes('ŠPD US ŠUME'), 'terenski profil ne smije biti u listi šumarija');
  const skriven = reg.slice(reg.indexOf('id="reg-sumarija"'), reg.indexOf('</select>', reg.indexOf('id="reg-sumarija"')));
  const sv = [...skriven.matchAll(/<option(?: value="([^"]*)")?>([^<]*)<\/option>/g)].map(m => m[1] ?? m[2]);
  for (const x of v) assert.ok(sv.includes(x), 'skriveni select nema ' + x);
  assert.ok(/id="reg-sum-wrap"[^>]*hidden/.test(reg), 'lista mora biti skrivena dok uloga nije projektant');
});
t('terenski je narandžast, doRegister imenuje šta nedostaje', () => {
  assert.ok(/\.reg-prof-teren\s*\{[^}]*249,115,22/.test(HTML));
  const dr = extractFn('doRegister');
  assert.ok(/Odaberite ulogu/.test(dr) && /Odaberite šumariju/.test(dr));
});
t('registracija je istaknuto dugme, a ne blijedo sekundarno', () => {
  const login = HTML.slice(HTML.indexOf('<div id="auth-login-form"'), HTML.indexOf('<div id="auth-reg-form"'));
  assert.ok(/class="auth-btn-reg"[^>]*onclick="authShowReg\(\)"/.test(login));
  const h = +(HTML.match(/\.auth-btn-reg \{[^}]*min-height:(\d+)px/) || [])[1];
  assert.ok(h >= 48, 'premala dodirna meta: ' + h);
});
console.log(`login-registracija: ${ok} ok, ${fail} palo`);
process.exit(fail ? 1 : 0);
