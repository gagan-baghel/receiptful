import { v } from "convex/values";
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import { backoffSeconds, RATE_LIMIT, type RateLimitState } from "../lib/rateLimit";

/**
 * Failed-attempt counter for password sign-in, sign-up and reset.
 *
 * This is a UX throttle and an audit signal, not an access control — see the
 * note on RATE_LIMIT in `lib/rateLimit.ts` for why, and for the upgrade path.
 * It never reports `allowed: false`, so no caller can use it to disable someone
 * else's account.
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
      throttled: false,
    };
  }

  // `allowed` is authoritative: `auth.signIn` refuses to verify a password
  // while it is false. Windows are bounded and expire on their own, so this
  // delays an attacker without ever disabling a real account.
  const cooling = Boolean(record.lockedUntil && record.lockedUntil > now);
  const hardLocked = cooling && record.failedCount >= RATE_LIMIT.lockAfter;

  return {
    allowed: !hardLocked,
    retryAfterSeconds: cooling ? record.lockedUntil! - now : 0,
    failedCount: record.failedCount,
    warning: record.failedCount >= RATE_LIMIT.warnAfter,
    throttled: record.failedCount >= RATE_LIMIT.lockAfter,
  };
}


function emptyState(): RateLimitState {
  return {
    allowed: true,
    retryAfterSeconds: 0,
    failedCount: 0,
    warning: false,
    throttled: false,
  };
}

/** Only ever count something shaped like an account identifier. */
function normalizeIdentifier(value: string): string | null {
  const identifier = value.trim().toLowerCase();
  if (!identifier || identifier.length > 320 || !identifier.includes("@")) return null;
  return identifier;
}

/**
 * Advances the counter and returns the resulting state. Escalation is a
 * lengthening delay rather than a hard account disable: a lockout that any
 * caller can trigger by guessing an email is a denial-of-service, so the
 * penalty is bounded and always expires on its own.
 */
async function applyFailure(
  ctx: MutationCtx,
  rawIdentifier: string,
  flow: Flow,
): Promise<RateLimitState> {
  const identifier = normalizeIdentifier(rawIdentifier);
  if (!identifier) return emptyState();

  const now = nowSeconds();
  const existing = await ctx.db
    .query("loginAttempts")
    .withIndex("by_identifier_flow", (q) =>
      q.eq("identifier", identifier).eq("flow", flow),
    )
    .first();

  // A stale window shouldn't keep adding to itself; start fresh so a returning
  // user isn't punished for yesterday's typos.
  const windowExpired =
    existing !== null &&
    existing.lastFailedAt < now - RATE_LIMIT.windowSeconds;
  const baseCount = windowExpired ? 0 : existing?.failedCount ?? 0;
  const nextCount = baseCount + 1;

  const shouldLock = nextCount >= RATE_LIMIT.lockAfter;
  const shouldWarn = nextCount >= RATE_LIMIT.warnAfter && !shouldLock;
  const lockedUntil = shouldLock
    ? now + backoffSeconds(nextCount)
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

  return deriveState({ failedCount: nextCount, lastFailedAt: now, lockedUntil });
}

async function clearAttempts(
  ctx: MutationCtx,
  rawIdentifier: string,
  flow: Flow,
): Promise<void> {
  const identifier = normalizeIdentifier(rawIdentifier);
  if (!identifier) return;

  const existing = await ctx.db
    .query("loginAttempts")
    .withIndex("by_identifier_flow", (q) =>
      q.eq("identifier", identifier).eq("flow", flow),
    )
    .first();

  if (existing) await ctx.db.delete(existing._id);
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
        throttled: false,
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

/**
 * Client-reported failure. Kept so the form can show its warning immediately,
 * but the authoritative counter is advanced server-side by `auth.signIn`, so
 * skipping this call buys an attacker nothing.
 */
export const recordFailure = mutation({
  args: {
    identifier: v.string(),
    flow: v.union(v.literal("signIn"), v.literal("signUp"), v.literal("reset")),
  },
  handler: async (ctx, args): Promise<RateLimitState> => {
    const existing = await ctx.db
      .query("loginAttempts")
      .withIndex("by_identifier_flow", (q) =>
        q
          .eq("identifier", args.identifier.trim().toLowerCase())
          .eq("flow", args.flow),
      )
      .first();
    return deriveState(existing);
  },
});

/** Clear the counter on success so a single typo doesn't poison the row. */
export const recordSuccess = mutation({
  args: {
    identifier: v.string(),
    flow: v.union(v.literal("signIn"), v.literal("signUp"), v.literal("reset")),
  },
  handler: async (ctx, args): Promise<null> => {
    await clearAttempts(ctx, args.identifier, args.flow);
    return null;
  },
});

/* -------------------------------------------------------------------------
 * Internal surface used by the guarded `auth.signIn` action.
 *
 * These are the enforcing path: the public mutations above only drive form
 * copy. Because `auth.signIn` is the only way to present credentials, a
 * caller who skips the UI is throttled exactly the same way.
 * ---------------------------------------------------------------------- */

export const peek = internalQuery({
  args: {
    identifier: v.string(),
    flow: v.union(v.literal("signIn"), v.literal("signUp"), v.literal("reset")),
  },
  handler: async (ctx, args): Promise<RateLimitState> => {
    const identifier = args.identifier.trim().toLowerCase();
    if (!identifier) return emptyState();

    const record = await ctx.db
      .query("loginAttempts")
      .withIndex("by_identifier_flow", (q) =>
        q.eq("identifier", identifier).eq("flow", args.flow),
      )
      .first();

    return deriveState(record);
  },
});

export const noteFailure = internalMutation({
  args: {
    identifier: v.string(),
    flow: v.union(v.literal("signIn"), v.literal("signUp"), v.literal("reset")),
  },
  handler: async (ctx, args): Promise<null> => {
    await applyFailure(ctx, args.identifier, args.flow);
    return null;
  },
});

export const noteSuccess = internalMutation({
  args: {
    identifier: v.string(),
    flow: v.union(v.literal("signIn"), v.literal("signUp"), v.literal("reset")),
  },
  handler: async (ctx, args): Promise<null> => {
    await clearAttempts(ctx, args.identifier, args.flow);
    return null;
  },
});
