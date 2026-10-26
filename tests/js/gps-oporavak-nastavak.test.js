// Oporavak snimanja mora stvarno NASTAVITI snimanje i ne smije pomiješati
// redoslijed tačaka; Stop iz notifikacije ne smije ugasiti native servis
// drugom snimanju koje i dalje traje.
'use strict';
const fs = require('node:fs'), assert = require('node:assert/strict');
const html = require('./_izvor').izvor();
function fn(name) {
  const start = html.search(new RegExp('(?:async )?function ' + name + '\\('));
  assert.ok(start >= 0, name);
  let depth = 0;
  for (let i = html.indexOf('{', start); i < html.length; i++) {
    if (html[i] === '{') depth++;
    if (html[i] === '}' && --depth === 0) return html.slice(start, i + 1);
  }
}
let ok = 0, fail = 0;
const pend = [];
const t = (n, f) => { const bad = e => { fail++; console.log('FAIL', n, e.message); };
  try { const r = f(); if (r && r.then) pend.push(r.then(() => { ok++; console.log('OK', n); }, bad)); else { ok++; console.log('OK', n); } } catch (e) { bad(e); } };
const crash = fn('_crashCheck');
const tragGrana = crash.slice(crash.indexOf('if (snapT) {'), crash.indexOf('if (snapD) {'));
const dozGrana = crash.slice(crash.indexOf('if (snapD) {'));

