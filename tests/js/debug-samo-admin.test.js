// =====================================================================
// Debug prikaz samo za admina (v1.8.4).
// Pokretanje:  node tests/js/debug-samo-admin.test.js
// ---------------------------------------------------------------------
// Na zahtjev: "obriši debug kod korisnika, ostavi debug samo kod admina".
// Običan korisnik je vidio tehničke zapise na ekranu "Učitaj kartu"
// ("🔬 Debug učitavanja pri ulazu") i u statusnoj liniji offline karata
// ("[ps=4096 tr=2 …]", "[worker]", "⏱ Zadnje učitavanje trajalo …").
// Dijagnostika se i dalje BILJEŽI (_mapLoadDiag / _debugUpsert) — mijenja se
// samo ko je vidi.
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

let pass = 0, fail = 0;
function t(name, fn) {
  try { fn(); console.log('  ✔ ' + name); pass++; }
  catch (e) { fail++; console.log('  ✘ ' + name + '\n      ' + e.message); }
}
console.log('Debug samo za admina:');

function renderDiag(admin) {
  const el = { innerHTML: '', classList: { v: null, toggle(k, on) { this.v = on; } } };
  new Function('el', 'admin', `
    const document = { getElementById: id => id === 'loadmap-startup-debug' ? el : null };
    const isAdmin = () => admin;
    const _mapLoadDiagText = () => 'Karta: X\\n+10 ms korak';
    const _escHtml = s => s;
    ${extractFn('_loadmapRenderStartupDiag')}
    _loadmapRenderStartupDiag();`)(el, admin);
  return el;
}

t('"Debug učitavanja pri ulazu" na ekranu Učitaj kartu vidi samo admin', () => {
  const k = renderDiag(false);
  assert.strictEqual(k.innerHTML, '');
  assert.strictEqual(k.classList.v, false);
  const a = renderDiag(true);
  assert.ok(/Debug učitavanja/.test(a.innerHTML) && a.classList.v === true);
});

t('tehnički zapis čitača, oznaka motora i raščlana vremena idu samo adminu', () => {
  const load = extractFn('sqlmapLoadFile');
  assert.ok(/r\.meta\?\._d && isAdmin\(\)/.test(load), '[ps=… tr=…] mora biti iza isAdmin()');
  assert.ok(/isAdmin\(\) \? ' \[' \+ eng \+ '\]' : ''/.test(extractFn('_sqlmapLoadDirect')), '[worker]/[main] samo adminu');
  assert.ok(/if \(isAdmin\(\)\) _sqlmapStatus\('⏱ Zadnje učitavanje/.test(extractFn('sqlmapRestoreAll')));
});

t('DEBUG tab i stavka menija su i dalje samo za admina', () => {
  assert.ok(/if \(tab === 'debug' && !sbProfile\?\.is_admin\) return;/.test(HTML));
  assert.ok(/id="menu-debug-item" style="display:none;[^"]*"[^>]*if\(sbProfile\?\.is_admin\)switchTab\('debug'\)/.test(HTML));
});

console.log(`\n${pass} prošlo, ${fail} palo`);
process.exit(fail ? 1 : 0);
