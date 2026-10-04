// =====================================================================
// Doznaka — offline i slab signal (v1.8.9).
// Pokretanje:  node tests/js/doznaka-offline.test.js
// ---------------------------------------------------------------------
// 1) Supabase mrežnu grešku VRAĆA ({error}), ne baca. dozLoadLayers je to
//    čitao kao "prazan odjel" i ODMAH prepisivao offline keš praznim nizovima.
// 2) Uspješno čitanje na slaboj vezi je skrivalo zone koje još čekaju u redu
//    (i vraćalo zone obrisane offline).
// 3) GPS tačke su se čitale jednim upitom — PostgREST max-rows (1000) je
//    odsijecao NAJNOVIJE tačke.
// 4) Direktan upis zone bez klijentskog ID-a + ponovni upis iz reda = dupla zona.
// 5) Lista odjela je čekala mrežu iako je keš postojao.
// 6) Offline brisanje zone nije sklanjalo zonu sa karte ni iz keša.
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

let pass = 0, fail = 0;
const testovi = [];
function t(name, fn) { testovi.push([name, fn]); }

// Lanac upita koji na kraju vrati zadani odgovor (thenable, kao postgrest).
function upit(odgovor, log, ime) {
  const o = {};let offset=0,end=Infinity;
  ['select', 'eq', 'neq', 'order', 'in', 'or', 'range', 'update', 'insert', 'single'].forEach(k => {
    o[k] = (...a) => { if (log) log.push(ime + '.' + k + (k === 'range' ? '(' + a.join(',') + ')' : '')); return o; };
  });
  o.range=(a,b)=>{offset=a;end=b;return o;};
  o.then=(res,rej)=>Promise.resolve(typeof odgovor==='function'?odgovor():odgovor).then(r=>({...r,data:Array.isArray(r?.data)?r.data.slice(offset,end+1):r?.data})).then(res,rej);
  return o;
}

// ── dozLoadLayers ─────────────────────────────────────────────────────────
function loadLayersEnv(o) {
  const st = { kes: null, keširano: 0, toast: [] };
  const sb = { from: tab => upit(o.odg[tab] || { data: [], error: null }) };
  const fn = new Function('sb', '_dozLoadCachedLayers', '_dozCacheLayers', 'dozRenderMapLayers', 'dozRenderDetail',
    'showToast', 'console', '_dozUcitajTacke', '_dozPrimijeniRed',
    "const sbUser={id:'me'};let _dozMembers, _dozMarkings, _dozTracks, _dozLoadGen = 0;\n" + extractFn('_vlakePreuzmiStranice')+extractFn('_dozReadList')+extractFn('dozLoadLayers') +
    '\nreturn { run: (id, op) => dozLoadLayers(id, op), get: () => ({ _dozMembers, _dozMarkings, _dozTracks }) };');
  const api = fn(sb, () => o.kes || null,
    () => { st.keširano++; st.kes = api.get(); },
    () => {}, () => {}, m => st.toast.push(m), { error() {} },
    () => Promise.resolve(o.tacke || { data: [], error: null }),
    o.red || (m => m));
  return { api, st };
}
const KES = { members: [{ user_id: 'u1', _korisnik: { ime: 'Ana' } }], markings: [{ id: 'z1' }, { id: 'z2' }], tracks: [{ user_id: 'u1' }] };
const MREZNA = { message: 'TypeError: Failed to fetch', details: '', hint: '', code: '' };

console.log('dozLoadLayers — keš ne smije biti prepisan greškom:');

t('KLJUČNO: {error} (mreža pala) NE prepisuje keš praznim nizovima', async () => {
  const { api, st } = loadLayersEnv({ kes: KES, odg: {
    doz_project_members: { data: null, error: MREZNA },
    doz_area_markings: { data: null, error: MREZNA } },
    tacke: { data: null, error: MREZNA } });
  await api.run('o1', { odmahIzKesa: true });
  assert.strictEqual(st.keširano, 0, 'prazan rezultat mrežne greške je upisan u offline keš');
  assert.strictEqual(api.get()._dozMarkings.length, 2, 'prikaz je izgubio zone iz keša');
  assert.strictEqual(api.get()._dozMembers.length, 1);
});

