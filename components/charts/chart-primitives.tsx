"use client"

import type { ReactNode } from "react"

import { useChartTheme } from "@/lib/chart-theme"
import { cn } from "@/lib/utils"

/**
 * Shared tooltip shell. Values wear text tokens; a colour chip beside the label
 * carries series identity, so identity is never colour-alone.
 */
export function ChartTooltip({
  title,
  rows,
}: {
  title: string
  rows: { label: string; value: string; color?: string }[]
}) {
  const theme = useChartTheme()

  return (
    <div
      className="rounded-lg border px-3 py-2 shadow-lg"
      style={{ background: theme.tooltipBg, borderColor: theme.tooltipBorder }}
    >
      <p className="text-xs font-medium" style={{ color: theme.text }}>
        {title}
      </p>
      <ul className="mt-1.5 space-y-1">
        {rows.map((row) => (
          <li key={row.label} className="flex items-center gap-2 text-xs">
            {row.color ? (
              <span
                aria-hidden
                className="h-2 w-2 shrink-0 rounded-sm"
                style={{ background: row.color }}
              />
            ) : null}
            <span style={{ color: theme.muted }}>{row.label}</span>
            <span className="ml-auto font-medium font-numeric" style={{ color: theme.text }}>
              {row.value}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function ChartLegend({
  items,
  className,
}: {
  items: { label: string; color: string }[]
  className?: string
}) {
  return (
    <ul className={cn("flex flex-wrap items-center gap-x-4 gap-y-1.5", className)}>
      {items.map((item) => (
        <li key={item.label} className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span
            aria-hidden
            className="h-2 w-2 rounded-sm"
            style={{ background: item.color }}
          />
          {item.label}
        </li>
      ))}
    </ul>
  )
}

export function ChartCard({
  title,
  description,
  legend,
  actions,
  children,
  tableView,
  className,
}: {
  title: string
  description?: string
  legend?: ReactNode
  actions?: ReactNode
  children: ReactNode
  /** Accessible equivalent of the chart — required whenever colour carries meaning. */
  tableView?: ReactNode
  className?: string
}) {
  return (
    <section className={cn("rounded-xl border bg-card p-5", className)}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
          {description ? (
            <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
          ) : null}
        </div>
        {actions ? <div className="shrink-0">{actions}</div> : null}
      </div>

      {legend ? <div className="mt-3">{legend}</div> : null}

      <div className="mt-4">{children}</div>

      {tableView ? (
        <details className="mt-4 border-t pt-3">
          <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
            View as table
          </summary>
          <div className="mt-3 overflow-x-auto">{tableView}</div>
        </details>
      ) : null}
    </section>
  )
}
