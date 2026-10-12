// =====================================================================
// Tok snimanja vlake — traka i donji listovi (v1.9.0).
// Pokretanje:  node tests/js/vlaka-snimanje-ui.test.js
// ---------------------------------------------------------------------
// 1) Drugi red trake snimanja stajao je ISPOD #action-bar-a — precizna tačka,
//    slobodan pogled i nastavak kraka nisu se mogli dotaći.
// 2) Izbor kraka nije govorio koji broj krak dobija; lager je izlazio van okvira;
//    "Šta dalje" nije imao sažetak i nije slagao krakove ispod vlake.
// 3) Nema vremena snimanja; pauza se vidjela samo po boji okvira.
//
// Testira se STVARNI kod izvučen iz index.html.
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
  let i = HTML.indexOf('(', start), par = 0;
  for (; i < HTML.length; i++) {
    if (HTML[i] === '(') par++;
    else if (HTML[i] === ')') { par--; if (par === 0) { i++; break; } }
  }
  i = HTML.indexOf('{', i);
  let depth = 0;
  for (; i < HTML.length; i++) {
    if (HTML[i] === '{') depth++;
    else if (HTML[i] === '}') { depth--; if (depth === 0) return HTML.slice(start, i + 1); }
  }
  throw new Error('nezatvorena funkcija ' + name);
}
function fnovi(imena, prolog, params, args) {
  return new Function(...(params || []), (prolog || '') + '\n' + imena.map(extractFn).join('\n') +
    '\nreturn {' + imena.join(',') + '};')(...(args || []));
}
function el(o) {
  const cls = new Set();
  return Object.assign({ style: {}, textContent: '', innerHTML: '',
    classList: { toggle: (c, v) => (v ? cls.add(c) : cls.delete(c)), contains: c => cls.has(c), add: c => cls.add(c), remove: c => cls.delete(c) } }, o);
}

let pass = 0, fail = 0;
function t(name, fn) {
  try { fn(); console.log('  ✔ ' + name); pass++; }
  catch (e) { fail++; console.log('  ✘ ' + name + '\n      ' + e.message); }
}

// ── Vrijeme snimanja ──────────────────────────────────────────────────────
console.log('Vrijeme snimanja:');
const vr = fnovi(['_fmtTrajanje']);
t('format m:ss i h:mm:ss', () => {
  assert.strictEqual(vr._fmtTrajanje(0), '0:00');
  assert.strictEqual(vr._fmtTrajanje(65000), '1:05');
  assert.strictEqual(vr._fmtTrajanje(3723000), '1:02:03');
  assert.strictEqual(vr._fmtTrajanje(-5), '0:00');
  assert.strictEqual(vr._fmtTrajanje(undefined), '0:00');
});
t('pauza se NE broji u vrijeme snimanja', () => {
  const mk = (paused, seg) => fnovi(['_recTrajanjeMs'],
    `let _recSesijaMs = 60000, recOn = true, recPaused = ${paused}, _recSegStart = ${seg};`)._recTrajanjeMs();
  assert.strictEqual(mk(true, 0), 60000);
  const tekuce = mk(false, Date.now() - 5000);
  assert.ok(tekuce >= 65000 && tekuce < 66000);
});
t('sesija se sabira na SVIM mjestima gdje i _dayActiveMs (pauza, povratak, stop)', () => {
  for (const f of ['toggleRecPause', 'vratiSeNaRoditelja', 'stopRec']) {
    assert.ok(/_recSesijaMs \+= Date\.now\(\) - _recSegStart/.test(extractFn(f)), f);
  }
});
t('stopRec pamti sažetak PRIJE nego resetuje stanje, i gasi tajmer', () => {
  const s = extractFn('stopRec');
  assert.ok(s.indexOf('_recZadnja = { idx: actI, ms: _recSesijaMs }') < s.indexOf('recOn = false'));
  assert.ok(s.includes('clearInterval(_recTimeTimer)'));
});

