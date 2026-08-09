import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

/**
 * Liveness probe. Returns the bare process shape with no secrets, no DB
 * connection, and no auth checks — meant for container orchestrators and
 * uptime monitors. Pair with a deeper `/api/ready` (out of scope) for checks
 * that exercise Convex, OCR, and email.
 */
export function GET() {
  return NextResponse.json(
    {
      status: "ok",
      service: "receiptful-web",
      version: process.env.npm_package_version ?? "0.0.0",
      timestamp: new Date().toISOString(),
    },
    {
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    },
  )
}
