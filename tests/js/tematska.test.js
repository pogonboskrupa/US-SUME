// =====================================================================
// Tematska karta (.gpkg) — v1.8.5: pregled teme, kategorijske teme,
// palete/automatske klase, površina iz geometrije, legenda.
// Pokretanje:  node tests/js/tematska.test.js
// Test pušta STVARNE funkcije izvučene iz index.html, a .gpkg fixture
// (tests/fixtures/tematska-mini.gpkg, 30 odsjeka) čita STVARNI MiniSqlite.
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
  const start = HTML.indexOf('const ' + name + ' ');
  if (start < 0) throw new Error('nije nađena konstanta ' + name);
  let depth = 0;
  for (let i = start; i < HTML.length; i++) {
    const c = HTML[i];
    if (c === '{' || c === '[' || c === '(') depth++;
    else if (c === '}' || c === ']' || c === ')') depth--;
    else if (c === ';' && depth === 0) return HTML.slice(start, i + 1);
  }
  throw new Error('nezatvorena konstanta ' + name);
}

// MiniSqlite iz worker izvora (template string evaluiran kao vrijednost — v1.8.3)
const POC = 'const _SQL_WORKER_SRC = `';
const a0 = HTML.indexOf(POC) + POC.length;
let j0 = a0;
for (;;) { j0 = HTML.indexOf('`', j0); if (HTML[j0 - 1] !== '\\') break; j0++; }
const SRC = new Function('_SQLJS_CDN', '_SQLJS_LOCAL', 'return `' + HTML.slice(a0, j0) + '`;')('cdn/', 'local/');
const MiniSqlite = new Function(SRC.slice(SRC.indexOf('class MiniSqlite {'), SRC.indexOf('// ── Kraj MiniSqlite')) + '\nreturn MiniSqlite;')();

const KONST = ['_TEM_REG_KEY', '_TEM_RAMP', '_TEM_PALETE', '_TEM_KAT_BOJE', '_TEM_KAT_MAX', '_TEM_LEG_KEY', '_TEM_MAX_CLASSES'];
const FUNK = ['_temRampFor', '_temKatBoje', '_temNum', '_temBr', '_temHa', '_temPrstenM2', '_temPovrsinaHa',
  '_temKlasaIdx', '_temBojaZa', '_temKlaseOpis', '_temJednakiIntervali', '_temStatistika', '_temDraftIz',
  '_temRegSave', '_temById', '_temColLabel', '_parseGpkgGeom', '_temResolveTr', '_gpkgParseBuf', '_temPopupHtml',
  '_temQuantiles', '_temApplyTheme', '_temOboji', '_temSetOpacity', '_temLegSkupljena', '_temLegToggle',
  '_temLegendUpd', '_temFmtVal', '_temPregledHtml', '_temClassEdHtml', '_temEdPovuci', '_temEdScrapeDom',
  '_temEdPaleta', '_temEdObrni', '_temEdAuto', '_temClassEdApply', '_temClassEdReset', '_escHtml', '_jsAttr'];

function napravi() {
  const ls = {}, toasti = [], el = {};
  const mkEl = id => ({ id, innerHTML: '', className: '', value: '', style: {},
    classList: { _s: new Set(), toggle(c, on) { on ? this._s.add(c) : this._s.delete(c); }, contains(c) { return this._s.has(c); } },
    appendChild(ch) { el[ch.id] = ch; }, remove() { delete el[this.id]; } });
  el.map = mkEl('map');
  const document = { getElementById: id => el[id] || null, createElement: () => mkEl('') };
  const localStorage = { getItem: k => (k in ls ? ls[k] : null), setItem: (k, v) => { ls[k] = String(v); }, removeItem: k => { delete ls[k]; } };
  const L = {
    canvas: () => ({}),
    layerGroup: () => ({ layers: [], addLayer(p) { this.layers.push(p); }, addTo() { return this; } }),
    polygon: (rings, opts) => ({ style: { ...opts },
      setStyle(st) { Object.assign(this.style, st); }, bindPopup(fn) { this._pop = fn; },
      getLatLngs: () => rings.map(r => r.map(([lat, lng]) => ({ lat, lng }))),
      getBounds: () => ({ isValid: () => false }) }),
    latLngBounds: () => ({ isValid: () => false, extend() { return this; } }),
    DomEvent: { disableClickPropagation() {}, disableScrollPropagation() {} }
  };
  class FakeFile { constructor(parts) { const b = Buffer.from(parts[0]); this.size = b.length;
    this.slice = (x, y) => ({ arrayBuffer: async () => b.buffer.slice(b.byteOffset + x, b.byteOffset + Math.min(y, b.length)) }); } }
  const src = 'let _temMaps = [], _temRenderer = null, _temEdOpenId = null, _temEdDraft = {};\n'
    + 'const KORISNIK_PAL = ["#f97316","#818cf8"];\nfunction _temModalRender() {}\n'
    + KONST.map(extractConst).join('\n') + '\n' + FUNK.map(extractFn).join('\n')
    + '\nreturn { get maps() { return _temMaps; }, setEd(id, d) { _temEdOpenId = id; if (d) _temEdDraft[id] = d; }, get draft() { return _temEdDraft; },'
    + FUNK.map(f => f + ',').join('') + '};';
  const api = new Function('L', 'map', 'document', 'localStorage', 'showToast', 'File', '_MiniSqliteMain', 'proj4', src)(
    L, {}, document, localStorage, m => toasti.push(m), FakeFile, MiniSqlite, () => { throw new Error('proj4'); });
  return { api, ls, toasti, el, mkEl };
}
async function ucitaj() {
  const env = napravi();
  const buf = fs.readFileSync(path.join(__dirname, '../fixtures/tematska-mini.gpkg'));
  const entry = await env.api._gpkgParseBuf(new Uint8Array(buf), 'master_odsjeci.gpkg', { fit: false });
  return { ...env, entry };
}

