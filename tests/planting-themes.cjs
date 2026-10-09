const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const html = fs.readFileSync(require('node:path').join(__dirname, '../index.html'), 'utf8');
// Execute the actual theme implementation with lightweight Leaflet/UI doubles.
const start = html.indexOf('const _TEM_REG_KEY');
const end = html.indexOf('// Vidljivost jedne karte', start);
const elements = {};
const context = vm.createContext({ console, Number, Math, Map, Set,
  localStorage: { setItem() {} }, showToast() {},
  document: { getElementById: id => elements[id] || null,
    createElement: () => ({ style: {}, remove() { delete elements['tem-legend']; } }) },
  _escHtml: s => String(s).replace(/</g, '&lt;'),
});
elements.map = { appendChild(el) { elements[el.id] = el; } };
vm.runInContext(html.slice(start, end), context);
vm.runInContext(`
function polygon() { return { style: {}, setStyle(s) { Object.assign(this.style,s); }, closePopup() {} }; }
const group = { layers: new Set(), addLayer(p) { this.layers.add(p); },
 removeLayer(p) { this.layers.delete(p); }, hasLayer(p) { return this.layers.has(p); } };
const features = [null, '', ' ', 0, 49, 50, 59.9, 60, 69.9, 70, 79, 80, 90, 100, 101].map(v =>
 ({ attrs: { bukva:v, jela: null }, polys:[polygon()] }));
features.forEach(f => group.addLayer(f.polys[0]));
const entry = { id:'test', planting:true, grp:group, features, visible:true, cols:['bukva','jela'],
 styles:{bukva:{breaks:[69.8,78.3,79],colors:['red','green']}}, opacity:0.8 };
_temMaps.push(entry);
_temApplyTheme('test','bukva');
globalThis.result = { entry, features, group };
`, context);
const {entry, features, group} = context.result;
assert.equal(group.layers.size, 9, 'only valid candidate cells remain on the map');
assert.deepEqual(Array.from(entry._cls.breaks), [60,70,80,90], 'saved quantiles cannot replace planting classes');
assert.equal(features[5].polys[0].style.fillColor, '#ebdff5');
assert.equal(features[7].polys[0].style.fillColor, '#c19cda');
assert.equal(features[10].polys[0].style.fillColor, '#935bbd');
assert.equal(features[11].polys[0].style.fillColor, '#6e329b');
assert.equal(features[12].polys[0].style.fillColor, '#48146e');
assert.equal(features[5].polys[0].style.weight, 0);
vm.runInContext("_temSetOpacity('test',0.6,true); _temApplyTheme('test','jela');", context);
assert.equal(group.layers.size, 0, 'all-NULL species renders no cells, including after opacity changes');
assert.ok(elements['tem-legend'].innerHTML.includes('Uslovno'));
assert.ok(elements['tem-legend'].innerHTML.includes('90–100'));
vm.runInContext("_temApplyTheme('test','bukva');", context);
assert.equal(group.layers.size, 9, 'switching species restores candidate polygons');
vm.runInContext("_temApplyTheme('test',null);", context);
assert.equal(group.layers.size, 15, 'clearing the theme restores the original layer');
vm.runInContext(`entry.planting=false; entry.features=[{attrs:{x:null},polys:[polygon()]},
 {attrs:{x:10},polys:[polygon()]},{attrs:{x:20},polys:[polygon()]}]; _temApplyTheme('test','x');`, context);
assert.equal(entry._cls.min, 10, 'NULL never contributes a zero to generic themes');
assert.equal(entry._cls.max, 20);
console.log('Planting theme checks passed: missing values, fixed classes, purple colours, species switching, opacity, generic themes.');
