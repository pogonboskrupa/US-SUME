// =====================================================================
// Testovi za crtanje panela Požari — kad se NE crta i koliko puta (v1.4.0).
// Pokretanje:  node tests/js/pozari-panel-throttle.test.js
// ---------------------------------------------------------------------
// Terenska prijava: sekcija Požari "šteka". Uzrok nije jedan spor račun nego
// učestalost: _poziRenderPanel gradi kompletan HTML panela (kartice, liste,
// legende) i uz to, kroz _povArhKarticaHtml, ponovo crta arhivsku geometriju
// na karti — a zove se sa 38 mjesta, uključujući _poziStatusSet, koji opali
// na SVAKI GPS/meteo/status događaj. Dvije posljedice:
//   1) panel se crtao i dok korisnik uopšte NIJE u sekciji Požari (snima
//      vlaku na Karti) — rezultat niko ne vidi, a trošak se plaća;
//   2) jedan potez (uključi → učitaj → status → meteo) davao je ČETIRI puna
//      crtanja u istom tiku umjesto jednog.
//
// Testira se STVARNI _poziRenderPanel izvučen iz index.html, sa stubovanim
// _poziRenderPanelSad (stvarno crtanje traži cijeli DOM i Leaflet) — ovdje se
// mjeri KOLIKO PUTA i DA LI se crtanje uopšte dogodi, što je i bio problem.
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

const SRC = extractFn('_poziRenderPanel');

let pass = 0, fail = 0;
function t(name, fn) {
  return Promise.resolve().then(fn)
    .then(() => { console.log('  ✔ ' + name); pass++; })
    .catch(e => { console.log('  ✘ ' + name + '\n      ' + (e && e.message)); fail++; });
}

// Sandbox: _activeTab je promjenljiva pa ide kroz kutiju da je test može
// mijenjati "u letu" (korisnik prelazi sa Karte na Požare).
function makeEnv(tab) {
  const stanje = { crtanja: 0, tab: tab || 'karta' };
  const raf = [];
  // _poziPanelZakazan/_poziPanelZaostao su modulske promjenljive deklarisane
  // iznad same funkcije (let), pa ih extractFn ne hvata — bez ovoga izvučeni
  // kod puca na ReferenceError (ista zamka dokumentovana za _poziNotifTimer).
  const fn = new Function('_poziRenderPanelSad', 'requestAnimationFrame', 'console', 'tabBox',
    'const _t = tabBox; let _poziPanelZakazan = false, _poziPanelZaostao = false;' +
    SRC.replace(/_activeTab/g, '_t.tab') +
    '\nreturn _poziRenderPanel;'
  )(() => { stanje.crtanja++; }, (cb) => raf.push(cb), console, stanje);
  return {
    render: fn,
    stanje,
    // "Sljedeći frame" — pusti sve zakazane rAF callbackove.
    frame: () => { const q = raf.splice(0); q.forEach(cb => cb()); }
  };
}

(async () => {

console.log('Panel se ne crta dok se ne gleda:');

await t('korisnik je na Karti → crtanja NEMA (ni poslije frame-a)', async () => {
  const e = makeEnv('karta');
  e.render(); e.render(); e.render();
  e.frame();
  assert.strictEqual(e.stanje.crtanja, 0,
    'panel koji niko ne gleda ne smije trošiti ni jedan puni rebuild');
});

await t('korisnik je u sekciji Požari → crta se', async () => {
  const e = makeEnv('pozari');
  e.render();
  e.frame();
  assert.strictEqual(e.stanje.crtanja, 1);
});

console.log('\nVišestruki pozivi u istom tiku daju JEDNO crtanje:');

await t('četiri poziva (toggle → load → status → meteo) = jedno crtanje', async () => {
  const e = makeEnv('pozari');
  e.render(); e.render(); e.render(); e.render();
  e.frame();
  assert.strictEqual(e.stanje.crtanja, 1,
    'bez sažimanja bi isti korisnički potez dao četiri puna rebuilda');
});

await t('novi poziv POSLIJE frame-a se opet crta (sažimanje nije trajno gašenje)', async () => {
  const e = makeEnv('pozari');
  e.render(); e.frame();
  e.render(); e.frame();
  assert.strictEqual(e.stanje.crtanja, 2);
});

console.log('\nOtpornost:');

await t('greška u samom crtanju ne ruši pozivaoca (GPS/meteo tok ide dalje)', async () => {
  const stanje = { tab: 'pozari' };
  const raf = [];
  const fn = new Function('_poziRenderPanelSad', 'requestAnimationFrame', 'console', 'tabBox',
    'const _t = tabBox; let _poziPanelZakazan = false, _poziPanelZaostao = false;'
    + SRC.replace(/_activeTab/g, '_t.tab') + '\nreturn _poziRenderPanel;'
  )(() => { throw new Error('puklo crtanje'); }, (cb) => raf.push(cb),
    { error: () => {} }, stanje);
  fn();
  assert.doesNotThrow(() => raf.splice(0).forEach(cb => cb()),
    'pad crtanja panela ne smije oboriti GPS/meteo putanju koja ga je pozvala');
});

console.log('\n' + pass + ' prošlo, ' + fail + ' palo');
process.exit(fail ? 1 : 0);

})();
