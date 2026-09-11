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

    console.log('9 prošlo, 0 palo — pouzdan transport sa rokom');
  } finally {
    global.fetch = originalFetch;
  }
})().catch(error => { console.error(error); process.exit(1); });
