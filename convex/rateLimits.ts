import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { RATE_LIMIT, type RateLimitState } from "../lib/rateLimit";

/**
 * Convex-backed rate limiter for password sign-in, sign-up, and reset
 * requests. State is stored per identifier (lower-cased email or hashed IP)
 * so the limit is shared across devices and refreshes. Lockout window is
 * short on purpose — the goal is to blunt credential stuffing, not to lock
 * honest users out for hours.
 */

const FLOWS = ["signIn", "signUp", "reset"] as const;
type Flow = (typeof FLOWS)[number];

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

function deriveState(
  record: {
    failedCount: number;
    lockedUntil?: number | undefined;
    lastFailedAt: number;
  } | null,
): RateLimitState {
  const now = nowSeconds();
  if (!record) {
    return {
      allowed: true,
      retryAfterSeconds: 0,
      failedCount: 0,
      warning: false,
    };
  }

  if (record.lockedUntil && record.lockedUntil > now) {
    return {
      allowed: false,
      retryAfterSeconds: record.lockedUntil - now,
      failedCount: record.failedCount,
      warning: true,
    };
  }

  const warning = record.failedCount >= RATE_LIMIT.warnAfter;
  return {
    allowed: true,
    retryAfterSeconds: 0,
    failedCount: record.failedCount,
    warning,
  };
}

/** Pre-flight check. The form calls this before submitting credentials. */
export const check = query({
  args: {
    identifier: v.string(),
    flow: v.union(v.literal("signIn"), v.literal("signUp"), v.literal("reset")),
  },
  handler: async (ctx, args): Promise<RateLimitState> => {
    const flow: Flow = args.flow;
    const identifier = args.identifier.trim().toLowerCase();
    if (!identifier) {
      return {
        allowed: true,
        retryAfterSeconds: 0,
        failedCount: 0,
        warning: false,
      };
    }

    const record = await ctx.db
      .query("loginAttempts")
      .withIndex("by_identifier_flow", (q) =>
        q.eq("identifier", identifier).eq("flow", flow),
      )
      .first();

    return deriveState(record);
  },
});

/** Increment the counter; promote to a lockout when the threshold is hit. */
export const recordFailure = mutation({
  args: {
    identifier: v.string(),
    flow: v.union(v.literal("signIn"), v.literal("signUp"), v.literal("reset")),
  },
  handler: async (ctx, args): Promise<RateLimitState> => {
    const flow: Flow = args.flow;
    const identifier = args.identifier.trim().toLowerCase();
    if (!identifier) {
      return {
        allowed: true,
        retryAfterSeconds: 0,
        failedCount: 0,
        warning: false,
      };
    }

    const now = nowSeconds();
    const existing = await ctx.db
      .query("loginAttempts")
      .withIndex("by_identifier_flow", (q) =>
        q.eq("identifier", identifier).eq("flow", flow),
      )
      .first();

    // A stale lockout that has expired shouldn't keep adding to itself; start
    // fresh so a returning user isn't punished for yesterday's typos.
    const lockExpired =
      existing?.lockedUntil !== undefined && existing.lockedUntil <= now;
    const baseCount = lockExpired ? 0 : existing?.failedCount ?? 0;
    const nextCount = baseCount + 1;

    const shouldLock = nextCount >= RATE_LIMIT.lockAfter;
    const shouldWarn = nextCount >= RATE_LIMIT.warnAfter && !shouldLock;
    const lockedUntil = shouldLock
      ? now + RATE_LIMIT.lockCooldownSeconds
      : shouldWarn
        ? now + RATE_LIMIT.warnCooldownSeconds
        : undefined;

    if (existing) {
      await ctx.db.patch(existing._id, {
        failedCount: nextCount,
        lastFailedAt: now,
        lockedUntil,
      });
    } else {
      await ctx.db.insert("loginAttempts", {
        identifier,
        flow,
        failedCount: nextCount,
        lastFailedAt: now,
        lockedUntil,
      });
    }

    return deriveState({
      failedCount: nextCount,
      lastFailedAt: now,
      lockedUntil,
    });
  },
});

/** Clear the counter on success so a single typo doesn't poison the row. */
export const recordSuccess = mutation({
  args: {
    identifier: v.string(),
    flow: v.union(v.literal("signIn"), v.literal("signUp"), v.literal("reset")),
  },
  handler: async (ctx, args): Promise<null> => {
    const flow: Flow = args.flow;
    const identifier = args.identifier.trim().toLowerCase();
    if (!identifier) return null;

    const existing = await ctx.db
      .query("loginAttempts")
      .withIndex("by_identifier_flow", (q) =>
        q.eq("identifier", identifier).eq("flow", flow),
      )
      .first();
    if (existing) {
      await ctx.db.delete(existing._id);
    }
    return null;
  },
});
