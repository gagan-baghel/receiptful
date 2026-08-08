import type { Metadata } from "next"

import { DashboardHome } from "@/components/screens/dashboard-home"

export const metadata: Metadata = {
  title: "Dashboard",
  description: "Your spending at a glance.",
}

export default function DashboardPage() {
  return <DashboardHome />
}
