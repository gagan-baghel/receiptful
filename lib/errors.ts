import { ConvexError } from "convex/values"

type ServerError = { code?: string; message?: string }

/**
 * Turns anything thrown by a Convex call into a sentence worth showing a user.
 * Backend errors carry `{ code, message }`; everything else gets a safe default
 * rather than leaking a stack trace or an internal identifier into the UI.
 */
export function errorMessage(error: unknown, fallback = "Something went wrong. Please try again."): string {
  if (error instanceof ConvexError) {
    const data = error.data as ServerError | string
    if (typeof data === "string") return data
    if (data?.message) return data.message
  }

  if (error instanceof Error) {
    // Convex Auth surfaces credential failures as opaque server errors.
    if (/InvalidAccountId|InvalidSecret|Invalid password/i.test(error.message)) {
      return "That email and password combination doesn't match an account."
    }
    if (/already exists|Account .* exists/i.test(error.message)) {
      return "An account with that email already exists. Try signing in instead."
    }
    if (/Could not verify code|InvalidVerificationCode/i.test(error.message)) {
      return "That reset code is invalid or has expired. Request a new one."
    }
    if (/Network|fetch failed|Failed to fetch/i.test(error.message)) {
      return "You appear to be offline. Check your connection and try again."
    }
    if (/rate limit/i.test(error.message)) {
      return "Too many attempts. Wait a moment and try again."
    }
  }

  return fallback
}

export function errorCode(error: unknown): string | null {
  if (error instanceof ConvexError) {
    const data = error.data as ServerError | string
    if (typeof data !== "string" && data?.code) return data.code
  }
  return null
}
