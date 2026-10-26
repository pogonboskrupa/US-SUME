// Mjerenje pokretanja (izdvajanje inline JS-a): stvarni index.html sa lokalnog
// HTTP servera — NE kroz page.route, jer presretnut odgovor ne ide kroz HTTP keš,
// pa V8 code cache ne bi radio ni tamo gdje u stvarnosti radi.
// Uslovi: 360×740, keširan profil, navigator.onLine=false, CPU 4×, vanjski zahtjevi
// odbijeni. Svako ponavljanje = nov profil; učitavanje 1 je hladno (bez keša),
// 2. proizvede code cache, od 3. se on koristi ("toplo").
// Upotreba: node tests/perf/startup.cjs [ponavljanja=3] [ucitavanja=4] [izlaz.json]
const http = require('node:http'), fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const { chromium } = require('playwright');
const ROOT = path.resolve(process.env.START_ROOT || path.resolve(__dirname, '../..'));
const REP = +process.argv[2] || 3, LOADS = +process.argv[3] || 4, OUT = process.argv[4];
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.wasm': 'application/wasm', '.kml': 'application/xml', '.geojson': 'application/json' };
const UID = '11111111-1111-4111-8111-111111111111';
const INIT = `Object.defineProperty(navigator,'onLine',{get:()=>false});
navigator.geolocation.watchPosition=()=>1;navigator.geolocation.clearWatch=()=>{};navigator.geolocation.getCurrentPosition=()=>{};
if(!localStorage.getItem('tvlake_ol_profile'))localStorage.setItem('tvlake_ol_profile',JSON.stringify({ts:Date.now(),data:{id:'${UID}',odobren:true,sumarija:'TEST',ime:'Test',prezime:'Mjerenje'}}));
localStorage.setItem('tvlake_device_last_user','${UID}');`;
const CATS = ['devtools.timeline', 'v8', 'disabled-by-default-v8.compile', 'blink.user_timing', 'loading', 'toplevel'];

function server() {
  return new Promise(res => {
    const s = http.createServer((q, r) => {
      const name = decodeURIComponent(q.url.split('?')[0]).replace(/^\/+/, '') || 'index.html';
      const f = path.join(ROOT, name);
      if (!f.startsWith(ROOT) || !fs.existsSync(f) || !fs.statSync(f).isFile()) { r.writeHead(404); r.end(); return; }
      // max-age: drugo učitavanje ide iz HTTP keša, kao kod SW/Cache Storage u webapp-u.
      r.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'max-age=3600' });
      fs.createReadStream(f).pipe(r);
    }).listen(0, '127.0.0.1', () => res(s));
  });
}

function sazmi(trace) {
  const ev = JSON.parse(trace.toString()).traceEvents || [];
  const sum = {}; let consumed = 0, produced = 0; const scripts = {};
  for (const e of ev) {
    if (e.ph !== 'X' || typeof e.dur !== 'number') continue;
    const ms = e.dur / 1000;
    if (['ParseHTML', 'EvaluateScript', 'v8.compile', 'v8.produceCache', 'v8.deserializeCache', 'v8.parseOnBackground', 'FunctionCall', 'ThreadControllerImpl::RunTask'].includes(e.name)) {
      if (e.name === 'ThreadControllerImpl::RunTask') { if (ms > 50) sum.longTasks = (sum.longTasks || 0) + 1; sum.maxTask = Math.max(sum.maxTask || 0, ms); continue; }
      sum[e.name] = (sum[e.name] || 0) + ms;
    }
    if (e.name === 'v8.compile' && e.args?.data?.consumedCacheSize) consumed++;
    if (e.name === 'v8.produceCache') produced++;
    if (e.name === 'EvaluateScript') {
      const u = (e.args?.data?.url || '').replace(/^https?:\/\/[^/]+\//, '') + (e.args?.data?.lineNumber > 1 ? ':' + e.args.data.lineNumber : '');
      scripts[u] = (scripts[u] || 0) + ms;
    }
  }
  for (const k in sum) sum[k] = Math.round(sum[k]);
  const top = Object.entries(scripts).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([u, ms]) => [u, Math.round(ms)]);
  sum.inlineMain = Math.round(Object.entries(scripts).filter(([u]) => /:\d{4,}$/.test(u)).reduce((a, [, ms]) => Math.max(a, ms), 0));
  return { ...sum, cacheConsumed: consumed, cacheProduced: produced, topScripts: top };
}

