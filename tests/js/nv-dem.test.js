// =====================================================================
// N.V. prati kartu i kretanje — iz DEM-a, i offline (v1.7.8).
// Pokretanje:  node tests/js/nv-dem.test.js
// ---------------------------------------------------------------------
// Prijava: "kako idem po karti želim da se mijenja nadmorska visina".
// Uzroci: (1) N.V. je dolazila SAMO sa Open-Meteo API-ja — bez signala nikad;
// (2) fetchElev je visinu centra bacao kad je karta odmaknuta a GPS radi
// (provjera !_gpsAlt, a onP _gpsAlt tad ne spušta); (3) GPS visina je
// elipsoidna (~45 m previsoka u BiH). Test pušta STVARNI blok iz index.html
// nad lažnim Cache Storage-om i mrežom.
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
const BLOK = HTML.slice(HTML.indexOf('// === NADMORSKA VISINA ==='), HTML.indexOf('// === COLORS ==='));

const URL_T = (z, x, y) => `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${x}/${y}.png`;
const lon2x = new Function(extractFn('_termLon2x') + ';return _termLon2x;')();
const lat2y = new Function(extractFn('_termLat2y') + ';return _termLat2y;')();

// Pločica kao "slika" nosi svoju visinu; lažni decode je samo vrati.
function ravnaPlocica(h) { const a = new Float32Array(256 * 256); a.fill(h); return a; }

function env(opts = {}) {
  const kes = new Map(opts.kes || []);           // url -> Float32Array
  const mreza = new Map(opts.mreza || []);       // url -> Float32Array
  const dom = { onv: { textContent: '' }, 'nv-val': { textContent: '' } };
  const log = { mreza: [], meteo: 0 };
  const caches = { open: async () => ({
    match: async (u) => kes.has(u) ? { blob: async () => kes.get(u) } : undefined,
    put: async (u, r) => { if (opts.kvotaPoslije != null && kes.size >= opts.kvotaPoslije) { const e = new Error('q'); e.name = 'QuotaExceededError'; throw e; } kes.set(u, r); },
  }) };
  const navigator = { onLine: opts.online !== false };
  const g = {
    document: { getElementById: (id) => dom[id] || null },
    window: { caches },                      // 'caches' in window
    caches, navigator,
    createImageBitmap: async (b) => b,
    _terrariumDecodeTile: (img) => img,
    _TERR_CACHE: 'tvlake-terr-v1',
    _termLon2x: lon2x, _termLat2y: lat2y,
    _getTerrariumTile: async (z, x, y) => { const u = URL_T(z, x, y); log.mreza.push(u); return mreza.get(u) || null; },
    _fetchT: async (u) => { if (opts.dl) { log.mreza.push(u); return opts.dl(u); } log.meteo++; if (opts.meteo == null) throw new Error('mreža'); return { json: async () => ({ elevation: [opts.meteo] }) }; },
    _recFreeView: false,
    setTimeout: (f) => { f(); return 1; }, clearTimeout: () => {},
  };
  const names = Object.keys(g);
  const api = new Function(...names, BLOK + `
    return { _nvDemOcitaj, _nvDemSync, _nvDemUcitaj, _nvZaTacku, _nvZaPoziciju, _nvPratiCentar,
             fetchElev, debouncedUpdElev, _NV_DEM_Z, _nvDemPlociceZa, _nvDemPreuzmi, _nvDemVelicinaTxt,
             get nemaVel() { return _nvDemNema.size; },
             set gpsAlt(v) { _gpsAlt = v; }, set pannedAway(v) { _userPannedAway = v; } };`)(...names.map(k => g[k]));
  return { api, dom, log, kes, navigator };
}

const LAT = 44.93, LNG = 15.87;   // Bosanska Krupa
const tile = (z) => [Math.floor(lon2x(LNG, z)), Math.floor(lat2y(LAT, z))];
const [X12, Y12] = tile(12);

let pass = 0, fail = 0;
const tests = [];
const t = (name, fn) => tests.push([name, fn]);

