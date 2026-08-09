import { mkdir } from "node:fs/promises"
import path from "node:path"
import { pathToFileURL } from "node:url"

const BASE = process.env.SCREENSHOT_BASE_URL ?? "http://localhost:3000"
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
  
  let authContext = null;
  try {
    const tempContext = await browser.newContext()
    const page = await tempContext.newPage()
    await page.goto(`${BASE}/signup`, { waitUntil: "networkidle" })
    await page.fill('input[name="name"]', 'Test User')
    const email = `test-${Date.now()}@example.com`
    await page.fill('input[name="email"]', email)
    await page.fill('input[name="workspace"]', 'Test Workspace')
    await page.fill('input[name="password"]', 'Password123A') // Matches rules
    await page.click('button[type="submit"]')
    await page.waitForURL('**/dashboard/welcome', { timeout: 15000 }).catch(() => {})
    
    // Save auth state
    const authState = await tempContext.storageState()
    authContext = authState
    await tempContext.close()
    console.log("Logged in successfully.")
  } catch (err) {
    console.log("Signup failed, falling back to without auth", err)
  }

  try {
    for (const shot of captures) {
      const context = await browser.newContext({
        viewport: shot.viewport,
        storageState: shot.auth ? authContext : undefined,
      })
      const page = await context.newPage()

      let target = shot.url
      if (shot.dynamic === "firstReceipt") {
        await page.goto(`${BASE}/dashboard/receipts`, { waitUntil: "networkidle" })
        const href = await page.locator('a[href*="/dashboard/receipts/"]').first().getAttribute("href").catch(() => null)
        target = href ?? "/dashboard/receipts"
      }

      if (!target) continue

      console.log(`  → ${shot.id}  ${target}`)
      await page.goto(`${BASE}${target}`, { waitUntil: "networkidle" })
      await page.waitForTimeout(1000) // Give UI more time

      const outPath = path.join(OUT_DIR, `${shot.id}.png`)
      await page.screenshot({ path: outPath, fullPage: shot.full })
      await context.close()
    }
  } finally {
    await browser.close()
  }
}

main().catch(console.error)
