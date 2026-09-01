"use client"

import { useAuthActions } from "@convex-dev/auth/react"
import { useMutation, useQuery } from "convex/react"
import {
  ArrowLeft,
  Check,
  CheckSquare,
  Copy,
  CreditCard,
  Download,
  HardDrive,
  Link2,
  LogOut,
  Send,
  Shield,
  Trash2,
  UserPlus,
  Users,
  X,
} from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { toast } from "sonner"

import { confirmDialog } from "@/components/common/confirm"
import { PageHeader, SectionHeader } from "@/components/common/page-header"
import { EmptyState, ListSkeleton, Spinner } from "@/components/common/states"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Progress } from "@/components/ui/progress"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { errorMessage } from "@/lib/errors"
import {
  formatBytes,
  formatDateTime,
  formatMoney,
  formatRelative,
  initials,
  ROLE_DESCRIPTIONS,
  ROLE_LABELS,
} from "@/lib/format"

const ASSIGNABLE_ROLES = ["admin", "manager", "member", "viewer"] as const
const SUPPORTED_CURRENCIES = ["USD", "EUR", "GBP", "INR", "AED", "CAD", "AUD", "JPY", "SGD"]

/* --------------------------------- Team ---------------------------------- */

export function TeamScreen() {
  const data = useQuery(api.team.members)
  const invite = useMutation(api.team.invite)
  const revokeInvite = useMutation(api.team.revokeInvite)
  const updateMember = useMutation(api.team.updateMember)
  const removeMember = useMutation(api.team.removeMember)
  const transferOwnership = useMutation(api.team.transferOwnership)

  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState("")
  const [role, setRole] = useState<(typeof ASSIGNABLE_ROLES)[number]>("member")
  const [transferTo, setTransferTo] = useState<string>("")
  const [confirmName, setConfirmName] = useState("")
  const [transferOpen, setTransferOpen] = useState(false)

  if (data === undefined) return <Spinner label="Loading team" />

  const canManage = data.capabilities["member.manage"]
  const isOwner = data.viewerRole === "owner"
  const seatsLeft = data.seatLimit - data.seatsUsed

  return (
    <div className="space-y-5">
      <PageHeader
        title="Team"
        description={`${data.seatsUsed} of ${data.seatLimit} seats used${
          seatsLeft > 0 ? ` · ${seatsLeft} available` : " · all seats taken"
        }`}
        actions={
          canManage ? (
            <Button onClick={() => setOpen(true)} disabled={seatsLeft <= 0}>
              <UserPlus className="h-4 w-4" />
              Invite
            </Button>
          ) : null
        }
      />

      {seatsLeft <= 0 && canManage ? (
        <Alert>
          <CreditCard className="h-4 w-4" />
          <AlertTitle>All seats are in use</AlertTitle>
          <AlertDescription>
            Upgrade your plan to invite more people, or remove someone first.{" "}
            <Link href="/dashboard/billing" className="underline underline-offset-4">
              View plans
            </Link>
          </AlertDescription>
        </Alert>
      ) : null}

      {data.invites.length > 0 ? (
        <section className="rounded-xl border bg-card p-4">
          <SectionHeader title="Pending invitations" />
          <ul className="mt-3 divide-y">
            {data.invites.map((item) => (
              <li key={item._id} className="flex flex-wrap items-center gap-3 py-3 first:pt-0">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{item.email}</span>
                  <span className="block text-xs text-muted-foreground">
                    {ROLE_LABELS[item.role]} · expires {formatRelative(item.expiresAt)}
                    {item.emailSent === false
                      ? " · not emailed — share the link yourself"
                      : item.emailSent
                        ? " · emailed"
                        : ""}
                  </span>
                </span>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={async () => {
                    const url = `${window.location.origin}/join/${item.token}`
                    await navigator.clipboard
                      .writeText(url)
                      .then(() => toast.success("Invite link copied"))
                      .catch(() => toast.error("Couldn't copy the link"))
                  }}
                >
                  <Link2 className="h-3.5 w-3.5" />
                  Copy link
                </Button>

                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-destructive"
                  aria-label={`Revoke invitation for ${item.email}`}
                  onClick={async () => {
                    await revokeInvite({ inviteId: item._id })
                    toast.success("Invitation revoked")
                  }}
                >
                  <X className="h-4 w-4" />
                </Button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="rounded-xl border bg-card">
        <div className="border-b p-4">
          <SectionHeader title="Members" />
        </div>
        <ul className="divide-y">
          {data.members.map((member) => (
            <li key={member._id} className="flex flex-wrap items-center gap-3 p-4">
              <Avatar className="h-9 w-9 shrink-0">
                <AvatarImage src={member.image} alt="" />
                <AvatarFallback className="text-xs">
                  {initials(member.name || member.email)}
                </AvatarFallback>
              </Avatar>

              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="truncate font-medium">{member.name || member.email}</span>
                  {member.isOwner ? <Badge variant="secondary">Owner</Badge> : null}
                  {member.status === "suspended" ? (
                    <Badge variant="destructive">Suspended</Badge>
                  ) : null}
                </span>
                <span className="block truncate text-xs text-muted-foreground">
                  {member.email} · {member.receiptCount} receipts ·{" "}
                  {formatMoney(member.totalCents, "USD", { compact: true })}
                </span>
              </span>

              {canManage && !member.isOwner ? (
                <>
                  <Select
                    value={member.role}
                    onValueChange={async (next) => {
                      try {
                        await updateMember({
                          memberId: member._id,
                          role: next as (typeof ASSIGNABLE_ROLES)[number],
                        })
                        toast.success(`${member.name || member.email} is now a ${next}`)
                      } catch (caught) {
                        toast.error(errorMessage(caught))
                      }
                    }}
                  >
                    <SelectTrigger className="w-32" aria-label={`Role for ${member.name}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ASSIGNABLE_ROLES.map((item) => (
                        <SelectItem key={item} value={item}>
                          {ROLE_LABELS[item]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                    aria-label={`Remove ${member.name || member.email}`}
                    onClick={async () => {
                      if (
                        !(await confirmDialog({
                          title: `Remove ${member.name || member.email}?`,
                          description:
                            "They lose access immediately. Their receipts stay in the workspace so reports keep working.",
                          confirmLabel: "Remove member",
                          destructive: true,
                        }))
                      ) {
                        return
                      }
                      try {
                        await removeMember({ memberId: member._id })
                        toast.success("Member removed")
                      } catch (caught) {
                        toast.error(errorMessage(caught))
                      }
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </>
              ) : (
                <Badge variant="outline">{ROLE_LABELS[member.role]}</Badge>
              )}
            </li>
          ))}
        </ul>
      </section>

      {isOwner && data.members.length > 1 ? (
        <section className="rounded-xl border border-destructive/30 p-4">
          <SectionHeader
            title="Transfer ownership"
            description="Hand the workspace, its billing and its data to another member. You become an admin."
          />
          <Button variant="outline" className="mt-3" onClick={() => setTransferOpen(true)}>
            Transfer ownership
          </Button>
        </section>
      ) : null}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Invite someone</DialogTitle>
            <DialogDescription>
              We&rsquo;ll generate a link you can send them however you like.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="invite-email">Email</Label>
              <Input
                id="invite-email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="teammate@company.com"
                autoFocus
              />
            </div>

            <div className="space-y-1.5">
              <Label>Role</Label>
              <Select value={role} onValueChange={(next) => setRole(next as typeof role)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ASSIGNABLE_ROLES.map((item) => (
                    <SelectItem key={item} value={item}>
                      {ROLE_LABELS[item]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">{ROLE_DESCRIPTIONS[role]}</p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={!email.trim()}
              onClick={async () => {
                try {
                  const token = await invite({ email, role })
                  const url = `${window.location.origin}/join/${token}`
                  await navigator.clipboard.writeText(url).catch(() => undefined)
                  toast.success("Invitation created", {
                    description: "The link is on your clipboard — send it to them.",
                  })
                  setOpen(false)
                  setEmail("")
                } catch (caught) {
                  toast.error(errorMessage(caught))
                }
              }}
            >
              <Send className="h-4 w-4" />
              Create invite
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={transferOpen} onOpenChange={setTransferOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Transfer ownership</DialogTitle>
            <DialogDescription>
              This cannot be undone by you — only the new owner can transfer it back.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>New owner</Label>
              <Select value={transferTo} onValueChange={setTransferTo}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a member" />
                </SelectTrigger>
                <SelectContent>
                  {data.members
                    .filter((member) => !member.isOwner && member.status === "active")
                    .map((member) => (
                      <SelectItem key={member.userId} value={member.userId}>
                        {member.name || member.email}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="confirm-name">Type the workspace name to confirm</Label>
              <Input
                id="confirm-name"
                value={confirmName}
                onChange={(event) => setConfirmName(event.target.value)}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setTransferOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={!transferTo || !confirmName.trim()}
              onClick={async () => {
                try {
                  await transferOwnership({
                    toUserId: transferTo as Id<"users">,
                    confirmName,
                  })
                  toast.success("Ownership transferred")
                  setTransferOpen(false)
                } catch (caught) {
                  toast.error(errorMessage(caught))
                }
              }}
            >
              Transfer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

/* ------------------------------- Approvals ------------------------------- */

export function ApprovalsScreen() {
  const data = useQuery(api.approvals.list)

  if (data === undefined) return <Spinner label="Loading approvals" />

  const sections = [
    { key: "queue", title: "Waiting on you", items: data.queue },
    { key: "mine", title: "Your submissions", items: data.mine },
    { key: "decided", title: "Recently decided", items: data.decided },
  ].filter((section) => section.items.length > 0)

  return (
    <div className="space-y-5">
      <PageHeader
        title="Approvals"
        description={
          data.canReview
            ? "Review what your team submitted, and track your own submissions."
            : "Track the expense reports you've submitted for approval."
        }
      />

      {sections.length === 0 ? (
        <EmptyState
          icon={CheckSquare}
          title="Nothing to approve"
          description="Submit an expense report from the Reports screen and it will appear here for review."
          action={
            <Button asChild>
              <Link href="/dashboard/reports">Go to reports</Link>
            </Button>
          }
        />
      ) : (
        sections.map((section) => (
          <section key={section.key} className="rounded-xl border bg-card">
            <div className="border-b p-4">
              <SectionHeader title={section.title} />
            </div>
            <ul className="divide-y">
              {section.items.map((item) => (
                <li key={item._id}>
                  <Link
                    href={`/dashboard/approvals/${item._id}`}
                    className="flex flex-wrap items-center gap-3 p-4 transition-colors hover:bg-accent/40"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="truncate font-medium">{item.title}</span>
                        <Badge
                          variant={
                            item.status === "approved"
                              ? "default"
                              : item.status === "rejected"
                                ? "destructive"
                                : "outline"
                          }
                        >
                          {item.status}
                        </Badge>
                      </span>
                      <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                        {item.subtitle} · from {item.submitterName} ·{" "}
                        {formatRelative(item.submittedAt)}
                      </span>
                    </span>
                    <span className="shrink-0 font-semibold font-numeric">
                      {formatMoney(item.amountCents, data.currency)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  )
}

export function ApprovalDetail({ approvalId }: { approvalId: Id<"approvals"> }) {
  const data = useQuery(api.approvals.get, { approvalId })
  const decide = useMutation(api.approvals.decide)
  const comment = useMutation(api.approvals.comment)
  const withdraw = useMutation(api.approvals.withdraw)

  const [note, setNote] = useState("")
  const [pending, setPending] = useState(false)
  const router = useRouter()

  if (data === undefined) return <Spinner label="Loading approval" />

  async function act(decision: "approved" | "rejected" | "returned") {
    setPending(true)
    try {
      await decide({ approvalId, decision, comment: note.trim() || undefined })
      toast.success(`Marked as ${decision}`)
      setNote("")
    } catch (caught) {
      toast.error(errorMessage(caught))
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="space-y-5">
      <Button variant="ghost" size="sm" asChild className="-ml-2">
        <Link href="/dashboard/approvals">
          <ArrowLeft className="h-4 w-4" />
          All approvals
        </Link>
      </Button>

      <PageHeader
        title={data.reportName ?? "Expense approval"}
        description={`Submitted by ${data.submitterName} · ${formatDateTime(data.submittedAt)}`}
        actions={
          <>
            <Badge
              variant={
                data.status === "approved"
                  ? "default"
                  : data.status === "rejected"
                    ? "destructive"
                    : "outline"
              }
              className="h-9 px-3"
            >
              {data.status}
            </Badge>
            {data.reportId ? (
              <Button variant="outline" asChild>
                <Link href={`/dashboard/reports/${data.reportId}`}>View report</Link>
              </Button>
            ) : null}
          </>
        }
      />

      <div className="rounded-xl border bg-card p-5">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">Amount</p>
        <p className="mt-1 text-2xl font-semibold font-numeric">
          {formatMoney(data.amountCents, "USD")}
        </p>
      </div>

      <section className="rounded-xl border bg-card p-5">
        <SectionHeader title="Discussion" />
        <ul className="mt-4 space-y-4">
          {data.history.length === 0 ? (
            <li className="text-sm text-muted-foreground">No comments yet.</li>
          ) : (
            data.history.map((entry) => (
              <li key={entry._id} className="flex gap-3">
                <Avatar className="h-8 w-8 shrink-0">
                  <AvatarImage src={entry.authorImage} alt="" />
                  <AvatarFallback className="text-[10px]">
                    {initials(entry.authorName)}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="text-xs">
                    <span className="font-medium">{entry.authorName}</span>
                    {entry.action ? (
                      <Badge variant="secondary" className="ml-1.5 text-[10px]">
                        {entry.action}
                      </Badge>
                    ) : null}
                    <span className="ml-1.5 text-muted-foreground">
                      {formatRelative(entry.createdAt)}
                    </span>
                  </p>
                  <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed">{entry.body}</p>
                </div>
              </li>
            ))
          )}
        </ul>

        <div className="mt-5 space-y-3 border-t pt-5">
          <Textarea
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder={
              data.canReview && data.status === "submitted"
                ? "Add a comment (required to reject or return)…"
                : "Add a comment…"
            }
            rows={3}
            aria-label="Comment"
          />

          <div className="flex flex-wrap gap-2">
            {data.canReview && data.status === "submitted" ? (
              <>
                <Button disabled={pending} onClick={() => act("approved")}>
                  <Check className="h-4 w-4" />
                  Approve
                </Button>
                <Button
                  variant="outline"
                  disabled={pending || !note.trim()}
                  onClick={() => act("returned")}
                >
                  Return for changes
                </Button>
                <Button
                  variant="destructive"
                  disabled={pending || !note.trim()}
                  onClick={() => act("rejected")}
                >
                  <X className="h-4 w-4" />
                  Reject
                </Button>
              </>
            ) : null}

            <Button
              variant="outline"
              disabled={!note.trim()}
              onClick={async () => {
                await comment({ approvalId, body: note })
                setNote("")
              }}
            >
              Comment
            </Button>

            {!data.canReview && data.status === "submitted" ? (
              <Button
                variant="ghost"
                onClick={async () => {
                  await withdraw({ approvalId })
                  toast.success("Submission withdrawn")
                  router.push("/dashboard/approvals")
                }}
              >
                Withdraw
              </Button>
            ) : null}
          </div>
        </div>
      </section>
    </div>
  )
}

/* -------------------------------- Settings ------------------------------- */

export function SettingsScreen() {
  const session = useQuery(api.users.me)
  const storage = useQuery(api.workspaces.storageStats)
  const exportData = useQuery(api.users.exportMyData)

  const updateProfile = useMutation(api.users.updateProfile)
  const updateSettings = useMutation(api.users.updateSettings)
  const updateWorkspace = useMutation(api.workspaces.update)
  const requestDeletion = useMutation(api.users.requestAccountDeletion)
  const cancelDeletion = useMutation(api.users.cancelAccountDeletion)

  const { signOut } = useAuthActions()
  const router = useRouter()

  const [name, setName] = useState<string | null>(null)
  const [jobTitle, setJobTitle] = useState<string | null>(null)
  const [workspaceName, setWorkspaceName] = useState<string | null>(null)

  if (session === undefined || !session?.activeWorkspace) return <Spinner label="Loading settings" />

  const settings = session.settings
  const workspace = session.activeWorkspace
  const canManageWorkspace = ["owner", "admin"].includes(session.role ?? "")

  const notificationToggles = [
    { key: "notifyReceiptProcessed", label: "Receipt processed", hint: "When extraction finishes." },
    { key: "notifyApproval", label: "Approvals", hint: "Submissions, decisions and comments." },
    { key: "notifyBudgetExceeded", label: "Budget alerts", hint: "When spend crosses a threshold." },
    { key: "notifyUploadFailed", label: "Upload problems", hint: "When a receipt can't be read." },
    { key: "notifyTaxReminder", label: "Tax reminders", hint: "Quarterly nudges to tidy records." },
    { key: "notifyWeeklyDigest", label: "Weekly digest", hint: "A summary of the week's spend." },
  ] as const

  return (
    <div className="space-y-5">
      <PageHeader title="Settings" description="Your profile, preferences and workspace." />

      <Tabs defaultValue="profile">
        <TabsList className="grid w-full grid-cols-2 sm:grid-cols-4">
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="preferences">Preferences</TabsTrigger>
          <TabsTrigger value="workspace">Workspace</TabsTrigger>
          <TabsTrigger value="privacy">Privacy</TabsTrigger>
        </TabsList>

        <TabsContent value="profile" className="mt-5 space-y-5">
          <section className="rounded-xl border bg-card p-5">
            <SectionHeader title="Your details" />
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="profile-name">Name</Label>
                <Input
                  id="profile-name"
                  value={name ?? session.user.name}
                  onChange={(event) => setName(event.target.value)}
                  onBlur={async () => {
                    if (name === null || name === session.user.name) return
                    try {
                      await updateProfile({ name })
                      toast.success("Profile updated")
                    } catch (caught) {
                      toast.error(errorMessage(caught))
                    }
                  }}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="profile-title">Job title</Label>
                <Input
                  id="profile-title"
                  value={jobTitle ?? session.user.jobTitle}
                  onChange={(event) => setJobTitle(event.target.value)}
                  onBlur={async () => {
                    if (jobTitle === null || jobTitle === session.user.jobTitle) return
                    await updateProfile({ jobTitle })
                    toast.success("Profile updated")
                  }}
                  placeholder="Operations lead"
                />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="profile-email">Email</Label>
                <Input id="profile-email" value={session.user.email} disabled readOnly />
                <p className="text-xs text-muted-foreground">
                  Your email is your sign-in identity and can&rsquo;t be changed here.
                </p>
              </div>
            </div>
          </section>

          <section className="rounded-xl border bg-card p-5">
            <SectionHeader title="Session" description="Signed in on this device." />
            <Button
              variant="outline"
              className="mt-3"
              onClick={async () => {
                await signOut()
                router.push("/login")
              }}
            >
              <LogOut className="h-4 w-4" />
              Sign out
            </Button>
          </section>
        </TabsContent>

        <TabsContent value="preferences" className="mt-5 space-y-5">
          <section className="rounded-xl border bg-card p-5">
            <SectionHeader title="Regional" />
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Display currency</Label>
                <Select
                  value={settings.currency}
                  onValueChange={async (value) => {
                    await updateSettings({ currency: value })
                    toast.success("Currency updated")
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SUPPORTED_CURRENCIES.map((code) => (
                      <SelectItem key={code} value={code}>
                        {code}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="timezone">Time zone</Label>
                <Input
                  id="timezone"
                  defaultValue={settings.timezone}
                  onBlur={async (event) => {
                    if (event.target.value === settings.timezone) return
                    await updateSettings({ timezone: event.target.value })
                    toast.success("Time zone updated")
                  }}
                />
              </div>
            </div>
          </section>

          <section className="rounded-xl border bg-card p-5">
            <SectionHeader title="Capture" />
            <label className="mt-4 flex items-center justify-between gap-4 rounded-lg border p-3">
              <span className="text-sm">
                Auto-categorise new receipts
                <span className="block text-xs text-muted-foreground">
                  Uses your category keywords to file receipts as they arrive.
                </span>
              </span>
              <Switch
                checked={settings.autoCategorize}
                onCheckedChange={(checked) => void updateSettings({ autoCategorize: checked })}
                aria-label="Auto-categorise new receipts"
              />
            </label>
            <label className="mt-2 flex items-center justify-between gap-4 rounded-lg border p-3">
              <span className="text-sm">
                Reduce motion
                <span className="block text-xs text-muted-foreground">
                  Minimise animations across the app.
                </span>
              </span>
              <Switch
                checked={settings.reducedMotion}
                onCheckedChange={(checked) => void updateSettings({ reducedMotion: checked })}
                aria-label="Reduce motion"
              />
            </label>
          </section>

          <section className="rounded-xl border bg-card p-5">
            <SectionHeader
              title="Notifications"
              description="These control what appears in your in-app inbox."
            />
            <div className="mt-4 space-y-2">
              {notificationToggles.map((toggle) => (
                <label
                  key={toggle.key}
                  className="flex items-center justify-between gap-4 rounded-lg border p-3"
                >
                  <span className="text-sm">
                    {toggle.label}
                    <span className="block text-xs text-muted-foreground">{toggle.hint}</span>
                  </span>
                  <Switch
                    checked={settings[toggle.key]}
                    onCheckedChange={(checked) =>
                      void updateSettings({ [toggle.key]: checked })
                    }
                    aria-label={toggle.label}
                  />
                </label>
              ))}
            </div>
          </section>
        </TabsContent>

        <TabsContent value="workspace" className="mt-5 space-y-5">
          <section className="rounded-xl border bg-card p-5">
            <SectionHeader title="Workspace" />
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="workspace-name">Name</Label>
                <Input
                  id="workspace-name"
                  value={workspaceName ?? workspace.name}
                  disabled={!canManageWorkspace}
                  onChange={(event) => setWorkspaceName(event.target.value)}
                  onBlur={async () => {
                    if (workspaceName === null || workspaceName === workspace.name) return
                    try {
                      await updateWorkspace({ workspaceId: workspace._id, name: workspaceName })
                      toast.success("Workspace renamed")
                    } catch (caught) {
                      toast.error(errorMessage(caught))
                    }
                  }}
                />
              </div>

              <div className="space-y-1.5">
                <Label>Base currency</Label>
                <Select
                  value={workspace.baseCurrency}
                  disabled={!canManageWorkspace}
                  onValueChange={async (value) => {
                    await updateWorkspace({ workspaceId: workspace._id, baseCurrency: value })
                    toast.success("Base currency updated")
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SUPPORTED_CURRENCIES.map((code) => (
                      <SelectItem key={code} value={code}>
                        {code}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="tax-label">Tax label</Label>
                <Input
                  id="tax-label"
                  defaultValue={workspace.taxLabel}
                  disabled={!canManageWorkspace}
                  onBlur={async (event) => {
                    if (event.target.value === workspace.taxLabel) return
                    await updateWorkspace({
                      workspaceId: workspace._id,
                      taxLabel: event.target.value,
                    })
                    toast.success("Tax label updated")
                  }}
                  placeholder="GST, VAT, Sales Tax…"
                />
              </div>
            </div>
          </section>

          {storage ? (
            <section className="rounded-xl border bg-card p-5">
              <SectionHeader
                title="Storage"
                description={`${formatBytes(storage.usedBytes)} of ${formatBytes(
                  storage.quotaBytes,
                )} used across ${storage.pageCount} files`}
              />
              <Progress
                value={
                  storage.quotaBytes > 0
                    ? Math.min(100, (storage.usedBytes / storage.quotaBytes) * 100)
                    : 0
                }
                className="mt-3"
              />
              <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
                <div>
                  <dt className="text-xs text-muted-foreground">Receipts</dt>
                  <dd className="font-medium font-numeric">{storage.receiptCount}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Archived</dt>
                  <dd className="font-medium font-numeric">
                    {formatBytes(storage.archivedBytes)}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">In trash</dt>
                  <dd className="font-medium font-numeric">
                    {formatBytes(storage.trashedBytes)}
                  </dd>
                </div>
              </dl>
              <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
                <HardDrive className="h-3 w-3" />
                Emptying the trash frees {formatBytes(storage.trashedBytes)}.
              </p>
            </section>
          ) : null}
        </TabsContent>

        <TabsContent value="privacy" className="mt-5 space-y-5">
          <section className="rounded-xl border bg-card p-5">
            <SectionHeader
              title="Export your data"
              description="Everything in this workspace as a JSON file — receipts, categories, folders, tags and budgets."
            />
            <Button
              variant="outline"
              className="mt-3"
              disabled={exportData === undefined}
              onClick={() => {
                if (!exportData) return
                const blob = new Blob([JSON.stringify(exportData, null, 2)], {
                  type: "application/json",
                })
                const url = URL.createObjectURL(blob)
                const anchor = document.createElement("a")
                anchor.href = url
                anchor.download = `receiptful-export-${new Date().toISOString().slice(0, 10)}.json`
                anchor.click()
                setTimeout(() => URL.revokeObjectURL(url), 1000)
                toast.success("Export downloaded")
              }}
            >
              <Download className="h-4 w-4" />
              Download my data
            </Button>
          </section>

          <section className="rounded-xl border border-destructive/30 p-5">
            <SectionHeader
              title="Delete account"
              description="Your account is scheduled for deletion and permanently removed after 30 days. You can cancel any time before then."
            />

            {session.user.deletionRequestedAt ? (
              <div className="mt-3 space-y-3">
                <Alert variant="destructive">
                  <Shield className="h-4 w-4" />
                  <AlertTitle>Deletion scheduled</AlertTitle>
                  <AlertDescription>
                    Requested {formatDateTime(session.user.deletionRequestedAt)}. Your data is
                    removed 30 days after that.
                  </AlertDescription>
                </Alert>
                <Button
                  variant="outline"
                  onClick={async () => {
                    await cancelDeletion()
                    toast.success("Deletion cancelled")
                  }}
                >
                  Cancel deletion
                </Button>
              </div>
            ) : (
              <Button
                variant="destructive"
                className="mt-3"
                onClick={async () => {
                  if (
                    !(await confirmDialog({
                      title: "Schedule your account for deletion?",
                      description:
                        "Nothing is removed today. You have 30 days to cancel, after which your account and any workspace only you belong to are erased.",
                      confirmLabel: "Schedule deletion",
                      destructive: true,
                    }))
                  ) {
                    return
                  }
                  try {
                    await requestDeletion()
                    toast.success("Account scheduled for deletion")
                  } catch (caught) {
                    toast.error(errorMessage(caught))
                  }
                }}
              >
                <Trash2 className="h-4 w-4" />
                Delete my account
              </Button>
            )}
          </section>
        </TabsContent>
      </Tabs>
    </div>
  )
}

/* -------------------------------- Billing -------------------------------- */

const PLANS = [
  {
    id: "free" as const,
    name: "Free",
    price: "$0",
    cadence: "forever",
    seats: 1,
    storage: "1 GB",
    features: ["Unlimited receipts", "Automatic extraction", "CSV & Excel export", "1 workspace"],
  },
  {
    id: "pro" as const,
    name: "Pro",
    price: "$12",
    cadence: "per month",
    seats: 5,
    storage: "25 GB",
    features: [
      "Everything in Free",
      "Up to 5 team members",
      "Budgets and approvals",
      "PDF reports and tax summaries",
    ],
  },
  {
    id: "business" as const,
    name: "Business",
    price: "$39",
    cadence: "per month",
    seats: 50,
    storage: "250 GB",
    features: [
      "Everything in Pro",
      "Up to 50 team members",
      "Roles and permissions",
      "Audit log and data export",
    ],
  },
]

export function BillingScreen() {
  const session = useQuery(api.users.me)
  const storage = useQuery(api.workspaces.storageStats)
  const changePlan = useMutation(api.workspaces.changePlan)
  const [pending, setPending] = useState<string | null>(null)

  if (session === undefined || !session?.activeWorkspace) return <Spinner label="Loading billing" />

  const workspace = session.activeWorkspace
  const isOwner = session.role === "owner"

  return (
    <div className="space-y-5">
      <PageHeader
        title="Billing"
        description={`You're on the ${workspace.plan} plan.`}
      />

      {!isOwner ? (
        <Alert>
          <Shield className="h-4 w-4" />
          <AlertTitle>Read-only</AlertTitle>
          <AlertDescription>
            Only the workspace owner can change the plan.
          </AlertDescription>
        </Alert>
      ) : null}

      {storage ? (
        <section className="rounded-xl border bg-card p-5">
          <SectionHeader
            title="Current usage"
            description={`${storage.receiptCount} receipts · ${formatBytes(
              storage.usedBytes,
            )} of ${formatBytes(storage.quotaBytes)}`}
          />
          <Progress
            value={
              storage.quotaBytes > 0
                ? Math.min(100, (storage.usedBytes / storage.quotaBytes) * 100)
                : 0
            }
            className="mt-3"
          />
        </section>
      ) : null}

      <ul className="grid gap-4 lg:grid-cols-3">
        {PLANS.map((plan) => {
          const current = workspace.plan === plan.id
          return (
            <li
              key={plan.id}
              className={`flex flex-col rounded-xl border p-5 ${
                current ? "border-primary ring-1 ring-primary/30" : ""
              }`}
            >
              <div className="flex items-center justify-between">
                <h2 className="font-semibold">{plan.name}</h2>
                {current ? <Badge>Current</Badge> : null}
              </div>

              <p className="mt-3">
                <span className="text-2xl font-semibold font-numeric">{plan.price}</span>{" "}
                <span className="text-sm text-muted-foreground">{plan.cadence}</span>
              </p>

              <ul className="mt-4 flex-1 space-y-2 text-sm">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-2">
                    <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                    {feature}
                  </li>
                ))}
              </ul>

              <Button
                variant={current ? "outline" : "default"}
                className="mt-5"
                disabled={current || !isOwner || pending !== null}
                onClick={async () => {
                  setPending(plan.id)
                  try {
                    await changePlan({ workspaceId: workspace._id, plan: plan.id })
                    toast.success(`Switched to the ${plan.name} plan`)
                  } catch (caught) {
                    toast.error(errorMessage(caught))
                  } finally {
                    setPending(null)
                  }
                }}
              >
                {current ? "Current plan" : `Switch to ${plan.name}`}
              </Button>
            </li>
          )
        })}
      </ul>

      <Alert>
        <CreditCard className="h-4 w-4" />
        <AlertTitle>Payment collection</AlertTitle>
        <AlertDescription>
          Plan entitlements — seats, storage and features — are enforced here. Card capture and
          invoicing are handled by your payment provider integration; no card details are stored
          by Receiptful.
        </AlertDescription>
      </Alert>
    </div>
  )
}
