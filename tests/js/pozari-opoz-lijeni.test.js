// Lijeni red za _poziProj (v1.5.5) — testovi nad STVARNIM kodom iz index.html.
//
// Zahtjev: nastavak v1.5.4 ("da ne koči mobitel"). Istraga je pokazala da
// _povArh* (arhiva po godinama) VEĆ ispravno odgađa turf posao, ali TRI
// mjesta i dalje rade _poziOpozProjekcija (concave hull + buffer union)
// SINHRONO na promašaj keša: mapni sloj (_poziOpozAzuriraj), svaki red
// liste (_poziRedHtml) i sažetak kartice — sva tri se pozivaju na SVAKI
// meteo/GPS/toast događaj dok je panel otvoren.
//
// KLJUČNA zamka koju ovaj test hvata: popravka SAMO _poziOpozAzuriraj-a (kako
// je prvobitno predloženo) bi ostavila listu i karticu da i dalje sinhrono
// forsiraju isti račun čim se pozovu — poništavajući svrhu popravke za
// korisnika koji drži panel otvoren (najčešći slučaj).

const fs = require('fs');
const path = require('path');
const SRC = fs.readFileSync(path.join(__dirname, '../../index.html'), 'utf8');

let ok = 0, fail = 0;
function t(ime, fn) {
  try { fn(); ok++; }
  catch (e) { fail++; console.log('  PAO:', ime, '\n    ', e.message); }
}
function eq(a, b, msg) {
  if (a !== b) throw new Error((msg || '') + ' očekivano ' + JSON.stringify(b) + ', dobijeno ' + JSON.stringify(a));
}
function extractFn(naziv) {
  let i = SRC.indexOf('async function ' + naziv + '(');
  if (i < 0) i = SRC.indexOf('function ' + naziv + '(');
  if (i < 0) throw new Error('nema funkcije ' + naziv + ' u index.html');
  let d = 0, p = false;
  for (let j = i; j < SRC.length; j++) {
    const c = SRC[j];
    if (c === '{') { d++; p = true; }
    else if (c === '}') { d--; if (p && d === 0) return SRC.slice(i, j + 1); }
  }
  throw new Error('neuravnotežene zagrade za ' + naziv);
}

// Sandbox planera — isti obrazac kao pozari-lijeni-racun.test.js (ručni takt
// umjesto stvarnog requestIdleCallback, da test vidi tačan redoslijed).
function makeSandbox(opts) {
  opts = opts || {};
  const log = { pozivi: 0, crtanjaOpoz: 0 };
  const evts = opts.evts || [];
  const env = {
    _poziOpozLayer: null,
    _poziOpozOn: () => true,
    _poziOn: true,
    _poziEvts: evts,
    _poziAnimGrupe: undefined,
    turf: {},
    map: { removeLayer: () => {}, addTo: () => {} },
    L: {
      layerGroup: () => ({ addTo: () => { log.crtanjaOpoz++; return {}; } }),
      geoJSON: () => ({ addTo: () => {} }),
    },
    _poziPojasPopupHtml: () => '',
    _poziMapOtvori: () => {},
    _demLegendUpdate: () => {},
    _poziOpozProjekcija: (g) => { log.pozivi++; return { ukupno: {}, trake: [], samoJedanPiksel: false, haUkupno: 5 }; },
    document: { getElementById: () => null },
    setTimeout: (fn) => { env._odgodjeni.push(fn); return env._odgodjeni.length; },
    _odgodjeni: [],
    _taktovi: [],
  };
  env.requestIdleCallback = (fn) => { env._taktovi.push(fn); };

  const tijelo = [
    extractFn('_poziProjSljedeciTakt'),
    extractFn('_poziProjZakazi'),
    extractFn('_poziProjPokreniObradu'),
    extractFn('_poziProjTraziCrtanje'),
    extractFn('_poziProj'),
    extractFn('_poziOpozAzuriraj'),
    'return { _poziProj, _poziOpozAzuriraj, _poziProjZakazi, red:_poziProjRed };',
  ].join('\n');
  const kljucevi = Object.keys(env).filter(k => k !== '_odgodjeni' && k !== '_taktovi');
  const preambula = [
    'const _poziProjRed = [];',
    'let _poziProjRadi = false;',
    'let _poziProjTekuci = null;',
    'let _poziProjCrtajTajmer = null;',
    "const _POZI_PROJ_RED_MAX = 40;",
  ].join('\n');
  const mod = new Function(...kljucevi, preambula + '\n' + tijelo)(...kljucevi.map(k => env[k]));

  mod.takt = () => { const f = env._taktovi.shift(); if (f) f(); };
  mod.doKraja = () => { let n = 0; while (env._taktovi.length && n++ < 500) mod.takt(); };
  mod.odgodjeni = () => { const arr = env._odgodjeni.slice(); env._odgodjeni.length = 0; arr.forEach(f => f()); };
  mod.brojOdgodjenih = () => env._odgodjeni.length;
  mod.log = log;
  return mod;
}

function grupa(id, la) {
  return { la: la ?? 0, lo: 0, pts: [{ la: la ?? 0, lo: 0, dt: '2026-06-0' + id + 'T10:00:00Z', rez: 375 }] };
}

console.log('_poziProj — lijeni red (v1.5.5)');

