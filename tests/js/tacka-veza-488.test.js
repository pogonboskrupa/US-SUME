// v4.8.8: tačke se vide do 1:25 000, kartica popupa tačke, i veza — onLine=false nije nepogrešiv + sonda + dijagnostika.
'use strict';
const assert = require('node:assert');
const vm = require('node:vm');
const HTML = require('./_izvor').izvor();
function fn(name) {
  let start = HTML.indexOf('async function ' + name + '(');
  if (start < 0) start = HTML.indexOf('function ' + name + '(');
  if (start < 0) throw new Error('nema ' + name);
  let i = HTML.indexOf('{', start), d = 0;
  for (; i < HTML.length; i++) { if (HTML[i] === '{') d++; else if (HTML[i] === '}' && --d === 0) return HTML.slice(start, i + 1); }
  throw new Error('nezatvoreno ' + name);
}
function line(re) { const m = HTML.match(re); if (!m) throw new Error('nema ' + re); return m[0]; }
let pass = 0, fail = 0;
async function t(name, f) { try { await f(); console.log('  ✔ ' + name); pass++; } catch (e) { fail++; console.log('  ✘ ' + name + '\n      ' + e.message); } }

// ── razmjera za tačke
const ozr = vm.createContext({ localStorage: { getItem: () => null, setItem() {} } });
vm.runInContext([line(/var _OZR_KEY = [^;]+;/), line(/var _OZR_ZADANO = [^;]+;/), 'var _ozrMem = null, _ozrRazmjera = 0;', fn('_ozrPostavke'), fn('_ozrVidljivo')].join('\n'), ozr);

// ── mreža
function mreza(opts = {}) {
  const ctx = vm.createContext({
    navigator: { onLine: opts.onLine }, document: { getElementById: () => null, hidden: false }, Date, console, setInterval: () => 0, setTimeout, clearTimeout, URL,
    AbortController, SUPA_URL: 'https://x.supabase.co', fetch: opts.fetch || (async () => ({})),
    _netPrimijeniRezim() {}, _netBadgeSync() {}, _netVezaVracena() {}, _serverSazetakRender() {}, _debugUpsert() {}, _mrezaSila() {}, _escHtml: s => s
  });
  vm.runInContext([line(/const _NET_UZORAKA = [^;]+;/), line(/const _NET_SVJEZE_MS = [^;]+;/), line(/const _NET_SPORO_MS = [^;]+;/), 'let _netUzorci = [];', 'let _netProbaDo = 0, _netSilaDo = 0;',
    fn('_netZabiljezi'), fn('_netSvjezi'), fn('_netMedijanMs'), fn('_netKvalitet'), 'var _netOsLazeDo = 0;', fn('_netOsOffline'),
    line(/const _NET_SONDA_MS = [^;]+;/), 'var _netSondaZadnja = null, _netSondaBusy = false, _netDijagnozaTxt = "";', fn('_netHostTxt'), fn('_netSondaZahtjev'), fn('_netSonda'), fn('_netRazlog'), fn('_netProvjeriVezu'),
    'globalThis.__push = u => _netUzorci.push(u);'].join('\n'), ctx);
  return ctx;
}
const OK = (t = Date.now()) => ({ ok: true, ms: 120, vrsta: 'ok', t }), PAO = (vrsta = 'greska', host = 'x.supabase.co') => ({ ok: false, ms: 50, vrsta, t: Date.now(), host });

