"use client"

import { useAuthActions } from "@convex-dev/auth/react"
import { useMutation, useQuery } from "convex/react"
import { Eye, EyeOff, Loader2 } from "lucide-react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { useState, type FormEvent } from "react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { api } from "@/convex/_generated/api"
import { errorMessage } from "@/lib/errors"
import { emptyRateLimitState } from "@/lib/rateLimit"

export function LoginForm() {
  const { signIn } = useAuthActions()
  const router = useRouter()
  const searchParams = useSearchParams()

  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Throttle credential-stuffing by checking the counter before each submit.
  // A short identifier keeps the query cheap; an empty email is a no-op.
  const normalizedEmail = email.trim().toLowerCase()
  const rateState = useQuery(
    api.rateLimits.check,
    normalizedEmail ? { identifier: normalizedEmail, flow: "signIn" } : "skip",
  ) ?? emptyRateLimitState()
  const recordFailure = useMutation(api.rateLimits.recordFailure)
  const recordSuccess = useMutation(api.rateLimits.recordSuccess)

  const locked = !rateState.allowed
  const lockedForMinutes = Math.max(1, Math.ceil(rateState.retryAfterSeconds / 60))

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)

    if (!email.trim() || !password) {
      setError("Enter your email and password.")
      return
    }

    if (locked) {
      setError(
        `Too many failed attempts. Wait about ${lockedForMinutes} minute${
          lockedForMinutes === 1 ? "" : "s"
        } and try again.`,
      )
      return
    }

    setPending(true)
    try {
      await signIn("password", {
        email: email.trim().toLowerCase(),
        password,
        flow: "signIn",
      })
      await recordSuccess({
        identifier: email.trim().toLowerCase(),
        flow: "signIn",
      }).catch(() => undefined)
      router.push(searchParams.get("next") ?? "/dashboard")
    } catch (caught) {
      const next = await recordFailure({
        identifier: email.trim().toLowerCase(),
        flow: "signIn",
      }).catch(() => null)
      const fallback =
        next && !next.allowed
          ? `Too many failed attempts. Wait about ${Math.max(
              1,
              Math.ceil(next.retryAfterSeconds / 60),
            )} minute${Math.ceil(next.retryAfterSeconds / 60) === 1 ? "" : "s"} and try again.`
          : "We couldn't sign you in. Check your details and try again."
      setError(errorMessage(caught, fallback))
      setPending(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5" noValidate>
      {error ? (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {rateState.warning && !locked ? (
        <Alert role="status">
          <AlertDescription>
            A few attempts haven&apos;t worked. Double-check your email and password — too many
            failures will lock the form for 15 minutes.
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          autoFocus
          required
          placeholder="you@company.com"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          disabled={pending || locked}
        />
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="password">Password</Label>
          <Link
            href="/forgot-password"
            className="text-sm font-medium text-primary underline-offset-4 hover:underline"
          >
            Forgot password?
          </Link>
        </div>
        <div className="relative">
          <Input
            id="password"
            name="password"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            required
            placeholder="Enter your password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            disabled={pending || locked}
            className="pr-10"
          />
          <button
            type="button"
            onClick={() => setShowPassword((value) => !value)}
            disabled={pending || locked}
            className="absolute right-0 top-0 flex h-full w-10 items-center justify-center rounded-r-md text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
            aria-label={showPassword ? "Hide password" : "Show password"}
          >
            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
      </div>

      <Button type="submit" className="w-full" disabled={pending || locked}>
        {pending ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Signing in
          </>
        ) : locked ? (
          `Locked — try again in ${lockedForMinutes} min`
        ) : (
          "Sign in"
        )}
      </Button>
    </form>
  )
}
