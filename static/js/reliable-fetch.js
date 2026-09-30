// Ograničen transport, uključujući čitanje tijela odgovora. Bez automatskog
// ponavljanja upisa: izgubljen odgovor rješava trajni, idempotentni red.

// Posmatrač kvaliteta veze. Ovo je JEDINO mjesto kroz koje prolazi SVAKI
// Supabase poziv (klijent je napravljen sa `global:{fetch:reliableFetch}`), pa
// se stvarno stanje linka mjeri OVDJE — iz saobraćaja koji app ionako pravi.
// NAMJERNO nema zasebnog "ping" poziva: na terenskoj vezi od ~1.4 KB/s svaki
// dodatni zahtjev otima propusnost onome što korisnik stvarno čeka (ista pouka
// kao paralelni FIRMS dohvat, v3.104.1). Posmatrač je opcion i njegova greška
// se guta — mjerenje ne smije oboriti prenos koji mjeri.
let _netPosmatrac = null;
function setNetObserver(fn) { _netPosmatrac = typeof fn === 'function' ? fn : null; }
function _javiPosmatracu(ishod) {
  if (!_netPosmatrac) return;
  try { _netPosmatrac(ishod); } catch (e) {}
}

// ROK JE ROK BEZ NAPRETKA, NE ROK ZA CIJELI POSAO (v1.8.8). Ranije je cijeli
// poziv (slanje + čekanje + čitanje tijela) morao stati u 15 s. Na terenskoj
// vezi od ~1-2 KB/s to je značilo da VEĆI upis nikad ne prođe: vlaka od 1000
// tačaka (~50 KB) ili fotografija traju duže od roka, poziv se prekine, red ga
// ponovi za minut i opet prekine — zauvijek, trošeći baš onu mrvicu propusnosti
// koju mali upisi čekaju. Mrtva veza se i dalje otkriva za timeoutMs, jer na
// njoj NEMA napretka; spora ali živa veza dobija vrijeme dok god bajtovi teku.
//  - slanje: fetch() ne javlja napredak uploada, pa se rok do zaglavlja
//    produžava prema veličini tijela (_RF_MS_PO_KB po KB, najviše _RF_MAX_SLANJE_MS);
//  - čitanje tijela: svaki primljeni komad ponovo navija rok;
//  - ukupno nikad duže od _RF_MAX_UKUPNO_MS (curak od bajta u minuti nije veza).
const _RF_MS_PO_KB = 1000;                 // najsporija veza koju još čekamo: ~1 KB/s
const _RF_MAX_SLANJE_MS = 120 * 1000;
const _RF_MAX_UKUPNO_MS = 5 * 60 * 1000;

function _rfVelicinaTijela(body) {
  if (body == null) return 0;
  if (typeof body === 'string') return body.length;
  if (typeof body.byteLength === 'number') return body.byteLength;
  if (typeof body.size === 'number') return body.size;
  try { return String(body).length; } catch (e) { return 0; }
}

async function _rfProcitajTijelo(response, napredak) {
  const citac = response.body && typeof response.body.getReader === 'function' ? response.body.getReader() : null;
  if (!citac) return response.arrayBuffer();
  const dijelovi = [];
  let ukupno = 0;
  for (;;) {
    const { done, value } = await citac.read();
    if (done) break;
    if (value && value.byteLength) { dijelovi.push(value); ukupno += value.byteLength; }
    napredak();
  }
  const out = new Uint8Array(ukupno);
  let o = 0;
  for (const d of dijelovi) { out.set(d, o); o += d.byteLength; }
  return out.buffer;
}

// Vrata (v1.8.8): aplikacija može reći "veza je izmjereno mrtva, ne šalji".
// Tada poziv ODMAH pada istom greškom kao prekinuta mreža (TypeError), pa svi
// postojeći rezervni putevi (keš, red za sync) krenu odmah umjesto poslije
// roka od 15 s. Brzi neuspjeh se NAMJERNO ne javlja posmatraču — nije pravi
// pokušaj, i inače bi svaki odbijeni poziv osvježio "zadnji uzorak" pa proba
// (jedan pravi pokušaj povremeno) ne bi nikad došla na red.
let _netVrata = null;
function setNetGate(fn) { _netVrata = typeof fn === 'function' ? fn : null; }

