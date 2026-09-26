// =====================================================================
// Teren panel (v1.8.2): dnevno svjetlo, N.V. iz DEM-a, vozilo, liste.
// Pokretanje:  node tests/js/teren.test.js
// Test pušta STVARNE funkcije izvučene iz index.html.
// =====================================================================
'use strict';
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const HTML = fs.readFileSync(path.join(__dirname, '../../index.html'), 'utf8');

function extractFn(name) {
  let start = HTML.indexOf('async function ' + name + '(');
  if (start < 0) start = HTML.indexOf('function ' + name + '(');
  if (start < 0) throw new Error('nije nađena funkcija ' + name);
  let i = HTML.indexOf('{', start), depth = 0;
  for (; i < HTML.length; i++) {
    if (HTML[i] === '{') depth++;
    else if (HTML[i] === '}') { depth--; if (depth === 0) return HTML.slice(start, i + 1); }
  }
  throw new Error('nezatvorena funkcija ' + name);
}
const fns = (...n) => n.map(extractFn).join('\n');
const PAD = "const _trnPad = n => String(n).padStart(2, '0');\n";

let pass = 0, fail = 0;
const cekaj = [];
function t(name, fn) {
  try {
    const r = fn();
    if (r && r.then) { cekaj.push(r.then(() => { console.log('  ✔ ' + name); pass++; }, e => { fail++; console.log('  ✘ ' + name + '\n      ' + e.message); })); return; }
    console.log('  ✔ ' + name); pass++;
  } catch (e) { fail++; console.log('  ✘ ' + name + '\n      ' + e.message); }
}
console.log('Teren:');

const sun = new Function(PAD + fns('_trnTrajanje', '_sunceVrijeme', '_sunceDan', '_sunceStanje') +
  '\nreturn { _sunceDan, _sunceStanje, _trnTrajanje };')();

t('izlazak/zalazak: Sarajevo 23.09. = 06:34 / 18:44 (CEST), tolerancija 3 min', () => {
  const s = sun._sunceDan(new Date(Date.UTC(2026, 8, 23, 12)), 43.8563, 18.4131);
  const min = d => d.getUTCHours() * 60 + d.getUTCMinutes();
  assert.ok(Math.abs(min(s.izlaz) - (4 * 60 + 34)) <= 3, s.izlaz.toISOString());
  assert.ok(Math.abs(min(s.zalaz) - (16 * 60 + 44)) <= 3, s.zalaz.toISOString());
  assert.ok(s.mrak > s.zalaz && s.svitanje < s.izlaz, 'sumrak mora biti poslije zalaska / prije izlaska');
  const zima = sun._sunceDan(new Date(Date.UTC(2026, 11, 21, 12)), 44.8, 15.87);
  assert.ok(zima.zalaz - zima.izlaz < 9.5 * 3600e3, 'zimski dan u BiH je kraći od 9,5 h');
});

t('stanje dana: ostatak svjetla, upozorenje zadnji sat, sumrak, mrak', () => {
  const s = sun._sunceDan(new Date(Date.UTC(2026, 8, 23, 12)), 43.8563, 18.4131);
  const u = ms => new Date(s.zalaz.getTime() + ms);
  assert.strictEqual(sun._sunceStanje(s, u(-3 * 3600e3)).cls, 'ok');
  assert.ok(/još 3 h 0 min svjetla/.test(sun._sunceStanje(s, u(-3 * 3600e3)).txt));
  assert.strictEqual(sun._sunceStanje(s, u(-30 * 60e3)).cls, 'warn');
  assert.ok(/sumrak — mrak za/.test(sun._sunceStanje(s, u(10 * 60e3)).txt));
  assert.strictEqual(sun._sunceStanje(s, u(3 * 3600e3)).txt, 'mrak');
  const p = [-3, -1, 0.1, 0.4, 2].map(h => sun._sunceStanje(s, u(h * 3600e3)).pos);
  assert.ok(p.every((v, i) => i === 0 || v >= p[i - 1]) && p.every(v => v >= 0 && v <= 100), 'marker na traci mora ići naprijed');
});

t('trajanje: s / min / h min', () => {
  assert.strictEqual(sun._trnTrajanje(45), '45 s');
  assert.strictEqual(sun._trnTrajanje(12 * 60 + 20), '12 min');
  assert.strictEqual(sun._trnTrajanje(2 * 3600 + 5 * 60), '2 h 5 min');
});

t('tačnost GPS-a: boja po pragovima, traka kraća za lošiji signal', () => {
  const f = new Function(extractFn('_trnTacnost') + '\nreturn _trnTacnost;')();
  assert.strictEqual(f(4).boja, '#34d399');
  assert.strictEqual(f(10).boja, '#a3e635');
  assert.strictEqual(f(20).boja, '#fbbf24');
  assert.strictEqual(f(60).boja, '#f87171');
  assert.ok(f(4).pct > f(20).pct && f(20).pct > f(60).pct && f(60).pct >= 6);
  assert.strictEqual(f(null).txt, '— m');
});

function nvEnv(dem, ucitaj) {
  const env = { crtanja: 0, ucitavanja: 0, _activeTab: 'teren' };
  const f = new Function('env', `
    var _activeTab = env._activeTab;
    function _nvDemSync() { return env.dem(); }
    function _nvDemUcitaj() { env.ucitavanja++; return Promise.resolve(env.ucitaj()); }
    function _trnPozicijaRender() { env.crtanja++; }
    ${HTML.match(/var _trnNvCeka = false;/)[0]}
    ${extractFn('_trnNv')}
    return _trnNv;`)(env);
  env.dem = dem; env.ucitaj = ucitaj;
  return { env, f };
}

