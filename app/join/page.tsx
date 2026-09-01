"use client"

import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { Suspense } from "react"

import { AuthLayout } from "@/components/auth/auth-layout"
import { JoinWorkspace } from "@/components/auth/join-workspace"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Skeleton } from "@/components/ui/skeleton"

/**
 * `/join?token=…` and `/join/<token>` are the same flow — older invite links
 * use the query form. Both render one component so the two cannot drift.
 */
function JoinFromQuery() {
  const token = useSearchParams().get("token")?.trim() ?? ""

  if (!token) {
    return (
      <AuthLayout
        title="No invitation token"
        description="This link is missing the token that identifies your invitation."
        footer={
          <Link
            href="/login"
            className="font-medium text-foreground underline underline-offset-4"
          >
            Sign in instead
          </Link>
        }
      >
        <Alert variant="destructive">
          <AlertTitle>Nothing to join</AlertTitle>
          <AlertDescription>
            Ask whoever invited you to send the full link again — it should end in a long
            code.
          </AlertDescription>
        </Alert>
      </AuthLayout>
    )
  }

  return <JoinWorkspace token={token} />
}

export default function JoinPage() {
  return (
    <Suspense
      fallback={
        <AuthLayout title="Checking your invitation" description="One moment.">
          <div className="space-y-3">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        </AuthLayout>
      }
    >
      <JoinFromQuery />
    </Suspense>
  )
}
