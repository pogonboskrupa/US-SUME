// =====================================================================
// Štampa — pregled spreman za štampu (v1.8.0).
// Pokretanje:  node tests/js/stampa.test.js
// ---------------------------------------------------------------------
// Stari tok (modal → window.print()) u APK-u nije radio uopšte: Android
// WebView window.print() tiho ignoriše. Sada karta u pregledu dobije tačnu
// veličinu lista, mjerilo se računa razlomljenim zumom, a štampa ide kroz
// native AndroidPrint (PrintManager). Test pušta STVARNE funkcije iz
// index.html.
// =====================================================================
'use strict';
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const HTML = fs.readFileSync(path.join(__dirname, '../../index.html'), 'utf8');
const JAVA = fs.readFileSync(path.join(__dirname,
  '../../android/app/src/main/java/ba/spd/uss/vlake/MainActivity.java'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

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
function extractConst(name) {
  const re = new RegExp('const ' + name + ' = ');
  const m = re.exec(HTML);
  if (!m) throw new Error('nema konstante ' + name);
  let i = m.index + m[0].length, depth = 0;
  for (; i < HTML.length; i++) {
    const c = HTML[i];
    if (c === '{' || c === '[' || c === '(') depth++;
    else if (c === '}' || c === ']' || c === ')') depth--;
    else if (c === ';' && depth === 0) return HTML.slice(m.index, i + 1);
  }
  throw new Error('nezavršena konstanta ' + name);
}

const KONST = ['_STP_FORMATI', '_STP_PX_MM', '_STP_M_PO_PX_PAPIRA', '_STP_MJERILA'].map(extractConst).join('\n');
const FN = ['_stpBroj', '_stpDatum', '_stpZoomZaMjerilo', '_stpMjeriloZaZoom', '_stpLijepoMjerilo', '_stpDimPx',
  '_stpMjeriloZaOkvir', '_stpNaslovTekst', '_escHtml'].map(extractFn).join('\n');
function api(stp) {
  return new Function('_stp', KONST + '\n' + FN + `
    return { _stpBroj, _stpDatum, _stpZoomZaMjerilo, _stpMjeriloZaZoom, _stpLijepoMjerilo, _stpDimPx,
             _stpMjeriloZaOkvir, _stpNaslovTekst, _STP_FORMATI };`)(stp || null);
}
const bnd = (s, w, n, e) => ({ getSouth: () => s, getWest: () => w, getNorth: () => n, getEast: () => e });

let pass = 0, fail = 0;
function t(name, fn) {
  try { fn(); console.log('  ✔ ' + name); pass++; }
  catch (e) { fail++; console.log('  ✘ ' + name + '\n      ' + e.message); }
}
console.log('Štampa:');

t('mjerilo ↔ zum su tačni inverzi (razlomljen zum, bez zaokruživanja)', () => {
  const a = api();
  for (const mj of [2500, 5000, 10000, 12500, 25000]) {
    const z = a._stpZoomZaMjerilo(mj, 44.93);
    assert.ok(Math.abs(a._stpMjeriloZaZoom(z, 44.93) - mj) < 1e-6);
  }
  // 1:10 000 → 1 cm na papiru = 100 m: 10 mm = 37.8 CSS px, m/px = 2.6458
  const z = a._stpZoomZaMjerilo(10000, 44.93);
  const mPoPx = 156543.03392 * Math.cos(44.93 * Math.PI / 180) / Math.pow(2, z);
  assert.ok(Math.abs(mPoPx * 37.7953 - 100) < 0.01);
});

t('lijepo mjerilo se zaokružuje NAVIŠE (odjel mora stati na list)', () => {
  const a = api();
  assert.strictEqual(a._stpLijepoMjerilo(10000), 10000);
  assert.strictEqual(a._stpLijepoMjerilo(10050), 12500);
  assert.strictEqual(a._stpLijepoMjerilo(10005), 10000, 'tolerancija 0,1 % (zaokruživanje px) ne smije skočiti na sljedeće mjerilo');
  assert.strictEqual(a._stpLijepoMjerilo(6350), 7500);
  assert.strictEqual(a._stpLijepoMjerilo(310000), 500000);
});

t('okvir odjela stane na list pri izabranom mjerilu, za svaki format', () => {
  const a = api();
  const b = bnd(44.925, 15.86, 44.94, 15.885);
  for (const fmt of Object.keys(a._STP_FORMATI)) {
    const mj = a._stpMjeriloZaOkvir(b, fmt);
    const { w, h } = a._stpDimPx(fmt);
    const mPoPx = mj * 0.0254 / 96;
    const wM = (15.885 - 15.86) * 111320 * Math.cos(44.9325 * Math.PI / 180), hM = 0.015 * 110574;
    assert.ok(wM <= w * mPoPx && hM <= h * mPoPx, fmt + ' 1:' + mj + ' ne pokriva odjel');
  }
});

t('list je tačne veličine u CSS px (96 dpi): A4 ↔ = 281 × 194 mm', () => {
  const d = api()._stpDimPx('A4L');
  assert.deepStrictEqual(d, { w: Math.round(281 * 96 / 25.4), h: Math.round(194 * 96 / 25.4) });
  const f = api()._STP_FORMATI;
  for (const k of Object.keys(f)) {
    assert.strictEqual(f[k].w + 16, f[k].papir[0], k + ': list + margine ≠ papir');
    assert.strictEqual(f[k].h + 16, f[k].papir[1], k);
  }
});

t('naslov: prefiksi Odjel / G.J. se dodaju samo kad ih korisnik nije upisao', () => {
  assert.strictEqual(api({ odjel: '14', gj: 'Una' })._stpNaslovTekst(), 'Odjel 14  ·  G.J. Una');
  assert.strictEqual(api({ odjel: 'Odjel 14a', gj: 'G.J. Una' })._stpNaslovTekst(), 'Odjel 14a  ·  G.J. Una');
  assert.strictEqual(api({ odjel: '', gj: 'Gornja Una' })._stpNaslovTekst(), 'G.J. Gornja Una');
  assert.strictEqual(api({ odjel: '', gj: '' })._stpNaslovTekst(), '');
});

t('brojevi i datum ne zavise od lokala WebView-a', () => {
  const a = api();
  assert.strictEqual(a._stpBroj(10000), '10 000');
  assert.strictEqual(a._stpBroj(2500), '2 500');
  assert.strictEqual(a._stpBroj(500), '500');
  assert.strictEqual(a._stpDatum(new Date(2026, 8, 6)), '06.09.2026.');
});

t('korisnički tekst (naslov, vlastite stavke legende) ide kroz _escHtml', () => {
  const ov = extractFn('_stpOverlays');
  assert.ok(/_escHtml\(t\)/.test(ov) && /_escHtml\(txt\)/.test(ov));
  const kr = extractFn('_stpKontroleRender');
  assert.ok(/_escHtml\(_stp\.odjel\)/.test(kr) && /_escHtml\(_stp\.gj\)/.test(kr) && /_escHtml\(t\)/.test(kr));
});

t('APK: štampa ide kroz native AndroidPrint (window.print je u WebView-u no-op)', () => {
  assert.ok(/class PrintBridge/.test(JAVA) && /createPrintDocumentAdapter/.test(JAVA) && /PrintManager/.test(JAVA));
  assert.ok(/addJavascriptInterface\(new PrintBridge\(\), "AndroidPrint"\)/.test(JAVA));
  const st = extractFn('stampaStampaj');
  const iNat = st.indexOf('AndroidPrint.print('), iWeb = st.indexOf('window.print()');
  assert.ok(iNat > 0 && iWeb > iNat, 'native most mora imati prednost nad window.print');
  assert.ok(/_stpCekajPlocice/.test(st), 'štampa čeka pločice lista');
});

t('Meni otvara pregled; stari modal i njegove funkcije su uklonjeni', () => {
  assert.ok(/showPrintModal\(\)/.test(HTML.slice(HTML.indexOf('mdrop-item'), HTML.length)));
  assert.ok(/stampaOtvori\(\)/.test(extractFn('showPrintModal')));
  assert.ok(!/id="print-modal"/.test(HTML) && !/function doPrint\(/.test(HTML) && !/id="print-header"/.test(HTML));
});

t('pregled: pinch zum isključen, zoomSnap 0, i sve se vraća pri zatvaranju', () => {
  const o = extractFn('stampaOtvori'), z = extractFn('_stpZatvoriInterno');
  assert.ok(/zoomSnap = 0/.test(o) && /touchZoom/.test(o) && /\.disable\(\)/.test(o));
  assert.ok(/zoomSnap = p\.snap/.test(z) && /\.enable\(\)/.test(z) && /stampa-on/.test(z));
  assert.ok(/history\.pushState/.test(o), 'Android Nazad mora zatvoriti pregled');
});

t('print CSS: štampa samo kartu, bez kontrola i bez umanjenja', () => {
  const i = HTML.indexOf('@media print {');
  const css = HTML.slice(i, HTML.indexOf('\n}\n', i));
  assert.ok(/#stampa-kontrole/.test(css) && /display:none/.test(css));
  assert.ok(/body\.stampa-on #map \{[^}]*transform:none !important/.test(css));
});


function preview(saved={}) {
  const vm=require('node:vm'),store=new Map([['tvlake_stampa_v1',JSON.stringify(saved)]]),els=new Map();
  for(const id of ['print-naslov','print-legend','stampa-kontrole','map','main','stk-nova-stavka'])els.set(id,{innerHTML:'',value:'',style:{},classList:{toggle(){}},getBoundingClientRect:()=>({width:400,height:800})});
  const e={document:{getElementById:id=>els.get(id),body:{classList:{add(){},remove(){}}}},localStorage:{getItem:k=>store.get(k),setItem:(k,v)=>store.set(k,v)},
    map:{options:{zoomSnap:1},getCenter:()=>({lat:45,lng:16}),getZoom:()=>13,setView(){},invalidateSize(){}},window:{addEventListener(){},removeEventListener(){}},
    _projekti:[{id:'P',odjel:'14',gj:'Una'}],_aktivniProjektId:'P',sbProfile:{sumarija:'Šumarija Bos.Krupa'},vlake:[],getOdjelBounds:()=>null,showToast(){}};
  vm.createContext(e);
  const constants=['_STP_FORMATI','_STP_PX_MM','_STP_M_PO_PX_PAPIRA','_STP_MJERILA','_STP_BRZA','_STP_KEY'].map(extractConst).join('\n');
  const fns=['_stpBroj','_stpDatum','_stpZoomZaMjerilo','_stpMjeriloZaZoom','_stpLijepoMjerilo','_stpDimPx','_stpNaslovTekst','_escHtml','_stpLagerSvg','_stpPutanje','_stpSlojevi','_stpStilVrati','_stpStilPrimijeni','_stpSimboli','_stpLegendaPodrazumijevano','_stpAktivniProjekat','_stpPostavkeUcitaj','_stpPostavkeSacuvaj','_stpOverlays','stampaOtvori','_stpOdjelBounds','_stpKontroleRender','_stpPolje','_stpLegNaziv','_stpPregled','_stpUredi','_stpDodajStavku'].map(extractFn).join('\n');
  vm.runInContext('var _stp=null;'+constants+'\n'+fns+'\nfunction _stpSkalaTraka(){} function _stpRaspored(){_stpOverlays();}',e);
  return {e,els,store,state:()=>vm.runInContext('_stp',e)};
}
t('opis zamjenjuje šumariju, višeredni tekst je siguran u zaglavlju i legendi',()=>{
  const h=preview();h.e.stampaOtvori();h.e._stpPolje('opis','Plan vlaka\n<svg onload=x>');h.e._stpPolje('opisLegende','Napomena\n<img src=x>');
  const title=h.els.get('print-naslov').innerHTML,leg=h.els.get('print-legend').innerHTML;
  assert.ok(title.includes('pn-opis')&&title.includes('Plan vlaka\n&lt;svg'));assert.ok(!title.includes('Bos.Krupa'));assert.ok(leg.includes('Napomena\n&lt;img'));assert.ok(!leg.includes('<img'));
});
t('opisi i preimenovani simbol opstaju poslije zatvaranja i ponovnog otvaranja',()=>{
  const h=preview();h.e.stampaOtvori();h.e._stpPolje('opis','Plan 2026');h.e._stpPolje('opisLegende','Projektovana mreža');h.e._stpLegNaziv('vlaka','Glavna vlaka');
  const h2=preview(JSON.parse(h.store.get('tvlake_stampa_v1')));h2.e.stampaOtvori();assert.strictEqual(h2.state().opis,'Plan 2026');assert.strictEqual(h2.state().opisLegende,'Projektovana mreža');assert.strictEqual(h2.state().legLabels.vlaka,'Glavna vlaka');
});
t('stare postavke bez novih polja ostaju upotrebljive; prazno vraća izvorni naziv simbola',()=>{
  const h=preview({fmt:'A3P',leg:['vlaka'],custom:['Stovarište']});h.e.stampaOtvori();assert.strictEqual(h.state().opis,'');assert.strictEqual(h.state().fmt,'A3P');h.e._stpLegNaziv('vlaka','Moja vlaka');assert.ok(h.els.get('print-legend').innerHTML.includes('Moja vlaka'));h.e._stpLegNaziv('vlaka','');assert.ok(h.els.get('print-legend').innerHTML.includes('Traktorska vlaka'));
});
t('opis se može štampati bez odjela i opis legende bez simbola',()=>{
  const h=preview({opis:'Samostalan opis',opisLegende:'Bez simbola',leg:[]});h.e._projekti[0].odjel='';h.e._projekti[0].gj='';h.e.stampaOtvori();assert.ok(h.els.get('print-naslov').innerHTML.includes('Samostalan opis'));assert.ok(h.els.get('print-legend').innerHTML.includes('Bez simbola'));
});
t('veći pregled čuva tekst, format i mjerilo; povratak u uređivanje vraća polja',()=>{
  const h=preview({opis:'Plan',fmt:'A3L'});h.e.stampaOtvori();h.e._stpUredi();assert.ok(h.els.get('stampa-kontrole').innerHTML.includes('<textarea'));const m=h.state().mjerilo;h.e._stpPregled();assert.ok(!h.els.get('stampa-kontrole').innerHTML.includes('<textarea'));assert.strictEqual(h.state().opis,'Plan');assert.strictEqual(h.state().mjerilo,m);assert.strictEqual(h.state().fmt,'A3L');h.e._stpPregled();assert.ok(h.els.get('stampa-kontrole').innerHTML.includes('<textarea'));
});
t('ograničenja teksta i 12 stavki sprečavaju legendu da nekontrolisano raste',()=>{
  const h=preview({custom:Array(12).fill('Stavka')});h.e.stampaOtvori();h.e._stpPolje('opis','x'.repeat(500));assert.strictEqual(h.state().opis.length,300);h.e._stpPolje('mjerilo','bad');assert.ok(Number.isFinite(h.state().mjerilo));h.els.get('stk-nova-stavka').value='Višak';h.e._stpDodajStavku();assert.strictEqual(h.state().custom.length,12);
});

console.log(`\n${pass} prošlo, ${fail} palo`);
process.exit(fail ? 1 : 0);

