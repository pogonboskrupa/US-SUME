// =====================================================================
// Testovi za SEKCIJU VLAKE — dužina mreže i nagib (index.html).
// Pokretanje:  node tests/js/vlake-nagib.test.js
// ---------------------------------------------------------------------
// Dvije stvari koje ovi testovi čuvaju:
//
// 1) _ukupnoVlakeM — ukupna dužina mreže vlaka mora biti ZBIR dužina
//    pojedinačnih vlaka. Ranije se računalo calcL(vlake.flatMap(v => v.pts)):
//    sve tačke svih vlaka spojene u jedan niz i mjerene kao JEDNA linija, pa
//    je između zadnje tačke jedne i prve tačke sljedeće vlake ulazio lažan
//    segment — skok preko pola odjela, (n-1) puta. Na realnom rasporedu je to
//    udvostručilo i dužinu i gustoću mreže (m/ha), a gustoća je stvarni
//    šumarski pokazatelj po kojem se ocjenjuje da li je mreža dovoljna.
//    Test namjerno RASPOREDI vlake razmaknuto, jer bug ne bi bio vidljiv da
//    su nacrtane jedna do druge.
//
// 2) _vlNagibStat / _vlNagib — nagib kao BROJ u listi. Ključne invarijante:
//    max se prijavljuje i kad NIŠTA ne prelazi limit (0% znači ravno, ne
//    "nema podataka"), nedostatak visina daje null a ne nulu, i memoizacija
//    se poništava kad se vlaka promijeni ili kad korisnik promijeni limit.
//
// Testira se STVARNI izvorni kod izvučen iz index.html, ne reimplementacija.
// =====================================================================
'use strict';
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const HTML = fs.readFileSync(path.join(__dirname, '../../index.html'), 'utf8');

function extractFn(name) {
  const start = HTML.indexOf('function ' + name + '(');
  assert.ok(start >= 0, 'nije nađena funkcija ' + name + ' u index.html');
  let i = HTML.indexOf('{', start), depth = 0;
  for (; i < HTML.length; i++) {
    if (HTML[i] === '{') depth++;
    else if (HTML[i] === '}') { depth--; if (depth === 0) return HTML.slice(start, i + 1); }
  }
  throw new Error('nezatvorena funkcija ' + name);
}
function extractConst(name) {
  const re = new RegExp('const ' + name + '\\s*=\\s*[\\s\\S]*?;');
  const m = re.exec(HTML);
  assert.ok(m, 'nije nađena const ' + name + ' u index.html');
  return m[0];
}

// ── Sandbox ──────────────────────────────────────────────────────────
const store = {};
const localStorage = {
  getItem: k => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: k => { delete store[k]; }
};
const SRC = [
  extractFn('dst'),
  extractFn('calcL'),
  extractFn('_ukupnoVlakeM'),
  extractFn('_segGrade'),
  extractFn('_smoothedGrades'),
  extractFn('_vlNagibStat'),
  extractConst('_VL_NAGIB_LIMITI'),
  extractFn('_vlNagibLimit'),
  extractFn('_vlNagib'),
  extractFn('_vlBrojVlaka'),
  extractConst('_GRADE_STOPS'),
  extractFn('_hexToRgb'),
  extractFn('_rgbToHex'),
  extractFn('_gradeColor'),
  extractFn('_vlNagibHtml')
].join('\n');

const F = new Function('localStorage', 'fmtL', SRC + `
  return { calcL, _ukupnoVlakeM, _vlNagibStat, _vlNagibLimit, _vlNagib,
           _vlBrojVlaka, _vlNagibHtml, _smoothedGrades };
`)(localStorage, m => Math.round(m) + ' m');

// ── Pomoćno: pravljenje vlaka poznate geometrije ─────────────────────
// Jedan korak na sjever od ~1 m: 1° lat ≈ 111320 m.
const M = 1 / 111320;

