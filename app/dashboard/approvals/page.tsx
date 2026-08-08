import type { Metadata } from "next"

import { ApprovalsScreen } from "@/components/screens/workspace-screens"

export const metadata: Metadata = {
  title: "Approvals",
  description: "Submit and review expense reports.",
}

export default function Page() {
  return <ApprovalsScreen />
}
