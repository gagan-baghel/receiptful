"use client"

import { useMutation, useQuery } from "convex/react"
import { ArrowRight, Camera, Check, FolderOpen, Target, Users } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState } from "react"

import { useCapture } from "@/components/capture/capture-provider"
import { Spinner } from "@/components/common/states"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { api } from "@/convex/_generated/api"
import { errorMessage } from "@/lib/errors"
import { cn } from "@/lib/utils"

const CURRENCIES = ["USD", "EUR", "GBP", "INR", "AED", "CAD", "AUD", "JPY", "SGD"]

const NEXT_STEPS = [
  {
    href: "/dashboard/categories",
    icon: FolderOpen,
    title: "Tune your categories",
    body: "Fourteen categories are ready to go. Adjust their tax treatment or add keywords so receipts file themselves.",
  },
  {
    href: "/dashboard/budgets",
    icon: Target,
    title: "Set a budget",
    body: "Pick a monthly ceiling and we'll warn you before you cross it, not after.",
  },
  {
    href: "/dashboard/team",
    icon: Users,
    title: "Invite your team",
    body: "Give people the access they need — from view-only to full admin.",
  },
]

export function WelcomeScreen() {
  const session = useQuery(api.users.me)
  const updateWorkspace = useMutation(api.workspaces.update)
  const completeOnboarding = useMutation(api.users.completeOnboarding)
  const capture = useCapture()
  const router = useRouter()

  const [name, setName] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (session === undefined || !session?.activeWorkspace) {
    return <Spinner label="Setting up your workspace" />
  }

  const workspace = session.activeWorkspace
  const firstName = session.user.name.split(" ")[0] || "there"

  return (
    <div className="mx-auto max-w-2xl space-y-8 py-4">
      <header>
        <p className="text-sm font-medium text-primary">Welcome to Receiptful</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-balance sm:text-3xl">
          You&rsquo;re set up, {firstName}.
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground text-pretty">
          Your workspace is ready with categories, folders and tags already in place. Add a
          receipt and everything downstream fills itself in.
        </p>
      </header>

      <section className="rounded-xl border bg-card p-5">
        <h2 className="text-sm font-semibold">Confirm the basics</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="welcome-workspace">Workspace name</Label>
            <Input
              id="welcome-workspace"
              value={name ?? workspace.name}
              onChange={(event) => setName(event.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Base currency</Label>
            <Select
              value={workspace.baseCurrency}
              onValueChange={async (value) => {
                await updateWorkspace({ workspaceId: workspace._id, baseCurrency: value })
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CURRENCIES.map((code) => (
                  <SelectItem key={code} value={code}>
                    {code}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Totals and reports roll up into this currency.
            </p>
          </div>
        </div>

        {error ? <p className="mt-3 text-sm text-destructive">{error}</p> : null}

        <Button
          className="mt-4"
          disabled={saving}
          onClick={async () => {
            setSaving(true)
            setError(null)
            try {
              if (name !== null && name.trim() && name !== workspace.name) {
                await updateWorkspace({ workspaceId: workspace._id, name: name.trim() })
              }
              await completeOnboarding()
              capture.open()
            } catch (caught) {
              setError(errorMessage(caught))
            } finally {
              setSaving(false)
            }
          }}
        >
          <Camera className="h-4 w-4" />
          Save and add my first receipt
        </Button>
      </section>

      <section>
        <h2 className="text-sm font-semibold">Then, when you have a minute</h2>
        <ul className="mt-3 space-y-2">
          {NEXT_STEPS.map((step) => (
            <li key={step.href}>
              <Link
                href={step.href}
                className={cn(
                  "flex items-start gap-3 rounded-xl border bg-card p-4 transition-colors",
                  "hover:border-foreground/20 hover:bg-accent/40",
                )}
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <step.icon className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">{step.title}</span>
                  <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">
                    {step.body}
                  </span>
                </span>
                <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <div className="flex items-center justify-between border-t pt-5">
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Check className="h-3.5 w-3.5 text-primary" />
          Workspace created with 14 categories, 3 folders and 5 tags
        </p>
        <Button
          variant="ghost"
          size="sm"
          onClick={async () => {
            await completeOnboarding()
            router.push("/dashboard")
          }}
        >
          Skip for now
        </Button>
      </div>
    </div>
  )
}
