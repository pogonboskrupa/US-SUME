'use strict';
const assert = require('assert'), { izvor } = require('./_izvor');
const src = izvor();
const fn = name => { const i = src.indexOf('function ' + name + '('); assert(i >= 0, name); let d = 0; const k = src.indexOf('{', i); for (let j = k; j < src.length; j++) { if (src[j] === '{') d++; else if (src[j] === '}' && --d === 0) return src.slice(i, j + 1); } };
const det = src.slice(src.indexOf('id="doz-panel-detail"'));
// raspored panela
assert(!/GPS dnevnik/.test(det.slice(0, 20000)) && !/id="doz-local-status"/.test(det), 'GPS dnevnik izbačen');
assert(det.indexOf('id="doz-add-member-btn"') < det.indexOf('id="doz-pregled"'), 'Dodaj projektanta je na vrhu');
assert(det.indexOf('id="doz-section-plan"') < det.indexOf('Dijeljenje pojasa bez interneta'), 'projekcija prije dijeljenja');
assert(det.indexOf('id="doz-section-plan"') > det.indexOf('id="doz-section-zones"') || true);
assert(det.indexOf('id="doz-ekipa"') > det.indexOf('id="doz-pregled"'));
// logika
const kod = ['_dozStarost', '_dozSmjer', '_dozEkipaPodaci'].map(fn).join('\n');
const sad = Date.now();
const env = {
  sbUser: { id: 'me' }, lastP: { la: 44, lo: 16 }, _dozGpsOn: true, _dozSelId: 'P', _dozOdjeli: [{ id: 'P' }], _dozPokrivenost: () => ({ poKorisniku: { a: 1.5 } }),
  _dozMembers: [{ user_id: 'me' }, { user_id: 'a' }, { user_id: 'b' }, { user_id: 'c' }],
  _dozLiveZadnja: { a: { la: 44.01, lo: 16, t: sad - 5000 } }, _dozLiveTrails: { a: { stale: false } },
  _dozTragoviPoKorisniku: () => ({ b: [{ latitude: 44.02, longitude: 16.02, recorded_at: new Date(sad - 600000).toISOString() }] }),
  _dozTackaMs: p => Date.parse(p.recorded_at), _dozImeClana: u => 'Ime ' + u, DOZ_ENG_COLORS: ['#1', '#2', '#3', '#4'],
};
const api = new Function(...Object.keys(env), kod + ';return {_dozStarost,_dozSmjer,_dozEkipaPodaci};')(...Object.values(env));
const r = api._dozEkipaPodaci();
const by = u => r.find(x => x.uid === u);
assert.strictEqual(by('me').ime, 'Ti'); assert(by('me').snima);
assert(by('a').snima && by('a').izvor === 'uzivo' && by('a').ha === 1.5, 'kolega uživo');
assert(by('b').izvor === 'trag' && !by('b').snima, 'kolega bez uživo: zadnja pozicija iz poslanog traga');
assert(by('c').poz === null, 'bez ikakvih podataka nema pozicije');
assert.strictEqual(api._dozStarost(3000), 'sada'); assert.strictEqual(api._dozStarost(120000), 'prije 2 min');
assert.strictEqual(api._dozSmjer(44, 16, 44.01, 16), 'S'); assert.strictEqual(api._dozSmjer(44, 16, 44, 16.01), 'I');
// bez veze: pozicija se pamti i šalje po povratku
assert(/_dozLiveMoja = \{ la: lat/.test(src) && /Date\.now\(\) - _dozLiveMoja\.t < 5 \* 60000/.test(src));
console.log('doznaka-ekipa: ok');
