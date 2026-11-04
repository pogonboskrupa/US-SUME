const assert = require('assert');
const { izvor } = require('./_izvor');
const src = izvor();
const i = src.indexOf('async function _sesijaPinom');
const j = src.indexOf('async function adminLoadUsers');
assert(i > 0 && j > i, 'funkcija postoji');
const body = src.slice(i, j);
function make(o) {
  const calls = { prompt: 0, signin: [] };
  const sb = {
    rpc: async () => ({ data: 'a@b.c' }),
    auth: {
      signInWithPassword: async ({ password }) => { calls.signin.push(password); return { error: o.ok === password ? null : { message: 'x' } }; },
      getUser: async () => ({ data: { user: { id: o.uid || 'u1' } } })
    }
  };
  const ctx = {
    sb, sbProfile: { ime: 'A', prezime: 'B' }, sbUser: { id: 'u1', _cachedStub: true },
    _withTimeout: p => p, _loadSavedUser: () => o.saved || null,
    _upgradeToOnlineSession: async () => {}, showToast: () => {},
    _dlgPrompt: async () => { calls.prompt++; return o.pins.shift(); }
  };
  const f = new Function(...Object.keys(ctx), body + '; return {f:_sesijaPinom, st:()=>sbUser};')(...Object.values(ctx));
  return { ...f, calls };
}
(async () => {
  let t = make({ ok: '123400', saved: { pin: '1234' }, pins: [] });
  assert.strictEqual(await t.f(true), true); assert.strictEqual(t.calls.prompt, 0, 'zapamćeni PIN bez pitanja');
  t = make({ ok: '123400', pins: ['1234'] });
  assert.strictEqual(await t.f(true), true); assert.strictEqual(t.calls.prompt, 1); assert.ok(!t.st()._cachedStub);
  t = make({ ok: '123400', pins: ['1', '2', '3'] });
  assert.strictEqual(await t.f(true), false); assert.strictEqual(t.calls.prompt, 3);
  t = make({ ok: '123400', pins: ['1234'], uid: 'drugi' });
  assert.strictEqual(await t.f(true), false, 'tuđi nalog se ne prihvata');
  t = make({ ok: '123400', pins: [] });
  assert.strictEqual(await t.f(true) , false, 'otkazan dijalog');
  console.log('admin-sesija-pin: 5 ok');
})().catch(e => { console.error(e); process.exit(1); });
