// =====================================================================
// Panel Doznaka (v1.7.4).
// Pokretanje:  node tests/js/doznaka-panel.test.js
// ---------------------------------------------------------------------
// - Ime odjela (upisuje ga korisnik) je išlo u listu bez escape-a — HTML u
//   imenu se izvršavao/iscrtavao.
// - Detail odjela je čekao mrežu prije prikaza keša: na mrtvoj vezi do 15 s
//   prazne statistike i "Nema članova" (offline-first pravilo projekta).
// Testira se STVARNI kod izvučen iz index.html.
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
const cekaj = [];
function t(name, fn) {
  cekaj.push(Promise.resolve().then(fn).then(
    () => { console.log('  ✔ ' + name); pass++; },
    e => { fail++; console.log('  ✘ ' + name + '\n      ' + e.message); }));
}

const escHtml = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function listaEnv(odjeli) {
  const els = { 'doz-odjeli-list': { innerHTML: '' }, 'doz-odjeli-sazetak': { innerHTML: '' } };
  const fn = new Function('document', '_dozOdjeli', '_getDozHiddenIds', '_dozSelId', '_escHtml', 'fmtHa', 'fmtDateShort',
    extractFn('dozRenderOdjeli') + '\ndozRenderOdjeli();');
  fn({ getElementById: id => els[id] }, odjeli, () => new Set(), null, escHtml, h => (+h).toFixed(2) + ' ha', d => String(d).slice(0, 10));
  return els;
}

console.log('Panel Doznaka:');

t('ime odjela se escape-uje u listi (HTML iz imena se ne iscrtava)', () => {
  const els = listaEnv([{ id: 'o1', name: 'Odjel <img src=x onerror=alert(1)>', status: 'active' }]);
  const h = els['doz-odjeli-list'].innerHTML;
  assert.ok(!h.includes('<img'), 'sirov HTML iz imena je u listi');
  assert.ok(h.includes('&lt;img'));
});

t('aktivni odjeli su prvi, a _dozOdjeli redoslijed (boja granice) se ne dira', () => {
  const odjeli = [
    { id: 'z', name: 'Zavrseni', status: 'completed' },
    { id: 'p', name: 'Pauza', status: 'paused' },
    { id: 'a', name: 'Aktivni', status: 'active' }];
  const h = listaEnv(odjeli)['doz-odjeli-list'].innerHTML;
  assert.ok(h.indexOf('Aktivni') < h.indexOf('Pauza') && h.indexOf('Pauza') < h.indexOf('Zavrseni'));
  assert.deepStrictEqual(odjeli.map(o => o.id), ['z', 'p', 'a']);
});

t('sažetak broji odjele po statusu', () => {
  const s = listaEnv([{ id: 'a', name: 'A', status: 'active', known_area_ha: 10 }, { id: 'b', name: 'B', status: 'active', known_area_ha: 5 }, { id: 'c', name: 'C', status: 'completed' }])['doz-odjeli-sazetak'].innerHTML;
  assert.ok(/<b>3<\/b> odjela/.test(s) && /2 aktivno/.test(s) && /1 završeno/.test(s) && /15\.00 ha/.test(s));
});

t('otvaranje odjela: keš se prikaže PRIJE nego mreža odgovori', async () => {
  const log = [];
  let pustiMrezu;
  const mreza = new Promise(r => { pustiMrezu = r; });
  const q = () => { const o = { select: () => o, eq: () => o, order: () => o, in: () => o, then: (res, rej) => mreza.then(res, rej) }; return o; };
  const st = { members: null, markings: null, gen: 0 };
  const src = extractFn('dozLoadLayers');
  const fn = new Function('sb', '_dozLoadCachedLayers', '_dozCacheLayers', 'dozRenderMapLayers', 'dozRenderDetail', 'showToast', 'console', 'S',
    'let _dozMembers, _dozMarkings, _dozTracks, _dozLoadGen = 0;\n' + src +
    '\nreturn { run: (id, o) => dozLoadLayers(id, o), get: () => ({ _dozMembers, _dozMarkings, _dozTracks }) };');
  const api = fn({ from: q },
    () => ({ members: [{ user_id: 'u1' }], markings: [{ id: 'm1' }], tracks: [] }),
    () => {}, () => log.push('mapa'), () => log.push('detalj:' + api.get()._dozMarkings.length), () => {}, { error() {} }, st);
  const p = api.run('o1', { odmahIzKesa: true });
  await new Promise(r => setTimeout(r, 10));
  assert.deepStrictEqual(log, ['mapa', 'detalj:1'], 'keš nije prikazan dok mreža visi');
  pustiMrezu({ data: [] });
  await p;
});

t('mrežna greška poslije keša ne briše već prikazane podatke', async () => {
  const q = () => { const o = { select: () => o, eq: () => o, order: () => o, in: () => o, then: (res, rej) => Promise.reject(new Error('mreza')).then(res, rej) }; return o; };
  let poziv = 0;
  const fn = new Function('sb', '_dozLoadCachedLayers', '_dozCacheLayers', 'dozRenderMapLayers', 'dozRenderDetail', 'showToast', 'console',
    'let _dozMembers, _dozMarkings, _dozTracks, _dozLoadGen = 0;\n' + extractFn('dozLoadLayers') +
    '\nreturn { run: (id, o) => dozLoadLayers(id, o), get: () => ({ _dozMembers, _dozMarkings }) };');
  const api = fn({ from: q }, () => (poziv++ === 0 ? { members: [1, 2], markings: [3], tracks: [] } : null),
    () => {}, () => {}, () => {}, () => {}, { error() {} });
  await api.run('o1', { odmahIzKesa: true });
  assert.strictEqual(api.get()._dozMembers.length, 2);
});

Promise.all(cekaj).then(() => {
  console.log('\n' + pass + ' prošlo, ' + fail + ' palo');
  process.exit(fail ? 1 : 0);
});
