// =====================================================================
// Testovi: dijeljenje kretanja (izbor primalaca, link/QR, obavijest za
// jednog primaoca).  Pokretanje:  node tests/js/dijeljenje-kretanja.test.js
// ---------------------------------------------------------------------
// Testira se STVARNI blok iz glavni.js (od "DIJELJENJE KRETANJA" do
// _showSharedLocMarker), pušten nad lažnim okruženjem (kanali, DOM, mapa).
// =====================================================================
'use strict';
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const SRC = require('./_izvor').izvor();
const JAVA = fs.readFileSync(path.join(__dirname, '../../android/app/src/main/java/ba/spd/uss/vlake/MainActivity.java'), 'utf8');
const a = SRC.indexOf('// ─── DIJELJENJE KRETANJA ──');
const b = SRC.indexOf('function _showSharedLocMarker(uid');
assert.ok(a > 0 && b > a, 'blok dijeljenja nije nađen');
const BLOK = SRC.slice(a, b);

let pass = 0, fail = 0;
function t(name, fn) {
  try { fn(); pass++; console.log('  ok  ' + name); }
  catch (e) { fail++; console.log('  PAD ' + name + '\n      ' + (e && e.message)); }
}

function mk(opts = {}) {
  const ls = {};
  const log = { toasts: [], baneri: [], markeri: [], poslano: [], notif: [], ukloni: [] };
  const kanal = (ime) => ({
    ime, handlers: {},
    on(t, f, cb) { this.handlers[f.event] = cb; return this; },
    subscribe(cb) { this.cb = cb; return this; },
    send(m) { log.poslano.push({ kanal: ime, ...m }); return Promise.resolve('ok'); },
  });
  const env = {
    _LIVE_BASE: 'https://x.test/App/',
    localStorage: { getItem: k => (k in ls ? ls[k] : null), setItem: (k, v) => { ls[k] = String(v); } },
    sbProfile: { sumarija: opts.sumarija ?? 'Cazin', ime: 'Ana', prezime: 'Anić', boja: '#123456' },
    sbUser: { id: opts.me ?? 'me' },
    kolegeMap: opts.kolege ?? {
      a: { ime: 'Marko Marić', color: '#111', sumarija: 'Cazin' },
      b: { ime: 'Ivo Ivić', color: '#222', sumarija: 'Cazin' },
      c: { ime: 'Strani Radnik', color: '#333', sumarija: 'Bihać' },
    },
    isSpdField: () => !!opts.teren,
    lastP: { la: 44.9, lo: 16.1, al: 300, ac: 5 },
    showToast: m => log.toasts.push(m),
    _escHtml: s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;'),
    _jsAttr: s => String(s),
    _bojaZaId: () => '#abcdef',
    _showSharedLocMarker: (...x) => log.markeri.push(x),
    _removeSharedLocMarker: u => log.ukloni.push(u),
    _terenUpdShareUI: () => {},
    _rsList: () => {}, switchTab: () => {}, map: {}, L: {},
    sbStartRealtime: () => { log.rtObnova = (log.rtObnova || 0) + 1; },
    sb: { channel: n => { const k = kanal(n); log.kanali = (log.kanali || []).concat(k); return k; }, removeChannel: () => {} },
    _loadQrLibs: () => Promise.reject(new Error('bez QR')),
    document: {
      visibilityState: opts.vidljiv === false ? 'hidden' : 'visible',
      getElementById: () => null,
      createElement: () => ({ style: {}, setAttribute() {}, querySelector: () => ({}), remove() {}, set innerHTML(v) { log.baneri.push(v); } }),
      body: { appendChild: () => {} },
    },
    navigator: { vibrate: () => {} },
    window: { crypto: require('node:crypto').webcrypto, AndroidNotif: opts.nativ ? { show: (t, b) => log.notif.push([t, b]) } : undefined },
    crypto: require('node:crypto').webcrypto,
    AndroidNotif: opts.nativ ? { show: (t, b) => log.notif.push([t, b]) } : undefined,
    Notification: undefined,
    setInterval: () => 1, clearInterval: () => {}, setTimeout: () => 0,
    location: { search: '' }, history: { replaceState: () => {} },
  };
  const names = Object.keys(env);
  const prelude = 'let _rtShareChannel=env._rtShareChannel, _shareChannelReady=!!env._rtShareChannel, _shareLiveOn=false, _shareLiveTimer=null, _sharedLocMarkers={}, _dozQrGeneration=0,_dozQrStream=null,_dozQrScanning=false,_dozQrFrame=null;\n';
  env._rtShareChannel = opts.kanalSumarije === false ? null : kanal('sumarija');
  const f = new Function('env', 'with(env){' + prelude + BLOK + '\nreturn {ev:(c)=>eval(c)};}');
  const m = f(env);
  return { m, log, env, ls };
}

