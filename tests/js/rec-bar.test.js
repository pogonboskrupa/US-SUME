// =====================================================================
// Testovi za TRAKU SNIMANJA (#rec-bar) — donja traka na svim panelima.
// Pokretanje:  node tests/js/rec-bar.test.js
// ---------------------------------------------------------------------
// Zašto ovaj test postoji: donja traka (#action-bar) je do v3.116.0 postojala
// SAMO na Karti. Čim bi korisnik otišao na Vlake/Projekat/Doznaku, snimanje bi
// nestalo iz vidokruga — ni indikacije da nešto snima, ni načina da se pauzira
// ili završi bez vraćanja na Kartu. Traka snimanja to popunjava.
//
// Dvije stvari koje MORAJU ostati tačne i koje su lako pokvarive:
//   1. kad snima više stvari odjednom, ostale se BROJE (ne nestaju tiho) —
//      inače korisnik misli da je završio sve kad završi ono što traka pokazuje;
//   2. Pauza/Završi se rutiraju na ISPRAVAN tip snimanja.
//
// Testira se STVARNI izvorni kod — funkcije se izvlače direktno iz index.html.
// =====================================================================
'use strict';
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const HTML = fs.readFileSync(path.join(__dirname, '../../index.html'), 'utf8');

function extractFn(name) {
  const re = new RegExp('function ' + name + '\\(');
  const start = HTML.search(re);
  assert.ok(start >= 0, 'nije nađena funkcija ' + name + ' u index.html');
  let fstart = HTML.indexOf('function', start);
  if (HTML.slice(Math.max(0, fstart - 6), fstart) === 'async ') fstart -= 6;
  let i = HTML.indexOf('{', fstart), depth = 0;
  for (; i < HTML.length; i++) {
    if (HTML[i] === '{') depth++;
    else if (HTML[i] === '}') { depth--; if (depth === 0) return HTML.slice(fstart, i + 1); }
  }
  throw new Error('nezatvorena funkcija ' + name);
}

let pass = 0, fail = 0;
function t(name, fn) {
  try { fn(); pass++; console.log('  ✔ ' + name); }
  catch (e) { fail++; console.log('  ✘ ' + name + '\n      ' + e.message); }
}

const SRC = [
  extractFn('_recBarStanje'),
  extractFn('_recBarGo'),
  extractFn('_recBarPauza'),
  extractFn('_recBarKraj'),
].join('\n');

function make({ recOn = false, tragOn = false, dozOn = false,
                recPaused = false, tragPaused = false, dozPaused = false,
                vlakaNm = 'T1', tragPts = [], dozLen = 0, activeTab = 'vlake' } = {}) {
  const zvano = { pauza: [], kraj: [], tabovi: [] };
  const sandbox = {
    recOn, _tragOn: tragOn, _dozGpsOn: dozOn,
    recPaused, _tragPaused: tragPaused, _dozGpsPaused: dozPaused,
    actI: recOn ? 0 : null,
    vlake: [{ nm: vlakaNm, pts: [] }],
    _tragPts: tragPts,
    _dozGpsLen: dozLen,
    _activeTab: activeTab,
    fmtL: () => '250 m',
    calcL: () => 250,
    _tragCalcLen: () => 340,
    _tragFmtLen: (m) => m + ' m',
    switchTab: (tab) => { zvano.tabovi.push(tab); },
    toggleRecPause: () => { zvano.pauza.push('vlaka'); },
    togTragPause:   () => { zvano.pauza.push('trag'); },
    dozPauseGPS:    () => { zvano.pauza.push('doznaka'); },
    _krajVlake:  () => { zvano.kraj.push('vlaka'); },
    fabSnimTrag: () => { zvano.kraj.push('trag'); },
    dozToggleGPS:() => { zvano.kraj.push('doznaka'); },
    _recBarUpdate: () => {},
    setTimeout: (fn) => { fn(); return 1; },   // izvrši odmah da se rutiranje može provjeriti
    document: { getElementById: () => null, body: { classList: { toggle(){} } } },
  };
  const keys = Object.keys(sandbox);
  const api = new Function(...keys,
    SRC + '\nreturn { _recBarStanje, _recBarGo, _recBarPauza, _recBarKraj };'
  )(...keys.map(k => sandbox[k]));
  return { api, zvano };
}

console.log('_recBarStanje — šta traka pokazuje:');

t('ništa ne snima → nema trake (null)', () => {
  assert.strictEqual(make().api._recBarStanje(), null);
});

t('snima se TRAG → naziv, broj tačaka i dužina', () => {
  const s = make({ tragOn: true, tragPts: [1, 2, 3] }).api._recBarStanje();
  assert.strictEqual(s.tip, 'trag');
  assert.strictEqual(s.naziv, 'Trag');
  assert.strictEqual(s.info, '3 tač. · 340 m');
  assert.strictEqual(s.tab, 'karta');
  assert.strictEqual(s.ostalih, 0);
});

