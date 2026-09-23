/**
 * NEXZORA — Progressive Web App (PWA) Service Worker
 * Handles offline caching for core application shell and background synchronization.
 */

const CACHE_NAME = 'nexzora-pwa-v2.1';
const APP_SHELL = [
  '/',
  '/index.html',
  '/src/css/style.css',
  '/src/css/components.css',
  '/src/js/app.js',
  '/src/js/auth.js',
  '/src/js/data.js',
  '/src/js/map.js',
  '/src/js/report.js',
  '/src/js/offline-store.js',
  '/src/js/alerts.js',
  '/src/js/dashboard.js',
  '/assets/favicon.svg'
];

// Install Event: Cache App Shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[ServiceWorker] Pre-caching offline application shell');
      return cache.addAll(APP_SHELL).catch((err) => {
        console.warn('[ServiceWorker] Pre-cache non-fatal note:', err);
      });
    }).then(() => self.skipWaiting())
  );
});

// Activate Event: Clear Stale Caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keyList) => {
      return Promise.all(
        keyList.map((key) => {
          if (key !== CACHE_NAME) {
            console.log('[ServiceWorker] Removing obsolete cache:', key);
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch Event: Cache-First for static assets, Network-First for APIs
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // API Requests: Network first, don't crash if offline
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(event.request).catch(() => {
        return new Response(
          JSON.stringify({
            success: false,
            offline: true,
            message: 'Network offline. Saved data locally.'
          }),
          {
            status: 503,
            headers: { 'Content-Type': 'application/json' }
          }
        );
      })
    );
    return;
  }

  // App Shell & Static Assets: Stale-While-Revalidate
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      const fetchPromise = fetch(event.request).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      }).catch(() => cachedResponse);

      return cachedResponse || fetchPromise;
    })
  );
});

// Background Sync Event: Trigger offline sync when connection restored
self.addEventListener('sync', (event) => {
  if (event.tag === 'nexzora-sync-reports') {
    console.log('[ServiceWorker] Background Sync event triggered: nexzora-sync-reports');
    event.waitUntil(
      self.clients.matchAll().then((clients) => {
        clients.forEach((client) => {
          client.postMessage({ type: 'TRIGGER_OFFLINE_SYNC' });
        });
      })
    );
  }
});
