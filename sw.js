/* ==========================================================================
   SANTOS DUMONT - REFECTORY QR SYSTEM
   Service Worker (Network-First for Config/HTML & Purge `cesd-refectory-*`)
   ========================================================================== */

const CACHE_PREFIX = 'cesd-refectory-';
const CACHE_NAME = `${CACHE_PREFIX}v3.2.0`;

const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './manifest.json',
  './css/main.css',
  './css/components.css',
  './css/scanner.css',
  './css/dashboard.css',
  './assets/img/logo.png',
  './js/runtime-config.js',
  './js/config.js',
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

// 1. Install Event - Skip waiting immediately
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('👷 Service Worker: Pré-carregando ativos offline...');
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
});

// 2. Activate Event - Purge ONLY old caches starting with cesd-refectory- or legacy santos-dumont-cache-
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((name) => {
          if (name !== CACHE_NAME && (name.startsWith(CACHE_PREFIX) || name.startsWith('santos-dumont-cache-'))) {
            console.log('🧹 Service Worker: Removendo cache antigo:', name);
            return caches.delete(name);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// 3. Fetch Event - Never cache API, Supabase, Auth or WebSockets; Network-First for runtime-config and HTML
self.addEventListener('fetch', (event) => {
  const url = event.request.url;

  // IGNORAR E NUNCA ARMAZENAR NO CACHE DO SW: Chamadas de API Render, Supabase, Auth e Realtime
  if (url.includes('/api/') || url.includes('.supabase.co') || url.includes('wss://')) {
    return; // Deixa o navegador fazer o fetch direto na rede sem interceptação
  }

  // Network-First para runtime-config.js e navegação HTML (evita preservar URL antiga)
  if (url.includes('runtime-config.js') || event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseToCache));
        }
        return networkResponse;
      }).catch(() => caches.match(event.request))
    );
    return;
  }

  // Stale-While-Revalidate para demais ativos estáticos (CSS, JS, Imagens)
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      const fetchPromise = fetch(event.request).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseToCache));
        }
        return networkResponse;
      }).catch(() => cachedResponse);

      return cachedResponse || fetchPromise;
    })
  );
});
