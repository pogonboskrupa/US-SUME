// =====================================================================
// v1.8.1: Stil linija (pregled uživo), KML izvoz traga, uklonjeni meniji.
// Pokretanje:  node tests/js/stil-kml-meni.test.js
// ---------------------------------------------------------------------
// - "KML izvoz" iz Menija je izvozio SAMO vlake (mkKML) kroz tekstualni
//   modal; tragovi se izvoze sa samog traga (kartica, popup, Teren).
// - "Podijeli lokaciju" (meni tok) je uklonjen; dijeljenje kretanja iz
//   Terena i PRIJEM lokacija kolega ostaju.
// - "Stil linija" dobija pregled koji je čista funkcija stila.
// =====================================================================
'use strict';
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const HTML = fs.readFileSync(path.join(__dirname, '../../index.html'), 'utf8');

function extractFn(name) {
  let start = HTML.indexOf('async function ' + name + '(');
  if (start < 0) start = HTML.indexOf('function ' + name + '(');
  if (start < 0) throw new Error('nije nađena funkcija ' + name);
  let i = HTML.indexOf('{', start), depth = 0;
  for (; i < HTML.length; i++) {
    if (HTML[i] === '{') depth++;
    else if (HTML[i] === '}') { depth--; if (depth === 0) return HTML.slice(start, i + 1); }
  }
  throw new Error('nezatvorena funkcija ' + name);
}
function extractConst(name) {
  const m = new RegExp('const ' + name + ' = ').exec(HTML);
  if (!m) throw new Error('nema konstante ' + name);
  let i = m.index + m[0].length, depth = 0;
  for (; i < HTML.length; i++) {
    const c = HTML[i];
    if ('{[('.includes(c)) depth++;
    else if ('}])'.includes(c)) depth--;
    else if (c === ';' && depth === 0) return HTML.slice(m.index, i + 1);
  }
  throw new Error('nezavršena ' + name);
}

let pass = 0, fail = 0;
function t(name, fn) {
  try { fn(); console.log('  ✔ ' + name); pass++; }
  catch (e) { fail++; console.log('  ✘ ' + name + '\n      ' + e.message); }
}
console.log('Stil linija / KML traga / meni:');

const stil = new Function(extractConst('_LSTYLE_DEFAULT') + extractConst('_STIL_DASH') +
  extractFn('_stilPregledSvg') + '\nreturn { _stilPregledSvg, _LSTYLE_DEFAULT };')();
const pregled = o => stil._stilPregledSvg({ ...stil._LSTYLE_DEFAULT, ...o });

t('pregled prati debljinu, boju i vrstu linije traga (iste dash vrijednosti kao na karti)', () => {
  const a = pregled({ tragW: 8, tragCol: '#a855f7', tragDash: 'dash' });
  assert.ok(/stroke="#a855f7"[^>]*stroke-width="8"[^>]*stroke-dasharray="8 4"/.test(a), 'trag nije nacrtan sa stilom');
  assert.ok(/stroke-dasharray="2 6"/.test(pregled({ tragDash: 'dot' })));
  assert.ok(!/stroke-dasharray/.test(pregled({ tragDash: 'solid' })), 'puna linija nema dash');
  assert.ok(/stroke="#f97316"/.test(pregled({ tragCol: '' })), 'bez globalne boje ide podrazumijevana narandžasta');
  const tragDash = HTML.slice(HTML.indexOf('function _tragRegAddLayer'), HTML.indexOf('function _tragRegAddLayer') + 900);
  assert.ok(/'2 6'/.test(tragDash) && /'8 4'/.test(tragDash), 'karta i pregled moraju koristiti iste dash nizove');
});

t('oznake dužine/površine se pojavljuju samo kad su uključene', () => {
  assert.ok(!/248 m/.test(pregled({ tragLen: false })) && /248 m/.test(pregled({ tragLen: true })));
  assert.ok(/0,82 ha/.test(pregled({ msrArea: true })) && !/0,82 ha/.test(pregled({ msrArea: false })));
  assert.ok(/fill-opacity="0.5"/.test(pregled({ msrFillOp: 50 })));
});

t('veličina tačke u pregledu skalira kao _tačkaIcon (24×32 baza)', () => {
  assert.ok(/scale\(1\.8\)/.test(pregled({ tackaScale: 180 })));
  assert.ok(/scale\(0\.5\)/.test(pregled({ tackaScale: 50 })));
});

