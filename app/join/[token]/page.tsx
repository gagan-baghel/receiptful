import type { Metadata } from "next"

import { JoinWorkspace } from "@/components/auth/join-workspace"

export const metadata: Metadata = {
  title: "Join workspace",
  description: "Accept your invitation to a Receiptful workspace.",
}

export default async function JoinPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  return <JoinWorkspace token={token} />
}
