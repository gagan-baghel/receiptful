/**
 * Thresholds shared by the client and the Convex rate-limit module. Keep
 * them on the client too so the form can pre-flight an obvious lockout
 * without making a doomed network call.
 */
export const RATE_LIMIT = {
  /** Failures before a short cooldown kicks in. */
  warnAfter: 3,
  /** Failures before the identifier is locked out entirely. */
  lockAfter: 6,
  /** Cooldown length when the warning threshold is crossed. */
  warnCooldownSeconds: 15,
  /** Lockout length once the hard threshold is crossed. */
  lockCooldownSeconds: 15 * 60,
} as const

export type RateLimitState = {
  allowed: boolean
  /** Seconds until another attempt is allowed. 0 when allowed. */
  retryAfterSeconds: number
  /** How many failures have accumulated in the current window. */
  failedCount: number
  /** True when the soft threshold is crossed (UX nudge, still allowed). */
  warning: boolean
}

export function emptyRateLimitState(): RateLimitState {
  return {
    allowed: true,
    retryAfterSeconds: 0,
    failedCount: 0,
    warning: false,
  }
}
