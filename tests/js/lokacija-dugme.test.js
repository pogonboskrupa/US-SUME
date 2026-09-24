// =====================================================================
// Testovi za _updLocBtn / _updCentarBtn (v1.6.6).
// Pokretanje:  node tests/js/lokacija-dugme.test.js
// ---------------------------------------------------------------------
// Dugme "Lokacija" u donjoj traci je ranije mijenjalo samo boju teksta kad je
// GPS uključen — iz njega se nije vidjelo traži li GPS još signal ili ga ima,
// ni kolika je preciznost. Sad nosi tri stanja (isključen / gps-trazi /
// gps-ok + bedž ±Nm), a "Centar" se ističe kad je karta odmaknuta od pozicije.
// Testira se STVARNI kod izvučen iz index.html.
// =====================================================================
'use strict';
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const HTML = fs.readFileSync(path.join(__dirname, '../../index.html'), 'utf8');

function extractFn(name) {
  const start = HTML.indexOf('function ' + name + '(');
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

function fakeEl() {
  const cls = new Set();
  const el = {
    writes: 0, textContent: '', title: '',
    classList: {
      toggle: (c, on) => { el.writes++; if (on) cls.add(c); else cls.delete(c); },
      contains: c => cls.has(c),
    },
    get className() { return el._cn || ''; },
    set className(v) { el.writes++; el._cn = v; },
    has: c => cls.has(c),
  };
  return el;
}

function makeEnv(st) {
  const els = { 'ab-loc': fakeEl(), 'ab-loc-acc': fakeEl(), 'ab-centar': fakeEl() };
  const src = 'let _locBtnKljuc = "";\n' + extractFn('_updLocBtn') + '\n' + extractFn('_updCentarBtn') +
    '\nreturn { _updLocBtn, _updCentarBtn };';
  const scope = {
    document: { getElementById: id => els[id] || null },
    get gpsOn() { return st.gpsOn; },
    get lastP() { return st.lastP; },
    get _lastGpsFixTime() { return st.fixT; },
    get _userPannedAway() { return st.panned; },
    Date: { now: () => st.now },
    isFinite,
  };
  // Getteri na objektu opsega daju testu da mijenja stanje između poziva.
  const api = new Function('scope', 'with (scope) { ' + src + ' }')(scope);
  return { api, els };
}

console.log('_updLocBtn — stanje GPS-a na dugmetu Lokacija:');

t('GPS isključen: nijedna klasa stanja, bedž prazan', () => {
  const st = { gpsOn: false, lastP: null, fixT: 0, now: 1e6, panned: false };
  const { api, els } = makeEnv(st);
  api._updLocBtn();
  assert.ok(!els['ab-loc'].has('gps-ok') && !els['ab-loc'].has('gps-trazi'));
  assert.strictEqual(els['ab-loc-acc'].textContent, '');
});

t('GPS uključen bez fiksa: gps-trazi', () => {
  const st = { gpsOn: true, lastP: null, fixT: 0, now: 1e6, panned: false };
  const { api, els } = makeEnv(st);
  api._updLocBtn();
  assert.ok(els['ab-loc'].has('gps-trazi') && !els['ab-loc'].has('gps-ok'));
});

t('svjež fiks ±6 m: gps-ok, bedž "±6m" bez upozoravajućeg tona', () => {
  const st = { gpsOn: true, lastP: { ac: 6.4 }, fixT: 1e6 - 2000, now: 1e6, panned: false };
  const { api, els } = makeEnv(st);
  api._updLocBtn();
  assert.ok(els['ab-loc'].has('gps-ok'));
  assert.strictEqual(els['ab-loc-acc'].textContent, '±6m');
  assert.strictEqual(els['ab-loc-acc'].className, 'ab-acc');
});

t('preciznost 18 m je "srednji", 150 m je "slab" i prikazuje se kao 99+', () => {
  const st = { gpsOn: true, lastP: { ac: 18 }, fixT: 1e6, now: 1e6, panned: false };
  const { api, els } = makeEnv(st);
  api._updLocBtn();
  assert.strictEqual(els['ab-loc-acc'].className, 'ab-acc srednji');
  st.lastP = { ac: 150 };
  api._updLocBtn();
  assert.strictEqual(els['ab-loc-acc'].className, 'ab-acc slab');
  assert.strictEqual(els['ab-loc-acc'].textContent, '±99+m');
});

t('fiks stariji od 30 s (krošnja, tunel) vraća na gps-trazi', () => {
  const st = { gpsOn: true, lastP: { ac: 5 }, fixT: 1e6 - 31000, now: 1e6, panned: false };
  const { api, els } = makeEnv(st);
  api._updLocBtn();
  assert.ok(els['ab-loc'].has('gps-trazi') && !els['ab-loc'].has('gps-ok'),
    'zastao fiks ne smije i dalje tvrditi da ima signala');
});

t('isto stanje ne dira DOM ponovo (zove se na svaki GPS fiks)', () => {
  const st = { gpsOn: true, lastP: { ac: 5 }, fixT: 1e6, now: 1e6, panned: false };
  const { api, els } = makeEnv(st);
  api._updLocBtn();
  const w = els['ab-loc'].writes + els['ab-loc-acc'].writes;
  api._updLocBtn(); api._updLocBtn();
  assert.strictEqual(els['ab-loc'].writes + els['ab-loc-acc'].writes, w);
});

console.log('\n_updCentarBtn — Centar se ističe kad je karta odmaknuta:');

t('odmaknuta karta + GPS fiks → "odmaknuto"; vraćanje ga gasi', () => {
  const st = { gpsOn: true, lastP: { ac: 5 }, fixT: 1e6, now: 1e6, panned: true };
  const { api, els } = makeEnv(st);
  api._updCentarBtn();
  assert.ok(els['ab-centar'].has('odmaknuto'));
  st.panned = false;
  api._updCentarBtn();
  assert.ok(!els['ab-centar'].has('odmaknuto'));
});

t('bez GPS-a nema na šta centrirati → nije istaknuto ni kad je odmaknuto', () => {
  const st = { gpsOn: false, lastP: null, fixT: 0, now: 1e6, panned: true };
  const { api, els } = makeEnv(st);
  api._updCentarBtn();
  assert.ok(!els['ab-centar'].has('odmaknuto'));
});

console.log('\nInvarijante nad markupom:');

t('dugmad na karti nemaju ＋/－/⭐/⏸/▶/⊕ znakove fonta (OEM WebView ih crta različito)', () => {
  const ctrl = HTML.slice(HTML.indexOf('<div id="map-ctrl-bar"'), HTML.indexOf('<!-- Kolege live indicator'));
  const ab = HTML.slice(HTML.indexOf('<div id="action-bar">'), HTML.indexOf('<!-- Trag quick meta panel'));
  for (const z of ['＋', '－', '⭐', '⏸', '▶', '⊕']) {
    assert.ok(!ctrl.includes(z) && !ab.includes(z), 'nađen znak ' + z);
  }
  assert.ok(!/ico\.textContent = '(▶|⏸)'/.test(HTML), 'pauza/nastavi ne smiju vraćati znak fonta');
});

t('bedž preciznosti postoji unutar ikone dugmeta Lokacija', () => {
  assert.ok(/id="ab-loc"[\s\S]{0,200}id="ab-loc-acc"/.test(HTML));
});

console.log('\n' + pass + ' prošlo, ' + fail + ' palo');
process.exit(fail ? 1 : 0);
