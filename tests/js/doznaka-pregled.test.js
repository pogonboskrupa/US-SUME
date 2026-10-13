// Doznaka (v2.9.7): traka pregleda ispod zaglavlja, brojači u listi kao filter
// statusa, sklopive postavke prikaza. Nad STVARNIM kodom iz index.html.
'use strict';
const assert = require('node:assert');
const fs = require('node:fs'), path = require('node:path');
const HTML = fs.readFileSync(path.join(__dirname, '../../index.html'), 'utf8');
function extractFn(n) {
  const s = HTML.indexOf('function ' + n + '('); if (s < 0) throw new Error('nema ' + n);
  let d = 0; for (let i = HTML.indexOf('{', s); i < HTML.length; i++) { if (HTML[i] === '{') d++; else if (HTML[i] === '}' && !--d) return HTML.slice(s, i + 1); }
}
let ok = 0, fail = 0;
const t = (n, f) => { try { f(); ok++; } catch (e) { fail++; console.log('PAO:', n, e.message); } };
const fmtHa = h => (+h).toFixed(2) + ' ha', fmtL = m => Math.round(m) + ' m';

function pregled(d) {
  const el = { hidden: true, innerHTML: '' };
  new Function('document', 'fmtHa', 'fmtL', extractFn('_dozPregledRender') + '; _dozPregledRender(arguments[3]);')({ getElementById: () => el }, fmtHa, fmtL, d);
  return el;
}
t('pregled: procenat, površina i preklop', () => {
  const el = pregled({ bndHa: 40, bandHa: 10, bandPct: 25, preklopHa: 0.5, nZona: 3, trag: 1200 });
  assert.strictEqual(el.hidden, false);
  assert.ok(/<b>25%<\/b>/.test(el.innerHTML) && /10\.00 ha od 40\.00 ha/.test(el.innerHTML));
  assert.ok(/3 zone/.test(el.innerHTML) && /preklop 0\.50 ha/.test(el.innerHTML));
  assert.ok(/aria-valuenow="25"/.test(el.innerHTML));
});
t('pregled: bez granice se sakrije (nema čemu procenat)', () => {
  assert.strictEqual(pregled({ bndHa: 0, bandHa: 0, bandPct: 0, nZona: 0, trag: 0 }).hidden, true);
  assert.strictEqual(pregled(null).hidden, true);
});
t('pregled: sklonidba zona i bez preklopa', () => {
  const h1 = pregled({ bndHa: 1, bandHa: 1, bandPct: 100, preklopHa: 0, nZona: 1, trag: 0 }).innerHTML;
  const h5 = pregled({ bndHa: 1, bandHa: 1, bandPct: 100, preklopHa: 0, nZona: 5, trag: 0 }).innerHTML;
  assert.ok(/1 zona/.test(h1) && /5 zona/.test(h5) && !/preklop/.test(h1));
});

function lista(odjeli, filt) {
  const els = { 'doz-odjeli-list': { innerHTML: '' }, 'doz-odjeli-sazetak': { innerHTML: '' }, 'doz-search': { value: '' } };
  const store = { tvlake_doz_filter: filt || '' };
  const ls = { getItem: k => store[k] ?? null, setItem: (k, v) => { store[k] = v; } };
  const run = new Function('document', 'localStorage', '_dozOdjeli', '_getDozHiddenIds', '_dozSelId', '_escHtml', 'fmtHa', 'fmtDateShort',
    extractFn('dozRenderOdjeli') + 'var _dozListaFilter;' + extractFn('_dozListaFilterGet') + extractFn('_dozListaFilterSet') +
    '; dozRenderOdjeli(); return { set: _dozListaFilterSet, render: dozRenderOdjeli };');
  const api = run({ getElementById: id => els[id] }, ls, odjeli, () => new Set(), null, s => String(s), fmtHa, d => String(d));
  return { els, store, api };
}
const OD = [{ id: 'a', name: 'Aktivni', status: 'active' }, { id: 'p', name: 'Pauzirani', status: 'paused' }, { id: 'z', name: 'Zavrseni', status: 'completed' }];
t('filter statusa prikazuje samo taj status i pamti izbor', () => {
  const l = lista(OD, 'completed');
  assert.ok(/Zavrseni/.test(l.els['doz-odjeli-list'].innerHTML) && !/Aktivni/.test(l.els['doz-odjeli-list'].innerHTML));
  assert.ok(/doz-filt c on/.test(l.els['doz-odjeli-sazetak'].innerHTML));
  l.api.set(''); l.api.render();
  assert.ok(/Aktivni/.test(l.els['doz-odjeli-list'].innerHTML) && l.store.tvlake_doz_filter === '');
});
t('filter bez ijednog odjela tog statusa se sam gasi (lista nije prazna)', () => {
  const l = lista([OD[0]], 'paused');
  assert.ok(/Aktivni/.test(l.els['doz-odjeli-list'].innerHTML));
  assert.strictEqual(l.store.tvlake_doz_filter, '');
});
t('nepoznata vrijednost filtera se ignoriše', () => {
  const l = lista(OD, '<script>');
  assert.ok(/Aktivni/.test(l.els['doz-odjeli-list'].innerHTML) && /Zavrseni/.test(l.els['doz-odjeli-list'].innerHTML));
});
t('_dozListaFilter je var, ne let (poziv pri pokretanju prije deklaracije)', () => {
  assert.ok(/\nvar _dozListaFilter;/.test(HTML) && !/let _dozListaFilter/.test(HTML));
});
t('markup: pregled, natpis statusa, sklopive postavke sa svim kontrolama', () => {
  const det = HTML.slice(HTML.indexOf('<div id="doz-panel-detail"'), HTML.indexOf('</div><!-- /doznaka-panel -->'));
  assert.ok(det.indexOf('id="doz-pregled"') < det.indexOf('id="doz-section-gps"'));
  assert.ok(det.indexOf('id="doz-section-stats"') < det.indexOf('id="doz-section-plan"'));
  const post = det.slice(det.indexOf('<details class="sec doz-postavke"'), det.indexOf('</details>'));
  for (const id of ['doz-band-outer', 'doz-cross-warn', 'doz-fill-col', 'doz-fill-opacity', 'doz-border-weight', 'doz-border-dash']) assert.ok(post.includes('id="' + id + '"'), id);
  for (const k of ['gps', 'stats', 'zones', 'vlake']) assert.ok(det.includes(`dozGoSection('${k}')`) && det.includes(`id="doz-section-${k}"`), k);
  assert.ok(/dozShowTypePicker\(\)/.test(det.slice(det.indexOf('id="doz-section-zones"'))));
});
console.log(`doznaka-pregled: ${ok} ok, ${fail} palo`);
process.exit(fail ? 1 : 0);
