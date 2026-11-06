'use strict';
const assert = require('assert'), { izvor } = require('./_izvor');
const src = izvor();
const a = src.indexOf('async function _sqlTileRoditelj'), b = src.indexOf('function _zoomBounds(meta)');
assert(a > 0 && b > a);
(async () => {
  // roditeljske koordinate i granica minZoom (bez canvasa: _sqlTileUvecaj se zamjenjuje)
  const trazeno = [];
  const f = new Function('_SQL_RODITELJ_NIVOA', '_sqlTileUvecaj', src.slice(a, b) + ';return _sqlTileRoditelj;')(3, async (d, dz, ox, oy) => ({ d, dz, ox, oy }));
  const r = await f(async (z, x, y) => { trazeno.push([z, x, y]); return z === 8 ? 'DATA' : null; }, 10, 21, 10, 5);
  assert.deepStrictEqual(trazeno, [[9, 10, 5], [8, 5, 2]]);
  assert.deepStrictEqual({ dz: r.dz, ox: r.ox, oy: r.oy }, { dz: 2, ox: 1, oy: 2 }, 'izrezak: x&3=1, y&3=2');
  const t2 = []; await f(async (z) => { t2.push(z); return null; }, 10, 21, 10, 9);
  assert.deepStrictEqual(t2, [9], 'ne ide ispod minNative');
  const t3 = []; await f(async (z) => { t3.push(z); return null; }, 12, 1, 1, 0);
  assert.deepStrictEqual(t3, [11, 10, 9], 'najviše 3 nivoa');
  // oba sloja (W i Main) koriste fallback kad pločice nema
  assert(/_sqlTileRoditelj\(\(zz, xx, yy\) => _wTileScheduleCall/.test(src) && /_sqlTileRoditelj\(\(zz, xx, yy\) => _mainTileSchedule/.test(src));
  console.log('sqlmap-roditelj: ok');
})().catch(e => { console.error(e); process.exit(1); });
// veliki KML se ne parsira odjednom (paketi uz predah), restore ne duplira sloj
(function () {
  assert(/_KML_PO_DIJELOVIMA_MIN = 1200000/.test(src) && /async function _kmlGrupaIzSadrzaja/.test(src));
  assert(/i \+= 20/.test(src) && /setTimeout\(r, 0\)/.test(src), 'paketi + predah');
  assert(/_kmlJeIspravan\(content\)/.test(require('fs').readFileSync(__dirname + '/../../static/js/local-layer-import.js', 'utf8')), 'uvoz ne parsira veliki KML dvaput');
  assert(/drugi paralelni restore je u međuvremenu dodao/.test(src));
  assert(!/function _kmlJeIspravan[\s\S]{0,200}DOMParser/.test(src), 'primanje ne parsira DOM');
  console.log('veliki KML po dijelovima: ok');
})();
// veliki sloj: na kartu samo objekti u prikazu; sigurnosni start sakriva velike slojeve poslije zaglavljenog starta
(function () {
  assert(/const _KML_CULL_MIN = 1500/.test(src) && /function _kmlGrupa\(\)/.test(src) && /map\.on\('moveend', this\._cullZakazi, this\)/.test(src));
  assert(/typeof _kmlGrupa === 'function' \? _kmlGrupa\(\)/.test(src), 'pkml/pkmlStyled koriste grupu sa izborom prikaza');
  assert(/tvlake_kml_start_u_toku/.test(src) && /layer\.vis = false; sakriveni\.push/.test(src), 'sigurnosni start');
  console.log('cull + sigurnosni start: ok');
})();
