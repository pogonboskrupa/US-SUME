// Proximity fallback za sačuvana mjerenja (v1.5.4) — testovi nad STVARNIM
// kodom iz index.html.
//
// Zašto: mjerenja se crtaju u pane 'tragMsrLines' (z-index 410). Leaflet
// canvas renderer je JEDAN <canvas> preko cijele karte koji sam hvata DOM
// klik, pa BILO KOJI drugi interaktivni canvas sloj sa VIŠIM z-indexom pojede
// klik i popup mjerenja nikad ne opali. Fallback ostaje kao opšta odbrana,
// isti princip kao proximity fallback za vlake/uvezeni KML (v3.101.0).

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
  let dubina = 0, poceo = false;
  for (let j = i; j < SRC.length; j++) {
    const c = SRC[j];
    if (c === '{') { dubina++; poceo = true; }
    else if (c === '}') { dubina--; if (poceo && dubina === 0) return SRC.slice(i, j + 1); }
  }
  throw new Error('neuravnotežene zagrade za ' + naziv);
}
function extractConst(naziv) {
  const m = SRC.match(new RegExp('const\\s+' + naziv + '\\s*=\\s*([^;\\n]+);'));
  if (!m) throw new Error('nema konstante ' + naziv);
  return m[1];
}

// Karta bez projekcije: 1 stepen = 1000 px u oba smjera, centar na (0,0).
// Dovoljno za test u PIKSELIMA, a sprječava da se test oslanja na stvarni
// Leaflet Mercator (koji na ovoj širini razvlači x i y različito — baš razlog
// zbog kojeg _msrTackaUPoligonu radi u ekranskim, ne u geografskim koordinatama).
function makeSandbox(registry, mqmId) {
  const map = {
    // `ll.lng ?? ll.lo`, NE `||`: koordinata 0 je posve valjana, a `0 || x`
    // daje x — prvi pokušaj ovog mocka je zbog toga davao NaN za svaku tačku
    // na nuli i test je padao na mocku, ne na kodu.
    latLngToContainerPoint: (ll) => ({ x: (ll.lng ?? ll.lo) * 1000, y: -(ll.lat ?? ll.la) * 1000 })
  };
  const env = {
    window: { map },
    map,
    L: { latLng: (a, b) => ({ lat: a, lng: b }) },
    _msrRegistry: registry,
    _mqmId: mqmId === undefined ? null : mqmId,
    _distToSegPx: null   // popunjeno ispod stvarnim kodom
  };
  const tijelo = [
    extractFn('_distToSegPx'),
    'const _MSR_HIT_PX = ' + extractConst('_MSR_HIT_PX') + ';',
    extractFn('_msrTackaUPoligonu'),
    extractFn('_msrHitTest'),
    'return { _msrHitTest, _msrTackaUPoligonu, _MSR_HIT_PX };'
  ].join('\n');
  const kljucevi = ['window', 'map', 'L', '_msrRegistry', '_mqmId'];
  return new Function(...kljucevi, tijelo)(...kljucevi.map(k => env[k]));
}

const linija = {
  id: 'L1', name: 'Dužina', mode: 'dist',
  pts: [{ lat: 0, lng: 0 }, { lat: 0, lng: 0.1 }]      // vodoravno, 0 → 100 px
};
const poligon = {
  id: 'P1', name: 'Površina', mode: 'area',
  pts: [{ lat: 0, lng: 0 }, { lat: 0, lng: 0.1 }, { lat: -0.1, lng: 0.1 }, { lat: -0.1, lng: 0 }]
};

console.log('Mjerenja — proximity fallback (v1.5.4)');

t('klik TAČNO na liniju je pogodak', () => {
  const s = makeSandbox([linija]);
  eq(s._msrHitTest({ lat: 0, lng: 0.05 })?.id, 'L1');
});

t('klik unutar tolerancije od linije je pogodak', () => {
  const s = makeSandbox([linija]);
  // 15 px ispod linije (lat -0.015 → y = 15)
  eq(s._msrHitTest({ lat: -0.015, lng: 0.05 })?.id, 'L1');
});

t('klik IZVAN tolerancije nije pogodak', () => {
  const s = makeSandbox([linija]);
  // 40 px ispod linije — dalje od _MSR_HIT_PX (22)
  eq(s._msrHitTest({ lat: -0.04, lng: 0.05 }), null);
});

t('klik UNUTAR poligona je pogodak (ne samo blizu ruba)', () => {
  const s = makeSandbox([poligon]);
  // sredina kvadrata — daleko od svake ivice (50 px)
  eq(s._msrHitTest({ lat: -0.05, lng: 0.05 })?.id, 'P1');
});

t('klik blizu RUBA poligona izvana je pogodak', () => {
  const s = makeSandbox([poligon]);
  eq(s._msrHitTest({ lat: 0.01, lng: 0.05 })?.id, 'P1');
});

t('klik daleko van poligona nije pogodak', () => {
  const s = makeSandbox([poligon]);
  eq(s._msrHitTest({ lat: 0.5, lng: 0.5 }), null);
});

