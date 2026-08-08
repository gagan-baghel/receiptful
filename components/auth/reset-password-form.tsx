"use client"

import { useAuthActions } from "@convex-dev/auth/react"
import { ArrowLeft, Check, Loader2, MailCheck, X } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useMemo, useState, type FormEvent } from "react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { errorCode, errorMessage } from "@/lib/errors"
import { cn } from "@/lib/utils"

const RULES = [
  { label: "At least 8 characters", test: (value: string) => value.length >= 8 },
  {
    label: "Upper and lowercase letters",
    test: (value: string) => /[a-z]/.test(value) && /[A-Z]/.test(value),
  },
  { label: "At least one number", test: (value: string) => /[0-9]/.test(value) },
]

export function ResetPasswordForm() {
  const { signIn } = useAuthActions()
  const router = useRouter()

  const [step, setStep] = useState<"request" | "verify">("request")
  const [email, setEmail] = useState("")
  const [code, setCode] = useState("")
  const [password, setPassword] = useState("")
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const checks = useMemo(
    () => RULES.map((rule) => ({ ...rule, passed: rule.test(password) })),
    [password],
  )
  const passwordValid = checks.every((check) => check.passed)

  async function requestCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setNotice(null)
    setPending(true)

    try {
      await signIn("password", { email: email.trim().toLowerCase(), flow: "reset" })
      setStep("verify")
      setNotice(`We sent an 8-digit code to ${email.trim().toLowerCase()}.`)
    } catch (caught) {
      // A missing email integration is an operator problem, not a user error —
      // say so plainly instead of showing a generic failure.
      setError(
        errorCode(caught) === "EMAIL_NOT_CONFIGURED"
          ? errorMessage(caught)
          : errorMessage(
              caught,
              "We couldn't start a password reset for that address. Check the email and try again.",
            ),
      )
    } finally {
      setPending(false)
    }
  }

  async function submitNewPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)

    if (!passwordValid) {
      setError("Choose a password that meets all three requirements.")
      return
    }

    setPending(true)
    try {
      await signIn("password", {
        email: email.trim().toLowerCase(),
        code: code.trim(),
        newPassword: password,
        flow: "reset-verification",
      })
      router.push("/dashboard")
    } catch (caught) {
      setError(
        errorMessage(caught, "That code didn't work. Request a new one and try again."),
      )
      setPending(false)
    }
  }

  if (step === "verify") {
    return (
      <form onSubmit={submitNewPassword} className="space-y-5" noValidate>
        {notice ? (
          <Alert>
            <MailCheck className="h-4 w-4" />
            <AlertDescription>{notice}</AlertDescription>
          </Alert>
        ) : null}

        {error ? (
          <Alert variant="destructive" role="alert">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        <div className="space-y-2">
          <Label htmlFor="code">Reset code</Label>
          <Input
            id="code"
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            autoFocus
            required
            placeholder="12345678"
            value={code}
            onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 8))}
            disabled={pending}
            className="text-center text-lg tracking-[0.3em] font-numeric"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="new-password">New password</Label>
          <Input
            id="new-password"
            name="new-password"
            type="password"
            autoComplete="new-password"
            required
            placeholder="Create a new password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            disabled={pending}
          />
          <ul className="space-y-1 pt-1">
            {checks.map((check) => (
              <li
                key={check.label}
                className={cn(
                  "flex items-center gap-1.5 text-xs",
                  check.passed
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-muted-foreground",
                )}
              >
                {check.passed ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
                {check.label}
              </li>
            ))}
          </ul>
        </div>

        <Button type="submit" className="w-full" disabled={pending}>
          {pending ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Updating password
            </>
          ) : (
            "Set new password"
          )}
        </Button>

        <Button
          type="button"
          variant="ghost"
          className="w-full"
          onClick={() => {
            setStep("request")
            setCode("")
            setError(null)
            setNotice(null)
          }}
          disabled={pending}
        >
          <ArrowLeft className="h-4 w-4" />
          Use a different email
        </Button>
      </form>
    )
  }

  return (
    <form onSubmit={requestCode} className="space-y-5" noValidate>
      {error ? (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <div className="space-y-2">
        <Label htmlFor="reset-email">Email</Label>
        <Input
          id="reset-email"
          name="email"
          type="email"
          autoComplete="email"
          autoFocus
          required
          placeholder="you@company.com"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          disabled={pending}
        />
      </div>

      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Sending code
          </>
        ) : (
          "Send reset code"
        )}
      </Button>

      <Link
        href="/login"
        className="flex items-center justify-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to sign in
      </Link>
    </form>
  )
}