(async () => {
  const srv = await server(); const base = 'http://127.0.0.1:' + srv.address().port + '/';
  const rezultati = [];
  for (let rep = 0; rep < REP; rep++) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'start-'));
    const ctx = await chromium.launchPersistentContext(dir, { viewport: { width: 360, height: 740 }, serviceWorkers: 'block' });
    await ctx.route(u => !u.href.startsWith(base), r => r.abort());
    await ctx.routeWebSocket(() => true, ws => ws.close());
    await ctx.addInitScript(INIT);
    for (let load = 1; load <= LOADS; load++) {
      const page = await ctx.newPage(); const errors = [];
      page.on('pageerror', e => errors.push(String(e)));
      const cdp = await ctx.newCDPSession(page);
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
      const trace = !process.env.NOTRACE;
      if (trace) await cdp.send('Tracing.start', { categories: CATS.join(','), transferMode: 'ReturnAsStream' });
      const t0 = Date.now();
      await page.goto(base, { waitUntil: 'load', timeout: 120000 });
      await page.waitForFunction(() => window._startupTiming, null, { timeout: 120000 });
      await page.waitForTimeout(300);
      const m = await page.evaluate(() => window._startupTiming);
      let t = { cacheConsumed: 0, cacheProduced: 0, topScripts: [] };
      if (trace) {
        const done = new Promise(res => cdp.once('Tracing.tracingComplete', res));
        await cdp.send('Tracing.end'); const { stream } = await done;
        let buf = ''; for (;;) { const c = await cdp.send('IO.read', { handle: stream }); buf += c.base64Encoded ? Buffer.from(c.data, 'base64').toString() : c.data; if (c.eof) break; }
        await cdp.send('IO.close', { handle: stream });
        t = sazmi(buf);
        if (process.env.DUMP) fs.writeFileSync(process.env.DUMP + load + '.json', buf);
      } if (process.env.DUMP) fs.writeFileSync(process.env.DUMP + load + '.json', buf);
      const red = { ...m, loadEnd: m.load, ...t, rep: rep + 1, load, wall: Date.now() - t0, errors: errors.slice(0, 3) };
      rezultati.push(red);
      console.log(JSON.stringify({ rep: red.rep, load, rs: m.rs, re: m.re, head: m.head, doMain: m.doMain, main: m.main, poslije: m.poslije, scr: m.scr, scrMs: m.scrMs, scrMax: m.scrMax, fdStart: m.fdStart, fdEnd: m.fdEnd, di: m.di, dcl: m.dcl, restore: m.restore, restoreSync: m.restoreSync, parseHTML: t.ParseHTML, evalScript: t.EvaluateScript, compile: t['v8.compile'], maxTask: Math.round(t.maxTask || 0), inlineMain: t.inlineMain, cache: t.cacheConsumed + '/' + t.cacheProduced, err: errors.length }));
      await page.close();
    }
    await ctx.close(); fs.rmSync(dir, { recursive: true, force: true });
  }
  srv.close();
  const med = a => { const s = a.filter(x => x != null).sort((x, y) => x - y); return s.length ? s[Math.floor((s.length - 1) / 2)] : null; };
  const grupa = f => rezultati.filter(f);
  const sazetak = {};
  for (const [ime, f] of [['hladno', r => r.load === 1], ['toplo', r => r.load >= 3]]) {
    const g = grupa(f); sazetak[ime] = { n: g.length };
    for (const k of ['rs', 're', 'head', 'doMain', 'poslije', 'di', 'dcl', 'restore', 'restoreSync', 'main', 'ParseHTML', 'EvaluateScript', 'v8.compile', 'maxTask', 'inlineMain']) sazetak[ime][k] = med(g.map(r => r[k] != null ? Math.round(r[k]) : null));
  }
  console.log('MEDIJAN', JSON.stringify(sazetak));
  if (OUT) fs.writeFileSync(OUT, JSON.stringify({ uslovi: { viewport: '360x740', cpu: '4x', onLine: false, profil: 'keširan', ponavljanja: REP, ucitavanja: LOADS, chromium: chromium.name() }, sazetak, rezultati }, null, 1));
})().catch(e => { console.error(e); process.exit(1); });