t('N.V.: DEM ima prednost; GPS visina je samo rezerva i označena kao približna', () => {
  const { f } = nvEnv(() => 412.4, () => true);
  assert.deepStrictEqual(f(44.9, 16.1, 457), { txt: '412 m', izvor: 'dem' });
  const g = nvEnv(() => null, () => false).f;
  assert.deepStrictEqual(g(44.9, 16.1, 457), { txt: '≈ 457 m', izvor: 'gps' });
  assert.strictEqual(g(44.9, 16.1, 0).txt, '— m', 'al = 0 znači da visine nema (lastP.al ?? 0)');
});

t('N.V.: neuspjelo učitavanje pločice NE pokreće ponovno crtanje (inače petlja)', async () => {
  const { env, f } = nvEnv(() => undefined, () => false);
  f(44.9, 16.1, 457); f(44.9, 16.1, 457);
  await new Promise(r => setTimeout(r, 10));
  assert.strictEqual(env.ucitavanja, 1, 'dok učitavanje traje, ne pokreće se drugo');
  assert.strictEqual(env.crtanja, 0);
  const ok = nvEnv(() => undefined, () => true);
  ok.f(44.9, 16.1, 457);
  await new Promise(r => setTimeout(r, 10));
  assert.strictEqual(ok.env.crtanja, 1, 'stigla pločica → jedno ponovno crtanje');
});

t('lista tačaka: najbliže prvo, a dugmad nose STVARNI indeks u _tacke', () => {
  const el = { innerHTML: '' }, cnt = { textContent: '' };
  const f = new Function('el', 'cnt', `
    const document = { getElementById: id => id === 'trn-tacke-list' ? el : id === 'trn-tacke-cnt' ? cnt : null };
    const _tacke = [{ la: 44.95, lo: 16.1, nm: 'Daleko', ts: 0 }, { la: 44.9005, lo: 16.1, nm: 'Blizu', ts: 0 }, { la: 44.92, lo: 16.1, nm: 'Vozilo', ts: 0 }];
    const lastP = { la: 44.9, lo: 16.1 };
    const _tackaNavIdx = null;
    const _TRN_VOZILO_NM = 'Vozilo';
    const _escHtml = s => String(s);
    ${fns('terenRenderTacke', '_haversine', '_bearing', '_fmtDist', '_azimutSmjer', '_trnKad')}
    ${PAD}
    terenRenderTacke();`);
  f(el, cnt);
  const h = el.innerHTML;
  assert.ok(h.indexOf('Blizu') < h.indexOf('Vozilo') && h.indexOf('Vozilo') < h.indexOf('Daleko'), 'nije sortirano po udaljenosti');
  const red = nm => h.slice(h.indexOf(nm) - 400, h.indexOf(nm) + 700);
  assert.ok(/vodiMeDoTacke\(1\)/.test(h.slice(h.indexOf('Blizu'), h.indexOf('Vozilo'))), 'Blizu mora voditi na indeks 1');
  assert.ok(/terenZoomTacka\(0\)/.test(red('Daleko')));
  assert.ok(/ic-vozilo/.test(red('Vozilo')), 'vozilo ima svoju ikonicu');
  assert.strictEqual(cnt.textContent, 3);
});

t('vozilo je obična tačka "Vozilo": drugo označavanje je PREMJEŠTA, ne pravi duplikat', async () => {
  const log = [];
  const f = new Function('log', `
    const _tacke = [{ la: 1, lo: 1, ts: 1, nm: 'Vozilo', marker: { setLatLng: ll => log.push(['move', ll]) } }];
    let lastP = { la: 44.9, lo: 16.1 };
    const _TRN_VOZILO_NM = 'Vozilo';
    async function _dlgConfirm() { log.push('confirm'); return true; }
    function _createTacka() { log.push('create'); }
    function _setupTackaPopup() {}
    function _saveTacke() { log.push('save'); }
    function showToast() {}
    function terenRender() {}
    ${fns('_trnVoziloIdx', 'terenVoziloOznaci')}
    return terenVoziloOznaci().then(() => _tacke);`);
  const tacke = await f(log);
  assert.ok(!log.includes('create') && log.includes('confirm') && log.includes('save'));
  assert.strictEqual(tacke.length, 1);
  assert.deepStrictEqual([tacke[0].la, tacke[0].lo], [44.9, 16.1]);
});

t('GPS fiks crta laganu verziju; otvaranje taba crta sve (liste, projekti)', () => {
  const r = extractFn('terenRender');
  assert.ok(/if \(pun\) \{[^}]*terenRenderShared\(\)/.test(r), 'učitani projekti samo pri punom crtanju');
  assert.ok(/_trnPodaciRender\(!!pun\)/.test(r));
  assert.ok(/if \(tab === 'teren'\)\s+terenRender\(true\);/.test(HTML));
  const p = extractFn('_trnPodaciRender');
  assert.ok(/_trnTab === 'tacke'\) terenRenderTacke\(\)/.test(p) && /sve && _trnTab === 'trag'/.test(p));
});

t('brisanje sa Terena traži potvrdu kroz _dlgConfirm (ne sakrivenu potvrdu sa karte)', () => {
  assert.ok(/_dlgConfirm/.test(extractFn('terenObrisiTrag')) && /_dlgConfirm/.test(extractFn('terenObrisiMsr')));
  assert.ok(!/_msrAskDelete/.test(extractFn('terenRenderMjerenja')));
});

t('otkucaj se sam gasi kad Teren nije otvoren', () => {
  const f = extractFn('_trnTickStart');
  assert.ok(/_activeTab !== 'teren'\) \{ clearInterval\(_trnTick\)/.test(f));
});

Promise.all(cekaj).then(() => {
  console.log(`\n${pass} prošlo, ${fail} palo`);
  process.exit(fail ? 1 : 0);
});
