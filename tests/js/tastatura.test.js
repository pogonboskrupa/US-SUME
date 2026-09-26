// =====================================================================
// Tastatura prekriva donje listove (v1.7.3).
// Pokretanje:  node tests/js/tastatura.test.js
// ---------------------------------------------------------------------
// MainActivity radi edge-to-edge (setDecorFitsSystemWindows(false)) i
// immersive fullscreen — uz to Android IGNORIŠE adjustResize, pa WebView
// ostaje pune visine a list "Snimi vlaku" (i svaki drugi prikačen za dno)
// završi ispod tastature. Popravka je IME inset u Javi + interactive-widget
// u viewport meta + pomjeranje fokusiranog polja u vidljivo.
// =====================================================================
'use strict';
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const HTML = fs.readFileSync(path.join(__dirname, '../../index.html'), 'utf8');
const JAVA = fs.readFileSync(path.join(__dirname,
  '../../android/app/src/main/java/ba/spd/uss/vlake/MainActivity.java'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');   // komentari objašnjavaju staro stanje

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

const api = new Function(['_tastaturaJeUnos', '_tastaturaPoljeVidljivo', '_tastaturaDoPolja'].map(extractFn).join('\n') +
  '\nreturn { _tastaturaJeUnos, _tastaturaPoljeVidljivo, _tastaturaDoPolja };')();
const inp = (type, rect) => ({ tagName: 'INPUT', type, getBoundingClientRect: () => rect || { top: 0, bottom: 10 } });

console.log('Tastatura:');

t('APK: WebView je u omotaču koji se podiže za IME inset (adjustResize ne radi uz edge-to-edge)', () => {
  assert.ok(/WindowInsetsCompat\.Type\.ime\(\)/.test(JAVA), 'nema čitanja IME inseta');
  assert.ok(/setContentView\(root\)/.test(JAVA) && !/setContentView\(webView\)/.test(JAVA), 'WebView mora biti u omotaču');
  assert.ok(/primijeniTastaturu\(root\)/.test(JAVA));
});

t('webapp: viewport meta traži smanjenje sadržaja (interactive-widget=resizes-content)', () => {
  assert.ok(/name="viewport"[^>]*interactive-widget=resizes-content/.test(HTML));
});

t('tekstualna polja su unos, checkbox/range/dugme nisu', () => {
  assert.ok(api._tastaturaJeUnos(inp('text')) && api._tastaturaJeUnos(inp('number')) && api._tastaturaJeUnos(inp('search')));
  assert.ok(api._tastaturaJeUnos({ tagName: 'TEXTAREA' }));
  assert.ok(!api._tastaturaJeUnos(inp('checkbox')) && !api._tastaturaJeUnos(inp('range')) && !api._tastaturaJeUnos({ tagName: 'DIV' }));
  assert.ok(!api._tastaturaJeUnos(null));
});

t('polje ispod ruba smanjenog prikaza se pomjeri u vidljivo, vidljivo se ne dira', () => {
  global.window = { innerHeight: 400 };
  let pozvano = 0;
  const ispod = Object.assign(inp('text', { top: 520, bottom: 556 }), { scrollIntoView: () => { pozvano++; } });
  global.document = { activeElement: ispod };
  api._tastaturaDoPolja();
  assert.strictEqual(pozvano, 1);
  const vidljivo = Object.assign(inp('text', { top: 200, bottom: 236 }), { scrollIntoView: () => { pozvano++; } });
  global.document = { activeElement: vidljivo };
  api._tastaturaDoPolja();
  assert.strictEqual(pozvano, 1, 'vidljivo polje ne smije skakati');
});

console.log('\n' + pass + ' prošlo, ' + fail + ' palo');
process.exit(fail ? 1 : 0);
