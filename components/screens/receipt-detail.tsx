"use client"

import { useMutation, useQuery } from "convex/react"
import {
  AlertTriangle,
  Archive,
  ArrowLeft,
  Check,
  Copy,
  Download,
  ExternalLink,
  Globe,
  History,
  Loader2,
  Mail,
  MapPin,
  MessageSquare,
  MoreHorizontal,
  Phone,
  Printer,
  RefreshCw,
  Send,
  Sparkles,
  Trash2,
  Undo2,
} from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { toast } from "sonner"

import { PageViewer } from "@/components/receipts/page-viewer"
import { ReceiptRow } from "@/components/receipts/receipt-item"
import { ErrorState, Spinner } from "@/components/common/states"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { useHaptics } from "@/hooks/use-haptics"
import { errorMessage } from "@/lib/errors"
import {
  centsToInput,
  formatDate,
  formatDateTime,
  formatMoney,
  formatRelative,
  initials,
  inputToCents,
  PAYMENT_METHOD_LABELS,
} from "@/lib/format"
import { cn } from "@/lib/utils"

/** Marks a field the scanner wasn't sure about, so the eye goes straight to it. */
function FieldLabel({
  htmlFor,
  children,
  uncertain,
}: {
  htmlFor: string
  children: string
  uncertain?: boolean
}) {
  return (
    <Label htmlFor={htmlFor} className="flex items-center gap-1.5 text-xs">
      {children}
      {uncertain ? (
        <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-400">
          <AlertTriangle className="h-2.5 w-2.5" />
          Check
        </span>
      ) : null}
    </Label>
  )
}

