import type { Metadata } from "next"

import { FoldersScreen } from "@/components/screens/organise-screens"

export const metadata: Metadata = {
  title: "Folders",
  description: "Group receipts by project, client or period.",
}

export default function Page() {
  return <FoldersScreen />
}
