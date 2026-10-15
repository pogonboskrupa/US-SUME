// Karta (v2.9.8): toast ne prekriva donju traku/prozorčiće, traka koordinata
// kopira Y X, grafičko mjerilo, realtime oznaka i kompaktan panel Slojeva.
'use strict';
const assert = require('node:assert');
const fs = require('node:fs'), path = require('node:path');
const HTML = fs.readFileSync(path.join(__dirname, '../../index.html'), 'utf8');
const CSS = fs.readFileSync(path.join(__dirname, '../../static/css/field-design.css'), 'utf8');
function extractFn(n) {
  let s = HTML.indexOf('async function ' + n + '('); if (s < 0) s = HTML.indexOf('function ' + n + '(');
  if (s < 0) throw new Error('nema ' + n);
  let d = 0; for (let i = HTML.indexOf('{', s); i < HTML.length; i++) { if (HTML[i] === '{') d++; else if (HTML[i] === '}' && !--d) return HTML.slice(s, i + 1); }
}
let ok = 0, fail = 0; const cekaj = [];
const t = (n, f) => cekaj.push(Promise.resolve().then(f).then(() => ok++, e => { fail++; console.log('PAO:', n, e.message); }));

function toastDno(els) {
  const g = global, st = { w: g.window, gcs: g.getComputedStyle };
  g.window = { innerHeight: 800 }; g.getComputedStyle = e => ({ display: e._d || 'block' });
  try { return new Function('document', extractFn('_toastDno') + '; return _toastDno();')({ getElementById: id => els[id] || null }); }
  finally { g.window = st.w; g.getComputedStyle = st.gcs; }
}
const kutija = (top, bottom) => ({ getBoundingClientRect: () => ({ top, bottom, height: bottom - top }) });
t('toast ide iznad donje trake Karte', () => assert.strictEqual(toastDno({ 'action-bar': kutija(735, 800) }), 75));
t('toast ide iznad otvorenog popupa lokacije', () => assert.strictEqual(toastDno({ 'action-bar': kutija(735, 800), 'ab-loc-popup': kutija(550, 730) }), 260));
t('sakriven popup se ne računa', () => { const p = kutija(550, 730); p._d = 'none'; assert.strictEqual(toastDno({ 'action-bar': kutija(735, 800), 'ab-loc-popup': p }), 75); });
t('toast prati promjene dok je vidljiv (interval se gasi sa toastom)', () => {
  const f = extractFn('showToast'); assert.ok(/t\._pr = setInterval/.test(f) && /clearInterval\(t\._pr\)/.test(f));
});