t('bilinearno očitavanje prati nagib unutar pločice', () => {
  const { api } = env();
  const a = new Float32Array(256 * 256);
  for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) a[y * 256 + x] = 100 + x;
  // centar piksela 10 → tačno 110; pola puta do 11 → 110.5
  assert.strictEqual(api._nvDemOcitaj(a, 10.5 / 256, 0.5 / 256, 0, 0), 110);
  assert.strictEqual(api._nvDemOcitaj(a, 11 / 256, 0.5 / 256, 0, 0), 110.5);
  a.fill(-32768);
  assert.strictEqual(api._nvDemOcitaj(a, 0.5, 0.5, 0, 0), null, 'Terrarium "nema podatka" nije visina');
});

t('OFFLINE: visina stiže iz keširane DEM pločice, bez ijednog mrežnog poziva', async () => {
  const { api, dom, log } = env({ online: false, kes: [[URL_T(12, X12, Y12), ravnaPlocica(412.4)]] });
  assert.strictEqual(api._nvDemSync(LAT, LNG), undefined, 'prije učitavanja nije u memoriji');
  await api._nvZaTacku(LAT, LNG);
  assert.strictEqual(dom['nv-val'].textContent, '412 m');
  assert.strictEqual(dom.onv.textContent, '412 m');
  assert.strictEqual(log.mreza.length + log.meteo, 0);
  assert.ok(Math.abs(api._nvDemSync(LAT, LNG) - 412.4) < 0.01, 'poslije je u memoriji — pomjeranje čita sinhrono');
});

t('keš PRIJE mreže, i drugi zum iz keša (DEM slojevi keširaju z13/z14)', async () => {
  const [x14, y14] = tile(14);
  const { api, dom, log } = env({ kes: [[URL_T(14, x14, y14), ravnaPlocica(300)]], mreza: [[URL_T(12, X12, Y12), ravnaPlocica(999)]] });
  await api._nvZaTacku(LAT, LNG);
  assert.strictEqual(dom['nv-val'].textContent, '300 m');
  assert.strictEqual(log.mreza.length, 0, 'mreža se ne dira kad keš ima pločicu (mrtva veza bi čekala 10 s)');
});

t('online bez keša: pločica sa mreže, pa sljedeća tačka ide sinhrono', async () => {
  const { api, dom, log } = env({ mreza: [[URL_T(12, X12, Y12), ravnaPlocica(250)]] });
  await api._nvZaTacku(LAT, LNG);
  assert.strictEqual(dom['nv-val'].textContent, '250 m');
  assert.strictEqual(log.mreza.length, 1);
  api.debouncedUpdElev(LAT + 0.001, LNG + 0.001, 450);
  await new Promise(r => setImmediate(r));
  assert.strictEqual(log.mreza.length, 1, 'ista pločica se ne preuzima ponovo');
});

t('nijedan izvor → "— m", ne stari broj sa drugog mjesta', async () => {
  const { api, dom } = env({ online: false });
  dom['nv-val'].textContent = '812 m';
  await api._nvZaTacku(LAT, LNG);
  assert.strictEqual(dom['nv-val'].textContent, '— m');
});

t('neuspjela pločica se ne pokušava u svakom frame-u (30 s pauza)', async () => {
  const { api, log } = env();
  await api._nvDemUcitaj(LAT, LNG);
  await api._nvDemUcitaj(LAT, LNG);
  assert.strictEqual(log.mreza.length, 1);
});

t('Open-Meteo ostaje rezerva kad DEM nema pločicu a mreža radi', async () => {
  const { api, dom, log } = env({ meteo: 377.6 });
  await api._nvZaTacku(LAT, LNG);
  assert.strictEqual(dom['nv-val'].textContent, '378 m');
  assert.strictEqual(log.meteo, 1);
});

