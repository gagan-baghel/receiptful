/**
 * Formatting helpers. Money always arrives from the backend as integer minor
 * units — never format a float you did arithmetic on. Parsing, minor units and
 * conversion all live in `lib/money.ts`; this file only renders.
 */

import { minorUnitDigits, minorUnitFactor, parseAmountToCents } from "./money"

export { centsToInput, minorUnitDigits, minorUnitFactor } from "./money"

/**
 * `undefined` tells Intl to use the viewer's own locale, so a European user
 * sees European grouping and date order instead of a hardcoded en-US.
 */
const VIEWER_LOCALE: string | undefined = undefined

export function formatMoney(
  cents: number,
  currency = "USD",
  options: { compact?: boolean; signed?: boolean; locale?: string } = {},
) {
  const digits = minorUnitDigits(currency)
  const value = cents / minorUnitFactor(currency)

  const formatter = new Intl.NumberFormat(options.locale ?? VIEWER_LOCALE, {
    style: "currency",
    currency,
    minimumFractionDigits: options.compact ? 0 : digits,
    maximumFractionDigits: options.compact && Math.abs(value) >= 1000 ? 0 : digits,
    notation: options.compact && Math.abs(value) >= 10000 ? "compact" : "standard",
  })

  const formatted = formatter.format(value)
  return options.signed && cents > 0 ? `+${formatted}` : formatted
}

/**
 * Inverse of `centsToInput`, tolerant of what people actually type. Delegates
 * to the shared parser so "1,234.56" can never be read as 1.23 — the bug this
 * function used to have when it did its own comma stripping.
 */
export function inputToCents(input: string, currency = "USD"): number {
  return parseAmountToCents(input, currency)
}

export function formatPercent(value: number, options: { signed?: boolean } = {}) {
  const rounded = Math.round(value)
  return options.signed && rounded > 0 ? `+${rounded}%` : `${rounded}%`
}

const DATE_FORMATTER = new Intl.DateTimeFormat(VIEWER_LOCALE, {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
})

const SHORT_DATE_FORMATTER = new Intl.DateTimeFormat(VIEWER_LOCALE, {
  month: "short",
  day: "numeric",
  timeZone: "UTC",
})

/** `date` is always an ISO yyyy-mm-dd string from the backend. */
export function formatDate(date: string, options: { short?: boolean } = {}) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return date
  const parsed = new Date(`${date}T00:00:00Z`)
  if (Number.isNaN(parsed.getTime())) return date
  return options.short
    ? SHORT_DATE_FORMATTER.format(parsed)
    : DATE_FORMATTER.format(parsed)
}

export function formatDateTime(timestamp: number) {
  return new Intl.DateTimeFormat(VIEWER_LOCALE, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(timestamp))
}

/** "just now" / "3h ago" / "Mar 4" — for timelines and activity feeds. */
export function formatRelative(timestamp: number) {
  const seconds = Math.round((Date.now() - timestamp) / 1000)

  if (seconds < 45) return "just now"
  if (seconds < 3600) return `${Math.round(seconds / 60)}m ago`
  if (seconds < 86_400) return `${Math.round(seconds / 3600)}h ago`
  if (seconds < 604_800) return `${Math.round(seconds / 86_400)}d ago`

  return new Intl.DateTimeFormat(VIEWER_LOCALE, {
    month: "short",
    day: "numeric",
    year:
      new Date(timestamp).getFullYear() === new Date().getFullYear()
        ? undefined
        : "numeric",
  }).format(new Date(timestamp))
}

export function formatBytes(bytes: number) {
  if (bytes <= 0) return "0 B"
  const units = ["B", "KB", "MB", "GB", "TB"]
  const exponent = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1,
  )
  const value = bytes / 1024 ** exponent
  return `${value.toFixed(value >= 100 || exponent === 0 ? 0 : 1)} ${units[exponent]}`
}

export function todayIso() {
  return new Date().toISOString().slice(0, 10)
}

export function isoDaysAgo(days: number) {
  const date = new Date()
  date.setUTCDate(date.getUTCDate() - days)
  return date.toISOString().slice(0, 10)
}

export function startOfMonthIso(date = todayIso()) {
  return `${date.slice(0, 7)}-01`
}

export function endOfMonthIso(date = todayIso()) {
  const year = Number(date.slice(0, 4))
  const month = Number(date.slice(5, 7))
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate()
  return `${date.slice(0, 7)}-${String(lastDay).padStart(2, "0")}`
}

export function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return "?"
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase()
}

export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  card: "Card",
  cash: "Cash",
  bank_transfer: "Bank transfer",
  wallet: "Wallet",
  cheque: "Cheque",
  other: "Other",
  unknown: "Not set",
}

export const RECEIPT_STATUS_LABELS: Record<string, string> = {
  uploading: "Uploading",
  processing: "Processing",
  needs_review: "Needs review",
  ready: "Ready",
  failed: "Failed",
}

export const ROLE_LABELS: Record<string, string> = {
  owner: "Owner",
  admin: "Admin",
  manager: "Manager",
  member: "Member",
  viewer: "Viewer",
}

export const ROLE_DESCRIPTIONS: Record<string, string> = {
  owner: "Full control, including billing and ownership transfer.",
  admin: "Manage members, categories and workspace settings.",
  manager: "Approve expenses, manage budgets, see everyone's receipts.",
  member: "Add and edit their own receipts, submit reports.",
  viewer: "Read-only access to receipts and reports.",
}
