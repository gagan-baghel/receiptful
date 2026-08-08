import type { Metadata } from "next"

import { ReceiptDetail } from "@/components/screens/receipt-detail"
import type { Id } from "@/convex/_generated/dataModel"

export const metadata: Metadata = {
  title: "Receipt",
  description: "Review and edit a receipt's extracted details.",
}

export default async function ReceiptPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  return <ReceiptDetail receiptId={id as Id<"receipts">} />
}
