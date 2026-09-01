"use client"

import { useQuery } from "convex/react"
import {
  AlertTriangle,
  CheckCircle2,
  FileDown,
  FileSpreadsheet,
  Landmark,
  Printer,
  Receipt as ReceiptIcon,
} from "lucide-react"
import Link from "next/link"
import { useState } from "react"

import { ChartCard } from "@/components/charts/chart-primitives"
import { PageHeader } from "@/components/common/page-header"
import { EmptyState, Spinner } from "@/components/common/states"
import { StatCard } from "@/components/common/stat-card"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { api } from "@/convex/_generated/api"
import { categoryColor, useChartTheme } from "@/lib/chart-theme"
import { toast } from "sonner"

import { errorMessage } from "@/lib/errors"
import { exportCsv, exportExcel, exportPdf } from "@/lib/export"
import { formatMoney, todayIso } from "@/lib/format"

export function TaxScreen() {
  const [year, setYear] = useState(todayIso().slice(0, 4))
  const years = useQuery(api.reports.availableYears)
  const summary = useQuery(api.reports.taxSummary, { year })
  const preview = useQuery(api.reports.preview, {
    fromDate: `${year}-01-01`,
    toDate: `${year}-12-31`,
    filters: { taxDeductibleOnly: true },
  })
  const theme = useChartTheme()

  if (summary === undefined) return <Spinner label="Loading tax summary" />

  const gapTotal =
    summary.gaps.missingTaxAmount + summary.gaps.missingReceiptImage + summary.gaps.unreviewed
  const verifiedPercent =
    summary.deductibleCount > 0
      ? (summary.verifiedCount / summary.deductibleCount) * 100
      : 0

  const exportName = `${year}-tax-summary`
  const exportSubtitle = `Tax-deductible expenses for ${year}`
  const exportSummary = [
    { label: "Deductible", value: formatMoney(summary.totalDeductibleCents, summary.currency) },
    { label: "Claimable", value: formatMoney(summary.totalClaimableCents, summary.currency) },
    { label: `${summary.taxLabel} paid`, value: formatMoney(summary.totalTaxPaidCents, summary.currency) },
    { label: "Receipts", value: String(summary.deductibleCount) },
  ]

  return (
    <div className="space-y-5">
      <PageHeader
        title="Tax"
        description="Everything you can claim, with the gaps you still need to close."
        actions={
          <>
            <Select value={year} onValueChange={setYear}>
              <SelectTrigger className="w-28" aria-label="Tax year">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(years ?? [year]).map((item) => (
                  <SelectItem key={item} value={item}>
                    {item}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {preview && preview.rows.length > 0 ? (
              <>
                <Button
                  variant="outline"
                  onClick={() => exportCsv(preview.rows, exportName, summary.currency)}
                >
                  <FileDown className="h-4 w-4" />
                  CSV
                </Button>
                <Button
                  variant="outline"
                  onClick={() =>
                    void exportExcel(preview.rows, exportName, summary.currency).catch(
                      (caught) => toast.error(errorMessage(caught, "The Excel export failed.")),
                    )
                  }
                >
                  <FileSpreadsheet className="h-4 w-4" />
                  Excel
                </Button>
                <Button
                  variant="outline"
                  onClick={() =>
                    exportPdf({
                      title: `Tax summary ${year}`,
                      subtitle: exportSubtitle,
                      rows: preview.rows,
                      summary: exportSummary,
                      baseCurrency: summary.currency,
                    })
                  }
                >
                  <Printer className="h-4 w-4" />
                  PDF
                </Button>
              </>
            ) : null}
          </>
        }
      />

      {summary.deductibleCount === 0 ? (
        <EmptyState
          icon={Landmark}
          title={`Nothing marked deductible in ${year}`}
          description="Mark a receipt as tax deductible on its detail page, or set a category's tax treatment so new receipts are flagged automatically."
          action={
            <Button asChild>
              <Link href="/dashboard/receipts">Review receipts</Link>
            </Button>
          }
        />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="Deductible spend"
              value={formatMoney(summary.totalDeductibleCents, summary.currency)}
              hint={`${summary.deductibleCount} receipts`}
              icon={Landmark}
              invertChange={false}
            />
            <StatCard
              label="Claimable after limits"
              value={formatMoney(summary.totalClaimableCents, summary.currency)}
              hint="Category deductible % applied"
              icon={CheckCircle2}
              invertChange={false}
            />
            <StatCard
              label={`${summary.taxLabel} paid`}
              value={formatMoney(summary.totalTaxPaidCents, summary.currency)}
              hint="Recoverable where eligible"
              icon={ReceiptIcon}
              invertChange={false}
            />
            <StatCard
              label="Verified"
              value={`${Math.round(verifiedPercent)}%`}
              hint={`${summary.verifiedCount} of ${summary.deductibleCount} reviewed with an image`}
              icon={CheckCircle2}
              invertChange={false}
              accessory={<Progress value={verifiedPercent} />}
            />
          </div>

          {gapTotal > 0 ? (
            <section className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-5">
              <h2 className="flex items-center gap-2 text-sm font-semibold">
                <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                Close these before filing
              </h2>
              <ul className="mt-3 space-y-2 text-sm">
                {summary.gaps.missingTaxAmount > 0 ? (
                  <li className="flex items-center justify-between gap-3">
                    <span>
                      {summary.gaps.missingTaxAmount} deductible receipt
                      {summary.gaps.missingTaxAmount === 1 ? " has" : "s have"} no{" "}
                      {summary.taxLabel} amount
                    </span>
                    <Button variant="outline" size="sm" asChild>
                      <Link href="/dashboard/receipts?review=1">Fix</Link>
                    </Button>
                  </li>
                ) : null}
                {summary.gaps.missingReceiptImage > 0 ? (
                  <li className="flex items-center justify-between gap-3">
                    <span>
                      {summary.gaps.missingReceiptImage} receipt
                      {summary.gaps.missingReceiptImage === 1 ? "" : "s"} without an attached image
                    </span>
                    <Button variant="outline" size="sm" asChild>
                      <Link href="/dashboard/receipts">Review</Link>
                    </Button>
                  </li>
                ) : null}
                {summary.gaps.unreviewed > 0 ? (
                  <li className="flex items-center justify-between gap-3">
                    <span>
                      {summary.gaps.unreviewed} deductible receipt
                      {summary.gaps.unreviewed === 1 ? "" : "s"} not yet reviewed
                    </span>
                    <Button variant="outline" size="sm" asChild>
                      <Link href="/dashboard/receipts?review=1">Review</Link>
                    </Button>
                  </li>
                ) : null}
              </ul>
            </section>
          ) : (
            <div className="flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4 text-sm">
              <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              Every deductible receipt for {year} is reviewed and complete.
            </div>
          )}

          <div className="grid gap-4 lg:grid-cols-2">
            <ChartCard title="By category" description="Gross spend and what you can actually claim.">
              <ul className="space-y-3">
                {summary.byCategory.map((category, index) => {
                  const share =
                    summary.totalDeductibleCents > 0
                      ? (category.grossCents / summary.totalDeductibleCents) * 100
                      : 0
                  return (
                    <li key={category.name}>
                      <div className="flex items-center justify-between gap-3 text-sm">
                        <span className="flex min-w-0 items-center gap-2">
                          <span
                            aria-hidden
                            className="h-2 w-2 shrink-0 rounded-sm"
                            style={{
                              background: categoryColor(category.color, index, theme),
                            }}
                          />
                          <span className="truncate">{category.name}</span>
                          <span className="shrink-0 text-xs text-muted-foreground">
                            ({category.count})
                          </span>
                        </span>
                        <span className="shrink-0 font-numeric">
                          {formatMoney(category.claimableCents, summary.currency)}
                          {category.claimableCents !== category.grossCents ? (
                            <span className="ml-1 text-xs text-muted-foreground line-through">
                              {formatMoney(category.grossCents, summary.currency)}
                            </span>
                          ) : null}
                        </span>
                      </div>
                      <Progress value={share} className="mt-1.5 h-1.5" />
                    </li>
                  )
                })}
              </ul>
            </ChartCard>

            <ChartCard title="By quarter" description={`Deductible spend and ${summary.taxLabel} per quarter.`}>
              <table className="w-full text-sm">
                <caption className="sr-only">Deductible spend by quarter</caption>
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <th scope="col" className="pb-2 font-medium">Quarter</th>
                    <th scope="col" className="pb-2 text-right font-medium">Receipts</th>
                    <th scope="col" className="pb-2 text-right font-medium">{summary.taxLabel}</th>
                    <th scope="col" className="pb-2 text-right font-medium">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.quarters.map((quarter) => (
                    <tr key={quarter.quarter} className="border-b last:border-0">
                      <td className="py-2">Q{quarter.quarter}</td>
                      <td className="py-2 text-right font-numeric text-muted-foreground">
                        {quarter.count}
                      </td>
                      <td className="py-2 text-right font-numeric">
                        {formatMoney(quarter.taxCents, summary.currency)}
                      </td>
                      <td className="py-2 text-right font-medium font-numeric">
                        {formatMoney(quarter.totalCents, summary.currency)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </ChartCard>
          </div>
        </>
      )}
    </div>
  )
}
