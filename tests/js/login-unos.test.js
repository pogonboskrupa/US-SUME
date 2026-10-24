// Prijava: Android autofill ne smije prekidati kucanje; Enter vodi kroz polja; PIN se može prikazati.
const fs = require('fs'), path = require('path');
const src = require('./_izvor').izvor();
let pass = 0, fail = 0;
const t = (n, f) => { try { f(); console.log('  ✔ ' + n); pass++; } catch (e) { console.log('  ✘ ' + n + '\n      ' + e.message); fail++; } };
const ok = (c, m) => { if (!c) throw new Error(m); };
const tag = id => { const m = src.match(new RegExp('<input id="' + id + '"[^>]*>')); ok(m, id + ' ne postoji'); return m[0]; };
const fn = n => { const a = src.indexOf('function ' + n + '('); ok(a > 0, n); let d = 0, i = src.indexOf('{', a); for (; i < src.length; i++) { d += src[i] === '{'; d -= src[i] === '}'; if (!d) break; } return src.slice(a, i + 1); };
console.log('Prijava — unos:');
t('PIN je text maskiran CSS-om (type=password okida "Predloži lozinku")', () => { const x = tag('auth-pin'); ok(/type="text"/.test(x) && /pin-maska/.test(x) && !/new-password/.test(x), 'pin'); ok(/\.pin-maska \{[^}]*-webkit-text-security: disc/.test(src), 'css'); });
t('ime/prezime/PIN imaju nekredencijalna imena i isključen autofill upravitelja lozinki', () => ['auth-ime', 'auth-prezime', 'auth-pin'].forEach(id => { const x = tag(id); ok(/name="dm-/.test(x) && /data-lpignore/.test(x), id); }));
t('PIN polja registracije također ne nude spremljene lozinke', () => ok((src.match(/<input id="reg-pin2?" type="text"[^>]*pin-maska/g) || []).length === 2, 'reg'));
t('Enter ide ime → prezime → PIN → prijava', () => {
  ok(/_authEnter\(event,'auth-prezime'\)/.test(tag('auth-ime')) && /_authEnter\(event,'auth-pin'\)/.test(tag('auth-prezime')), 'lanac');
  ok(/Enter'\)doLogin\(\)/.test(tag('auth-pin')), 'doLogin');
});
t('_authEnter fokusira sljedeće polje i guta Enter', () => {
  const f = new Function('document', fn('_authEnter') + '; return _authEnter;');
  let focus = 0, prevented = 0;
  const e = { key: 'Enter', preventDefault() { prevented++; } };
  f({ getElementById: () => ({ focus() { focus++; } }) })(e, 'x');
  ok(focus === 1 && prevented === 1, 'enter');
  f({ getElementById: () => ({ focus() { focus++; } }) })({ key: 'a', preventDefault() { prevented++; } }, 'x');
  ok(focus === 1 && prevented === 1, 'druga tipka');
});
t('_authPinPrikazi prebacuje password/text i natpis', () => {
  const set = new Set(['pin-maska']); const pin = { classList: { contains: c => set.has(c), toggle: (c, on) => on ? set.add(c) : set.delete(c) }, focus() {} }, btn = { textContent: 'PRIKAŽI', setAttribute() {} };
  const f = new Function('document', fn('_authPinPrikazi') + '; return _authPinPrikazi;')({ getElementById: id => id === 'auth-pin' ? pin : btn });
  f(); ok(!set.has('pin-maska') && btn.textContent === 'SAKRIJ', 'prikazi');
  f(); ok(set.has('pin-maska') && btn.textContent === 'PRIKAŽI', 'sakrij');
});
t('dugme za prikaz PIN-a je dodirna meta ≥ 44 px', () => ok(/\.auth-eye \{[^}]*height:44px/.test(src), 'visina'));
t('Java: WebView isključuje Android autofill', () => ok(/setImportantForAutofill\(View\.IMPORTANT_FOR_AUTOFILL_NO_EXCLUDE_DESCENDANTS\)/.test(fs.readFileSync(path.join(__dirname, '../../android/app/src/main/java/ba/spd/uss/vlake/MainActivity.java'), 'utf8')), 'java'));
console.log('\n' + pass + ' prošlo, ' + fail + ' palo'); process.exit(fail ? 1 : 0);
