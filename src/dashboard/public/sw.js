// Pixel Bot app service worker: keeps the app shell and shows a friendly page when the server can't be reached.
const CACHE = 'pixelbot-v1';
const SHELL = ['/offline.html', '/app/icon-192.png', '/app/icon-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  // Pages always come fresh from the server; if it can't be reached, show the offline page.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => (res.status >= 520 && res.status <= 530 ? caches.match('/offline.html').then((o) => o || res) : res))
        .catch(() => caches.match('/offline.html')),
    );
    return;
  }
  // App icons: cache first.
  if (url.pathname.startsWith('/app/')) {
    event.respondWith(caches.match(req).then((hit) => hit || fetch(req)));
  }
});
