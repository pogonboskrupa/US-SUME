// Oporavak snimanja mora stvarno NASTAVITI snimanje i ne smije pomiješati
// redoslijed tačaka; Stop iz notifikacije ne smije ugasiti native servis
// drugom snimanju koje i dalje traje.
'use strict';
const fs = require('node:fs'), assert = require('node:assert/strict');
const html = fs.readFileSync('index.html', 'utf8');
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
  assert.match(f.slice(i, i + 900), /_tragPauseWin\.push\(\{ start: now, end: null \}\)/);
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
  assert.match(html, /_OL\.loadQueue\(true\)\.filter\(o => !\(o\.type === 'insert_projekt'/);
});
Promise.all(pend).then(() => { console.log(`gps-oporavak-nastavak: ${ok} ok, ${fail} palo`); process.exit(fail ? 1 : 0); });
