"use client"

/**
 * Last-resort boundary: catches failures in the root layout itself, where the
 * app's providers and styles are not available. Deliberately dependency-free
 * and inline-styled for that reason.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100dvh",
          display: "grid",
          placeItems: "center",
          padding: "24px",
          fontFamily:
            'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
          background: "#ffffff",
          color: "#0f172a",
        }}
      >
        <div style={{ maxWidth: "24rem", textAlign: "center" }}>
          <h1 style={{ fontSize: "20px", margin: "0 0 8px" }}>Receiptful stopped responding</h1>
          <p style={{ color: "#475569", fontSize: "14px", lineHeight: 1.6, margin: "0 0 20px" }}>
            The app hit an error it could not recover from. Your receipts are safe — they are
            stored on the server, not in this page.
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              background: "#0f172a",
              color: "#ffffff",
              border: 0,
              borderRadius: "6px",
              padding: "10px 18px",
              fontSize: "14px",
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            Reload the app
          </button>
        </div>
      </body>
    </html>
  )
}
