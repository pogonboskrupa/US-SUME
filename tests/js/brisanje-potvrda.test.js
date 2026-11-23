// v4.4.5: popup tragova, KML objekata i fotografija ima "Obriši" uz pitanje "jesi li siguran" (Da/Ne).
const fs=require('fs'),assert=require('assert');const src=require('./_izvor').izvor(),le=fs.readFileSync('static/js/layer-editor.js','utf8');
assert(/btn\('_kmlPopObrisi','obrisi','Obriši fajl','le-danger'\)/.test(le),'KML popup: dugme Obriši fajl');
const f=le.slice(le.indexOf('async function _kmlPopObrisi('),le.indexOf('// Sakrij cijeli fajl'));
assert(/_dlgConfirm\([^)]*Jesi li siguran/.test(f)&&/if\(!ok\)return;[\s\S]*delK\(idx\)/.test(f),'KML: prvo pitanje, tek onda brisanje');
const foto=src.slice(src.indexOf('async function fotoObrisiPitaj('),src.indexOf('function deleteFoto('));
assert(/Jesi li siguran/.test(foto)&&/if \(!await _dlgConfirm/.test(foto)&&foto.indexOf('_dlgConfirm')<foto.indexOf('deleteFoto(tsKey)'),'foto: pitanje prije brisanja');
assert(/onclick="fotoObrisiPitaj\(\$\{fkey\},false\)"/.test(src)&&/onclick="fotoObrisiPitaj\(\$\{fkey\},true\)"/.test(src),'popup fotografije ide kroz pitanje');
assert(!/onclick="deleteFoto\(\$\{fkey\}\)"/.test(src)&&!/onclick="deleteFotoShared\(\$\{fkey\}\)"/.test(src),'nema brisanja bez pitanja');
const trag=src.slice(src.indexOf('async function _tragPopupObrisi('),src.indexOf('function _tragPopupRefresh('));
assert(/Jesi li siguran/.test(trag)&&/okLabel: 'Da, obriši'/.test(trag));
console.log('ok brisanje uz potvrdu');
{
  const p=src.slice(src.indexOf('async function _primljeniObrisi('),src.indexOf('// ─── Ko smije'));
  assert(/Jesi li siguran/.test(p)&&p.indexOf('_dlgConfirm')<p.indexOf('delK(i2)')&&p.indexOf('_dlgConfirm')<p.indexOf('_kmlcDelete'),'primljeno: pitanje prije brisanja');
  assert(/Uklonit će se i sa karte/.test(p),'obrisan primljeni podatak nestaje i sa karte');
  const d=src.slice(src.indexOf('function delK('),src.indexOf('function delK(')+500);
  assert(/x\.lokalno === ime/.test(d),'brisanje sloja čisti vezu u spisku primljenih');
  console.log('ok primljeno');
}
