import type { Metadata } from "next"

import { ReportsScreen } from "@/components/screens/reports-screen"

export const metadata: Metadata = {
  title: "Reports",
  description: "Build, export and submit expense reports.",
}

export default function ReportsPage() {
  return <ReportsScreen />
}
