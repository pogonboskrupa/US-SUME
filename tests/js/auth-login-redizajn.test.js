// Login ekran, redizajn v1.5.3 — testovi nad STVARNIM kodom iz index.html.
//
// Zašto ovi testovi postoje: redizajn je popravio ŠEST objektivnih problema,
// ne samo izgled. Tri od njih (lažna verzija, nepotkrijepljen "SISTEM AKTIVAN",
// emoji ikonice u poljima) su bile TVRDNJE koje ekran iznosi korisniku — a
// pogrešna tvrdnja na ekranu za prijavu je gora od ružnog ekrana: korisnik na
// terenu po njoj odlučuje da li je problem u vezi ili u nalogu.

const fs = require('fs');
const path = require('path');
const SRC = fs.readFileSync(path.join(__dirname, '../../index.html'), 'utf8');

let ok = 0, fail = 0;
function t(ime, fn) {
  try { fn(); ok++; }
  catch (e) { fail++; console.log('  PAO:', ime, '\n    ', e.message); }
}
function eq(a, b, msg) {
  if (a !== b) throw new Error((msg || '') + ' očekivano ' + JSON.stringify(b) + ', dobijeno ' + JSON.stringify(a));
}

// Izvlači tijelo funkcije iz index.html — async prvo, pa sinhrona (vidi
// dokumentovanu zamku uz sqlmapRestoreAll/_sqlIdbDeleteDirect u CLAUDE.md).
function extractFn(naziv) {
  let i = SRC.indexOf('async function ' + naziv + '(');
  if (i < 0) i = SRC.indexOf('function ' + naziv + '(');
  if (i < 0) throw new Error('nema funkcije ' + naziv + ' u index.html');
  let dubina = 0, poceo = false;
  for (let j = i; j < SRC.length; j++) {
    const c = SRC[j];
    if (c === '{') { dubina++; poceo = true; }
    else if (c === '}') { dubina--; if (poceo && dubina === 0) return SRC.slice(i, j + 1); }
  }
  throw new Error('neuravnotežene zagrade za ' + naziv);
}

// Minimalan DOM: samo ono što ove funkcije stvarno diraju.
function makeDom() {
  const el = (id) => ({
    id, textContent: '', _cls: new Set(),
    classList: {
      add: (...c) => c.forEach(x => el0[id]._cls.add(x)),
      remove: (...c) => c.forEach(x => el0[id]._cls.delete(x)),
      toggle: (c) => { const s = el0[id]._cls; if (s.has(c)) { s.delete(c); return false; } s.add(c); return true; },
      contains: (c) => el0[id]._cls.has(c)
    }
  });
  const el0 = {};
  ['auth-sbadge', 'auth-sbadge-txt', 'auth-cbx-el', 'auth-divlabel'].forEach(id => { el0[id] = el(id); });
  el0['auth-zapamti'] = { id: 'auth-zapamti', checked: true };
  el0['auth-cbx-el']._cls.add('checked');
  return {
    el0,
    document: { getElementById: (id) => el0[id] || null }
  };
}

function sandbox(nazivi, extra) {
  const d = makeDom();
  const env = Object.assign({ document: d.document, navigator: { onLine: true } }, extra || {});
  const kljucevi = Object.keys(env);
  const tijelo = nazivi.map(extractFn).join('\n') +
    '\nreturn {' + nazivi.map(n => n + ':' + n).join(',') + '};';
  const f = new Function(...kljucevi, tijelo);
  return { mod: f(...kljucevi.map(k => env[k])), el0: d.el0, env };
}

console.log('Login ekran — redizajn v1.5.3');

// ── _authStatusSync: tvrdnja o vezi mora pratiti IZMJERENO stanje ────────────
t('izmjereno "nema" → crvena oznaka i tekst OFFLINE', () => {
  const s = sandbox(['_authStatusSync'], { _netKvalitet: () => 'nema' });
  s.mod._authStatusSync();
  eq(s.el0['auth-sbadge'].classList.contains('st-nema'), true, 'klasa st-nema:');
  eq(s.el0['auth-sbadge-txt'].textContent, 'NEMA VEZE — OFFLINE');
});

t('izmjereno "slaba" → žuta oznaka, NE "sve u redu"', () => {
  const s = sandbox(['_authStatusSync'], { _netKvalitet: () => 'slaba' });
  s.mod._authStatusSync();
  eq(s.el0['auth-sbadge'].classList.contains('st-slaba'), true, 'klasa st-slaba:');
  eq(s.el0['auth-sbadge-txt'].textContent, 'SLABA VEZA');
});

