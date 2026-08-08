"use client"

import { useCallback } from "react"

type Pattern = "light" | "medium" | "heavy" | "success" | "warning" | "error"

const PATTERNS: Record<Pattern, number | number[]> = {
  light: 8,
  medium: 16,
  heavy: 28,
  success: [10, 40, 14],
  warning: [16, 60, 16],
  error: [24, 50, 24, 50, 24],
}

/**
 * Vibration feedback for touch interactions. Silently no-ops where the API is
 * unavailable (desktop, iOS Safari) or the user asked for reduced motion.
 */
export function useHaptics() {
  return useCallback((pattern: Pattern = "light") => {
    if (typeof window === "undefined") return
    if (!("vibrate" in navigator)) return
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return

    try {
      navigator.vibrate(PATTERNS[pattern])
    } catch {
      // Vibration is a nicety — never let it break an interaction.
    }
  }, [])
}
