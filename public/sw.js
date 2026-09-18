/**
 * OFFLINE — the app shell, and the catalog it already downloaded.
 *
 * The site did not work without a connection at all, not even for somebody who
 * had opened it five minutes earlier. For a product whose entire state lives in
 * the browser that is a strange thing to be true: nothing about showing a
 * person their own library requires a network.
 *
 * WHAT IS CACHED, AND WHAT DELIBERATELY IS NOT.
 *
 * The shell and the build assets are precached — they are small, they change
 * only on deploy, and they are what stands between a person and a blank page.
 *
 * `catalog.json` is cached on first use rather than precached. It is 24 MB and
 * precaching would mean a service worker deciding, unprompted, to spend a
 * phone's data on install. Once the app has fetched it for its own reasons the
 * copy is free, so it is kept then.
 *
 * Nothing else. In particular no attempt to prefetch a personal pack of future
 * cards: the deck now opens on a bundled starter pack in 0.3 seconds, so the
 * offline case that matters — open it, see my library, answer some cards — is
 * already covered by the shell plus whatever catalog copy exists.
 *
 * STRATEGY. Navigations are network-first: a stale HTML shell pointing at build
 * assets that no longer exist is worse than a slow load, and this site deploys
 * on every push. Everything else is cache-first, because build assets are
 * content-hashed and a hit is always correct.
 */
const VERSION = "dhawq-v1";
const SHELL = `${VERSION}-shell`;
const DATA = `${VERSION}-data`;

const PRECACHE = ["/", "/manifest.webmanifest", "/icon.svg", "/icon-192.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      /* one failure must not fail the whole install — a missing icon is not a
         reason for a person to have no offline app */
      .then((cache) => Promise.allSettled(PRECACHE.map((url) => cache.add(url))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  /* same origin only: posters come from TMDB and belong to TMDB's caching, and
     an API call answered from a cache is a wrong answer rather than a slow one */
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;

  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          void caches.open(SHELL).then((c) => c.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req).then((hit) => hit ?? caches.match("/")))
    );
    return;
  }

  const isData = url.pathname.endsWith(".json");
  event.respondWith(
    caches.match(req).then((hit) => {
      if (hit) return hit;
      return fetch(req).then((res) => {
        /* opaque and error responses are not worth keeping, and caching a 404
           for a content-hashed asset would survive the deploy that fixes it */
        if (res.ok && res.status === 200) {
          const copy = res.clone();
          void caches.open(isData ? DATA : SHELL).then((c) => c.put(req, copy));
        }
        return res;
      });
    })
  );
});