(async () => {
  console.log('Tačke i veza (v4.8.8):');
  await t('tačke su zadano vidljive do 1:25 000, a sitnije se sklanjaju', () => {
    assert.strictEqual(vm.runInContext('_ozrPostavke().tacke', ozr), 25000);
    assert.strictEqual(vm.runInContext('_ozrVidljivo("tacke", 25000)', ozr), true);
    assert.strictEqual(vm.runInContext('_ozrVidljivo("tacke", 12500)', ozr), true);
    assert.strictEqual(vm.runInContext('_ozrVidljivo("tacke", 50000)', ozr), false);
  });
  await t('izvor: tačke prate pravilo pri crtanju, obnovi i u prikazu kategorija', () => {
    assert.ok(/_ozrSkriveno\('tacke'\)\)m\.addTo\(map\)/.test(HTML), 'nova tačka');
    assert.ok((HTML.match(/_ozrSkriveno\('tacke'\)/g) || []).length >= 3, 'primijeni + nova + obnova');
    assert.ok(/category==='points'&&typeof _ozrSkriveno==='function'&&_ozrSkriveno\('tacke'\)/.test(require('node:fs').readFileSync(__dirname + '/../../static/js/map-visibility.js', 'utf8')), 'map-visibility');
  });
  await t('smjer: strane svijeta po azimutu', () => {
    const c = vm.createContext({}); vm.runInContext("var _TK_STRANE=['S','SI','I','JI','J','JZ','Z','SZ'];" + fn('_tackaStrana'), c);
    assert.strictEqual(vm.runInContext('_tackaStrana(0)', c), 'S'); assert.strictEqual(vm.runInContext('_tackaStrana(135)', c), 'JI');
    assert.strictEqual(vm.runInContext('_tackaStrana(359)', c), 'S'); assert.strictEqual(vm.runInContext('_tackaStrana(-90)', c), 'Z');
  });
  await t('popup tačke: naziv se escape-uje, bez GPS-a piše GPS isključen, Vodi me i Obriši sa potvrdom', () => {
    const c = vm.createContext({ lastP: null, _tacke: [], wgsToMGI: () => ({ y: '6356534', x: '4958516' }), _escHtml: s => String(s).replace(/</g, '&lt;'), _nvDemSync: () => 584, _fmtDist: m => m + ' m', _haversine: () => 100, _bearing: () => 90 });
    vm.runInContext("var _TK_STRANE=['S','SI','I','JI','J','JZ','Z','SZ'];" + [fn('_tackaStrana'), fn('_tackaKoordTxt'), fn('_tackaPopupHtml')].join('\n'), c);
    const h = vm.runInContext('_tackaPopupHtml(2, 44.9, 16.1, Date.now(), "<b>Izvor</b>")', c);
    assert.ok(h.includes('&lt;b>Izvor') && !h.includes('<b>Izvor</b>'));
    assert.ok(h.includes('GPS isključen') && h.includes('584 m') && h.includes('vodiMeDoTacke(2)') && h.includes('_tackaObrisiPitaj(2)'));
    assert.ok(!/onclick="deleteTacka/.test(h), 'brisanje mora kroz potvrdu');
    vm.runInContext('lastP = { la: 44.9, lo: 16.1 }', c);
    const g = vm.runInContext('_tackaPopupHtml(0, 44.91, 16.1, Date.now(), "")', c);
    assert.ok(g.includes('100 m') && g.includes('I 90°') && g.includes('Tačka 1'));
  });
  await t('OS javlja offline: bez dokaza je "nema", a uspješna sonda ga poništava', async () => {
    const c = mreza({ onLine: false });
    assert.strictEqual(vm.runInContext('_netKvalitet()', c), 'nema');
    await vm.runInContext('_netSonda()', c);   // fetch uspije
    assert.notStrictEqual(vm.runInContext('_netKvalitet()', c), 'nema', 'server odgovara — OS laže');
    assert.ok(vm.runInContext('_netOsLazeDo', c) > Date.now());
  });
  await t('sonda koja padne NE čini ništa osim što pamti razlog', async () => {
    const c = mreza({ onLine: true, fetch: async () => { throw new TypeError('Failed to fetch'); } });
    c.__push(PAO()); c.__push(PAO());
    assert.strictEqual(vm.runInContext('_netKvalitet()', c), 'nema');
    await vm.runInContext('_netSonda()', c);
    assert.strictEqual(vm.runInContext('_netKvalitet()', c), 'nema');
    const z = vm.runInContext('_netSondaZadnja', c); assert.strictEqual(z.ok, false); assert.strictEqual(z.vrsta, 'odbijeno');
  });
  await t('razlog: server odbija vs. veza visi vs. OS offline', () => {
    let c = mreza({ onLine: true }); c.__push(PAO('greska')); c.__push(PAO('greska'));
    assert.ok(/x\.supabase\.co.*odbija vezu odmah/.test(vm.runInContext('_netRazlog()', c)));
    c = mreza({ onLine: true }); c.__push(PAO('istek')); c.__push(PAO('istek'));
    assert.ok(/visi/.test(vm.runInContext('_netRazlog()', c)));
    c = mreza({ onLine: false }); assert.ok(/Telefon javlja/.test(vm.runInContext('_netRazlog()', c)));
    c = mreza({ onLine: true }); c.__push(OK()); assert.strictEqual(vm.runInContext('_netRazlog()', c), '');
  });
  await t('provjera veze: internet radi a server ne → poruka o blokadi servera sa ove mreže', async () => {
    const c = mreza({ onLine: true, fetch: async u => { if (String(u).includes('supabase')) throw new TypeError('Failed to fetch'); return {}; } });
    const txt = await vm.runInContext('_netProvjeriVezu()', c);
    assert.ok(/Internet RADI, ali naš server nije dostupan/.test(txt), txt);
    const c2 = mreza({ onLine: true, fetch: async () => { throw new TypeError('x'); } });
    assert.ok(/Ni internet ni server/.test(await vm.runInContext('_netProvjeriVezu()', c2)));
    const c3 = mreza({ onLine: false });
    assert.ok(/Server odgovara/.test(await vm.runInContext('_netProvjeriVezu()', c3)));
    assert.ok(vm.runInContext('_netOsLazeDo', c3) > Date.now(), 'onLine=false se ignoriše poslije dokaza');
  });
  console.log(`\n${pass} prošlo, ${fail} palo`);
  process.exit(fail ? 1 : 0);
})();
