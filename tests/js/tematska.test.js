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

const KONST = ['_TEM_TBL_KORAK', '_temColl', '_TEM_KAT_MAX_TXT', '_TEM_POV_RE', '_TEM_ID_RE', '_TEM_NAZIVI', '_TEM_PG_MAX', '_temPgSve', '_TEM_HA_COL', '_TEM_TBL_KOL_KEY', '_TEM_REG_KEY', '_TEM_RAMP', '_TEM_PALETE', '_TEM_KAT_BOJE', '_TEM_KAT_MAX', '_TEM_LEG_KEY', '_TEM_MAX_CLASSES'];
const FUNK = ['_temRampFor', '_temKatBoje', '_temNum', '_temBr', '_temHa', '_temPrstenM2', '_temPovrsinaHa',
  '_temKlasaIdx', '_temBojaZa', '_temKlaseOpis', '_temJednakiIntervali', '_temStatistika', '_temDraftIz',
  '_temRegSave', '_temById', '_temColLabel', '_parseGpkgGeom', '_temResolveTr', '_gpkgParseBuf', '_temPopupHtml',
  '_temQuantiles', '_temApplyTheme', '_temOboji', '_temSetOpacity', '_temLegSkupljena', '_temLegToggle',
  '_temLegendUpd', '_temFmtVal', '_temPregledHtml', '_temClassEdHtml', '_temEdPovuci', '_temEdScrapeDom',
  '_temEdPaleta', '_temEdObrni', '_temEdAuto', '_temClassEdApply', '_temClassEdReset', '_escHtml', '_jsAttr',
  '_temTblVal', '_temTblCols', '_temTblNum', '_temTblSkrivene', '_temTblSelSet', '_temTblSelSacuvaj', '_temTblVisibleCols',
  '_temTblGranice', '_temTblRedovi', '_temTblDec', '_temTblBroj', '_temTblZbir', '_temTblCsv', '_temTblCsvIme',
  '_temTblChipsHtml', '_temTblRender', '_temPgSveToggle', '_temTblDodaj', '_temTblNaSkrol'];

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
      getBounds() { const ll = rings[0]; const la = ll.map(p => p[0]), lo = ll.map(p => p[1]);
        return L.latLngBounds({ lat: Math.min(...la), lng: Math.min(...lo) }, { lat: Math.max(...la), lng: Math.max(...lo) }); } }),
    latLngBounds: () => ({ isValid: () => false, extend() { return this; } }),
    DomEvent: { disableClickPropagation() {}, disableScrollPropagation() {} }
  };
  class FakeFile { constructor(parts) { const b = Buffer.from(parts[0]); this.size = b.length;
    this.slice = (x, y) => ({ arrayBuffer: async () => b.buffer.slice(b.byteOffset + x, b.byteOffset + Math.min(y, b.length)) }); } }
  const src = 'let _temMaps = [], _temRenderer = null, _temEdOpenId = null, _temEdDraft = {};\n'
    + 'let _temTblId = null, _temTblSort = { col: null, dir: 1 }, _temTblQ = "", _temTblSelById = {}, _temTblKlase = new Set(), _temTblUPrikazu = false, _temTblCtx = null;\n'
    + 'const KORISNIK_PAL = ["#f97316","#818cf8"];\nfunction _temModalRender() {}\n'
    + KONST.map(extractConst).join('\n') + '\n' + FUNK.map(extractFn).join('\n')
    + '\nreturn { get maps() { return _temMaps; }, setEd(id, d) { _temEdOpenId = id; if (d) _temEdDraft[id] = d; }, get draft() { return _temEdDraft; },'
    + 'tbl(o) { if ("id" in o) _temTblId = o.id; if ("q" in o) _temTblQ = o.q; if ("sort" in o) _temTblSort = o.sort; if ("klase" in o) _temTblKlase = new Set(o.klase); if ("prikaz" in o) _temTblUPrikazu = o.prikaz; if (o.resetSel) _temTblSelById = {}; },'
    + FUNK.map(f => f + ',').join('') + '};';
  // Prikaz karte za filter "U prikazu karte": pravougaonik u stepenima
  const bnd = (s, w, n, e) => ({ isValid: () => true, s, w, n, e,
    extend(o) { return bnd(Math.min(this.s, o.s), Math.min(this.w, o.w), Math.max(this.n, o.n), Math.max(this.e, o.e)); },
    intersects(o) { return !(o.s > this.n || o.n < this.s || o.w > this.e || o.e < this.w); },
    getSouthWest() { return { lat: this.s, lng: this.w }; }, getNorthEast() { return { lat: this.n, lng: this.e }; } });
  const mapa = { _b: null, getBounds() { return this._b; } };
  L.latLngBounds = (sw, ne) => bnd(sw.lat, sw.lng, ne.lat, ne.lng);
  const api = new Function('L', 'map', 'document', 'localStorage', 'showToast', 'File', '_MiniSqliteMain', 'proj4', src)(
    L, mapa, document, localStorage, m => toasti.push(m), FakeFile, MiniSqlite, () => { throw new Error('proj4'); });
  return { api, ls, toasti, el, mkEl, mapa, bnd };
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
  assert.deepStrictEqual(entry.catCols, ['gazdinska_klasa', 'minirano', 'uredjajni_razred']);
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

