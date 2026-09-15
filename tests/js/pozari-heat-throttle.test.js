// =====================================================================
// Heatmap Požari — downsample interne rezolucije (v1.5.5).
// Pokretanje:  node tests/js/pozari-heat-throttle.test.js
// ---------------------------------------------------------------------
// _PoziHeat._redraw() je do sada radio getImageData/putImageData preko
// CIJELOG vidljivog viewporta, na SVAKI moveend/zoomend/resize dok je
// heatmap uključen — najveći sinhroni trošak u sekciji Požari, jer se
// ponavlja pri svakom pomjeranju karte, ne samo pri osvježavanju podataka.
// Popravka: interni backing buffer (`canvas.width/height`) se smanjuje
// faktorom `_scale` (podrazumijevano 0.5 = 4x manje piksela), dok CSS
// veličina (`canvas.style.width/height`) ostaje puna — canvas se na ekranu
// ne smanjuje, samo ima manje piksela za pixel-loop.
//
// Testira se STVARNI _PoziHeat izvučen iz index.html (object-literal
// ekstrakcija, ne function-potpis kao ostali testovi) nad minimalnim
// stubovima za L.Layer/L.DomUtil/map.
// =====================================================================
'use strict';
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const HTML = fs.readFileSync(path.join(__dirname, '../../index.html'), 'utf8');

// Object-literal ekstrakcija: `const _PoziHeat = L.Layer.extend({ ... });`
// Drugačiji obrazac od extractFn (koji hvata `function ime(...) { ... }`) —
// ovdje se traži balansirana zagrada POSLIJE `{` koja otvara sam objekat, pa
// se dodaje `);` koje zatvara `L.Layer.extend(...)`.
function extractObjectLiteral(constName, callExpr) {
  const marker = 'const ' + constName + ' = ' + callExpr + '({';
  const start = HTML.indexOf(marker);
  if (start < 0) throw new Error('nije nađen ' + constName);
  const braceStart = start + marker.length - 1; // pozicija otvarajuce '{'
  let depth = 0, i = braceStart;
  for (; i < HTML.length; i++) {
    if (HTML[i] === '{') depth++;
    else if (HTML[i] === '}') { depth--; if (depth === 0) break; }
  }
  const closeParen = HTML.indexOf(');', i);
  if (closeParen < 0) throw new Error('nezatvoren ' + constName);
  return HTML.slice(start, closeParen + 2);
}

const SRC = extractObjectLiteral('_PoziHeat', 'L.Layer.extend');

let pass = 0, fail = 0;
function t(name, fn) {
  try { fn(); pass++; }
  catch (e) { fail++; console.log('  PAO:', name, '\n    ', e.message); }
}
function eq(a, b, msg) {
  if (a !== b) throw new Error((msg || '') + ' očekivano ' + JSON.stringify(b) + ', dobijeno ' + JSON.stringify(a));
}

console.log('Heatmap Požari — downsample (v1.5.5)');

