"use client"

import { ConvexAuthNextjsProvider } from "@convex-dev/auth/nextjs"
import { ConvexReactClient } from "convex/react"
import { useMemo, type ReactNode } from "react"

import { ThemeProvider } from "@/components/theme-provider"
import { Toaster } from "@/components/ui/sonner"
import { TooltipProvider } from "@/components/ui/tooltip"

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL

/**
 * Built lazily and never at module scope. Throwing during import took down the
 * whole client bundle — including static pages like `/offline` that need no
 * backend at all — and gave the user a blank screen instead of a message.
 */
function createClient(url: string) {
  return new ConvexReactClient(url, {
    // Keeps the UI responsive on flaky connections instead of hanging silently.
    unsavedChangesWarning: false,
  })
}

let client: ConvexReactClient | null = null

function MisconfiguredNotice() {
  return (
    <main
      id="main"
      className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-3 px-6 text-center"
    >
      <h1 className="text-xl font-semibold tracking-tight">Backend not configured</h1>
      <p className="text-sm leading-relaxed text-muted-foreground">
        <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
          NEXT_PUBLIC_CONVEX_URL
        </code>{" "}
        is not set, so the app has nowhere to load data from. Run{" "}
        <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">npx convex dev</code>{" "}
        locally, or set the variable on the host for a deployment.
      </p>
    </main>
  )
}

export function Providers({ children }: { children: ReactNode }) {
  const convex = useMemo(() => {
    if (!convexUrl) return null
    if (!client) client = createClient(convexUrl)
    return client
  }, [])

  const body = convex ? (
    <ConvexAuthNextjsProvider client={convex}>{children}</ConvexAuthNextjsProvider>
  ) : (
    <MisconfiguredNotice />
  )

  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <TooltipProvider delayDuration={200}>
        {body}
        <Toaster />
      </TooltipProvider>
    </ThemeProvider>
  )
}
