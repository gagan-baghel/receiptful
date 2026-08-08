import type { Metadata } from "next"

import { AuthLayout } from "@/components/auth/auth-layout"
import { ResetPasswordForm } from "@/components/auth/reset-password-form"

export const metadata: Metadata = {
  title: "Reset password",
  description: "Reset the password for your Receiptful account.",
}

export default function ForgotPasswordPage() {
  return (
    <AuthLayout
      title="Reset your password"
      description="Enter your email and we'll send you a code to set a new password."
    >
      <ResetPasswordForm />
    </AuthLayout>
  )
}
