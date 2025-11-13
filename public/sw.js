const CACHE_NAME = 'badminton-cache-v1';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  // On ne traite que les GET
  if (request.method !== 'GET') return;

  event.respondWith(
    caches.open(CACHE_NAME).then((cache) =>
      cache.match(request).then((cachedResponse) => {
        const fetchPromise = fetch(request)
          .then((networkResponse) => {
            // On met en cache pour la prochaine fois
            cache.put(request, networkResponse.clone());
            return networkResponse;
          })
          .catch(() => cachedResponse);

        // Si on a déjà quelque chose en cache, on le renvoie direct
        return cachedResponse || fetchPromise;
      })
    )
  );
});