// Minimalan L stub — dovoljan da new Function() izvrši definiciju objekta i
// da instanca ima pozivljive metode. `L.Layer.extend({...})` u pravom
// Leafletu vraća KLASU; ovdje samo trebamo OBJEKAT sa istim metodama, pa
// `extend` vraća sam prototip-objekat (dovoljno za pozivanje metoda preko
// Object.create).
function makeSandbox() {
  const L = {
    Layer: { extend: (proto) => proto },
    setOptions: (obj, opts) => { obj.options = Object.assign({}, opts); },
    DomUtil: {
      create: () => ({ style: {} }),
      setPosition: () => {},
    },
    latLng: (a, b) => ({ lat: a, lng: b }),
  };
  const getImageDataCalls = [];
  const putImageDataCalls = [];
  function makeCtx(canvas) {
    return {
      clearRect: () => {},
      drawImage: () => {},
      setTransform: () => {},
      globalAlpha: 1,
      fillStyle: null, fillRect: () => {}, createRadialGradient: () => ({ addColorStop: () => {} }),
      createLinearGradient: () => ({ addColorStop: () => {} }),
      getImageData: (x, y, w, h) => { getImageDataCalls.push({ w, h }); return { data: new Uint8ClampedArray(w * h * 4) }; },
      putImageData: (img) => { putImageDataCalls.push(img); },
    };
  }
  const canvas = { style: {}, width: 0, height: 0, getContext: function () { return makeCtx(this); } };
  const map = {
    _size: { x: 800, y: 600 },
    getSize() { return this._size; },
    getBounds() { return { pad: () => ({ contains: () => true }) }; },
    latLngToContainerPoint: () => ({ x: 10, y: 10 }),
    containerPointToLayerPoint: () => [0, 0],
  };

  const tijelo = 'const _PoziHeat = ' + SRC.slice(SRC.indexOf('L.Layer.extend')) +
    '\nreturn _PoziHeat;';
  const factory = new Function('L', 'document', tijelo);
  // document.createElement se koristi za _tpl/gc pomoćne canvase u _initCanvas
  const fakeDoc = { createElement: () => ({ width: 0, height: 0, getContext: () => makeCtx(null) }) };
  const proto = factory(L, fakeDoc);
  const inst = Object.create(proto);
  inst._canvas = canvas;
  inst._ctx = canvas.getContext();
  inst._map = map;
  inst._latlngs = [[0, 0]];
  inst._r = 20;
  inst._palette = new Uint8ClampedArray(256 * 4);
  inst.options = {};
  return { inst, map, canvas, getImageDataCalls, putImageDataCalls };
}

t('_reset() smanjuje interni canvas (downsample), NE jednak punoj veličini mape', () => {
  const { inst, map, canvas } = makeSandbox();
  inst._reset();
  const size = map.getSize();
  if (canvas.width >= size.x || canvas.height >= size.y) {
    throw new Error('canvas.width/height nije smanjen (downsample nije aktivan) — width=' + canvas.width + ' size.x=' + size.x);
  }
  eq(canvas.width, Math.round(size.x * 0.5), 'canvas.width sa default scale 0.5:');
  eq(canvas.height, Math.round(size.y * 0.5), 'canvas.height sa default scale 0.5:');
});

t('CSS veličina ostaje PUNA — canvas se ne smanjuje vizuelno na ekranu', () => {
  const { inst, map, canvas } = makeSandbox();
  inst._reset();
  const size = map.getSize();
  eq(canvas.style.width, size.x + 'px', 'style.width:');
  eq(canvas.style.height, size.y + 'px', 'style.height:');
});

t('getImageData/putImageData čitaju STVARNU (smanjenu) veličinu backing buffera, ne map.getSize()', () => {
  const { inst, map, getImageDataCalls } = makeSandbox();
  inst._reset(); // postavlja canvas.width/height i zove _redraw()
  if (!getImageDataCalls.length) throw new Error('getImageData nije pozvan');
  const poziv = getImageDataCalls[getImageDataCalls.length - 1];
  const size = map.getSize();
  if (poziv.w === size.x || poziv.h === size.y) {
    throw new Error('getImageData je pozvan sa PUNOM veličinom mape (' + poziv.w + 'x' + poziv.h +
      ') umjesto smanjenim backing bufferom — na downsample-ovanom canvasu bi ovo tražilo više piksela nego što postoji');
  }
  eq(poziv.w, inst._canvas.width, 'širina proslijeđena getImageData mora biti canvas.width:');
  eq(poziv.h, inst._canvas.height, 'visina proslijeđena getImageData mora biti canvas.height:');
});

t('bez tačaka (_latlngs prazan) getImageData se uopšte ne zove — nema šta da se prevede kroz paletu', () => {
  const { inst, getImageDataCalls } = makeSandbox();
  inst._latlngs = [];
  inst._reset();
  eq(getImageDataCalls.length, 0, 'broj getImageData poziva bez tačaka:');
});

t('scale je konfigurabilan preko options.scale', () => {
  const { inst, map, canvas } = makeSandbox();
  inst.options = { scale: 0.25 };
  inst._reset();
  const size = map.getSize();
  eq(canvas.width, Math.round(size.x * 0.25), 'canvas.width sa scale 0.25:');
});

console.log('\n' + pass + ' prošlo, ' + fail + ' palo');
process.exit(fail ? 1 : 0);
