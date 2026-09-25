// =====================================================================
// Testovi za panel Tragovi i panel mjerenja (v1.6.8).
// Pokretanje:  node tests/js/tragovi-panel.test.js
// ---------------------------------------------------------------------
// - Mjerenja se ranije NISU crtala kad nema nijednog traga (rani izlaz u
//   _tragoviRender prije sekcije mjerenja).
// - Kartica mjerenja nosi glavnu vrijednost (ha / m / %), ne samo red teksta.
// - Rezultat mjerenja se vidi uživo na vrhu panela (_msrUpdGlavni) — ranije
//   je bio ispod ruba panela visokog 15vh.
// - Nagib u stepenima je bio pogrešno nazvan "Azimut".
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
function extractVar(name) {
  const s = HTML.indexOf('var ' + name + ' = ');
  if (s < 0) throw new Error('nije nađen var ' + name);
  const e = HTML.indexOf(';\n', s);
  return HTML.slice(s, e + 1);
}

let pass = 0, fail = 0;
function t(name, fn) {
  try { fn(); console.log('  ✔ ' + name); pass++; }
  catch (e) { fail++; console.log('  ✘ ' + name + '\n      ' + e.message); }
}

function el() { return { innerHTML: '', textContent: '', style: {}, classList: { _s: new Set(), toggle(c, on) { on ? this._s.add(c) : this._s.delete(c); }, add(c) { this._s.add(c); }, remove(c) { this._s.delete(c); }, contains(c) { return this._s.has(c); } } }; }