// Ravna vlaka: n segmenata po `korakM` metara, konstantan nagib `nagibPct`.
function vlakaNagiba(nagibPct, korakM, n, la0 = 44.9, lo0 = 16.1, al0 = 800) {
  const pts = [];
  let la = la0, al = al0;
  for (let i = 0; i <= n; i++) {
    pts.push({ la, lo: lo0, al });
    la += korakM * M;
    al += korakM * (nagibPct / 100);
  }
  return { pts };
}

// Vlaka koja je uglavnom blaga, ali ima jednu strmu dionicu u sredini.
function vlakaSaStrminom(blagi, strmi, korakM, nBlagih, nStrmih) {
  const pts = [];
  let la = 44.9, al = 800;
  const dodaj = (nagib, k) => {
    for (let i = 0; i < k; i++) {
      pts.push({ la, lo: 16.1, al });
      la += korakM * M;
      al += korakM * (nagib / 100);
    }
  };
  dodaj(blagi, nBlagih);
  dodaj(strmi, nStrmih);
  dodaj(blagi, nBlagih);
  pts.push({ la, lo: 16.1, al });
  return { pts };
}

// ── Runner ───────────────────────────────────────────────────────────
let pass = 0, fail = 0;
function grupa(n) { console.log('\n' + n); }
function t(naziv, fn) {
  try { fn(); console.log('  ✔ ' + naziv); pass++; }
  catch (e) { console.log('  ✘ ' + naziv + '\n      ' + e.message); fail++; }
}

// =====================================================================
grupa('_ukupnoVlakeM — dužina MREŽE je zbir vlaka, ne jedna spojena linija:');

t('razmaknute vlake: stara flatMap formula je LAŽNO duplirala dužinu', () => {
  // 24 vlake po ~440 m, raspoređene po odjelu — kako stvarno izgleda na terenu.
  const vlake = [];
  for (let k = 0; k < 24; k++) {
    const r = Math.floor(k / 5), c = k % 5;
    vlake.push(vlakaNagiba(0, 3, 146, 44.9 + r * 0.00113, 16.1 + c * 0.00159));
  }
  const tacno = F._ukupnoVlakeM(vlake);
  const staro = F.calcL(vlake.flatMap(v => v.pts));   // ponašanje prije popravke
  assert.ok(tacno > 10000 && tacno < 11000, 'očekivano ~10.6 km, dobijeno ' + Math.round(tacno));
  assert.ok(staro > tacno * 1.9,
    'stara formula mora biti bitno veća (bila je ~2×); tacno=' + Math.round(tacno) + ' staro=' + Math.round(staro));
  // Svaka vlaka zasebno mora dati isto kao zbir — nema "skoka" između njih.
  const zbirRucno = vlake.reduce((s, v) => s + F.calcL(v.pts), 0);
  assert.ok(Math.abs(tacno - zbirRucno) < 0.001, 'ne slaže se sa ručnim zbirom');
});

t('jedna vlaka: zbir mreže == dužina te vlake (nema šta da se doda)', () => {
  const v = vlakaNagiba(0, 5, 20);
  assert.ok(Math.abs(F._ukupnoVlakeM([v]) - F.calcL(v.pts)) < 0.001);
});

t('prazna lista i vlaka bez tačaka ne ruše račun', () => {
  assert.strictEqual(F._ukupnoVlakeM([]), 0);
  assert.strictEqual(F._ukupnoVlakeM(null), 0);
  assert.strictEqual(F._ukupnoVlakeM([{ pts: [] }, {}, null]), 0);
});

// =====================================================================
grupa('_vlNagibStat — nagib kao broj:');

t('nema visina (nacrtana vlaka) → null, NE nula', () => {
  const pts = [{ la: 44.9, lo: 16.1, al: 0 }, { la: 44.901, lo: 16.1, al: 0 }];
  assert.strictEqual(F._vlNagibStat(pts, 20), null);
});

t('premalo tačaka → null', () => {
  assert.strictEqual(F._vlNagibStat([{ la: 44.9, lo: 16.1, al: 800 }], 20), null);
  assert.strictEqual(F._vlNagibStat(null, 20), null);
});

