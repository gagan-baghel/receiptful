import { ConvexAuthNextjsServerProvider } from "@convex-dev/auth/nextjs/server"
import type { Metadata, Viewport } from "next"
import { JetBrains_Mono, Manrope } from "next/font/google"
import type { ReactNode } from "react"

import { Providers } from "@/components/providers"
import "./globals.css"

const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
})

/** Every currency amount and count is set in mono so figures align in columns. */
const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
  weight: ["400", "500", "600"],
})

export const metadata: Metadata = {
  title: {
    default: "Receiptful — Receipt & expense management",
    template: "%s · Receiptful",
  },
  description:
    "Capture receipts, extract every field automatically, organise them into folders and tags, track budgets, and export tax-ready reports.",
  applicationName: "Receiptful",
  keywords: [
    "receipt scanner",
    "expense management",
    "receipt OCR",
    "tax deductible expenses",
    "small business bookkeeping",
  ],
  openGraph: {
    title: "Receiptful — Receipt & expense management",
    description:
      "Snap a receipt and get a clean, categorised, tax-ready expense record in seconds.",
    type: "website",
    siteName: "Receiptful",
  },
  appleWebApp: { capable: true, statusBarStyle: "default", title: "Receiptful" },
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/icon.png", type: "image/png", sizes: "512x512" },
      { url: "/icon-dark-32x32.png", sizes: "32x32", type: "image/png", media: "(prefers-color-scheme: dark)" },
      { url: "/icon-light-32x32.png", sizes: "32x32", type: "image/png", media: "(prefers-color-scheme: light)" },
    ],
    apple: [
      { url: "/apple-icon.png", sizes: "180x180", type: "image/png" },
    ],
  },
  formatDetection: { telephone: false },
}

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0b0d12" },
  ],
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
}

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <ConvexAuthNextjsServerProvider>
      <html lang="en" suppressHydrationWarning>
        <body
          className={`${manrope.variable} ${jetbrainsMono.variable} min-h-dvh font-sans antialiased`}
        >
          <a
            href="#main"
            className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground"
          >
            Skip to content
          </a>
          <Providers>{children}</Providers>
          {/* Service worker is wired up in production only. In development
              it caches the bundle and fights HMR, which is more confusing
              than offline-first is helpful during local work. */}
          {process.env.NODE_ENV === "production" ? (
            <script
              dangerouslySetInnerHTML={{
                __html: `if ("serviceWorker" in navigator) { window.addEventListener("load", () => { navigator.serviceWorker.register("/sw.js").catch(() => {}); }); }`,
              }}
            />
          ) : null}
        </body>
      </html>
    </ConvexAuthNextjsServerProvider>
  )
}
