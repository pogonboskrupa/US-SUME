// v4.4.4: primljena slika (KML tačka sa data:image) — sličica na karti, pregled preko cijelog ekrana, Sačuvaj/Podijeli, prekidač "kao tačka".
const assert=require('assert'),fs=require('fs');const src=require('./_izvor').izvor(),le=fs.readFileSync('static/js/layer-editor.js','utf8');
const re=new Function(src.match(/const _KML_SLIKA_RE = (\/[^\n]+\/i);/)[0]+';return _KML_SLIKA_RE;')();
assert.equal(re.exec('<img src="data:image/jpeg;base64,QUJD" width="3">')[1],'data:image/jpeg;base64,QUJD');
assert(!re.exec('<img src="https://x.y/a.jpg">'),'vanjski URL se ne prikazuje');
assert(/try \{ _kmlFotoSloj\(k\); \} catch/.test(src),'applyKmlStyle gradi sloj sličica');
assert(/_fotoPrikaziSrc\(src, nm/.test(src),'klik na sličicu otvara sliku');
assert(/function _fotoFullSacuvaj\(/.test(src)&&/function _fotoFullPodijeli\(/.test(src)&&/function _fotoFullZum\(/.test(src));
assert(/_kmlPopSlikaProsiri\(/.test(le)&&/_kmlPopSlikaKaoTacka\(/.test(le),'popup: otvori sliku i prikaz kao tačka');
console.log('ok kml slike');