let pass = 0, fail = 0;
const cekaj = [];
function t(name, fn) {
  const ok = () => { console.log('  ✔ ' + name); pass++; };
  const ko = e => { fail++; console.log('  ✘ ' + name + '\n      ' + e.message); };
  try { const r = fn(); if (r && r.then) cekaj.push(r.then(ok, ko)); else ok(); } catch (e) { ko(e); }
}
console.log('Tematska karta:');

t('fixture: 30 odsjeka, brojčane teme + kategorijska "uredjajni_razred"; odjel/gj NISU teme', async () => {
  const { entry } = await ucitaj();
  assert.strictEqual(entry.features.length, 30);
  assert.deepStrictEqual(entry.cols, ['cetinari_pct', 'starost', 'visina', 'zaliha_m3_ha']);
  // odjel ima 30 različitih vrijednosti (> 20), gj samo jednu — nijedno nije tema
  assert.deepStrictEqual(entry.catCols, ['uredjajni_razred']);
});

t('odsjek BEZ vrijednosti ostaje bez podatka — ne upada u najnižu klasu (Number(null) je 0)', async () => {
  const { api, entry } = await ucitaj();
  const bez = entry.features.filter(f => f.attrs.zaliha_m3_ha == null);
  assert.strictEqual(bez.length, 2, 'fixture ima 2 odsjeka bez zalihe');
  api._temApplyTheme(entry.id, 'zaliha_m3_ha');
  assert.ok(entry._cls.min > 100, 'minimum teme ne smije biti 0 (bio ' + entry._cls.min + ')');
  bez.forEach(f => assert.strictEqual(f.polys[0].style.fillColor, '#64748b', 'bez podatka = sivo'));
  assert.strictEqual(api._temKlasaIdx(entry._cls, null), -1);
  assert.strictEqual(api._temKlasaIdx(entry._cls, ''), -1);
  const st = api._temStatistika(entry);
  assert.strictEqual(st.bez.n, 2);
  assert.strictEqual(st.klase.reduce((s, k) => s + k.n, 0), 28);
});

t('površina iz geometrije: odsjek 0.011° × 0.0085° na ~44.9° ≈ 82 ha, zbir klasa + bez = ukupno', async () => {
  const { api, entry } = await ucitaj();
  const ha = api._temPovrsinaHa(entry.features[0]);
  // analitički: 0.011° dužine × 111.32 km × cos(44.9°) ≈ 867.6 m; 0.0085° širine ≈ 945.1 m
  assert.ok(Math.abs(ha - 82.0) < 1.0, 'površina ' + ha);
  api._temApplyTheme(entry.id, 'visina');
  const st = api._temStatistika(entry);
  const zbir = st.klase.reduce((s, k) => s + k.ha, 0) + st.bez.ha;
  assert.ok(Math.abs(zbir - st.ukupnoHa) < 1e-6);
  assert.ok(Math.abs(st.ukupnoHa - 30 * ha) < 30, 'ukupno ' + st.ukupnoHa);
});

