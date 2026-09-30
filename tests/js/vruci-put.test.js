// =====================================================================
// Dio 3 — dijeljeni crash tajmer i bačen rad u GPS vrućem putu (v1.6.2).
// Pokretanje:  node tests/js/vruci-put.test.js
// ---------------------------------------------------------------------
// 1) _crashSaveTimer je JEDAN interval koji čuva I vlaku I trag. Oba stopa
//    (stopRec, fabSnimTrag) su ga gasila BEZUSLOVNO, pa je snimanje koje je
//    ostalo aktivno gubilo 30-sekundnu crash-zaštitu — tiho, do kraja dana.
// 2) updOvl() je svake 2 s prolazio calcL kroz SVE tačke SVIH vlaka i upisivao
//    HTML u #ovl-lines, element koji je u markupu TRAJNO display:none.
// 3) rndList() se u istom otkucaju crtao i kad tab Vlake nije otvoren.
//
// Testira se STVARNI kod izvučen iz index.html.
// =====================================================================
'use strict';
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const HTML = fs.readFileSync(path.join(__dirname, '../../index.html'), 'utf8');
const BEZ_KOM = HTML.split('\n').map(r => r.replace(/^\s*\/\/.*$/, '')).join('\n');

function extractFn(name, src) {
  const h = src || HTML;
  let start = h.indexOf('async function ' + name + '(');
  if (start < 0) start = h.indexOf('function ' + name + '(');
  if (start < 0) throw new Error('nije nađena funkcija ' + name);
  let i = h.indexOf('(', start), par = 0;
  for (; i < h.length; i++) {
    if (h[i] === '(') par++;
    else if (h[i] === ')') { par--; if (par === 0) { i++; break; } }
  }
  i = h.indexOf('{', i);
  let depth = 0;
  for (; i < h.length; i++) {
    if (h[i] === '{') depth++;
    else if (h[i] === '}') { depth--; if (depth === 0) return h.slice(start, i + 1); }
  }
  throw new Error('nezatvorena funkcija ' + name);
}

let pass = 0, fail = 0;
function t(name, fn) {
  try { fn(); console.log('  ✔ ' + name); pass++; }
  catch (e) { fail++; console.log('  ✘ ' + name + '\n      ' + e.message); }
}

console.log('Dijeljeni crash tajmer — ne smije stati dok drugo snima:');

function crashApi(recOn, tragOn) {
  const stanje = { stopljen: false };
  const src = extractFn('_crashStopIfIdle');
  const api = new Function('recOn', '_tragOn', '_crashStopTimer',
    src + '\nreturn { _crashStopIfIdle };')(recOn, tragOn, () => { stanje.stopljen = true; });
  api._crashStopIfIdle();
  return stanje.stopljen;
}

t('KLJUČNO: vlaka stala, trag i dalje snima → tajmer OSTAJE', () => {
  assert.strictEqual(crashApi(false, true), false,
    'gašenje tajmera ostavlja trag bez auto-save-a; poslije ubijenog procesa ' +
    '_crashCheck "oporavi" snimak od trenutka kad je vlaka stala');
});

t('trag stao, vlaka i dalje snima → tajmer OSTAJE', () => {
  assert.strictEqual(crashApi(true, false), false);
});

t('oba stala → tajmer se gasi (inače kuca do kraja sesije)', () => {
  assert.strictEqual(crashApi(false, false), true);
});

t('oba još snimaju → tajmer ostaje', () => {
  assert.strictEqual(crashApi(true, true), false);
});

t('stopRec gasi tajmer kroz _crashStopIfIdle, ne bezuslovno', () => {
  const src = extractFn('stopRec');
  assert.ok(/_crashStopIfIdle\(\)/.test(src), 'stopRec mora zvati _crashStopIfIdle');
  assert.ok(!/^\s*_crashStopTimer\(\);/m.test(src),
    'bezuslovan _crashStopTimer() u stopRec gasi i trag koji još snima');
});

t('trag stop gasi tajmer kroz _crashStopIfIdle, ne bezuslovno', () => {
  const src = extractFn('fabSnimTrag');
  assert.ok(/_crashStopIfIdle\(\)/.test(src), 'fabSnimTrag mora zvati _crashStopIfIdle');
  assert.ok(!/_crashStopTimer\(\)/.test(src),
    'bezuslovan _crashStopTimer() u fabSnimTrag gasi i vlaku koja još snima');
});

t('_crashStopIfIdle se zove TEK poslije spuštanja zastavice (čita živo stanje)', () => {
  const src = extractFn('stopRec');
  const iFlag = src.indexOf('recOn = false');
  const iStop = src.indexOf('_crashStopIfIdle()');
  assert.ok(iFlag > -1 && iStop > iFlag,
    'poziv prije `recOn = false` bi uvijek vidio recOn:true i nikad ne bi ugasio tajmer');
});

console.log('\nupdOvl — ne radi za element koji je trajno sakriven:');

t('KLJUČNO: #ovl-lines je u markupu display:none i ništa ga ne prikaže', () => {
  const red = HTML.split('\n').find(r => /id="ovl-lines"/.test(r));
  assert.ok(red && /display:\s*none/.test(red), 'markup reda: ' + red);
  const pojave = (BEZ_KOM.match(/ovl-lines/g) || []).length;
  assert.strictEqual(pojave, 2,
    'očekivane su tačno dvije pojave (markup + updOvl); više znači da ga nešto ' +
    'ipak prikazuje pa rani izlaz nije ispravan. Nađeno: ' + pojave);
});

