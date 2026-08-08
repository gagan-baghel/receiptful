import type { Metadata } from "next"

import { BudgetsScreen } from "@/components/screens/organise-screens"

export const metadata: Metadata = {
  title: "Budgets",
  description: "Set spending limits and track progress.",
}

export default function Page() {
  return <BudgetsScreen />
}
