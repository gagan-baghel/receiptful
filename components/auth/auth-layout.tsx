import Image from "next/image"
import Link from "next/link"
import type { ReactNode } from "react"
import { Check } from "lucide-react"

const HIGHLIGHTS = [
  "Every field pulled off the receipt automatically",
  "Folders, tags and categories that stay out of your way",
  "Tax-ready exports in CSV, Excel and PDF",
  "Budgets and approvals for the whole team",
]

export function AuthLayout({
  title,
  description,
  children,
  footer,
}: {
  title: string
  description: string
  children: ReactNode
  footer?: ReactNode
}) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-2">
      <div className="flex flex-col px-6 py-10 sm:px-10 lg:px-16">
        <Link
          href="/"
          className="inline-flex w-fit items-center gap-2.5 rounded-lg text-sm font-semibold tracking-tight focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <Image
            src="/logo.png"
            alt="Receiptful"
            width={32}
            height={32}
            className="h-8 w-8 rounded-lg object-contain"
            priority
          />
          <span>Receiptful</span>
        </Link>

        <main id="main" className="flex flex-1 items-center">
          <div className="w-full max-w-sm py-12">
            <h1 className="text-2xl font-semibold tracking-tight text-balance">{title}</h1>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground text-pretty">
              {description}
            </p>
            <div className="mt-8">{children}</div>
            {footer ? <div className="mt-6 text-sm text-muted-foreground">{footer}</div> : null}
          </div>
        </main>
      </div>

      <aside className="relative hidden overflow-hidden bg-muted/40 lg:block">
        <div
          aria-hidden
          className="absolute inset-0 bg-[radial-gradient(60%_50%_at_50%_0%,hsl(var(--primary)/0.14),transparent_70%)]"
        />
        <div className="relative flex h-full flex-col justify-center px-16">
          <blockquote className="max-w-md">
            <p className="text-xl font-medium leading-relaxed tracking-tight text-pretty">
              A shoebox of receipts becomes a clean set of books. Capture it once, and
              everything downstream — categories, budgets, tax totals — is already done.
            </p>
          </blockquote>

          <ul className="mt-10 max-w-md space-y-3">
            {HIGHLIGHTS.map((item) => (
              <li key={item} className="flex items-start gap-3 text-sm text-muted-foreground">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <Check className="h-3 w-3" />
                </span>
                {item}
              </li>
            ))}
          </ul>
        </div>
      </aside>
    </div>
  )
}
