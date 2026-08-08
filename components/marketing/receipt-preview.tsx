import { AlertTriangle, Check, Files } from "lucide-react"

/**
 * An honest, at-scale rendering of the actual receipts list — same row anatomy,
 * same badges, same mono figures the product ships. No blurred fake screenshots.
 */

const ROWS = [
  {
    merchant: "Blue Bottle Coffee",
    meta: "Aug 4 · Food & Dining",
    dot: "#f59e0b",
    amount: "$27.54",
    state: "reviewed" as const,
    pages: 1,
  },
  {
    merchant: "Shell Service Station",
    meta: "Aug 3 · Fuel & Transport",
    dot: "#3b82f6",
    amount: "$68.20",
    state: "reviewed" as const,
    pages: 1,
  },
  {
    merchant: "Hyatt Regency",
    meta: "Aug 2 · Hotel & Lodging",
    dot: "#0ea5e9",
    amount: "$412.00",
    state: "review" as const,
    pages: 3,
  },
  {
    merchant: "Figma",
    meta: "Aug 1 · Subscriptions",
    dot: "#a855f7",
    amount: "$45.00",
    state: "reviewed" as const,
    pages: 1,
  },
]

export function ReceiptPreview() {
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-[0_24px_70px_-24px_hsl(30_8%_8%/0.35)]">
      <div className="flex items-center justify-between border-b px-5 py-4">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            August
          </p>
          <p className="mt-0.5 text-lg font-semibold">Receipts</p>
        </div>
        <div className="text-right">
          <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            Month to date
          </p>
          <p className="mt-0.5 font-numeric text-lg font-semibold">$552.74</p>
        </div>
      </div>

      <ul className="divide-y">
        {ROWS.map((row) => (
          <li key={row.merchant} className="flex items-center gap-3 px-5 py-3.5">
            <span className="relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-muted">
              <span className="h-6 w-4 rounded-[2px] bg-foreground/10" />
              {row.pages > 1 ? (
                <span className="absolute bottom-0 right-0 flex items-center gap-0.5 rounded bg-background/90 px-0.5 text-[9px] font-medium">
                  <Files className="h-2 w-2" />
                  {row.pages}
                </span>
              ) : null}
            </span>

            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{row.merchant}</span>
              <span className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                <span
                  aria-hidden
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ backgroundColor: row.dot }}
                />
                {row.meta}
              </span>
            </span>

            <span className="flex shrink-0 flex-col items-end gap-1">
              <span className="font-numeric text-sm font-semibold">{row.amount}</span>
              {row.state === "review" ? (
                <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/40 px-1.5 py-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-400">
                  <AlertTriangle className="h-2.5 w-2.5" />
                  Needs review
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                  <Check className="h-2.5 w-2.5" />
                  Reviewed
                </span>
              )}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** The extraction panel, showing the confidence-flagging that defines the product. */
export function ExtractionPreview() {
  const fields = [
    { label: "Merchant", value: "Blue Bottle Coffee", flagged: false },
    { label: "Date", value: "2026-08-04", flagged: false },
    { label: "Subtotal", value: "$22.00", flagged: false },
    { label: "Sales tax", value: "$2.04", flagged: true },
    { label: "Total", value: "$27.54", flagged: false },
  ]

  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-[0_20px_60px_-30px_hsl(30_8%_8%/0.4)]">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold">Extracted fields</p>
        <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
          94% confidence
        </span>
      </div>

      <dl className="mt-4 space-y-2.5">
        {fields.map((field) => (
          <div key={field.label} className="flex items-center justify-between gap-3">
            <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
              {field.label}
              {field.flagged ? (
                <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[9px] font-medium text-amber-600 dark:text-amber-400">
                  Check
                </span>
              ) : null}
            </dt>
            <dd
              className={`font-numeric text-sm ${
                field.flagged
                  ? "rounded-md bg-amber-500/10 px-1.5 py-0.5 text-amber-700 dark:text-amber-400"
                  : ""
              }`}
            >
              {field.value}
            </dd>
          </div>
        ))}
      </dl>

      <p className="mt-4 border-t pt-3 text-xs leading-relaxed text-muted-foreground">
        One field was uncertain. That&rsquo;s the only thing asking for your attention.
      </p>
    </div>
  )
}
