/* ==========================================================================
   SANTOS DUMONT - REFECTORY QR SYSTEM
   Service Worker (Total Network-First for App Assets & Clean Cache)
   ========================================================================== */

const CACHE_PREFIX = 'cesd-refectory-';
// 1. Mudamos a versão para v3.3.0 para forçar o navegador a descartar o v3.2.0 antigo
const CACHE_NAME = `${CACHE_PREFIX}v3.3.0`;

const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './carteirinha.html',
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

// 1. Install Event - Ativa imediatamente sem esperar fechar abas
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('👷 Service Worker: Pré-carregando ativos offline...');
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
});

// 2. Activate Event - Remove todos os caches anteriores (v3.2.0, legados, etc.)
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

// 3. Fetch Event - Network-First para a aplicação inteira
self.addEventListener('fetch', (event) => {
  const url = event.request.url;

  // Nunca intercepta nem faz cache de APIs, Supabase ou WebSockets
  if (url.includes('/api/') || url.includes('.supabase.co') || url.includes('wss://')) {
    return;
  }

  // Apenas requisições GET locais
  if (event.request.method !== 'GET') {
    return;
  }

  // Network-First: Tenta a rede primeiro para garantir código atualizado
  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseToCache));
        }
        return networkResponse;
      })
      .catch(() => {
        // Sem internet? Recorre ao cache local
        return caches.match(event.request);
      })
  );
});