/* IR Casebook — Service Worker
   Offline-first precache of the app shell + data.
   Bump CACHE version whenever you update procedures.json or the app files. */
const CACHE = "ir-casebook-v3";

const ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./js/config.js",
  "./js/data-loader.js",
  "./procedures.json",
  "./manifest.webmanifest",
  "./assets/favicon.svg",
  "./assets/SIRS Logo.png"
];

// Precache the shell on install
self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE)
      .then(cache => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

// Clean up old caches on activate
self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Strategy:
//  - Navigations  -> network-first, fall back to cached index.html (SPA works offline)
//  - procedures.json -> network-first so content updates propagate, cache fallback
//  - everything else -> cache-first (fast, resilient in dead zones)
self.addEventListener("fetch", event => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // Supabase API traffic: network-only. Freshness/offline caching for DB data
  // is handled in js/data-loader.js via localStorage snapshots.
  if (url.hostname.endsWith(".supabase.co")) return;

  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req).catch(() => caches.match("./index.html"))
    );
    return;
  }

  if (url.pathname.endsWith("procedures.json")) {
    event.respondWith(
      fetch(req)
        .then(res => {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req))
    );
    return;
  }

  event.respondWith(
    caches.match(req).then(hit => hit || fetch(req).then(res => {
      // Runtime-cache same-origin GETs (e.g., media if you self-host)
      if (url.origin === location.origin) {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(req, copy));
      }
      return res;
    }).catch(() => hit))
  );
});
