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

// Network-passthrough fetch handler. We don't cache anything (portfolio data
// must stay live), but Chrome's PWA install criteria want a SW that actively
// participates in fetches, so we explicitly respondWith(fetch(...)).
self.addEventListener("fetch", (event) => {
  // Only handle GET; let the browser default-handle everything else.
  if (event.request.method !== "GET") return;
  event.respondWith(fetch(event.request));
});
