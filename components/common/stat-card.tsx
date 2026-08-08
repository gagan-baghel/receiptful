import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react"
import Link from "next/link"
import type { ComponentType, ReactNode } from "react"

import { cn } from "@/lib/utils"

export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  changePercent,
  /** Set when spending more is the bad direction (most money metrics). */
  invertChange = true,
  href,
  accessory,
  className,
}: {
  label: string
  value: string
  hint?: string
  icon?: ComponentType<{ className?: string }>
  changePercent?: number | null
  invertChange?: boolean
  href?: string
  accessory?: ReactNode
  className?: string
}) {
  const hasChange = changePercent !== null && changePercent !== undefined
  const isFlat = hasChange && Math.round(changePercent) === 0
  const isUp = hasChange && changePercent > 0
  const isGood = hasChange && !isFlat && (invertChange ? !isUp : isUp)

  const body = (
    <div
      className={cn(
        "group relative flex h-full flex-col justify-between rounded-xl border bg-card p-5 transition-colors",
        href && "hover:border-foreground/20 hover:bg-accent/40",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        {Icon ? <Icon className="h-4 w-4 shrink-0 text-muted-foreground" /> : null}
      </div>

      <div className="mt-3">
        <p className="text-2xl font-semibold tracking-tight font-numeric">{value}</p>

        <div className="mt-2 flex items-center gap-2 text-xs">
          {hasChange ? (
            <span
              className={cn(
                "inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 font-medium font-numeric",
                isFlat
                  ? "bg-muted text-muted-foreground"
                  : isGood
                    ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                    : "bg-rose-500/10 text-rose-600 dark:text-rose-400",
              )}
            >
              {isFlat ? (
                <Minus className="h-3 w-3" />
              ) : isUp ? (
                <ArrowUpRight className="h-3 w-3" />
              ) : (
                <ArrowDownRight className="h-3 w-3" />
              )}
              {Math.abs(Math.round(changePercent))}%
            </span>
          ) : null}
          {hint ? <span className="truncate text-muted-foreground">{hint}</span> : null}
        </div>
      </div>

      {accessory ? <div className="mt-4">{accessory}</div> : null}
    </div>
  )

  if (!href) return body

  return (
    <Link href={href} className="rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
      {body}
    </Link>
  )
}
