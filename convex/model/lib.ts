import type { Doc } from "../_generated/dataModel";

/** ---------- Money ---------- */

/**
 * Parses "1,234.56", "$1 234,56", "1.234,56" and "1,000" into integer cents.
 *
 * Separator disambiguation, in order:
 *  - Both separators present → the last one is the decimal point.
 *  - One separator, repeated → it groups thousands.
 *  - One separator with exactly 3 digits after it → it groups thousands
 *    ("1,000" and "1.000" both mean one thousand, not one).
 *  - Otherwise → it is the decimal point.
 *
 * Digits are assembled as strings rather than via parseFloat, so no amount
 * ever picks up binary floating-point drift on the way to cents.
 */
export function parseAmountToCents(input: string | number): number {
  if (typeof input === "number") {
    return Number.isFinite(input) ? Math.round(input * 100) : 0;
  }

  const cleaned = input.replace(/[^\d.,-]/g, "").trim();
  if (!cleaned) return 0;

  const negative = cleaned.startsWith("-");
  const digitsOnly = cleaned.replace(/-/g, "");
  if (!/\d/.test(digitsOnly)) return 0;

  const lastComma = digitsOnly.lastIndexOf(",");
  const lastDot = digitsOnly.lastIndexOf(".");

  let decimalIndex = -1;
  if (lastComma >= 0 && lastDot >= 0) {
    decimalIndex = Math.max(lastComma, lastDot);
  } else if (lastComma >= 0 || lastDot >= 0) {
    const index = Math.max(lastComma, lastDot);
    const separator = digitsOnly[index];
    const occurrences = digitsOnly.split(separator).length - 1;
    const digitsAfter = digitsOnly.length - index - 1;
    if (occurrences === 1 && digitsAfter !== 3) decimalIndex = index;
  }

  const whole =
    decimalIndex >= 0 ? digitsOnly.slice(0, decimalIndex) : digitsOnly;
  const fraction = decimalIndex >= 0 ? digitsOnly.slice(decimalIndex + 1) : "";

  const wholeDigits = whole.replace(/\D/g, "") || "0";
  const fractionDigits = fraction.replace(/\D/g, "").padEnd(2, "0").slice(0, 2);

  const cents = Number(wholeDigits) * 100 + Number(fractionDigits);
  if (!Number.isSafeInteger(cents)) return 0;

  return negative ? -cents : cents;
}

export function centsToNumber(cents: number): number {
  return Math.round(cents) / 100;
}

/** ---------- Dates ---------- */

export const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function isValidIsoDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function monthKey(isoDate: string): string {
  return isoDate.slice(0, 7);
}

export function yearKey(isoDate: string): string {
  return isoDate.slice(0, 4);
}

export function quarterOf(isoDate: string): number {
  return Math.floor(Number(isoDate.slice(5, 7)) / 3.001) + 1;
}

