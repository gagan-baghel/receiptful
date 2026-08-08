import type { Metadata } from "next"
import Link from "next/link"
import {
  Camera,
  FileText,
  FolderOpen,
  Landmark,
  LifeBuoy,
  Receipt,
  Shield,
  Users,
} from "lucide-react"

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import { Button } from "@/components/ui/button"

export const metadata: Metadata = {
  title: "Help & support",
  description: "Guides, answers and how to reach us.",
}

const GUIDES = [
  {
    icon: Camera,
    title: "Capturing receipts",
    body: "Use the camera for paper receipts, or drop in images and PDFs. Multiple photos become one multi-page receipt when you switch on “Combine into one receipt”; leave it off and each photo becomes its own record. Before uploading you can rotate, crop, straighten a skewed photo by dragging its corners, and sharpen faded thermal print.",
  },
  {
    icon: Receipt,
    title: "Reviewing what was extracted",
    body: "Every field the scanner wasn't sure about is highlighted with a “Check” badge. Correcting a field clears its flag. Once the merchant, amount and date look right, hit “Mark reviewed” — that's what makes a receipt count as tax-ready.",
  },
  {
    icon: FolderOpen,
    title: "Categories, folders and tags",
    body: "Categories drive tax treatment and auto-sorting: add keywords to a category and matching receipts file themselves. Folders group receipts by project, client or period, and a receipt can sit in several at once. Tags are free-form labels for everything else.",
  },
  {
    icon: FileText,
    title: "Reports and exports",
    body: "Build a report from a date range and optional filters, then export it as CSV, Excel or PDF. PDF export uses your browser's print dialog, so you can save to file or send straight to a printer.",
  },
  {
    icon: Landmark,
    title: "Tax preparation",
    body: "The Tax screen totals everything marked deductible, applies each category's deductible percentage, and lists the gaps that would hold up a filing — missing tax amounts, missing images and unreviewed receipts.",
  },
  {
    icon: Users,
    title: "Working with a team",
    body: "Invite people as Admin, Manager, Member or Viewer. Members manage their own receipts; managers approve expense reports and see everything; admins manage people and settings; the owner controls billing and can transfer ownership.",
  },
]

const FAQS = [
  {
    question: "What file types can I upload?",
    answer:
      "JPEG, PNG, WebP, HEIC and PDF, up to 20 MB per page and 25 pages per receipt. Photos are compressed in your browser before upload, so a large phone photo usually arrives as a few hundred kilobytes.",
  },
  {
    question: "What happens if extraction can't read my receipt?",
    answer:
      "The receipt is still saved and lands in your review queue with a clear notice — nothing is ever lost. You can type the details in yourself, or hit “Re-run extraction” to try again after rotating or brightening the image.",
  },
  {
    question: "How does duplicate detection work?",
    answer:
      "When two receipts share the same merchant and the same amount within three days, the newer one is flagged as a possible duplicate. You can compare them side by side, or dismiss the flag if it's a genuine repeat purchase.",
  },
  {
    question: "Can I recover a deleted receipt?",
    answer:
      "Yes. Deleted receipts go to Trash and stay there for 30 days before being permanently removed. Restore one at any point during that window.",
  },
  {
    question: "Who can see my receipts?",
    answer:
      "Only members of the same workspace. Every query checks your membership and role on the server before returning anything — a viewer can read, a member manages their own receipts, and managers and above see everything in the workspace.",
  },
  {
    question: "How do I change the currency?",
    answer:
      "Set your workspace base currency in Settings → Workspace. Individual receipts keep the currency they were paid in, and totals roll up into the base currency.",
  },
  {
    question: "What happens when I delete my account?",
    answer:
      "It's scheduled rather than immediate — you have 30 days to change your mind. After that, your account, settings and notifications are removed, along with any workspace where you were the only member. Shared workspaces need ownership transferred first.",
  },
]

export default function HelpPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6 lg:py-16">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Help & support</h1>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground text-pretty">
            How Receiptful works, and what to do when something doesn&rsquo;t.
          </p>
        </div>
        <Button variant="outline" asChild>
          <Link href="/dashboard">Back to app</Link>
        </Button>
      </header>

      <section className="mt-10">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Guides
        </h2>
        <ul className="mt-4 space-y-3">
          {GUIDES.map((guide) => (
            <li key={guide.title} className="rounded-xl border bg-card p-5">
              <div className="flex items-start gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <guide.icon className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <h3 className="font-medium">{guide.title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground text-pretty">
                    {guide.body}
                  </p>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-10">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Frequently asked
        </h2>
        <Accordion type="single" collapsible className="mt-2">
          {FAQS.map((faq) => (
            <AccordionItem key={faq.question} value={faq.question}>
              <AccordionTrigger className="text-left text-sm">{faq.question}</AccordionTrigger>
              <AccordionContent className="text-sm leading-relaxed text-muted-foreground">
                {faq.answer}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </section>

      <section className="mt-10 rounded-xl border bg-card p-5">
        <h2 className="flex items-center gap-2 font-medium">
          <LifeBuoy className="h-4 w-4 text-primary" />
          Still stuck?
        </h2>
        <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
          Send us the details and we&rsquo;ll take a look. Include the receipt in question if
          it&rsquo;s about extraction — it helps a lot.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button asChild>
            <a href="mailto:support@receiptful.app?subject=Receiptful%20support">
              Email support
            </a>
          </Button>
          <Button variant="outline" asChild>
            <a href="mailto:support@receiptful.app?subject=Receiptful%20bug%20report">
              Report a problem
            </a>
          </Button>
          <Button variant="ghost" asChild>
            <a href="mailto:hello@receiptful.app?subject=Receiptful%20feedback">
              Send feedback
            </a>
          </Button>
        </div>
      </section>

      <section id="privacy" className="mt-10 scroll-mt-6">
        <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          <Shield className="h-3.5 w-3.5" />
          Privacy
        </h2>
        <div className="mt-3 space-y-3 text-sm leading-relaxed text-muted-foreground">
          <p>
            Your receipts belong to you. They&rsquo;re stored against your workspace and visible
            only to its members; every request is authorised on the server against your role
            before any data is returned.
          </p>
          <p>
            Receipt images are sent to an extraction service to read their contents. Nothing is
            used to train models, and images are not shared with anyone else.
          </p>
          <p>
            You can download everything in your workspace as JSON at any time from Settings →
            Privacy, and you can schedule your account for deletion from the same screen.
          </p>
        </div>
      </section>

      <section id="terms" className="mt-10 scroll-mt-6">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Terms
        </h2>
        <div className="mt-3 space-y-3 text-sm leading-relaxed text-muted-foreground">
          <p>
            Receiptful helps you record and organise expenses. It is not an accountant: extracted
            values and tax figures are a starting point, and you are responsible for checking them
            before filing or claiming.
          </p>
          <p>
            Use the service lawfully, and only upload documents you have the right to store. Plan
            entitlements — seats and storage — are enforced per workspace, and either side may end
            the arrangement at any time.
          </p>
        </div>
      </section>

      <footer className="mt-12 border-t pt-6 text-xs text-muted-foreground">
        Receiptful · version 1.0.0
      </footer>
    </div>
  )
}
