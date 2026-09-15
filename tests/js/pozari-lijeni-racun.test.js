// Postepeni (lijeni) račun arhive po godinama + uvijek uključeni prikazi
// (v1.5.4) — testovi nad STVARNIM kodom iz index.html.
//
// Zahtjev sa terena: "hoću da uvijek ima prikaz tački i opožarene površine...
// teži podaci poput podataka o cijeloj godini hoću da se polako i skriveno
// prikazuju tj. pametno. Da ne koči mobitel."
//
// JavaScript je jednonitan: dok turf računa uniju, telefon ne prima dodir i ne
// crta. Zato crtanje i kartica smiju SAMO čitati keš, a račun ide u red koji se
// vrti po jednu jedinicu u praznom hodu.

const fs = require('fs');
const path = require('path');
const SRC = fs.readFileSync(path.join(__dirname, '../../index.html'), 'utf8');

let ok = 0, fail = 0;
function t(ime, fn) {
  try { fn(); ok++; }
  catch (e) { fail++; console.log('  PAO:', ime, '\n    ', e.message); }
}
function eq(a, b, msg) {
  if (a !== b) throw new Error((msg || '') + ' očekivano ' + JSON.stringify(b) + ', dobijeno ' + JSON.stringify(a));
}
function extractFn(naziv) {
  let i = SRC.indexOf('async function ' + naziv + '(');
  if (i < 0) i = SRC.indexOf('function ' + naziv + '(');
  if (i < 0) throw new Error('nema funkcije ' + naziv + ' u index.html');
  let d = 0, p = false;
  for (let j = i; j < SRC.length; j++) {
    const c = SRC[j];
    if (c === '{') { d++; p = true; }
    else if (c === '}') { d--; if (p && d === 0) return SRC.slice(i, j + 1); }
  }
  throw new Error('neuravnotežene zagrade za ' + naziv);
}

// Sandbox planera. Praznog hoda nema u Node-u, pa se takt vrti ručno
// (env._takt) — tako test vidi STVARAN redoslijed: koliko se posla uradi po
// jednom taktu, a koliko ostane za sljedeći.
function makeSandbox(opts) {
  opts = opts || {};
  const log = { racunato: [], crtanja: 0 };
  const env = {
    _povArhKes: {},
    _povArhGrupeKes: {},
    _povArhUkljucene: () => opts.ukljucene || [],
    _povArhRender: () => { log.crtanja++; },
    _povArhKesKljuc: (g) => g + '@0.0,0.0',
    _povArhTacke: (g) => (opts.tacke || {})[g] || [],
    _povArhRacunajTacke: (pts) => { log.racunato.push(pts.length); return pts.length ? { ha: pts.length } : null; },
    _povMjesecSkori: () => true,
    _poziGrupisi: (pts) => [{ pts }],
    document: { getElementById: () => null },
    setTimeout: (fn) => { env._odgodjeni.push(fn); return 1; },
    _odgodjeni: [],
    _taktovi: [],
  };
  env.requestIdleCallback = (fn) => { env._taktovi.push(fn); };

  const tijelo = [
    'const _povArhRed = [];',
    'let _povArhRadi = false;',
    'let _povArhTekuci = null;',
    'let _povArhCrtajTajmer = null;',
    extractFn('_povArhZakazi'),
    extractFn('_povArhSljedeciTakt'),
    extractFn('_povArhPokreniObradu'),
    extractFn('_povArhTraziCrtanje'),
    extractFn('_povArhPreostalo'),
    extractFn('_povArhStanjeRender'),
    extractFn('_povArhRacunaj'),
    extractFn('_povArhRacunajMjesec'),
    extractFn('_povArhRacunajSkore'),
    'return { _povArhRacunaj, _povArhRacunajMjesec, _povArhRacunajSkore, _povArhPreostalo,' +
    ' red:_povArhRed, kes:_povArhKes };'
  ].join('\n');
  const kljucevi = Object.keys(env).filter(k => k !== '_odgodjeni' && k !== '_taktovi');
  const mod = new Function(...kljucevi, tijelo)(...kljucevi.map(k => env[k]));

  // Odvrti JEDAN zakazani takt praznog hoda.
  mod.takt = () => { const f = env._taktovi.shift(); if (f) f(); };
  // Odvrti sve taktove do kraja reda (sa kapom, da test ne visi).
  mod.doKraja = () => { let n = 0; while (env._taktovi.length && n++ < 500) mod.takt(); };
  mod.log = log;
  mod.odgodjeni = env._odgodjeni;
  return mod;
}