// ── Redoslijed vlaka ──────────────────────────────────────────────────────
console.log('Redoslijed vlaka (stablo):');
const rd = fnovi(['_vlNmDijelovi', '_vlCmpNm', '_vlRedoslijed']);
t('T2 < T10 (brojčano), krak odmah ispod svoje vlake', () => {
  const lista = ['T10', 'T2', 'T1.2', 'T1', 'T1.1', 'T1.1.1'].map(nm => ({ nm, projektId: 'p' }));
  const red = rd._vlRedoslijed(lista, 'p');
  assert.deepStrictEqual(red.map(o => lista[o.i].nm), ['T1', 'T1.1', 'T1.1.1', 'T1.2', 'T2', 'T10']);
  assert.deepStrictEqual(red.map(o => o.depth), [0, 1, 2, 1, 0, 0]);
});
t('nosi STVARNI indeks u vlake[] (ne poziciju u listi)', () => {
  const lista = [{ nm: 'T3' }, { nm: 'T1' }];
  assert.deepStrictEqual(rd._vlRedoslijed(lista, null).map(o => o.i), [1, 0]);
});
t('drugi projekat se ne miješa; vlaka bez projekta ostaje', () => {
  const lista = [{ nm: 'T1', projektId: 'A' }, { nm: 'T1', projektId: 'B' }, { nm: 'T2', projektId: null }];
  assert.deepStrictEqual(rd._vlRedoslijed(lista, 'A').map(o => o.i), [0, 2]);
});
t('ime bez broja ne ruši poređenje (ide na kraj)', () => {
  const lista = [{ nm: 'Stara' }, { nm: 'T1' }];
  assert.deepStrictEqual(rd._vlRedoslijed(lista, null).map(o => lista[o.i].nm), ['T1', 'Stara']);
});

// ── Izbor vlake: dugme kaže šta će se desiti ─────────────────────────────
console.log('Izbor vlake:');
t('"Idi" pokazuje novu (+) ili postojeću (▶) vlaku', () => {
  const f = fnovi(['_parseVNum', '_vpickGoTekst'], '', ['vlake', '_aktivniProjektId'],
    [[{ nm: 'T14', projektId: 'p' }], 'p']);
  assert.strictEqual(f._vpickGoTekst('14'), '▶ T14');
  assert.strictEqual(f._vpickGoTekst('15'), '+ T15');
  assert.strictEqual(f._vpickGoTekst('14.3'), '+ T14.3');
  assert.strictEqual(f._vpickGoTekst(''), 'Idi');
});
t('lista izbora ide po stablu, krak dobija klasu', () => {
  const s = extractFn('_appendVlakaRows');
  assert.ok(s.includes('_vlRedoslijed(vlake, _aktivniProjektId)'));
  assert.ok(s.includes("(depth ? ' krak' : '')"));
  assert.ok(s.includes('_escHtml(v.nm)'), 'ime vlake mora biti escape-ovano');
});

