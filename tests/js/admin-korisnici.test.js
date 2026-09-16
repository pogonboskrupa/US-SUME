// =====================================================================
// Testovi za admin sekciju Korisnici (index.html).
// Pokretanje:  node tests/js/admin-korisnici.test.js
// ---------------------------------------------------------------------
// Zašto ovi testovi postoje: sekcija je preuređena zbog preglednosti
// (v3.121.0), a dvije stvari se iz screenshot-a NE VIDE i lako se tiho
// pokvare pri sljedećoj izmjeni:
//   1) OPOZVAN nalog se do tada prikazivao identično kao ČEKA ODOBRENJE
//      (oba imaju odobren === false) — a to su suprotne stvari.
//   2) Registracije na čekanju imaju ROK (brišu se same za 7 dana) pa moraju
//      biti PRVE u listi bez obzira koji je sort izabran.
//
// Testira se STVARNI kod izvučen iz index.html, ne kopija.
// =====================================================================
'use strict';
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const HTML = fs.readFileSync(path.join(__dirname, '../../index.html'), 'utf8');

function extractFn(name) {
  const start = HTML.indexOf('function ' + name + '(');
  assert.ok(start >= 0, 'nije nađena funkcija ' + name + ' u index.html');
  let i = HTML.indexOf('{', start), depth = 0;
  for (; i < HTML.length; i++) {
    if (HTML[i] === '{') depth++;
    else if (HTML[i] === '}') { depth--; if (depth === 0) return HTML.slice(start, i + 1); }
  }
  throw new Error('nezatvorena funkcija ' + name);
}
function extractConst(name) {
  const re = new RegExp('const ' + name + '\\s*=\\s*[^;]+;');
  const m = HTML.match(re);
  assert.ok(m, 'nije nađena konstanta ' + name);
  return m[0];
}

const NAMES = ['_admStatus', '_admDanaNeaktivan', '_admMozeSePrijaviti', '_admJeNeaktivan',
               '_admFiltriraj', '_admSortiraj', '_admSazetak', '_jsAttr', '_escHtml'];
const SRC = extractConst('_ADM_NEAKTIVAN_DANA') + '\n' + NAMES.map(extractFn).join('\n');
const M = new Function(SRC + '\nreturn {' + NAMES.join(',') + ', _ADM_NEAKTIVAN_DANA};')();
const { _admStatus, _admDanaNeaktivan, _admJeNeaktivan, _admFiltriraj, _admSortiraj,
        _admSazetak, _jsAttr } = M;

const DAN = 86400000;
const SADA = Date.parse('2026-09-09T12:00:00Z');
const iso = ms => new Date(ms).toISOString();

// Uzorci koji odgovaraju STVARNOM obliku iz admin_get_all_users()
const ceka = (ime, danaDoRoka) => ({
  id: 'u-' + ime, ime, prezime: 'Test', sumarija: 'ŠUMARIJA BIHAĆ',
  odobren: false, istice_at: iso(SADA + danaDoRoka * DAN),
  created_at: iso(SADA - 2 * DAN), last_sign_in_at: null
});
const opozvan = ime => ({
  id: 'u-' + ime, ime, prezime: 'Test', sumarija: 'ŠUMARIJA BIHAĆ',
  odobren: false, istice_at: null,
  created_at: iso(SADA - 400 * DAN), last_sign_in_at: iso(SADA - 10 * DAN)
});
const odobren = (ime, danaOdPrijave, sum) => ({
  id: 'u-' + ime, ime, prezime: 'Test', sumarija: sum || 'ŠUMARIJA BIHAĆ',
  odobren: true, istice_at: null, created_at: iso(SADA - 300 * DAN),
  last_sign_in_at: danaOdPrijave === null ? null : iso(SADA - danaOdPrijave * DAN)
});
const admin = ime => ({
  id: 'u-' + ime, ime, prezime: 'Test', sumarija: 'ŠPD US ŠUME',
  is_admin: true, odobren: true, istice_at: null,
  created_at: iso(SADA - 500 * DAN), last_sign_in_at: iso(SADA - 1 * DAN)
});

let pass = 0, fail = 0;
function t(name, fn) {
  try { fn(); console.log('  ✔ ' + name); pass++; }
  catch (e) { console.log('  ✘ ' + name + '\n      ' + e.message); fail++; }
}

// =====================================================================
console.log('Status — "čeka odobrenje" i "opozvan" NISU ista stvar:');

t('nalog sa istice_at čeka PRVO odobrenje', () => {
  assert.strictEqual(_admStatus(ceka('Ana', 5)), 'ceka');
});

t('nalog BEZ istice_at a neodobren je OPOZVAN, ne "čeka"', () => {
  // Do v3.121.0 su oba pisala "⏳ ČEKA ODOBRENJE" — admin bi mislio da treba
  // odobriti nekoga kome je sam ranije oduzeo pristup.
  assert.strictEqual(_admStatus(opozvan('Boris')), 'opozvan');
});

