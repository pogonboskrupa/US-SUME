// Logički izvor aplikacije za testove: index.html u kojem je svaki marker
// `/* @izdvojeno static/js/app/X.js */` zamijenjen sadržajem tog fajla.
//
// Zašto: testovi izvlače funkcije TEKSTUALNO iz index.html (indexOf/brace
// matching, rezanje između dvije funkcije). Kad se dio glavnog inline bloka
// izdvoji u vanjski fajl, marker ostaje TAČNO na mjestu izrezanog koda, pa je
// rekonstruisani izvor bajt-identičan onome prije izdvajanja i nijedan test ne
// mora znati gdje kod fizički živi.
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '../..');
const MARKER = /\/\* @izdvojeno (static\/js\/[\w./-]+\.js) \*\//g;

// Izdvojeni fajl nosi zaglavlje (komentar) i završni prelom radi čitljivosti;
// pri vraćanju se skida tačno ono što je izdvajanje dodalo, ništa više.
const ZAGLAVLJE = /^\/\/ @izdvojeno-iz index\.html[^\n]*\n/;

function izdvojeniFajl(rel, root = ROOT) {
  const f = path.join(root, rel);
  if (!fs.existsSync(f)) throw new Error('Marker @izdvojeno pokazuje na nepostojeći fajl: ' + rel);
  let s = fs.readFileSync(f, 'utf8');
  if (!ZAGLAVLJE.test(s)) throw new Error('Izdvojeni fajl nema zaglavlje "// @izdvojeno-iz index.html": ' + rel);
  s = s.replace(ZAGLAVLJE, '');
  if (s.endsWith('\n')) s = s.slice(0, -1);
  return s;
}

// Isti postupak nad drugim korijenom (npr. raspakovani APK assets — FIELD_APP_ROOT).
function izvorIz(root) {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  return html.replace(MARKER, (_, rel) => izdvojeniFajl(rel, root));
}

let _kes = null;
function izvor() {
  if (_kes === null) _kes = izvorIz(ROOT);
  return _kes;
}

// Spisak izdvojenih fajlova po redoslijedu markera (za provjere sw.js/manifest).
function izdvojeni() {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  return [...html.matchAll(MARKER)].map(m => m[1]);
}

module.exports = { izvor, izvorIz, izdvojeni, ROOT };
