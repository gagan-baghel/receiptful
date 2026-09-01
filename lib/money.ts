/**
 * The single money module. Both the Convex backend and the browser import from
 * here, so there is exactly one parser, one minor-unit table, and one
 * conversion rule in the product.
 *
 * Storage contract: every `*Cents` field holds an integer number of *minor
 * units of its own currency*. USD 12.34 is 1234. JPY 10000 is 10000, not
 * 1000000 — JPY has no minor unit. `baseAmountCents` holds minor units of the
 * workspace's base currency, which may have a different minor-unit factor than
 * the receipt's own currency, so conversion always goes through major units.
 */

export const SUPPORTED_CURRENCIES = [
  "USD", "EUR", "GBP", "INR", "AED", "CAD", "AUD", "JPY", "CHF", "SGD",
  "NZD", "ZAR", "SEK", "NOK", "DKK", "MXN", "BRL", "CNY", "HKD", "PLN",
] as const

export type SupportedCurrency = (typeof SUPPORTED_CURRENCIES)[number]

export function isSupportedCurrency(code: string): boolean {
  return (SUPPORTED_CURRENCIES as readonly string[]).includes(code)
}

/** Currencies whose smallest unit is the unit itself — no minor unit exists. */
const ZERO_DECIMAL = new Set(["JPY", "KRW", "VND", "CLP", "ISK"])

/** How many minor units make one major unit of `currency`. */
export function minorUnitFactor(currency: string): number {
  return ZERO_DECIMAL.has(currency.toUpperCase()) ? 1 : 100
}

/** Decimal places to render for `currency`. */
export function minorUnitDigits(currency: string): number {
  return ZERO_DECIMAL.has(currency.toUpperCase()) ? 0 : 2
}

/**
 * Parses what a human or an OCR model actually writes into integer minor units.
 *
 * Separator disambiguation, in order:
 *  - Both separators present → the last one is the decimal point.
 *  - One separator, repeated → it groups thousands.
 *  - One separator with exactly 3 digits after it → it groups thousands
 *    ("1,000" and "1.000" both mean one thousand, not one).
 *  - Otherwise → it is the decimal point.
 *
 * Digits are assembled as strings rather than via parseFloat, so no amount ever
 * picks up binary floating-point drift on the way to minor units, and a
 * thousands separator can never be mistaken for a decimal point.
 */
export function parseAmountToCents(
  input: string | number,
  currency = "USD",
): number {
  const factor = minorUnitFactor(currency)

  if (typeof input === "number") {
    return Number.isFinite(input) ? Math.round(input * factor) : 0
  }

  const cleaned = input.replace(/[^\d.,-]/g, "").trim()
  if (!cleaned) return 0

  const negative = cleaned.startsWith("-")
  const digitsOnly = cleaned.replace(/-/g, "")
  if (!/\d/.test(digitsOnly)) return 0

  const lastComma = digitsOnly.lastIndexOf(",")
  const lastDot = digitsOnly.lastIndexOf(".")

  let decimalIndex = -1
  if (lastComma >= 0 && lastDot >= 0) {
    decimalIndex = Math.max(lastComma, lastDot)
  } else if (lastComma >= 0 || lastDot >= 0) {
    const index = Math.max(lastComma, lastDot)
    const separator = digitsOnly[index]
    const occurrences = digitsOnly.split(separator).length - 1
    const digitsAfter = digitsOnly.length - index - 1
    if (occurrences === 1 && digitsAfter !== 3) decimalIndex = index
  }

  const whole = decimalIndex >= 0 ? digitsOnly.slice(0, decimalIndex) : digitsOnly
  const fraction = decimalIndex >= 0 ? digitsOnly.slice(decimalIndex + 1) : ""

  const wholeDigits = whole.replace(/\D/g, "") || "0"

  if (factor === 1) {
    // No minor unit: any fractional part is noise on this currency, but it must
    // still round rather than truncate so 999.6 does not become 999.
    const value = Number(`${wholeDigits}.${fraction.replace(/\D/g, "") || "0"}`)
    const rounded = Math.round(value)
    if (!Number.isSafeInteger(rounded)) return 0
    return negative ? -rounded : rounded
  }

  const fractionDigits = fraction.replace(/\D/g, "").padEnd(2, "0").slice(0, 2)
  const cents = Number(wholeDigits) * 100 + Number(fractionDigits)
  if (!Number.isSafeInteger(cents)) return 0

  return negative ? -cents : cents
}

/** Minor units → a bare decimal string for inputs and CSV cells. */
export function centsToInput(
  cents: number | null | undefined,
  currency = "USD",
): string {
  if (cents === null || cents === undefined) return ""
  const digits = minorUnitDigits(currency)
  return (cents / minorUnitFactor(currency)).toFixed(digits)
}

/**
 * Converts minor units of `from` into minor units of `to`, where `rate` is the
 * number of major units of `to` per one major unit of `from`. Routing through
 * major units is what makes a USD↔JPY pair come out right.
 */
export function convertMinorUnits(
  amountMinor: number,
  rate: number,
  from: string,
  to: string,
): number {
  if (!Number.isFinite(rate) || rate <= 0) rate = 1
  const major = amountMinor / minorUnitFactor(from)
  return Math.round(major * rate * minorUnitFactor(to))
}

/**
 * Rate to convert one major unit of `from` into major units of `to`, given an
 * FX snapshot quoted against `snapshotBase`. Returns null when either leg is
 * missing so callers can decide what to do rather than silently using 1.
 */
export function deriveRate(
  rates: Record<string, number> | null | undefined,
  from: string,
  to: string,
  snapshotBase = "USD",
): number | null {
  const source = from.toUpperCase()
  const target = to.toUpperCase()
  if (source === target) return 1
  if (!rates) return null

  const perBase = (code: string) =>
    code === snapshotBase.toUpperCase() ? 1 : rates[code]

  const fromRate = perBase(source)
  const toRate = perBase(target)

  if (!Number.isFinite(fromRate) || !Number.isFinite(toRate)) return null
  if (!fromRate || fromRate <= 0 || !toRate || toRate <= 0) return null

  return toRate / fromRate
}

/** Guard for anything that ends up in a money column. */
export const MAX_AMOUNT_MINOR = 1_000_000_000_00

export function isSaneAmount(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= MAX_AMOUNT_MINOR
  )
}
