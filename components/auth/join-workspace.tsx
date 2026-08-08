"use client"

import { useMutation, useQuery } from "convex/react"
import { AlertTriangle, Building2, Check, Loader2 } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { toast } from "sonner"

import { AuthLayout } from "@/components/auth/auth-layout"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { api } from "@/convex/_generated/api"
import { errorMessage } from "@/lib/errors"
import { ROLE_DESCRIPTIONS, ROLE_LABELS } from "@/lib/format"

export function JoinWorkspace({ token }: { token: string }) {
  const invite = useQuery(api.team.previewInvite, { token })
  const session = useQuery(api.users.me)
  const acceptInvite = useMutation(api.team.acceptInvite)
  const router = useRouter()

  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (invite === undefined || session === undefined) {
    return (
      <AuthLayout title="Checking your invitation" description="One moment.">
        <div className="space-y-3">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      </AuthLayout>
    )
  }

  if (invite.status !== "valid") {
    const messages = {
      invalid: "This invitation link isn't valid. Ask for a new one.",
      expired: "This invitation has expired. Ask your admin to send a fresh one.",
      accepted: "This invitation has already been used.",
    } as const

    return (
      <AuthLayout
        title="Invitation unavailable"
        description={messages[invite.status]}
        footer={
          <Link
            href="/dashboard"
            className="font-medium text-foreground underline underline-offset-4"
          >
            Go to your dashboard
          </Link>
        }
      >
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{messages[invite.status]}</AlertDescription>
        </Alert>
      </AuthLayout>
    )
  }

  const signedInAsWrongAccount =
    session !== null && session.user.email.toLowerCase() !== invite.email.toLowerCase()

  return (
    <AuthLayout
      title={`Join ${invite.workspaceName}`}
      description={`${invite.inviterName || "A teammate"} invited you to collaborate on expenses.`}
    >
      <div className="space-y-5">
        {error ? (
          <Alert variant="destructive" role="alert">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        <div className="rounded-xl border p-4">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Building2 className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{invite.workspaceName}</p>
              <p className="text-xs text-muted-foreground">
                Joining as {ROLE_LABELS[invite.role]}
              </p>
            </div>
          </div>
          <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
            {ROLE_DESCRIPTIONS[invite.role]}
          </p>
        </div>

        {session === null ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Sign in as <span className="font-medium text-foreground">{invite.email}</span> to
              accept, or create an account with that address.
            </p>
            <Button asChild className="w-full">
              <Link href={`/login?next=${encodeURIComponent(`/join/${token}`)}`}>
                Sign in to accept
              </Link>
            </Button>
            <Button asChild variant="outline" className="w-full">
              <Link href={`/signup?next=${encodeURIComponent(`/join/${token}`)}`}>
                Create an account
              </Link>
            </Button>
          </div>
        ) : signedInAsWrongAccount ? (
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              This invitation was sent to <strong>{invite.email}</strong>, but you&rsquo;re signed
              in as <strong>{session.user.email}</strong>. Sign out and sign back in with the
              invited address.
            </AlertDescription>
          </Alert>
        ) : (
          <Button
            className="w-full"
            disabled={pending}
            onClick={async () => {
              setPending(true)
              setError(null)
              try {
                await acceptInvite({ token })
                toast.success(`You've joined ${invite.workspaceName}`)
                router.push("/dashboard")
              } catch (caught) {
                setError(errorMessage(caught, "We couldn't accept this invitation."))
                setPending(false)
              }
            }}
          >
            {pending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Joining
              </>
            ) : (
              <>
                <Check className="h-4 w-4" />
                Accept invitation
              </>
            )}
          </Button>
        )}
      </div>
    </AuthLayout>
  )
}
