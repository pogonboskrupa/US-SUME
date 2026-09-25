// =====================================================================
// Tragovi projektanata u istom odjelu doznake (v1.7.5).
// Pokretanje:  node tests/js/doznaka-tragovi.test.js
// ---------------------------------------------------------------------
// - Pređena (pokrivena) površina je bila ZBIR pojaseva po segmentu traga —
//   isti dio pređen dvaput i preklop dvojice projektanata brojani dvaput.
// - Moje neposlane (offline) tačke nisu ulazile u prikaz ni računicu.
// - Dedup je poredio TEKST vremena ('+00:00' sa servera vs 'Z' sa telefona).
// Nad STVARNIM kodom iz index.html i STVARNIM turf-om iz static/libs.
// =====================================================================
'use strict';
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const HTML = fs.readFileSync(path.join(__dirname, '../../index.html'), 'utf8');
const turf = require('../../static/libs/turf.min.js');

function extractFn(name) {
  let start = HTML.indexOf('function ' + name + '(');
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

function env({ tracks = [], buf = [], selId = 'O1' } = {}) {
  const store = { tvlake_doz_track_buf: JSON.stringify(buf) };
  const fns = ['_dozTackaMs', '_dozTragoviPoKorisniku', '_dozTragoviPotpis', '_dozBuildUserTracks',
    '_dozComputeBands', '_dozPokrivenost', '_dozGetBoundaryGeoJSON', '_dozTrackLenByUser'].map(extractFn).join('\n');
  const f = new Function('turf', 'localStorage', '_DOZ_TRACK_BUF_KEY', 'dst', 'S',
    `let _dozTracks = S.tracks, _dozSelId = S.selId, _DOZ_BAND_OUTER_M = 20;
     let _dozUTMemo = { k: null, v: null }, _dozBandsMemo = { k: null, v: null }, _dozPokrMemo = { k: null, v: null };
     ${fns}
     return { _dozTragoviPoKorisniku, _dozComputeBands, _dozPokrivenost, _dozTrackLenByUser };`);
  const dst = (la1, lo1, la2, lo2) => turf.distance([lo1, la1], [lo2, la2], { units: 'meters' });
  return f(turf, { getItem: k => store[k] ?? null }, 'tvlake_doz_track_buf', dst, { tracks, selId });
}

// Odjel ~600 x 440 m oko 44.9N 16.1E
const ODJEL = { id: 'O1', boundary_geojson: { type: 'Polygon', coordinates: [[[16.1, 44.9], [16.1075, 44.9], [16.1075, 44.904], [16.1, 44.904], [16.1, 44.9]]] } };
const t0 = Date.parse('2026-09-25T08:00:00Z');
// Trag: prava linija istok-zapad na širini la, tačka svakih ~40 m, od sesije s.
function linija(uid, la, s, nazad = false, fmt = 'Z') {
  const n = 14, out = [];
  for (let i = 0; i < n; i++) {
    const k = nazad ? n - 1 - i : i;
    const ms = t0 + s * 3600e3 + i * 20e3;
    const iso = new Date(ms).toISOString();
    out.push({ user_id: uid, project_id: 'O1', latitude: la, longitude: 16.1005 + k * 0.0005,
      recorded_at: fmt === 'Z' ? iso : iso.replace('Z', '+00:00') });
  }
  return out;
}

console.log('Tragovi projektanata — pokrivenost:');

t('isti dio pređen DVAPUT (dvije sesije) ne udvostručava pokrivenu površinu', () => {
  const tr = [...linija('A', 44.902, 0), ...linija('A', 44.902, 1, true)];
  const e = env({ tracks: tr });
  const bands = e._dozComputeBands(ODJEL);
  const zbir = bands.reduce((s, b) => s + b.areaHa, 0);
  const pokr = e._dozPokrivenost(ODJEL);
  assert.strictEqual(bands.length, 2, 'očekivana 2 segmenta');
  assert.ok(zbir > pokr.ukupnoHa * 1.8, `zbir ${zbir.toFixed(2)} vs spojeno ${pokr.ukupnoHa.toFixed(2)}`);
  assert.ok(Math.abs(pokr.ukupnoHa - bands[0].areaHa) < 0.05, 'spojeno ≈ jedan pojas');
});

t('dva projektanta: ukupno = spojeno, preklop se izdvaja, pokrivenost ≤ površina odjela', () => {
  const tr = [...linija('A', 44.9018, 0), ...linija('B', 44.9021, 0)];   // ~33 m razmaka
  const e = env({ tracks: tr });
  const pokr = e._dozPokrivenost(ODJEL);
  const zbir = pokr.poKorisniku.A + pokr.poKorisniku.B;
  assert.ok(pokr.ukupnoHa <= zbir + 1e-9);
  assert.ok(Math.abs(zbir - pokr.ukupnoHa - pokr.preklopHa) < 1e-6);
  const odjelHa = turf.area(turf.polygon(ODJEL.boundary_geojson.coordinates)) / 10000;
  assert.ok(pokr.ukupnoHa <= odjelHa);
});

console.log('\nTragovi projektanata — izvor tačaka:');

t('moje NEPOSLANE tačke (offline bafer) ulaze u računicu, samo za otvoreni odjel', () => {
  const buf = [...linija('JA', 44.903, 0), ...linija('JA', 44.903, 0).map(p => ({ ...p, project_id: 'DRUGI' }))];
  const e = env({ tracks: [], buf });
  const bu = e._dozTragoviPoKorisniku();
  assert.strictEqual(bu.JA.length, 14);
  assert.ok(e._dozPokrivenost(ODJEL).poKorisniku.JA > 0);
});

t('ista tačka sa servera (+00:00) i iz bafera (Z) se broji JEDNOM', () => {
  const srv = linija('JA', 44.903, 0, false, '+00:00');
  const buf = linija('JA', 44.903, 0, false, 'Z');
  const bu = env({ tracks: srv, buf })._dozTragoviPoKorisniku();
  assert.strictEqual(bu.JA.length, 14);
});

t('tačke se redaju po VREMENU, ne po dolasku (kasno stigla offline tačka)', () => {
  const pts = linija('B', 44.902, 0);
  const izmijesano = [pts[5], pts[0], pts[13], ...pts.slice(1, 5), ...pts.slice(6, 13)];
  const bu = env({ tracks: izmijesano })._dozTragoviPoKorisniku();
  const ms = bu.B.map(p => Date.parse(p.recorded_at));
  for (let i = 1; i < ms.length; i++) assert.ok(ms[i] > ms[i - 1]);
  const len = env({ tracks: izmijesano })._dozTrackLenByUser().B;
  const lenRedom = env({ tracks: pts })._dozTrackLenByUser().B;
  assert.ok(Math.abs(len - lenRedom) < 0.01, 'dužina ne smije zavisiti od redoslijeda dolaska');
});

console.log('\nInvarijante:');

t('karta se centrira samo pri otvaranju odjela, realtime tačka kolege ne povlači SVE tačke', () => {
  const m = extractFn('dozRenderMapLayers');
  assert.ok(/_dozFitId !== odjel\.id/.test(m), 'fitBounds nije uslovljen');
  const sub = extractFn('_dozSubProject');
  assert.ok(/_dozTracks\.push\(r\)/.test(sub) && /_dozOsvjeziTragove\(projectId\)/.test(sub));
});

console.log('\n' + pass + ' prošlo, ' + fail + ' palo');
process.exit(fail ? 1 : 0);
