// =====================================================================
// Doznaka (pojas) — GPS lanac i prozori pauze (v1.6.1).
// Pokretanje:  node tests/js/doznaka-gps.test.js
// ---------------------------------------------------------------------
// GLAVNI NALAZ koji ovaj fajl čuva: snimanje zaustavljeno DOK JE PAUZIRANO
// ostavljalo je interval pauze sa `end:null`, a takav interval _uPauziIntervalu
// smatra "traje i dalje" za SVAKO buduće vrijeme. _pauziOcistiZatvorene ga
// namjerno ne briše (čuva tekuću pauzu), pa je zaostajao zauvijek — i u
// SLJEDEĆEM snimanju native replay bi tiho odbacio SVAKU tačku, uz napredovanje
// _nativeReplayLast (dakle bez ponovnog pokušaja). To je trajan gubitak baš one
// vrste zbog koje su prozori pauze (v1.5.8) i uvedeni.
//
// Pogađalo je SVA TRI tipa snimanja (vlaka, trag, doznaka), ne samo doznaku.
//
// Testira se STVARNI kod izvučen iz index.html.
// =====================================================================
'use strict';
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const HTML = fs.readFileSync(path.join(__dirname, '../../index.html'), 'utf8');

// Komentari se izbacuju prije invarijantnih grepova — inače dokumentacija
// izmjene obori test te iste izmjene (dokumentovana zamka iz v1.5.3).
const BEZ_KOM = HTML.split('\n').map(r => r.replace(/^\s*\/\/.*$/, '')).join('\n');

function extractFn(name, src) {
  const h = src || HTML;
  let start = h.indexOf('async function ' + name + '(');
  if (start < 0) start = h.indexOf('function ' + name + '(');
  if (start < 0) throw new Error('nije nađena funkcija ' + name);
  let i = h.indexOf('(', start), par = 0;
  for (; i < h.length; i++) {
    if (h[i] === '(') par++;
    else if (h[i] === ')') { par--; if (par === 0) { i++; break; } }
  }
  i = h.indexOf('{', i);
  let depth = 0;
  for (; i < h.length; i++) {
    if (h[i] === '{') depth++;
    else if (h[i] === '}') { depth--; if (depth === 0) return h.slice(start, i + 1); }
  }
  throw new Error('nezatvorena funkcija ' + name);
}

let pass = 0, fail = 0;
function t(name, fn) {
  try { fn(); console.log('  ✔ ' + name); pass++; }
  catch (e) { fail++; console.log('  ✘ ' + name + '\n      ' + e.message); }
}

// Sve funkcije prozora pauze u jednom sandboxu — one su mali, čisti helperi
// nad nizom, pa se puštaju STVARNE, bez ijednog mocka.
function pauzaApi() {
  const src = ['_uPauziIntervalu', '_pauziOtvoriProzor', '_pauziZatvoriProzor',
               '_pauziOcistiZatvorene', '_pauziZavrsi', '_pauziResetuj']
    .map(n => extractFn(n)).join('\n');
  return new Function(src + '\nreturn { _uPauziIntervalu, _pauziOtvoriProzor, ' +
    '_pauziZatvoriProzor, _pauziOcistiZatvorene, _pauziZavrsi, _pauziResetuj };')();
}

console.log('Prozori pauze — otvoren interval ne smije preživjeti snimanje:');

t('KLJUČNO: stop usred pauze zatvara interval (inače guta SVE buduće tačke)', () => {
  const api = pauzaApi();
  const win = [];
  api._pauziOtvoriProzor(win);                 // korisnik pauzira
  assert.strictEqual(win[0].end, null, 'tekuća pauza mora biti otvorena');
  api._pauziZavrsi(win);                       // korisnik zaustavi snimanje DOK JE PAUZIRANO
  assert.notStrictEqual(win[0].end, null, 'stop mora zatvoriti tekući interval');
  const buducnost = Date.now() + 3600 * 1000;
  assert.strictEqual(api._uPauziIntervalu(win, buducnost), false,
    'tačka snimljena SAT KASNIJE (nova sesija) ne smije biti proglašena pauziranom');
});

t('bez zatvaranja bi ista tačka bila odbačena — dokaz da test mjeri pravu stvar', () => {
  const api = pauzaApi();
  const win = [];
  api._pauziOtvoriProzor(win);
  const buducnost = Date.now() + 3600 * 1000;
  assert.strictEqual(api._uPauziIntervalu(win, buducnost), true,
    'otvoren interval po definiciji pokriva svako buduće vrijeme');
});

t('_pauziOcistiZatvorene NE briše otvoren interval (zato stop mora zatvoriti)', () => {
  const api = pauzaApi();
  const win = [];
  api._pauziOtvoriProzor(win);
  api._pauziOcistiZatvorene(win);
  assert.strictEqual(win.length, 1,
    'ako bi čišćenje brisalo i otvoren interval, tekuća pauza bi se izgubila usred snimanja');
});

t('start odbacuje zaostatak prethodne sesije', () => {
  const api = pauzaApi();
  const win = [{ start: 1, end: null }, { start: 2, end: 3 }];
  api._pauziResetuj(win);
  assert.strictEqual(win.length, 0);
});

t('_pauziResetuj mijenja POSTOJEĆI niz (const niz se ne može prevezati)', () => {
  const api = pauzaApi();
  const win = [{ start: 1, end: null }];
  const isti = win;
  api._pauziResetuj(win);
  assert.strictEqual(isti.length, 0,
    '_tragPauseWin/_recPauseWin/_dozPauseWin su const — reset mora biti na mjestu');
});

