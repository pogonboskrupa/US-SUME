// Admin na slabom signalu: ulaz na keširanom profilu (_ulazNaKesu) ne zove sbLoadProfile,
// pa je tab Korisnici ostajao sakriven. Vidljivost po ulozi je sad u _primijeniUlogeUI,
// koju zove showApp() za SVAKI ulaz.
const assert = require('assert');
const fs = require('fs');
const src = require('./_izvor').izvor();
function fn(name) {
  const i = src.indexOf('function ' + name + '(');
  assert.ok(i >= 0, name + ' postoji');
  let d = 0, j = src.indexOf('{', i);
  for (let k = j; k < src.length; k++) {
    if (src[k] === '{') d++;
    else if (src[k] === '}' && --d === 0) return src.slice(i, k + 1);
  }
}
const els = {};
const mk = id => els[id] || (els[id] = { id, style: {}, hidden: false, querySelector: () => null, parentElement: { style: {} } });
['admin-tab-btn', 'postavke-tab-btn', 'teren-tab-btn', 'menu-admin-item'].forEach(mk);
const sandbox = new Function('document', '_updFabVisibility', 'isSpdField', 'isVodeci',
  fn('_primijeniUlogeUI') + '; return _primijeniUlogeUI;')(
  { getElementById: id => els[id] || null, querySelector: () => null },
  () => {}, () => false, () => false);
let ok = 0;
els['admin-tab-btn'].style.display = 'none';
sandbox({ id: 'a', is_admin: true });
assert.strictEqual(els['admin-tab-btn'].style.display, '', 'admin vidi tab Korisnici'); ok++;
sandbox({ id: 'b', is_admin: false });
assert.strictEqual(els['admin-tab-btn'].style.display, 'none', 'ne-admin ga ne vidi'); ok++;
sandbox(null); ok++;  // bez profila ne baca
// showApp mora primijeniti uloge prije otkrivanja app-a
const sa = fn('showApp').replace(/^async /, '');
assert.ok(/_primijeniUlogeUI\(sbProfile\)/.test(src.slice(src.indexOf('async function showApp('), src.indexOf('function _startupRestore('))), 'showApp zove _primijeniUlogeUI'); ok++;
assert.ok(/_primijeniUlogeUI\(data\)/.test(fn('sbLoadProfile') || src.slice(src.indexOf('async function sbLoadProfile('), src.indexOf('function _primijeniUlogeUI('))), 'sbLoadProfile ga i dalje zove'); ok++;
console.log('uloge-offline-ui: ' + ok + ' OK');
