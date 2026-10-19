// Prijava: Android autofill ne smije prekidati kucanje; Enter vodi kroz polja; PIN se može prikazati.
const fs = require('fs'), path = require('path');
const src = fs.readFileSync(path.join(__dirname, '../../index.html'), 'utf8');
let pass = 0, fail = 0;
const t = (n, f) => { try { f(); console.log('  ✔ ' + n); pass++; } catch (e) { console.log('  ✘ ' + n + '\n      ' + e.message); fail++; } };
const ok = (c, m) => { if (!c) throw new Error(m); };
const tag = id => { const m = src.match(new RegExp('<input id="' + id + '"[^>]*>')); ok(m, id + ' ne postoji'); return m[0]; };
const fn = n => { const a = src.indexOf('function ' + n + '('); ok(a > 0, n); let d = 0, i = src.indexOf('{', a); for (; i < src.length; i++) { d += src[i] === '{'; d -= src[i] === '}'; if (!d) break; } return src.slice(a, i + 1); };
console.log('Prijava — unos:');
t('PIN koristi new-password (autocomplete=off Chrome autofill ignoriše)', () => ok(/autocomplete="new-password"/.test(tag('auth-pin')), 'pin'));
t('ime/prezime/PIN imaju nekredencijalna imena i isključen autofill upravitelja lozinki', () => ['auth-ime', 'auth-prezime', 'auth-pin'].forEach(id => { const x = tag(id); ok(/name="dm-/.test(x) && /data-lpignore/.test(x), id); }));
t('PIN polja registracije također ne nude spremljene lozinke', () => ok((src.match(/placeholder="(Odaberite|Ponovite) PIN"[^>]*autocomplete="new-password"/g) || []).length === 2, 'reg'));
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
  const pin = { type: 'password', focus() {} }, btn = { textContent: 'PRIKAŽI', setAttribute() {} };
  const f = new Function('document', fn('_authPinPrikazi') + '; return _authPinPrikazi;')({ getElementById: id => id === 'auth-pin' ? pin : btn });
  f(); ok(pin.type === 'text' && btn.textContent === 'SAKRIJ', 'prikazi');
  f(); ok(pin.type === 'password' && btn.textContent === 'PRIKAŽI', 'sakrij');
});
t('dugme za prikaz PIN-a je dodirna meta ≥ 44 px', () => ok(/\.auth-eye \{[^}]*height:44px/.test(src), 'visina'));
t('Java: WebView isključuje Android autofill', () => ok(/setImportantForAutofill\(View\.IMPORTANT_FOR_AUTOFILL_NO_EXCLUDE_DESCENDANTS\)/.test(fs.readFileSync(path.join(__dirname, '../../android/app/src/main/java/ba/spd/uss/vlake/MainActivity.java'), 'utf8')), 'java'));
console.log('\n' + pass + ' prošlo, ' + fail + ' palo'); process.exit(fail ? 1 : 0);