t('zatvoren interval i dalje ispravno sudi tačkama IZ SVOG perioda', () => {
  const api = pauzaApi();
  const win = [{ start: 1000, end: 2000 }];
  assert.strictEqual(api._uPauziIntervalu(win, 1500), true,  'tačka usred pauze');
  assert.strictEqual(api._uPauziIntervalu(win, 999), false,  'tačka prije pauze');
  assert.strictEqual(api._uPauziIntervalu(win, 2000), false, 'tačka na trenutak nastavka');
});

t('_pauziZavrsi nad praznim nizom ne baca (stop bez ijedne pauze)', () => {
  const api = pauzaApi();
  const win = [];
  api._pauziZavrsi(win);
  assert.strictEqual(win.length, 0);
});

t('dvostruki stop ne pomjera već zapisano vrijeme kraja', () => {
  const api = pauzaApi();
  const win = [];
  api._pauziOtvoriProzor(win);
  api._pauziZavrsi(win);
  const kraj = win[0].end;
  api._pauziZavrsi(win);
  assert.strictEqual(win[0].end, kraj);
});

console.log('\nSva tri tipa snimanja zatvaraju/resetuju svoj prozor:');

const parovi = [
  ['stopRec',            '_pauziZavrsi',   '_recPauseWin',  'vlaka — stop'],
  ['_togRecBegin',       '_pauziResetuj',  '_recPauseWin',  'vlaka — start'],
  ['fabSnimTrag',        '_pauziZavrsi',   '_tragPauseWin', 'trag — stop'],
  ['_fabSnimTragBegin',  '_pauziResetuj',  '_tragPauseWin', 'trag — start'],
  ['dozStopGPS',         '_pauziZavrsi',   '_dozPauseWin',  'doznaka — stop'],
  ['_dozStartGPSBegin',  '_pauziResetuj',  '_dozPauseWin',  'doznaka — start'],
];
parovi.forEach(([fn, helper, win, opis]) => {
  t(opis + ' zove ' + helper + '(' + win + ')', () => {
    const src = extractFn(fn);
    assert.ok(new RegExp(helper + '\\(' + win + '\\)').test(src),
      fn + ' ne zove ' + helper + ' — zaostao prozor tiho odbacuje tačke sljedeće sesije');
  });
});

console.log('\nUživo watch — baceni izuzetak ne smije ostati neuhvaćen:');

t('oba doznaka watch callbacka hvataju pad _dozProcessGpsPoint', () => {
  const mjesta = BEZ_KOM.split('\n')
    .map((r, i) => ({ r, br: i + 1 }))
    .filter(x => /await _dozProcessGpsPoint\(lat, lng, alt, acc, speed\)/.test(x.r));
  assert.strictEqual(mjesta.length, 2,
    'očekivana su tačno dva uživo watch poziva (start + oporavak), nađeno: ' + mjesta.length);
  mjesta.forEach(x => {
    assert.ok(/try \{/.test(x.r),
      'linija ' + x.br + ': poziv mora biti u try — inače je svaki fiks pri punoj kvoti ' +
      'neuhvaćeno odbijanje obećanja, a _dozUpdGpsStats se nikad ne izvrši');
  });
});

t('_dozProcessGpsPoint i dalje BACA (signal koji native replay-u treba)', () => {
  const src = extractFn('_dozProcessGpsPoint');
  assert.ok(/if \(!_dozBufferTrackPoint\(_dozPt\)\) throw/.test(src),
    'bez bacanja _drainNativeGpsBuffer bi potvrdio journal za tačke koje nisu spremljene');
});

console.log('\nOporavak poslije ubijenog procesa (_crashCheck, grana snapD):');

t('KLJUČNO: journal se potvrđuje TEK kad je svaka grana spremila svoje', () => {
  const src = extractFn('_crashCheck');
  assert.ok(/if \(_svePersistirano\) _nativeBufPotvrdi\(\);/.test(src),
    'bez potvrde journal preživi oporavak; bez uslova bi pala grana izgubila tačke');
  const pali = (src.match(/_svePersistirano = false/g) || []).length;
  assert.strictEqual(pali, 3,
    'sve tri grane oporavka (vlaka, trag, doznaka) moraju oboriti zastavicu, nađeno: ' + pali);
});

t('oporavak obnavlja _dozGpsFullPts (inače izvoz GPX tiho gubi sve prije prekida)', () => {
  const src = extractFn('_crashCheck');
  assert.ok(/_dozGpsFullPts = \(Array\.isArray\(snapD\.pts\)/.test(src),
    '_dozGpsFullPts je jedini izvor za GPX i za to da se dugme izvoza pojavi');
});

t('oporavljena tačka NEMA izmišljeno vrijeme', () => {
  const src = extractFn('_crashCheck');
  const red = src.split('\n').find(r => /\.map\(\(\[la, lo\]\)/.test(r));
  assert.ok(red && /time: null/.test(red),
    'snimak ne nosi tajmstamp — upisati "sad" bi bio lažan podatak: ' + (red || 'nema reda'));
});

t('GPX ne piše prazan <time></time> element', () => {
  const src = extractFn('dozExportGPX');
  assert.ok(!/<time>\$\{p\.time \|\| ''\}<\/time>/.test(src),
    'prazan <time> je neispravan GPX');
  assert.ok(/p\.time \?/.test(src), 'element se mora izostaviti kad vrijeme nije poznato');
});

t('oporavak i start resetuju zastavicu upozorenja o punoj kvoti', () => {
  ['_crashCheck', '_dozStartGPSBegin'].forEach(fn => {
    assert.ok(/_dozLiveUpisPao = false/.test(extractFn(fn)),
      fn + ': bez reseta drugo snimanje poslije pune kvote prolazi bez ijednog upozorenja ' +
      'da mu crash-zaštita uopšte ne radi');
  });
});

console.log('\n' + pass + ' prošlo, ' + fail + ' palo');
process.exit(fail ? 1 : 0);
