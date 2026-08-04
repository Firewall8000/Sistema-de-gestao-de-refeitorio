/* ==========================================================================
   SANTOS DUMONT - REFECTORY QR SYSTEM
   Service Worker for Standalone Offline PWA Support
   ========================================================================== */

const CACHE_NAME = 'santos-dumont-cache-v1';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './manifest.json',
  './css/main.css',
  './css/components.css',
  './css/scanner.css',
  './css/dashboard.css',
  './assets/img/logo.png',
  './js/app.js',
  './js/db.js',
  './js/auth.js',
  './js/studentService.js',
  './js/mealService.js',
  './js/qrGenerator.js',
  './js/audio.js',
  './js/scanner.js',
  './js/dashboard.js',
  './js/sync.js'
];

// Install Event - Pre-cache App Shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('👷 Service Worker: Pré-carregando ativos offline...');
      return cache.addAll(ASSETS_TO_CACHE);
    }).then(() => self.skipWaiting())
  );
});

// Activate Event - Clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((name) => {
          if (name !== CACHE_NAME) {
            console.log('👷 Service Worker: Removendo cache antigo:', name);
            return caches.delete(name);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch Event - Cache First with Network Fallback
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(event.request).then((networkResponse) => {
        return networkResponse;
      }).catch(() => {
        // Fallback for html pages
        if (event.request.headers.get('accept').includes('text/html')) {
          return caches.match('./index.html');
        }
      });
    })
  );
});