t('kad migracija NIJE primijenjena (istice_at undefined) ponaša se kao ranije', () => {
  // Bolje "čeka" (poznato staro ponašanje) nego tvrditi "opozvan" za nekoga
  // ko to nije — podatak jednostavno ne postoji.
  const stari = { id: 'x', ime: 'C', odobren: false };
  assert.strictEqual(_admStatus(stari), 'ceka');
});

t('admin je admin bez obzira na odobren', () => {
  assert.strictEqual(_admStatus(admin('Dino')), 'admin');
  assert.strictEqual(_admStatus({ id: 'y', is_admin: true, odobren: false, istice_at: null }), 'admin');
});

t('odobren nalog je odobren; nedostajuće polje se ne računa kao opozvan', () => {
  assert.strictEqual(_admStatus(odobren('Ema', 3)), 'odobren');
  assert.strictEqual(_admStatus({ id: 'z', ime: 'F' }), 'odobren');
});

// =====================================================================
console.log('\nNeaktivnost — "nikad" i "ne znam" se NE smiju spojiti:');

t('nikad se nije prijavio → null (stvarna informacija)', () => {
  assert.strictEqual(_admDanaNeaktivan(odobren('G', null), SADA), null);
});

t('podatak ne postoji (starija migracija) → undefined, ne 0 i ne null', () => {
  assert.strictEqual(_admDanaNeaktivan({ id: 'h', ime: 'H' }, SADA), undefined);
});

t('broji dane od zadnje prijave', () => {
  assert.strictEqual(_admDanaNeaktivan(odobren('I', 120), SADA), 120);
  assert.strictEqual(_admDanaNeaktivan(odobren('J', 0), SADA), 0);
});

t('neupotrebljiv datum ne baca i ne daje NaN dane', () => {
  assert.strictEqual(_admDanaNeaktivan({ id: 'k', last_sign_in_at: 'ovo-nije-datum' }, SADA), undefined);
});

// =====================================================================
console.log('\nFilter:');

const LISTA = [
  ceka('Ana', 5), ceka('Zoran', 1), opozvan('Boris'),
  odobren('Cvijeta', 2), odobren('Damir', 200), odobren('Ema', null),
  odobren('Faruk', 3, 'ŠUMARIJA CAZIN'), admin('Goran')
];

t('bez filtera vraća sve', () => {
  assert.strictEqual(_admFiltriraj(LISTA, { sada: SADA }).length, LISTA.length);
});

t('filter po šumariji', () => {
  const r = _admFiltriraj(LISTA, { sum: 'ŠUMARIJA CAZIN', sada: SADA });
  assert.strictEqual(r.length, 1);
  assert.strictEqual(r[0].ime, 'Faruk');
});

t('pretraga po imenu je neosjetljiva na velika slova i hvata prezime', () => {
  assert.strictEqual(_admFiltriraj(LISTA, { ime: 'ZOR', sada: SADA }).length, 1);
  assert.strictEqual(_admFiltriraj(LISTA, { ime: 'test', sada: SADA }).length, LISTA.length);
});

t('filter po statusu', () => {
  assert.strictEqual(_admFiltriraj(LISTA, { status: 'ceka', sada: SADA }).length, 2);
  assert.strictEqual(_admFiltriraj(LISTA, { status: 'opozvan', sada: SADA }).length, 1);
  assert.strictEqual(_admFiltriraj(LISTA, { status: 'admin', sada: SADA }).length, 1);
});

t('"neaktivni" hvata i one koji se NIKAD nisu prijavili', () => {
  // Ema se nikad nije prijavila, Damir 200 dana. Ana i Zoran ČEKAJU odobrenje
  // — oni se NE broje (vidi test ispod), jer se ne mogu ni prijaviti.
  const r = _admFiltriraj(LISTA, { status: 'neaktivni', sada: SADA }).map(u => u.ime).sort();
  assert.deepStrictEqual(r, ['Damir', 'Ema']);
});

t('nalog koji ČEKA ODOBRENJE se NE broji kao neaktivan (ne može se prijaviti)', () => {
  // Uhvaćeno na screenshot-u, ne u brojkama: sažetak je pisao "2 čekaju
  // odobrenje · 4 neaktivnih" gdje su ta ista dva bila brojana dvaput, a na
  // kartici je uz "⏳ ČEKA ODOBRENJE" stajalo i "nije se prijavio".
  assert.strictEqual(_admJeNeaktivan(ceka('Ana', 5), SADA), false);
  assert.strictEqual(_admJeNeaktivan(opozvan('Boris'), SADA), false,
    'opozvanom je pristup svjesno oduzet — "neaktivan" o njemu ništa ne govori');
  assert.strictEqual(_admJeNeaktivan(odobren('Ema', null), SADA), true);
  assert.strictEqual(_admJeNeaktivan(odobren('Damir', 200), SADA), true);
  assert.strictEqual(_admJeNeaktivan(odobren('Cvijeta', 2), SADA), false);
});

t('svjež korisnik NIJE neaktivan', () => {
  const r = _admFiltriraj(LISTA, { status: 'neaktivni', sada: SADA }).map(u => u.ime);
  assert.ok(!r.includes('Cvijeta'), 'Cvijeta se prijavila prije 2 dana');
  assert.ok(!r.includes('Goran'), 'Goran se prijavio juče');
});

