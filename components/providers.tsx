"use client"

import { ConvexAuthNextjsProvider } from "@convex-dev/auth/nextjs"
import { ConvexReactClient } from "convex/react"
import type { ReactNode } from "react"

import { ThemeProvider } from "@/components/theme-provider"
import { Toaster } from "@/components/ui/sonner"
import { TooltipProvider } from "@/components/ui/tooltip"

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL

if (!convexUrl) {
  throw new Error(
    "NEXT_PUBLIC_CONVEX_URL is not set. Run `npx convex dev` to provision a deployment.",
  )
}

const convex = new ConvexReactClient(convexUrl, {
  // Keeps the UI responsive on flaky connections instead of hanging silently.
  unsavedChangesWarning: false,
})

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ConvexAuthNextjsProvider client={convex}>
      <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
        <TooltipProvider delayDuration={200}>
          {children}
          <Toaster />
        </TooltipProvider>
      </ThemeProvider>
    </ConvexAuthNextjsProvider>
  )
}
