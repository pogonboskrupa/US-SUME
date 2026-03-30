// =====================================================================
// Service Worker — Traktorske Vlake
// Promijeni APP_VERSION pri svakom deploymentu → okida update
// =====================================================================
const APP_VERSION = '1.1.0';
const APP_CACHE   = 'tvlake-app-v' + APP_VERSION;
const TILE_CACHE  = 'tvlake-tiles-v1';  // dijeli se između verzija

// App shell koji se uvijek precachira
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

// ─── INSTALL ─────────────────────────────────────────────────────────
// NE pozivamo skipWaiting ovdje — čekamo da korisnik potvrdi update
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(APP_CACHE).then(cache => cache.addAll(APP_SHELL))
  );
  // Ne preuzimamo kontrolu automatski — toast u aplikaciji nudi izbor
});

// ─── ACTIVATE ────────────────────────────────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k.startsWith('tvlake-app-') && k !== APP_CACHE)
          .map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// ─── FETCH ───────────────────────────────────────────────────────────
self.addEventListener('fetch', event => {
  const url = event.request.url;

  // Map tile zahtjevi → cache-first (omogućuje offline kartu)
  if (
    url.includes('tile.opentopomap.org') ||
    url.includes('tile.openstreetmap.org') ||
    url.includes('arcgisonline.com')
  ) {
    event.respondWith(
      caches.open(TILE_CACHE).then(async cache => {
        const cached = await cache.match(event.request);
        if (cached) return cached;
        try {
          const resp = await fetch(event.request);
          if (resp.ok) cache.put(event.request, resp.clone());
          return resp;
        } catch {
          return cached || new Response('', { status: 503 });
        }
      })
    );
    return;
  }

  // Supabase, CDN i vanjski API → uvijek mreža (nikad cache)
  if (
    url.includes('supabase.co') ||
    url.includes('cdnjs.cloudflare') ||
    url.includes('unpkg.com') ||
    url.includes('api.open-meteo.com')
  ) {
    return;
  }

  // App shell (index.html, manifest, ikone) → network-first, fallback na cache
  if (
    url.startsWith(self.location.origin) ||
    event.request.mode === 'navigate'
  ) {
    event.respondWith(
      fetch(event.request)
        .then(resp => {
          if (resp.ok) {
            caches.open(APP_CACHE).then(c => c.put(event.request, resp.clone()));
          }
          return resp;
        })
        .catch(() => caches.match(event.request))
    );
  }
});

// ─── MESSAGE ─────────────────────────────────────────────────────────
// Stranica šalje 'skipWaiting' kada korisnik klikne "Ažuriraj"
self.addEventListener('message', event => {
  if (event.data === 'skipWaiting') self.skipWaiting();
});
