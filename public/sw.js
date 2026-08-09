/* Receiptful service worker — minimal installable shell.
 *
 * Strategy:
 *   - Precache the offline fallback so the app at least paints when the
 *     network is gone.
 *   - Network-first for navigations and same-origin static assets so users
 *     get the freshest build after a deploy.
 *   - Never cache Convex traffic — every request is authenticated and
 *     data-live, so a stale response would be worse than an error.
 */
const VERSION = "v1"
const SHELL_CACHE = `receiptful-shell-${VERSION}`
const SHELL_ASSETS = ["/", "/offline"]

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL_ASSETS)),
  )
  self.skipWaiting()
})

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys()
      await Promise.all(
        keys
          .filter((key) => key.startsWith("receiptful-") && key !== SHELL_CACHE)
          .map((key) => caches.delete(key)),
      )
      await self.clients.claim()
    })(),
  )
})

function isConvexRequest(url) {
  return (
    url.hostname.endsWith(".convex.cloud") ||
    url.hostname.endsWith(".convex.site") ||
    url.pathname.startsWith("/api/")
  )
}

self.addEventListener("fetch", (event) => {
  const { request } = event
  if (request.method !== "GET") return

  const url = new URL(request.url)
  if (isConvexRequest(url)) return // always live for data

  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(request)
          const cache = await caches.open(SHELL_CACHE)
          cache.put(request, fresh.clone()).catch(() => undefined)
          return fresh
        } catch {
          const cached = await caches.match(request)
          if (cached) return cached
          const fallback = await caches.match("/offline")
          return (
            fallback ||
            new Response("Offline", {
              status: 503,
              headers: { "Content-Type": "text/plain" },
            })
          )
        }
      })(),
    )
    return
  }

  if (url.origin === self.location.origin) {
    event.respondWith(
      (async () => {
        const cached = await caches.match(request)
        if (cached) {
          // Stale-while-revalidate for static assets.
          fetch(request)
            .then((response) => {
              if (response.ok) {
                caches
                  .open(SHELL_CACHE)
                  .then((cache) => cache.put(request, response))
                  .catch(() => undefined)
              }
            })
            .catch(() => undefined)
          return cached
        }
        return fetch(request)
      })(),
    )
  }
})