// ── Tabela atributa (v1.8.6) ───────────────────────────────────────────────
t('tabela: kolona "Površina (ha)" iz geometrije stoji odmah iza odjel/GJ', async () => {
  const { api, entry } = await ucitaj();
  const { cols } = api._temTblCols(entry);
  assert.deepStrictEqual(cols.slice(0, 3), ['odjel', 'gj', '__ha']);
  assert.strictEqual(api._temColLabel(entry, '__ha'), 'Površina (ha)');
  assert.ok(Math.abs(api._temTblVal(entry.features[0], '__ha') - 82.07) < 0.5);
  assert.ok(api._temTblNum(entry, '__ha') && api._temTblNum(entry, 'visina') && !api._temTblNum(entry, 'gj'));
});

t('tabela: pretraga + filter klase + sort; prazne vrijednosti na dno; indeks je ORIGINALNI', async () => {
  const { api, entry } = await ucitaj();
  api._temApplyTheme(entry.id, 'zaliha_m3_ha');
  api.tbl({ id: entry.id, q: '', klase: [-1], sort: { col: 'odjel', dir: 1 }, prikaz: false });
  const bez = api._temTblRedovi(entry);
  assert.strictEqual(bez.length, 2, 'filter "bez podatka" daje 2 odsjeka');
  bez.forEach(r => assert.strictEqual(entry.features[r.i], r.f));
  api.tbl({ klase: [], sort: { col: 'zaliha_m3_ha', dir: -1 } });
  const svi = api._temTblRedovi(entry);
  assert.strictEqual(svi.length, 30);
  assert.ok(svi[0].f.attrs.zaliha_m3_ha >= svi[1].f.attrs.zaliha_m3_ha);
  assert.strictEqual(svi[29].f.attrs.zaliha_m3_ha, null, 'prazno ide na dno i kod silaznog sorta');
  api.tbl({ q: '12c', sort: { col: 'odjel', dir: 1 } });
  assert.deepStrictEqual(api._temTblRedovi(entry).map(r => r.f.attrs.odjel), ['12c']);
  // pretraga gleda SVE vidljive kolone, ne samo odjel (starost 120 sadrži "12")
  api.tbl({ q: '120' });
  assert.ok(api._temTblRedovi(entry).every(r => r.f.attrs.starost === 120 || Object.values(r.f.attrs).some(v => String(v).includes('120'))));
});

