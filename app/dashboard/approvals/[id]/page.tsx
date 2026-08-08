import type { Metadata } from "next"

import { ApprovalDetail } from "@/components/screens/workspace-screens"
import type { Id } from "@/convex/_generated/dataModel"

export const metadata: Metadata = {
  title: "Approval",
  description: "Review an expense submission.",
}

export default async function ApprovalPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <ApprovalDetail approvalId={id as Id<"approvals">} />
}