t('šifra: čista, sa razmacima i iz linka; krive se odbijaju', () => {
  const { m } = mk();
  const f = x => m.ev('_shareKodIzUnosa')(x);
  assert.strictEqual(f('abcd efgh jk'), 'ABCDEFGHJK');
  assert.strictEqual(f('https://x.test/App/?prati=abcdefghjk'), 'ABCDEFGHJK');
  assert.strictEqual(f('?prati=ABCDEFGHJK&x=1'), 'ABCDEFGHJK');
  assert.strictEqual(f('ABC'), '');
  assert.strictEqual(f('https://x.test/App/'), '');
  assert.strictEqual(f(null), '');
});

t('generisana šifra: 10 znakova iz čitljive abecede, različita svaki put', () => {
  const { m } = mk();
  const set = new Set();
  for (let i = 0; i < 200; i++) {
    const k = m.ev('_shareNoviKod')();
    assert.match(k, /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{10}$/);
    set.add(k);
  }
  assert.strictEqual(set.size, 200);
});

t('kolege: samo iz iste šumarije, bez mene, po abecedi', () => {
  const { m } = mk({ me: 'a' });
  const imena = m.ev('_shareKolege')().map(k => k.ime);
  assert.deepStrictEqual(imena, ['Ivo Ivić']);
});

t('ciljevi: "svi" = sve kolege; izbor ignoriše osobu van šumarije', () => {
  const { m } = mk();
  assert.deepStrictEqual(m.ev('_shareCiljevi')().sort(), ['a', 'b']);
  m.ev('_shareSvi=false; _shareIds=["b","c","nepoznat"]');
  assert.deepStrictEqual(m.ev('_shareCiljevi')(), ['b']);
});

t('terenski profil nema birač kolega, ostali imaju', () => {
  assert.strictEqual(mk({ teren: true }).m.ev('_shareImaKolege')(), false);
  assert.strictEqual(mk().m.ev('_shareImaKolege')(), true);
});

t('poruka je za mene: svi / na listi / nisam na listi / stari zapis bez liste', () => {
  const { m } = mk();
  const j = p => m.ev('_shareJeMeni')(p);
  assert.strictEqual(j({ all: true, to: ['x'] }), true);
  assert.strictEqual(j({ to: ['me', 'x'] }), true);
  assert.strictEqual(j({ to: ['x'] }), false);
  assert.strictEqual(j({ to: [] }), true);
  assert.strictEqual(j({}), true);
});

t('slanje: nosi listu primalaca, "all" i sid; bez ciljeva ne šalje ništa', () => {
  const { m, log } = mk();
  m.ev('_shareSvi=false; _shareIds=["a"]; _startShareLive()');
  const live = log.poslano.filter(x => x.event === 'loc-live');
  assert.ok(live.length >= 1);
  const p = live[live.length - 1].payload;
  assert.deepStrictEqual(p.to, ['a']);
  assert.strictEqual(p.all, false);
  assert.ok(p.sid);
  assert.strictEqual(p.uid, 'me');
  log.poslano.length = 0;
  m.ev('_shareIds=[]; _sendLivePos()');
  assert.strictEqual(log.poslano.length, 0);
});

t('slanje: kanal šumarije nije spreman → ne gasi dijeljenje, traži obnovu', () => {
  const { m, log } = mk({ kanalSumarije: false });
  m.ev('_startShareLive()');
  assert.strictEqual(m.ev('_shareLiveOn'), true);
  assert.ok(log.rtObnova >= 1);
});

t('zaustavljanje šalje loc-stop i gasi stanje', () => {
  const { m, log } = mk();
  m.ev('_startShareLive()');
  m.ev('_stopShareLive()');
  assert.ok(log.poslano.some(x => x.event === 'loc-stop'));
  assert.strictEqual(m.ev('_shareLiveOn'), false);
  assert.strictEqual(m.ev('_shareSid'), null);
});

