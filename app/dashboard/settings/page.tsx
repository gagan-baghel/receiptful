import type { Metadata } from "next"

import { SettingsScreen } from "@/components/screens/workspace-screens"

export const metadata: Metadata = {
  title: "Settings",
  description: "Profile, preferences and workspace settings.",
}

export default function Page() {
  return <SettingsScreen />
}