export function ReceiptDetail({ receiptId }: { receiptId: Id<"receipts"> }) {
  const data = useQuery(api.receipts.get, { receiptId })
  const categories = useQuery(api.categories.list)
  const allTags = useQuery(api.tags.list)
  const allFolders = useQuery(api.folders.list)

  const update = useMutation(api.receipts.update)
  const bulkUpdate = useMutation(api.receipts.bulkUpdate)
  const markReviewed = useMutation(api.receipts.markReviewed)
  const setArchived = useMutation(api.receipts.setArchived)
  const removeReceipt = useMutation(api.receipts.remove)
  const restoreReceipt = useMutation(api.receipts.restore)
  const duplicateReceipt = useMutation(api.receipts.duplicate)
  const addComment = useMutation(api.receipts.addComment)
  const dismissDuplicate = useMutation(api.receipts.dismissDuplicate)
  const retryOcr = useMutation(api.uploads.retryOcr)
  const rotatePage = useMutation(api.uploads.rotatePage)
  const removePage = useMutation(api.uploads.removePage)

  const router = useRouter()
  const haptics = useHaptics()

  const [draft, setDraft] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [comment, setComment] = useState("")

  // Reset local edits whenever the server sends a different receipt.
  useEffect(() => {
    setDraft({})
  }, [receiptId])

  if (data === undefined) return <Spinner label="Loading receipt" />

  const { receipt, pages, ocr, tags, folders, comments, timeline, versions, related } = data
  const currency = receipt.currency
  const canEdit = data.viewerRole !== "viewer"
  const uncertain = new Set(receipt.lowConfidenceFields)

  const value = (field: string, fallback: string) =>
    draft[field] !== undefined ? draft[field] : fallback

  async function save(patch: Record<string, unknown>) {
    if (!canEdit) return
    setSaving(true)
    try {
      await update({ receiptId, ...patch })
    } catch (caught) {
      toast.error(errorMessage(caught))
      haptics("error")
    } finally {
      setSaving(false)
    }
  }

  function commitText(field: string, current: string, transform?: (value: string) => unknown) {
    const next = draft[field]
    if (next === undefined || next === current) return
    void save({ [field]: transform ? transform(next) : next })
  }

  const mapQuery = receipt.address
    ? encodeURIComponent(`${receipt.merchant} ${receipt.address}`)
    : receipt.latitude && receipt.longitude
      ? `${receipt.latitude},${receipt.longitude}`
      : null

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="sm" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4" />
          Back
        </Button>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          {saving ? (
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              Saving
            </span>
          ) : null}

          {canEdit ? (
            <Button
              variant={receipt.reviewedAt ? "outline" : "default"}
              size="sm"
              onClick={async () => {
                await markReviewed({ receiptId, reviewed: !receipt.reviewedAt })
                haptics("success")
                toast.success(receipt.reviewedAt ? "Reopened for review" : "Marked as reviewed")
              }}
            >
              <Check className="h-3.5 w-3.5" />
              {receipt.reviewedAt ? "Reviewed" : "Mark reviewed"}
            </Button>
          ) : null}

          <Button variant="outline" size="sm" onClick={() => window.print()}>
            <Printer className="h-3.5 w-3.5" />
            Print
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon" className="h-9 w-9" aria-label="More actions">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {pages[0]?.url ? (
                <DropdownMenuItem asChild>
                  <a href={pages[0].url} download={`${receipt.merchant || "receipt"}.jpg`}>
                    <Download className="h-3.5 w-3.5" />
                    Download image
                  </a>
                </DropdownMenuItem>
              ) : null}
              <DropdownMenuItem
                onSelect={async () => {
                  await navigator.clipboard
                    .writeText(window.location.href)
                    .then(() => toast.success("Link copied"))
                    .catch(() => toast.error("Couldn't copy the link"))
                }}
              >
                <Copy className="h-3.5 w-3.5" />
                Copy link
              </DropdownMenuItem>
              {canEdit ? (
                <>
                  <DropdownMenuItem
                    onSelect={async () => {
                      const copyId = await duplicateReceipt({ receiptId })
                      toast.success("Receipt duplicated")
                      router.push(`/dashboard/receipts/${copyId}`)
                    }}
                  >
                    <Copy className="h-3.5 w-3.5" />
                    Duplicate
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={() => void retryOcr({ receiptId }).then(() => toast.success("Re-reading receipt"))}
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    Re-run extraction
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={async () => {
                      await setArchived({ receiptIds: [receiptId], archived: !receipt.isArchived })
                      toast.success(receipt.isArchived ? "Unarchived" : "Archived")
                    }}
                  >
                    <Archive className="h-3.5 w-3.5" />
                    {receipt.isArchived ? "Unarchive" : "Archive"}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  {receipt.deletedAt ? (
                    <DropdownMenuItem
                      onSelect={async () => {
                        await restoreReceipt({ receiptIds: [receiptId] })
                        toast.success("Restored")
                      }}
                    >
                      <Undo2 className="h-3.5 w-3.5" />
                      Restore
                    </DropdownMenuItem>
                  ) : (
                    <DropdownMenuItem
                      className="text-destructive focus:text-destructive"
                      onSelect={async () => {
                        await removeReceipt({ receiptIds: [receiptId] })
                        toast.success("Moved to trash", {
                          action: {
                            label: "Undo",
                            onClick: () => void restoreReceipt({ receiptIds: [receiptId] }),
                          },
                        })
                        router.push("/dashboard/receipts")
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Move to trash
                    </DropdownMenuItem>
                  )}
                </>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {receipt.deletedAt ? (
        <Alert>
          <Trash2 className="h-4 w-4" />
          <AlertTitle>This receipt is in the trash</AlertTitle>
          <AlertDescription>
            It will be permanently deleted 30 days after {formatDate(receipt.date)}. Restore it to
            keep it.
          </AlertDescription>
        </Alert>
      ) : null}

      {receipt.duplicateOfId ? (
        <Alert>
          <Copy className="h-4 w-4" />
          <AlertTitle>Possible duplicate</AlertTitle>
          <AlertDescription className="flex flex-wrap items-center gap-3">
            <span>
              Another receipt has the same merchant and amount within three days.
            </span>
            <Button variant="outline" size="sm" asChild>
              <Link href={`/dashboard/receipts/${receipt.duplicateOfId}`}>Compare</Link>
            </Button>
            {canEdit ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => void dismissDuplicate({ receiptId })}
              >
                Not a duplicate
              </Button>
            ) : null}
          </AlertDescription>
        </Alert>
      ) : null}

      {ocr?.inconsistencies && ocr.inconsistencies.length > 0 ? (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Check these before approving</AlertTitle>
          <AlertDescription>
            <ul className="list-disc space-y-1 pl-4">
              {ocr.inconsistencies.map((warning: string) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      ) : null}

      {ocr?.status === "skipped" ? (
        <Alert>
          <Sparkles className="h-4 w-4" />
          <AlertTitle>Automatic extraction is off</AlertTitle>
          <AlertDescription>
            {ocr.error ?? "Enter the details below by hand."}
          </AlertDescription>
        </Alert>
      ) : ocr?.status === "failed" ? (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>We couldn&rsquo;t read this receipt</AlertTitle>
          <AlertDescription className="flex flex-wrap items-center gap-3">
            <span>{ocr.error ?? "Fill in the details below, or try again."}</span>
            {canEdit ? (
              <Button variant="outline" size="sm" onClick={() => void retryOcr({ receiptId })}>
                <RefreshCw className="h-3.5 w-3.5" />
                Try again
              </Button>
            ) : null}
          </AlertDescription>
        </Alert>
      ) : receipt.status === "processing" ? (
        <Alert>
          <Loader2 className="h-4 w-4 animate-spin" />
          <AlertTitle>Reading this receipt</AlertTitle>
          <AlertDescription>
            The fields below will fill in automatically in a few seconds.
          </AlertDescription>
        </Alert>
      ) : receipt.lowConfidenceFields.length > 0 ? (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Check the highlighted fields</AlertTitle>
          <AlertDescription>
            The scanner wasn&rsquo;t confident about{" "}
            {receipt.lowConfidenceFields.join(", ")}. Confirm or correct them, then mark the
            receipt reviewed.
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        <div className="space-y-4">
          <PageViewer
            pages={pages}
            merchant={receipt.merchant}
            canEdit={canEdit}
            onRotate={(pageId, rotation) =>
              void rotatePage({ pageId: pageId as Id<"receiptPages">, rotation })
            }
            onDelete={(pageId) =>
              void removePage({ pageId: pageId as Id<"receiptPages"> }).then(() =>
                toast.success("Page removed"),
              )
            }
          />

          {mapQuery ? (
            <a
              href={`https://www.openstreetmap.org/search?query=${mapQuery}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 rounded-xl border p-3 text-sm transition-colors hover:bg-accent/50"
            >
              <MapPin className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate">{receipt.address}</span>
              <ExternalLink className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            </a>
          ) : null}

          {(receipt.phone || receipt.website || receipt.email) ? (
            <div className="space-y-1 rounded-xl border p-3">
              {receipt.phone ? (
                <a
                  href={`tel:${receipt.phone}`}
                  className="flex items-center gap-2 rounded-md px-1 py-1.5 text-sm hover:bg-accent/50"
                >
                  <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                  {receipt.phone}
                </a>
              ) : null}
              {receipt.website ? (
                <a
                  href={receipt.website.startsWith("http") ? receipt.website : `https://${receipt.website}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 rounded-md px-1 py-1.5 text-sm hover:bg-accent/50"
                >
                  <Globe className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="truncate">{receipt.website}</span>
                </a>
              ) : null}
              {receipt.email ? (
                <a
                  href={`mailto:${receipt.email}`}
                  className="flex items-center gap-2 rounded-md px-1 py-1.5 text-sm hover:bg-accent/50"
                >
                  <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="truncate">{receipt.email}</span>
                </a>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="space-y-4">
          <Tabs defaultValue="details">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="details">Details</TabsTrigger>
              <TabsTrigger value="items">
                Items
                {receipt.items.length > 0 ? (
                  <Badge variant="secondary" className="ml-1 h-4 px-1 text-[10px]">
                    {receipt.items.length}
                  </Badge>
                ) : null}
              </TabsTrigger>
              <TabsTrigger value="activity">Activity</TabsTrigger>
              <TabsTrigger value="raw">Text</TabsTrigger>
            </TabsList>

            <TabsContent value="details" className="mt-4 space-y-4">
              <div className="space-y-1.5">
                <FieldLabel htmlFor="merchant" uncertain={uncertain.has("merchant")}>
                  Merchant
                </FieldLabel>
                <Input
                  id="merchant"
                  value={value("merchant", receipt.merchant)}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, merchant: event.target.value }))
                  }
                  onBlur={() => commitText("merchant", receipt.merchant)}
                  disabled={!canEdit}
                  placeholder="Who did you pay?"
                  className={cn(uncertain.has("merchant") && "border-amber-500/50")}
                />
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <FieldLabel htmlFor="amount" uncertain={uncertain.has("amount")}>
                    Total
                  </FieldLabel>
                  <Input
                    id="amount"
                    inputMode="decimal"
                    value={value("amountCents", centsToInput(receipt.amountCents, currency))}
                    onChange={(event) =>
                      setDraft((current) => ({ ...current, amountCents: event.target.value }))
                    }
                    onBlur={() =>
                      commitText(
                        "amountCents",
                        centsToInput(receipt.amountCents, currency),
                        (raw) => inputToCents(raw, currency),
                      )
                    }
                    disabled={!canEdit}
                    className={cn(
                      "font-numeric",
                      uncertain.has("amount") && "border-amber-500/50",
                    )}
                  />
                </div>

                <div className="space-y-1.5">
                  <FieldLabel htmlFor="date" uncertain={uncertain.has("date")}>
                    Date
                  </FieldLabel>
                  <Input
                    id="date"
                    type="date"
                    value={value("date", receipt.date)}
                    onChange={(event) => {
                      setDraft((current) => ({ ...current, date: event.target.value }))
                      if (event.target.value) void save({ date: event.target.value })
                    }}
                    disabled={!canEdit}
                    className={cn(uncertain.has("date") && "border-amber-500/50")}
                  />
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <Label htmlFor="subtotal" className="text-xs">
                    Subtotal
                  </Label>
                  <Input
                    id="subtotal"
                    inputMode="decimal"
                    value={value("subtotalCents", centsToInput(receipt.subtotalCents, currency))}
                    onChange={(event) =>
                      setDraft((current) => ({ ...current, subtotalCents: event.target.value }))
                    }
                    onBlur={() =>
                      commitText(
                        "subtotalCents",
                        centsToInput(receipt.subtotalCents, currency),
                        (raw) => inputToCents(raw, currency),
                      )
                    }
                    disabled={!canEdit}
                    className="font-numeric"
                  />
                </div>

                <div className="space-y-1.5">
                  <FieldLabel htmlFor="tax" uncertain={uncertain.has("tax")}>
                    {data.workspaceCurrency ? "Tax" : "Tax"}
                  </FieldLabel>
                  <Input
                    id="tax"
                    inputMode="decimal"
                    value={value("taxCents", centsToInput(receipt.taxCents, currency))}
                    onChange={(event) =>
                      setDraft((current) => ({ ...current, taxCents: event.target.value }))
                    }
                    onBlur={() =>
                      commitText(
                        "taxCents",
                        centsToInput(receipt.taxCents, currency),
                        (raw) => inputToCents(raw, currency),
                      )
                    }
                    disabled={!canEdit}
                    className={cn("font-numeric", uncertain.has("tax") && "border-amber-500/50")}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="tip" className="text-xs">
                    Tip
                  </Label>
                  <Input
                    id="tip"
                    inputMode="decimal"
                    value={value("tipCents", centsToInput(receipt.tipCents, currency))}
                    onChange={(event) =>
                      setDraft((current) => ({ ...current, tipCents: event.target.value }))
                    }
                    onBlur={() =>
                      commitText(
                        "tipCents",
                        centsToInput(receipt.tipCents, currency),
                        (raw) => inputToCents(raw, currency),
                      )
                    }
                    disabled={!canEdit}
                    className="font-numeric"
                  />
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-xs">Category</Label>
                  <Select
                    value={receipt.categoryId ?? "none"}
                    onValueChange={(next) =>
                      void save({ categoryId: next === "none" ? null : next })
                    }
                    disabled={!canEdit}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Uncategorised" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Uncategorised</SelectItem>
                      {(categories ?? []).map((category) => (
                        <SelectItem key={category._id} value={category._id}>
                          {category.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">Payment method</Label>
                  <Select
                    value={receipt.paymentMethod}
                    onValueChange={(next) => void save({ paymentMethod: next })}
                    disabled={!canEdit}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(PAYMENT_METHOD_LABELS).map(([key, label]) => (
                        <SelectItem key={key} value={key}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="invoice" className="text-xs">
                    Invoice number
                  </Label>
                  <Input
                    id="invoice"
                    value={value("invoiceNumber", receipt.invoiceNumber ?? "")}
                    onChange={(event) =>
                      setDraft((current) => ({ ...current, invoiceNumber: event.target.value }))
                    }
                    onBlur={() => commitText("invoiceNumber", receipt.invoiceNumber ?? "")}
                    disabled={!canEdit}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="card" className="text-xs">
                    Card last 4
                  </Label>
                  <Input
                    id="card"
                    inputMode="numeric"
                    maxLength={4}
                    value={value("cardLast4", receipt.cardLast4 ?? "")}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        cardLast4: event.target.value.replace(/\D/g, "").slice(0, 4),
                      }))
                    }
                    onBlur={() => commitText("cardLast4", receipt.cardLast4 ?? "")}
                    disabled={!canEdit}
                    className="font-numeric"
                  />
                </div>
              </div>

              <div className="space-y-2 rounded-lg border p-3">
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={receipt.taxDeductible}
                    onCheckedChange={(checked) => void save({ taxDeductible: checked === true })}
                    disabled={!canEdit}
                  />
                  Tax deductible
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={receipt.reimbursable}
                    onCheckedChange={(checked) => void save({ reimbursable: checked === true })}
                    disabled={!canEdit}
                  />
                  Reimbursable
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={receipt.classification === "business"}
                    onCheckedChange={(checked) =>
                      void save({ classification: checked === true ? "business" : "personal" })
                    }
                    disabled={!canEdit}
                  />
                  Business expense
                </label>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Tags</Label>
                <div className="flex flex-wrap gap-1.5">
                  {(allTags ?? []).map((tag) => {
                    const active = tags.some((item) => item._id === tag._id)
                    return (
                      <button
                        key={tag._id}
                        type="button"
                        disabled={!canEdit}
                        aria-pressed={active}
                        onClick={() =>
                          void bulkUpdate({
                            receiptIds: [receiptId],
                            addTagIds: active ? undefined : [tag._id],
                            removeTagIds: active ? [tag._id] : undefined,
                          })
                        }
                        className={cn(
                          "rounded-full border px-2.5 py-1 text-xs transition-colors disabled:opacity-50",
                          active
                            ? "border-primary bg-primary text-primary-foreground"
                            : "hover:bg-accent",
                        )}
                      >
                        {tag.name}
                      </button>
                    )
                  })}
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Folders</Label>
                <div className="flex flex-wrap gap-1.5">
                  {(allFolders ?? []).map((folder) => {
                    const active = folders.some((item) => item._id === folder._id)
                    return (
                      <button
                        key={folder._id}
                        type="button"
                        disabled={!canEdit}
                        aria-pressed={active}
                        onClick={() =>
                          void bulkUpdate({
                            receiptIds: [receiptId],
                            addFolderIds: active ? undefined : [folder._id],
                            removeFolderIds: active ? [folder._id] : undefined,
                          })
                        }
                        className={cn(
                          "rounded-full border px-2.5 py-1 text-xs transition-colors disabled:opacity-50",
                          active
                            ? "border-primary bg-primary text-primary-foreground"
                            : "hover:bg-accent",
                        )}
                      >
                        {folder.name}
                      </button>
                    )
                  })}
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="notes" className="text-xs">
                  Notes
                </Label>
                <Textarea
                  id="notes"
                  rows={3}
                  value={value("notes", receipt.notes ?? "")}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, notes: event.target.value }))
                  }
                  onBlur={() => commitText("notes", receipt.notes ?? "")}
                  disabled={!canEdit}
                  placeholder="What was this for?"
                />
              </div>
            </TabsContent>

            <TabsContent value="items" className="mt-4">
              {receipt.items.length === 0 ? (
                <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
                  No line items were found on this receipt.
                </p>
              ) : (
                <table className="w-full text-sm">
                  <caption className="sr-only">Line items on this receipt</caption>
                  <thead>
                    <tr className="border-b text-left text-xs text-muted-foreground">
                      <th scope="col" className="pb-2 font-medium">Item</th>
                      <th scope="col" className="pb-2 text-right font-medium">Qty</th>
                      <th scope="col" className="pb-2 text-right font-medium">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {receipt.items.map((item, index) => (
                      <tr key={`${item.description}-${index}`} className="border-b last:border-0">
                        <td className="py-2 pr-3">{item.description}</td>
                        <td className="py-2 text-right font-numeric text-muted-foreground">
                          {item.quantity ?? "—"}
                        </td>
                        <td className="py-2 text-right font-numeric">
                          {formatMoney(item.totalCents, currency)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="font-medium">
                      <td className="pt-2">Total</td>
                      <td />
                      <td className="pt-2 text-right font-numeric">
                        {formatMoney(receipt.amountCents, currency)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              )}
            </TabsContent>

            <TabsContent value="activity" className="mt-4 space-y-5">
              <div>
                <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <MessageSquare className="h-3.5 w-3.5" />
                  Comments
                </h3>

                <ul className="mt-3 space-y-3">
                  {comments.length === 0 ? (
                    <li className="text-sm text-muted-foreground">No comments yet.</li>
                  ) : (
                    comments.map((item) => (
                      <li key={item._id} className="flex gap-2.5">
                        <Avatar className="h-7 w-7 shrink-0">
                          <AvatarImage src={item.authorImage} alt="" />
                          <AvatarFallback className="text-[10px]">
                            {initials(item.authorName)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs">
                            <span className="font-medium">{item.authorName}</span>{" "}
                            <span className="text-muted-foreground">
                              {formatRelative(item.createdAt)}
                            </span>
                          </p>
                          <p className="mt-0.5 whitespace-pre-wrap text-sm leading-relaxed">
                            {item.body}
                          </p>
                        </div>
                      </li>
                    ))
                  )}
                </ul>

                {canEdit ? (
                  <form
                    className="mt-3 flex gap-2"
                    onSubmit={async (event) => {
                      event.preventDefault()
                      if (!comment.trim()) return
                      await addComment({ receiptId, body: comment })
                      setComment("")
                    }}
                  >
                    <Input
                      value={comment}
                      onChange={(event) => setComment(event.target.value)}
                      placeholder="Add a comment…"
                      aria-label="Add a comment"
                    />
                    <Button type="submit" size="icon" disabled={!comment.trim()} aria-label="Post comment">
                      <Send className="h-4 w-4" />
                    </Button>
                  </form>
                ) : null}
              </div>

              <div>
                <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <History className="h-3.5 w-3.5" />
                  Timeline
                </h3>
                <ol className="mt-3 space-y-2.5">
                  {timeline.map((event) => (
                    <li key={event._id} className="flex gap-2.5 text-sm">
                      <span
                        aria-hidden
                        className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-border"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block">{event.summary}</span>
                        <span className="block text-xs text-muted-foreground">
                          {event.actorName} · {formatDateTime(event.createdAt)}
                        </span>
                      </span>
                    </li>
                  ))}
                </ol>
              </div>

              {versions.length > 0 ? (
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Edit history
                  </h3>
                  <ul className="mt-3 space-y-2">
                    {versions.map((version) => (
                      <li key={version._id} className="rounded-lg border p-2.5 text-xs">
                        <p className="text-muted-foreground">
                          {formatDateTime(version.createdAt)}
                        </p>
                        <ul className="mt-1 space-y-0.5">
                          {version.changes.map((change, index) => (
                            <li key={`${change.field}-${index}`}>
                              <span className="font-medium">{change.field}</span>:{" "}
                              <span className="text-muted-foreground line-through">
                                {change.from || "empty"}
                              </span>{" "}
                              → <span>{change.to || "empty"}</span>
                            </li>
                          ))}
                        </ul>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </TabsContent>

            <TabsContent value="raw" className="mt-4">
              {ocr?.rawText ? (
                <>
                  <p className="mb-2 text-xs text-muted-foreground">
                    Everything the scanner read, at{" "}
                    {Math.round((ocr.overallConfidence ?? 0) * 100)}% overall confidence.
                  </p>
                  <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded-lg border bg-muted/40 p-3 font-mono text-xs leading-relaxed">
                    {ocr.rawText}
                  </pre>
                </>
              ) : (
                <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
                  No extracted text is available for this receipt.
                </p>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </div>

      {related.length > 0 ? (
        <section>
          <h2 className="text-sm font-semibold tracking-tight">
            Other receipts from {receipt.merchant}
          </h2>
          <ul className="mt-3 space-y-2">
            {related.map((item) => (
              <ReceiptRow key={item._id} receipt={item} />
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  )
}

export function ReceiptDetailError() {
  return (
    <ErrorState
      description="This receipt doesn't exist, or you don't have access to it."
      onRetry={() => window.location.reload()}
    />
  )
}