t('izmjereno "dobra" → bez statusne klase', () => {
  const s = sandbox(['_authStatusSync'], { _netKvalitet: () => 'dobra' });
  s.mod._authStatusSync();
  eq(s.el0['auth-sbadge'].classList.contains('st-nema'), false, 'st-nema:');
  eq(s.el0['auth-sbadge'].classList.contains('st-slaba'), false, 'st-slaba:');
  eq(s.el0['auth-sbadge-txt'].textContent, 'VEZA U REDU');
});

t('prelaz slaba → nema ne ostavlja staru klasu', () => {
  let stanje = 'slaba';
  const s = sandbox(['_authStatusSync'], { _netKvalitet: () => stanje });
  s.mod._authStatusSync();
  stanje = 'nema';
  s.mod._authStatusSync();
  eq(s.el0['auth-sbadge'].classList.contains('st-slaba'), false, 'stara st-slaba je ostala:');
  eq(s.el0['auth-sbadge'].classList.contains('st-nema'), true, 'st-nema:');
});

t('bez ijednog uzorka pada na navigator.onLine === false', () => {
  const s = sandbox(['_authStatusSync'], { _netKvalitet: () => 'nepoznato', navigator: { onLine: false } });
  s.mod._authStatusSync();
  eq(s.el0['auth-sbadge-txt'].textContent, 'NEMA VEZE — OFFLINE');
});

t('_netKvalitet koji BACA ne ruši ekran za prijavu', () => {
  const s = sandbox(['_authStatusSync'], { _netKvalitet: () => { throw new Error('x'); } });
  s.mod._authStatusSync();  // ne smije baciti
  eq(s.el0['auth-sbadge-txt'].textContent, 'VEZA U REDU');
});

t('nedostajući elementi ne bacaju', () => {
  const tijelo = extractFn('_authStatusSync') + '\nreturn _authStatusSync;';
  const f = new Function('document', 'navigator', tijelo)({ getElementById: () => null }, { onLine: true });
  f();
});

// ── _authToggleZapamti: jedan klik = jedna promjena, oba stanja usklađena ────
t('toggle mijenja i kvadratić i skriveni checkbox', () => {
  const s = sandbox(['_authToggleZapamti']);
  eq(s.el0['auth-zapamti'].checked, true, 'početno:');
  s.mod._authToggleZapamti();
  eq(s.el0['auth-cbx-el'].classList.contains('checked'), false, 'vizuelno poslije 1. klika:');
  eq(s.el0['auth-zapamti'].checked, false, 'stvarno stanje poslije 1. klika:');
  s.mod._authToggleZapamti();
  eq(s.el0['auth-cbx-el'].classList.contains('checked'), true, 'vizuelno poslije 2. klika:');
  eq(s.el0['auth-zapamti'].checked, true, 'stvarno stanje poslije 2. klika:');
});

t('skriveni checkbox PRATI vizuelni, ne obrnuto (ne razilaze se)', () => {
  const s = sandbox(['_authToggleZapamti']);
  s.el0['auth-zapamti'].checked = false;          // vještački razišlo
  s.mod._authToggleZapamti();                      // vizuelno checked → unchecked
  eq(s.el0['auth-zapamti'].checked, false, 'poslije toggle-a mora pratiti vizuelno:');
});

t('toggle bez elemenata u DOM-u ne baca', () => {
  const tijelo = extractFn('_authToggleZapamti') + '\nreturn _authToggleZapamti;';
  new Function('document', tijelo)({ getElementById: () => null })();
});

// ── _authNaslov ─────────────────────────────────────────────────────────────
t('_authNaslov mijenja naslov sekcije', () => {
  const s = sandbox(['_authNaslov']);
  s.mod._authNaslov('Registracija');
  eq(s.el0['auth-divlabel'].textContent, 'Registracija');
});

// ── Invarijante nad markupom (ne konkretne vrijednosti) ─────────────────────
// Ovo su asercije o SVOJSTVU, ne o tekstu — isti princip kao test
// "svjetlije = svježije" (v3.113.3), koji je poslije bez izmjene potvrdio
// sasvim drugu paletu.

