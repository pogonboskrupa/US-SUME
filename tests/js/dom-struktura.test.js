// =====================================================================
// Testovi strukture markupa (v1.6.7).
// Pokretanje:  node tests/js/dom-struktura.test.js
// ---------------------------------------------------------------------
// U v3.103.1 je iz panela Podloge karte (#layer-sheet) nestao JEDAN </div>
// (zatvaranje #ls-pane-inst). Browser to ne prijavljuje — sve što slijedi u
// markupu tiho postane dijete skrivenog #layer-sheet-a: svi _dlg dijalozi
// (potvrde, unos naziva, brisanje), 📁 panel oznaka, red za sync, dijeljenje
// i pregled fotografija. Dok panel podloga nije otvoren, ništa od toga se ne
// može prikazati — na terenu je to izgledalo kao "📁 i ✏ Nacrtaj vlaku ručno
// ne reaguju". Ovi testovi hvataju svaki takav nezatvoren/višak div.
// =====================================================================
'use strict';
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const HTML = fs.readFileSync(path.join(__dirname, '../../index.html'), 'utf8');

let pass = 0, fail = 0;
function t(name, fn) {
  try { fn(); console.log('  ✔ ' + name); pass++; }
  catch (e) { fail++; console.log('  ✘ ' + name + '\n      ' + e.message); }
}

// Pravi <body> tag (ne pojava riječi "<body" u CSS/JS komentaru iznad njega).
function bodyMarkup(html) {
  const m = /<\/head>\s*<body[^>]*>/i.exec(html);
  assert.ok(m, 'nije nađen </head><body>');
  return html.slice(m.index + m[0].length)
    .replace(/<script\b[\s\S]*?<\/script>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '');
}
const saldo = s => (s.match(/<div\b/g) || []).length - (s.match(/<\/div>/g) || []).length;

console.log('Markup <body> (bez JS blokova i komentara):');

t('broj otvorenih i zatvorenih <div> je jednak', () => {
  assert.strictEqual(saldo(bodyMarkup(HTML)), 0);
});

t('#layer-sheet je zatvoren prije dijaloga i panela koji slijede', () => {
  const b = bodyMarkup(HTML);
  const i = b.indexOf('<div id="layer-sheet"');
  const j = b.indexOf('id="dlg-sheet"');
  assert.ok(i >= 0 && j > i, 'redoslijed elemenata se promijenio');
  // Od početka #layer-sheet do #dlg-sheet svi divovi moraju biti zatvoreni.
  const seg = b.slice(i, b.lastIndexOf('<', j));
  assert.strictEqual(saldo(seg), 0, 'nešto iza #layer-sheet je upalo u njega');
});

t('svaki tab panela podloga (#ls-pane-*) je zatvoren prije sljedećeg', () => {
  const b = bodyMarkup(HTML);
  const ids = [...b.matchAll(/<div id="(ls-pane-[a-z]+)"/g)].map(m => m[1]);
  assert.ok(ids.length >= 3, 'očekivana bar 3 taba, nađeno ' + ids.length);
  for (let k = 0; k < ids.length - 1; k++) {
    const a = b.indexOf('<div id="' + ids[k] + '"');
    const z = b.indexOf('<div id="' + ids[k + 1] + '"');
    assert.strictEqual(saldo(b.slice(a, z)), 0, ids[k] + ' nije zatvoren prije ' + ids[k + 1]);
  }
});

console.log('\n' + pass + ' prošlo, ' + fail + ' palo');
process.exit(fail ? 1 : 0);