t('JEDAN izabrani primalac: baner + sistemska obavijest u pozadini, jednom po sesiji', () => {
  const { m, log } = mk({ vidljiv: false, nativ: true });
  const p = { uid: 'a', la: 1, lo: 2, sid: 's1', to: ['me'], all: false };
  m.ev('_onShareLive')(p);
  m.ev('_onShareLive')(p);
  assert.strictEqual(log.baneri.length, 1, 'baner jednom');
  assert.match(log.baneri[0], /samo s tobom/);
  assert.strictEqual(log.notif.length, 1);
  assert.match(log.notif[0][1], /samo s tobom/);
  m.ev('_onShareLive')({ ...p, sid: 's2' });
  assert.strictEqual(log.baneri.length, 2, 'nova sesija = nova obavijest');
});

t('GRUPA primalaca: samo toast, bez banera "samo s tobom"', () => {
  const { m, log } = mk({ vidljiv: false, nativ: true });
  m.ev('_onShareLive')({ uid: 'a', la: 1, lo: 2, sid: 's1', to: ['me', 'b'], all: false });
  assert.strictEqual(log.baneri.length, 0);
  assert.ok(log.toasts.some(x => /dijeli kretanje/.test(x)));
  assert.match(log.notif[0][1], /sa tobom/);
});

t('"svima" sa jednim kolegom u listi nije "samo ti" (all=true)', () => {
  const { m, log } = mk();
  m.ev('_onShareLive')({ uid: 'a', la: 1, lo: 2, sid: 's1', to: ['me'], all: true });
  assert.strictEqual(log.baneri.length, 0);
});

t('nisam primalac → marker se ne crta, nema obavijesti', () => {
  const { m, log } = mk();
  m.ev('_onShareLive')({ uid: 'a', la: 1, lo: 2, sid: 's1', to: ['x'] });
  assert.strictEqual(log.markeri.length, 0);
  assert.strictEqual(log.toasts.length, 0);
});

t('kolega koji potvrdi prijem pojavi se u "vide te"', () => {
  const { m } = mk();
  m.ev('_startShareLive()');
  const sid = m.ev('_shareSid');
  m.ev('_onShareAck')({ uid: 'a', sid, to: 'me', ime: 'Marko Marić' });
  assert.ok(m.ev('_shareViewers').a);
  m.ev('_onShareAck')({ uid: 'b', sid: 'tuđi', to: 'me' });
  assert.ok(!m.ev('_shareViewers').b, 'tuđa sesija se ne broji');
  m.ev('_onShareAck')({ uid: 'b', sid, to: 'neko-drugi' });
  assert.ok(!m.ev('_shareViewers').b, 'potvrda za drugog se ne broji');
});

t('link/QR: pokretanje otvara kanal sa šifrom, šalje ime i boju, zaustavljanje poništava šifru', () => {
  const { m, log } = mk({ teren: true });
  const kod = m.ev('_startShareKod')();
  assert.match(kod, /^[A-Z2-9]{10}$/);
  const ch = log.kanali[0];
  assert.strictEqual(ch.ime, 'loc-kod-' + kod);
  ch.cb('SUBSCRIBED');
  const live = log.poslano.filter(x => x.kanal === 'loc-kod-' + kod && x.event === 'loc-live').pop();
  assert.ok(live, 'poslao uživo poziciju');
  assert.strictEqual(live.payload.ime, 'Ana Anić');
  assert.strictEqual(live.payload.boja, '#123456');
  assert.ok(!('to' in live.payload), 'kod-kanal nema listu primalaca');
  assert.strictEqual(m.ev('_shareLink')(kod), 'https://x.test/App/?prati=' + kod);
  m.ev('_stopShareKod')();
  assert.ok(log.poslano.some(x => x.kanal === 'loc-kod-' + kod && x.event === 'loc-stop'));
  assert.strictEqual(m.ev('_shareKod'), null);
  assert.strictEqual(m.ev('_shareLiveOn'), false);
});

t('praćenje: ispravna šifra se pamti i otvara kanal; kriva se odbija; ukloni briše', () => {
  const { m, log, ls } = mk();
  assert.strictEqual(m.ev('_followDodaj')('kriva'), false);
  assert.strictEqual(m.ev('_followDodaj')('https://x.test/App/?prati=abcdefghjk', true), true);
  assert.strictEqual(log.kanali.pop().ime, 'loc-kod-ABCDEFGHJK');
  assert.deepStrictEqual(JSON.parse(ls['tvlake_share_follow_v1:me']).map(e => e.kod), ['ABCDEFGHJK']);
  m.ev('_followDodaj')('ABCDEFGHJK', true);
  assert.strictEqual(JSON.parse(ls['tvlake_share_follow_v1:me']).length, 1, 'bez duplikata');
  m.ev('_followPrekini')('ABCDEFGHJK');
  assert.strictEqual(JSON.parse(ls['tvlake_share_follow_v1:me']).length, 0);
});

