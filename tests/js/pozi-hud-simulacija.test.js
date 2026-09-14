// =====================================================================
// Testovi za poboljšanja simulacije požara (v1.4.2):
//  1) pravac širenja se računa SAMO za aktivan (najnoviji ≤24h) požar,
//  2) modal simulacije je smanjen i centrira požar u VIDLJIVI dio karte
//     (ne iza panela koji se upravo otvara ispod).
// Pokretanje:  node tests/js/pozi-hud-simulacija.test.js
// ---------------------------------------------------------------------
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
function t(name, fn) {
  return Promise.resolve().then(fn)
    .then(() => { console.log('  ✔ ' + name); pass++; })
    .catch(e => { console.log('  ✘ ' + name + '\n      ' + (e && e.message)); fail++; });
}

console.log('Pravac širenja — samo za AKTIVAN požar:');

function makeSmjerEnv(opts) {
  const o = opts || {};
  const pozvano = { aspekt: 0, unija: 0 };
  const sandbox = {
    _poziSmjerLayer: null, _poziSmjerBusy: false,
    _poziSmjerOn: () => true,
    _poziOn: o.poziOn !== undefined ? o.poziOn : true,
    _poziEvts: o.evts || [{ la: 44.9, lo: 16.2, zadnji: o.zadnji }],
    _poziMet: o.met,
    map: { removeLayer(){}, addLayer(){} },
    L: {
      layerGroup: () => ({ addTo: (m) => ({ layer: true, addedTo: m }) }),
      polyline: () => ({ addTo: () => ({}) }),
      marker: () => ({ bindTooltip: () => ({ addTo: () => ({}) }) }),
      divIcon: () => ({}),
    },
    turf: { destination: () => { pozvano.unija++; return { geometry: { coordinates: [16.21, 44.91] } }; } },
    _poziAspektNaTacki: async () => { pozvano.aspekt++; return { uzbrdo: 90 }; },
    _poziSmjerBlend: () => 45,
    _azimutSmjer: () => 'SI',
  };
  const src = [extractFn('_poziStatusPozara'), extractFn('_poziSmjerAzuriraj')].join('\n');
  const keys = Object.keys(sandbox);
  const fn = new Function(...keys, src + '\nreturn _poziSmjerAzuriraj;')(...keys.map(k => sandbox[k]));
  return { run: fn, pozvano, sandbox };
}