t('snima se VLAKA → ime vlake i dužina', () => {
  const s = make({ recOn: true, vlakaNm: 'T7' }).api._recBarStanje();
  assert.strictEqual(s.tip, 'vlaka');
  assert.strictEqual(s.naziv, 'T7');
  assert.strictEqual(s.info, '250 m');
  assert.strictEqual(s.tab, 'karta');
});

t('snima se POJAS DOZNAKE → vodi na Doznaku, ne na Kartu', () => {
  const s = make({ dozOn: true, dozLen: 120 }).api._recBarStanje();
  assert.strictEqual(s.tip, 'doznaka');
  assert.strictEqual(s.tab, 'doznaka', 'pojas se završava na svom ekranu');
  assert.strictEqual(s.info, '120 m');
});

t('pauzirano stanje se prenosi (traka mora prestati "pulsirati")', () => {
  assert.strictEqual(make({ tragOn: true, tragPaused: true }).api._recBarStanje().pauziran, true);
  assert.strictEqual(make({ recOn: true, recPaused: true }).api._recBarStanje().pauziran, true);
  assert.strictEqual(make({ dozOn: true, dozPaused: true }).api._recBarStanje().pauziran, true);
});

t('VIŠE snimanja odjednom: ostali se BROJE, ne nestaju tiho', () => {
  const s = make({ recOn: true, tragOn: true, dozOn: true }).api._recBarStanje();
  assert.strictEqual(s.tip, 'vlaka', 'prioritet: vlaka prva');
  assert.strictEqual(s.ostalih, 2, 'korisnik mora znati da još dvoje radi');
});

t('prioritet trag > doznaka kad vlaka ne snima', () => {
  const s = make({ tragOn: true, dozOn: true }).api._recBarStanje();
  assert.strictEqual(s.tip, 'trag');
  assert.strictEqual(s.ostalih, 1);
});

t('vlaka bez aktivnog indeksa ne ruši traku (fallback naziv)', () => {
  const { api } = make({ recOn: true });
  const s = api._recBarStanje();
  assert.ok(s && s.naziv, 'mora imati naziv i kad vlake[actI] nije upotrebljiv');
});

console.log('Rutiranje akcija na ISPRAVAN tip snimanja:');

t('Pauza ide na vlaku kad vlaka snima', () => {
  const { api, zvano } = make({ recOn: true });
  api._recBarPauza();
  assert.deepStrictEqual(zvano.pauza, ['vlaka']);
});

t('Pauza ide na trag kad trag snima', () => {
  const { api, zvano } = make({ tragOn: true });
  api._recBarPauza();
  assert.deepStrictEqual(zvano.pauza, ['trag']);
});

t('Pauza ide na doznaku kad pojas snima', () => {
  const { api, zvano } = make({ dozOn: true });
  api._recBarPauza();
  assert.deepStrictEqual(zvano.pauza, ['doznaka']);
});

t('Završi PRVO prebaci na ekran gdje snimanje živi, pa onda završi', () => {
  const { api, zvano } = make({ tragOn: true, activeTab: 'projekat' });
  api._recBarKraj();
  assert.deepStrictEqual(zvano.tabovi, ['karta'], 'dijalozi završetka pripadaju svom ekranu');
  assert.deepStrictEqual(zvano.kraj, ['trag']);
});

t('Završi pojasa doznake vodi na Doznaku, ne na Kartu', () => {
  const { api, zvano } = make({ dozOn: true, activeTab: 'vlake' });
  api._recBarKraj();
  assert.deepStrictEqual(zvano.tabovi, ['doznaka']);
  assert.deepStrictEqual(zvano.kraj, ['doznaka']);
});

t('klik na natpis vodi na ekran snimanja, bez završavanja', () => {
  const { api, zvano } = make({ tragOn: true, activeTab: 'teren' });
  api._recBarGo();
  assert.deepStrictEqual(zvano.tabovi, ['karta']);
  assert.deepStrictEqual(zvano.kraj, [], 'klik na natpis NE smije ništa završiti');
});

t('akcije bez aktivnog snimanja ne rade ništa (ne bacaju)', () => {
  const { api, zvano } = make();
  api._recBarPauza(); api._recBarKraj(); api._recBarGo();
  assert.deepStrictEqual(zvano.pauza, []);
  assert.deepStrictEqual(zvano.kraj, []);
  assert.deepStrictEqual(zvano.tabovi, []);
});

console.log('\n' + pass + ' prošlo, ' + fail + ' palo');
process.exit(fail ? 1 : 0);
