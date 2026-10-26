// Meni → "Preuzmi APK fajl": samo admin, najnoviji release sa GitHub-a (prerelease
// uključen), APK otvara vanjski preglednik kroz postojeći shouldOverrideUrlLoading.
const assert = require('assert');
const src = require('./_izvor').izvor();
function fn(name) {
  let i = src.indexOf('async function ' + name + '(');
  if (i < 0) i = src.indexOf('function ' + name + '(');
  assert.ok(i >= 0, name + ' postoji');
  let d = 0;
  for (let k = src.indexOf('{', i); k < src.length; k++) {
    if (src[k] === '{') d++;
    else if (src[k] === '}' && --d === 0) return src.slice(i, k + 1);
  }
}
const konst = n => { const m = src.match(new RegExp('const ' + n + ' = [^\\n]+')); assert.ok(m, n); return m[0]; };
let ok = 0;
const ta = async (ime, f) => { await f(); ok++; };

(async () => {
  const asset = fn('_apkAssetIzReleasea');
  const izdvoj = new Function(asset + '; return _apkAssetIzReleasea;')();
  await ta('bira .apk asset', () => {
    const r = izdvoj({ tag_name: 'v3.2.5', assets: [
      { name: 'izvor.zip', state: 'uploaded', browser_download_url: 'https://x/z' },
      { name: 'US-SUME.apk', state: 'uploaded', size: 2097152, browser_download_url: 'https://x/a.apk' }] });
    assert.deepStrictEqual(r, { ver: '3.2.5', ime: 'US-SUME.apk', url: 'https://x/a.apk', vel: 2097152 });
  });
  await ta('odbija nedovršen upload, draft i ne-https', () => {
    assert.strictEqual(izdvoj({ tag_name: 'v1', assets: [{ name: 'a.apk', state: 'new', browser_download_url: 'https://x' }] }), null);
    assert.strictEqual(izdvoj({ draft: true, assets: [{ name: 'a.apk', state: 'uploaded', browser_download_url: 'https://x' }] }), null);
    assert.strictEqual(izdvoj({ assets: [{ name: 'a.apk', state: 'uploaded', browser_download_url: 'javascript:alert(1)' }] }), null);
    assert.strictEqual(izdvoj(undefined), null);
  });

  function okolina({ admin = true, odgovor, baci = false, izbor = 0, apk = true } = {}) {
    const st = { toast: [], href: null, otvoreno: [], dlg: [], fetch: [] };
    const loc = { hostname: apk ? 'appassets.androidplatform.net' : 'pogonboskrupa.github.io', set href(v) { st.href = v; } };
    const doc = { body: { appendChild() {} }, createElement: () => ({ click() { st.otvoreno.push(this.href); }, remove() {} }) };
    const f = new Function('sbProfile', 'showToast', '_fetchT', '_dlg', '_dlgActions', 'location', 'window', 'document', 'APP_VER', '_updMB', 'navigator',
      konst('_APK_RELEASES_API') + ';' + konst('_APK_RELEASES_STR') + ';' + asset + ';' + fn('_apkOtvoriUrl') + ';' + fn('preuzmiApkAdmin') + '; return preuzmiApkAdmin;')(
      admin ? { is_admin: true } : { is_admin: false }, m => st.toast.push(m),
      async (url, ms) => { st.fetch.push([url, ms]); if (baci) throw new TypeError('fetch'); return odgovor; },
      async o => { st.dlg.push(o); return izbor; }, async (t, a) => { st.dlg.push({ title: t, actions: a }); return izbor; },
      loc, { location: loc }, doc, 'v3.2.4', b => (b / 1048576).toFixed(1) + ' MB', {});
    return { f, st };
  }
  const rel = { ok: true, status: 200, json: async () => [{ tag_name: 'v3.2.5', assets: [{ name: 'D.apk', state: 'uploaded', size: 1048576, browser_download_url: 'https://github.com/x/D.apk' }] }] };

  await ta('ne-admin ne dira mrežu', async () => {
    const { f, st } = okolina({ admin: false, odgovor: rel });
    await f();
    assert.strictEqual(st.fetch.length, 0); assert.strictEqual(st.href, null);
  });
  await ta('APK: preuzimanje ide navigacijom (ACTION_VIEW)', async () => {
    const { f, st } = okolina({ odgovor: rel });
    await f();
    assert.ok(/releases\?per_page=1$/.test(st.fetch[0][0]), 'lista releasea uključuje prerelease');
    assert.ok(st.fetch[0][1] > 0, 'poziv ima rok');
    assert.ok(/v3\.2\.5/.test(st.dlg[0].msg) && /v3\.2\.4/.test(st.dlg[0].msg));
    assert.strictEqual(st.href, 'https://github.com/x/D.apk');
  });
  await ta('webapp: otvara u novom tabu', async () => {
    const { f, st } = okolina({ odgovor: rel, apk: false });
    await f();
    assert.deepStrictEqual(st.otvoreno, ['https://github.com/x/D.apk']); assert.strictEqual(st.href, null);
  });
  await ta('bez mreže: nudi stranicu sa verzijama, ne baca', async () => {
    const { f, st } = okolina({ baci: true, izbor: 0 });
    await f();
    assert.strictEqual(st.href, 'https://github.com/pogonboskrupa/US-SUME/releases');
    assert.ok(st.toast.some(t => /Nema veze/.test(t)));
  });
  await ta('meni stavka je skrivena i gejtovana na admina', () => {
    assert.ok(/id="menu-apk-download" hidden/.test(src));
    assert.ok(/apkItem\.hidden = !isAdm/.test(fn('_primijeniUlogeUI')));
  });
  console.log('apk-preuzmi-admin: ' + ok + ' OK');
})().catch(e => { console.error(e); process.exit(1); });
