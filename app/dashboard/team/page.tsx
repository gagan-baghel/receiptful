import type { Metadata } from "next"

import { TeamScreen } from "@/components/screens/workspace-screens"

export const metadata: Metadata = {
  title: "Team",
  description: "Members, roles and invitations.",
}

export default function Page() {
  return <TeamScreen />
}
