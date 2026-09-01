/* Receiptful service worker — minimal installable shell.
 *
 * Strategy:
 *   - Precache only the offline fallback, which is a static page.
 *   - Network-first for navigations, and never store them: dashboard routes are
 *     authenticated, and one shared cache with no per-user partitioning is a
 *     cross-account leak waiting for the first bit of server-rendered user data.
 *   - Cache-first only for build-hashed static assets, whose URL changes on
 *     every deploy, so a stale asset is not reachable.
 *   - Never cache Convex traffic — every request is authenticated and
 *     data-live, so a stale response would be worse than an error.
 */
const VERSION = "v2"
const SHELL_CACHE = `receiptful-shell-${VERSION}`
const OFFLINE_URL = "/offline"

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.add(OFFLINE_URL)),
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

/**
 * Only content-hashed build output is safe to serve cache-first: its URL
 * changes whenever the bytes change, so it can never go stale.
 */
function isImmutableAsset(url) {
  return url.pathname.startsWith("/_next/static/")
}

self.addEventListener("fetch", (event) => {
  const { request } = event
  if (request.method !== "GET") return

  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return
  if (isConvexRequest(url)) return // always live for data

  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          return await fetch(request)
        } catch {
          // No per-user page is ever stored, so offline falls back to the
          // static shell rather than to someone's cached dashboard.
          const fallback = await caches.match(OFFLINE_URL)
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

  if (isImmutableAsset(url)) {
    event.respondWith(
      (async () => {
        const cached = await caches.match(request)
        if (cached) return cached

        const response = await fetch(request)
        if (response.ok) {
          const cache = await caches.open(SHELL_CACHE)
          cache.put(request, response.clone()).catch(() => undefined)
        }
        return response
      })(),
    )
  }
})
