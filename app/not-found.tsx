import Link from "next/link"

import { Button } from "@/components/ui/button"

export default function NotFound() {
  return (
    <main
      id="main"
      className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 px-6 text-center"
    >
      <p className="font-mono text-sm text-muted-foreground">404</p>
      <h1 className="text-2xl font-semibold tracking-tight">This page doesn&apos;t exist</h1>
      <p className="text-sm leading-relaxed text-muted-foreground">
        The link may be out of date, or the receipt, report or folder it pointed at may have
        been deleted.
      </p>
      <Button asChild className="mt-2">
        <Link href="/dashboard">Back to the dashboard</Link>
      </Button>
    </main>
  )
}
