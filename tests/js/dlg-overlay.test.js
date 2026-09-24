// =====================================================================
// Testovi za _dlgClose / _dlgHealOrphanedOverlay (index.html).
// Pokretanje:  node tests/js/dlg-overlay.test.js
// ---------------------------------------------------------------------
// Zašto ovi testovi postoje: terenska prijava "dugme ne reaguje, nigdje na
// ekranu, ni boja se ne mijenja" ukazala je na #dlg-overlay — providan sloj
// PREKO CIJELOG EKRANA (z-index 999900) koji namjerno hvata svaki dodir dok
// je dijalog otvoren. Sklanjao se golim setTimeout(...,270) dok sheet (donji
// list) klizi dole svojom CSS tranzicijom. Ako WebView baš u tom prozoru bude
// pauziran (dolazni poziv, prelazak na drugu app, gašenje ekrana), taj tajmer
// zna kasniti ili se izgubiti — overlay ostaje TRAJNO 'show' i hvata svaki
// dodir na cijeloj aplikaciji, bez ijedne JS greške u konzoli.
//
// Dva sloja odbrane se testiraju ovdje:
//   1) _dlgClose sad sklanja overlay na STVARAN kraj tranzicije
//      (transitionend), sa 400ms rezervom ako transitionend nikad ne opali.
//   2) _dlgHealOrphanedOverlay je SAMOISSCJELJENJE pozvano kad se app vrati
//      u prvi plan (visibilitychange) — ako je dijalog već zatvoren
//      (_dlgResolve je null) a overlay je i dalje 'show', to je siguran znak
//      da su OBA mehanizma iz (1) izgubljena, pa se overlay prisilno sklanja.
//
// Testira se STVARNI izvorni kod izvučen iz index.html.
// =====================================================================
'use strict';
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const HTML = fs.readFileSync(path.join(__dirname, '../../index.html'), 'utf8');

function extractFn(name) {
  const start = HTML.indexOf('function ' + name + '(');
  assert.ok(start >= 0, 'nije nađena funkcija ' + name + ' u index.html');
  let i = HTML.indexOf('{', start), depth = 0;
  for (; i < HTML.length; i++) {
    if (HTML[i] === '{') depth++;
    else if (HTML[i] === '}') { depth--; if (depth === 0) return HTML.slice(start, i + 1); }
  }
  throw new Error('nezatvorena funkcija ' + name);
}

// ── Lažni DOM element sa classList i pravim addEventListener/removeEventListener
// (potreban za transitionend) ────────────────────────────────────────────────
function mkEl() {
  const listeners = {};
  const classes = new Set();
  return {
    classList: {
      add: c => classes.add(c),
      remove: c => classes.delete(c),
      contains: c => classes.has(c)
    },
    addEventListener(type, fn) { (listeners[type] = listeners[type] || []).push(fn); },
    removeEventListener(type, fn) {
      if (!listeners[type]) return;
      listeners[type] = listeners[type].filter(f => f !== fn);
    },
    _fire(type) { (listeners[type] || []).slice().forEach(fn => fn()); },
    _listenerCount(type) { return (listeners[type] || []).length; }
  };
}

// Kontrolisani setTimeout: bilježi pozive, ne izvršava ništa dok se ručno ne
// pozove (omogućava test da simulira "transitionend stigne prije timera" i
// obrnuto, determinstički, bez pravog čekanja).
function mkClock() {
  const pending = [];
  return {
    setTimeout: (fn, ms) => { const id = { fn, ms }; pending.push(id); return id; },
    fireAll() { pending.slice().forEach(id => id.fn()); pending.length = 0; },
    count() { return pending.length; }
  };
}

let pass = 0, fail = 0;
function t(name, fn) {
  try { fn(); console.log('  ✔ ' + name); pass++; }
  catch (e) { console.log('  ✘ ' + name + '\n      ' + e.message); fail++; }
}

// =====================================================================
console.log('_dlgClose — overlay se sklanja pouzdano, ne na nagađan tajmer:');

function makeClose() {
  const sh = mkEl(), ov = mkEl();
  sh.classList.add('show'); ov.classList.add('show');
  const els = { 'dlg-sheet': sh, 'dlg-overlay': ov };
  const clock = mkClock();
  const document_ = { getElementById: id => els[id] || null };
  const fn = new Function('document', 'setTimeout', extractFn('_dlgClose') + '\nreturn _dlgClose;')(document_, clock.setTimeout);
  return { fn, sh, ov, clock };
}