function authScreenMarkup() {
  const i = SRC.indexOf('id="auth-screen"');
  if (i < 0) throw new Error('nema #auth-screen u index.html');
  // Do kraja markupa ekrana — prvi <script> iza njega.
  const j = SRC.indexOf('<script', i);
  // HTML komentari se izbacuju: oni OBJAŠNJAVAJU šta je uklonjeno (npr. da je
  // ranije stajalo "SISTEM AKTIVAN") i lažno bi oborili asercije o markupu.
  return SRC.slice(i, j > 0 ? j : SRC.length).replace(/<!--[\s\S]*?-->/g, '');
}

t('verzija se NIGDJE ne ispisuje ručno — uvijek iz APP_VER', () => {
  const m = authScreenMarkup();
  const rucne = m.match(/>\s*[vV]\d+\.\d+(\.\d+)?\s*</g) || [];
  eq(rucne.length, 0, 'ručno upisana verzija u markupu (' + rucne.join(', ') + '):');
});

t('verzija se prikazuje na TAČNO jednom mjestu', () => {
  const m = authScreenMarkup();
  const mjesta = (m.match(/id="auth-ver-top"|id="auth-app-ver"/g) || []);
  eq(mjesta.length, 1, 'elemenata za verziju (' + mjesta.join(', ') + '):');
  // i JS puni baš taj jedan
  eq(/getElementById\('auth-app-ver'\)/.test(SRC), false, 'JS još puni uklonjeni #auth-app-ver:');
});

t('stanje veze se ne tvrdi fiksnim tekstom u markupu', () => {
  const m = authScreenMarkup();
  eq(/SISTEM\s+AKTIVAN/.test(m), false, 'fiksno "SISTEM AKTIVAN" je i dalje u markupu:');
  eq(/id="auth-sbadge-txt"/.test(m), true, 'nedostaje element koji _authStatusSync puni:');
});

t('ikonice u poljima su SVG sprite, ne emoji', () => {
  const m = authScreenMarkup();
  // Emoji unutar .auth-inp-ico kutija — dokumentovana OEM WebView zamka.
  const ico = m.match(/class="auth-input-icon"[^>]*>[\s\S]*?<\/span>/g) || [];
  if (!ico.length) throw new Error('nema nijedne .auth-input-icon kutije — selektor je zastario');
  ico.forEach(blok => {
    if (/[\u{1F300}-\u{1FAFF}\u{2190}-\u{27BF}\u{FE0F}]/u.test(blok)) {
      throw new Error('emoji u ikonici polja: ' + blok.slice(0, 80));
    }
    if (!/<use href="#ic-/.test(blok)) throw new Error('ikonica nije iz sprite-a: ' + blok.slice(0, 80));
  });
});

t('dodirne mete su najmanje 44px (rukavice na terenu)', () => {
  const css = SRC.slice(0, SRC.indexOf('id="auth-screen"'));
  const uzmi = (sel) => {
    const i = css.indexOf(sel);
    if (i < 0) throw new Error('nema CSS pravila ' + sel);
    const blok = css.slice(i, css.indexOf('}', i));
    const m = blok.match(/min-height:\s*(\d+)px/);
    if (!m) throw new Error(sel + ' nema min-height');
    return +m[1];
  };
  if (uzmi('.auth-btn-primary {') < 44) throw new Error('.auth-btn-primary ispod 44px');
  if (uzmi('.auth-btn-secondary {') < 44) throw new Error('.auth-btn-secondary ispod 44px');
  // Polja za unos — selektor je atributski (#auth-screen input:not(...)), ne klasa.
  if (uzmi('#auth-screen input:not([type=checkbox]):not([type=radio]) {') < 44)
    throw new Error('polje za unos ispod 44px');
});

t('kvačica se CRTA, ne ispisuje kao znak/emoji', () => {
  const i = SRC.indexOf('.auth-cbx::after');
  if (i < 0) throw new Error('nema .auth-cbx::after — prazan zeleni kvadrat se ne čita kao "uključeno"');
  const blok = SRC.slice(i, SRC.indexOf('}', i));
  if (!/content:\s*''/.test(blok)) throw new Error('kvačica se ispisuje kao znak, ne crta');
  if (!/border-width/.test(blok) || !/rotate/.test(blok)) throw new Error('kvačica nije nacrtana rotiranim uglom');
});

t('niski ekran (tastatura otvorena) ima svoj media query', () => {
  if (!/@media\s*\(max-height:\s*700px\)/.test(SRC)) throw new Error('nema @media max-height:700px');
  if (!/@media\s*\(max-height:\s*560px\)/.test(SRC)) throw new Error('nema @media max-height:560px');
});

console.log('\n' + ok + ' prošlo, ' + fail + ' palo');
process.exit(fail ? 1 : 0);