t('praćenje: primljena pozicija crta marker po imenu iz poruke i šalje potvrdu', () => {
  const { m, log } = mk();
  m.ev('_followDodaj')('ABCDEFGHJK', true);
  const ch = log.kanali.pop();
  ch.handlers['loc-live']({ payload: { uid: 'teren1', la: 1, lo: 2, sid: 'q', ime: 'Terenac Jedan', boja: '#0f0' } });
  assert.strictEqual(log.markeri.length, 1);
  assert.strictEqual(log.markeri[0][4], true);
  assert.strictEqual(log.markeri[0][3].ime, 'Terenac Jedan');
  const ack = log.poslano.find(x => x.event === 'loc-ack');
  assert.ok(ack && ack.payload.sid === 'q');
  assert.strictEqual(log.baneri.length, 0, 'kod-praćenje ne diže baner "samo s tobom"');
});

t('obavijest: vidljiva aplikacija ne šalje sistemsku; skrivena šalje kroz most', () => {
  let r = mk({ vidljiv: true, nativ: true });
  r.m.ev('_notifyShareLoc')('Marko', 'tijelo', 1, 2);
  assert.strictEqual(r.log.notif.length, 0);
  r = mk({ vidljiv: false, nativ: true });
  r.m.ev('_notifyShareLoc')('Marko', 'tijelo', 1, 2);
  assert.deepStrictEqual(r.log.notif[0], ['📍 Marko', 'tijelo']);
});

t('izbor primalaca se pamti između pokretanja', () => {
  const { m, ls } = mk();
  m.ev('shareToggleKolega')('a');
  const v = JSON.parse(ls.tvlake_share_to_v1);
  assert.strictEqual(v.svi, false);
  assert.deepStrictEqual(v.ids.sort(), ['b']);
});

t('prozor: kolege-birač ne postoji za terenski profil, link/QR postoji za sve', () => {
  const tpl = (opts) => {
    const { m, env } = mk(opts);
    let html = '';
    env.document.getElementById = id => (id === 'share-sheet-body' ? { set innerHTML(v) { html = v; } } : id === 'share-sheet-sub' ? { textContent: '' } : null);
    m.ev('_shareSheetRender')();
    return html;
  };
  const teren = tpl({ teren: true });
  assert.ok(!/Svi iz šumarije/.test(teren));
  assert.match(teren, /Napravi link i QR kod/);
  const proj = tpl({});
  assert.match(proj, /Svi iz šumarije/);
  assert.match(proj, /Marko Marić/);
  assert.ok(!/Strani Radnik/.test(proj), 'kolega iz druge šumarije se ne nudi');
  assert.match(proj, /Napravi link i QR kod/);
});

t('prozor: izbor jedne osobe objašnjava da ona dobija obavijest', () => {
  const { m, env } = mk();
  let html = '';
  env.document.getElementById = id => (id === 'share-sheet-body' ? { set innerHTML(v) { html = v; } } : id === 'share-sheet-sub' ? { textContent: '' } : null);
  m.ev('_shareSvi=false; _shareIds=["a"]');
  m.ev('_shareSheetRender')();
  assert.match(html, /dobija obavijest/);
});

t('markup: prozor, Teren dugme, prečica u popupu, Java most za obavijest i tekst', () => {
  assert.ok(/id="share-sheet"/.test(SRC) && /id="share-sheet-body"/.test(SRC));
  assert.ok(/id="trn-share-btn"/.test(SRC) && /onclick="terenTogShare\(\)"/.test(SRC));
  assert.ok(!/id="ab-loc-dijeli"/.test(SRC),'Dijeli kretanje je uklonjeno iz popupa Moja lokacija');
  assert.ok(/id="ab-loc-tragovi"/.test(SRC)&&/id="ab-loc-mjerenja"/.test(SRC));
  assert.ok(/new AppNotifBridge\(this\), "AndroidNotif"/.test(JAVA));
  assert.ok(/public void shareText\(String title, String text\)/.test(JAVA));
  assert.ok(/prati=/.test(BLOK));
});

console.log(`\n${pass} prošlo, ${fail} palo`);
process.exit(fail ? 1 : 0);
