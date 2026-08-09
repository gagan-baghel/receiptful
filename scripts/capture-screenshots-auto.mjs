import { mkdir } from "node:fs/promises"
import path from "node:path"
import { pathToFileURL } from "node:url"

const BASE = process.env.SCREENSHOT_BASE_URL ?? "http://localhost:3001"
const OUT_DIR = path.resolve(process.cwd(), "public/screenshots")

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
  { id: "16-dashboard-home", url: "/dashboard", viewport: { width: 1440, height: 900 }, full: true, auth: true },
  { id: "17-budgets", url: "/dashboard/budgets", viewport: { width: 1440, height: 900 }, full: true, auth: true },
  { id: "18-billing", url: "/dashboard/billing", viewport: { width: 1440, height: 900 }, full: true, auth: true },
  { id: "19-settings", url: "/dashboard/settings", viewport: { width: 1440, height: 900 }, full: true, auth: true },
  { id: "20-trash", url: "/dashboard/trash", viewport: { width: 1440, height: 900 }, full: true, auth: true },
  { id: "21-analytics", url: "/dashboard/analytics", viewport: { width: 1440, height: 900 }, full: true, auth: true },
  { id: "22-folders", url: "/dashboard/folders", viewport: { width: 1440, height: 900 }, full: true, auth: true },
]

async function loadPlaywright() {
  try {
    return await import("playwright")
  } catch {
    console.error("playwright not installed.")
    process.exit(1)
  }
}

async function main() {
  const { chromium } = await loadPlaywright()
  await mkdir(OUT_DIR, { recursive: true })
  
  const browser = await chromium.launch()
  
  try {
    const context = await browser.newContext()
    const page = await context.newPage()

    console.log("Signing up...")
    await page.goto(`${BASE}/signup`, { waitUntil: "networkidle" })
    await page.fill('input[name="name"]', 'Test User')
    const email = `test-${Date.now()}@example.com`
    await page.fill('input[name="email"]', email)
    await page.fill('input[name="workspace"]', 'Test Workspace')
    await page.fill('input[name="password"]', 'Password123A')
    
    console.log("Waiting 5s for React hydration...")
    await page.waitForTimeout(5000)
    await page.click('button[type="submit"]')
    
    await page.waitForURL('**/dashboard/welcome', { timeout: 30000 })
    console.log("Logged in successfully. Current URL:", page.url())

    for (const shot of captures) {
      // Create a fresh page for each shot to ensure a clean state (but same context for auth)
      const shotPage = await context.newPage()
      
      if (shot.viewport) {
        await shotPage.setViewportSize(shot.viewport)
      }

      let target = shot.url
      if (shot.dynamic === "firstReceipt") {
        await shotPage.goto(`${BASE}/dashboard/receipts`, { waitUntil: "networkidle" })
        const href = await shotPage.locator('a[href*="/dashboard/receipts/"]').first().getAttribute("href").catch(() => null)
        target = href ?? "/dashboard/receipts"
      }

      if (!target) continue

      console.log(`  → ${shot.id}  ${target}`)
      await shotPage.goto(`${BASE}${target}`, { waitUntil: "networkidle" })
      
      // Wait until all skeleton loaders (animate-pulse) disappear.
      await shotPage.waitForSelector('.animate-pulse', { state: 'hidden', timeout: 30000 }).catch(() => {
        console.log(`    Timeout waiting for skeletons to hide on ${target}`)
      })
      await shotPage.waitForTimeout(1000)

      const outPath = path.join(OUT_DIR, `${shot.id}.png`)
      await shotPage.screenshot({ path: outPath, fullPage: shot.full })
      await shotPage.close()
    }
    
    await context.close()
  } finally {
    await browser.close()
  }
}

main().catch(console.error)
