// =====================================================================
// Testovi: zaostao canvas u pozariPane guta klikove (v1.4.8).
// Pokretanje:  node tests/js/pozari-canvas-klik.test.js
// ---------------------------------------------------------------------
// Terenska prijava: "prikazane oznake nisu klikabilne... izmjere površine i
// ostalo nije klikabilno". Uzrok DOKAZAN Playwright reprodukcijom nad
// STVARNIM Leafletom iz static/libs, ne nagađan:
//   1) samo mjerenje          → klik radi
//   2) + tačka u pozariPane   → klik MRTAV
//   3) tačka uklonjena sa karte → I DALJE MRTAV, 1 canvas zaostao
//   4) renderer uklonjen       → klik ponovo radi, 0 canvasa
// Leaflet sam NIKAD ne ukloni canvas renderer kad nestane zadnji sloj koji ga
// koristi (map.getRenderer ga doda, ništa ga ne vraća), a taj canvas je JEDAN
// element preko CIJELE karte na z-index 645 — iznad mjerenja (410), vlaka
// (400) i oznaka (401).
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

function extractConst(name) {
  const m = HTML.match(new RegExp('const ' + name + ' = [^;]+;'));
  if (!m) throw new Error('nije nađena konstanta ' + name);
  return m[0];
}
const SRC = [extractConst('_POZI_PANEOVI'), extractFn('_poziPaneZauzet'),
  extractFn('_poziCanvasOslobodi'), extractFn('_poziPaneCanvasa')].join('\n');

// _poziCanvasOslobodi REASSIGN-uje renderere (parametri sandbox funkcije), pa
// se finalno stanje mora vratiti IZ ISTOG scope-a, ne čitati izvana.
function run({ naKarti = [], rendereri = ['a', 'b', 'c'], canvasa = 0, paneRend = null } = {}) {
  const uklonjeni = [];
  // Leaflet kešira renderer PO PANE-u i nikad ga ne pusti — sandbox to vjerno
  // oponaša da se testira stvarna grana, ne pojednostavljenje.
  const _paneRenderers = paneRend ? { ...paneRend } : {};
  Object.values(_paneRenderers).forEach(r => { if (!naKarti.includes(r)) naKarti.push(r); });
  const map = {
    _paneRenderers,
    hasLayer: (l) => naKarti.includes(l),
    removeLayer: (l) => { uklonjeni.push(l); const i = naKarti.indexOf(l); if (i >= 0) naKarti.splice(i, 1); },
    getPane: () => ({ querySelectorAll: () => ({ length: canvasa }) }),
  };
  const sandbox = {
    map,
    _poziLayer: null, _povArhLayer: null, _povArhSimLayer: null,
    _sjeLayer: null, _povGodLayer: null, _poziIncLayer: null,
    _poziOpozLayer: null, _povHistLayer: null,
    _poziCanvasRenderer: rendereri[0] || null,
    _povArhTackeRenderer: rendereri[1] || null,
    _povArhSimRenderer: rendereri[2] || null,
  };
  // sloj "na karti" se predaje kao ime ključa
  naKarti.filter(k => k in sandbox).forEach(k => { sandbox[k] = k; });
  const kljucevi = Object.keys(sandbox);
  const rez = new Function(...kljucevi, SRC +
    '\nconst zauzet = _poziPaneZauzet();' +
    '\nconst vratio = _poziCanvasOslobodi();' +
    '\nreturn { zauzet, vratio, canvasa:_poziPaneCanvasa(),' +
    '  paneKes:Object.keys(map._paneRenderers),' +
    '  preostali:[_poziCanvasRenderer,_povArhTackeRenderer,_povArhSimRenderer] };'
  )(...kljucevi.map(k => sandbox[k]));
  return { ...rez, uklonjeni };
}

console.log('_poziPaneZauzet — je li ijedan sloj požara još na karti:');

t('nijedan sloj nije na karti → pane je slobodan', () => {
  assert.strictEqual(run().zauzet, false);
});

t('sloj požara je na karti → pane je zauzet', () => {
  assert.strictEqual(run({ naKarti: ['_poziLayer'] }).zauzet, true);
});

t('arhiva požara na karti → pane je zauzet (crta tačke u pozariPane)', () => {
  assert.strictEqual(run({ naKarti: ['_povArhLayer'] }).zauzet, true);
});

console.log('\n_poziCanvasOslobodi — oslobađa SAMO kad nema šta da pokvari:');

t('KLJUČNO: prazan pane → renderer se stvarno ukloni sa karte', () => {
  const r = run({ naKarti: ['a', 'b', 'c'] });
  assert.strictEqual(r.vratio, true, 'mora javiti da je nešto oslobođeno');
  assert.deepStrictEqual(r.uklonjeni.sort(), ['a', 'b', 'c']);
});

t('poslije oslobađanja rendereri su null (sljedeće crtanje pravi svjež)', () => {
  assert.deepStrictEqual(run({ naKarti: ['a', 'b', 'c'] }).preostali, [null, null, null]);
});

t('KLJUČNO: sloj je JOŠ prikazan → NE dira canvas (inače bi obrisao tačke)', () => {
  const r = run({ naKarti: ['_poziLayer', 'a', 'b', 'c'] });
  assert.strictEqual(r.vratio, false);
  assert.deepStrictEqual(r.uklonjeni, [], 'canvas sloja koji se još crta se ne smije ukloniti');
});

t('nema renderera → vraća false, ne baca', () => {
  assert.strictEqual(run({ rendereri: [] }).vratio, false);
});

t('renderer postoji ali nije na karti → ništa se ne uklanja', () => {
  assert.strictEqual(run({ naKarti: [] }).vratio, false);
});

