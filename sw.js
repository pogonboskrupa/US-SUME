// =====================================================================
// Service Worker — Traktorske Vlake
// Promijeni APP_VERSION pri svakom deploymentu → okida update
// =====================================================================
const APP_VERSION = '1.2.0';
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
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(APP_CACHE).then(cache => cache.addAll(APP_SHELL))
  );
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

  if (
    url.includes('supabase.co') ||
    url.includes('cdnjs.cloudflare') ||
    url.includes('unpkg.com') ||
    url.includes('api.open-meteo.com')
  ) {
    return;
  }

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
self.addEventListener('message', event => {
  if (event.data === 'skipWaiting') {
    self.skipWaiting();
    return;
  }
  // Heartbeat od stranice tokom GPS snimanja — drži SW budan
  if (event.data?.type === 'gps-heartbeat') {
    // SW ostaje aktivan; samo potvrdi prijem
    event.source?.postMessage({ type: 'heartbeat-ack' });
    return;
  }
  // Pokaži notifikaciju snimanja (Foreground Service ekvivalent)
  if (event.data?.type === 'show-rec-notification') {
    const { nm, dist } = event.data;
    self.registration.showNotification('🔴 GPS Snimanje — ' + (nm || 'vlaka'), {
      body: dist ? `Snimljeno: ${dist}` : 'Traktorske vlake aktivno snima GPS trag...',
      icon: './icon-192.png',
      badge: './icon-192.png',
      tag: 'gps-recording',
      requireInteraction: true,   // ne nestaje automatski (kao FG notification)
      silent: true,
      actions: [
        { action: 'pause',  title: '⏸ Pauza' },
        { action: 'stop',   title: '⏹ Stop'  }
      ]
    });
    return;
  }
  // Zatvori notifikaciju kad snimanje stane
  if (event.data?.type === 'hide-rec-notification') {
    self.registration.getNotifications({ tag: 'gps-recording' })
      .then(ns => ns.forEach(n => n.close()));
    return;
  }
});

// ─── NOTIFICATION CLICK ───────────────────────────────────────────────
self.addEventListener('notificationclick', event => {
  event.notification.close();
  if (event.action === 'stop' || event.action === 'pause') {
    // Pošalji akciju u sve otvorene klijente (stranice)
    self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(clients => {
        clients.forEach(c => c.postMessage({ type: 'rec-action', action: event.action }));
        // Ako nema otvorenih prozora, otvori app
        if (clients.length === 0) self.clients.openWindow('./');
      });
  } else {
    // Tapnuli na tijelo notifikacije — fokusiraj ili otvori app
    self.clients.matchAll({ type: 'window' }).then(clients => {
      if (clients.length > 0) clients[0].focus();
      else self.clients.openWindow('./');
    });
  }
});