export function addDaysIso(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function startOfMonthIso(isoDate: string): string {
  return `${isoDate.slice(0, 7)}-01`;
}

export function endOfMonthIso(isoDate: string): string {
  const year = Number(isoDate.slice(0, 4));
  const month = Number(isoDate.slice(5, 7));
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${isoDate.slice(0, 7)}-${String(lastDay).padStart(2, "0")}`;
}

/**
 * Inclusive date range for a budget period containing `reference`.
 * Returns a stable period key used to de-duplicate budget alerts.
 */
export function periodRange(
  period: "monthly" | "quarterly" | "yearly",
  reference: string,
): { from: string; to: string; key: string } {
  const year = Number(reference.slice(0, 4));
  const month = Number(reference.slice(5, 7));

  if (period === "yearly") {
    return { from: `${year}-01-01`, to: `${year}-12-31`, key: `${year}` };
  }

  if (period === "quarterly") {
    const quarter = Math.ceil(month / 3);
    const startMonth = (quarter - 1) * 3 + 1;
    const endMonth = startMonth + 2;
    const lastDay = new Date(Date.UTC(year, endMonth, 0)).getUTCDate();
    return {
      from: `${year}-${String(startMonth).padStart(2, "0")}-01`,
      to: `${year}-${String(endMonth).padStart(2, "0")}-${lastDay}`,
      key: `${year}-Q${quarter}`,
    };
  }

  return {
    from: startOfMonthIso(reference),
    to: endOfMonthIso(reference),
    key: reference.slice(0, 7),
  };
}

/** ---------- Text ---------- */

export function normalizeMerchant(value: string): string {
  return value
    .toLowerCase()
    .replace(/\b(inc|llc|ltd|limited|corp|co|gmbh|pvt|plc|sa|bv)\b\.?/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Denormalized haystack backing the full-text search index. */
export function buildSearchText(parts: {
  merchant: string;
  notes?: string;
  items?: { description: string }[];
  rawOcrText?: string;
  tags?: string[];
  categoryName?: string;
  folderNames?: string[];
  invoiceNumber?: string;
  receiptNumber?: string;
  address?: string;
  paymentMethod?: string;
  currency?: string;
  cardLast4?: string;
  date?: string;
  amountLabel?: string;
}): string {
  const segments = [
    parts.merchant,
    parts.notes,
    parts.categoryName,
    parts.invoiceNumber,
    parts.receiptNumber,
    parts.address,
    parts.paymentMethod,
    parts.currency,
    parts.cardLast4,
    parts.date,
    parts.amountLabel,
    ...(parts.tags ?? []),
    ...(parts.folderNames ?? []),
    ...(parts.items ?? []).map((item) => item.description),
    parts.rawOcrText,
  ];

  return segments
    .filter((segment): segment is string => Boolean(segment && segment.trim()))
    .join(" ")
    .slice(0, 8000);
}

/** ---------- Currency ---------- */

export const SUPPORTED_CURRENCIES = [
  "USD", "EUR", "GBP", "INR", "AED", "CAD", "AUD", "JPY", "CHF", "SGD",
  "NZD", "ZAR", "SEK", "NOK", "DKK", "MXN", "BRL", "CNY", "HKD", "PLN",
] as const;

export function isSupportedCurrency(code: string): boolean {
  return (SUPPORTED_CURRENCIES as readonly string[]).includes(code);
}

/** Currencies whose smallest unit is the unit itself (no minor unit). */
const ZERO_DECIMAL = new Set(["JPY", "KRW", "VND", "CLP", "ISK"]);

export function minorUnitFactor(currency: string): number {
  return ZERO_DECIMAL.has(currency) ? 1 : 100;
}

export function convertCents(
  amountCents: number,
  rate: number,
): number {
  return Math.round(amountCents * rate);
}

/** ---------- Receipt derived state ---------- */

export const LOW_CONFIDENCE_THRESHOLD = 0.75;

export function deriveLowConfidenceFields(
  fieldConfidences: { field: string; confidence: number }[],
): string[] {
  return fieldConfidences
    .filter((entry) => entry.confidence < LOW_CONFIDENCE_THRESHOLD)
    .map((entry) => entry.field);
}

/** A receipt needs human review when key money fields are weak or missing. */
export function computeReceiptStatus(receipt: {
  merchant: string;
  amountCents: number;
  date: string;
  lowConfidenceFields: string[];
}): "needs_review" | "ready" {
  const missingCore =
    !receipt.merchant.trim() || receipt.amountCents <= 0 || !isValidIsoDate(receipt.date);

  const weakCore = receipt.lowConfidenceFields.some((field) =>
    ["merchant", "amount", "date"].includes(field),
  );

  return missingCore || weakCore ? "needs_review" : "ready";
}

/**
 * Picks the best category for a receipt from the workspace's own categories by
 * scoring keyword hits against merchant name and line items.
 */
export function suggestCategory(
  categories: Doc<"categories">[],
  input: { merchant: string; items: { description: string }[]; rawText?: string },
): { categoryId: Doc<"categories">["_id"]; confidence: number } | null {
  const haystack = [
    input.merchant,
    ...input.items.map((item) => item.description),
    input.rawText?.slice(0, 2000) ?? "",
  ]
    .join(" ")
    .toLowerCase();

  if (!haystack.trim()) return null;

  let best: { categoryId: Doc<"categories">["_id"]; score: number } | null = null;

  for (const category of categories) {
    if (category.deletedAt !== undefined) continue;

    let score = 0;
    for (const keyword of category.keywords) {
      if (!keyword) continue;
      if (haystack.includes(keyword)) {
        // Merchant-name hits are far stronger evidence than body-text hits.
        score += input.merchant.toLowerCase().includes(keyword) ? 3 : 1;
      }
    }

    if (score > 0 && (!best || score > best.score)) {
      best = { categoryId: category._id, score };
    }
  }

  if (!best) return null;

  return {
    categoryId: best.categoryId,
    confidence: Math.min(0.5 + best.score * 0.15, 0.97),
  };
}
