import type { Metadata } from "next"

import { BillingScreen } from "@/components/screens/workspace-screens"

export const metadata: Metadata = {
  title: "Billing",
  description: "Plan, seats and storage.",
}

export default function Page() {
  return <BillingScreen />
}