t('updOvl izlazi prije računanja kad je element sakriven', () => {
  const src = extractFn('updOvl');
  const iGuard = src.indexOf("el.style.display === 'none'");
  const iRad = src.indexOf('calcL(');
  assert.ok(iGuard > -1, 'nema provjere vidljivosti');
  assert.ok(iRad > iGuard, 'provjera mora biti PRIJE calcL prolaza kroz sve tačke');
});

t('updOvl i dalje radi kad je element vidljiv (nije obrisana, 18 pozivalaca)', () => {
  const el = { style: { display: '' }, innerHTML: '' };
  const api = new Function('document', 'vlake', 'actI', 'calcL', 'fmtL',
    extractFn('updOvl') + '\nreturn { updOvl };')(
      { getElementById: () => el },
      [{ nm: 'T1', pts: [{ la: 44.9, lo: 16.1 }, { la: 44.91, lo: 16.11 }] }],
      null, () => 1234, m => m + ' m');
  api.updOvl();
  assert.ok(/T1/.test(el.innerHTML), 'vidljiv element se mora i dalje puniti');
});

t('sakriven element ostaje NETAKNUT (ne briše se ni sadržaj)', () => {
  const el = { style: { display: 'none' }, innerHTML: 'staro' };
  const api = new Function('document', 'vlake', 'actI', 'calcL', 'fmtL',
    extractFn('updOvl') + '\nreturn { updOvl };')(
      { getElementById: () => el }, [], null, () => 0, m => m);
  api.updOvl();
  assert.strictEqual(el.innerHTML, 'staro');
});

console.log('\nrndList — ne crta se dok tab Vlake nije otvoren:');

t('KLJUČNO: otkucaj crta listu SAMO na tabu Vlake', () => {
  const src = extractFn('_scheduleOvlRnd');
  assert.ok(/_activeTab === 'vlake'/.test(src) && /rndList\(\)/.test(src),
    'rndList u vrućem putu mora biti uslovljen aktivnim tabom');
});

t('updOvl u istom otkucaju NIJE uslovljen tabom (crta na kartu)', () => {
  const src = extractFn('_scheduleOvlRnd');
  const iUpd = src.indexOf('updOvl()');
  const iUslov = src.indexOf("_activeTab === 'vlake'");
  assert.ok(iUpd > -1 && iUpd < iUslov,
    'updOvl mora ostati van uslova — njegova meta je karta, ne panel Vlake');
});

t('ponašanje otkucaja: van taba jedan poziv, na tabu dva', () => {
  const src = extractFn('_scheduleOvlRnd');
  function pusti(tab) {
    const zvano = [];
    let tajmer = 0;
    const api = new Function('_ovlRndTimer', 'setTimeout', 'updOvl', 'rndList', '_activeTab',
      src + '\nreturn { _scheduleOvlRnd };')(
        tajmer, fn => { fn(); return 1; },
        () => zvano.push('updOvl'), () => zvano.push('rndList'), tab);
    api._scheduleOvlRnd();
    return zvano;
  }
  assert.deepStrictEqual(pusti('karta'), ['updOvl'],
    'tokom snimanja je korisnik na Karti — lista se ne smije crtati');
  assert.deepStrictEqual(pusti('vlake'), ['updOvl', 'rndList']);
});

t('rndList ne baca kad #vl još ne postoji (switchTab je zove pri pokretanju)', () => {
  const src = extractFn('rndList');
  const iGuard = src.indexOf('if (!el) return;');
  const iUpis = src.indexOf("el.innerHTML=''");
  assert.ok(iGuard > -1 && iGuard < iUpis,
    'bez ove provjere bi ulazak u tab prije nego je markup isparsiran oborio ' +
    'cijelo pokretanje — dokumentovana zamka v3.102.2');
});

t('switchTab osvježava listu pri ulasku u tab Vlake', () => {
  const i = HTML.indexOf("} else if (tab==='vlake') {");
  assert.ok(i > -1, 'nije nađena grana taba Vlake u switchTab');
  const grana = HTML.slice(i, HTML.indexOf("} else if (tab==='projekat')", i));
  assert.ok(/rndList\(\);/.test(grana),
    'bez ovoga bi lista pri povratku pokazivala stanje od prije snimanja');
});

console.log('\nMrtav kod — uklonjeni preteče koje ništa ne zove:');

['fabSnimVlaku', 'mojaLokacija', 'togSnimTrag', 'nacrtajVlaku', 'toggleOvl'].forEach(f => {
  t(f + ' je uklonjen (žive zamjene: fabSnimTrag/fabLokacija/_projQuickRec)', () => {
    assert.strictEqual((HTML.match(new RegExp('\\b' + f + '\\b', 'g')) || []).length, 0,
      f + ' se i dalje pojavljuje u fajlu');
  });
});

t('žive zamjene su i dalje ožičene na dugmad', () => {
  ['fabSnimTrag()', 'fabLokacija()'].forEach(f => {
    assert.ok(HTML.includes('onclick="' + f + '"'),
      f + ' više nije ožičen ni na jedno dugme — uklonjeno je previše');
  });
});

console.log('\n' + pass + ' prošlo, ' + fail + ' palo');
process.exit(fail ? 1 : 0);