async function reliableFetch(url, options = {}, timeoutMs = 15000) {
  if (_netVrata) {
    let pusti = true;
    try { pusti = _netVrata(url, options) !== false; } catch (e) {}
    if (!pusti) {
      // Ime 'AbortError' je NAMJERNO: supabase-js (postgrest) sam ponavlja
      // neuspio GET 3 puta (1 s, 2 s, 4 s) — osim kad je greška AbortError.
      // Bez ovoga je svaki odbijeni poziv i dalje trajao ~7 s, pa je pokretanje
      // na mrtvoj vezi opet stajalo (izmjereno u pravom browseru). Tip ostaje
      // TypeError i poruka sadrži "fetch", pa ga _isNetworkErr i dalje prepoznaje
      // kao mrežnu grešku, a supabase-js auth kao grešku koju treba ponoviti kasnije.
      const e = new TypeError('Failed to fetch (nema veze — radi se lokalno)');
      e.name = 'AbortError';
      throw e;
    }
  }
  const t0 = Date.now();
  const controller = new AbortController();
  const upstream = options.signal;
  const abort = () => controller.abort(upstream && upstream.reason);
  if (upstream) {
    if (upstream.aborted) abort();
    else upstream.addEventListener('abort', abort, { once: true });
  }
  let timer, odbijRok, ttfb = null;
  const rok = new Promise((_, reject) => { odbijRok = reject; });
  const naviji = (ms) => {
    clearTimeout(timer);
    const ostalo = _RF_MAX_UKUPNO_MS - (Date.now() - t0);
    timer = setTimeout(() => {
      const error = new Error('Network timeout');
      error.name = 'TimeoutError';
      odbijRok(error);
      controller.abort(error);
    }, Math.max(0, Math.min(ms, ostalo)));
  };
  try {
    naviji(timeoutMs + Math.min(_RF_MAX_SLANJE_MS, Math.round(_rfVelicinaTijela(options.body) / 1024 * _RF_MS_PO_KB)));
    const odgovor = await Promise.race([
      (async () => {
        const response = await fetch(url, { ...options, cache: 'no-store', signal: controller.signal });
        ttfb = Date.now() - t0;
        naviji(timeoutMs);
        const body = await _rfProcitajTijelo(response, () => naviji(timeoutMs));
        return new Response([204, 205, 304].includes(response.status) ? null : body, {
          status: response.status, statusText: response.statusText, headers: response.headers
        });
      })(),
      rok
    ]);
    // Za kvalitet LINKA je bitno da su bajtovi protekli, ne kakav je HTTP kod —
    // 500 je uredno primljen odgovor, dakle veza radi. `ttfb` (vrijeme do
    // zaglavlja) je odziv linka; `ms` uključuje i veličinu odgovora, pa bi velik
    // (ali uredan) odgovor inače vezu lažno ocijenio kao slabu.
    _javiPosmatracu({ ok:true, ms:Date.now() - t0, ttfb, vrsta:'ok', status:odgovor.status });
    return odgovor;
  } catch (error) {
    // Prekid koji je tražio POZIVALAC (npr. korisnik napustio ekran) nije kvar
    // veze i ne smije obojiti mjerenje kao lošu vezu.
    const prekinuoPozivalac = !!(upstream && upstream.aborted && error && error.name === 'AbortError');
    if (!prekinuoPozivalac) {
      _javiPosmatracu({ ok:false, ms:Date.now() - t0,
        vrsta:(error && error.name === 'TimeoutError') ? 'istek' : 'greska' });
    }
    throw error;
  } finally {
    clearTimeout(timer);
    if (upstream) upstream.removeEventListener('abort', abort);
  }
}
if (typeof module !== 'undefined') module.exports = { reliableFetch, setNetObserver, setNetGate };