t('rupa (unutrašnji prsten) se oduzima od površine', () => {
  const { api } = napravi();
  const kv = (la, lo, d) => [[la, lo], [la, lo + d], [la + d, lo + d], [la + d, lo], [la, lo]];
  const bezRupe = api._temPovrsinaHa({ polys: [{ getLatLngs: () => [kv(44.9, 16.1, 0.01).map(([lat, lng]) => ({ lat, lng }))] }] });
  const saRupom = api._temPovrsinaHa({ polys: [{ getLatLngs: () => [kv(44.9, 16.1, 0.01), kv(44.902, 16.102, 0.004)].map(r => r.map(([lat, lng]) => ({ lat, lng }))) }] });
  assert.ok(saRupom < bezRupe && saRupom > bezRupe * 0.8, bezRupe + ' / ' + saRupom);
});

t('prosjek po površini je ponderisan: veliki odsjek vuče više od malog', () => {
  const { api } = napravi();
  const f = (v, ha) => ({ attrs: { x: v }, _ha: ha, polys: [] });
  const entry = { features: [f(10, 90), f(100, 10)], _cls: { col: 'x', breaks: [50], colors: ['#000000', '#ffffff'], min: 10, max: 100 } };
  const st = api._temStatistika(entry);
  assert.strictEqual(st.prosjek, 55);
  assert.strictEqual(st.prosjekPov, 19);
  assert.deepStrictEqual(st.klase.map(k => k.n), [1, 1]);
});

t('kategorijska tema: boja po vrijednosti, redoslijed prirodan (I, II, III), ručne boje se pamte', async () => {
  const { api, entry, ls } = await ucitaj();
  api._temApplyTheme(entry.id, 'uredjajni_razred');
  assert.strictEqual(entry._cls.cat, true);
  assert.deepStrictEqual(entry._cls.vals, ['I', 'II', 'III']);
  const f = entry.features.find(x => x.attrs.uredjajni_razred === 'II');
  assert.strictEqual(f.polys[0].style.fillColor, entry._cls.colors[1]);
  entry.styles.uredjajni_razred = { catColors: { II: '#123456', III: 'nije-boja' } };
  api._temApplyTheme(entry.id, 'uredjajni_razred');
  assert.strictEqual(entry._cls.colors[1], '#123456');
  assert.strictEqual(entry._cls.colors[2], api._temKatBoje(3)[2], 'neispravna boja pada na zadanu');
  assert.strictEqual(f.polys[0].style.fillColor, '#123456');
  const reg = JSON.parse(ls.tvlake_tem_reg_v1);
  assert.strictEqual(reg[0].theme, 'uredjajni_razred');
  assert.deepStrictEqual(reg[0].styles.uredjajni_razred.catColors.II, '#123456');
});

t('kategorijski editor: "Zapiši" čuva boju po VRIJEDNOSTI (ne po poziciji)', async () => {
  const { api, entry, el, mkEl } = await ucitaj();
  api._temApplyTheme(entry.id, 'uredjajni_razred');
  api.setEd(entry.id, api._temDraftIz(entry._cls));
  ['#aa0000', '#00aa00', '#0000aa'].forEach((c, i) => { el['tem-ed-c-' + i] = Object.assign(mkEl('tem-ed-c-' + i), { value: c }); });
  api._temClassEdApply(entry.id);
  assert.deepStrictEqual(entry.styles.uredjajni_razred, { catColors: { I: '#aa0000', II: '#00aa00', III: '#0000aa' } });
  assert.deepStrictEqual(entry._cls.colors, ['#aa0000', '#00aa00', '#0000aa']);
});

t('_temKlaseOpis: deduplicirani kvantili (5 boja, 3 granice) daju 4 klase, ne 5 sa praznom', () => {
  const { api } = napravi();
  const cls = { breaks: [2, 5, 9], colors: ['#1', '#2', '#3', '#4', '#5'], min: 0, max: 12 };
  const k = api._temKlaseOpis(cls);
  assert.strictEqual(k.length, 4);
  assert.strictEqual(k[3].lbl, '9 – 12');
  const d = api._temDraftIz(cls);
  assert.strictEqual(d.colors.length, 4);
  assert.strictEqual(d.edges.length, 5, 'editor: n klasa ↔ n+1 granica');
});

t('_temJednakiIntervali: jednaki koraci, zaokruženo, strogo rastuće, unutar raspona', () => {
  const { api } = napravi();
  assert.deepStrictEqual(api._temJednakiIntervali(0, 100, 4), [25, 50, 75]);
  assert.deepStrictEqual(api._temJednakiIntervali(15.1, 31.6, 5), [18.4, 21.7, 25, 28.3]);
  assert.deepStrictEqual(api._temJednakiIntervali(5, 5, 4), []);
});

