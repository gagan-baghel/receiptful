/**
 * Capture every README screenshot in one shot, against a freshly signed-up,
 * seeded account so every surface renders with real-looking data instead of
 * empty states.
 *
 *   1. Start the app:  `npx convex dev` + `npm run dev:web` (in another terminal)
 *   2. Install Chromium once:  npx playwright install chromium
 *   3. Run:  node scripts/capture-screenshots.mjs
 *
 * Outputs land in `public/screenshots/`, using the exact filenames the
 * README references. Re-run any time the UI changes to keep the docs in sync.
 */

import { execFileSync } from "node:child_process"
import { mkdir } from "node:fs/promises"
import path from "node:path"

const BASE = process.env.SCREENSHOT_BASE_URL ?? "http://localhost:3000"
const OUT_DIR = path.resolve(process.cwd(), "public/screenshots")

const DESKTOP = { width: 1440, height: 900 }
const MOBILE = { width: 390, height: 844 }

async function loadPlaywright() {
  try {
    return await import("playwright")
  } catch {
    console.error(
      "playwright is not installed.\n" +
        "Run once:  npm install --save-dev playwright && npx playwright install chromium",
    )
    process.exit(1)
  }
}

async function shoot(page, id, { viewport = DESKTOP, full = true } = {}) {
  await page.setViewportSize(viewport)
  await page.waitForSelector(".animate-pulse", { state: "hidden", timeout: 15000 }).catch(() => {})
  await page.waitForTimeout(500)
  await page.screenshot({ path: path.join(OUT_DIR, `${id}.png`), fullPage: full })
  console.log(`  → ${id}`)
}

async function main() {
  const { chromium } = await loadPlaywright()
  await mkdir(OUT_DIR, { recursive: true })

  const browser = await chromium.launch()
  try {
    const context = await browser.newContext({ viewport: DESKTOP })
    const page = await context.newPage()

    // Unauthenticated surfaces, captured before the account exists so the
    // real marketing/login/signup forms render instead of an auth redirect.
    await page.goto(`${BASE}/`, { waitUntil: "networkidle" })
    await shoot(page, "01-landing")

    await page.goto(`${BASE}/login`, { waitUntil: "networkidle" })
    await shoot(page, "02-signin")

    await page.goto(`${BASE}/signup`, { waitUntil: "networkidle" })
    await shoot(page, "03-signup")

    console.log("Signing up...")
    const email = `demo-${Date.now()}@example.com`
    await page.fill('input[name="name"]', "Alex Rivera")
    await page.fill('input[name="email"]', email)
    await page.fill('input[name="workspace"]', "Northwind Consulting")
    await page.fill('input[name="password"]', "Password123A")
    await page.click('button[type="submit"]')
    await page.waitForURL("**/dashboard/welcome", { timeout: 30000 })
    await shoot(page, "04-welcome")

    console.log("Seeding demo data...")
    execFileSync("npx", ["convex", "run", "seedDemo:run", "{}"], { stdio: "inherit" })

    await page.goto(`${BASE}/dashboard`, { waitUntil: "networkidle" })
    await page.waitForTimeout(800)
    await shoot(page, "16-dashboard-home")

    await page.goto(`${BASE}/dashboard/receipts`, { waitUntil: "networkidle" })
    await shoot(page, "06-receipts")

    const firstReceiptHref = await page
      .locator('a[href*="/dashboard/receipts/"]')
      .first()
      .getAttribute("href")
      .catch(() => null)
    if (firstReceiptHref) {
      await page.goto(`${BASE}${firstReceiptHref}`, { waitUntil: "networkidle" })
      await shoot(page, "07-receipt-detail")
    }

    await page.goto(`${BASE}/dashboard/tax`, { waitUntil: "networkidle" })
    await shoot(page, "09-tax")

    await page.goto(`${BASE}/dashboard/reports`, { waitUntil: "networkidle" })
    await shoot(page, "10-reports")

    await page.goto(`${BASE}/dashboard/approvals`, { waitUntil: "networkidle" })
    await shoot(page, "11-approvals")

    await page.goto(`${BASE}/dashboard/team`, { waitUntil: "networkidle" })
    await shoot(page, "12-team")

    await page.goto(`${BASE}/dashboard/categories`, { waitUntil: "networkidle" })
    await shoot(page, "13-categories")

    await page.goto(`${BASE}/dashboard/budgets`, { waitUntil: "networkidle" })
    await shoot(page, "17-budgets")

    await page.goto(`${BASE}/dashboard/billing`, { waitUntil: "networkidle" })
    await shoot(page, "18-billing")

    await page.goto(`${BASE}/dashboard/settings`, { waitUntil: "networkidle" })
    await shoot(page, "19-settings")

    await page.goto(`${BASE}/dashboard/trash`, { waitUntil: "networkidle" })
    await shoot(page, "20-trash")

    await page.goto(`${BASE}/dashboard/analytics`, { waitUntil: "networkidle" })
    await shoot(page, "21-analytics")

    await page.goto(`${BASE}/dashboard/folders`, { waitUntil: "networkidle" })
    await shoot(page, "22-folders")

    // Offline shell needs no auth and no server round-trip.
    const offlineContext = await browser.newContext({ viewport: MOBILE })
    const offlinePage = await offlineContext.newPage()
    await offlinePage.goto(`${BASE}/offline`, { waitUntil: "networkidle" })
    await shoot(offlinePage, "15-offline", { viewport: MOBILE, full: false })
    await offlineContext.close()

    await context.close()
  } finally {
    await browser.close()
  }

  console.log(`\nDone. Wrote screenshots to ${OUT_DIR}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
