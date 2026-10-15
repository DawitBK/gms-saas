self.addEventListener("push", (event) => {
  if (!event.data) return;
  const data = event.data.json();
  event.waitUntil(
    self.registration.showNotification(data.title || "GMS", {
      body: data.body || "",
      icon: data.icon || "assets/logo.png",
      badge: data.badge || "assets/logo.png",
      tag: data.tag || "gms",
      renotify: true,
      requireInteraction: false,
      data: { url: data.url || "/" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = event.notification.data?.url || "/";
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if (client.url.endsWith(target) && "focus" in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow(target);
    }),
  );
});

const STATIC_CACHE = "gms-static-v2";
const OFFLINE_URL = "offline.html";
const BYPASS_RE = /^\/(api\/.*|socket\.io\/.*)$/;

async function cacheFirst(request) {
  const cache = await caches.open(STATIC_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) cache.put(request, response.clone());
  return response;
}

self.addEventListener("install", (event) => {
  // Take over immediately instead of waiting for every open tab to close —
  // makes a fixed/updated sw.js (e.g. after the version bump above) apply on
  // the very next reload rather than requiring a full browser restart.
  self.skipWaiting();
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.add(OFFLINE_URL)),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    Promise.all([
      // Purge every cache from a previous STATIC_CACHE name — bump the
      // version above whenever a bad/stale entry needs to be force-evicted
      // from everyone's Cache Storage, not just this browser's.
      caches.keys().then((keys) =>
        Promise.all(keys.filter((key) => key !== STATIC_CACHE).map((key) => caches.delete(key))),
      ),
      self.clients.claim(),
    ]),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return; // Server Actions, form posts, logout — always network

  const url = new URL(request.url);
  const scope = new URL(self.registration.scope).pathname; // '/' or '/gms/'
  const appPath = url.pathname.startsWith(scope) ? "/" + url.pathname.slice(scope.length) : url.pathname;

  if (BYPASS_RE.test(appPath)) return; // API/socket.io — always network
  if (appPath.includes("/_next/image")) return; // dynamic, never content-hashed
  if (appPath.startsWith("/_next/static/")) {
    event.respondWith(cacheFirst(request));
    return;
  }
  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(() => caches.match(OFFLINE_URL)));
    return;
  }
  // everything else: pass through, no caching either direction
});
