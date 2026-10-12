'use strict';
const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict');
const html = fs.readFileSync('index.html', 'utf8');
function fn(name) {
  const start = html.search(new RegExp('(?:async )?function ' + name + '\\('));
  let depth = 0;
  for (let i = html.indexOf('{', start); i < html.length; i++) {
    if (html[i] === '{') depth++;
    if (html[i] === '}' && --depth === 0) return html.slice(start, i + 1);
  }
  throw Error(name);
}
function setup() {
  const calls = [], timers = [];
  const env = { sbUser: { id: 'u' }, sbProfile: { sumarija: 's' }, getOdjel: () => '105',
    vlake: Array.from({ length: 40 }, (_, i) => ({ nm: 'T' + i, br: i, kr: 0, color: 'green',
      projektId: 'p', pts: [{ la: 44, lo: 16, al: 400 }] })),
    console, setTimeout: f => { timers.push(f); },
    sbFlushVlaka: async i => calls.push(i) };
  vm.createContext(env);
  vm.runInContext(['_jsonKanon', '_vlakaIstiSadrzaj', '_vlakaSyncPayload', '_retryOrphanVlake'].map(fn).join('\n'), env);
  const queue = env.vlake.map(v => ({ type: 'upsert_vlaka', _uid: 'u', _blocked: true,
    payload: JSON.parse(JSON.stringify(env._vlakaSyncPayload(v))) }));
  let reads = 0;
  env._OL = { loadQueue: () => { reads++; return queue; } };
  async function drain() { while (timers.length) { timers.shift()(); await new Promise(r => setImmediate(r)); } }
  return { env, queue, calls, timers, drain, reads: () => reads };
}
(async () => {
  let h = setup(), before = JSON.stringify(h.queue), p = h.env._retryOrphanVlake();
  await h.drain(); await p;
  assert.equal(h.calls.length, 0); assert.equal(h.reads(), 1);
  assert.equal(JSON.stringify(h.queue), before);
  console.log('OK 40 identičnih neposlanih vlaka: bez ponovnog upisa; blocked status ostaje');
  h = setup(); h.env.vlake[1].pts.push({ la: 45, lo: 17 }); h.env.vlake[2].color = 'red';
  h.queue.splice(3, 1); p = h.env._retryOrphanVlake(); await h.drain(); await p;
  assert.deepEqual(h.calls, [1, 2, 3]);
  console.log('OK nova geometrija, metapodaci i nedostajuća operacija ulaze u red');
  h = setup(); h.queue.length = 0; p = h.env._retryOrphanVlake();
  assert.equal(h.calls.length, 0); h.env.sbUser = { id: 'other' };
  await h.drain(); await p; assert.equal(h.calls.length, 0);
  console.log('OK promjena korisnika tokom pauze prekida oporavak');
  h = setup(); h.queue.length = 0; p = h.env._retryOrphanVlake();
  h.env.vlake[0]._deleted = true; await h.drain(); await p;
  assert.equal(h.calls.includes(0), false); assert.equal(h.calls.length, 39);
  console.log('OK brisanje tokom pauze ne vraća vlaku');
  h = setup(); h.env._OL.loadQueue = () => { throw Error('oštećeno'); };
  await h.env._retryOrphanVlake(); assert.equal(h.calls.length, 0);
  console.log('OK oštećen red se ne prepisuje');
})().catch(e => { console.error(e); process.exitCode = 1; });