t('oporavljen trag pokreće GPS i native servis (ne samo natpis "nastavljeno")', () => {
  assert.match(tragGrana, /if \(!gpsOn\) startGPS\(\);/);
  assert.match(tragGrana, /_bgRecStart\('trag'\)/);
  assert.ok(tragGrana.indexOf("_bgRecStart('trag')") > tragGrana.indexOf('for (const p of bufPts)'),
    'servis se pali POSLIJE dopune, da _nativeSessionSince ne odsiječe tačke');
});
t('dopuna traga ide sa bypassPauzu (auto-pauza usred dopune ne gubi ostatak)', () => {
  assert.match(tragGrana, /_addTragPoint\(p\.la, p\.lo, p\.ac, p\.al, p\.sp, p\.t, true\)/);
});
t('auto-pauza bilježi prozor pauze (dopuna ne smije ubaciti pauzirani dio)', () => {
  const f = fn('_addTragPoint');
  const i = f.indexOf('AUTO-PAUZA');
  assert.ok(i > 0);
  assert.match(f.slice(i, i + 900), /_pauziOtvoriProzor\(_tragPauseWin, now\)/);
});
t('doznaka: dopuna PRIJE watchPosition, i pad dopune ne sprečava nastavak', () => {
  const iLoop = dozGrana.indexOf('for (const p of bufPts)');
  const iWatch = dozGrana.indexOf('watchPosition');
  assert.ok(iLoop > 0 && iWatch > iLoop, 'živi fiks ne smije ući prije starijih tačaka');
  assert.match(dozGrana.slice(iLoop - 200, iWatch), /catch\(e\) \{ _svePersistirano = false;/);
});
t('Stop iz notifikacije vraća native servis kad drugo snimanje i dalje traje', () => {
  const f = fn('_nativeRecAction');
  const calls = [];
  const env = { recOn: true, _tragOn: true, _dozGpsOn: false, actI: 0, vlake: [{ nm: 'T1' }],
    _drainNativeGpsBuffer: async () => {}, stopRec() { env.recOn = false; }, fabSnimTrag() { env._tragOn = false; },
    dozStopGPS: async () => {}, _anyRecOn: () => env.recOn || env._tragOn || env._dozGpsOn,
    AndroidGps: { startRecording: nm => calls.push(nm) } };
  const run = new Function(...Object.keys(env), 'env', f.replace(/\brecOn\b/g, 'env.recOn').replace(/\b_tragOn\b/g, 'env._tragOn') + '\nreturn _nativeRecAction;');
  return run(...Object.values(env), env)('stop').then(() => {
    assert.deepEqual(calls, ['trag'], 'vlaka stala, trag i dalje snima → servis ponovo');
  });
});
t('brisanje neposlanog projekta čita red STRIKTNO', () => {
  assert.match(html, /const sviRed = _OL\.loadQueue\(true\);/);
});
t('živi fiks tokom dopune čeka njen kraj (ne pomjera prag i ne ulazi prije starijih tačaka)', () => {
  assert.match(fn('onP'), /^function onP\(p\) \{\s*\/\/[\s\S]*?if \(_drainNativeGpsBuffer\._busy\) \{ _drainLiveQ\.push\(\{ fn: onP, arg: p \}\); return; \}/);
  const d = fn('_drainNativeGpsBuffer');
  assert.match(d, /finally \{\s*_drainNativeGpsBuffer\._busy = false;[\s\S]*_drainLiveQ\.splice\(0\)/);
  assert.equal((html.match(/_drainLiveQ\.push\(\{ fn: dozLive, arg: pos \}\)/g) || []).length, 2, 'oba doznaka watch-a');
  assert.match(html, /const dopuna = _drainNativeGpsBuffer\(\)\.catch\(\(\) => \{\}\);\s*if \(_anyRecOn\(\) && !_wakeLock\) await _acquireWakeLock\(\);/);
});
t('traka snimanja: na Karti uz vlaku pokazuje pojas doznake (#action-bar ga ne pokriva)', () => {
  const env = { recOn: true, _tragOn: false, _dozGpsOn: true, actI: null, vlake: [], recPaused: false, _dozGpsLen: 0,
    _dozGpsPaused: false, _activeTab: 'karta', fmtL: x => x, calcL: () => 0, _tragFmtLen: x => x };
  const f = new Function(...Object.keys(env), fn('_recBarStanje') + '\nreturn _recBarStanje;');
  assert.equal(f(...Object.values(env))().tip, 'doznaka');
  env._activeTab = 'vlake';
  assert.equal(new Function(...Object.keys(env), fn('_recBarStanje') + '\nreturn _recBarStanje;')(...Object.values(env))().tip, 'vlaka');
});
t('pauza se trajno bilježi i rani snimak se piše na startu', () => {
  assert.match(fn('_pauziOtvoriProzor'), /_pauziSnimi\(\)/);
  assert.match(fn('_pauziZatvoriProzor'), /_pauziSnimi\(\)/);
  assert.match(fn('_pauziResetuj'), /_pauziSnimi\(\)/);
  assert.match(fn('_togRecBegin'), /_crashSaveVlaka\(true\)/);
  assert.match(fn('_fabSnimTragBegin'), /_crashSaveTrag\(true\)/);
  assert.match(fn('_dozStartGPSBegin'), /await FieldStore\.seedSession\(/);
  const store = {}; const ls = { getItem: k => store[k] ?? null, setItem: (k, v) => { store[k] = v; } };
  const g = new Function('localStorage', '_recPauseWin', '_tragPauseWin', '_dozPauseWin', "const _PAUZE_KEY='k';" +
    fn('_pauziSnimi') + fn('_pauziUcitajSnimljene') + fn('_pauziOtvoriProzor') + '\nreturn { _pauziOtvoriProzor, _pauziUcitajSnimljene };');
  const tr = []; const api = g(ls, [], tr, []);
  api._pauziOtvoriProzor(tr, 1234);
  assert.deepEqual(api._pauziUcitajSnimljene().trag, [{ start: 1234, end: null }]);
  store.k = '{"trag":[{"start":"x"}],"vlaka":5}';
  assert.deepEqual(api._pauziUcitajSnimljene(), { vlaka: [], trag: [], doznaka: [] }, 'oštećen zapis ne obara oporavak');
});
Promise.all(pend).then(() => { console.log(`gps-oporavak-nastavak: ${ok} ok, ${fail} palo`); process.exit(fail ? 1 : 0); });
