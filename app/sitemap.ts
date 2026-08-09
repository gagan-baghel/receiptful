import type { MetadataRoute } from "next"

/**
 * Sitemap covers the public marketing surface only — every authenticated route
 * lives behind a workspace and is therefore not crawlable. Update the
 * `SITE_URL` env var (or the `NEXT_PUBLIC_SITE_URL` on the host) so the
 * generated XML points at the live origin.
 */
const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ||
  process.env.SITE_URL?.replace(/\/$/, "") ||
  "https://receiptful.app"

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date()
  const staticPaths = [
    { path: "/", priority: 1.0, changeFrequency: "weekly" as const },
    { path: "/login", priority: 0.4, changeFrequency: "monthly" as const },
    { path: "/signup", priority: 0.9, changeFrequency: "monthly" as const },
    { path: "/forgot-password", priority: 0.2, changeFrequency: "yearly" as const },
    { path: "/help", priority: 0.6, changeFrequency: "monthly" as const },
  ]

  return staticPaths.map(({ path, priority, changeFrequency }) => ({
    url: `${SITE_URL}${path}`,
    lastModified: now,
    changeFrequency,
    priority,
  }))
}
