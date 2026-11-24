// Service worker: network-first for the app shell with an offline cache fallback.
// API calls are never cached; offline mutations are queued by the app (OfflineContext) and synced when online.
const CACHE = 'nossef-shell-v2';
const SHELL = ['/', '/manifest.webmanifest', '/crest.svg', '/icon-192.png', '/icon-512.png'];
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)));
  self.skipWaiting();
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api')) return;
  // Vite dev-server internals must always come from the network.
  if (url.pathname.startsWith('/@') || url.pathname.includes('/node_modules/') || url.search.includes('t=')) return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        if (res.ok && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy));
        }
        return res;
      })
      .catch(() => caches.match(e.request).then((r) => r || (e.request.mode === 'navigate' ? caches.match('/') : undefined)))
  );
});