(async () => {

await t('požar viđen PRIJE VIŠE od 24h (neaktivan) — strelica se NE računa', async () => {
  // met.naj MORA pokazivati na ISTI požar (isto kao u "aktivan" testu ispod)
  // da test stvarno dokaže da baš STATUS gasi strelicu — prvi pokušaj ovog
  // testa je slao met.naj:null, pa je i STARI kod (bez ove popravke) prolazio
  // "iz pogrešnog razloga" (rano se vraćao na "nema vjetra", ne na status).
  const g = { la: 44.9, lo: 16.2, zadnji: Date.now() - 48 * 3600000 };
  const env = makeSmjerEnv({ evts: [g], met: { naj: g, kodPozara: { vjetarSmjer: 90, vjetarMs: 3 } } });
  await env.run();
  assert.strictEqual(env.pozvano.aspekt, 0, 'ne smije se ni pitati za nagib terena za neaktivan požar');
  assert.strictEqual(env.pozvano.unija, 0, 'geometrija strelice se ne smije ni pokušati izračunati');
});

await t('požar viđen unutar zadnjih 24h (aktivan), vjetar dostupan — strelica SE računa', async () => {
  // NAPOMENA: met.naj mora biti ISTA referenca kao evts[0] VEĆ pri konstrukciji
  // sandboxa — new Function(...)(...vrijednosti) kopira argumente, pa naknadno
  // mijenjanje env.sandbox._poziMet posle konstrukcije NE utiče na zatvorenje
  // unutar već izgrađene funkcije (prvi pokušaj ovog testa je nasjeo baš na to).
  const g = { la: 44.9, lo: 16.2, zadnji: Date.now() - 2 * 3600000 };
  const env = makeSmjerEnv({ evts: [g], met: { naj: g, kodPozara: { vjetarSmjer: 90, vjetarMs: 3 } } });
  await env.run();
  assert.strictEqual(env.pozvano.aspekt, 1, 'aktivan požar sa vjetrom mora pokušati izračunati pravac');
  // _poziSmjerLayer je parametar (lokalna promjenljiva generisane funkcije) —
  // njena reassignacija se ne odražava na env.sandbox objekat, pa se uspjeh
  // provjerava preko toga da je i geometrija strelice STVARNO izračunata
  // (turf.destination pozvan), ne preko čitanja te promjenljive spolja.
  assert.strictEqual(env.pozvano.unija, 1, 'geometrija strelice (turf.destination) mora biti izračunata');
});

await t('tačno na granici (24h) se i dalje tretira kao aktivan (isti prag kao _poziStatusPozara)', async () => {
  const g = { la: 44.9, lo: 16.2, zadnji: Date.now() - 24 * 3600000 + 1000 }; // 1s ispod granice
  const env = makeSmjerEnv({ evts: [g], met: { naj: g, kodPozara: { vjetarSmjer: 90, vjetarMs: 3 } } });
  await env.run();
  assert.strictEqual(env.pozvano.aspekt, 1);
});

console.log('\nCentriranje HUD-a — požar mora ostati u VIDLJIVOM dijelu ekrana:');

function makeHudLatLngEnv(mapSize, zoom) {
  // project/unproject rade nad jednostavnom linearnom "svjetskom" osom (bez
  // prave Web Mercator projekcije) — dovoljno da provjeri SMJER i IZNOS
  // pomjeraja, ne stvarnu geografsku tačnost (to je Leafletova odgovornost).
  const L = {
    latLng: (la, lo) => ({ la, lo, __ll: true }),
    point: (x, y) => ({ x, y }),
  };
  const map = {
    getSize: () => ({ x: mapSize.x, y: mapSize.y }),
    getZoom: () => zoom,
    project: (latlng, z) => ({ x: latlng[1] * 100, y: -latlng[0] * 100 }), // izmišljena, ali BIJEKTIVNA transformacija
    unproject: (pt, z) => [-pt.y / 100, pt.x / 100],
  };
  const sandbox = { map, L, _POZ_HUD_MAXH_PCT: 0.34, _POZ_HUD_BOTTOM_PX: 70 };
  const src = extractFn('_poziHudLatLng');
  const keys = Object.keys(sandbox);
  const fn = new Function(...keys, src + '\nreturn _poziHudLatLng;')(...keys.map(k => sandbox[k]));
  return { run: fn, map };
}

await t('pomjeraj ide u ISPRAVNOM smjeru — nova latlng je sjevernije (gore na karti) od originala', async () => {
  const env = makeHudLatLngEnv({ x: 400, y: 800 }, 13);
  const rez = env.run(44.9, 16.2, 13);
  // Cilj: kad se NOVI centar mape (rez) prikaže na sredini ekrana, ORIGINALNA
  // tačka (44.9) mora ispasti IZNAD sredine (u vidljivom dijelu iznad HUD-a).
  // To znači da je NOVI centar POMJEREN JUŽNIJE (manja latitude) od originala
  // — sjever je "gore" na karti, pa manji centar znači da original ispada gore.
  assert.ok(rez[0] < 44.9, 'novi centar mora biti južnije od originalne tačke da bi tačka ispala u gornjem dijelu ekrana: ' + rez[0]);
});

await t('kad je vidljivi prostor pun ekran (HUD zauzima 0), tačka se NE pomjera', async () => {
  const sandbox = { map: { getSize: () => ({x:400,y:800}), getZoom: () => 13, project: (ll,z)=>({x:ll[1]*100,y:-ll[0]*100}), unproject:(pt,z)=>[-pt.y/100, pt.x/100] },
    L: { latLng: (la,lo) => ({la,lo}), point:(x,y)=>({x,y}) },
    _POZ_HUD_MAXH_PCT: 0, _POZ_HUD_BOTTOM_PX: 0 };
  const src = extractFn('_poziHudLatLng');
  const keys = Object.keys(sandbox);
  const fn = new Function(...keys, src + '\nreturn _poziHudLatLng;')(...keys.map(k => sandbox[k]));
  const rez = fn(44.9, 16.2, 13);
  assert.ok(Math.abs(rez.la - 44.9) < 1e-9 && Math.abs(rez.lo - 16.2) < 1e-9,
    'bez HUD-a (pomjeraj<=0) mora vratiti TAČNO originalnu tačku (L.latLng granu)');
});

await t('greška u project/unproject se ne ruši — vraća originalnu tačku (L.latLng fallback)', async () => {
  const sandbox = {
    map: { getSize: () => { throw new Error('nema mape'); }, getZoom: () => 13 },
    L: { latLng: (la, lo) => ({ la, lo }) },
    _POZ_HUD_MAXH_PCT: 0.34, _POZ_HUD_BOTTOM_PX: 70,
  };
  const src = extractFn('_poziHudLatLng');
  const keys = Object.keys(sandbox);
  const fn = new Function(...keys, src + '\nreturn _poziHudLatLng;')(...keys.map(k => sandbox[k]));
  const rez = fn(44.9, 16.2);
  assert.deepStrictEqual(rez, { la: 44.9, lo: 16.2 });
});

console.log('\n' + pass + ' prošlo, ' + fail + ' palo');
process.exit(fail ? 1 : 0);

})();
