// Kangaroo Trainer service worker.
// Caches the app itself and the question pictures, so the iPad app opens fast and pictures load instantly.
// It never caches anything from /api/: answers, progress and profiles always come fresh from the server.
const VERSION = "kt-v1";
const SHELL = `${VERSION}-shell`;
const PICTURES = `${VERSION}-pictures`;

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(SHELL).then((c) => c.addAll(["/", "/manifest.webmanifest", "/icon.svg", "/icon-180.png"])).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// Signing out clears the cached pictures (they are only for signed-in profiles).
self.addEventListener("message", (event) => {
  if (event.data === "signed-out") event.waitUntil(caches.delete(PICTURES));
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return; // always the network

  // The page: network first, so updates arrive straight away; the cached copy only when offline.
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(SHELL).then((c) => c.put("/", copy));
          }
          return res;
        })
        .catch(() => caches.match("/")),
    );
    return;
  }

  // Built files have a content hash in their name, and question pictures never change: cache first.
  const isAsset = url.pathname.startsWith("/assets/");
  const isPicture = url.pathname.startsWith("/content/img/");
  if (isAsset || isPicture) {
    const bucket = isPicture ? PICTURES : SHELL;
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(bucket).then((c) => c.put(req, copy));
            }
            return res;
          }),
      ),
    );
  }
});
