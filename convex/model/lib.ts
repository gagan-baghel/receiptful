import type { Doc } from "../_generated/dataModel";

/** ---------- Money ---------- */

/**
 * Money lives in `lib/money.ts` so the browser and the backend share one
 * parser, one minor-unit table and one conversion rule. Re-exported here
 * because backend callers reach for `model/lib` by habit.
 */
import { isSupportedCurrency } from "../../lib/money";

export {
  SUPPORTED_CURRENCIES,
  isSupportedCurrency,
  minorUnitFactor,
  minorUnitDigits,
  parseAmountToCents,
  centsToInput,
  convertMinorUnits,
  deriveRate,
  isSaneAmount,
  MAX_AMOUNT_MINOR,
} from "../../lib/money";

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

export function quarterOf(isoDate: string): number {
  return Math.ceil(Number(isoDate.slice(5, 7)) / 3);
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

/**
 * Inclusive date range for a fiscal year labelled `year`, where the year starts
 * on `startMonth` (1-12). A workspace on an April start means "FY2026" runs
 * 2026-04-01 to 2027-03-31 — every "year" calculation used to hardcode
 * January-December and quietly ignore the setting.
 */
export function fiscalYearRange(
  year: string,
  startMonth = 1,
): { from: string; to: string } {
  const start = Math.min(12, Math.max(1, Math.round(startMonth)));
  if (start === 1) return { from: `${year}-01-01`, to: `${year}-12-31` };

  const startYear = Number(year);
  const endYear = startYear + 1;
  const endMonth = start - 1;
  const lastDay = new Date(Date.UTC(endYear, endMonth, 0)).getUTCDate();

  return {
    from: `${startYear}-${String(start).padStart(2, "0")}-01`,
    to: `${endYear}-${String(endMonth).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`,
  };
}

/** Which fiscal year an ISO date falls into, given the workspace start month. */
export function fiscalYearOf(isoDate: string, startMonth = 1): string {
  const start = Math.min(12, Math.max(1, Math.round(startMonth)));
  const year = Number(isoDate.slice(0, 4));
  const month = Number(isoDate.slice(5, 7));
  return String(month >= start ? year : year - 1);
}

/** Quarter within the fiscal year (1-4), not the calendar year. */
export function fiscalQuarterOf(isoDate: string, startMonth = 1): number {
  const start = Math.min(12, Math.max(1, Math.round(startMonth)));
  const month = Number(isoDate.slice(5, 7));
  return Math.floor(((month - start + 12) % 12) / 3) + 1;
}

/** ---------- Text ---------- */

export function normalizeMerchant(value: string): string {
  return value
    .toLowerCase()
    .replace(/[.,]/g, " ")
    .replace(/\s+(inc|llc|ltd|limited|corp|corporation|gmbh|pvt|plc|bv|nv|ag|srl)\s*$/g, "")
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

/** Escapes a keyword for use inside a RegExp. */
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * True when `keyword` appears in `haystack` as a whole word (or whole phrase),
 * not as a substring. Without this, the seeded keyword "bar" matches
 * "Barnes & Noble" and "tea" matches "instead".
 */
export function matchesKeyword(haystack: string, keyword: string): boolean {
  if (!keyword) return false;
  // \b is unreliable next to non-ASCII, so bound on non-word characters.
  const pattern = new RegExp(
    `(^|[^a-z0-9])${escapeRegExp(keyword)}([^a-z0-9]|$)`,
    "i",
  );
  return pattern.test(haystack);
}

/** Below this, a category suggestion is too weak to apply automatically. */
export const CATEGORY_SUGGESTION_THRESHOLD = 0.7;

/**
 * Picks the best category for a receipt from the workspace's own categories by
 * scoring whole-word keyword hits against the merchant name and line items.
 *
 * Raw OCR text is deliberately NOT part of the haystack: it is attacker-
 * controlled text lifted off an image, and letting it steer `taxDeductible`
 * turns a doctored receipt into a tax claim. Merchant and item descriptions are
 * the fields a human would actually read to categorize.
 */
export function suggestCategory(
  categories: Doc<"categories">[],
  input: { merchant: string; items: { description: string }[] },
): { categoryId: Doc<"categories">["_id"]; confidence: number } | null {
  const merchant = input.merchant.toLowerCase();
  const haystack = [input.merchant, ...input.items.map((item) => item.description)]
    .join(" ")
    .toLowerCase();

  if (!haystack.trim()) return null;

  let best: { categoryId: Doc<"categories">["_id"]; score: number } | null = null;

  for (const category of categories) {
    if (category.deletedAt !== undefined) continue;

    let score = 0;
    for (const keyword of category.keywords) {
      const normalized = keyword.trim().toLowerCase();
      if (!normalized) continue;
      if (!matchesKeyword(haystack, normalized)) continue;
      // Merchant-name hits are far stronger evidence than item-text hits.
      score += matchesKeyword(merchant, normalized) ? 3 : 1;
    }

    // Ties break deterministically by name so two workspaces with the same
    // categories always land on the same answer.
    if (score > 0) {
      if (!best || score > best.score) {
        best = { categoryId: category._id, score };
      }
    }
  }

  if (!best) return null;

  const confidence = Math.min(0.4 + best.score * 0.12, 0.97);
  if (confidence < CATEGORY_SUGGESTION_THRESHOLD) return null;

  return { categoryId: best.categoryId, confidence };
}

/**
 * Deterministic checks against the model's own numbers. Self-reported
 * confidence is not calibrated, so this is what actually routes a bad
 * extraction to a human: arithmetic that does not add up, a date that cannot
 * be right, or a currency we do not support.
 */
export function findInconsistencies(input: {
  amountCents?: number;
  subtotalCents?: number;
  taxCents?: number;
  tipCents?: number;
  itemTotalCents?: number;
  date?: string;
  currency?: string;
  today?: string;
}): string[] {
  const flags: string[] = [];
  const total = input.amountCents;

  if (total !== undefined) {
    if (total <= 0) flags.push("amount");

    const parts = [input.subtotalCents, input.taxCents, input.tipCents];
    if (input.subtotalCents !== undefined && parts.some((p) => p !== undefined)) {
      const sum = parts.reduce<number>((acc, part) => acc + (part ?? 0), 0);
      // One minor unit of slack per component covers legitimate rounding.
      if (Math.abs(sum - total) > 3) flags.push("amount");
    }

    if (input.taxCents !== undefined && input.taxCents > total) flags.push("tax");

    if (input.itemTotalCents !== undefined && input.itemTotalCents > 0) {
      // Line items rarely cover tip, so only flag when they overshoot the total.
      if (input.itemTotalCents > total + 3) flags.push("amount");
    }
  }

  if (input.date) {
    const today = input.today ?? new Date().toISOString().slice(0, 10);
    const tenYearsAgo = `${Number(today.slice(0, 4)) - 10}${today.slice(4)}`;
    if (input.date > today || input.date < tenYearsAgo) flags.push("date");
  }

  if (input.currency && !isSupportedCurrency(input.currency.toUpperCase())) {
    flags.push("currency");
  }

  return [...new Set(flags)];
}