t('tabela: "U prikazu karte" zadržava samo odsjeke koji sijeku trenutni prikaz', async () => {
  const { api, entry, mapa, bnd } = await ucitaj();
  mapa._b = bnd(44.9001, 16.1001, 44.9050, 16.1050);   // unutar prvog odsjeka (10a)
  api.tbl({ id: entry.id, q: '', klase: [], prikaz: true, sort: { col: null, dir: 1 } });
  assert.deepStrictEqual(api._temTblRedovi(entry).map(r => r.f.attrs.odjel), ['10a']);
});

t('tabela: decimale ujednačene po koloni, decimalni zarez (nema "435" pored "435.20")', async () => {
  const { api, entry } = await ucitaj();
  assert.strictEqual(api._temTblDec(entry, 'zaliha_m3_ha'), 1);
  assert.strictEqual(api._temTblDec(entry, 'starost'), 0);
  assert.strictEqual(api._temTblBroj(435, 1), '435,0');
  assert.strictEqual(api._temTblBroj(2461.2, 2), '2 461,20');
  assert.strictEqual(api._temTblBroj(null, 1), '');
});

t('tabela: zbirni red — površina se SABIRA, ostalo USREDNJAVA, nad filtriranim redovima', async () => {
  const { api, entry } = await ucitaj();
  api._temApplyTheme(entry.id, 'zaliha_m3_ha');
  api.tbl({ id: entry.id, q: '', klase: [-1], prikaz: false, sort: { col: null, dir: 1 } });
  const rows = api._temTblRedovi(entry);
  const z = api._temTblZbir(entry, ['odjel', '__ha', 'visina', 'zaliha_m3_ha'], rows);
  assert.strictEqual(z[0], null, 'tekstualna kolona nema zbir');
  assert.strictEqual(z[1].tip, 'Σ');
  assert.ok(Math.abs(z[1].v - rows.reduce((s, r) => s + api._temTblVal(r.f, '__ha'), 0)) < 1e-9);
  assert.strictEqual(z[2].tip, 'ø');
  assert.ok(Math.abs(z[2].v - rows.reduce((s, r) => s + r.f.attrs.visina, 0) / rows.length) < 1e-9);
  assert.strictEqual(z[3], null, 'kolona u kojoj su SVE vrijednosti prazne nema prosjek (ne 0)');
});

t('tabela: izbor kolona se pamti kao SKRIVENE — nova kolona u fajlu ostaje vidljiva', async () => {
  const { api, entry, ls } = await ucitaj();
  const sel = api._temTblSelSet(entry);
  sel.delete('starost');
  api._temTblSelSacuvaj(entry);
  assert.deepStrictEqual(JSON.parse(ls.tvlake_tem_tbl_skrivene)[entry.id], ['starost']);
  api.tbl({ resetSel: true });                    // nova sesija
  entry.features[0].attrs.nova_kolona = 5;        // nova verzija fajla donijela kolonu
  const vid = api._temTblVisibleCols(entry);
  assert.ok(!vid.includes('starost'));
  assert.ok(vid.includes('nova_kolona'));
});

t('CSV: ";" + decimalni zarez + BOM, samo filtrirani redovi, puna preciznost, escape', async () => {
  const { api, entry } = await ucitaj();
  entry.features[0].attrs.gj = 'Una; "Sana"';
  api.tbl({ id: entry.id, q: '10a', klase: [], prikaz: false, sort: { col: 'odjel', dir: 1 } });
  const csv = api._temTblCsv(entry);
  assert.ok(csv.startsWith('﻿'));
  const [hd, red, ...ost] = csv.slice(1).split('\r\n');
  assert.strictEqual(ost.length, 0, 'samo jedan red poslije filtera');
  assert.ok(hd.startsWith('Odjel;GJ;Površina (ha);'), hd);
  assert.ok(red.startsWith('10a;"Una; ""Sana""";'), red);
  const brojevi = red.slice('10a;"Una; ""Sana""";'.length).split(';');
  assert.ok(/^\d+,\d+$/.test(brojevi[0]), 'površina sa zarezom: ' + red);
  assert.ok(!/\d\.\d/.test(red), 'nijedna decimalna tačka: ' + red);
  assert.strictEqual(api._temTblCsvIme({ name: 'master odsjeci.gpkg' }), 'Tabela_master_odsjeci.csv');
});