t('zakašnjeli odgovor ne gazi noviju tačku', async () => {
  const [xB] = [X12 + 3];
  const lngB = (xB + 0.5) / Math.pow(2, 12) * 360 - 180;
  const { api, dom } = env({ online: false, kes: [[URL_T(12, X12, Y12), ravnaPlocica(100)], [URL_T(12, xB, Y12), ravnaPlocica(900)]] });
  const prvi = api._nvZaTacku(LAT, LNG);        // čeka keš
  await api._nvDemUcitaj(LAT, lngB);
  await api._nvZaTacku(LAT, lngB);              // noviji, već u memoriji
  await prvi;
  assert.strictEqual(dom['nv-val'].textContent, '900 m');
});

t('BUG: fetchElev više NE baca visinu centra dok GPS radi a karta je odmaknuta', async () => {
  const { api, dom } = env({ online: false, kes: [[URL_T(12, X12, Y12), ravnaPlocica(640)]] });
  api.gpsAlt = true; api.pannedAway = true;
  assert.ok(api._nvPratiCentar());
  api.debouncedUpdElev(LAT, LNG, 450);
  await new Promise(r => setTimeout(r, 5));
  assert.strictEqual(dom['nv-val'].textContent, '640 m');
});

t('pozicija: DEM ima prednost nad elipsoidnom GPS visinom; 📡 samo kao rezerva', async () => {
  const s = env({ online: false, kes: [[URL_T(12, X12, Y12), ravnaPlocica(520)]] });
  s.api._nvZaPoziciju(LAT, LNG, 566);           // GPS ~45 m više (geoid)
  await new Promise(r => setTimeout(r, 5));
  assert.strictEqual(s.dom['nv-val'].textContent, '520 m');
  const bez = env({ online: false });
  bez.api._nvZaPoziciju(LAT, LNG, 566);
  await new Promise(r => setTimeout(r, 5));
  assert.strictEqual(bez.dom['nv-val'].textContent, '566 m 📡');
});

// ── Preuzimanje visina za offline (v1.7.9) ───────────────────────────────
const bnd = (s, w, n, e) => ({ getSouth: () => s, getWest: () => w, getNorth: () => n, getEast: () => e });
const slika = () => ({ ok: true, headers: { get: () => 'image/png' } });

t('područje odjela (~2 km) pokriva 1–4 pločice z12, i sve su tačno one koje N.V. čita', () => {
  const { api } = env();
  const pl = api._nvDemPlociceZa(bnd(LAT - 0.01, LNG - 0.012, LAT + 0.01, LNG + 0.012));
  assert.ok(pl.length >= 1 && pl.length <= 4, 'dobio ' + pl.length);
  assert.ok(pl.every(t => t.z === api._NV_DEM_Z));
  assert.ok(pl.some(t => t.x === X12 && t.y === Y12), 'pločica tačke u centru mora biti u listi');
  // BiH (~5.5° × 3.5°) ne smije proći kao "malo"
  assert.ok(api._nvDemPlociceZa(bnd(42.5, 15.7, 45.3, 19.6)).length > 600);
});

t('preuzimanje: keširane se preskaču, nove se spreme, ponovni poziv ne dira mrežu', async () => {
  const { api, log, kes } = env({ kes: [[URL_T(12, X12, Y12), ravnaPlocica(1)]], dl: slika });
  const pl = [{ z: 12, x: X12, y: Y12 }, { z: 12, x: X12 + 1, y: Y12 }];
  const r = await api._nvDemPreuzmi(pl);
  assert.deepStrictEqual([r.ukupno, r.novih, r.vec, r.gresaka], [2, 1, 1, 0]);
  assert.ok(kes.has(URL_T(12, X12 + 1, Y12)));
  const n = log.mreza.length;
  const r2 = await api._nvDemPreuzmi(pl);
  assert.strictEqual(r2.vec, 2); assert.strictEqual(log.mreza.length, n);
});

t('odgovor koji NIJE slika (200 OK sa HTML-om) se ne kešira — ne truje N.V.', async () => {
  const { api, kes } = env({ dl: () => ({ ok: true, headers: { get: () => 'text/html' } }) });
  const r = await api._nvDemPreuzmi([{ z: 12, x: X12, y: Y12 }]);
  assert.strictEqual(r.gresaka, 1); assert.strictEqual(kes.size, 0);
});

