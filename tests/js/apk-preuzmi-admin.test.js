// Meni → "Preuzmi APK fajl" (od v3.6.9): bez dijaloga i bez stranice sa
// verzijama — u APK-u isti tok kao "Ažuriraj aplikaciju", inače preglednik
// odmah preuzima APK sa stalnog linka.
const assert = require('assert');
const src = require('./_izvor').izvor();
function fn(name) {
  let i = src.indexOf('async function ' + name + '(');
  if (i < 0) i = src.indexOf('function ' + name + '(');
  assert.ok(i >= 0, name + ' postoji');
  let d = 0;
  for (let k = src.indexOf('{', i); k < src.length; k++) {
    if (src[k] === '{') d++;
    else if (src[k] === '}' && --d === 0) return src.slice(i, k + 1);
  }
}
const konst = n => { const m = src.match(new RegExp('const ' + n + ' = [^\\n]+')); assert.ok(m, n); return m[0]; };
let ok = 0;
const t = (ime, f) => { f(); ok++; };

function okolina({ most = true, apk = true } = {}) {
  const st = { toast: [], href: null, otvoreno: [], azuriraj: 0, dlg: 0 };
  const loc = { hostname: apk ? 'appassets.androidplatform.net' : 'pogonboskrupa.github.io', set href(v) { st.href = v; } };
  const win = { location: loc };
  if (most) win.AndroidUpdate = { checkAndInstall() {} };
  const doc = { body: { appendChild() {} }, createElement: () => ({ click() { st.otvoreno.push(this.href); }, remove() {} }) };
  const f = new Function('showToast', 'location', 'window', 'document', 'azurirajAplikaciju', '_dlg', '_dlgActions',
    konst('_APK_STALNI') + ';' + fn('_apkOtvoriUrl') + ';' + fn('preuzmiApkAdmin') + '; return preuzmiApkAdmin;')(
    m => st.toast.push(m), loc, win, doc, () => { st.azuriraj++; }, () => { st.dlg++; }, () => { st.dlg++; });
  return { f, st };
}
const STALNI = 'https://github.com/pogonboskrupa/US-SUME/releases/latest/download/app-debug.apk';

t('APK sa mostom: i dalje skida fajl sa stalnog linka, ne poziva Ažuriraj (koji kod ažurne verzije ne skida ništa)', () => {
  const { f, st } = okolina();
  f();
  assert.strictEqual(st.azuriraj, 0); assert.strictEqual(st.dlg, 0); assert.strictEqual(st.href, STALNI);
});
t('APK bez mosta: preglednik odmah preuzima sa stalnog linka', () => {
  const { f, st } = okolina({ most: false });
  f();
  assert.strictEqual(st.href, STALNI); assert.strictEqual(st.dlg, 0);
});
t('webapp: preuzimanje u novom tabu, bez stranice sa verzijama', () => {
  const { f, st } = okolina({ most: false, apk: false });
  f();
  assert.deepStrictEqual(st.otvoreno, [STALNI]); assert.strictEqual(st.dlg, 0);
});
t('nema više stranice sa verzijama ni GitHub API poziva u ovom toku', () => {
  const b = fn('preuzmiApkAdmin');
  assert.ok(!/releases'|_fetchT|_dlg/.test(b));
});
t('meni stavka je vidljiva svima', () => {
  assert.ok(!/id="menu-apk-download" hidden/.test(src));
  assert.ok(/apkItem\.hidden = false/.test(fn('_primijeniUlogeUI')));
});
t('greška ažuriranja nudi preuzimanje u pregledniku', () => {
  assert.ok(/Preuzmi u pregledniku', '_apkOtvoriUrl\(_APK_STALNI\)'/.test(fn('_azurirajNapredak')));
});
console.log('apk-preuzmi-admin: ' + ok + ' OK');