async function kopiraj(y, x) {
  const els = { 'omgi-y': { textContent: y }, 'omgi-x': { textContent: x } }, toast = [], clip = [];
  const nav = { clipboard: { writeText: async v => { clip.push(v); } } };
  await new Function('document', 'navigator', 'showToast', extractFn('_nvKopirajKoord') + '; return _nvKopirajKoord();')(
    { getElementById: id => els[id] }, nav, m => toast.push(m));
  return { toast, clip };
}
t('dodir na koordinate kopira "Y … X …"', async () => {
  const r = await kopiraj('6 357 193', '4 967 231');
  assert.deepStrictEqual(r.clip, ['Y 6 357 193  X 4 967 231']);
  assert.ok(/Kopirano/.test(r.toast[0]));
});
t('bez poznatih koordinata ništa se ne kopira', async () => {
  const r = await kopiraj('—', '—');
  assert.deepStrictEqual(r.clip, []); assert.ok(/nisu poznate/.test(r.toast[0]));
});
t('traka koordinata: isti ID-jevi, natpisi, kopiranje dodirom', () => {
  const b = HTML.slice(HTML.indexOf('<div id="nv-badge">'), HTML.indexOf('<!-- Meni za izbor razmjere -->'));
  for (const id of ['nv-val', 'omgi-y', 'omgi-x', 'map-scale-click', 'map-scale-val']) assert.ok(b.includes('id="' + id + '"'), id);
  assert.ok(/⛰/.test(b) && /class="nv-lbl">Y</.test(b) && /class="nv-lbl">X</.test(b) && /onclick="_nvKopirajKoord\(\)"/.test(b));
  // 2.9.9: jedan nizak red, bez dugih natpisa i bez ⧉ znaka
  assert.ok(!/Y · X \(MGI\)|Razmjera ▾|nv-kop/.test(b));
  assert.ok(/\.nv-cell-xy \{[^}]*pointer-events:auto/.test(CSS), 'ćelija koordinata mora primati dodir (badge je pointer-events:none)');
});
t('grafičko mjerilo postoji, štampa ga sakriva', () => {
  assert.ok(/L\.control\.scale\(\{[^)]*imperial: false[^)]*\}\)\.addTo\(map\)/.test(HTML));
  assert.ok(/body\.stampa-on \.leaflet-control-container \{ display:none !important; \}/.test(HTML));
});
t('realtime tačkica: skrivena osim kad je sync stvarno aktivan', () => {
  assert.ok(/html #sync-status-dot \{display:none;\}/.test(CSS) && !/sync-dot--ok::after/.test(CSS));
});
t('popup lokacije: bez svijetlih inline boja, boje iz teme', () => {
  const p = HTML.slice(HTML.indexOf('id="ab-loc-popup"'), HTML.indexOf('id="ab-centar"'));
  assert.ok(!/background:#fff7ed|background:#dbeafe/.test(p));
  assert.ok(/html \.ab-pop \{background:var\(--field-card\)/.test(CSS));
  assert.ok(!/tbtn\.style\./.test(extractFn('_updGpsSwitch')));
});
t('Slojevi: podloge su prve, memorija ispod i skrivena dok se ne izračuna', () => {
  const k = HTML.slice(HTML.indexOf('<div id="ls-pane-karte">'), HTML.indexOf('<!-- Tab: Instalirane karte -->'));
  assert.ok(k.indexOf('id="ls-basemap-grid"') < k.indexOf('id="ls-cache-box"'));
  assert.ok(/id="ls-cache-box" hidden/.test(k) && !/💾 …/.test(k) && !/<h3>Online podloge<\/h3>/.test(k));
  assert.ok(/box\.hidden = false/.test(extractFn('_lsRenderCache')));
});
t('traka koordinata 2.9.9: jedan red, providna, zamućena (i u dnevnom prikazu)', () => {
  assert.ok(/html #nv-badge \{[^}]*flex-wrap:nowrap[^}]*background:rgba\(15,23,42,\.55\)[^}]*backdrop-filter:blur/.test(CSS));
  assert.ok(/html #nv-badge \.nv-cell \{[^}]*flex-direction:row/.test(CSS));
  assert.ok(/html\[data-field-theme=day\] #nv-badge \{background:rgba\(255,255,255,\.72\)/.test(CSS));
});

function locStatus(st) {
  const els = {};
  const el = () => ({ className: '', textContent: '', classList: { s: new Set(), toggle(c, v) { v ? this.s.add(c) : this.s.delete(c); }, has(c) { return this.s.has(c); } } });
  ['ab-loc-popup', 'abp-dot', 'gps-age'].forEach(i => els[i] = el());
  new Function('document', 'gpsOn', 'lastP', '_lastGpsFixTime', extractFn('_locStatusRender') + '; _locStatusRender();')(
    { getElementById: id => els[id] || null }, st.gpsOn, st.lastP, st.fixT);
  return els;
}
t('Moja lokacija: tačka u boji preciznosti i starost fiksa', () => {
  const n = Date.now();
  let e = locStatus({ gpsOn: true, lastP: { ac: 4 }, fixT: n - 1000 });
  assert.strictEqual(e['abp-dot'].className, 'abp-dot dobar'); assert.strictEqual(e['gps-age'].textContent, ' · sada');
  e = locStatus({ gpsOn: true, lastP: { ac: 12 }, fixT: n - 20000 });
  assert.strictEqual(e['abp-dot'].className, 'abp-dot srednji'); assert.strictEqual(e['gps-age'].textContent, ' · prije 20 s');
  e = locStatus({ gpsOn: true, lastP: { ac: 40 }, fixT: n - 5000 });
  assert.strictEqual(e['abp-dot'].className, 'abp-dot slab');
  e = locStatus({ gpsOn: true, lastP: { ac: 3 }, fixT: n - 120000 });
  assert.strictEqual(e['abp-dot'].className, 'abp-dot trazi', 'zastario fiks nije "dobar"'); assert.strictEqual(e['gps-age'].textContent, ' · prije 2 min');
});
t('Moja lokacija: bez GPS-a popup nudi samo "Uključi lokaciju"', () => {
  const e = locStatus({ gpsOn: false, lastP: null, fixT: 0 });
  assert.ok(e['ab-loc-popup'].classList.has('gps-off')); assert.strictEqual(e['gps-age'].textContent, '');
  assert.ok(/#ab-loc-popup\.gps-off :is\(\.abp-acts,\.abp-chips\) \{display:none;\}/.test(CSS));
  const p = HTML.slice(HTML.indexOf('id="ab-loc-popup"'), HTML.indexOf('id="ab-centar"'));
  assert.ok(/class="abp-ukljuci" onclick="toggleGPS\(\)"/.test(p));
  for (const id of ['gps-switch', 'compass-switch', 'radius-switch', 'forest-switch', 'ab-loc-trag', 'ab-loc-trag-txt', 'gps-info']) assert.ok(p.includes('id="' + id + '"'), id);
});
t('Šumski čip: dug dodir objašnjava i NE prebacuje mod', () => {
  let tog = 0;
  // Prvi klik poslije dugog dodira se guta, drugi prebacuje mod.
  const g = new Function('_togForestMode', 'let _locLpBio = true;' + extractFn('_locChipSumski') + '; _locChipSumski(); _locChipSumski(); return _locLpBio;');
  assert.strictEqual(g(() => tog++), false); assert.strictEqual(tog, 1);
});

Promise.all(cekaj).then(() => { console.log(`karta-ui: ${ok} ok, ${fail} palo`); process.exit(fail ? 1 : 0); });