t('mrežna greška na jednoj pločici ne prekida ostale; puna kvota prekida odmah', async () => {
  let k = 0;
  const a = env({ dl: () => { if (k++ === 0) throw new Error('istek'); return slika(); } });
  const r = await a.api._nvDemPreuzmi([{ z: 12, x: 1, y: 1 }, { z: 12, x: 2, y: 1 }, { z: 12, x: 3, y: 1 }]);
  assert.deepStrictEqual([r.gresaka, r.novih], [1, 2]);
  const b = env({ dl: slika, kvotaPoslije: 1 });
  const r2 = await b.api._nvDemPreuzmi([{ z: 12, x: 1, y: 1 }, { z: 12, x: 2, y: 1 }, { z: 12, x: 3, y: 1 }]);
  assert.ok(r2.kvota); assert.strictEqual(r2.novih, 1);
  assert.strictEqual(b.log.mreza.length, 2, 'poslije pune kvote nema daljih preuzimanja');
});

t('poslije preuzimanja N.V. odmah proba ponovo (briše pauzu neuspjeha)', async () => {
  const { api } = env({ online: false });
  await api._nvDemUcitaj(LAT, LNG);            // offline, nema keša → upamćen neuspjeh
  assert.strictEqual(api.nemaVel, 1);
  await api._nvDemPreuzmi([]);
  assert.strictEqual(api.nemaVel, 0);
});

t('procjena veličine je čitljiva (sklonidba + MB)', () => {
  const { api } = env();
  assert.strictEqual(api._nvDemVelicinaTxt(1), '1 pločica · ≈ < 1 MB');
  assert.strictEqual(api._nvDemVelicinaTxt(3), '3 pločice · ≈ < 1 MB');
  assert.strictEqual(api._nvDemVelicinaTxt(100), '100 pločica · ≈ 9 MB');
});

t('dugme za preuzimanje postoji u Slojevima karte i u Upravljanju offline podacima', () => {
  assert.ok(/onclick="nvDemPreuzmiUi\(\)"[^`]*Preuzmi nadmorske visine za offline/.test(extractFn('_lsRenderCache')));
  assert.ok(/nvDemPreuzmiUi\(\)/.test(extractFn('_cacheMgrRender')));
  const ui = extractFn('nvDemPreuzmiUi');
  assert.ok(/_escHtml\(o\.ime\)/.test(ui), 'ime karte/odjela ide u HTML akcije — mora biti escape-ovano');
  assert.ok(/_NV_DEM_MAX_PLOCICA/.test(ui), 'preveliko područje se odbija');
});

t('invarijante: onP ne piše GPS visinu direktno, move handler čita N.V. iz memorije', () => {
  const onP = extractFn('onP');
  assert.ok(/_nvZaPoziciju\(la, lo/.test(onP), 'onP mora ići kroz _nvZaPoziciju');
  assert.ok(!/nvGpsTxt/.test(onP));
  const mv0 = HTML.indexOf("map.on('move', () => {");
  assert.ok(mv0 > 0);
  const mv = HTML.slice(mv0, HTML.indexOf("map.on('moveend'", mv0));
  assert.ok(/_nvPratiCentar\(\)/.test(mv) && /_nvDemSync\(c\.lat, c\.lng\)/.test(mv));
  const fe = extractFn('fetchElev').replace(/\/\/.*$/gm, '');
  assert.ok(!/_gpsAlt/.test(fe), 'fetchElev ne smije ponovo odlučivati po _gpsAlt');
  assert.ok(/debouncedUpdElev/.test(extractFn('stopGPS')), 'gašenje GPS-a vraća N.V. na centar');
});

(async () => {
  console.log('N.V. iz DEM-a:');
  for (const [name, fn] of tests) {
    try { await fn(); console.log('  ✔ ' + name); pass++; }
    catch (e) { fail++; console.log('  ✘ ' + name + '\n      ' + e.message); }
  }
  console.log(`\n${pass} prošlo, ${fail} palo`);
  process.exit(fail ? 1 : 0);
})();
