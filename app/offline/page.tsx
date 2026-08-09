// Minimal offline shell. Real data lives in Convex, so the only thing the
// user can do offline is read whatever was last loaded. Server-rendered
// message keeps the file dependency-free.
export const dynamic = "force-static"

export default function OfflinePage() {
  return (
    <main
      id="main"
      className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 px-6 text-center"
    >
      <h1 className="text-2xl font-semibold">You&apos;re offline</h1>
      <p className="text-sm text-muted-foreground">
        Receiptful needs a connection to load new receipts and run extraction.
        Anything you already opened in this session is still available.
      </p>
      <a
        href="/dashboard"
        className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
      >
        Retry
      </a>
    </main>
  )
}
