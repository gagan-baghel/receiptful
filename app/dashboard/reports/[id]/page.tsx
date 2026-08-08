import type { Metadata } from "next"

import { ReportDetail } from "@/components/screens/reports-screen"
import type { Id } from "@/convex/_generated/dataModel"

export const metadata: Metadata = {
  title: "Report",
  description: "Review and export an expense report.",
}

export default async function ReportPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  return <ReportDetail reportId={id as Id<"reports">} />
}
