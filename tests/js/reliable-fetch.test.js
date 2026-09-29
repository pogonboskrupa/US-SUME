const assert = require('assert');
const { reliableFetch } = require('../../static/js/reliable-fetch.js');

(async () => {
  const originalFetch = global.fetch;
  try {
    let received;
    global.fetch = async (url, options) => {
      received = { url, options };
      return new Response('uredu', { status: 201, headers: { 'x-test': 'da' } });
    };
    const response = await reliableFetch('https://example.test/upis', { method: 'POST' }, 100);
    assert.equal(response.status, 201);
    assert.equal(response.headers.get('x-test'), 'da');
    assert.equal(await response.text(), 'uredu');
    assert.equal(received.options.cache, 'no-store');
    assert.ok(received.options.signal instanceof AbortSignal);

    let timeoutAborted = false;
    global.fetch = (_url, options) => new Promise((_resolve, reject) => {
      options.signal.addEventListener('abort', () => {
        timeoutAborted = true;
        reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
      }, { once: true });
    });
    await assert.rejects(() => reliableFetch('https://example.test/visi', {}, 10),
      error => error.name === 'TimeoutError');
    assert.equal(timeoutAborted, true);

    const upstream = new AbortController();
    global.fetch = (_url, options) => new Promise((_resolve, reject) => {
      options.signal.addEventListener('abort', () =>
        reject(Object.assign(new Error('prekinuto'), { name: 'AbortError' })), { once: true });
    });
    const pending = reliableFetch('https://example.test/prekid', { signal: upstream.signal }, 100);
    upstream.abort();
    await assert.rejects(() => pending, error => error.name === 'AbortError');

    // v1.8.8: rok je rok BEZ NAPRETKA. Tijelo koje stiže sporo, ali stalno,
    // ukupno traje duže od roka (4 × 30 ms naspram roka od 60 ms) i MORA proći —
    // inače na terenskoj vezi veći odgovor nikad ne stigne.
    const sporoTijelo = () => {
      let i = 0;
      return new ReadableStream({
        async pull(ctl) {
          await new Promise(r => setTimeout(r, 30));
          if (i++ < 4) ctl.enqueue(new TextEncoder().encode('ab'));
          else ctl.close();
        }
      });
    };
    global.fetch = async () => new Response(sporoTijelo(), { status: 200 });
    const spor = await reliableFetch('https://example.test/spor', {}, 60);
    assert.equal(await spor.text(), 'abababab', 'spor ali živ odgovor stiže cijeli');

    // Tijelo koje STANE (zaglavlja stigla, pa ništa) i dalje pada na rok.
    global.fetch = async (_u, options) => new Response(new ReadableStream({
      start(ctl) {
        ctl.enqueue(new TextEncoder().encode('x'));
        options.signal.addEventListener('abort', () => ctl.error(Object.assign(new Error('a'), { name: 'AbortError' })), { once: true });
      }
    }), { status: 200 });
    await assert.rejects(() => reliableFetch('https://example.test/stao', {}, 40),
      error => error.name === 'TimeoutError', 'curak koji stane je mrtva veza');

    // Veliko tijelo zahtjeva produžava rok do zaglavlja (upload ne javlja
    // napredak): 20 KB → +20 s, pa odgovor poslije 80 ms uz rok od 50 ms prolazi.
    global.fetch = () => new Promise(r => setTimeout(() => r(new Response('ok', { status: 201 })), 80));
    const upis = await reliableFetch('https://example.test/veliki', { method: 'POST', body: 'x'.repeat(20 * 1024) }, 50);
    assert.equal(upis.status, 201, 'veliki upis dobija vrijeme za slanje');
    // …a mali upis sa istim kašnjenjem i dalje ističe (rok nije samo podignut za sve).
    await assert.rejects(() => reliableFetch('https://example.test/mali', { method: 'POST', body: '{}' }, 50),
      error => error.name === 'TimeoutError', 'mali upis nema produženje');

    console.log('13 prošlo, 0 palo — pouzdan transport sa rokom bez napretka');
  } finally {
    global.fetch = originalFetch;
  }
})().catch(error => { console.error(error); process.exit(1); });