// ── Izbor kraka ───────────────────────────────────────────────────────────
console.log('Izbor kraka:');
function krakEnv(vl) {
  const els = {};
  ['krak-izbor', 'krak-izbor-bg', 'krak-izbor-title', 'krak-izbor-meta', 'krak-izbor-boja', 'ki-go-nm', 'ki-l-nm', 'ki-d-nm']
    .forEach(id => { els[id] = el(); });
  const f = fnovi(['_showKrakIzbor', '_krakIzborClose', '_rsList', '_nextKrakNm'],
    'let _krakIzborVlakaIdx = null;', ['vlake', 'document', 'fmtL', 'calcL', '_aktivniProjektId'],
    [vl, { getElementById: id => els[id] || null }, m => m + ' m', pts => pts.length * 10, 'p']);
  return { f, els };
}
t('KLJUČNO: prikazuje ime kraka koji će nastati (L neparni, D parni, preskače zauzete)', () => {
  const vl = [{ nm: 'T1', pts: [1, 2, 3], color: '#ff0000', projektId: 'p' }, { nm: 'T1.1', pts: [], projektId: 'p' }];
  const { f, els } = krakEnv(vl);
  f._showKrakIzbor(0);
  assert.strictEqual(els['ki-l-nm'].textContent, 'T1.3');
  assert.strictEqual(els['ki-d-nm'].textContent, 'T1.2');
  assert.strictEqual(els['ki-go-nm'].textContent, 'Nastavi T1');
  assert.strictEqual(els['krak-izbor-meta'].textContent, '30 m · 3 tač.');
  assert.strictEqual(els['krak-izbor-boja'].style.background, '#ff0000');
});
t('list i pozadina se otvaraju i zatvaraju ZAJEDNO', () => {
  const { f, els } = krakEnv([{ nm: 'T1', pts: [], projektId: 'p' }]);
  f._showKrakIzbor(0);
  assert.strictEqual(els['krak-izbor'].style.display, 'block');
  assert.strictEqual(els['krak-izbor-bg'].style.display, 'block');
  f._krakIzborClose();
  assert.strictEqual(els['krak-izbor'].style.display, 'none');
  assert.strictEqual(els['krak-izbor-bg'].style.display, 'none');
});
t('lager list koristi #lager-bg kao pozadinu', () => {
  const els = { 'lager-dlg': el(), 'lager-bg': el() };
  const f = fnovi(['_rsList'], '', ['document'], [{ getElementById: id => els[id] || null }]);
  f._rsList('lager-dlg', true);
  assert.strictEqual(els['lager-bg'].style.display, 'block');
});
t('lager se više ne otvara mimo pozadine (direktan style.display)', () => {
  assert.ok(!/getElementById\('lager-dlg'\)\.style\.display/.test(HTML));
});

