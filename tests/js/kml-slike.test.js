// v4.4.4: primljena slika (KML tačka sa data:image) — sličica na karti, pregled preko cijelog ekrana, Sačuvaj/Podijeli, prekidač "kao tačka".
const assert=require('assert'),fs=require('fs');const src=require('./_izvor').izvor(),le=fs.readFileSync('static/js/layer-editor.js','utf8');
const re=new Function(src.match(/const _KML_SLIKA_RE = (\/[^\n]+\/i);/)[0]+';return _KML_SLIKA_RE;')();
assert.equal(re.exec('<img src="data:image/jpeg;base64,QUJD" width="3">')[1],'data:image/jpeg;base64,QUJD');
assert(!re.exec('<img src="https://x.y/a.jpg">'),'vanjski URL se ne prikazuje');
assert(/try \{ _kmlFotoSloj\(k\); \} catch/.test(src),'applyKmlStyle gradi sloj sličica');
assert(/_fotoPrikaziSrc\(src, nm/.test(src),'klik na sličicu otvara sliku');
assert(/function _fotoFullSacuvaj\(/.test(src)&&/function _fotoFullPodijeli\(/.test(src)&&/function _fotoFullReset\(/.test(src));
assert(/_kmlPopSlikaProsiri\(/.test(le)&&/_kmlPopSlikaKaoTacka\(/.test(le),'popup: otvori sliku i prikaz kao tačka');
console.log('ok kml slike');
{
  // v4.4.9: pregled slike — zum prstima, bez dugmeta "Uvećaj", Obriši (primljena i vlastita) uz pitanje.
  const g=require('./_izvor').izvor();
  assert(!/>🔍 Uvećaj</.test(g),'dugme Uvećaj uklonjeno');
  assert(/touchmove[\s\S]{0,300}Math\.min\(8, s0 \* dist\(e\.touches\) \/ d0\)/.test(g)&&/dblclick/.test(g)&&/wheel/.test(g),'pinch, dvostruki dodir, točkić');
  assert(/class="fz-obrisi" onclick="_fotoFullObrisiKlik\(\)"/.test(g),'Obriši u pregledu');
  const o=g.slice(g.indexOf('async function _kmlSlikaObrisi('),g.indexOf('function _fotoFullImeFajla('));
  assert(/Jesi li siguran/.test(o)&&o.indexOf('_dlgConfirm')<o.indexOf('delK(idx)'),'pita prije brisanja');
  assert(/_kmlSlikaObrisi\(k\)\)/.test(g)&&/fotoObrisiPitaj\(tsKey,!!isShared\)/.test(g),'primljena i vlastita slika imaju brisanje');
  console.log('ok pregled slike');
}
