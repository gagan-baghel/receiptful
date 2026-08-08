import type { Metadata } from "next"
import Link from "next/link"
import { Suspense } from "react"

import { AuthLayout } from "@/components/auth/auth-layout"
import { SignupForm } from "@/components/auth/signup-form"
import { Skeleton } from "@/components/ui/skeleton"

export const metadata: Metadata = {
  title: "Create account",
  description: "Start capturing receipts in under a minute.",
}

export default function SignupPage() {
  return (
    <AuthLayout
      title="Create your workspace"
      description="Free to start. No card required, and your first receipt takes about ten seconds."
      footer={
        <>
          Already have an account?{" "}
          <Link
            href="/login"
            className="font-medium text-foreground underline underline-offset-4"
          >
            Sign in
          </Link>
        </>
      }
    >
      <Suspense fallback={<Skeleton className="h-96 w-full" />}>
        <SignupForm />
      </Suspense>
    </AuthLayout>
  )
}
