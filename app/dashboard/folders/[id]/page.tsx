import type { Metadata } from "next"

import { FolderDetail } from "@/components/screens/organise-screens"
import type { Id } from "@/convex/_generated/dataModel"

export const metadata: Metadata = {
  title: "Folder",
  description: "Receipts inside this folder.",
}

export default async function FolderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <FolderDetail folderId={id as Id<"folders">} />
}