t('ravna vlaka: max 0%, ništa preko limita', () => {
  const st = F._vlNagibStat(vlakaNagiba(0, 5, 40).pts, 20);
  assert.strictEqual(st.max, 0);
  assert.strictEqual(st.prekoM, 0);
  assert.ok(st.ukupnoM > 190 && st.ukupnoM < 210, 'ukupnoM=' + st.ukupnoM);
});

t('konstantan nagib 10%: max i prosjek su ~10, ništa preko 20%', () => {
  const st = F._vlNagibStat(vlakaNagiba(10, 5, 40).pts, 20);
  assert.ok(Math.abs(st.max - 10) <= 1, 'max=' + st.max);
  assert.ok(Math.abs(st.avg - 10) <= 1, 'avg=' + st.avg);
  assert.strictEqual(st.prekoM, 0);
});

t('MAX se prijavljuje i kad NIŠTA ne prelazi limit (0% znači ravno!)', () => {
  // Ovo je klasa greške koju je imala admin "Analiza nagiba": maxGrade se
  // ažurirao samo unutar if (grade >= 20), pa je vlaka sa najstrmijih 19%
  // prijavljivala "Max nagib 0%" — isto kao savršeno ravna.
  const st = F._vlNagibStat(vlakaNagiba(15, 5, 40).pts, 20);
  assert.strictEqual(st.prekoM, 0, 'ništa ne smije preći 20%');
  assert.ok(st.max >= 14, 'max mora ostati ~15, a ne pasti na 0; dobijeno ' + st.max);
});

t('strma dionica: prekoM ≈ njena dužina, max ≈ njen nagib', () => {
  // 20 blagih (5%) + 20 strmih (30%) + 20 blagih, korak 5 m → strmo ≈ 100 m
  const st = F._vlNagibStat(vlakaSaStrminom(5, 30, 5, 20, 20).pts, 20);
  assert.ok(Math.abs(st.max - 30) <= 2, 'max=' + st.max);
  // Izglađivanje (_smoothedGrades) razmaže prelaz preko po jednog segmenta sa
  // svake strane, pa se dopušta odstupanje od nekoliko segmenata.
  assert.ok(st.prekoM >= 80 && st.prekoM <= 120, 'prekoM=' + st.prekoM + ' (očekivano ~100 m)');
  assert.ok(st.prekoM < st.ukupnoM, 'preko ne smije biti veće od ukupno');
});

t('limit se poštuje: isti teren, viši limit → manje "preko"', () => {
  const pts = vlakaSaStrminom(5, 30, 5, 20, 20).pts;
  const na20 = F._vlNagibStat(pts, 20).prekoM;
  const na25 = F._vlNagibStat(pts, 25).prekoM;
  const na12 = F._vlNagibStat(pts, 12).prekoM;
  assert.ok(na12 >= na20 && na20 >= na25, `12%:${na12} 20%:${na20} 25%:${na25} — mora opadati`);
});

t('udio (pct) je odnos preko/ukupno, ne slučajan broj', () => {
  const st = F._vlNagibStat(vlakaSaStrminom(5, 30, 5, 20, 20).pts, 20);
  assert.ok(Math.abs(st.pct - (st.prekoM / st.ukupnoM * 100)) < 1.5, 'pct=' + st.pct);
});

t('vlaka od samih prekratkih segmenata (<1 m) → null, ne izmišljen nagib', () => {
  // _segGrade vraća -1 za segment kraći od 1 m; ako su SVI takvi, nema se šta
  // izmjeriti i funkcija ne smije vratiti lažnu nulu.
  const pts = [];
  let la = 44.9;
  for (let i = 0; i < 10; i++) { pts.push({ la, lo: 16.1, al: 800 + i }); la += 0.3 * M; }
  assert.strictEqual(F._vlNagibStat(pts, 20), null);
});

// =====================================================================
grupa('_vlNagib — memoizacija (obavezna: rndList se tokom snimanja zove svake 2 s):');

