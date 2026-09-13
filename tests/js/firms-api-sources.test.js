'use strict';
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const HTML = fs.readFileSync(path.join(__dirname, '../../index.html'), 'utf8');

function extractFn(name) {
  let start = HTML.indexOf('async function ' + name + '(');
  if (start < 0) start = HTML.indexOf('function ' + name + '(');
  assert.ok(start >= 0, 'nije nađena funkcija ' + name);
  let i = HTML.indexOf('{', start), depth = 0;
  for (; i < HTML.length; i++) {
    if (HTML[i] === '{') depth++;
    else if (HTML[i] === '}' && --depth === 0) return HTML.slice(start, i + 1);
  }
  throw new Error('nezatvorena funkcija ' + name);
}
function extractArray(name) {
  const start = HTML.indexOf('const ' + name + ' = [');
  assert.ok(start >= 0, 'nije nađen niz ' + name);
  const end = HTML.indexOf('];', start);
  return HTML.slice(start, end + 2);
}

async function main() {
  const calls = [];
  const fakeCall = async (naziv, url) => {
    calls.push({ naziv, url });
    if (naziv.includes('NOAA-21')) return { ok:false, naziv, greska:'HTTP 503' };
    return { ok:true, naziv, pts:[{ sat:naziv }] };
  };
  const fakeUrl = (key, period, ref, source) => 'https://firms.test/' + source;
  const src = extractArray('_POZ_API_IZVORI') + '\n' + extractFn('_poziApiBlokovi') + '\n' + extractFn('_poziDohvatiApi') + '\nreturn _poziDohvatiApi;';
  const run = new Function('_poziDohvatiJedan', '_poziApiUrl', 'Date', src)(fakeCall, fakeUrl, Date);
  const r = await run('K', '24h', { la:44.88, lo:16.15 });

  assert.strictEqual(calls.length, 4, 'mora poslati četiri odvojena FIRMS zahtjeva');
  assert.strictEqual(new Set(calls.map(c => c.url)).size, 4, 'svaki satelitski izvor mora imati svoj URL');
  calls.forEach(c => assert.ok(!c.url.split('/').pop().includes(','), 'nijedan source URL ne smije imati zarez'));
  assert.strictEqual(r.ok, true, 'jedan pali satelit ne smije oboriti ostala tri');
  assert.strictEqual(r.pts.length, 3, 'rezultati uspješnih izvora se spajaju');
  assert.strictEqual(r.djelomicno, true);
  assert.ok(r.greske[0].includes('NOAA-21'));
  console.log('6 prošlo, 0 palo — FIRMS Area API koristi odvojene source zahtjeve');
}

main().catch(e => { console.error(e); process.exit(1); });
