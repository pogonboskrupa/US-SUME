// Analiza sigurnosti izdvajanja dijela glavnog inline bloka u `defer` skriptu.
// Upotreba: node tests/perf/split-analiza.cjs <prvaLinija> <zadnjaLinija>   (linije index.html)
//
// Defer skripta se izvršava POSLIJE cijelog parsiranja, a prije DOMContentLoaded.
// Opasno je zato samo ono što glavni blok (i kasniji sinhroni skripti) koristi
// SINHRONO tokom parsiranja: top-level naredbe i funkcije koje one tranzitivno
// pozovu. Callback-ovi (setTimeout, addEventListener, then, ...) se izvršavaju
// kasnije; povratni pozivi nizovnih metoda (forEach/map/...) se računaju kao
// sinhroni. `_startupRestore` čeka DOMContentLoaded pa je rez u grafu poziva.
// Ovo je NADPROCJENA (konzervativno); dinamička provjera u browseru je obavezna.
const fs = require('node:fs');
const path = require('node:path');
const acorn = require(fs.existsSync('/opt/node-tools/node_modules/acorn') ? '/opt/node-tools/node_modules/acorn' : 'acorn');
const walk = require(fs.existsSync('/opt/node-tools/node_modules/acorn-walk') ? '/opt/node-tools/node_modules/acorn-walk' : 'acorn-walk');

const ROOT = path.resolve(__dirname, '../..');
const [A, B] = process.argv.slice(2).map(Number);
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const lines = html.split('\n');

// Glavni blok = najveći inline <script>.
let best = null;
for (const m of html.matchAll(/<script>([\s\S]*?)<\/script>/g)) if (!best || m[1].length > best[1].length) best = m;
const blokStart = html.slice(0, best.index + '<script>'.length).split('\n').length; // linija gdje počinje tekst bloka
const kod = best[1];
const ast = acorn.parse(kod, { ecmaVersion: 'latest', sourceType: 'script', locations: true, allowHashBang: true });
const lin = n => n.loc.start.line + blokStart - 1;
const linEnd = n => n.loc.end.line + blokStart - 1;
const uDijelu = n => lin(n) >= A && linEnd(n) <= B;

const ARR = new Set(['forEach', 'map', 'filter', 'some', 'every', 'reduce', 'reduceRight', 'find', 'findIndex', 'findLast', 'flatMap', 'sort']);
const CUT = new Set(['_startupRestore']);

// Top-level deklaracije i podjela na dio / ostatak.
const decl = new Map(); // ime -> {node, uDijelu, fn}
const neFunkcije = [];
for (const st of ast.body) {
  const u = uDijelu(st);
  if (!u && lin(st) <= B && linEnd(st) >= A) { console.log('GREŠKA: naredba presijeca granicu dijela', lin(st), '-', linEnd(st)); process.exit(2); }
  const imena = [];
  if (st.type === 'FunctionDeclaration' || st.type === 'ClassDeclaration') imena.push(st.id.name);
  if (st.type === 'VariableDeclaration') for (const d of st.declarations) walk.simple(d.id, { Identifier(n) { imena.push(n.name); } });
  for (const i of imena) decl.set(i, { node: st, uDijelu: u, fn: st.type === 'FunctionDeclaration' });
  if (u && st.type !== 'FunctionDeclaration') neFunkcije.push(st);
}
const dio = new Set([...decl].filter(([, v]) => v.uDijelu).map(([k]) => k));