// ── Traka snimanja iznad #action-bar-a ───────────────────────────────────
console.log('Traka snimanja:');
t('KLJUČNO: traka stoji iznad donje trake (--ab-h), ne ispod nje', () => {
  assert.ok(/#rec-banner \{ bottom:calc\(var\(--ab-h, 0px\) \+ 8px\)/.test(HTML));
});
t('_abVisinaSync upisuje visinu trake i body.ab-on', () => {
  const root = { style: { setProperty: (k, v) => { root[k] = v; } } };
  const body = el();
  const ab = { style: { display: 'flex' }, offsetHeight: 74 };
  const f = fnovi(['_abVisinaSync'], '', ['document'],
    [{ getElementById: () => ab, documentElement: root, body }]);
  f._abVisinaSync();
  assert.strictEqual(root['--ab-h'], '74px');
  assert.ok(body.classList.contains('ab-on'));
  ab.style.display = 'none';
  f._abVisinaSync();
  assert.strictEqual(root['--ab-h'], '0px');
  assert.ok(!body.classList.contains('ab-on'));
});
t('traka ne duplira dugmad; dvosmjer stoji između desnog kraka i pauze', () => {
  const i = HTML.indexOf('<div id="rec-row2">');
  const red = HTML.slice(i, HTML.indexOf('</div>', i));
  for (const id of ['btn-pause', 'btn-krak-l', 'btn-krak-d', 'btn-nazad']) {
    assert.ok(new RegExp('class="[^"]*rb-dup[^"]*" id="' + id + '"').test(red), id);
  }
  assert.ok(/class="rb stop rb-dup"/.test(red));
  for (const id of ['btn-preciz', 'btn-freeview']) assert.ok(!HTML.includes('id="'+id+'"'), id);
  const ab=HTML.slice(HTML.indexOf('<div id="action-bar">'),HTML.indexOf('<!-- Trag quick meta panel'));
  assert.ok(ab.indexOf('id="ab-krak-d"')<ab.indexOf('id="rec-direction-split"'));
  assert.ok(ab.indexOf('id="rec-direction-split"')<ab.indexOf('id="ab-pauza"'));
  assert.ok(/body\.ab-on #rec-row2 \{ display:none; \}/.test(HTML));
  assert.ok(/body\.ab-on #rec-row2 \.rb-dup \{ display:none !important; \}/.test(HTML));
});
t('pauza je vidljiva i tekstom (PAUZA + objašnjenje), ne samo bojom okvira', () => {
  assert.ok(/#rec-banner\.paused #rec-pause-row \{ display:flex; \}/.test(HTML));
  assert.ok(/#rec-banner\.paused \.rec-stanje \.st-pauza \{ display:inline; \}/.test(HTML));
});
t('stanja dugmeta precizne tačke / slobodnog pogleda zadržavaju natpis', () => {
  for (const f of ['_precizReset', '_precizTacka', '_precizFinish', '_precizCollect', '_setFreeView']) {
    assert.ok(extractFn(f).includes('rb-lbl'), f);
  }
});

// ── Toast iznad trake / lista ─────────────────────────────────────────────
console.log('Toast:');
t('toast ide IZNAD vidljive trake snimanja', () => {
  const g = global;
  const staro = { w: g.window, gcs: g.getComputedStyle };
  g.window = { innerHeight: 800 };
  g.getComputedStyle = e => ({ display: e._d || 'block' });
  const els = { 'rec-banner': { getBoundingClientRect: () => ({ top: 560, bottom: 720, height: 160 }) } };
  const f = fnovi(['_toastDno'], '', ['document'], [{ getElementById: id => els[id] || null }]);
  assert.strictEqual(f._toastDno(), 250);
  els['rec-banner']._d = 'none';
  assert.strictEqual(f._toastDno(), 70);
  g.window = staro.w; g.getComputedStyle = staro.gcs;
});

// ── "Snimanje završeno" ──────────────────────────────────────────────────
console.log('Snimanje završeno:');
t('sažetak + lista po stablu + istaknuta upravo snimljena (stvarni indeksi)', () => {
  const els = {};
  ['sdl-sub', 'sdl-sazetak', 'sdl-vlake-list', 'sto-dalje-sheet', 'sto-dalje-bg'].forEach(id => { els[id] = el({ querySelector: () => null }); });
  const vl = [
    { nm: 'T2', pts: [1], color: '#111', projektId: 'p' },
    { nm: 'T1', pts: [1, 2], color: '#222', projektId: 'p' },
    { nm: 'T1.1', pts: [1, 2, 3], color: '#333', projektId: 'p', lager: 'L<b>' },
  ];
  const f = fnovi(['_stodaljShow', '_vlNmDijelovi', '_vlCmpNm', '_vlRedoslijed', '_fmtTrajanje'],
    '', ['vlake', 'document', '_recZadnja', '_aktivniProjektId', '_projekti', '_elevHtml', 'fmtL', 'calcL', '_escHtml'],
    [vl, { getElementById: id => els[id] || null }, { idx: 2, ms: 125000 }, 'p', [{ id: 'p', gj: 'Gomila', odjel: '12' }],
      () => '', m => m + ' m', pts => pts.length * 100,
      x => String(x).replace(/</g, '&lt;').replace(/>/g, '&gt;')]);
  f._stodaljShow();
  const lista = els['sdl-vlake-list'].innerHTML;
  const redoslijed = [...lista.matchAll(/_stodaljVratiSe\((\d+)\)/g)].map(m => +m[1]);
  assert.deepStrictEqual(redoslijed, [1, 2, 0], 'T1, T1.1, T2 — sa STVARNIM indeksima');
  assert.ok(/class="sdl-red zadnja" onclick="_stodaljVratiSe\(2\)"/.test(lista));
  const saz = els['sdl-sazetak'].innerHTML;
  assert.ok(saz.includes('300 m') && saz.includes('2:05') && saz.includes('>3<'));
  assert.ok(saz.includes('L&lt;b&gt;'), 'lager mora biti escape-ovan');
  assert.strictEqual(els['sdl-sub'].textContent, 'Gomila · 12');
  assert.strictEqual(els['sto-dalje-sheet'].style.display, 'block');
  assert.strictEqual(els['sto-dalje-bg'].style.display, 'block');
});

console.log(`\n${pass} prošlo, ${fail} palo`);
process.exit(fail ? 1 : 0);

