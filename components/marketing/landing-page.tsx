import {
  ArrowRight,
  Camera,
  CheckSquare,
  FileSpreadsheet,
  FolderTree,
  Landmark,
  Receipt,
  ScanLine,
  Search,
  Target,
  Users,
} from "lucide-react"
import Image from "next/image"
import Link from "next/link"

import { ExtractionPreview, ReceiptPreview } from "@/components/marketing/receipt-preview"
import { Button } from "@/components/ui/button"

const STEPS = [
  {
    icon: Camera,
    step: "01",
    title: "Capture it",
    body: "Photograph it, drop in a PDF, or upload a whole folder at once. Skewed phone photos get straightened, cropped and compressed before they leave your device.",
  },
  {
    icon: ScanLine,
    step: "02",
    title: "We read it",
    body: "Merchant, total, subtotal, tax, date, payment method, card digits, invoice number and every line item — extracted, with a confidence score attached to each one.",
  },
  {
    icon: CheckSquare,
    step: "03",
    title: "You check what's uncertain",
    body: "Anything the scanner wasn't sure about is flagged. Confident fields are left alone. Most receipts need one glance, not one form.",
  },
]

const CAPABILITIES = [
  {
    icon: FolderTree,
    title: "Classification that holds up",
    body: "Fourteen categories with real tax treatment — fully deductible, partially deductible, or not. Add keywords and receipts file themselves on arrival.",
  },
  {
    icon: Search,
    title: "Search that reaches everything",
    body: "Merchant, amount, note, line item, invoice number, card digits — even words printed on the paper. Results land as you type.",
  },
  {
    icon: Landmark,
    title: "Tax totals you can file",
    body: "Deductible spend per category with the percentage applied, quarterly splits, and an explicit list of the gaps still holding you up.",
  },
  {
    icon: Target,
    title: "Budgets that warn early",
    body: "Set a monthly, quarterly or yearly ceiling per category or workspace. You hear about it at 80%, not at 110%.",
  },
  {
    icon: FileSpreadsheet,
    title: "Exports finance accepts",
    body: "CSV, Excel with filters and column widths, and print-ready PDF. Nineteen columns, one row per receipt, no reformatting.",
  },
  {
    icon: Users,
    title: "Roles and approvals",
    body: "Owner, admin, manager, member, viewer. Submit a report, route it to a reviewer, keep the comment history attached to the receipts.",
  },
]

const GROUPING = [
  { label: "Business", value: "$4,182.40", share: 72, tone: "bg-primary" },
  { label: "Personal", value: "$1,061.15", share: 18, tone: "bg-primary/50" },
  { label: "Reimbursable", value: "$592.00", share: 10, tone: "bg-primary/25" },
]