t('greška SAMO na tačkama (slaba veza) i dalje ne dira keš', async () => {
  const { api, st } = loadLayersEnv({ kes: KES, odg: {
    doz_project_members: { data: [{ user_id: 'u1' }], error: null },
    doz_area_markings: { data: [], error: null } },
    tacke: { data: null, error: MREZNA } });
  await api.run('o1', { odmahIzKesa: true });
  assert.strictEqual(st.keširano, 0);
  assert.strictEqual(api.get()._dozTracks.length, 1);
});

t('uspjeh → keš se osvježava serverskim podacima', async () => {
  const { api, st } = loadLayersEnv({ kes: KES, odg: {
    doz_project_members: { data: [], error: null },
    doz_area_markings: { data: [{ id: 'z9' }], error: null } },
    tacke: { data: [{ user_id: 'u2' }], error: null } });
  await api.run('o1', { odmahIzKesa: true });
  assert.strictEqual(st.keširano, 1);
  assert.deepStrictEqual(st.kes._dozMarkings.map(m => m.id), ['z9']);
});

t('pad upita za imena kolega → imena iz prošlog keša, ne null', async () => {
  const { api, st } = loadLayersEnv({ kes: KES, odg: {
    doz_project_members: { data: [{ user_id: 'u1' }], error: null },
    doz_area_markings: { data: [], error: null },
    korisnici: { data: null, error: MREZNA } } });
  await api.run('o1', { odmahIzKesa: true });
  assert.deepStrictEqual(st.kes._dozMembers[0]._korisnik, { ime: 'Ana' });
});

t('serverske zone prolaze kroz _dozPrimijeniRed (red čekanja)', async () => {
  const { api } = loadLayersEnv({ kes: KES, odg: {
    doz_project_members: { data: [], error: null },
    doz_area_markings: { data: [{ id: 'z9' }], error: null } },
    red: (m, pid) => [{ id: 'local_1', pid }, ...m] });
  await api.run('o1');
  assert.deepStrictEqual(api.get()._dozMarkings.map(m => m.id), ['local_1', 'z9']);
});

// ── _dozPrimijeniRed ──────────────────────────────────────────────────────
function red(q) {
  return new Function('_OL', "const sbUser={id:'me'};"+extractFn('_dozPrimijeniRed') + '\nreturn _dozPrimijeniRed;')({ loadQueue: () => q });
}
console.log('Zone iz reda čekanja:');

t('zona koja čeka upis ostaje vidljiva kad je server još nema', () => {
  const f = red([{ type: 'insert_doz_marking', _localId: 'local_5', payload: { id: 'uu5', project_id: 'o1', label: 'A' } }]);
  const r = f([{ id: 's1' }], 'o1');
  assert.deepStrictEqual(r.map(m => m.id), ['local_5', 's1']);
  assert.strictEqual(r[0].label, 'A');
});

t('zona koja JE stigla na server (isti klijentski ID) se ne duplira', () => {
  const f = red([{ type: 'insert_doz_marking', _localId: 'local_5', payload: { id: 'uu5', project_id: 'o1' } }]);
  assert.deepStrictEqual(f([{ id: 'uu5' }], 'o1').map(m => m.id), ['uu5']);
});

t('zona obrisana offline ne "vaskrsava" iz serverske liste', () => {
  const f = red([{ type: 'delete_doz_marking', payload: { id: 's2' } }]);
  assert.deepStrictEqual(f([{ id: 's1' }, { id: 's2' }], 'o1').map(m => m.id), ['s1']);
});

t('zona drugog odjela se ne miješa', () => {
  const f = red([{ type: 'insert_doz_marking', _localId: 'local_7', payload: { id: 'uu7', project_id: 'DRUGI' } }]);
  assert.deepStrictEqual(f([], 'o1'), []);
});

