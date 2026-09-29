/* Cunga Stock service worker.
 * Caches the app itself (HTML, JS, CSS, icons, item photos) so it opens fast
 * and still shows the app shell on a bad connection. Shop data (Supabase API)
 * is never cached: stock, sales and debts are always live.
 */
const VERSION = 'v1';
const SHELL = `shell-${VERSION}`;
const ASSETS = `assets-${VERSION}`;
const PHOTOS = 'item-photos';
const PRECACHE = ['/', '/index.html', '/site.webmanifest', '/icon-192.png', '/icon-512.png', '/cunga-logo-nobg.png', '/favicon.ico'];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(SHELL).then(c => c.addAll(PRECACHE)));
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keep = [SHELL, ASSETS, PHOTOS];
    for (const key of await caches.keys()) if (!keep.includes(key)) await caches.delete(key);
    await self.clients.claim();
  })());
});

// The page asks the waiting worker to take over when the user taps "Update"
self.addEventListener('message', event => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

async function trimCache(name, max) {
  const cache = await caches.open(name);
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - max; i++) await cache.delete(keys[i]);
}

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Item photos from Supabase Storage: cache-first (they never change; new photos get new names)
  if (url.pathname.includes('/storage/v1/object/public/item-images/')) {
    event.respondWith((async () => {
      const cache = await caches.open(PHOTOS);
      const hit = await cache.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok) { cache.put(req, res.clone()); trimCache(PHOTOS, 300); }
      return res;
    })());
    return;
  }

  if (url.origin !== self.location.origin) return; // Supabase API, fonts… go straight to the network

  // Pages: network first so a new version shows up; offline → the cached app shell
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const res = await fetch(req);
        const cache = await caches.open(SHELL);
        cache.put('/index.html', res.clone());
        return res;
      } catch {
        return (await caches.match('/index.html')) || (await caches.match('/')) || Response.error();
      }
    })());
    return;
  }

  // Built files have a hash in their name, so a cached copy is always right
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith((async () => {
      const cache = await caches.open(ASSETS);
      const hit = await cache.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok) cache.put(req, res.clone());
      return res;
    })());
    return;
  }

  // Icons, logo, manifest: show the cached copy, refresh it in the background
  event.respondWith((async () => {
    const cache = await caches.open(SHELL);
    const hit = await cache.match(req);
    const refresh = fetch(req).then(res => { if (res.ok) cache.put(req, res.clone()); return res; }).catch(() => hit);
    return hit || refresh;
  })());
});