t('_poziOpozAzuriraj pri promašaju keša NIKAD sinhrono ne zove _poziOpozProjekcija', () => {
  const s = makeSandbox({ evts: [grupa(1), grupa(2)] });
  s._poziOpozAzuriraj();
  eq(s.log.pozivi, 0, 'broj sinhronih poziva _poziOpozProjekcija unutar _poziOpozAzuriraj:');
  eq(s.red.length, 2, 'obje grupe moraju biti zakazane:');
});

t('grupe VEĆ u kešu se odmah crtaju (nema regresije za tipičan slučaj)', () => {
  const s = makeSandbox({ evts: [grupa(1)] });
  // Prvi (sinhroni, samoKes=false) poziv puni keš — simulira da je grupa
  // već izračunata u nekom ranijem prolazu.
  s._poziProj(s.red.length ? null : { pts: [{ la:0, lo:0, dt:'2026-06-01T10:00:00Z', rez:375 }] });
  // Direktnije: pozovi _poziOpozAzuriraj koje zakaže posao, odvrti takt da se
  // "ugrije" keš, pa provjeri da SLJEDEĆI poziv _poziOpozAzuriraj crta odmah.
  s._poziOpozAzuriraj();       // zakazuje
  s.doKraja();                 // izračuna i upiše u keš
  const crtanjaPrije = s.log.crtanjaOpoz;
  s._poziOpozAzuriraj();       // sada mora pogoditi keš i crtati SINHRONO
  eq(s.log.crtanjaOpoz, crtanjaPrije + 1, 'drugi poziv mora crtati odmah (keš pogodak):');
  eq(s.log.pozivi, 1, '_poziOpozProjekcija se pozvao TAČNO jednom (keš, ne dvaput):');
});

t('nakon takta i throttle timera, _poziOpozAzuriraj se poziva ponovo i docrtava', () => {
  const s = makeSandbox({ evts: [grupa(1), grupa(2)] });
  s._poziOpozAzuriraj();               // oba promašaja, 0 crtanja (nema šta)
  eq(s.log.crtanjaOpoz, 0, 'prije takta ništa nije spremno:');
  s.doKraja();                         // oba posla izračunata, _poziProjTraziCrtanje zakazan
  eq(s.brojOdgodjenih() > 0, true, 'throttle timer mora biti zakazan:');
  s.odgodjeni();                       // odvrti setTimeout(350ms) — ponovo zove _poziOpozAzuriraj
  eq(s.log.crtanjaOpoz > 0, true, 'nakon throttle timera mora doći do crtanja:');
});

t('_poziRedHtml koristi samoKes:true (grep — hvata propust da se popravi SAMO mapni sloj)', () => {
  const fn = extractFn('_poziRedHtml');
  if (!/_poziProj\(g,\s*true\)/.test(fn)) {
    throw new Error('_poziRedHtml i dalje zove _poziProj(g) bez samoKes — lista bi sinhrono forsirala račun na svaki render panela');
  }
});

t('sažetak kartice (opozSazetak/prognSazetak) koristi samoKes:true', () => {
  const i = SRC.indexOf('let opozSazetak');
  if (i < 0) throw new Error('nije nađen blok opozSazetak');
  const blok = SRC.slice(i, i + 3000);
  if (!/_poziProj\([^)]*,\s*true\)/.test(blok)) {
    throw new Error('sažetak kartice i dalje zove _poziProj bez samoKes — kartica bi sinhrono forsirala račun na svaki render panela');
  }
});

t('najbliži požar u obradi NE pada tiho na sljedeći (dalji) požar pod istim natpisom', () => {
  const i = SRC.indexOf('let opozSazetak');
  const blok = SRC.slice(i, i + 1200);
  if (!/racuna === undefined/.test(blok)) {
    throw new Error('nema eksplicitne provjere da je najbliži požar u obradi — moglo bi se pogrešno prikazati "najbliži požar" za DALJI požar koji je slučajno već u kešu');
  }
});

t('red je ograničen kapom (_POZI_PROJ_RED_MAX)', () => {
  const s = makeSandbox({ evts: [] });
  for (let i = 0; i < 60; i++) {
    s._poziProjZakazi('k' + i, { pts: [] });
  }
  if (s.red.length > 40) throw new Error('red je prekoračio kapu: ' + s.red.length);
});

t('detalj-pogled (bez samoKes) OSTAJE sinhron — ne vraća undefined', () => {
  const s = makeSandbox({ evts: [] });
  const g = { pts: [{ la: 0, lo: 0, dt: '2026-06-01T10:00:00Z', rez: 375 }] };
  const pr = s._poziProj(g); // bez drugog argumenta — mora odmah računati
  if (pr === undefined) throw new Error('_poziProj(g) bez samoKes je vratio undefined — detalj-pogledi bi se pokvarili');
  eq(s.log.pozivi, 1, 'mora se pozvati sinhrono:');
});

t('isti kljuc se ne zakazuje dvaput', () => {
  const s = makeSandbox({ evts: [] });
  const g = { pts: [{ la: 0, lo: 0, dt: '2026-06-01T10:00:00Z', rez: 375 }] };
  s._poziProjZakazi('isti', g);
  s._poziProjZakazi('isti', g);
  eq(s.red.length, 1, 'dva zakazivanja istog ključa, jedan unos u redu:');
});

console.log('\n' + ok + ' prošlo, ' + fail + ' palo');
process.exit(fail ? 1 : 0);
