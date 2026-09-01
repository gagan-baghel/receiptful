import type { QueryCtx } from "../_generated/server";
import { convertMinorUnits, deriveRate } from "../../lib/money";

/**
 * Currency conversion, resolved against the daily FX snapshot that
 * `maintenance.refreshExchangeRates` writes.
 *
 * Every receipt stores both the rate it was converted at and the resulting
 * `baseAmountCents`, so a later rate refresh never silently rewrites history —
 * a receipt's contribution to a total is whatever it was worth on the day it
 * was captured, which is also what an accountant expects.
 */

/** Snapshot rates are quoted per one unit of this base. */
const SNAPSHOT_BASE = "USD";

/** Beyond this the snapshot is old enough to be worth flagging, not refusing. */
const STALE_AFTER_MS = 7 * 24 * 60 * 60 * 1000;

export type RateResolution = {
  /** Major units of the workspace base per one major unit of the receipt currency. */
  rate: number;
  /** False when no snapshot covered this pair and the rate fell back to 1. */
  resolved: boolean;
  /** True when a rate was found but the snapshot is over a week old. */
  stale: boolean;
};

/**
 * Resolves `from` → `to`. Returns `resolved: false` with a rate of 1 rather
 * than throwing: a missing rate must never block someone from saving a
 * receipt, and the caller records the fact so the UI can ask for a manual rate.
 */
export async function resolveRate(
  ctx: QueryCtx,
  from: string,
  to: string,
): Promise<RateResolution> {
  const source = (from || to).toUpperCase();
  const target = to.toUpperCase();

  if (source === target) return { rate: 1, resolved: true, stale: false };

  const snapshot = await ctx.db
    .query("exchangeRates")
    .withIndex("by_base", (q) => q.eq("base", SNAPSHOT_BASE))
    .unique();

  if (!snapshot) return { rate: 1, resolved: false, stale: false };

  let rates: Record<string, number>;
  try {
    rates = JSON.parse(snapshot.ratesJson) as Record<string, number>;
  } catch {
    return { rate: 1, resolved: false, stale: false };
  }

  const rate = deriveRate(rates, source, target, SNAPSHOT_BASE);
  if (rate === null) return { rate: 1, resolved: false, stale: false };

  return {
    rate,
    resolved: true,
    stale: Date.now() - snapshot.fetchedAt > STALE_AFTER_MS,
  };
}

/**
 * Everything a receipt write needs to keep its base-currency figure truthful.
 * Callers patch both fields together — they are meaningless apart.
 */
export async function convertForWorkspace(
  ctx: QueryCtx,
  args: {
    amountCents: number;
    currency: string;
    baseCurrency: string;
    /** Set to keep a rate the user entered by hand instead of re-resolving. */
    overrideRate?: number;
  },
): Promise<{ exchangeRate: number; baseAmountCents: number; resolved: boolean }> {
  const resolution =
    args.overrideRate !== undefined && args.overrideRate > 0
      ? { rate: args.overrideRate, resolved: true, stale: false }
      : await resolveRate(ctx, args.currency, args.baseCurrency);

  return {
    exchangeRate: resolution.rate,
    baseAmountCents: convertMinorUnits(
      args.amountCents,
      resolution.rate,
      args.currency,
      args.baseCurrency,
    ),
    resolved: resolution.resolved,
  };
}