t('filteri se kombinuju (šumarija + status)', () => {
  const r = _admFiltriraj(LISTA, { sum: 'ŠUMARIJA BIHAĆ', status: 'ceka', sada: SADA });
  assert.strictEqual(r.length, 2);
});

t('prazan/nedostajuć ulaz ne baca', () => {
  assert.strictEqual(_admFiltriraj(null, {}).length, 0);
  assert.strictEqual(_admFiltriraj([], null).length, 0);
});

// =====================================================================
console.log('\nSortiranje — čekanja uvijek prva, najkraći rok na vrhu:');

t('čekanja idu PRVA bez obzira na izabrani sort', () => {
  for (const sort of ['ime', 'aktivnost', 'noviji']) {
    const r = _admSortiraj(LISTA, sort, SADA);
    assert.strictEqual(_admStatus(r[0]), 'ceka', 'sort=' + sort + ' → prvi je ' + r[0].ime);
    assert.strictEqual(_admStatus(r[1]), 'ceka', 'sort=' + sort);
  }
});

t('unutar čekanja prvi je onaj kojem rok ISTIČE PRIJE', () => {
  const r = _admSortiraj(LISTA, 'ime', SADA);
  assert.strictEqual(r[0].ime, 'Zoran', 'Zoranu ističe za 1 dan, Ani za 5');
  assert.strictEqual(r[1].ime, 'Ana');
});

t('ostali se po imenu poredaju abecedno', () => {
  const imena = _admSortiraj(LISTA, 'ime', SADA).slice(2).map(u => u.ime);
  assert.deepStrictEqual(imena, ['Boris', 'Cvijeta', 'Damir', 'Ema', 'Faruk', 'Goran']);
});

t('sort po zadnjoj prijavi — najskoriji prvi, "nikad" na dno', () => {
  const r = _admSortiraj(LISTA, 'aktivnost', SADA).slice(2);
  assert.strictEqual(r[0].ime, 'Goran', 'Goran je bio juče');
  assert.strictEqual(r[r.length - 1].ime, 'Ema', 'Ema se nikad nije prijavila → dno');
});

t('sortiranje ne mijenja ulazni niz (ne mutira _adminUsers)', () => {
  const kopija = LISTA.slice();
  _admSortiraj(LISTA, 'aktivnost', SADA);
  assert.deepStrictEqual(LISTA.map(u => u.ime), kopija.map(u => u.ime));
});

// =====================================================================
console.log('\nSažetak:');

t('broji po statusima', () => {
  const s = _admSazetak(LISTA, SADA);
  assert.strictEqual(s.ukupno, 8);
  assert.strictEqual(s.ceka, 2);
  assert.strictEqual(s.opozvan, 1);
  assert.strictEqual(s.admin, 1);
  assert.strictEqual(s.odobren, 4);
});

t('neaktivni se broje NEZAVISNO od statusa (nisu podskup jedne trake)', () => {
  const s = _admSazetak(LISTA, SADA);
  assert.strictEqual(s.neaktivni, 2, 'samo Damir i Ema — čekanja i opozvani se ne broje');
  assert.ok(s.ceka + s.opozvan + s.admin + s.odobren === s.ukupno,
    'statusi se ne preklapaju i pokrivaju sve');
});

t('prazna lista daje nule, ne baca', () => {
  const s = _admSazetak([], SADA);
  assert.strictEqual(s.ukupno, 0);
  assert.strictEqual(s.ceka, 0);
});

// =====================================================================
console.log('\nEscaping imena u onclick atribut:');

t('apostrof u imenu ne prekida JS string u onclick-u', () => {
  // _escHtml NE escape-uje apostrof, a ime ide u onclick="fn('IME')" —
  // bez _jsAttr bi dugme tiho prestalo raditi, bez greške u konzoli.
  const out = _jsAttr("O'Brien");
  assert.ok(!/(^|[^\\])'/.test(out), 'svaki apostrof mora biti escape-ovan: ' + out);
  assert.ok(out.includes("\\'"), 'očekivan \\\' u ' + out);
});

t('backslash se escape-uje PRIJE apostrofa (inače se poništi)', () => {
  const out = _jsAttr('C:\\put');
  assert.ok(out.includes('\\\\'), 'backslash mora biti udvostručen: ' + out);
});

t('HTML znaci i dalje ostaju escape-ovani (ne otvara se atribut ni tag)', () => {
  const out = _jsAttr('a"b<c>d&e');
  assert.ok(!out.includes('"'), 'navodnik bi zatvorio atribut: ' + out);
  assert.ok(!/[<>]/.test(out), 'uglaste zagrade moraju biti escape-ovane: ' + out);
});

t('prazno/nedostajuće ime ne baca', () => {
  assert.strictEqual(_jsAttr(null), '');
  assert.strictEqual(_jsAttr(undefined), '');
  assert.strictEqual(_jsAttr(''), '');
});

console.log('\n' + pass + ' prošlo, ' + fail + ' palo');
process.exit(fail ? 1 : 0);
