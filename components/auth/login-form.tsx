"use client"

import { useAuthActions } from "@convex-dev/auth/react"
import { useMutation, useQuery } from "convex/react"
import { Eye, EyeOff, Loader2 } from "lucide-react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { useEffect, useState, type FormEvent } from "react"

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

  // Slows repeated failures down and tells the user what is happening. This is
  // a UX throttle, not an access control — see lib/rateLimit.ts.
  const normalizedEmail = email.trim().toLowerCase()
  const rateState = useQuery(
    api.rateLimits.check,
    normalizedEmail.includes("@") ? { identifier: normalizedEmail, flow: "signIn" } : "skip",
  ) ?? emptyRateLimitState()
  const recordFailure = useMutation(api.rateLimits.recordFailure)
  const recordSuccess = useMutation(api.rateLimits.recordSuccess)

  // Counts down locally so the button explains itself instead of just sitting
  // disabled with no indication of how long.
  const [cooldown, setCooldown] = useState(0)
  useEffect(() => {
    if (rateState.retryAfterSeconds <= 0) return
    setCooldown(rateState.retryAfterSeconds)
  }, [rateState.retryAfterSeconds])

  useEffect(() => {
    if (cooldown <= 0) return
    const timer = setInterval(() => setCooldown((value) => Math.max(0, value - 1)), 1000)
    return () => clearInterval(timer)
  }, [cooldown])

  const waiting = cooldown > 0

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)

    if (!email.trim() || !password) {
      setError("Enter your email and password.")
      return
    }

    if (waiting) {
      setError(`Too many failed attempts. Try again in ${cooldown}s.`)
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
      if (next?.retryAfterSeconds) setCooldown(next.retryAfterSeconds)
      const fallback =
        next?.throttled
          ? `That didn't match an account. Wait ${next.retryAfterSeconds}s before trying again.`
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

      {rateState.warning && !waiting ? (
        <Alert role="status">
          <AlertDescription>
            A few attempts haven&apos;t worked. Double-check your email and password, or{" "}
            <Link href="/forgot-password" className="font-medium underline underline-offset-4">
              reset your password
            </Link>
            .
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
          disabled={pending}
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
            disabled={pending}
            className="pr-10"
          />
          <button
            type="button"
            onClick={() => setShowPassword((value) => !value)}
            disabled={pending}
            className="absolute right-0 top-0 flex h-full w-10 items-center justify-center rounded-r-md text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
            aria-label={showPassword ? "Hide password" : "Show password"}
          >
            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
      </div>

      <Button type="submit" className="w-full" disabled={pending || waiting}>
        {pending ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Signing in
          </>
        ) : waiting ? (
          `Try again in ${cooldown}s`
        ) : (
          "Sign in"
        )}
      </Button>
    </form>
  )
}
