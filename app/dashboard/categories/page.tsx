import type { Metadata } from "next"

import { CategoriesScreen } from "@/components/screens/organise-screens"

export const metadata: Metadata = {
  title: "Categories & tags",
  description: "Manage categories, tax treatment and tags.",
}

export default function Page() {
  return <CategoriesScreen />
}
