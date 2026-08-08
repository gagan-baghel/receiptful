import type { Metadata } from "next"
import Link from "next/link"
import { Suspense } from "react"

import { AuthLayout } from "@/components/auth/auth-layout"
import { LoginForm } from "@/components/auth/login-form"
import { Skeleton } from "@/components/ui/skeleton"

export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in to your Receiptful workspace.",
}

export default function LoginPage() {
  return (
    <AuthLayout
      title="Welcome back"
      description="Sign in to pick up where you left off."
      footer={
        <>
          New to Receiptful?{" "}
          <Link
            href="/signup"
            className="font-medium text-foreground underline underline-offset-4"
          >
            Create an account
          </Link>
        </>
      }
    >
      <Suspense fallback={<Skeleton className="h-64 w-full" />}>
        <LoginForm />
      </Suspense>
    </AuthLayout>
  )
}