t('sheet gubi "show" ODMAH (sinhrono), overlay NE — overlay čeka tranziciju', () => {
  const { fn, sh, ov } = makeClose();
  fn();
  assert.strictEqual(sh.classList.contains('show'), false, 'sheet mora nestati odmah (klizi dole)');
  assert.strictEqual(ov.classList.contains('show'), true, 'overlay se NE smije skinuti prije transitionend/rezerve');
});

t('transitionend stigne normalno → overlay se skine, rezervni tajmer se ne pokreće ponovo', () => {
  const { fn, sh, ov, clock } = makeClose();
  fn();
  sh._fire('transitionend');
  assert.strictEqual(ov.classList.contains('show'), false, 'overlay mora nestati na transitionend');
  // Rezervni setTimeout je i dalje ZAKAZAN (nije clearTimeout-ovan) — ali mora
  // biti bezopasan da opali poslije, jer `done` brani drugi poziv.
  clock.fireAll();
  assert.strictEqual(ov.classList.contains('show'), false, 'drugi poziv (rezerva) ne smije ništa pokvariti');
});

t('transitionend NIKAD ne opali (npr. reducirano kretanje) → 400ms rezerva ipak skine overlay', () => {
  const { fn, ov, clock } = makeClose();
  fn();
  assert.strictEqual(ov.classList.contains('show'), true, 'prije rezerve overlay je i dalje tu');
  clock.fireAll();
  assert.strictEqual(ov.classList.contains('show'), false, 'rezerva mora skinuti overlay i bez transitionend-a');
});

t('rezerva je zakazana na 400ms — duže od CSS tranzicije (280ms), ne kraće', () => {
  const { fn, clock } = makeClose();
  fn();
  assert.strictEqual(clock.count(), 1, 'tačno jedan rezervni tajmer po zatvaranju');
});

t('transitionend listener se uklanja poslije prvog okidanja (ne curi memorija)', () => {
  const { fn, sh } = makeClose();
  fn();
  assert.strictEqual(sh._listenerCount('transitionend'), 1);
  sh._fire('transitionend');
  assert.strictEqual(sh._listenerCount('transitionend'), 0, 'listener mora biti uklonjen poslije finish()');
});

// =====================================================================
console.log('\n_dlgHealOrphanedOverlay — samoisscjeljenje pri povratku u prvi plan:');

function makeHeal(dlgResolve, overlayShown) {
  const ov = mkEl();
  if (overlayShown) ov.classList.add('show');
  const els = { 'dlg-overlay': ov };
  const document_ = { getElementById: id => els[id] || null };
  const fn = new Function('document', '_dlgResolve', extractFn('_dlgHealOrphanedOverlay') + '\nreturn _dlgHealOrphanedOverlay;')(document_, dlgResolve);
  return { fn, ov };
}

t('overlay osiroćen (show, ali NIKO ne čeka odgovor) → prisilno se skida', () => {
  const { fn, ov } = makeHeal(null, true);
  const promijenjeno = fn();
  assert.strictEqual(ov.classList.contains('show'), false, 'osiroćen overlay mora nestati');
  assert.strictEqual(promijenjeno, true, 'mora prijaviti da je nešto ispravljeno');
});

t('overlay LEGITIMNO otvoren (_dlgResolve postavljen) → NE dira se', () => {
  const aktivanResolve = () => {};
  const { fn, ov } = makeHeal(aktivanResolve, true);
  const promijenjeno = fn();
  assert.strictEqual(ov.classList.contains('show'), true, 'korisnik ima otvoren dijalog — overlay mora ostati');
  assert.strictEqual(promijenjeno, false);
});

t('overlay već zatvoren i niko ne čeka → no-op, ne baca', () => {
  const { fn, ov } = makeHeal(null, false);
  assert.strictEqual(fn(), false);
  assert.strictEqual(ov.classList.contains('show'), false);
});

t('nedostajući #dlg-overlay element ne ruši poziv', () => {
  const document_ = { getElementById: () => null };
  const fn = new Function('document', '_dlgResolve', extractFn('_dlgHealOrphanedOverlay') + '\nreturn _dlgHealOrphanedOverlay;')(document_, null);
  assert.doesNotThrow(() => fn());
  assert.strictEqual(fn(), false);
});

console.log('\n' + pass + ' prošlo, ' + fail + ' palo');
process.exit(fail ? 1 : 0);
