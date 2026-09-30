// =====================================================================
// Sekcija Projekat (v1.7.6).
// Pokretanje:  node tests/js/projekat-panel.test.js
// =====================================================================
'use strict';
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const HTML = fs.readFileSync(path.join(__dirname, '../../index.html'), 'utf8');

function extractFn(name) {
  let start = HTML.indexOf('function ' + name + '(');
  if (start < 0) throw new Error('nije nađena funkcija ' + name);
  let i = HTML.indexOf('{', start), depth = 0;
  for (; i < HTML.length; i++) {
    if (HTML[i] === '{') depth++;
    else if (HTML[i] === '}') { depth--; if (depth === 0) return HTML.slice(start, i + 1); }
  }
  throw new Error('nezatvorena funkcija ' + name);
}
let pass = 0, fail = 0;
function t(name, fn) {
  try { fn(); console.log('  ✔ ' + name); pass++; }
  catch (e) { fail++; console.log('  ✘ ' + name + '\n      ' + e.message); }
}
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

console.log('Sekcija Projekat:');

t('switchTab: svaki panel koji sakriva kartu spušta _mapFullScreen PRIJE msrStop (nišan preko panela)', () => {
  const sw = extractFn('switchTab');
  const grane = [...sw.matchAll(/\} else if \(tab==='(\w+)'\) \{([\s\S]*?)(?=\n  \} else if|\n  \}\n)/g)];
  assert.ok(grane.length >= 5, 'grane nisu nađene');
  grane.forEach(([, tab, tijelo]) => {
    if (!/_setMapUIVisible\(false, false\)/.test(tijelo) || !/msrStop\(true\)/.test(tijelo)) return;
    const iF = tijelo.indexOf('_mapFullScreen = false'), iM = tijelo.indexOf('msrStop(true)');
    assert.ok(iF >= 0 && iF < iM, `grana '${tab}' ne spušta _mapFullScreen prije msrStop`);
  });
});

t('kartica projekta escape-uje odjel i GJ (podaci dolaze sa servera, od kolega)', () => {
  const fn = new Function('_sortByGjDatum', 'isReadOnly', '_aktivniProjektId', 'vlake', '_ukupnoVlakeM', 'fmtL', 'fmtDate', 'fmtHa', '_escHtml',
    extractFn('_renderProjGroup') + '\nreturn _renderProjGroup;');
  const r = fn(a => a, () => false, null, [], () => 0, m => m + ' m', d => d, h => h + ' ha', esc);
  const h = r([{ id: 'x', odjel: '<img src=x>', gj: '<b>GJ</b>', clanovi: [] }]);
  assert.ok(!h.includes('<img') && !h.includes('<b>GJ'));
});

t('Rekap čita zapis projekta, ne skriveno DOM polje (datum/odjel/broj projektanata)', () => {
  const f = extractFn('updProjStats');
  assert.ok(/aktP && aktP\.datum/.test(f) && /aktP && aktP\.odjel/.test(f));
  assert.ok(/1 \+ \(aktP\.clanovi \|\| \[\]\)\.length/.test(f));
});

t('getIme: bez p-ime polja koristi keširani profil umjesto "Nepoznat"', () => {
  const g = new Function('document', 'sbProfile', extractFn('getIme') + '\nreturn getIme();');
  assert.strictEqual(g({ getElementById: () => ({ value: '' }) }, { ime: 'Amar', prezime: 'H.' }), 'Amar H.');
  assert.strictEqual(g({ getElementById: () => ({ value: '' }) }, null), 'Nepoznat');
  assert.strictEqual(g({ getElementById: () => ({ value: ' Belma ' }) }, { ime: 'X' }), 'Belma');
});

t('Rekap/Terenske/STD se sakriju u detalju NEAKTIVNOG projekta i vrate na listu', () => {
  assert.strictEqual((HTML.match(/class="sec proj-akt-only"/g) || []).length, 3);
  assert.ok(/_projAktSekcije\(isAkt\)/.test(extractFn('showProjektDetalji')));
  assert.ok(/_projAktSekcije\(true\)/.test(extractFn('showProjektiList')));
});

console.log('\n' + pass + ' prošlo, ' + fail + ' palo');
process.exit(fail ? 1 : 0);
