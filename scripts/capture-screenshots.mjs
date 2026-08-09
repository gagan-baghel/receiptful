/**
 * Capture every README screenshot in one shot.
 *
 *   1. Start the app:  `npx convex dev` + `npm run dev` (in another terminal)
 *   2. Sign in once in a real browser, export the session cookies to
 *      `scripts/.cookies.json` (see README "Captures pending").
 *   3. Install Chromium:  `npx playwright install chromium`
 *   4. Run:  `node scripts/capture-screenshots.mjs`
 *
 * Outputs land in `public/screenshots/01-landing.png` ... `15-offline.png`,
 * using the exact filenames the README references. Re-run any time the UI
 * changes and the docs stay in sync.
 */

import { mkdir } from "node:fs/promises"
import path from "node:path"
import { pathToFileURL } from "node:url"

const BASE = process.env.SCREENSHOT_BASE_URL ?? "http://localhost:3000"
const OUT_DIR = path.resolve(process.cwd(), "public/screenshots")
const AUTH_FILE = path.resolve(process.cwd(), "scripts/.cookies.json")

const captures = [
  { id: "01-landing", url: "/", viewport: { width: 1440, height: 900 }, full: true },
  { id: "02-signin", url: "/login", viewport: { width: 1440, height: 900 }, full: true },
  { id: "03-signup", url: "/signup", viewport: { width: 1440, height: 900 }, full: true },
  { id: "04-welcome", url: "/dashboard/welcome", viewport: { width: 1440, height: 900 }, full: true, auth: true },
  { id: "06-receipts", url: "/dashboard/receipts", viewport: { width: 1440, height: 900 }, full: true, auth: true },
  { id: "07-receipt-detail", url: null, viewport: { width: 1440, height: 900 }, full: true, auth: true, dynamic: "firstReceipt" },
  { id: "09-tax", url: "/dashboard/tax", viewport: { width: 1440, height: 900 }, full: true, auth: true },
  { id: "10-reports", url: "/dashboard/reports", viewport: { width: 1440, height: 900 }, full: true, auth: true },
  { id: "11-approvals", url: "/dashboard/approvals", viewport: { width: 1440, height: 900 }, full: true, auth: true },
  { id: "12-team", url: "/dashboard/team", viewport: { width: 1440, height: 900 }, full: true, auth: true },
  { id: "13-categories", url: "/dashboard/categories", viewport: { width: 1440, height: 900 }, full: true, auth: true },
  { id: "14-pwa-install", url: "/dashboard", viewport: { width: 390, height: 844 }, full: false, auth: true, note: "iOS Safari 'Add to Home Screen' must be captured manually" },
  { id: "15-offline", url: "/offline", viewport: { width: 390, height: 844 }, full: false },
]

async function loadPlaywright() {
  try {
    return await import("playwright")
  } catch {
    console.error(
      "playwright is not installed.\n" +
        "Run once:  npm install --save-dev playwright && npx playwright install chromium\n" +
        "Then re-run this script.",
    )
    process.exit(1)
  }
}

async function loadAuthFileIfPresent() {
  try {
    const { readFile } = await import("node:fs/promises")
    return JSON.parse(await readFile(AUTH_FILE, "utf8"))
  } catch {
    return null
  }
}

async function main() {
  const { chromium } = await loadPlaywright()
  const auth = await loadAuthFileIfPresent()

  await mkdir(OUT_DIR, { recursive: true })

  const browser = await chromium.launch()
  try {
    for (const shot of captures) {
      const context = await browser.newContext({
        viewport: shot.viewport,
        storageState: shot.auth ? auth ?? undefined : undefined,
      })
      const page = await context.newPage()

      let target = shot.url
      if (shot.dynamic === "firstReceipt") {
        // Visit the receipts index first so the Convex query hydrates, then
        // pick the first row's link. Falls back to /dashboard/receipts if the
        // list is empty so the script still completes.
        await page.goto(`${BASE}/dashboard/receipts`, { waitUntil: "networkidle" })
        const href = await page
          .locator('a[href*="/dashboard/receipts/"]')
          .first()
          .getAttribute("href")
          .catch(() => null)
        target = href ?? "/dashboard/receipts"
      }

      if (!target) continue

      console.log(`  → ${shot.id}  ${target}`)
      await page.goto(`${BASE}${target}`, { waitUntil: "networkidle" })
      // Give Recharts / framer-motion one paint frame to settle.
      await page.waitForTimeout(400)

      const outPath = path.join(OUT_DIR, `${shot.id}.png`)
      await page.screenshot({ path: outPath, fullPage: shot.full })
      await context.close()
    }
  } finally {
    await browser.close()
  }

  console.log(`\nDone. Wrote ${captures.length} screenshots to ${pathToFileURL(OUT_DIR).href}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
