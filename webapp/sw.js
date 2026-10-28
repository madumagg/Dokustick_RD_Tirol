// Offline-Speicher: die App funktioniert auch ohne Internet (z.B. im Funkloch).
// Die Versionsnummer wird mit tools/version.sh gemeinsam mit index.html und app.js erhoeht.
const VERSION = '0.42';
const CACHE = 'dokustick-v' + VERSION;
const FILES = ['./', './index.html', './app.js', './compose.js', './protocols.js', './spell.js', './catalog.js', './cloud.js', './support.js', './themes.js', './themes.css', './admin.js', './virtual.js', './config.js', './vendor/supabase.js', './manifest.webmanifest', './icon.svg', './favicon.svg', './icon-192.png', './icon-512.png', './icon-maskable-512.png', './apple-touch-icon.png'];
const NETWORK_TIMEOUT_MS = 4000;

// Rechtschreibung (ca. 2 MB): eigener Speicher, der App-Updates ueberdauert.
// Bei neuen Woerterbuch- oder Hunspell-Dateien DICT_CACHE hochzaehlen.
const DICT_CACHE = 'dokustick-dict-1';
const DICT_FILES = [
  './vendor/hunspell/dist/Hunspell.js', './vendor/hunspell/dist/Utilities.js', './vendor/hunspell/dist/WasmMemoryManager.js',
  './vendor/hunspell/dist/Utf8.js', './vendor/hunspell/wasm/hunspell.js', './vendor/hunspell/wasm/hunspell.wasm',
  './vendor/dict/de-AT.aff', './vendor/dict/de-AT.dic', './vendor/dict/de-med.dic',
];
const DICT_URLS = new Set(DICT_FILES.map((f) => new URL(f, self.location).href));

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    // cache: 'reload' umgeht den HTTP-Cache, sonst landen evtl. alte Dateien im neuen Speicher
    const c = await caches.open(CACHE);
    await c.addAll(FILES.map((f) => new Request(f, { cache: 'reload' })));
    // Woerterbuch nur laden, wenn es noch fehlt; ein Fehler hier verhindert das Update nicht
    try {
      const d = await caches.open(DICT_CACHE);
      for (const f of DICT_FILES) if (!(await d.match(f))) await d.add(new Request(f, { cache: 'reload' }));
    } catch { /* dann beim ersten Gebrauch */ }
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE && k !== DICT_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  const url = e.request.url.split('?')[0];
  // Woerterbuch: zuerst aus dem eigenen Speicher (aendert sich nur mit DICT_CACHE)
  if (DICT_URLS.has(url)) {
    e.respondWith((async () => {
      const d = await caches.open(DICT_CACHE);
      const hit = await d.match(url);
      if (hit) return hit;
      const res = await fetch(url);
      if (res.ok) d.put(url, res.clone());
      return res;
    })());
    return;
  }
  // Sonst zuerst das Netz (immer aktuelle Version), bei Funkloch oder Zeitueberschreitung der Speicher
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      const res = await Promise.race([
        // no-cache: beim Server nachfragen (ETag), nie ungeprueft aus dem HTTP-Cache
        fetch(e.request.url, { cache: 'no-cache' }),
        new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), NETWORK_TIMEOUT_MS)),
      ]);
      if (res.ok) cache.put(url, res.clone());
      return res;
    } catch {
      return (await cache.match(e.request, { ignoreSearch: true })) || Response.error();
    }
  })());
});
