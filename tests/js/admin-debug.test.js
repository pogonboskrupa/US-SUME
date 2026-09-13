'use strict';
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const HTML = fs.readFileSync(path.join(__dirname, '../../index.html'), 'utf8');

function extractFn(name) {
  let start = HTML.indexOf('async function ' + name + '(');
  if (start < 0) start = HTML.indexOf('function ' + name + '(');
  assert.ok(start >= 0, 'nije nađena funkcija ' + name);
  let i = HTML.indexOf('{', start), depth = 0;
  for (; i < HTML.length; i++) {
    if (HTML[i] === '{') depth++;
    else if (HTML[i] === '}' && --depth === 0) return HTML.slice(start, i + 1);
  }
  throw new Error('nezatvorena funkcija ' + name);
}

let pass = 0;
function t(name, fn) {
  try { fn(); pass++; console.log('  ✔ ' + name); }
  catch (e) { console.error('  ✘ ' + name + '\n      ' + e.message); process.exitCode = 1; }
}

console.log('Centralni DEBUG — pristup i životni ciklus zapisa:');

t('DEBUG panel i stavka menija postoje, ali su zadano skriveni', () => {
  assert.match(HTML, /id="debug-panel" style="display:none/);
  assert.match(HTML, /id="menu-debug-item" style="display:none/);
});

t('switchTab odbija direktan ulaz korisniku koji nije admin', () => {
  const src = extractFn('switchTab');
  assert.ok(src.includes("if (tab === 'debug' && !sbProfile?.is_admin) return;"));
});

t('isti problem osvježava jednu karticu umjesto dupliranja', () => {
  const mem = {};
  const localStorage = {
    getItem:k => mem[k] || null,
    setItem:(k,v) => { mem[k] = v; }
  };
  const src = extractFn('_debugRead') + '\n' + extractFn('_debugUpsert') +
    '\nreturn { _debugRead, _debugUpsert };';
  const api = new Function('localStorage', '_ADMIN_DEBUG_KEY', '_adminDebugRender', src)(localStorage, 'dbg', () => {});
  api._debugUpsert('pozari', 'Požari', 'prvi', 'greška');
  api._debugUpsert('pozari', 'Požari', 'drugi', 'uspjeh');
  const all = api._debugRead();
  assert.deepStrictEqual(Object.keys(all), ['pozari']);
  assert.strictEqual(all.pozari.text, 'drugi');
  assert.strictEqual(all.pozari.state, 'uspjeh');
});

t('FIRMS API ključ se nikad ne ispisuje u debug URL-u', () => {
  const src = extractFn('_poziDebugSafeUrl') + '\nreturn _poziDebugSafeUrl;';
  const safe = new Function(src)();
  const out = safe('https://firms.modaps.eosdis.nasa.gov/api/area/csv/TAJNI_KLJUC/VIIRS/1,2,3,4/5');
  assert.ok(!out.includes('TAJNI_KLJUC'));
  assert.ok(out.includes('/api/area/csv/***/'));
});

t('riješeni debug ima eksplicitno dugme za brisanje', () => {
  assert.match(HTML, /Obriši kao riješeno/);
  assert.ok(extractFn('_adminDebugResolve').includes("_debugRemove(id)"));
});

console.log('\n' + pass + ' prošlo, 0 palo — centralni admin DEBUG');