// Sinhroni dosezi iz jednog tijela: identifikatori koje koristi, bez ugniježđenih
// funkcija osim IIFE-a i povratnih poziva nizovnih metoda.
function sinhroneReference(tijelo) {
  const refs = new Set();
  const posjeti = (node, inline) => {
    if (!node || typeof node.type !== 'string') return;
    if (!inline && (node.type === 'FunctionExpression' || node.type === 'ArrowFunctionExpression' || node.type === 'FunctionDeclaration')) return;
    if (node.type === 'Identifier') refs.add(node.name);
    if (node.type === 'MemberExpression' && !node.computed) { posjeti(node.object, false); return; }
    if (node.type === 'Property' && !node.computed && !node.shorthand) { posjeti(node.value, false); return; }
    for (const k in node) {
      if (k === 'loc' || k === 'start' || k === 'end') continue;
      const v = node[k];
      const djeca = Array.isArray(v) ? v : [v];
      for (const c of djeca) {
        if (!c || typeof c.type !== 'string') continue;
        let inl = false;
        if (node.type === 'CallExpression' && k === 'callee') inl = true; // IIFE
        if (node.type === 'CallExpression' && k === 'arguments' && node.callee.type === 'MemberExpression' && ARR.has(node.callee.property.name)) inl = true;
        if (inl && (c.type === 'FunctionExpression' || c.type === 'ArrowFunctionExpression')) { posjeti(c.body, false); for (const p of c.params) posjeti(p, false); continue; }
        posjeti(c, false);
      }
    }
  };
  posjeti(tijelo, false);
  return refs;
}

// Funkcije dosežne sinhrono iz top-levela VAN dijela (dio se izvršava kasnije).
const rizici = [];
const dosezno = new Map(); // ime funkcije -> put
const red = [];
for (const st of ast.body) {
  if (uDijelu(st) || st.type === 'FunctionDeclaration') continue;
  for (const r of sinhroneReference(st)) {
    if (dio.has(r)) rizici.push('top-level L' + lin(st) + ' → ' + r);
    const d = decl.get(r);
    if (d && d.fn && !d.uDijelu && !CUT.has(r) && !dosezno.has(r)) { dosezno.set(r, 'L' + lin(st)); red.push(r); }
  }
}
while (red.length) {
  const f = red.shift(); const d = decl.get(f);
  for (const r of sinhroneReference(d.node.body)) {
    if (dio.has(r)) rizici.push(f + ' (' + dosezno.get(f) + ') → ' + r);
    const dd = decl.get(r);
    if (dd && dd.fn && !dd.uDijelu && !CUT.has(r) && !dosezno.has(r)) { dosezno.set(r, dosezno.get(f) + '>' + f); red.push(r); }
  }
}

// Sinhroni skripti POSLIJE glavnog bloka (static/js/*.js bez defer) koji koriste imena iz dijela na top-levelu.
const poslije = html.slice(best.index + best[0].length);
const kasniji = [...poslije.matchAll(/<script\s+src="([^"]+)"(?![^>]*\b(?:defer|async)\b)[^>]*><\/script>/g)].map(m => m[1]);
const kasnijiRizik = [];
for (const src of kasniji) {
  const f = path.join(ROOT, src); if (!fs.existsSync(f)) continue;
  let a2; try { a2 = acorn.parse(fs.readFileSync(f, 'utf8'), { ecmaVersion: 'latest', sourceType: 'script' }); } catch { continue; }
  for (const st of a2.body) for (const r of sinhroneReference(st)) if (dio.has(r)) kasnijiRizik.push(src + ' → ' + r);
}

const KB = Math.round(lines.slice(A - 1, B).join('\n').length / 1024);
console.log(`Dio L${A}-${B}: ${KB} KB, ${dio.size} top-level imena, ${neFunkcije.length} naredbi koje nisu deklaracija funkcije`);
for (const st of neFunkcije) console.log('  ne-funkcija L' + lin(st) + ': ' + lines[lin(st) - 1].trim().slice(0, 110));
console.log('Sinhrono dosežnih funkcija van dijela: ' + dosezno.size);
console.log(rizici.length ? 'RIZICI (sinhroni put tokom parsiranja koristi dio):\n  ' + [...new Set(rizici)].join('\n  ') : 'Nema sinhronog puta tokom parsiranja koji koristi dio.');
console.log(kasnijiRizik.length ? 'RIZICI u kasnijim sinhronim skriptama:\n  ' + kasnijiRizik.join('\n  ') : 'Kasniji sinhroni skripti ne koriste dio na top-levelu.');
if (rizici.length || kasnijiRizik.length) process.exitCode = 1;