t('pokvaren red ne ruši učitavanje', () => {
  const f = new Function('_OL', "const sbUser={id:'me'};"+extractFn('_dozPrimijeniRed') + '\nreturn _dozPrimijeniRed;')(
    { loadQueue: () => { throw new Error('x'); } });
  assert.deepStrictEqual(f([{ id: 's1' }], 'o1').map(m => m.id), ['s1']);
});

// ── _dozUcitajTacke ───────────────────────────────────────────────────────
function tackeEnv(ukupno, maxRows, greskaNaStrani) {
  const log = [];
  let poziv = 0;
  const sb = { from: () => {
    const o = {}; let od = 0, doo = 0;
    ['select', 'eq', 'order'].forEach(k => { o[k] = () => o; });
    o.range = (a, b) => { od = a; doo = b; log.push(a + '-' + b); return o; };
    o.then = (res, rej) => {
      const n = poziv++;
      if (greskaNaStrani === n) return Promise.resolve({ data: null, error: MREZNA }).then(res, rej);
      const kraj = Math.min(ukupno, doo + 1, od + maxRows);
      const data = [];
      for (let i = od; i < kraj; i++) data.push({ user_id: 'u', recorded_at: i });
      return Promise.resolve({ data, error: null }).then(res, rej);
    };
    return o;
  } };
  const fn = new Function('sb', "const sbUser={id:'me'},_DOZ_TACKE_STRANA = 1000;\n" + extractFn('_dozUcitajTacke') + '\nreturn _dozUcitajTacke;')(sb);
  return { fn, log };
}
console.log('GPS tačke odjela — stranice:');

t('KLJUČNO: 2500 tačaka → sve (stari upis bez stranica bi dao 1000)', async () => {
  const { fn } = tackeEnv(2500, 1000);
  const r = await fn('o1');
  assert.strictEqual(r.error, null);
  assert.strictEqual(r.data.length, 2500);
  assert.strictEqual(r.data[2499].recorded_at, 2499, 'najnovije tačke moraju biti tu');
});

t('server sa manjim max-rows (500) → i dalje sve, pomak prati stvarno vraćeno', async () => {
  const { fn, log } = tackeEnv(1700, 500);
  const r = await fn('o1');
  assert.strictEqual(r.data.length, 1700);
  assert.strictEqual(log[1], '500-1499');
});

t('greška na drugoj stranici → {error}, ne pola odjela kao "sve"', async () => {
  const { fn } = tackeEnv(2500, 1000, 1);
  const r = await fn('o1');
  assert.strictEqual(r.data, null);
  assert.ok(r.error);
});

t('prazan odjel → prazan niz', async () => {
  const { fn } = tackeEnv(0, 1000);
  assert.deepStrictEqual((await fn('o1')).data, []);
});

// ── _dozUpisiZonu ─────────────────────────────────────────────────────────
function upisEnv(odgovori) {
  const payloads = [];
  const sb = { from: () => {
    const o = {}; let p;
    o.insert = x => { p = x; payloads.push(x); return o; };
    o.select = () => o; o.single = () => o;
    o.then = (res, rej) => Promise.resolve(odgovori.shift()).then(res, rej);
    return o;
  } };
  return { fn: new Function('sb', extractFn('_dozUpisiZonu') + '\nreturn _dozUpisiZonu;')(sb), payloads };
}
console.log('Upis zone:');

t('23505 sa klijentskim ID-jem = već upisano → uspjeh (bez duple zone)', async () => {
  const { fn } = upisEnv([{ data: null, error: { code: '23505' } }]);
  const r = await fn({ id: 'uu1', label: 'A' });
  assert.strictEqual(r.error, null);
  assert.strictEqual(r.data.id, 'uu1');
});

t('22P02 (kolona nije uuid) → ponovi BEZ id-a, zona ne propada', async () => {
  const { fn, payloads } = upisEnv([{ data: null, error: { code: '22P02' } }, { data: { id: 77 }, error: null }]);
  const r = await fn({ id: 'uu1', label: 'A' });
  assert.strictEqual(r.data.id, 77);
  assert.ok(!('id' in payloads[1]));
  assert.strictEqual(payloads[1].label, 'A');
});