export function LandingPage() {
  return (
    <div className="min-h-dvh bg-canvas">
      <header className="sticky top-0 z-50 border-b bg-canvas/85 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-5 sm:px-8">
          <Link href="/" className="flex items-center gap-2.5 font-semibold tracking-tight">
            <Image
              src="/logo.png"
              alt="Receiptful"
              width={28}
              height={28}
              className="h-7 w-7 rounded-lg object-contain"
              priority
            />
            <span>Receiptful</span>
          </Link>

          <nav className="ml-auto hidden items-center gap-7 text-sm text-muted-foreground md:flex">
            <a href="#how" className="transition-colors hover:text-foreground">
              How it works
            </a>
            <a href="#capabilities" className="transition-colors hover:text-foreground">
              Capabilities
            </a>
            <Link href="/help" className="transition-colors hover:text-foreground">
              Docs
            </Link>
          </nav>

          <div className="ml-auto flex items-center gap-2 md:ml-0">
            <Button variant="ghost" size="sm" asChild>
              <Link href="/login">Log in</Link>
            </Button>
            <Button size="sm" asChild>
              <Link href="/signup">Start free</Link>
            </Button>
          </div>
        </div>
      </header>

      <main id="main">
        {/* Hero */}
        <section className="mx-auto max-w-6xl px-5 pb-20 pt-16 sm:px-8 lg:pb-28 lg:pt-24">
          <div className="grid items-center gap-14 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
            <div>
              <p className="inline-flex items-center gap-2 rounded-full border bg-card px-3 py-1 text-xs text-muted-foreground">
                <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                Built for people who hate bookkeeping
              </p>

              <h1 className="mt-6 text-4xl font-semibold leading-[1.05] tracking-tight sm:text-5xl lg:text-[3.5rem]">
                Your receipts, already sorted.
              </h1>

              <p className="mt-5 max-w-lg text-base leading-relaxed text-muted-foreground text-pretty">
                Photograph a receipt and get back a complete, categorised, tax-ready expense
                record — merchant, tax, line items and all. You only look at the fields we
                weren&rsquo;t sure about.
              </p>

              <div className="mt-8 flex flex-wrap items-center gap-3">
                <Button size="lg" asChild>
                  <Link href="/signup">
                    Create your workspace
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
                <Button size="lg" variant="outline" asChild>
                  <a href="#how">See how it works</a>
                </Button>
              </div>

              <dl className="mt-10 grid max-w-md grid-cols-3 gap-6 border-t pt-6">
                {[
                  { value: "20+", label: "fields extracted" },
                  { value: "25", label: "pages per receipt" },
                  { value: "3", label: "export formats" },
                ].map((stat) => (
                  <div key={stat.label}>
                    <dt className="sr-only">{stat.label}</dt>
                    <dd>
                      <span className="block font-numeric text-2xl font-semibold">
                        {stat.value}
                      </span>
                      <span className="mt-0.5 block text-xs text-muted-foreground">
                        {stat.label}
                      </span>
                    </dd>
                  </div>
                ))}
              </dl>
            </div>

            {/* Two clean, non-overlapping product surfaces. */}
            <div className="space-y-4">
              <ReceiptPreview />
              <div className="lg:pl-10">
                <ExtractionPreview />
              </div>
            </div>
          </div>
        </section>

        {/* How it works */}
        <section id="how" className="border-y bg-background py-20 lg:py-24">
          <div className="mx-auto max-w-6xl px-5 sm:px-8">
            <div className="max-w-2xl">
              <p className="text-xs font-medium uppercase tracking-wider text-primary">
                How it works
              </p>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
                Three steps, and two of them aren&rsquo;t yours.
              </h2>
            </div>

            <ol className="mt-12 grid gap-8 md:grid-cols-3">
              {STEPS.map((step) => (
                <li key={step.step} className="relative">
                  <div className="flex items-center gap-3">
                    <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <step.icon className="h-4 w-4" />
                    </span>
                    <span className="font-numeric text-xs text-muted-foreground">
                      {step.step}
                    </span>
                  </div>
                  <h3 className="mt-4 text-lg font-semibold">{step.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground text-pretty">
                    {step.body}
                  </p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Grouping / classification */}
        <section className="py-20 lg:py-24">
          <div className="mx-auto max-w-6xl px-5 sm:px-8">
            <div className="grid items-center gap-12 lg:grid-cols-2">
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-primary">
                  Classification
                </p>
                <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
                  Business, personal, deductible — decided once, at capture.
                </h2>
                <p className="mt-4 max-w-lg text-sm leading-relaxed text-muted-foreground text-pretty">
                  Every receipt carries its category, its tax treatment, and whether it&rsquo;s
                  business or personal. Group them into folders by client, project or tax year —
                  a receipt can sit in several at once — and stack free-form tags on top.
                </p>

                <ul className="mt-8 space-y-4">
                  {GROUPING.map((group) => (
                    <li key={group.label}>
                      <div className="flex items-baseline justify-between gap-3 text-sm">
                        <span className="font-medium">{group.label}</span>
                        <span className="font-numeric text-muted-foreground">{group.value}</span>
                      </div>
                      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                        <div
                          className={`h-full rounded-full ${group.tone}`}
                          style={{ width: `${group.share}%` }}
                        />
                      </div>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                {[
                  { name: "2026 Taxes", count: "148 receipts", total: "$12,408.55" },
                  { name: "Client — Northwind", count: "36 receipts", total: "$4,120.00" },
                  { name: "Q3 Travel", count: "22 receipts", total: "$3,845.10" },
                  { name: "Office", count: "61 receipts", total: "$1,902.40" },
                ].map((folder) => (
                  <div key={folder.name} className="surface p-4">
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <FolderTree className="h-4 w-4" />
                    </span>
                    <p className="mt-3 truncate text-sm font-medium">{folder.name}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{folder.count}</p>
                    <p className="mt-2 font-numeric text-sm font-semibold">{folder.total}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Capabilities */}
        <section id="capabilities" className="border-y bg-background py-20 lg:py-24">
          <div className="mx-auto max-w-6xl px-5 sm:px-8">
            <div className="max-w-2xl">
              <p className="text-xs font-medium uppercase tracking-wider text-primary">
                Capabilities
              </p>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
                Everything the shoebox was hiding from you.
              </h2>
            </div>

            <ul className="mt-12 grid gap-x-10 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
              {CAPABILITIES.map((item) => (
                <li key={item.title}>
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg border bg-card text-primary">
                    <item.icon className="h-4 w-4" />
                  </span>
                  <h3 className="mt-4 text-base font-semibold">{item.title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground text-pretty">
                    {item.body}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Close */}
        <section className="py-20 lg:py-28">
          <div className="mx-auto max-w-3xl px-5 text-center sm:px-8">
            <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
              Start with the receipt in your pocket.
            </h2>
            <p className="mx-auto mt-4 max-w-lg text-sm leading-relaxed text-muted-foreground text-pretty">
              Free to start, no card required. Your workspace arrives with categories, folders
              and tags already set up — the first receipt takes about ten seconds.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <Button size="lg" asChild>
                <Link href="/signup">
                  Create your workspace
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button size="lg" variant="outline" asChild>
                <Link href="/login">I already have an account</Link>
              </Button>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t bg-background">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-5 py-8 text-sm text-muted-foreground sm:flex-row sm:px-8">
          <span className="flex items-center gap-2.5">
            <Image
              src="/logo.png"
              alt="Receiptful"
              width={24}
              height={24}
              className="h-6 w-6 rounded-md object-contain"
            />
            <span>Receiptful</span>
          </span>
          <nav className="flex flex-wrap items-center justify-center gap-5">
            <Link href="/help" className="transition-colors hover:text-foreground">
              Help
            </Link>
            <Link href="/help#privacy" className="transition-colors hover:text-foreground">
              Privacy
            </Link>
            <Link href="/help#terms" className="transition-colors hover:text-foreground">
              Terms
            </Link>
            <Link href="/login" className="transition-colors hover:text-foreground">
              Log in
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  )
}