t('tabela: render — zbirni red i "—" za prazno; bez klase "lbl" (globalno .lbl je display:block)', async () => {
  const { api, entry, el, mkEl } = await ucitaj();
  api._temApplyTheme(entry.id, 'zaliha_m3_ha');
  ['ttm-scroll', 'ttm-foot', 'ttm-chips', 'ttm-sub', 'ttm-colsbtn'].forEach(id => { el[id] = mkEl(id); });
  api.tbl({ id: entry.id, q: '', klase: [], prikaz: false, sort: { col: 'odjel', dir: 1 } });
  api._temTblRender();
  const h = el['ttm-scroll'].innerHTML;
  assert.ok(h.includes('<tfoot>') && h.includes('<em>Σ</em>') && h.includes('<em>ø</em>'));
  assert.ok(h.includes('class="nil">—'));
  assert.ok(!/class="[^"]*\blbl\b/.test(h + el['ttm-chips'].innerHTML + api._temPregledHtml(entry)));
  assert.ok(el['ttm-chips'].innerHTML.includes('bez podatka'));
  assert.strictEqual(el['ttm-sub'].textContent, '30 odsjeka · ' + api._temHa(entry.features.reduce((s, f) => s + api._temPovrsinaHa(f), 0)));
});

// ── .gpkg granice taksacije (v1.8.7): TEXT šifre, oznake, površina iz fajla ──
t('TEXT kolona sa brojčanim šiframa (gazdinska klasa "4411") je KATEGORIJA, ne brojčana tema', async () => {
  const { entry } = await ucitaj();
  assert.ok(!entry.cols.includes('gazdinska_klasa'), 'kvantili nad šiframa nemaju smisla');
  assert.ok(entry.catCols.includes('gazdinska_klasa'), '25 šifri (> 20) i dalje je tema jer je kolona TEXT');
});

t('TEXT oznaka sa JEDNOM vrijednošću (minirano "Da") je tema; odjel/odsjek/napomena nikad', async () => {
  const { api, entry } = await ucitaj();
  assert.ok(entry.catCols.includes('minirano'));
  assert.ok(!entry.catCols.includes('odjel'), 'odjel je oznaka (30 vrijednosti), nije tema');
  assert.ok(!entry.catCols.includes('gj'), 'GJ sa jednom vrijednošću BEZ praznih nije oznaka');
  api._temApplyTheme(entry.id, 'minirano');
  const st = api._temStatistika(entry);
  assert.strictEqual(st.klase[0].n, 3);
  assert.strictEqual(st.bez.n, 27);
});

t('pregled: kategorija sa > 12 vrijednosti prikazuje 12 najvećih + "još N", a na zahtjev sve', async () => {
  const { api, entry } = await ucitaj();
  api._temApplyTheme(entry.id, 'gazdinska_klasa');
  const kratko = api._temPregledHtml(entry);
  assert.strictEqual((kratko.match(/class="tem-pg-row"/g) || []).length, 12);
  assert.ok(kratko.includes('+ još 13 vrijednosti'));
  api._temPgSveToggle(entry.id);
  const dugo = api._temPregledHtml(entry);
  assert.strictEqual((dugo.match(/class="tem-pg-row"/g) || []).length, 25);
  assert.ok(dugo.includes('prikaži samo 12 najvećih'));
});