function hav(la1, lo1, la2, lo2) {
  const R = 6371000, r = Math.PI / 180;
  const a = Math.sin((la2 - la1) * r / 2) ** 2 + Math.cos(la1 * r) * Math.cos(la2 * r) * Math.sin((lo2 - lo1) * r / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function makeEnv(st) {
  const ids = ['tragovi-list', 'tragovi-count', 'notif-tragovi', 'tragovi-msr-count', 'tv-sum', 'tv-seg-trg', 'tv-seg-msr',
    'tv-pane-trg', 'tv-pane-msr', 'tv-grp-btn', 'tragovi-msr-list', 'btrag-panel', 'btrag-panel-ico', 'btrag-panel-txt',
    'msr-main-val', 'msr-main-sub'];
  const els = Object.fromEntries(ids.map(i => [i, el()]));
  const scope = {
    document: { getElementById: id => els[id] || null },
    _tragRegistry: st.trg || [], _msrRegistry: st.msr || [],
    _tragoviGrpBy: 'date', _tragOn: !!st.tragOn,
    _msrPts: st.msrPts || [], _msrMode: st.msrMode || 'dist',
    fmtDateShort: d => String(d).slice(0, 10),
    _tragCalcLen: pts => pts.length * 100, _tragFmtLen: m => (m / 1000).toFixed(2) + ' km',
    fmtHa: h => h.toFixed(2) + ' ha', _msrFmt: m => Math.round(m) + ' m',
    _msrPts2Len: pts => { let s = 0; for (let i = 0; i < pts.length - 1; i++) s += hav(pts[i].lat, pts[i].lng, pts[i + 1].lat, pts[i + 1].lng); return s; },
    _msrPoligonPovrsina: () => 52684, _msrHaversine: hav,
    _escHtml: s => String(s).replace(/</g, '&lt;'),
  };
  const src = [extractVar('_tragoviTab'), extractVar('_TV_GRP_LBL'), extractVar('_TV_MSR_MOD')].join('\n')
    .replace("var _tragoviTab = 'trg';", "var _tragoviTab = " + JSON.stringify(st.tab || 'trg') + ";")
    + '\n' + ['_tvMsrVrijednost', '_tragoviMsrRowHtml', '_tragoviRender', '_tragoviRowHtml', '_tragoviUpdBtn', '_msrBrojTacaka', '_msrUpdGlavni'].map(extractFn).join('\n')
    + '\nreturn { _tvMsrVrijednost, _tragoviRender, _tragoviUpdBtn, _msrBrojTacaka, _msrUpdGlavni };';
  const keys = Object.keys(scope);
  const api = new Function(...keys, src)(...keys.map(k => scope[k]));
  return { api, els };
}

const TRG = { id: 'trag_1', name: 'Obilazak', color: '#f97316', pts: [[1, 1], [2, 2], [3, 3]], date: '2026-09-24T10:00:00Z', visible: true };
const AREA = { id: 'mr_1', name: 'Sječina', date: '2026-09-24', mode: 'area', color: '#a78bfa', pts: [{ lat: 44.9, lng: 16.1 }, { lat: 44.902, lng: 16.1 }, { lat: 44.902, lng: 16.104 }] };
const DIST = { id: 'mr_2', name: 'Dužina', date: '2026-09-24', mode: 'dist', pts: [{ lat: 44.9, lng: 16.1 }, { lat: 44.903, lng: 16.1 }] };

console.log('Panel Tragovi:');

t('mjerenja se prikazuju i kad NEMA nijednog traga (regresija ranog izlaza)', () => {
  const { api, els } = makeEnv({ trg: [], msr: [AREA], tab: 'msr' });
  api._tragoviRender();
  assert.ok(els['tragovi-msr-list'].innerHTML.includes('Sječina'), 'mjerenje nije nacrtano');
  assert.ok(els['tragovi-list'].innerHTML.includes('Nema sačuvanih tragova'));
});

t('sažetak broji tragove, ukupnu dužinu i mjerenja', () => {
  const { api, els } = makeEnv({ trg: [TRG, { ...TRG, id: 'trag_2' }], msr: [AREA] });
  api._tragoviRender();
  assert.strictEqual(els['tv-sum'].textContent, '2 traga · 0.60 km · 1 mjerenje');
});

t('tab Mjerenja sakriva listu tragova i obrnuto', () => {
  const { api, els } = makeEnv({ trg: [TRG], msr: [AREA], tab: 'msr' });
  api._tragoviRender();
  assert.strictEqual(els['tv-pane-trg'].style.display, 'none');
  assert.strictEqual(els['tv-pane-msr'].style.display, '');
  assert.ok(els['tv-seg-msr'].classList.contains('on') && !els['tv-seg-trg'].classList.contains('on'));
});

t('kartica traga nosi dužinu, a brisanje ide kroz HTML dijalog, ne native confirm()', () => {
  const { api, els } = makeEnv({ trg: [TRG] });
  api._tragoviRender();
  const h = els['tragovi-list'].innerHTML;
  assert.ok(h.includes('0.30 km'), 'nema dužine na kartici');
  assert.ok(h.includes("_tragoviObrisi('trag_1')") && !/confirm\(/.test(h));
});

t('vrijednost mjerenja: površina u ha, distanca u m, nagib u % samo uz poznate visine', () => {
  const { api } = makeEnv({});
  assert.strictEqual(api._tvMsrVrijednost(AREA).v, '5.27 ha');
  assert.strictEqual(api._tvMsrVrijednost(DIST).v, '334 m');
  const nb = { mode: 'nagib', pts: [{ lat: 44.9, lng: 16.1, elev: 300 }, { lat: 44.901, lng: 16.1, elev: 311.12 }] };
  assert.strictEqual(api._tvMsrVrijednost(nb).v, '+10.0 %');
  assert.strictEqual(api._tvMsrVrijednost({ mode: 'nagib', pts: [{ lat: 1, lng: 1 }, { lat: 1.001, lng: 1 }] }).v, '—', 'bez visina se nagib ne izmišlja');
});

t('dugme Snimi trag mijenja SVG ikonu i tekst, bez emojija', () => {
  const on = makeEnv({ tragOn: true });
  on.api._tragoviUpdBtn();
  assert.ok(on.els['btrag-panel-ico'].innerHTML.includes('#ic-stop'));
  assert.strictEqual(on.els['btrag-panel-txt'].textContent, 'Zaustavi');
  assert.ok(on.els['btrag-panel'].classList.contains('on'));
  const off = makeEnv({ tragOn: false });
  off.api._tragoviUpdBtn();
  assert.ok(off.els['btrag-panel-ico'].innerHTML.includes('#ic-snimaj'));
  assert.ok(!/[🔴⏹]/u.test(off.els['btrag-panel-ico'].innerHTML + on.els['btrag-panel-ico'].innerHTML));
});

console.log('\nPanel mjerenja — rezultat uživo:');

t('množina tačaka: 1 tačka / 3 tačke / 5 tačaka / 12 tačaka / 22 tačke', () => {
  const { api } = makeEnv({});
  assert.deepStrictEqual([1, 3, 5, 12, 22].map(api._msrBrojTacaka), ['1 tačka', '3 tačke', '5 tačaka', '12 tačaka', '22 tačke']);
});

t('distanca: rezultat od 2 tačke, prije toga crtica', () => {
  const a = makeEnv({ msrPts: [{ lat: 44.9, lng: 16.1 }], msrMode: 'dist' });
  a.api._msrUpdGlavni();
  assert.strictEqual(a.els['msr-main-val'].textContent, '—');
  const b = makeEnv({ msrPts: DIST.pts, msrMode: 'dist' });
  b.api._msrUpdGlavni();
  assert.strictEqual(b.els['msr-main-val'].textContent, '334 m');
});

t('površina: od 3 tačke ha + obim; prije toga objašnjenje zašto nema broja', () => {
  const a = makeEnv({ msrPts: AREA.pts.slice(0, 2), msrMode: 'area' });
  a.api._msrUpdGlavni();
  assert.strictEqual(a.els['msr-main-val'].textContent, '—');
  assert.ok(/bar 3/.test(a.els['msr-main-sub'].textContent));
  const b = makeEnv({ msrPts: AREA.pts, msrMode: 'area' });
  b.api._msrUpdGlavni();
  assert.strictEqual(b.els['msr-main-val'].textContent, '5.27 ha');
  assert.ok(/obim/.test(b.els['msr-main-sub'].textContent));
});

console.log('\nInvarijante nad markupom:');

t('#msr-hint postoji (JS u njega piše uputu) i "Azimut" više ne označava ugao nagiba', () => {
  assert.ok(HTML.includes('id="msr-hint"'));
  assert.ok(!HTML.includes("'🧭 Azimut:'"));
});

t('panel mjerenja nije ograničen na 15vh (rezultat je bio ispod ruba)', () => {
  assert.ok(!/maxHeight = isMsr \? '15vh'/.test(HTML));
});

t('dugmad u prozorčićima iznad donje trake ne nasljeđuju raspored dugmadi trake (v1.7.0)', () => {
  // "#action-bar button" (ikona IZNAD teksta) je pogađao i dugmad unutar
  // Moja lokacija / Izmjeri prozorčića — oni su bili visoki pola ekrana.
  const css = HTML.replace(/\/\*[\s\S]*?\*\//g, '');
  assert.ok(!/#action-bar button[\s,{]/.test(css), 'široki selektor "#action-bar button" se vratio');
  assert.ok(/id="ab-loc-popup" class="ab-pop"/.test(HTML) && /id="ab-izmjeri-menu" class="ab-pop"/.test(HTML));
  assert.ok(!/totalBox\.style\.display = 'block'/.test(HTML), '.msr-det je flex, block bi ga pregazio');
});

console.log('\n' + pass + ' prošlo, ' + fail + ' palo');
process.exit(fail ? 1 : 0);