console.log('\n_poziPaneCanvasa — brojka koja objašnjava "ništa nije klikabilno":');

t('broji canvas elemente u panelima požara', () => {
  // po 1 canvas u svakom od dva panela
  assert.strictEqual(run({ canvasa: 1 }).canvasa, 2);
});

t('nedostupan pane vraća null, ne baca', () => {
  const api = new Function('map', SRC + '\nreturn { _poziPaneCanvasa };')(
    { getPane: () => { throw new Error('nema mape'); } });
  assert.strictEqual(api._poziPaneCanvasa(), null);
});

console.log('\nPozivaoci — oslobađanje je stvarno ukopčano:');

t('_poziToggle(false) oslobađa canvas', () => {
  assert.ok(extractFn('_poziToggle').includes('_poziCanvasOslobodi'));
});

t('_povArhSimZatvori oslobađa canvas', () => {
  assert.ok(extractFn('_povArhSimZatvori').includes('_poziCanvasOslobodi'));
});

t('_povArhRender oslobađa canvas kad nijedna godina nije uključena', () => {
  const src = extractFn('_povArhRender');
  assert.ok(/!god\.length[^\n]*_poziCanvasOslobodi/.test(src),
    'rani izlaz mora osloboditi canvas, inače zaostane prazan blokator');
});

t('_povArhSimRender PONOVO KORISTI renderer (ne pravi nov canvas po crtanju)', () => {
  const src = extractFn('_povArhSimRender');
  assert.ok(src.includes('_povArhSimRenderer'), 'mora koristiti dijeljeni renderer');
  assert.ok(!/const renderer = L\.canvas \?/.test(src),
    'nov canvas po svakom crtanju se gomilao u pane-u i svaki je gutao klikove');
});

console.log('\nPane-level renderer (Leaflet ga pravi sam) — v1.4.9:');

t('KLJUČNO: poligon projekcije drži pane ZAUZETIM (v1.4.8 ga je previdjela)', () => {
  assert.strictEqual(run({ naKarti: ['_poziOpozLayer'] }).zauzet, true,
    '_poziOpozLayer crta u pozariPovrsPane i JEDINI zavisi od pane-level renderera');
});

t('"Zadnjih 5 godina" također drži pane zauzetim', () => {
  assert.strictEqual(run({ naKarti: ['_povHistLayer'] }).zauzet, true);
});

t('KLJUČNO: pane-level renderer se uklanja sa karte (dosad je ostajao zauvijek)', () => {
  const r = run({ paneRend: { pozariPovrsPane: 'pl-640' } });
  assert.ok(r.uklonjeni.includes('pl-640'),
    'canvas koji je Leaflet sam napravio mora otići, inače i dalje guta klikove');
});

t('keš map._paneRenderers se BRIŠE (inače bi Leaflet vratio uklonjen renderer)', () => {
  const r = run({ paneRend: { pozariPovrsPane: 'pl-640', pozariPane: 'pl-645' } });
  assert.deepStrictEqual(r.paneKes, [],
    'bez delete-a bi sljedeći poligon crtao u odvojen, otkačen canvas');
});

t('pane-level renderer se NE dira dok je sloj prikazan', () => {
  const r = run({ naKarti: ['_poziOpozLayer'], paneRend: { pozariPovrsPane: 'pl-640' } });
  assert.strictEqual(r.vratio, false);
  assert.deepStrictEqual(r.uklonjeni, []);
  assert.deepStrictEqual(r.paneKes, ['pozariPovrsPane'], 'keš mora ostati netaknut');
});

t('_poziPaneCanvasa broji OBA panela, ne samo jedan', () => {
  assert.strictEqual(run({ canvasa: 2 }).canvasa, 4, '2 panela × 2 canvasa');
});

console.log('\n_klikDebugRender — blokada se VIDI u debug panelu:');

function klikDebug({ canvasa, zauzet, admin = true }) {
  const el = { innerHTML: '' };
  const sandbox = {
    document: { getElementById: (id) => id === 'klik-debug-card' ? el : null },
    sbProfile: admin ? { is_admin: true } : { is_admin: false },
    _poziPaneCanvasa: () => canvasa,
    _poziPaneZauzet: () => zauzet,
    _netRedHtml: (o, v) => '<i>' + o + '=' + v + '</i>',
  };
  const k = Object.keys(sandbox);
  new Function(...k, extractFn('_klikDebugRender') + '\n_klikDebugRender();')(...k.map(x => sandbox[x]));
  return el.innerHTML;
}

t('canvas zaostao a sloj NIJE prikazan → prijavljuje blokadu i nudi dugme', () => {
  const h = klikDebug({ canvasa: 1, zauzet: false });
  assert.ok(/Klikovi blokirani/.test(h), 'mora jasno reći da su klikovi blokirani');
  assert.ok(/_klikOslobodiSada/.test(h), 'mora ponuditi dugme za oslobađanje');
});

t('sloj JEST prikazan → canvas je legitiman, nema lažne uzbune', () => {
  const h = klikDebug({ canvasa: 1, zauzet: true });
  assert.ok(!/Klikovi blokirani/.test(h), 'canvas koji stvarno crta nije blokada');
});

t('nema canvasa → uredno stanje', () => {
  assert.ok(!/Klikovi blokirani/.test(klikDebug({ canvasa: 0, zauzet: false })));
});

t('ne-admin ne dobija karticu uopšte', () => {
  assert.strictEqual(klikDebug({ canvasa: 1, zauzet: false, admin: false }), '');
});

console.log('\n' + pass + ' prošlo, ' + fail + ' palo');
process.exit(fail ? 1 : 0);
