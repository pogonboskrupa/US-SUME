const assert=require('node:assert/strict'),fs=require('node:fs');
const html=fs.readFileSync('index.html','utf8'),sw=fs.readFileSync('sw.js','utf8');
assert(!html.includes('function _wbToggle'));
assert(!html.includes('id="wb-toggle"'));
assert(!html.includes('winter-imagery.js'));
assert(!sw.includes('winter-imagery.js'));
assert(!sw.includes('wayback.maptiles.arcgis.com'));
console.log('OK: uklonjeni ulazi, runtime i SW preuzimanje vremenske trake');
