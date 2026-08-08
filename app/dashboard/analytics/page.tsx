import type { Metadata } from "next"

import { AnalyticsScreen } from "@/components/screens/analytics-screen"

export const metadata: Metadata = {
  title: "Analytics",
  description: "Trends, categories and merchants across your spending.",
}

export default function Page() {
  return <AnalyticsScreen />
}
