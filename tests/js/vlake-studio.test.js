// Studio "Nacrtaj vlake u odjelu": čista geometrija hvatanja + invarijante ožičenja.
const fs = require('fs'), path = require('path');
const src = require('./_izvor').izvor();
let pass = 0, fail = 0;
const t = (n, f) => { try { f(); console.log('  ✔ ' + n); pass++; } catch (e) { console.log('  ✘ ' + n + '\n      ' + e.message); fail++; } };
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error((m || '') + ' ' + JSON.stringify(a) + ' != ' + JSON.stringify(b)); };
const a = src.indexOf('function _vsdSnapTo('), b = src.indexOf('function _vsdProj(');
const snap = new Function(src.slice(a, b) + '; return _vsdSnapTo;')();
const proj = (la, lo) => ({ x: lo * 100000, y: -la * 100000 });
const ln = [{ i: 7, pts: [{ la: 0, lo: 0 }, { la: 0, lo: 0.001 }] }];

console.log('Studio vlaka — hvatanje:');
t('čvor ima prednost kad je blizu', () => { const r = snap({ la: 0.00003, lo: 0.00003 }, ln, proj, 12); eq([r.vertex, r.i], [true, 7]); });
t('sredina segmenta se hvata na liniju', () => { const r = snap({ la: 0.00005, lo: 0.0005 }, ln, proj, 12); eq([r.vertex, Math.abs(r.la) < 1e-12, Math.abs(r.lo - 0.0005) < 1e-12], [false, true, true]); });
t('van tolerancije nema hvatanja', () => eq(snap({ la: 0.0002, lo: 0.0005 }, ln, proj, 12), null));
t('prazna lista linija ne baca', () => eq(snap({ la: 0, lo: 0 }, [], proj, 12), null));
t('jedna tačka (bez segmenta) hvata samo čvor', () => { const r = snap({ la: 0.00002, lo: 0 }, [{ i: 1, pts: [{ la: 0, lo: 0 }] }], proj, 12); eq(r.vertex, true); });

console.log('Studio vlaka — ožičenje:');
t('klik karte i klik linije se gase dok je studio otvoren', () => {
  if (!/if \(typeof _vsdOn !== 'undefined' && _vsdOn\) return; \/\/ studio vlaka/.test(src)) throw new Error('map click guard');
  if ((src.match(/_dozDrawType !== null \|\| \(typeof _vsdOn !== 'undefined' && _vsdOn\)\) return;/g) || []).length !== 2) throw new Error('poly click guards');
});
t('napuštanje karte zatvara studio, donja traka se sakriva', () => {
  if (!/prev === 'karta' && tab !== 'karta' && typeof _vsdOn/.test(src)) throw new Error('switchTab');
  if (!/!hideBars && !\(typeof _vsdOn/.test(src)) throw new Error('fab');
});
t('dugme je u detaljima projekta i prati isti uslov kao ručno crtanje', () => {
  if (!/id="pd-studio-btn"[^>]*vlakeStudioOpen\(\)/.test(src)) throw new Error('dugme');
  if (!/studioBtn\.style\.display = \(isAkt && !isReadOnly\(\)\)/.test(src)) throw new Error('vidljivost');
});
console.log('\n' + pass + ' prošlo, ' + fail + ' palo');
process.exit(fail ? 1 : 0);
