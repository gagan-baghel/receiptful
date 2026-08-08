"use client"

import {
  AlertTriangle,
  Archive,
  Copy,
  Files,
  Loader2,
  MoreHorizontal,
  Receipt as ReceiptIcon,
  Trash2,
} from "lucide-react"
import Link from "next/link"
import type { ReactNode } from "react"

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
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import type { Doc, Id } from "@/convex/_generated/dataModel"
import { formatDate, formatMoney } from "@/lib/format"
import { cn } from "@/lib/utils"

export type ReceiptSummary = {
  _id: Id<"receipts">
  status: Doc<"receipts">["status"]
  merchant: string
  amountCents: number
  baseAmountCents: number
  currency: string
  date: string
  categoryId?: Id<"categories">
  category: { _id: Id<"categories">; name: string; color: string; icon: string } | null
  tags: { _id: Id<"tags">; name: string; color: string }[]
  taxDeductible: boolean
  classification: "business" | "personal"
  approvalStatus: Doc<"receipts">["approvalStatus"]
  lowConfidenceFields: string[]
  reviewedAt?: number
  duplicateOfId?: Id<"receipts">
  isArchived: boolean
  pageCount: number
  thumbnailUrl: string | null
}

function StatusBadge({ receipt }: { receipt: ReceiptSummary }) {
  if (receipt.status === "processing" || receipt.status === "uploading") {
    return (
      <Badge variant="secondary" className="gap-1">
        <Loader2 className="h-3 w-3 animate-spin" />
        Reading
      </Badge>
    )
  }

  if (receipt.duplicateOfId) {
    return (
      <Badge variant="outline" className="gap-1 border-amber-500/40 text-amber-600 dark:text-amber-400">
        <Copy className="h-3 w-3" />
        Possible duplicate
      </Badge>
    )
  }

  if (receipt.status === "failed") {
    return (
      <Badge variant="destructive" className="gap-1">
        <AlertTriangle className="h-3 w-3" />
        Couldn&rsquo;t read
      </Badge>
    )
  }

  if (receipt.status === "needs_review") {
    return (
      <Badge variant="outline" className="gap-1 border-amber-500/40 text-amber-600 dark:text-amber-400">
        <AlertTriangle className="h-3 w-3" />
        Needs review
      </Badge>
    )
  }

  return null
}

function Thumbnail({
  receipt,
  className,
}: {
  receipt: ReceiptSummary
  className?: string
}) {
  return (
    <span
      className={cn(
        "relative flex shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted",
        className,
      )}
    >
      {receipt.thumbnailUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={receipt.thumbnailUrl}
          alt=""
          loading="lazy"
          decoding="async"
          className="h-full w-full object-cover"
        />
      ) : (
        <ReceiptIcon className="h-5 w-5 text-muted-foreground" />
      )}
      {receipt.pageCount > 1 ? (
        <span className="absolute bottom-0.5 right-0.5 flex items-center gap-0.5 rounded bg-background/90 px-1 text-[10px] font-medium font-numeric">
          <Files className="h-2.5 w-2.5" />
          {receipt.pageCount}
        </span>
      ) : null}
    </span>
  )
}

