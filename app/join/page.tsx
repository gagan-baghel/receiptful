"use client"

import { useAuthActions } from "@convex-dev/auth/react"
import { useMutation, useQuery } from "convex/react"
import {
  AlertCircle,
  Building2,
  Check,
  CheckCircle2,
  Clock,
  LogIn,
  Receipt,
  Shield,
  UserPlus,
  X,
} from "lucide-react"
import type { Metadata } from "next"
import Image from "next/image"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { Suspense, useState } from "react"
import { toast } from "sonner"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { api } from "@/convex/_generated/api"
import { errorMessage } from "@/lib/errors"
import { ROLE_LABELS, ROLE_DESCRIPTIONS } from "@/lib/format"

// ---------------------------------------------------------------------------
// Inner component — needs Suspense because of useSearchParams
// ---------------------------------------------------------------------------

function JoinInner() {
  const searchParams = useSearchParams()
  const token = searchParams.get("token") ?? ""
  const router = useRouter()

  const invite = useQuery(api.team.previewInvite, token ? { token } : "skip")
  const me = useQuery(api.users.me)
  const acceptInvite = useMutation(api.team.acceptInvite)
  const [pending, setPending] = useState(false)

  // Loading
  if (invite === undefined || me === undefined) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    )
  }

  // No token in URL
  if (!token) {
    return (
      <Alert variant="destructive">
        <X className="h-4 w-4" />
        <AlertTitle>No invite token</AlertTitle>
        <AlertDescription>
          This link is missing its token. Ask the person who invited you to
          send you the full link.
        </AlertDescription>
      </Alert>
    )
  }

  // Invite states that don't require sign-in to understand
  if (invite.status === "invalid") {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3 rounded-xl border bg-card p-5">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-rose-500/10 text-rose-500">
            <X className="h-5 w-5" />
          </span>
          <div>
            <p className="font-medium">Invite not found</p>
            <p className="mt-0.5 text-sm text-muted-foreground">
              This invite link is invalid or has been revoked.
            </p>
          </div>
        </div>
        <Button asChild variant="outline" className="w-full">
          <Link href="/">Go to Receiptful</Link>
        </Button>
      </div>
    )
  }

  if (invite.status === "expired") {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3 rounded-xl border bg-card p-5">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-500/10 text-amber-500">
            <Clock className="h-5 w-5" />
          </span>
          <div>
            <p className="font-medium">Invite expired</p>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Invite links expire after 7 days. Ask the workspace owner to send
              a fresh one.
            </p>
          </div>
        </div>
        <Button asChild variant="outline" className="w-full">
          <Link href="/">Go to Receiptful</Link>
        </Button>
      </div>
    )
  }

  if (invite.status === "accepted") {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3 rounded-xl border bg-card p-5">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-green-500/10 text-green-600">
            <CheckCircle2 className="h-5 w-5" />
          </span>
          <div>
            <p className="font-medium">Already accepted</p>
            <p className="mt-0.5 text-sm text-muted-foreground">
              This invite has already been used. Sign in to access the
              workspace.
            </p>
          </div>
        </div>
        <Button asChild className="w-full">
          <Link href="/login">Sign in</Link>
        </Button>
      </div>
    )
  }

  // invite.status === "valid"
  const role = invite.role as string

  async function handleAccept() {
    setPending(true)
    try {
      await acceptInvite({ token })
      toast.success(`You've joined ${invite!.workspaceName}`)
      router.push("/dashboard")
    } catch (caught) {
      toast.error(errorMessage(caught))
      setPending(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Workspace card */}
      <div className="rounded-xl border bg-card p-5">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Building2 className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <p className="truncate font-semibold">{invite.workspaceName}</p>
            {invite.inviterName ? (
              <p className="mt-0.5 truncate text-sm text-muted-foreground">
                Invited by {invite.inviterName}
              </p>
            ) : null}
          </div>
        </div>

        <dl className="mt-4 divide-y rounded-lg border text-sm">
          <div className="flex items-center justify-between px-4 py-3">
            <dt className="text-muted-foreground">Invited email</dt>
            <dd className="font-medium">{invite.email}</dd>
          </div>
          <div className="flex items-center justify-between px-4 py-3">
            <dt className="text-muted-foreground">Role</dt>
            <dd className="font-medium capitalize">
              {ROLE_LABELS[role] ?? role}
            </dd>
          </div>
          {ROLE_DESCRIPTIONS[role] ? (
            <div className="px-4 py-3 text-xs text-muted-foreground">
              {ROLE_DESCRIPTIONS[role]}
            </div>
          ) : null}
        </dl>
      </div>

      {/* Not logged in */}
      {me === null ? (
        <div className="space-y-3">
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Sign in to accept</AlertTitle>
            <AlertDescription>
              You need to be signed in as{" "}
              <strong className="font-medium">{invite.email}</strong> to accept
              this invite.
            </AlertDescription>
          </Alert>

          <Button asChild className="w-full">
            <Link
              href={`/login?next=${encodeURIComponent(`/join?token=${token}`)}`}
            >
              <LogIn className="h-4 w-4" />
              Sign in
            </Link>
          </Button>
          <Button asChild variant="outline" className="w-full">
            <Link
              href={`/signup?next=${encodeURIComponent(`/join?token=${token}`)}&email=${encodeURIComponent(invite.email)}`}
            >
              <UserPlus className="h-4 w-4" />
              Create account
            </Link>
          </Button>
        </div>
      ) : (
        /* Logged in — email mismatch warning */
        <div className="space-y-3">
          {me.user.email.toLowerCase() !== invite.email.toLowerCase() ? (
            <Alert variant="destructive">
              <Shield className="h-4 w-4" />
              <AlertTitle>Wrong account</AlertTitle>
              <AlertDescription>
                You're signed in as <strong>{me.user.email}</strong>, but this
                invite was sent to <strong>{invite.email}</strong>. Sign out
                and sign in with the correct account.
              </AlertDescription>
            </Alert>
          ) : null}

          <Button
            className="w-full"
            disabled={
              pending ||
              me.user.email.toLowerCase() !== invite.email.toLowerCase()
            }
            onClick={handleAccept}
          >
            {pending ? (
              <>
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground" />
                Joining…
              </>
            ) : (
              <>
                <Check className="h-4 w-4" />
                Accept &amp; join {invite.workspaceName}
              </>
            )}
          </Button>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Page shell
// ---------------------------------------------------------------------------

export default function JoinPage() {
  return (
    <div className="grid min-h-dvh lg:grid-cols-2">
      {/* Left: invite card */}
      <div className="flex flex-col px-6 py-10 sm:px-10 lg:px-16">
        <Link
          href="/"
          className="inline-flex w-fit items-center gap-2.5 rounded-lg text-sm font-semibold tracking-tight focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <Image
            src="/logo.png"
            alt="Receiptful"
            width={32}
            height={32}
            className="h-8 w-8 rounded-lg object-contain"
            priority
          />
          <span>Receiptful</span>
        </Link>

        <main id="main" className="flex flex-1 items-center">
          <div className="w-full max-w-sm py-12">
            <h1 className="text-2xl font-semibold tracking-tight">
              You&apos;re invited
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground text-pretty">
              Someone has invited you to collaborate on Receiptful. Accept below
              to join their workspace.
            </p>
            <div className="mt-8">
              <Suspense
                fallback={
                  <div className="space-y-4">
                    <Skeleton className="h-36 w-full rounded-xl" />
                    <Skeleton className="h-10 w-full" />
                  </div>
                }
              >
                <JoinInner />
              </Suspense>
            </div>
          </div>
        </main>
      </div>

      {/* Right: hero panel */}
      <aside className="relative hidden overflow-hidden bg-muted/40 lg:block">
        <div
          aria-hidden
          className="absolute inset-0 bg-[radial-gradient(60%_50%_at_50%_0%,hsl(var(--primary)/0.14),transparent_70%)]"
        />
        <div className="relative flex h-full flex-col justify-center px-16">
          <blockquote className="max-w-md">
            <p className="text-xl font-medium leading-relaxed tracking-tight text-pretty">
              One workspace. Every receipt. Zero guesswork.
            </p>
          </blockquote>
          <ul className="mt-10 max-w-md space-y-3">
            {[
              "Receipts captured and categorised automatically",
              "Team-wide spending at a glance",
              "Approval workflows built in",
              "Tax-ready reports in one click",
            ].map((item) => (
              <li
                key={item}
                className="flex items-start gap-3 text-sm text-muted-foreground"
              >
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <Check className="h-3 w-3" />
                </span>
                {item}
              </li>
            ))}
          </ul>
        </div>
      </aside>
    </div>
  )
}
