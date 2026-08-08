import type { Metadata } from "next"

import { TaxScreen } from "@/components/screens/tax-screen"

export const metadata: Metadata = {
  title: "Tax",
  description: "Deductible totals and year-end preparation.",
}

export default function Page() {
  return <TaxScreen />
}
