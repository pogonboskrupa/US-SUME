const assert = require('node:assert');
const fs = require('node:fs');
const html = fs.readFileSync(require('node:path').join(__dirname,'../../index.html'),'utf8');
assert.ok(!html.includes('function _s2TokenUzmi'));
assert.ok(!html.includes('id="s2-section"'));
assert.ok(!html.includes("from('sentinel2_kljucevi')"));
assert.ok(html.includes("localStorage.removeItem('tvlake_sentinel2_kljucevi_kes')"));
assert.ok(html.includes('function _wbToggle'),'Wayback ostaje');
console.log('5 prošlo, 0 palo — uklonjeni Sentinel-2');