t('drugi poziv sa istom vlakom/dužinom vraća ISTI objekat (keš pogodak)', () => {
  delete store['tvlake_vl_nagib_limit'];
  const v = vlakaNagiba(10, 5, 40);
  const d = F.calcL(v.pts);
  const a = F._vlNagib(v, d);
  const b = F._vlNagib(v, d);
  assert.strictEqual(a, b, 'keš nije pogodio — račun bi se ponavljao pri svakom crtanju liste');
});

t('vlaka koja je narasla (nova tačka) poništava keš', () => {
  const v = vlakaNagiba(10, 5, 40);
  const a = F._vlNagib(v, F.calcL(v.pts));
  v.pts.push({ la: v.pts[v.pts.length - 1].la + 5 * M, lo: 16.1, al: 900 });
  const b = F._vlNagib(v, F.calcL(v.pts));
  assert.notStrictEqual(a, b, 'poslije nove tačke mora se preračunati');
});

t('promjena limita poništava keš (inače bi bedž ostao na starom pragu)', () => {
  delete store['tvlake_vl_nagib_limit'];
  const v = vlakaSaStrminom(5, 30, 5, 20, 20);
  const d = F.calcL(v.pts);
  const na20 = F._vlNagib(v, d);
  localStorage.setItem('tvlake_vl_nagib_limit', '25');
  const na25 = F._vlNagib(v, d);
  assert.notStrictEqual(na20, na25, 'stat se mora preračunati za novi limit');
  assert.strictEqual(na25.limit, 25);
  assert.ok(na25.prekoM <= na20.prekoM);
  delete store['tvlake_vl_nagib_limit'];
});

t('nacrtana vlaka bez GPS visina koristi već preuzet profil (_apiProfile)', () => {
  const v = { pts: [], _apiProfile: null };
  let la = 44.9;
  const apPts = [], apAlts = [];
  for (let i = 0; i <= 40; i++) {
    v.pts.push({ la, lo: 16.1, al: 0 });          // nacrtano — bez visina
    apPts.push({ la, lo: 16.1 }); apAlts.push(800 + i * 5 * 0.25);  // profil: 25%
    la += 5 * M;
  }
  assert.strictEqual(F._vlNagib(v, F.calcL(v.pts)), null, 'bez profila nema šta pokazati');
  v._apiProfile = { pts: apPts, alts: apAlts };
  v._ngC = null;                                   // kao da je lista ponovo crtana
  const st = F._vlNagib(v, F.calcL(v.pts));
  assert.ok(st && Math.abs(st.max - 25) <= 2, 'profil nije iskorišten; st=' + JSON.stringify(st));
});

t('neispravan _apiProfile (pts i alts različite dužine) se ignoriše, ne ruši', () => {
  const v = vlakaNagiba(0, 5, 10);
  v.pts.forEach(p => { p.al = 0; });
  v._apiProfile = { pts: [{ la: 44.9, lo: 16.1 }], alts: [800, 810] };
  assert.strictEqual(F._vlNagib(v, F.calcL(v.pts)), null);
});

t('vlaka sa manje od 2 tačke → null, bez bacanja', () => {
  assert.strictEqual(F._vlNagib({ pts: [{ la: 44.9, lo: 16.1, al: 800 }] }, 0), null);
  assert.strictEqual(F._vlNagib(null, 0), null);
});

// =====================================================================
grupa('_vlNagibLimit — izbor korisnika, sa razumnim zadanim:');

t('prazan localStorage → 20% (isti prag kao admin Analiza nagiba)', () => {
  delete store['tvlake_vl_nagib_limit'];
  assert.strictEqual(F._vlNagibLimit(), 20);
});

t('vrijednost van ponuđene liste se odbija (ne vjeruje se slijepo kešu)', () => {
  localStorage.setItem('tvlake_vl_nagib_limit', '999');
  assert.strictEqual(F._vlNagibLimit(), 20);
  localStorage.setItem('tvlake_vl_nagib_limit', 'abc');
  assert.strictEqual(F._vlNagibLimit(), 20);
  localStorage.setItem('tvlake_vl_nagib_limit', '25');
  assert.strictEqual(F._vlNagibLimit(), 25);
  delete store['tvlake_vl_nagib_limit'];
});

// =====================================================================
grupa('_vlNagibHtml — bedž u redu liste:');