export function ReceiptRow({
  receipt,
  selected,
  onSelectedChange,
  actions,
}: {
  receipt: ReceiptSummary
  selected?: boolean
  onSelectedChange?: (selected: boolean) => void
  actions?: ReactNode
}) {
  return (
    <li
      className={cn(
        "group relative flex items-center gap-3 rounded-xl border bg-card p-3 transition-colors",
        selected ? "border-primary/50 bg-primary/5" : "hover:bg-accent/40",
      )}
    >
      {onSelectedChange ? (
        <Checkbox
          checked={selected}
          onCheckedChange={(value) => onSelectedChange(value === true)}
          aria-label={`Select receipt from ${receipt.merchant || "unknown merchant"}`}
          className="shrink-0"
        />
      ) : null}

      <Link
        href={`/dashboard/receipts/${receipt._id}`}
        className="flex min-w-0 flex-1 items-center gap-3 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Thumbnail receipt={receipt} className="h-12 w-12" />

        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="truncate text-sm font-medium">
              {receipt.merchant || "Untitled receipt"}
            </span>
            {receipt.isArchived ? (
              <Archive className="h-3 w-3 shrink-0 text-muted-foreground" />
            ) : null}
          </span>

          <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
            <span>{formatDate(receipt.date, { short: true })}</span>
            {receipt.category ? (
              <>
                <span aria-hidden>·</span>
                <span className="inline-flex items-center gap-1">
                  <span
                    aria-hidden
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ backgroundColor: receipt.category.color }}
                  />
                  {receipt.category.name}
                </span>
              </>
            ) : null}
            {receipt.tags.slice(0, 2).map((tag) => (
              <Badge key={tag._id} variant="secondary" className="h-4 px-1.5 text-[10px]">
                {tag.name}
              </Badge>
            ))}
            {receipt.tags.length > 2 ? (
              <span className="text-[10px]">+{receipt.tags.length - 2}</span>
            ) : null}
          </span>
        </span>

        <span className="flex shrink-0 flex-col items-end gap-1">
          <span className="text-sm font-semibold font-numeric">
            {formatMoney(receipt.amountCents, receipt.currency)}
          </span>
          <StatusBadge receipt={receipt} />
        </span>
      </Link>

      {actions ? <span className="shrink-0">{actions}</span> : null}
    </li>
  )
}

export function ReceiptCard({
  receipt,
  selected,
  onSelectedChange,
}: {
  receipt: ReceiptSummary
  selected?: boolean
  onSelectedChange?: (selected: boolean) => void
}) {
  return (
    <li
      className={cn(
        "group relative overflow-hidden rounded-xl border bg-card transition-colors",
        selected ? "border-primary/50 ring-1 ring-primary/30" : "hover:border-foreground/20",
      )}
    >
      {onSelectedChange ? (
        <Checkbox
          checked={selected}
          onCheckedChange={(value) => onSelectedChange(value === true)}
          aria-label={`Select receipt from ${receipt.merchant || "unknown merchant"}`}
          className="absolute left-2.5 top-2.5 z-10 bg-background/90"
        />
      ) : null}

      <Link
        href={`/dashboard/receipts/${receipt._id}`}
        className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="flex aspect-[4/3] w-full items-center justify-center overflow-hidden bg-muted">
          {receipt.thumbnailUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={receipt.thumbnailUrl}
              alt=""
              loading="lazy"
              decoding="async"
              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
            />
          ) : (
            <ReceiptIcon className="h-8 w-8 text-muted-foreground" />
          )}
        </span>

        <span className="block p-3">
          <span className="flex items-start justify-between gap-2">
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium">
                {receipt.merchant || "Untitled receipt"}
              </span>
              <span className="mt-0.5 block text-xs text-muted-foreground">
                {formatDate(receipt.date, { short: true })}
              </span>
            </span>
            <span className="shrink-0 text-sm font-semibold font-numeric">
              {formatMoney(receipt.amountCents, receipt.currency)}
            </span>
          </span>

          <span className="mt-2 flex flex-wrap items-center gap-1.5">
            {receipt.category ? (
              <Badge variant="secondary" className="h-5 gap-1 px-1.5 text-[10px]">
                <span
                  aria-hidden
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ backgroundColor: receipt.category.color }}
                />
                {receipt.category.name}
              </Badge>
            ) : null}
            <StatusBadge receipt={receipt} />
          </span>
        </span>
      </Link>
    </li>
  )
}

export function ReceiptRowActions({
  onArchive,
  onDelete,
  onDuplicate,
  isArchived,
}: {
  onArchive: () => void
  onDelete: () => void
  onDuplicate: () => void
  isArchived: boolean
}) {
  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Receipt actions">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent>Actions</TooltipContent>
      </Tooltip>

      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={onDuplicate}>
          <Copy className="h-3.5 w-3.5" />
          Duplicate
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onArchive}>
          <Archive className="h-3.5 w-3.5" />
          {isArchived ? "Unarchive" : "Archive"}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={onDelete} className="text-destructive focus:text-destructive">
          <Trash2 className="h-3.5 w-3.5" />
          Move to trash
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
