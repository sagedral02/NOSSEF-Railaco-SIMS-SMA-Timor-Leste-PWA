/* SIMS NOSSEF service worker (PRD §34.3, §34.6).
 * - Hashed static assets/icons/fonts: cache-first.
 * - Pages and RSC payloads: network-first with bounded cache fallback (HTML is a data-free client shell).
 * - /api/*: never handled here (network only) — auth, grades, finance and writes are never cached (INV-20).
 * - New versions wait; the app asks the user before activating (no blind skipWaiting).
 */
const VERSION = new URL(self.location.href).searchParams.get('v') || 'dev';
const STATIC = `nossef-static-${VERSION}`;
const PAGES = `nossef-pages-${VERSION}`;
const PRECACHE = ['/offline.html', '/manifest.webmanifest', '/crest.svg', '/icon-192.png', '/icon-512.png'];
const MAX_PAGES = 120;

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(STATIC).then((c) => c.addAll(PRECACHE)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('nossef-') && k !== STATIC && k !== PAGES).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

async function trim(cacheName, max) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - max; i++) await cache.delete(keys[i]);
}

function isStatic(url) {
  return url.pathname.startsWith('/_next/static/') || /\.(png|svg|ico|woff2?|ttf|webmanifest)$/.test(url.pathname);
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return; // network only
  if (url.pathname.startsWith('/_next/webpack-hmr') || url.pathname === '/sw.js') return;

  if (isStatic(url)) {
    event.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((res) => {
        if (res.ok) caches.open(STATIC).then((c) => c.put(req, res.clone()));
        return res;
      })),
    );
    return;
  }

  // Router prefetches are speculative: never cached (they would evict real pages from the bounded cache).
  if (req.headers.get('Next-Router-Prefetch')) return;

  // Pages and React Server Component payloads: network first, fallback to the last good copy.
  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok && res.type === 'basic') {
          const copy = res.clone();
          caches.open(PAGES).then((c) => c.put(req, copy)).then(() => trim(PAGES, MAX_PAGES));
        }
        return res;
      })
      .catch(async () => {
        // Match by URL string: navigation Requests carry headers/mode that can defeat Request-based matching.
        const hit = (await caches.match(req.url, { ignoreVary: true })) || (await caches.match(req, { ignoreVary: true }));
        if (hit) return hit;
        if (req.mode === 'navigate') return (await caches.match('/offline.html')) || Response.error();
        return Response.error();
      }),
  );
});

// Web Push (PRD §30.4): payload is generic ({title, body, url}); details stay behind the authenticated deep link.
self.addEventListener('push', (event) => {
  let data = { title: 'NOSSEF', body: '', url: '/notifications' };
  try {
    data = { ...data, ...(event.data ? event.data.json() : {}) };
  } catch {
    /* non-JSON payload: show the generic message */
  }
  const url = typeof data.url === 'string' && data.url.startsWith('/') ? data.url : '/notifications';
  event.waitUntil(self.registration.showNotification(data.title, { body: data.body, icon: '/icon-192.png', badge: '/icon-192.png', data: { url } }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || '/notifications', self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
      const same = wins.find((w) => w.url.startsWith(self.location.origin));
      if (same) return same.navigate(url).then((w) => (w || same).focus());
      return self.clients.openWindow(url);
    }),
  );
});
