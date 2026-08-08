"use client"

import { useAuthActions } from "@convex-dev/auth/react"
import { useMutation } from "convex/react"
import { Check, Eye, EyeOff, Loader2, X } from "lucide-react"
import { useRouter, useSearchParams } from "next/navigation"
import { useMemo, useState, type FormEvent } from "react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { api } from "@/convex/_generated/api"
import { errorMessage } from "@/lib/errors"
import { cn } from "@/lib/utils"

const RULES = [
  { label: "At least 8 characters", test: (value: string) => value.length >= 8 },
  {
    label: "Upper and lowercase letters",
    test: (value: string) => /[a-z]/.test(value) && /[A-Z]/.test(value),
  },
  { label: "At least one number", test: (value: string) => /[0-9]/.test(value) },
]

export function SignupForm() {
  const { signIn } = useAuthActions()
  const renameWorkspace = useMutation(api.workspaces.renameActive)
  const router = useRouter()
  const searchParams = useSearchParams()

  const [name, setName] = useState("")
  const [email, setEmail] = useState(searchParams.get("email") ?? "")
  const [password, setPassword] = useState("")
  const [workspaceName, setWorkspaceName] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const checks = useMemo(
    () => RULES.map((rule) => ({ ...rule, passed: rule.test(password) })),
    [password],
  )
  const passwordValid = checks.every((check) => check.passed)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)

    if (!name.trim()) {
      setError("Tell us your name so your team knows who's who.")
      return
    }
    if (!passwordValid) {
      setError("Choose a password that meets all three requirements.")
      return
    }

    setPending(true)
    try {
      await signIn("password", {
        email: email.trim().toLowerCase(),
        password,
        name: name.trim(),
        flow: "signUp",
      })
    } catch (caught) {
      setError(errorMessage(caught, "We couldn't create your account. Please try again."))
      setPending(false)
      return
    }

    // Sign-up creates a personal workspace; apply the chosen name now that the
    // session exists. A failure here is not worth blocking entry on — the
    // welcome screen lets them rename it too.
    const chosen = workspaceName.trim()
    if (chosen.length >= 2) {
      await renameWorkspace({ name: chosen }).catch(() => undefined)
    }

    router.push(searchParams.get("next") ?? "/dashboard/welcome")
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5" noValidate>
      {error ? (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <div className="space-y-2">
        <Label htmlFor="name">Your name</Label>
        <Input
          id="name"
          name="name"
          autoComplete="name"
          autoFocus
          required
          placeholder="Alex Morgan"
          value={name}
          onChange={(event) => setName(event.target.value)}
          disabled={pending}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="email">Work email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          placeholder="you@company.com"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          disabled={pending}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="workspace">
          Workspace name <span className="font-normal text-muted-foreground">(optional)</span>
        </Label>
        <Input
          id="workspace"
          name="workspace"
          placeholder="Morgan Design Studio"
          value={workspaceName}
          onChange={(event) => setWorkspaceName(event.target.value)}
          disabled={pending}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="password">Password</Label>
        <div className="relative">
          <Input
            id="password"
            name="password"
            type={showPassword ? "text" : "password"}
            autoComplete="new-password"
            required
            placeholder="Create a password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            disabled={pending}
            className="pr-10"
            aria-describedby="password-rules"
          />
          <button
            type="button"
            onClick={() => setShowPassword((value) => !value)}
            className="absolute right-0 top-0 flex h-full w-10 items-center justify-center rounded-r-md text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={showPassword ? "Hide password" : "Show password"}
          >
            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>

        <ul id="password-rules" className="space-y-1 pt-1">
          {checks.map((check) => (
            <li
              key={check.label}
              className={cn(
                "flex items-center gap-1.5 text-xs",
                check.passed ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground",
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
            Creating your workspace
          </>
        ) : (
          "Create account"
        )}
      </Button>

      <p className="text-xs leading-relaxed text-muted-foreground">
        By creating an account you agree to our{" "}
        <a href="/help#terms" className="underline underline-offset-2 hover:text-foreground">
          Terms
        </a>{" "}
        and{" "}
        <a href="/help#privacy" className="underline underline-offset-2 hover:text-foreground">
          Privacy Policy
        </a>
        .
      </p>
    </form>
  )
}
