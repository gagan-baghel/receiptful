"use client"

import { AlertTriangle, Loader2, RefreshCw, WifiOff } from "lucide-react"
import type { ComponentType, ReactNode } from "react"

import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  secondaryAction,
  className,
}: {
  icon: ComponentType<{ className?: string }>
  title: string
  description: string
  action?: ReactNode
  secondaryAction?: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-xl border border-dashed px-6 py-14 text-center",
        className,
      )}
    >
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <Icon className="h-5 w-5" />
      </span>
      <h3 className="mt-4 text-base font-semibold tracking-tight">{title}</h3>
      <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-muted-foreground text-pretty">
        {description}
      </p>
      {action || secondaryAction ? (
        <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
          {action}
          {secondaryAction}
        </div>
      ) : null}
    </div>
  )
}

export function ErrorState({
  title = "Something went wrong",
  description,
  onRetry,
}: {
  title?: string
  description: string
  onRetry?: () => void
}) {
  return (
    <div
      role="alert"
      className="flex flex-col items-center justify-center rounded-xl border border-destructive/30 bg-destructive/5 px-6 py-12 text-center"
    >
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
        <AlertTriangle className="h-5 w-5" />
      </span>
      <h3 className="mt-4 text-base font-semibold tracking-tight">{title}</h3>
      <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-muted-foreground text-pretty">
        {description}
      </p>
      {onRetry ? (
        <Button variant="outline" size="sm" className="mt-5" onClick={onRetry}>
          <RefreshCw className="h-3.5 w-3.5" />
          Try again
        </Button>
      ) : null}
    </div>
  )
}

export function OfflineBanner() {
  return (
    <div
      role="status"
      className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-400"
    >
      <WifiOff className="h-4 w-4 shrink-0" />
      You&rsquo;re offline. Changes will sync automatically once you reconnect.
    </div>
  )
}

export function Spinner({ label = "Loading" }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin" />
      <span>{label}</span>
      <span className="sr-only" role="status" aria-live="polite">
        {label}
      </span>
    </div>
  )
}

export function StatCardSkeleton() {
  return (
    <div className="rounded-xl border p-5">
      <Skeleton className="h-3.5 w-24" />
      <Skeleton className="mt-3 h-8 w-32" />
      <Skeleton className="mt-3 h-3 w-20" />
    </div>
  )
}

export function ReceiptRowSkeleton() {
  return (
    <div className="flex items-center gap-3 rounded-xl border p-3">
      <Skeleton className="h-12 w-12 shrink-0 rounded-lg" />
      <div className="min-w-0 flex-1 space-y-2">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-3 w-24" />
      </div>
      <Skeleton className="h-5 w-16" />
    </div>
  )
}

export function ListSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="space-y-2" aria-hidden>
      {Array.from({ length: rows }, (_, index) => (
        <ReceiptRowSkeleton key={index} />
      ))}
    </div>
  )
}

export function ChartSkeleton({ className }: { className?: string }) {
  return <Skeleton className={cn("h-[260px] w-full rounded-xl", className)} />
}