t('dozConfirmSave šalje zonu SA klijentskim ID-jem, isti ide i u red', () => {
  const src = extractFn('dozConfirmSave');
  assert.ok(/id: _genUUID\(\)/.test(src), 'bez ID-a: izgubljen odgovor + ponovni upis iz reda = dupla zona');
  assert.ok(src.includes('_dozUpisiZonu(markingPayload)'));
  assert.ok(/if \(!_serverSlanjeDozvoljeno\(\) \|\| !_mrezaProbaj\(\)\) throw/.test(src), 'na mrtvoj vezi čeka do 15 s sa otvorenim modalom');
});

t('red čekanja koristi isti upis zone', () => {
  const i = HTML.indexOf("op.type === 'insert_doz_marking'");
  assert.ok(HTML.slice(i, i + 300).includes('_dozUpisiZonu(op.payload)'));
});

// ── dozLoadOdjeli ─────────────────────────────────────────────────────────
function odjeliEnv(o) {
  const st = { render: [], sacuvano: null, toast: [], mreza: [] };
  const lista = { innerHTML: '' };
  const sb = { from: tab => { st.mreza.push(tab); return upit(o.odg[tab]); } };
  const fn = new Function('sb', 'sbUser', '_OL', 'document', 'dozRenderOdjeli', '_dozRenderOverview', 'showToast',
    '_mrezaProbaj', '_isNetworkErr', '_escHtml',
    'let _dozOdjeli = [];\n' + extractFn('dozLoadOdjeli') + '\nreturn { run: dozLoadOdjeli, get: () => _dozOdjeli };');
  const api = fn(sb, { id: 'me' },
    { DOZ_ODJELI: 'k', load: () => o.kes, save: (k, v) => { st.sacuvano = v; } },
    { getElementById: () => lista },
    () => st.render.push(api.get().length), () => {}, m => st.toast.push(m),
    () => o.mreza !== false, e => !e.code, x => String(x));
  return { api, st, lista };
}
const KES_ODJELI = [{ id: 'a', created_by: 'me' }, { id: 'b', created_by: 'kolega' }];
console.log('Lista odjela:');

t('KLJUČNO: keš se prikaže ODMAH, prije mreže', async () => {
  let pusti;
  const visi = new Promise(r => { pusti = r; });
  const { api, st, lista } = odjeliEnv({ kes: KES_ODJELI, odg: {
    doz_project_members: () => visi, doz_projects: { data: [], error: null } } });
  const p = api.run();
  await new Promise(r => setTimeout(r, 5));
  assert.deepStrictEqual(st.render, [2], 'lista čeka mrežu iako su odjeli na uređaju');
  assert.ok(!lista.innerHTML.includes('Učitavam'));
  pusti({ data: [], error: null });
  await p;
});

t('bez veze (_mrezaProbaj false) → nijedan mrežni poziv, keš ostaje', async () => {
  const { api, st } = odjeliEnv({ kes: KES_ODJELI, mreza: false, odg: {} });
  await api.run();
  assert.deepStrictEqual(st.mreza, []);
  assert.strictEqual(api.get().length, 2);
});

t('bez veze i bez keša → poruka o signalu, ne "provjerite tabele"', async () => {
  const { api, lista } = odjeliEnv({ kes: null, mreza: false, odg: {} });
  await api.run();
  assert.ok(/Nema veze/.test(lista.innerHTML));
});

t('KLJUČNO: pad upita članstva → keš NE gubi odjele kolega', async () => {
  const { api, st } = odjeliEnv({ kes: KES_ODJELI, odg: {
    doz_project_members: { data: null, error: MREZNA },
    doz_projects: { data: [{ id: 'a', created_by: 'me' }], error: null } } });
  await api.run();
  assert.strictEqual(st.sacuvano, null, 'samo vlastiti odjeli upisani preko keša');
  assert.strictEqual(api.get().length, 2);
});