t('"Vrati zadano" vraća TAČNE zadane vrijednosti i traži potvrdu', () => {
  const f = extractFn('_stilVratiZadano');
  assert.ok(/_dlgConfirm/.test(f) && /Object\.assign\(_lineStyle, _LSTYLE_DEFAULT\)/.test(f) && /_stilApply\(\)/.test(f));
  assert.deepStrictEqual(Object.keys(stil._LSTYLE_DEFAULT).sort(),
    ['lagerScale', 'msrArea', 'msrFillOp', 'msrLen', 'msrW', 'tackaScale', 'tragCol', 'tragDash', 'tragLen', 'tragOp', 'tragW', 'vlakaDotScale']);
});

t('klizač ne precrtava panel (inače bi se prekinulo povlačenje prsta)', () => {
  const f = extractFn('_stilSet');
  const range = f.slice(f.indexOf("el.type === 'range'"), f.indexOf('} else {'));
  assert.ok(/_stilPregled\(\)/.test(range) && !/_stilRender\(\)/.test(range));
});

// ── KML traga ──
const kmlApi = new Function('fmtDateShort', extractFn('_tragIme') + extractFn('_tragKmlIme') +
  extractFn('_tragToKml') + extractFn('_escXml') + extractFn('_hexToKmlColor') +
  '\nreturn { _tragKmlIme, _tragToKml };')(iso => iso.slice(8, 10) + '.' + iso.slice(5, 7) + '.' + iso.slice(0, 4));

t('trag bez imena dobija ime fajla i <name> (ranije ".kml" i prazan naziv)', () => {
  const tr = { name: '', pts: [[44.9, 15.8, 0, Date.UTC(2026, 8, 26, 10, 5)], [44.91, 15.81]], color: '#f97316' };
  const ime = kmlApi._tragKmlIme(tr);
  assert.ok(/^Trag_\d{2}\.\d{2}\.\d{4}_\d{2}:\d{2}\.kml$/.test(ime.replace(/:/g, ':')) || /^Trag_/.test(ime), ime);
  assert.notStrictEqual(ime, '.kml');
  assert.ok(/<name>Trag /.test(kmlApi._tragToKml(tr)));
});

t('ime fajla zadržava dijakritiku, a izbacuje znakove zabranjene u imenu fajla', () => {
  const ime = kmlApi._tragKmlIme({ name: 'Obilazak č/ž: "14a"', pts: [] });
  assert.strictEqual(ime, 'Obilazak_čž_14a.kml');
});

t('kartica traga, popup na karti i Teren nude KML izbor (Podijeli / Sačuvaj)', () => {
  assert.ok(/_tragKmlMeni\('\$\{t\.id\}'\)[^>]*>[\s\S]{0,80}KML/.test(extractFn('_tragoviRowHtml')));
  assert.ok(/_tragKmlMeni\(/.test(extractFn('_tragPopupHtml')));
  const meni = extractFn('_tragKmlMeni');
  assert.ok(/_tragRegShare\(id\)/.test(meni) && /_tragKmlSacuvaj\(id\)/.test(meni));
  assert.ok(!/confirm\(/.test(extractFn('_tragPopupHtml').replace(/_dlgConfirm/g, '')), 'bez native confirm()');
});

// ── Uklonjeni meniji ──
t('Meni više nema "KML izvoz" ni "Podijeli lokaciju"; modal i njegove funkcije su uklonjeni', () => {
  const meni = HTML.slice(HTML.indexOf('class="mdrop-item"'));
  assert.ok(!/KML izvoz/.test(meni) && !/Podijeli lokaciju/.test(meni));
  for (const fn of ['showExport', 'showShareLocMenu', '_showShareActionSheet', '_sharePoint', 'kmlModalShare', 'closeM'])
    assert.ok(!new RegExp('function ' + fn + '\\(').test(HTML), fn + ' još postoji');
  assert.ok(!/id="modal"/.test(HTML) && !/id="etxt"/.test(HTML));
});

t('dijeljenje kretanja iz Terena i prijem lokacija kolega su i dalje tu', () => {
  for (const fn of ['terenTogShare', '_startShareLive', '_stopShareLive', '_onSharePoint', '_onShareLive', '_notifyShareLoc'])
    assert.ok(new RegExp('function ' + fn + '\\(').test(HTML), fn + ' nedostaje');
  assert.ok(/id="trn-share-btn"/.test(HTML));
});

console.log(`\n${pass} prošlo, ${fail} palo`);
process.exit(fail ? 1 : 0);