t('fajl sa kolonom povrsina_ha: tabela je koristi umjesto izračunate, zbir je Σ, popup bez "≈"', () => {
  const { api } = napravi();
  const pol = { getLatLngs: () => [[{ lat: 44.9, lng: 16.1 }, { lat: 44.9, lng: 16.11 }, { lat: 44.91, lng: 16.11 }]] };
  const f = (o, s, ha) => ({ attrs: { gj: 'Grmeč Jasenica', odjel: o, odsjek: s, povrsina_ha: ha }, polys: [pol] });
  const entry = { id: 'e', name: 'granica.gpkg', features: [f('81', 'e', 1.2), f('81', 'f', 3.4)], cols: ['povrsina_ha'], catCols: [], styles: {}, colLabels: {}, theme: null, _cls: null };
  const { cols } = api._temTblCols(entry);
  assert.deepStrictEqual(cols, ['odjel', 'odsjek', 'gj', 'povrsina_ha'], 'nema dodatne izračunate __ha kolone');
  const z = api._temTblZbir(entry, cols, entry.features.map((x, i) => ({ i, f: x })));
  assert.strictEqual(z[3].tip, 'Σ');
  assert.ok(Math.abs(z[3].v - 4.6) < 1e-9);
  const h = api._temPopupHtml(entry, entry.features[0]);
  assert.ok(h.includes('81<span class="ods">e</span>'), 'zaglavlje nosi odjel i odsjek');
  assert.ok(h.includes('>1,2 ha<') && !h.includes('≈'), 'površina iz fajla, ne procjena');
  assert.ok(!h.includes('>Površina (ha)<'), 'površina nije ponovljena kao red');
});

t('prikazni nazivi poznatih kolona (ŠVZV, Ugroženost, Gazdinska klasa); ručni naziv ima prednost', () => {
  const { api } = napravi();
  assert.strictEqual(api._temColLabel({}, 'svzv'), 'ŠVZV');
  assert.strictEqual(api._temColLabel({}, 'gazdinska_klasa'), 'Gazdinska klasa');
  assert.strictEqual(api._temColLabel({ colLabels: { svzv: 'Zaštitne šume' } }, 'svzv'), 'Zaštitne šume');
  assert.strictEqual(api._temColLabel({}, 'neka_kolona'), 'neka kolona');
});

t('tabela: velik fajl se crta po dijelovima (300 odmah, ostatak skrolom), zbir i dalje nad SVIM redovima', () => {
  const { api, el, mkEl } = napravi();
  const pol = { getLatLngs: () => [[{ lat: 44.9, lng: 16.1 }, { lat: 44.9, lng: 16.11 }, { lat: 44.91, lng: 16.11 }]] };
  const features = Array.from({ length: 650 }, (_, i) => ({ attrs: { odjel: String(i + 1), povrsina_ha: 1 }, polys: [pol] }));
  const entry = { id: 'v', name: 'v', features, cols: ['povrsina_ha'], catCols: [], styles: {}, colLabels: {}, theme: null, _cls: null };
  api.maps.push(entry);
  ['ttm-scroll', 'ttm-foot', 'ttm-chips', 'ttm-sub', 'ttm-colsbtn'].forEach(id => { el[id] = mkEl(id); });
  api.tbl({ id: 'v', q: '', klase: [], prikaz: false, sort: { col: 'odjel', dir: 1 } });
  api._temTblRender();
  const h = el['ttm-scroll'].innerHTML;
  assert.strictEqual((h.match(/<tr onclick/g) || []).length, 300);
  assert.ok(h.includes('<em>Σ</em> 650,00'), 'zbir nad svih 650, ne nad nacrtanih 300');
  const tb = Object.assign(mkEl('ttm-tbody'), { html: '', insertAdjacentHTML(p, x) { this.html += x; } });
  el['ttm-tbody'] = tb;
  api._temTblDodaj(); api._temTblDodaj(); api._temTblDodaj();
  assert.strictEqual((tb.html.match(/<tr onclick/g) || []).length, 350, 'docrtano tačno ostatak, bez duplikata');
  assert.ok(tb.html.includes('_temTblRowClick(649)'));
});

Promise.all(cekaj).then(() => {
  console.log(`\n${pass} prošlo, ${fail} palo`);
  if (fail) process.exit(1);
});
