"use client"

import { useEffect } from "react"

import { ErrorState } from "@/components/common/states"
import { errorMessage } from "@/lib/errors"

/**
 * Route-level boundary. Without one, any thrown ConvexError — opening a deleted
 * report, a receipt id that no longer exists, a resource in another workspace —
 * unmounts the tree to a blank page with no way back.
 */
export default function RouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error("Route error", error)
  }, [error])

  return (
    <main id="main" className="mx-auto flex min-h-dvh max-w-xl items-center px-6">
      <ErrorState
        title="This page didn't load"
        description={errorMessage(error, "Something went wrong loading this page.")}
        onRetry={reset}
      />
    </main>
  )
}