t('bez visina nema bedža (prazan string, ne "0%")', () => {
  const v = { pts: [{ la: 44.9, lo: 16.1, al: 0 }, { la: 44.901, lo: 16.1, al: 0 }] };
  assert.strictEqual(F._vlNagibHtml(v, F.calcL(v.pts)), '');
});

t('blaga vlaka: pokazuje max, BEZ upozorenja o prelasku', () => {
  delete store['tvlake_vl_nagib_limit'];
  const v = vlakaNagiba(8, 5, 40);
  const html = F._vlNagibHtml(v, F.calcL(v.pts));
  assert.ok(/⛰\s*\d+%/.test(html), 'nema max nagiba: ' + html);
  assert.ok(!/preko/.test(html), 'ne smije upozoravati kad ništa ne prelazi limit: ' + html);
});

t('strma vlaka: uz max ide i KOLIKO METARA je preko limita', () => {
  const v = vlakaSaStrminom(5, 30, 5, 20, 20);
  const html = F._vlNagibHtml(v, F.calcL(v.pts));
  assert.ok(/preko 20%/.test(html), 'nedostaje oznaka prelaska: ' + html);
  assert.ok(/\d+\s*m preko/.test(html), 'metri moraju biti navedeni: ' + html);
});

t('boja bedža dolazi iz iste skale kao bojenje na karti (_gradeColor)', () => {
  const blaga = F._vlNagibHtml(vlakaNagiba(3, 5, 40), 200);
  const strma = F._vlNagibHtml(vlakaNagiba(35, 5, 40), 200);
  const boja = h => (h.match(/color:(#[0-9a-f]{6})/i) || [])[1];
  assert.ok(boja(blaga) && boja(strma), 'boja nije upisana inline');
  assert.notStrictEqual(boja(blaga), boja(strma), 'blaga i strma vlaka moraju imati različitu boju');
});

// =====================================================================
grupa('_vlBrojVlaka — sklonidba:');

t('1 vlaka / 2-4 vlake / 5+ vlaka', () => {
  assert.strictEqual(F._vlBrojVlaka(1), 'vlaka');
  assert.strictEqual(F._vlBrojVlaka(2), 'vlake');
  assert.strictEqual(F._vlBrojVlaka(4), 'vlake');
  assert.strictEqual(F._vlBrojVlaka(5), 'vlaka');
  assert.strictEqual(F._vlBrojVlaka(11), 'vlaka');   // 11 ide kao 5+, ne kao 1
  assert.strictEqual(F._vlBrojVlaka(12), 'vlaka');
  assert.strictEqual(F._vlBrojVlaka(21), 'vlaka');
  assert.strictEqual(F._vlBrojVlaka(22), 'vlake');
});

// =====================================================================
grupa('rndList — filter "samo preko limita" (STVARNI rndList iz index.html):');

// rndList se pušta nad lažnim DOM-om. Bitno je samo šta na kraju završi u
// listi i sa KOJIM indeksom — indeks je veza red ↔ vlake[], i filtriranje ga
// ne smije pomjeriti (ista klasa greške kao selI po poziciji u DOM-u i kao
// trake udaljenosti u Požarima).
function pokreniRndList({ samoStrme }) {
  const nacrtano = [];   // {i, nm, depth}
  const els = {};
  const mkEl = () => ({
    style: {}, innerHTML: '', textContent: '',
    appendChild() {}, scrollIntoView() {}
  });
  ['vl', 'nv', 'vc', 'vlake-proj-hdr', 'vl-nagib-traka'].forEach(id => { els[id] = mkEl(); });

  // Tri vlake: T1 blaga, T2 strma, T1.1 krak koji je strm iako mu je
  // roditelj blag. Redoslijed u vlake[] NIJE redoslijed prikaza.
  const vlake = [
    Object.assign(vlakaNagiba(5, 5, 40),  { nm: 'T2',   kr: 0, projektId: 'P' }),   // i=0
    Object.assign(vlakaSaStrminom(5, 34, 5, 10, 30), { nm: 'T1.1', kr: 1, projektId: 'P' }), // i=1
    Object.assign(vlakaSaStrminom(5, 26, 5, 10, 20), { nm: 'T1',  kr: 0, projektId: 'P' })   // i=2
  ];

  const src = extractFn('rndList');
  const fn = new Function(
    'document', 'vlake', '_aktivniProjektId', '_projekti', '_stdSortKey', 'calcL',
    '_vlNagib', '_vlNagibLimit', '_projPovrsinaHa', 'fmtL', '_vlNagibTrakaRender',
    '_renderVlakaRow', 'updOvl', 'updProjStats', '_vlSamoStrme', 'clearTimeout',
    'setTimeout', 'localStorage',
    src + '\nrndList();'
  );
  fn(
    { getElementById: id => els[id] || null, createDocumentFragment: () => ({ appendChild() {} }) },
    vlake, 'P', [{ id: 'P', odjel: '12', gj: 'GJ' }],
    nm => parseInt(String(nm).replace(/\D/g, ''), 10) || 0,
    F.calcL, F._vlNagib, F._vlNagibLimit, () => ({ ha: 40, src: 'ručno' }),
    m => Math.round(m) + ' m',
    () => {},
    (el, v, i, depth) => nacrtano.push({ i, nm: v.nm, depth }),
    () => {}, () => {}, samoStrme, () => {}, () => 0, localStorage
  );
  return { nacrtano, vlake };
}

t('bez filtera: crtaju se sve vlake, sa TAČNIM indeksima iz vlake[]', () => {
  delete store['tvlake_vl_nagib_limit'];
  const { nacrtano, vlake } = pokreniRndList({ samoStrme: false });
  assert.strictEqual(nacrtano.length, 3, 'moraju se nacrtati sve tri');
  nacrtano.forEach(r => assert.strictEqual(vlake[r.i].nm, r.nm,
    `indeks ${r.i} ne pokazuje na ${r.nm} nego na ${vlake[r.i] && vlake[r.i].nm}`));
});

t('sa filterom: ostaju SAMO vlake preko limita, indeksi i dalje tačni', () => {
  delete store['tvlake_vl_nagib_limit'];
  const { nacrtano, vlake } = pokreniRndList({ samoStrme: true });
  assert.ok(nacrtano.length > 0 && nacrtano.length < 3,
    'filter mora nešto izbaciti i nešto ostaviti; nacrtano=' + nacrtano.length);
  assert.ok(!nacrtano.some(r => r.nm === 'T2'), 'blaga vlaka T2 ne smije proći filter');
  // KLJUČNO: indeks nosi mjesto u vlake[], ne poziciju u filtriranoj listi.
  nacrtano.forEach(r => assert.strictEqual(vlake[r.i].nm, r.nm,
    `filtriranje je pomjerilo indeks: red "${r.nm}" nosi i=${r.i} (tamo je "${vlake[r.i] && vlake[r.i].nm}")`));
});

t('filtrirani krak zadržava dubinu kraka i kad mu roditelj nije nacrtan', () => {
  delete store['tvlake_vl_nagib_limit'];
  const { nacrtano } = pokreniRndList({ samoStrme: true });
  const krak = nacrtano.find(r => r.nm === 'T1.1');
  assert.ok(krak, 'strm krak mora biti u filtriranoj listi');
  assert.strictEqual(krak.depth, 1, 'krak mora ostati krak (L/D oznaka, "završava na putu")');
});

t('filtrirano je poredano najstrmije prvo', () => {
  delete store['tvlake_vl_nagib_limit'];
  const { nacrtano, vlake } = pokreniRndList({ samoStrme: true });
  const maxovi = nacrtano.map(r => F._vlNagib(vlake[r.i], F.calcL(vlake[r.i].pts)).max);
  for (let i = 1; i < maxovi.length; i++)
    assert.ok(maxovi[i - 1] >= maxovi[i], 'poredak nije opadajući: ' + maxovi.join(','));
});

// =====================================================================
console.log('\n' + pass + ' prošlo, ' + fail + ' palo');
process.exit(fail ? 1 : 0);
