const CACHE_NAME = 'thungara-v12';
const ASSETS = [
  '/app/index.html',
  '/data/data.json',
  '/data/youtube_ids.json',
  '/app/manifest.json',
  '/app/search-worker.js',
  '/assets/favicon.svg',
];

self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(ASSETS))
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  if (!event.request.url.startsWith('http://') && !event.request.url.startsWith('https://')) return;

  // Bypass media streaming and external video embeddings
  if (event.request.url.includes('youtube.com') || event.request.url.includes('googlevideo.com')) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then(cached => {
      const fetchPromise = fetch(event.request).then(response => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      }).catch(err => {
        if (event.request.mode === 'navigate') {
          return caches.match('/app/index.html').then(fallback => fallback || caches.match('index.html'));
        }
        throw err;
      });

      return cached || fetchPromise;
    })
  );
});
