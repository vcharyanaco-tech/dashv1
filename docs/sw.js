const SW_VERSION = '2026.08.12';
const CACHE_NAME = 'ipd-dashboard-' + SW_VERSION;
const PRECACHE_URLS = [
  '/app.html',
  '/app.js',
  '/assets/styles.css',
  '/manifest.json',
  '/docs-pwa-icon.svg'
];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(function (cache) { return cache.addAll(PRECACHE_URLS); })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys()
      .then(function (keys) {
        return Promise.all(
          keys
            .filter(function (k) { return k !== CACHE_NAME; })
            .map(function (k) { return caches.delete(k); })
        );
      })
      .then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (event) {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Never intercept API traffic — /macros/* always goes to the network.
  if (url.pathname.indexOf('/macros/') === 0) return;

  // Only handle same-origin requests (the page shell + its assets).
  if (url.origin !== self.location.origin) return;

  // The app shell + versioned assets must always prefer the network so a
  // fresh deploy is live on the very next load. The previous handler was
  // cache-first with NO revalidation — any browser that installed the SW
  // kept running the old cached app.html/app.js forever, so every deploy
  // after the install date was invisible (which surfaced as "login screen
  // shows but clicking Log in does nothing" when the cached bundle's
  // handleLogin/apiCall_ predated the 08-11 fixes).
  const isShellAsset =
    url.pathname === '/app.html' ||
    url.pathname === '/app.js' ||
    url.pathname === '/offline-queue.js' ||
    url.pathname === '/assets/styles.css' ||
    url.pathname === '/manifest.json' ||
    url.pathname === '/sw.js';

  if (isShellAsset) {
    // Network-first: fresh copy when online, cached copy only when offline.
    event.respondWith(
      fetch(request).then(function (resp) {
        if (resp && resp.status === 200) {
          const copy = resp.clone();
          caches.open(CACHE_NAME).then(function (cache) {
            cache.put(request, copy);
          });
        }
        return resp;
      }).catch(function () {
        return caches.match(request).then(function (cached) {
          if (cached) return cached;
          return caches.match('/app.html');
        });
      })
    );
    return;
  }

  // Everything else (images, icons, fonts): cache-first with a background
  // network refresh so the offline shell stays snappy.
  event.respondWith(
    caches.match(request).then(function (cached) {
      const network = fetch(request).then(function (resp) {
        if (resp && resp.status === 200 && url.origin === self.location.origin) {
          const copy = resp.clone();
          caches.open(CACHE_NAME).then(function (cache) {
            cache.put(request, copy);
          });
        }
        return resp;
      });
      if (cached) {
        // Serve the cached copy immediately; refresh the cache in the
        // background and surface the fresh response on the NEXT load.
        network.catch(function () { /* offline: cached copy is fine */ });
        return cached;
      }
      return network.catch(function () {
        return caches.match('/app.html');
      });
    })
  );
});