t('mrežna greška bez keša → poruka o signalu', async () => {
  const { api, lista } = odjeliEnv({ kes: null, odg: {
    doz_project_members: { data: null, error: MREZNA } } });
  await api.run();
  assert.ok(/Nema veze/.test(lista.innerHTML));
});

// ── dozDeleteMarking offline ──────────────────────────────────────────────
function brisiEnv(o) {
  const st = { red: [], kes: 0, mreza: 0, toast: [] };
  const sb = { from: () => { st.mreza++; return upit({ error: MREZNA }); } };
  const fn = new Function('sb', '_OL', '_dlgConfirm', '_dozCacheLayers', 'dozRenderMapLayers', 'dozRenderDetail',
    'showToast', '_mrezaProbaj', 'dozLoadLayers', 'localStorage',
    'const sbUser={id:"me"};let _dozSelId = "o1"; let _dozMarkings = ' + JSON.stringify(o.zone) + ';\n' + extractFn('dozDeleteMarking') +
    '\nreturn { run: dozDeleteMarking, get: () => _dozMarkings };');
  const api = fn(sb, { enqueue: op => o.quota ? false : st.red.push(op), loadQueue: () => o.q || [], QUEUE: 'q' },
    async () => true, () => { st.kes++; }, () => {}, () => {}, m => st.toast.push(m),
    () => o.mreza !== false, async () => {}, { setItem() {} });
  return { api, st };
}
console.log('Brisanje zone offline:');

t('KLJUČNO: offline brisanje sklanja zonu sa karte I iz keša', async () => {
  const { api, st } = brisiEnv({ zone: [{ id: 's1' }, { id: 's2' }], mreza: false });
  await api.run('s1');
  assert.deepStrictEqual(api.get().map(m => m.id), ['s2']);
  assert.strictEqual(st.kes, 1, 'bez upisa u keš zona se vraća pri sljedećem otvaranju');
  assert.strictEqual(st.red[0].type, 'delete_doz_marking');
  assert.strictEqual(st.mreza, 0, 'bez veze se ne čeka mrežni poziv');
});

t('mrežni pad (veza "postoji") → isto: red + lokalno uklonjena', async () => {
  const { api, st } = brisiEnv({ zone: [{ id: 's1' }] });
  await api.run('s1');
  assert.strictEqual(api.get().length, 0);
  assert.strictEqual(st.red.length, 1);
});

t('lokalna zona (local_) → uklonjena i iz keša', async () => {
  const { api, st } = brisiEnv({ zone: [{ id: 'local_1' }],
    q: [{ type: 'insert_doz_marking', _localId: 'local_1', payload: {} }] });
  await api.run('local_1');
  assert.strictEqual(api.get().length, 0);
  assert.strictEqual(st.kes, 1);
});

// ── Radnje koje traže vezu ────────────────────────────────────────────────
console.log('Radnje koje traže vezu:');

t('brisanje odjela / dodavanje člana ne počinju bez veze', () => {
  for (const f of ['dozDeleteOdjel', 'dozAddMember', '_dozPickMember']) {
    assert.ok(/if \(!_mrezaProbaj\(\)\) \{ showToast\(/.test(extractFn(f)), f + ' bez provjere veze');
  }
  const d = extractFn('dozDeleteOdjel');
  assert.ok(d.indexOf('_mrezaProbaj') < d.indexOf('_dlgConfirm'),
    'provjera veze PRIJE potvrde — ne pitati pa onda odbiti');
});

t('puna memorija: neuspjelo brisanje ne uklanja zonu ni keš',async()=>{
  const {api,st}=brisiEnv({zone:[{id:'s1'}],mreza:false,quota:true});
  await api.run('s1');assert.strictEqual(api.get().length,1);assert.strictEqual(st.kes,0);assert.strictEqual(st.red.length,0);
});

(async () => {
  for (const [name, fn] of testovi) {
    try { await fn(); console.log('  ✔ ' + name); pass++; }
    catch (e) { fail++; console.log('  ✘ ' + name + '\n      ' + e.message); }
  }
  console.log(`\n${pass} prošlo, ${fail} palo`);
  process.exit(fail ? 1 : 0);
})();

