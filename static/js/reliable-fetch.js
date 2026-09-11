// Ograničen transport, uključujući čitanje tijela odgovora. Bez automatskog
// ponavljanja upisa: izgubljen odgovor rješava trajni, idempotentni red.
async function reliableFetch(url, options = {}, timeoutMs = 15000) {
  const controller = new AbortController();
  const upstream = options.signal;
  const abort = () => controller.abort(upstream && upstream.reason);
  if (upstream) {
    if (upstream.aborted) abort();
    else upstream.addEventListener('abort', abort, { once: true });
  }
  let timer;
  try {
    return await Promise.race([
      (async () => {
        const response = await fetch(url, { ...options, cache: 'no-store', signal: controller.signal });
        const body = await response.arrayBuffer();
        return new Response([204, 205, 304].includes(response.status) ? null : body, {
          status: response.status, statusText: response.statusText, headers: response.headers
        });
      })(),
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          const error = new Error('Network timeout');
          error.name = 'TimeoutError';
          reject(error);
          controller.abort(error);
        }, timeoutMs);
      })
    ]);
  } finally {
    clearTimeout(timer);
    if (upstream) upstream.removeEventListener('abort', abort);
  }
}
if (typeof module !== 'undefined') module.exports = { reliableFetch };