t('editor: paleta i "Jednaki intervali" pune draft (bez trajnog upisa dok nema "Zapiši")', async () => {
  const { api, entry, el, mkEl, ls } = await ucitaj();
  api._temApplyTheme(entry.id, 'visina');
  const prije = ls.tvlake_tem_reg_v1;
  api.setEd(entry.id, api._temDraftIz(entry._cls));
  el['tem-ed-n'] = Object.assign(mkEl('tem-ed-n'), { value: '4' });
  api._temEdAuto(entry.id, 'ji');
  const d = api.draft[entry.id];
  assert.strictEqual(d.colors.length, 4);
  assert.strictEqual(d.edges.length, 5);
  api._temEdPaleta(entry.id, 'pl');
  assert.deepStrictEqual(d.colors, api._temRampFor(4, ['#eff3ff','#bdd7e7','#6baed6','#3182bd','#08519c']));
  api._temEdObrni(entry.id);
  assert.strictEqual(d.colors[0], '#08519c');
  assert.strictEqual(ls.tvlake_tem_reg_v1, prije, 'ništa nije trajno upisano');
});

t('legenda: "bez podatka" red kad ga ima; skupljena = traka boja; stanje se pamti', async () => {
  const { api, entry, el, ls } = await ucitaj();
  api._temApplyTheme(entry.id, 'zaliha_m3_ha');
  const leg = el['tem-legend'];
  assert.ok(leg, 'legenda postoji');
  assert.ok(leg.innerHTML.includes('bez podatka'));
  api._temApplyTheme(entry.id, 'visina');
  assert.ok(!leg.innerHTML.includes('bez podatka'), 'visina nema praznih');
  api._temLegToggle();
  assert.strictEqual(ls.tvlake_tem_leg_skupljena, '1');
  assert.ok(leg.innerHTML.includes('tem-leg-strip') && !leg.innerHTML.includes('tem-leg-row'));
  assert.ok(leg.classList.contains('skup'));
});

t('pregled/legenda/popup escape-uju vrijednosti iz fajla (tekst kategorije nije HTML)', () => {
  const { api } = napravi();
  const pol = { getLatLngs: () => [[{ lat: 44.9, lng: 16.1 }, { lat: 44.9, lng: 16.11 }, { lat: 44.91, lng: 16.11 }]] };
  const f1 = { attrs: { vrsta: '<img src=x onerror=alert(1)>', odjel: '<b>12</b>' }, polys: [pol] };
  const f2 = { attrs: { vrsta: 'bukva' }, polys: [pol] };
  const entry = { id: 'x', name: 'n', features: [f1, f2, f2], cols: [], catCols: ['vrsta'], styles: {}, colLabels: {}, visible: true, theme: 'vrsta' };
  entry._cls = { col: 'vrsta', cat: true, vals: ['<img src=x onerror=alert(1)>', 'bukva'], colors: ['#111111', '#222222'] };
  const html = api._temPregledHtml(entry) + api._temPopupHtml(entry, f1);
  assert.ok(!html.includes('<img') && !html.includes('<b>12'), html);
  assert.ok(html.includes('&lt;img'));
});

t('_temBr: decimalni zarez i razmak za hiljade (WebView bez bs lokala)', () => {
  const { api } = napravi();
  assert.strictEqual(api._temBr(1234.5), '1 235');
  assert.strictEqual(api._temBr(21.54), '21,5');
  assert.strictEqual(api._temBr(3.456), '3,46');
  assert.strictEqual(api._temBr(NaN), '—');
  assert.strictEqual(api._temHa(4.26), '4,3 ha');
});

t('restore: zapamćena KATEGORIJSKA tema se vraća poslije restarta', () => {
  assert.ok(/saved\?\.theme && \(entry\.cols\.includes\(saved\.theme\) \|\| entry\.catCols\.includes\(saved\.theme\)\)/.test(extractFn('_gpkgParseBuf')));
});

t('tabela atributa i opacity koriste ISTI klasifikator (_temBojaZa / _temOboji)', () => {
  assert.ok(extractFn('_temTblRender').includes('_temBojaZa(cls, v)'));
  assert.ok(extractFn('_temSetOpacity').includes('_temOboji(entry)'));
  assert.ok(!/Number\(f\.attrs\[/.test(HTML), 'Number(f.attrs[...]) pretvara prazno u 0 — koristiti _temNum');
});

Promise.all(cekaj).then(() => {
  console.log(`\n${pass} prošlo, ${fail} palo`);
  if (fail) process.exit(1);
});
