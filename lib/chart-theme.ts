"use client"

import { useTheme } from "next-themes"
import { useEffect, useState } from "react"

/**
 * Categorical chart colours, validated for CVD separation and contrast against
 * both surfaces (see the palette validator). Slots are assigned in fixed order
 * and never cycled — a chart that would need a ninth series folds into "Other".
 *
 * Light-mode slot 3 (aqua) sits just under 3:1 on white, so every chart using it
 * ships visible labels or a table view.
 */
const LIGHT = [
  "#2a78d6", // blue
  "#eb6834", // orange
  "#1baf7a", // aqua
  "#eda100", // yellow
  "#e87ba4", // magenta
  "#008300", // green
  "#4a3aa7", // violet
  "#e34948", // red
] as const

const DARK = [
  "#3987e5",
  "#d95926",
  "#199e70",
  "#c98500",
  "#d55181",
  "#008300",
  "#9085e9",
  "#e66767",
] as const

export type ChartTheme = {
  series: readonly string[]
  grid: string
  axis: string
  tooltipBg: string
  tooltipBorder: string
  text: string
  muted: string
  isDark: boolean
}

export function useChartTheme(): ChartTheme {
  const { resolvedTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  // Render light until mounted so server and client markup agree.
  const isDark = mounted && resolvedTheme === "dark"

  return {
    series: isDark ? DARK : LIGHT,
    grid: isDark ? "rgba(255,255,255,0.08)" : "rgba(15,23,42,0.08)",
    axis: isDark ? "rgba(255,255,255,0.45)" : "rgba(15,23,42,0.45)",
    tooltipBg: isDark ? "#12151c" : "#ffffff",
    tooltipBorder: isDark ? "rgba(255,255,255,0.12)" : "rgba(15,23,42,0.12)",
    text: isDark ? "#f8fafc" : "#0f172a",
    muted: isDark ? "rgba(248,250,252,0.62)" : "rgba(15,23,42,0.6)",
    isDark,
  }
}

/** Falls back to a palette slot when a category has no colour of its own. */
export function categoryColor(
  color: string | null | undefined,
  index: number,
  theme: ChartTheme,
) {
  return color || theme.series[index % theme.series.length]
}
