// Minimal service worker to satisfy PWA installability on Android.
// We intentionally do NOT cache API responses or HTML to keep portfolio data fresh.
// Static assets under /_next/static are already content-hashed and cached by the browser.

const VERSION = "v1";

self.addEventListener("install", (event) => {
  // Activate immediately on first install / update.
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // Clear any old caches from previous versions.
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)));
      await self.clients.claim();
    })()
  );
});

// Network-only passthrough. Required so the SW counts as "controlling the page"
// for install criteria, without interfering with auth, API calls, or live data.
self.addEventListener("fetch", (event) => {
  // Let the browser handle the request normally.
  return;
});
