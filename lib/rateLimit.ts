/**
 * Thresholds shared by the client and the Convex rate-limit module.
 *
 * This IS a security control: `auth.signIn` consults the same counter before
 * it will verify a password, so an attacker who calls the action directly is
 * throttled exactly like the form. The public mutations in
 * `convex/rateLimits.ts` only drive form copy.
 *
 * The penalty is a lengthening delay, never a permanent disable. Anyone who
 * knows an email address can burn attempts against it, so the ceiling is
 * deliberately bounded and always expires on its own — a lockout that a
 * stranger can trigger is a denial-of-service, which is worse than the
 * credential stuffing it would prevent.
 */
export const RATE_LIMIT = {
  /** Failures before the form starts warning. */
  warnAfter: 3,
  /** Failures before the server starts refusing to check the password. */
  lockAfter: 6,
  /** Delay once the warning threshold is crossed. */
  warnCooldownSeconds: 15,
  /** First delay once the hard threshold is crossed; doubles per extra failure. */
  lockCooldownSeconds: 60,
  /** Upper bound on the delay, so an attacker cannot escalate it indefinitely. */
  maxCooldownSeconds: 15 * 60,
  /** Failures older than this no longer count toward the current window. */
  windowSeconds: 30 * 60,
} as const

/** Doubling backoff from `lockCooldownSeconds`, capped at `maxCooldownSeconds`. */
export function backoffSeconds(failedCount: number): number {
  const over = Math.max(0, failedCount - RATE_LIMIT.lockAfter)
  return Math.min(
    RATE_LIMIT.lockCooldownSeconds * 2 ** over,
    RATE_LIMIT.maxCooldownSeconds,
  )
}

export type RateLimitState = {
  /** False while the server will refuse to check the password. */
  allowed: boolean
  /** Seconds the form asks the user to wait before retrying. 0 when clear. */
  retryAfterSeconds: number
  /** How many failures have accumulated in the current window. */
  failedCount: number
  /** True when the soft threshold is crossed. */
  warning: boolean
  /** True past the hard threshold — the form slows down and says why. */
  throttled: boolean
}

export function emptyRateLimitState(): RateLimitState {
  return {
    allowed: true,
    retryAfterSeconds: 0,
    failedCount: 0,
    warning: false,
    throttled: false,
  }
}
