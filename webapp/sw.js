// Offline-Speicher: die App funktioniert auch ohne Internet (z.B. im Funkloch).
// Die Versionsnummer wird mit tools/version.sh gemeinsam mit index.html und app.js erhoeht.
const VERSION = '0.19';
const CACHE = 'dokustick-v' + VERSION;
const FILES = ['./', './index.html', './app.js', './compose.js', './catalog.js', './cloud.js', './admin.js', './virtual.js', './config.js', './vendor/supabase.js', './manifest.webmanifest', './icon.svg', './icon-192.png', './icon-512.png'];
const NETWORK_TIMEOUT_MS = 4000;

self.addEventListener('install', (e) => {
  // cache: 'reload' umgeht den HTTP-Cache, sonst landen evtl. alte Dateien im neuen Speicher
  e.waitUntil(caches.open(CACHE)
    .then((c) => c.addAll(FILES.map((f) => new Request(f, { cache: 'reload' }))))
    .then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Zuerst das Netz (immer aktuelle Version), bei Funkloch oder Zeitueberschreitung der Speicher
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      const res = await Promise.race([
        // no-cache: beim Server nachfragen (ETag), nie ungeprueft aus dem HTTP-Cache
        fetch(e.request.url, { cache: 'no-cache' }),
        new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), NETWORK_TIMEOUT_MS)),
      ]);
      if (res.ok) cache.put(e.request.url.split('?')[0], res.clone());
      return res;
    } catch {
      return (await cache.match(e.request, { ignoreSearch: true })) || Response.error();
    }
  })());
});
