const CACHE_VERSION = 'lure-meta-v2';

const APP_SHELL = [
  '/',
  'https://cdn.jsdelivr.net/npm/chart.js',
  'https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@400;500;700&display=swap'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => {
      return cache.addAll(APP_SHELL);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys
          .filter((key) => key !== CACHE_VERSION)
          .map((key) => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Only handle http(s) — chrome-extension://, data:, blob: etc. cannot be cached
  // and would throw "Request scheme 'chrome-extension' is unsupported".
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return;
  }
  // Only cache same-origin or the specific CDN assets we pre-cached; skip
  // third-party requests (analytics, fb SDK, etc.) to avoid cache errors.
  if (event.request.method !== 'GET') {
    return;
  }

  // Network-first for API calls
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          return response;
        })
        .catch(() => {
          return caches.match(event.request);
        })
    );
    return;
  }

  // Cache-first for static assets
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) {
        return cached;
      }
      return fetch(event.request).then((response) => {
        if (!response || response.status !== 200 || response.type === 'opaque') {
          return response;
        }
        const clone = response.clone();
        caches.open(CACHE_VERSION).then((cache) => {
          // Wrap put in try/catch because some URLs (chrome-extension, etc.)
          // cannot be cached and would throw.
          try {
            cache.put(event.request, clone);
          } catch (e) {
            // Silently ignore — browser extensions etc.
          }
        }).catch(() => {});
        return response;
      });
    })
  );
});
