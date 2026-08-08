import type { Metadata } from "next"
import { Suspense } from "react"

import { ListSkeleton } from "@/components/common/states"
import { ReceiptsBrowser } from "@/components/screens/receipts-browser"

export const metadata: Metadata = {
  title: "Receipts",
  description: "Search, filter and organise every receipt in your workspace.",
}

export default function ReceiptsPage() {
  return (
    <Suspense fallback={<ListSkeleton rows={8} />}>
      <ReceiptsBrowser />
    </Suspense>
  )
}