const tacke = { 2026: [{ dt: '2026-06-01T10:00:00Z' }, { dt: '2026-06-02T10:00:00Z' }] };

console.log('Požari — lijeni račun arhive (v1.5.4)');

// ── Glavna invarijanta: čitanje NIKAD ne računa ─────────────────────────────

t('samoKes:true NE pokreće račun, nego ga zakazuje', () => {
  const s = makeSandbox({ tacke });
  const r = s._povArhRacunaj(2026, true);
  eq(r, undefined, 'mora vratiti undefined (nije spremno):');
  eq(s.log.racunato.length, 0, 'račun se NIJE smio pokrenuti odmah:');
  eq(s._povArhPreostalo(), 1, 'posao mora biti u redu:');
});

t('poslije takta praznog hoda rezultat postoji', () => {
  const s = makeSandbox({ tacke });
  s._povArhRacunaj(2026, true);
  s.doKraja();
  eq(s.log.racunato.length, 1, 'račun se morao desiti u taktu:');
  eq(s._povArhRacunaj(2026, true)?.ha, 2, 'drugi poziv mora vratiti iz keša:');
  eq(s._povArhPreostalo(), 0, 'red mora biti prazan:');
});

t('bez samoKes račun je i dalje sinhron (stari put netaknut)', () => {
  const s = makeSandbox({ tacke });
  eq(s._povArhRacunaj(2026)?.ha, 2);
  eq(s.log.racunato.length, 1, 'morao je računati odmah:');
  eq(s._povArhPreostalo(), 0, 'ništa se nije smjelo zakazati:');
});

t('isti posao se NE zakazuje dvaput', () => {
  const s = makeSandbox({ tacke });
  s._povArhRacunaj(2026, true);
  s._povArhRacunaj(2026, true);
  s._povArhRacunaj(2026, true);
  eq(s._povArhPreostalo(), 1, 'tri poziva, jedan posao:');
});

t('već izračunata godina se ne zakazuje ponovo', () => {
  const s = makeSandbox({ tacke });
  s._povArhRacunaj(2026);          // sinhrono izračunaj
  s._povArhRacunaj(2026, true);    // pa traži lijeno
  eq(s._povArhPreostalo(), 0, 'ne smije zakazati posao za već izračunato:');
});

t('JEDAN takt radi JEDNU jedinicu, ne cijeli red', () => {
  const s = makeSandbox({ tacke: { 2026: tacke[2026], 2025: tacke[2026], 2024: tacke[2026] } });
  s._povArhRacunaj(2026, true);
  s._povArhRacunaj(2025, true);
  s._povArhRacunaj(2024, true);
  eq(s._povArhPreostalo(), 3, 'sva tri u redu:');
  s.takt();
  eq(s.log.racunato.length, 1, 'jedan takt = jedna jedinica (inače telefon stoji):');
  s.doKraja();
  eq(s.log.racunato.length, 3, 'na kraju sve izračunato:');
});

t('posao koji BACI ne zaustavlja ostatak reda', () => {
  const s = makeSandbox({ tacke: { 2026: tacke[2026], 2025: tacke[2026] } });
  // 2026 baca, 2025 mora svejedno proći
  const orig = s._povArhRacunaj;
  s.kes['2026@0.0,0.0'] = undefined;
  s._povArhRacunaj(2026, true);
  s._povArhRacunaj(2025, true);
  s.red[0].posao = () => { throw new Error('pukni'); };
  s.doKraja();
  eq(s.kes['2026@0.0,0.0'], null, 'pali posao mora upisati null (ne pokušavaj ponovo):');
  eq(s.kes['2025@0.0,0.0']?.ha, 2, 'sljedeći posao se morao izvršiti:');
});

t('mjesec i skorašnje imaju ISTU lijenu semantiku', () => {
  const s = makeSandbox({ tacke: { 2026: [{ dt: '2026-06-01T10:00:00Z' }] } });
  eq(s._povArhRacunajMjesec(2026, 5, true), undefined, 'mjesec:');
  eq(s._povArhRacunajSkore(2026, true), undefined, 'skorašnje:');
  eq(s._povArhPreostalo(), 2, 'oba zakazana:');
  s.doKraja();
  eq(s._povArhRacunajMjesec(2026, 5, true)?.ha, 1, 'mjesec poslije takta:');
});

