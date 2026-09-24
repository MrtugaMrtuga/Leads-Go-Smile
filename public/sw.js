const CACHE = 'gosmile-leads-menu-v3';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) =>
      cache.addAll([
        '/',
        '/index.html',
        '/look.css',
        '/pin.js',
        '/logo_Gosmilesimple.png',
        '/manifest.webmanifest',
        '/apple-touch-icon.png',
        '/icon-192.png',
        '/icon-512.png',
      ])
    )
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

function isApiRequest(request) {
  try {
    const url = new URL(request.url);
    return url.pathname.startsWith('/api/');
  } catch (e) {
    return false;
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  // Never cache API — network only (avoids poisoning inbox with 502)
  if (isApiRequest(request)) {
    event.respondWith(fetch(request));
    return;
  }

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response && response.ok) {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy));
        }
        return response;
      })
      .catch(() => caches.match(request).then((cached) => cached || caches.match('/')))
  );
});
