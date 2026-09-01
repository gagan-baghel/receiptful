"use client"

import { useMutation, useQuery } from "convex/react"
import {
  ArrowLeft,
  FileDown,
  FilePlus2,
  FileSpreadsheet,
  FileText,
  Printer,
  Send,
  Trash2,
} from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { toast } from "sonner"

import { PageHeader } from "@/components/common/page-header"
import { EmptyState, ListSkeleton, Spinner } from "@/components/common/states"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { errorMessage } from "@/lib/errors"
import { exportCsv, exportExcel, exportPdf } from "@/lib/export"
import { formatDate, formatMoney, startOfMonthIso, todayIso } from "@/lib/format"

const TYPES = [
  { value: "expense", label: "Expense report" },
  { value: "monthly", label: "Monthly summary" },
  { value: "quarterly", label: "Quarterly summary" },
  { value: "yearly", label: "Year in review" },
  { value: "business", label: "Business only" },
  { value: "project", label: "Project report" },
  { value: "tax", label: "Tax report" },
] as const

const STATUS_VARIANTS: Record<string, "secondary" | "default" | "destructive" | "outline"> = {
  none: "secondary",
  submitted: "outline",
  approved: "default",
  rejected: "destructive",
  returned: "outline",
}

function ReportBuilder({ onCreated }: { onCreated: (id: Id<"reports">) => void }) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState("")
  const [type, setType] = useState<(typeof TYPES)[number]["value"]>("expense")
  const [fromDate, setFromDate] = useState(startOfMonthIso())
  const [toDate, setToDate] = useState(todayIso())
  const [businessOnly, setBusinessOnly] = useState(false)
  const [deductibleOnly, setDeductibleOnly] = useState(false)
  const [pending, setPending] = useState(false)

  const create = useMutation(api.reports.create)
  const preview = useQuery(
    api.reports.preview,
    open
      ? {
          fromDate,
          toDate,
          filters: {
            classification: businessOnly ? ("business" as const) : undefined,
            taxDeductibleOnly: deductibleOnly || undefined,
          },
        }
      : "skip",
  )

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <FilePlus2 className="h-4 w-4" />
          New report
        </Button>
      </DialogTrigger>

      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Build a report</DialogTitle>
          <DialogDescription>
            Pick a period and we&rsquo;ll gather every matching receipt.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="report-name">Name</Label>
            <Input
              id="report-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="March expenses"
            />
          </div>

          <div className="space-y-1.5">
            <Label>Type</Label>
            <Select value={type} onValueChange={(next) => setType(next as typeof type)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TYPES.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="report-from">From</Label>
              <Input
                id="report-from"
                type="date"
                value={fromDate}
                onChange={(event) => setFromDate(event.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="report-to">To</Label>
              <Input
                id="report-to"
                type="date"
                value={toDate}
                onChange={(event) => setToDate(event.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={businessOnly}
                onCheckedChange={(checked) => setBusinessOnly(checked === true)}
              />
              Business expenses only
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={deductibleOnly}
                onCheckedChange={(checked) => setDeductibleOnly(checked === true)}
              />
              Tax deductible only
            </label>
          </div>

          <div className="rounded-lg border bg-muted/30 p-3 text-sm">
            {preview === undefined ? (
              <p className="text-muted-foreground">Calculating…</p>
            ) : preview.rows.length === 0 ? (
              <p className="text-muted-foreground">
                No receipts match this period. Widen the dates or relax the filters.
              </p>
            ) : (
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">
                  {preview.summary.count} receipt{preview.summary.count === 1 ? "" : "s"}
                </span>
                <span className="font-semibold font-numeric">
                  {formatMoney(preview.summary.totalCents, preview.currency)}
                </span>
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            disabled={pending || !name.trim() || preview?.rows.length === 0}
            onClick={async () => {
              setPending(true)
              try {
                const reportId = await create({
                  name: name.trim(),
                  type,
                  fromDate,
                  toDate,
                  filters: {
                    classification: businessOnly ? "business" : undefined,
                    taxDeductibleOnly: deductibleOnly || undefined,
                  },
                })
                toast.success("Report created")
                setOpen(false)
                setName("")
                onCreated(reportId)
              } catch (caught) {
                toast.error(errorMessage(caught))
              } finally {
                setPending(false)
              }
            }}
          >
            Create report
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function ReportsScreen() {
  const reports = useQuery(api.reports.list)
  const remove = useMutation(api.reports.remove)
  const router = useRouter()

  return (
    <div className="space-y-5">
      <PageHeader
        title="Reports"
        description="Bundle receipts into a report you can export or send for approval."
        actions={<ReportBuilder onCreated={(id) => router.push(`/dashboard/reports/${id}`)} />}
      />

      {reports === undefined ? (
        <ListSkeleton rows={4} />
      ) : reports.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No reports yet"
          description="Create a report to group receipts by period, project or tax status — then export it as CSV, Excel or PDF."
        />
      ) : (
        <ul className="space-y-2">
          {reports.map((report) => (
            <li
              key={report._id}
              className="flex flex-wrap items-center gap-3 rounded-xl border bg-card p-4 transition-colors hover:bg-accent/40"
            >
              <Link href={`/dashboard/reports/${report._id}`} className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="truncate font-medium">{report.name}</span>
                  {report.approvalStatus !== "none" ? (
                    <Badge variant={STATUS_VARIANTS[report.approvalStatus]}>
                      {report.approvalStatus}
                    </Badge>
                  ) : null}
                </span>
                <span className="mt-0.5 block text-xs text-muted-foreground">
                  {formatDate(report.fromDate, { short: true })} –{" "}
                  {formatDate(report.toDate)} · {report.receiptCount} receipts · by{" "}
                  {report.createdByName}
                </span>
              </Link>

              <span className="text-sm font-semibold font-numeric">
                {formatMoney(report.totalCents, report.currency)}
              </span>

              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground hover:text-destructive"
                aria-label={`Delete ${report.name}`}
                onClick={async () => {
                  try {
                    await remove({ reportId: report._id })
                    toast.success("Report deleted")
                  } catch (caught) {
                    toast.error(errorMessage(caught))
                  }
                }}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export function ReportDetail({ reportId }: { reportId: Id<"reports"> }) {
  const data = useQuery(api.reports.get, { reportId })
  const submit = useMutation(api.approvals.submitReport)
  const [pending, setPending] = useState(false)

  if (data === undefined) return <Spinner label="Loading report" />

  const { report, rows, summary, currency, workspaceName } = data
  const subtitle = `${workspaceName} · ${formatDate(report.fromDate)} – ${formatDate(report.toDate)}`

  const summaryItems = [
    { label: "Total", value: formatMoney(summary.totalCents, currency) },
    { label: "Receipts", value: String(summary.count) },
    { label: "Tax", value: formatMoney(summary.taxTotalCents, currency) },
    { label: "Deductible", value: formatMoney(summary.deductibleCents, currency) },
    { label: "Average", value: formatMoney(summary.averageCents, currency) },
  ]

  return (
    <div className="space-y-5">
      <Button variant="ghost" size="sm" asChild className="-ml-2">
        <Link href="/dashboard/reports">
          <ArrowLeft className="h-4 w-4" />
          All reports
        </Link>
      </Button>

      <PageHeader
        title={report.name}
        description={subtitle}
        actions={
          <>
            <Button variant="outline" onClick={() => exportCsv(rows, report.name, currency)}>
              <FileDown className="h-4 w-4" />
              CSV
            </Button>
            <Button variant="outline" onClick={() =>
                void exportExcel(rows, report.name, currency).catch((caught) =>
                  toast.error(errorMessage(caught, "The Excel export failed.")),
                )
              }>
              <FileSpreadsheet className="h-4 w-4" />
              Excel
            </Button>
            <Button
              variant="outline"
              onClick={() =>
                exportPdf({
                  title: report.name,
                  subtitle,
                  rows,
                  summary: summaryItems,
                  baseCurrency: currency,
                })
              }
            >
              <Printer className="h-4 w-4" />
              PDF
            </Button>
            {report.approvalStatus === "none" ? (
              <Button
                disabled={pending}
                onClick={async () => {
                  setPending(true)
                  try {
                    await submit({ reportId })
                    toast.success("Submitted for approval")
                  } catch (caught) {
                    toast.error(errorMessage(caught))
                  } finally {
                    setPending(false)
                  }
                }}
              >
                <Send className="h-4 w-4" />
                Submit for approval
              </Button>
            ) : (
              <Badge variant={STATUS_VARIANTS[report.approvalStatus]} className="h-9 px-3">
                {report.approvalStatus}
              </Badge>
            )}
          </>
        }
      />

      <dl className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {summaryItems.map((item) => (
          <div key={item.label} className="rounded-xl border bg-card p-4">
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">
              {item.label}
            </dt>
            <dd className="mt-1 text-lg font-semibold font-numeric">{item.value}</dd>
          </div>
        ))}
      </dl>

      {data.approval && data.approval.comments.length > 0 ? (
        <section className="rounded-xl border bg-card p-4">
          <h2 className="text-sm font-semibold">Review history</h2>
          <ul className="mt-3 space-y-3">
            {data.approval.comments.map((comment) => (
              <li key={comment._id} className="text-sm">
                <p className="text-xs text-muted-foreground">
                  {comment.authorName}
                  {comment.action ? ` · ${comment.action}` : ""}
                </p>
                <p className="mt-0.5 whitespace-pre-wrap">{comment.body}</p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="overflow-x-auto rounded-xl border">
        <table className="w-full min-w-[52rem] text-sm">
          <caption className="sr-only">Receipts included in {report.name}</caption>
          <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th scope="col" className="px-4 py-2.5 text-left font-medium">Date</th>
              <th scope="col" className="px-4 py-2.5 text-left font-medium">Merchant</th>
              <th scope="col" className="px-4 py-2.5 text-left font-medium">Category</th>
              <th scope="col" className="px-4 py-2.5 text-left font-medium">Payment</th>
              <th scope="col" className="px-4 py-2.5 text-right font-medium">Tax</th>
              <th scope="col" className="px-4 py-2.5 text-right font-medium">Amount</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row._id} className="border-t">
                <td className="whitespace-nowrap px-4 py-2.5">{formatDate(row.date, { short: true })}</td>
                <td className="px-4 py-2.5">
                  <Link
                    href={`/dashboard/receipts/${row._id}`}
                    className="hover:underline"
                  >
                    {row.merchant || "Untitled"}
                  </Link>
                </td>
                <td className="px-4 py-2.5 text-muted-foreground">{row.category}</td>
                <td className="px-4 py-2.5 text-muted-foreground">{row.paymentMethod}</td>
                <td className="px-4 py-2.5 text-right font-numeric">
                  {formatMoney(row.taxCents, row.currency)}
                </td>
                <td className="px-4 py-2.5 text-right font-medium font-numeric">
                  {formatMoney(row.amountCents, row.currency)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t bg-muted/40">
            <tr>
              <td colSpan={4} className="px-4 py-2.5 font-medium">
                Total
              </td>
              <td className="px-4 py-2.5 text-right font-medium font-numeric">
                {formatMoney(summary.taxTotalCents, currency)}
              </td>
              <td className="px-4 py-2.5 text-right font-semibold font-numeric">
                {formatMoney(summary.totalCents, currency)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}
