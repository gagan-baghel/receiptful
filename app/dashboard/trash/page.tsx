import type { Metadata } from "next"

import { TrashScreen } from "@/components/screens/organise-screens"

export const metadata: Metadata = {
  title: "Trash",
  description: "Restore or permanently delete receipts.",
}

export default function Page() {
  return <TrashScreen />
}
