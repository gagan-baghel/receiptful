"use client"

import { useEffect } from "react"

import { ErrorState } from "@/components/common/states"
import { errorMessage } from "@/lib/errors"

/**
 * Keeps the dashboard shell (navigation, workspace switcher) mounted when a
 * single screen fails, so a bad receipt id costs the user one panel rather than
 * the whole app.
 */
export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error("Dashboard error", error)
  }, [error])

  return (
    <div className="p-4 sm:p-6">
      <ErrorState
        title="This screen didn't load"
        description={errorMessage(error, "Something went wrong loading this screen.")}
        onRetry={reset}
      />
    </div>
  )
}