t('poligon se zatvara — klik uz POSLJEDNJU (zatvarajuću) ivicu je pogodak', () => {
  const s = makeSandbox([poligon]);
  // Ivica od zadnje tačke (-0.1, 0) nazad do prve (0, 0) — lijeva stranica.
  // Bez zatvaranja petlje (i+1)%n ta ivica ne bi postojala.
  eq(s._msrHitTest({ lat: -0.05, lng: -0.01 })?.id, 'P1');
});

t('linija se NE zatvara — klik uz zamišljenu spojnicu nije pogodak', () => {
  const trougao = { id: 'L2', name: 'Lom', mode: 'dist',
    pts: [{ lat: 0, lng: 0 }, { lat: 0, lng: 0.2 }, { lat: -0.2, lng: 0.1 }] };
  const s = makeSandbox([trougao]);
  // Sredina spojnice zadnje→prve tačke. Kod poligona bi bila pogodak; kod
  // linije ta ivica ne postoji i ne smije se izmisliti.
  eq(s._msrHitTest({ lat: -0.1, lng: 0.05 }), null);
});

t('mjerenje koje se UPRAVO EDITUJE se preskače', () => {
  const s = makeSandbox([linija], 'L1');
  // _msrDrawAllSaved ga ne crta u sačuvanom sloju, pa ne smije biti ni klikabilan
  eq(s._msrHitTest({ lat: 0, lng: 0.05 }), null);
});

t('od dva preklopljena bira BLIŽE', () => {
  const daleko = { id: 'D', name: 'Daleko', mode: 'dist',
    pts: [{ lat: -0.018, lng: 0 }, { lat: -0.018, lng: 0.1 }] };   // 18 px ispod
  const s = makeSandbox([daleko, linija]);                          // linija je na 0
  eq(s._msrHitTest({ lat: -0.002, lng: 0.05 })?.id, 'L1');
});

t('prazan registar ne baca', () => {
  const s = makeSandbox([]);
  eq(s._msrHitTest({ lat: 0, lng: 0 }), null);
});

t('mjerenje sa manje od 2 tačke se preskače', () => {
  const s = makeSandbox([{ id: 'X', mode: 'dist', pts: [{ lat: 0, lng: 0 }] }]);
  eq(s._msrHitTest({ lat: 0, lng: 0 }), null);
});

// ── Invarijante nad kodom ───────────────────────────────────────────────────

t('_msrPopupHtml je SAMOSTALNA funkcija (dostupna fallback-u)', () => {
  if (SRC.indexOf('function _msrPopupHtml(') < 0)
    throw new Error('popup je i dalje zatvoren u closure-u _msrDrawAllSaved-a');
});

t('popup i dalje nudi površinu, Edituj i Obriši', () => {
  const tijelo = extractFn('_msrPopupHtml');
  if (!/_msrPoligonPovrsina/.test(tijelo)) throw new Error('nema računa površine');
  if (!/_msrRegZoom\(/.test(tijelo))      throw new Error('nema dugmeta Edituj');
  if (!/_msrAskDelete\(/.test(tijelo))    throw new Error('nema dugmeta Obriši');
});

t('sloj i fallback dijele ISTI popup (ne dvije verzije)', () => {
  const crtanje = extractFn('_msrDrawAllSaved');
  if (!/_msrPopupHtml\(m\)/.test(crtanje))
    throw new Error('_msrDrawAllSaved ne koristi _msrPopupHtml — popupi bi se razišli');
  const otvori = extractFn('_msrOpenPopupNa');
  if (!/_msrPopupHtml\(m\)/.test(otvori))
    throw new Error('_msrOpenPopupNa ne koristi _msrPopupHtml');
});

t('fallback je ukopčan u map.on(click) PRIJE vlaka', () => {
  const i = SRC.indexOf("map.on('click', e => {");
  if (i < 0) throw new Error('nema map click handlera');
  const blok = SRC.slice(i, i + 6000);
  const msr = blok.indexOf('_msrHitTest(e.latlng)');
  const vlk = blok.indexOf('showVlakaPopup(bestI');
  if (msr < 0) throw new Error('_msrHitTest nije ukopčan u map.on(click)');
  if (vlk < 0) throw new Error('nema vlaka fallback-a — selektor je zastario');
  if (msr > vlk) throw new Error('mjerenja se provjeravaju POSLIJE vlaka, a na karti su IZNAD njih');
});

t('mjerenja imaju viši pane od vlaka (osnova za taj redoslijed)', () => {
  const z = (ime) => {
    const m = SRC.match(new RegExp("getPane\\('" + ime + "'\\)\\.style\\.zIndex\\s*=\\s*(\\d+)"));
    if (!m) throw new Error('nema pane ' + ime);
    return +m[1];
  };
  if (!(z('tragMsrLines') > z('vlakeLines')))
    throw new Error('tragMsrLines više nije iznad vlakeLines — redoslijed u fallback-u treba preispitati');
});

console.log('\n' + ok + ' prošlo, ' + fail + ' palo');
process.exit(fail ? 1 : 0);
