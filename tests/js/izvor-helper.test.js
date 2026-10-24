// tests/js/_izvor.js — zajednički logički izvor za testove (izdvajanje inline JS-a).
// Čuva dvije stvari: (1) rekonstrukcija markera je tačna i glasno pada kad fajl
// fali; (2) svaki izdvojeni fajl je stvarno isporučen — u sw.js APP_SHELL (inače
// prvo offline pokretanje webapp-a nema taj kod), u assets-manifest required
// (APK build pada umjesto da tiho ispadne) i učitan iz index.html.
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { izvor, izvorIz, izdvojeni, ROOT } = require('./_izvor');

let ok = 0;
function t(ime, fn) { fn(); ok++; console.log('  ✓ ' + ime); }

console.log('_izvor helper:');

t('bez markera izvor je doslovno index.html; sa markerima nema ostataka markera', () => {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  if (!izdvojeni().length) assert.strictEqual(izvor(), html);
  assert.ok(!/@izdvojeno static\//.test(izvor()), 'marker ostao u rekonstrukciji');
});

t('marker se zamjenjuje sadržajem fajla bez zaglavlja i završnog preloma', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'izvor-'));
  fs.mkdirSync(path.join(dir, 'static/js/app'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'static/js/app/a.js'), '// @izdvojeno-iz index.html (test)\nfunction a() {}\nfunction b() {}\n');
  fs.writeFileSync(path.join(dir, 'index.html'), '<script>\nx();\n/* @izdvojeno static/js/app/a.js */\ny();\n</script>');
  assert.strictEqual(izvorIz(dir), '<script>\nx();\nfunction a() {}\nfunction b() {}\ny();\n</script>');
  fs.rmSync(dir, { recursive: true, force: true });
});

t('marker na nepostojeći fajl ili fajl bez zaglavlja glasno pada', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'izvor-'));
  fs.writeFileSync(path.join(dir, 'index.html'), '/* @izdvojeno static/js/app/nema.js */');
  assert.throws(() => izvorIz(dir), /nepostojeći/);
  fs.mkdirSync(path.join(dir, 'static/js/app'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'static/js/app/nema.js'), 'function a() {}\n');
  assert.throws(() => izvorIz(dir), /zaglavlje/);
  fs.rmSync(dir, { recursive: true, force: true });
});

t('svaki izdvojeni fajl je u sw.js APP_SHELL, assets-manifest required i učitan iz index.html', () => {
  const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
  const shell = sw.slice(sw.indexOf('const APP_SHELL'), sw.indexOf('];', sw.indexOf('const APP_SHELL')));
  const req = JSON.parse(fs.readFileSync(path.join(ROOT, 'android/assets-manifest.json'), 'utf8')).required;
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  for (const rel of izdvojeni()) {
    assert.ok(shell.includes("'./" + rel + "'"), rel + ' nije u sw.js APP_SHELL');
    assert.ok(req.includes(rel), rel + ' nije u assets-manifest required');
    assert.ok(new RegExp('<script[^>]+src="' + rel.replace(/[.]/g, '\\.') + '"').test(html) || html.includes("'" + rel + "'"),
      rel + ' se ne učitava iz index.html');
  }
});

console.log('\n' + ok + ' testova prošlo');