t('mjesec filtrira po mjesecu (ne uzima cijelu godinu)', () => {
  const s = makeSandbox({ tacke: { 2026: [
    { dt: '2026-06-01T10:00:00Z' }, { dt: '2026-06-02T10:00:00Z' }, { dt: '2026-07-01T10:00:00Z' }] } });
  s._povArhRacunajMjesec(2026, 5, true);   // jun = UTC mjesec 5
  s.doKraja();
  eq(s._povArhRacunajMjesec(2026, 5, true)?.ha, 2, 'samo junske tačke:');
});

t('crtanje se traži poslije obrade, ali skupljeno (ne po jedinici)', () => {
  const s = makeSandbox({ ukljucene: ['2026'], tacke: { 2026: tacke[2026], 2025: tacke[2026] } });
  s._povArhRacunaj(2026, true);
  s._povArhRacunaj(2025, true);
  s.doKraja();
  // _povArhTraziCrtanje koristi setTimeout throttle; u sandboxu se odgođeni
  // pozivi skupljaju, a brana _povArhCrtajTajmer smije pustiti samo jedan.
  eq(s.odgodjeni.length, 1, 'dva posla ne smiju zakazati dva crtanja:');
});

// ── Invarijante nad kodom ───────────────────────────────────────────────────

t('crtanje karte NIKAD ne računa sinhrono', () => {
  const r = extractFn('_povArhRender');
  const pozivi = r.match(/_povArhRacunaj(?:Mjesec|Skore)?\([^)]*\)/g) || [];
  if (!pozivi.length) throw new Error('nema poziva računa — selektor je zastario');
  pozivi.forEach(p => {
    if (!/,\s*true\s*\)$/.test(p))
      throw new Error('poziv bez samoKes u _povArhRender — zamrznuće telefon: ' + p);
  });
});

t('kartica panela NIKAD ne računa sinhrono', () => {
  const k = extractFn('_povArhKarticaHtml');
  const pozivi = k.match(/_povArhRacunaj(?:Mjesec|Skore)?\([^)]*\)/g) || [];
  if (!pozivi.length) throw new Error('nema poziva računa u kartici — selektor je zastario');
  pozivi.forEach(p => {
    if (!/,\s*true\s*\)$/.test(p))
      throw new Error('poziv bez samoKes u kartici (zove se na svaki meteo/GPS/toast događaj): ' + p);
  });
});

t('čišćenje keša prazni i red čekanja', () => {
  const o = extractFn('_povArhKesOcisti');
  if (!/_povArhRed/.test(o))
    throw new Error('_povArhKesOcisti ne dira red — zakazan posao bi vratio zastarjelu geometriju u svjež keš');
  if (!/_povArhGrupeKes/.test(o))
    throw new Error('_povArhKesOcisti ne čisti keš grupisanja');
});

t('prazan hod se koristi kad postoji, sa vremenskom rezervom', () => {
  const f = extractFn('_povArhSljedeciTakt');
  if (!/requestIdleCallback/.test(f)) throw new Error('ne koristi requestIdleCallback');
  if (!/setTimeout/.test(f)) throw new Error('nema rezerve za WebView bez requestIdleCallback');
});

// ── Opt-in prikazi (revert v1.5.4 → v1.5.6) ─────────────────────────────────

t('tačke požara su podrazumijevano ISKLJUČENE (opt-in)', () => {
  if (!/_poziOn\s*=\s*localStorage\.getItem\(_POZ_ON_KEY\)\s*===\s*'1'/.test(SRC))
    throw new Error('tačke se ne vraćaju na opt-in ponašanje');
});

t('opožarena površina je podrazumijevano ISKLJUČENA (opt-in)', () => {
  const f = extractFn('_poziOpozOn');
  if (!/===\s*'1'/.test(f))
    throw new Error('_poziOpozOn i dalje podrazumijeva uključeno (treba === \'1\')');
});

t('oba se i dalje mogu ručno ISKLJUČITI (nije zaključano)', () => {
  const f = extractFn('_poziOpozToggle');
  if (!/setItem\(_POZ_OPOZ_KEY/.test(f)) throw new Error('prekidač više ne pamti izbor');
  if (!/\?\s*'1'\s*:\s*'0'/.test(f)) throw new Error('isključivanje ne upisuje \'0\' — pa bi se opet uključilo');
});

console.log('\n' + ok + ' prošlo, ' + fail + ' palo');
process.exit(fail ? 1 : 0);
