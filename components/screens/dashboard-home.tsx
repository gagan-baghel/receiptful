"use client"

import { useQuery } from "convex/react"
import {
  AlertTriangle,
  ArrowRight,
  CalendarDays,
  Camera,
  CircleDollarSign,
  Copy,
  HardDrive,
  Landmark,
  Loader2,
  Receipt as ReceiptIcon,
  TrendingUp,
  Wallet,
} from "lucide-react"
import Link from "next/link"
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"

import { useCapture } from "@/components/capture/capture-provider"
import { ChartCard, ChartLegend, ChartTooltip } from "@/components/charts/chart-primitives"
import { PageHeader, SectionHeader } from "@/components/common/page-header"
import { EmptyState, StatCardSkeleton, ChartSkeleton } from "@/components/common/states"
import { StatCard } from "@/components/common/stat-card"
import { ReceiptRow } from "@/components/receipts/receipt-item"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { api } from "@/convex/_generated/api"
import { categoryColor, useChartTheme } from "@/lib/chart-theme"
import { formatBytes, formatDate, formatMoney } from "@/lib/format"

function AttentionRow({
  icon: Icon,
  label,
  count,
  href,
  tone,
}: {
  icon: typeof AlertTriangle
  label: string
  count: number
  href: string
  tone: "warning" | "danger" | "info"
}) {
  if (count === 0) return null

  const tones = {
    warning: "text-amber-600 dark:text-amber-400 bg-amber-500/10",
    danger: "text-rose-600 dark:text-rose-400 bg-rose-500/10",
    info: "text-blue-600 dark:text-blue-400 bg-blue-500/10",
  }

  return (
    <li>
      <Link
        href={href}
        className="flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-accent/60"
      >
        <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${tones[tone]}`}>
          <Icon className="h-4 w-4" />
        </span>
        <span className="min-w-0 flex-1 text-sm">{label}</span>
        <span className="text-sm font-semibold font-numeric">{count}</span>
        <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
      </Link>
    </li>
  )
}

export function DashboardHome() {
  const data = useQuery(api.analytics.dashboard)
  const theme = useChartTheme()
  const capture = useCapture()

  if (data === undefined) {
    return (
      <div className="space-y-6">
        <PageHeader title="Dashboard" description="Loading your workspace…" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }, (_, index) => (
            <StatCardSkeleton key={index} />
          ))}
        </div>
        <ChartSkeleton />
      </div>
    )
  }

  const currency = data.currency
  const attentionTotal =
    data.attention.pendingReview +
    data.attention.ocrFailures +
    data.attention.duplicates +
    data.attention.awaitingApproval

  if (data.receiptCount === 0) {
    return (
      <div className="space-y-6">
        <PageHeader
          title={data.viewerName ? `Welcome, ${data.viewerName.split(" ")[0]}` : "Welcome"}
          description="Add your first receipt and we'll take it from there."
        />
        <EmptyState
          icon={Camera}
          title="No receipts yet"
          description="Snap a photo, drop in a PDF, or upload a folder of images. We read the merchant, amount, tax and date for you, then file it in the right category."
          action={
            <Button onClick={capture.open}>
              <Camera className="h-4 w-4" />
              Add your first receipt
            </Button>
          }
          secondaryAction={
            <Button variant="outline" asChild>
              <Link href="/help">See how it works</Link>
            </Button>
          }
        />
      </div>
    )
  }

  const storagePercent =
    data.storage.quotaBytes > 0
      ? Math.min(100, (data.storage.usedBytes / data.storage.quotaBytes) * 100)
      : 0

  return (
    <div className="space-y-6">
      <PageHeader
        title={data.viewerName ? `Hello, ${data.viewerName.split(" ")[0]}` : "Dashboard"}
        description="Your spending this month, and anything that needs a decision."
        actions={
          <Button onClick={capture.open}>
            <Camera className="h-4 w-4" />
            Add receipt
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="This month"
          value={formatMoney(data.month.totalCents, currency)}
          hint={`${data.month.count} receipt${data.month.count === 1 ? "" : "s"}`}
          icon={Wallet}
          changePercent={data.month.changePercent}
          href="/dashboard/receipts"
        />
        <StatCard
          label="Today"
          value={formatMoney(data.today.totalCents, currency)}
          hint={
            data.today.count > 0
              ? `${data.today.count} receipt${data.today.count === 1 ? "" : "s"}`
              : "Nothing logged yet"
          }
          icon={CalendarDays}
        />
        <StatCard
          label="This year"
          value={formatMoney(data.year.totalCents, currency)}
          hint={`Avg ${formatMoney(data.averageReceiptCents, currency)} per receipt`}
          icon={TrendingUp}
          href="/dashboard/analytics"
        />
        <StatCard
          label="Tax deductible"
          value={formatMoney(data.tax.deductibleTotalCents, currency)}
          hint={`${data.tax.readyCount} verified this year`}
          icon={Landmark}
          invertChange={false}
          href="/dashboard/tax"
        />
      </div>

      {attentionTotal > 0 || data.attention.processing > 0 ? (
        <section className="rounded-xl border bg-card p-5">
          <SectionHeader
            title="Needs your attention"
            description="Everything the app couldn't decide on its own."
          />
          <ul className="mt-3 space-y-0.5">
            {data.attention.processing > 0 ? (
              <li className="flex items-center gap-3 rounded-lg px-3 py-2.5">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                </span>
                <span className="min-w-0 flex-1 text-sm">Receipts being read right now</span>
                <span className="text-sm font-semibold font-numeric">
                  {data.attention.processing}
                </span>
              </li>
            ) : null}
            <AttentionRow
              icon={AlertTriangle}
              label="Receipts needing review"
              count={data.attention.pendingReview}
              href="/dashboard/receipts?review=1"
              tone="warning"
            />
            <AttentionRow
              icon={AlertTriangle}
              label="Extraction failed — enter manually"
              count={data.attention.ocrFailures}
              href="/dashboard/receipts?status=failed"
              tone="danger"
            />
            <AttentionRow
              icon={Copy}
              label="Possible duplicates"
              count={data.attention.duplicates}
              href="/dashboard/receipts?duplicates=1"
              tone="warning"
            />
            <AttentionRow
              icon={CircleDollarSign}
              label="Waiting on approval"
              count={data.attention.awaitingApproval}
              href="/dashboard/approvals"
              tone="info"
            />
            <AttentionRow
              icon={Landmark}
              label="Deductible receipts missing tax amounts"
              count={data.attention.missingTaxInfo}
              href="/dashboard/tax"
              tone="warning"
            />
          </ul>
        </section>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <ChartCard
          title="Last 7 days"
          description="Daily spend, newest on the right."
          className="lg:col-span-2"
          tableView={
            <table className="w-full text-xs">
              <caption className="sr-only">Daily spend over the last seven days</caption>
              <thead>
                <tr className="text-left text-muted-foreground">
                  <th scope="col" className="py-1 pr-4 font-medium">Date</th>
                  <th scope="col" className="py-1 pr-4 font-medium">Receipts</th>
                  <th scope="col" className="py-1 font-medium">Total</th>
                </tr>
              </thead>
              <tbody>
                {data.weeklyTrend.map((point) => (
                  <tr key={point.date} className="border-t">
                    <td className="py-1 pr-4">{formatDate(point.date, { short: true })}</td>
                    <td className="py-1 pr-4 font-numeric">{point.count}</td>
                    <td className="py-1 font-numeric">
                      {formatMoney(point.totalCents, currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          }
        >
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart
              data={data.weeklyTrend}
              margin={{ top: 4, right: 4, bottom: 0, left: -12 }}
            >
              <defs>
                <linearGradient id="weekFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={theme.series[0]} stopOpacity={0.28} />
                  <stop offset="100%" stopColor={theme.series[0]} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke={theme.grid} vertical={false} />
              <XAxis
                dataKey="date"
                tickFormatter={(value: string) => formatDate(value, { short: true })}
                tick={{ fontSize: 11, fill: theme.axis }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                tickFormatter={(value: number) =>
                  formatMoney(value, currency, { compact: true })
                }
                tick={{ fontSize: 11, fill: theme.axis }}
                tickLine={false}
                axisLine={false}
                width={64}
              />
              <Tooltip
                cursor={{ stroke: theme.axis, strokeWidth: 1 }}
                content={({ active, payload, label }) =>
                  active && payload?.length ? (
                    <ChartTooltip
                      title={formatDate(String(label))}
                      rows={[
                        {
                          label: "Spent",
                          value: formatMoney(Number(payload[0].value), currency),
                          color: theme.series[0],
                        },
                        {
                          label: "Receipts",
                          value: String(payload[0].payload.count),
                        },
                      ]}
                    />
                  ) : null
                }
              />
              <Area
                type="monotone"
                dataKey="totalCents"
                stroke={theme.series[0]}
                strokeWidth={2}
                fill="url(#weekFill)"
                dot={false}
                activeDot={{ r: 4, strokeWidth: 2, stroke: theme.tooltipBg }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          title="Top categories"
          description="This month's spend by category."
          tableView={
            <table className="w-full text-xs">
              <caption className="sr-only">Spend by category this month</caption>
              <thead>
                <tr className="text-left text-muted-foreground">
                  <th scope="col" className="py-1 pr-4 font-medium">Category</th>
                  <th scope="col" className="py-1 font-medium">Total</th>
                </tr>
              </thead>
              <tbody>
                {data.topCategories.map((category) => (
                  <tr key={category.name} className="border-t">
                    <td className="py-1 pr-4">{category.name}</td>
                    <td className="py-1 font-numeric">
                      {formatMoney(category.totalCents, currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          }
        >
          {data.topCategories.length === 0 ? (
            <p className="py-14 text-center text-sm text-muted-foreground">
              No spending recorded this month yet.
            </p>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={170}>
                <PieChart>
                  <Pie
                    data={data.topCategories}
                    dataKey="totalCents"
                    nameKey="name"
                    innerRadius={48}
                    outerRadius={72}
                    paddingAngle={2}
                    stroke={theme.tooltipBg}
                    strokeWidth={2}
                  >
                    {data.topCategories.map((category, index) => (
                      <Cell
                        key={category.name}
                        fill={categoryColor(category.color, index, theme)}
                      />
                    ))}
                  </Pie>
                  <Tooltip
                    content={({ active, payload }) =>
                      active && payload?.length ? (
                        <ChartTooltip
                          title={String(payload[0].name)}
                          rows={[
                            {
                              label: "Spent",
                              value: formatMoney(Number(payload[0].value), currency),
                              color: payload[0].payload.color,
                            },
                            {
                              label: "Receipts",
                              value: String(payload[0].payload.count),
                            },
                          ]}
                        />
                      ) : null
                    }
                  />
                </PieChart>
              </ResponsiveContainer>

              <ul className="mt-3 space-y-1.5">
                {data.topCategories.map((category, index) => (
                  <li key={category.name} className="flex items-center gap-2 text-xs">
                    <span
                      aria-hidden
                      className="h-2 w-2 shrink-0 rounded-sm"
                      style={{ background: categoryColor(category.color, index, theme) }}
                    />
                    <span className="min-w-0 flex-1 truncate">{category.name}</span>
                    <span className="font-numeric text-muted-foreground">
                      {formatMoney(category.totalCents, currency, { compact: true })}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </ChartCard>
      </div>

      <ChartCard
        title="Monthly spend"
        description="This year against last year."
        legend={
          <ChartLegend
            items={[
              { label: "This year", color: theme.series[0] },
              { label: "Last year", color: theme.series[1] },
            ]}
          />
        }
        tableView={
          <table className="w-full text-xs">
            <caption className="sr-only">Monthly spend, this year versus last year</caption>
            <thead>
              <tr className="text-left text-muted-foreground">
                <th scope="col" className="py-1 pr-4 font-medium">Month</th>
                <th scope="col" className="py-1 pr-4 font-medium">This year</th>
                <th scope="col" className="py-1 font-medium">Last year</th>
              </tr>
            </thead>
            <tbody>
              {data.monthlyTrend.map((month) => (
                <tr key={month.month} className="border-t">
                  <td className="py-1 pr-4">{month.label}</td>
                  <td className="py-1 pr-4 font-numeric">
                    {formatMoney(month.totalCents, currency)}
                  </td>
                  <td className="py-1 font-numeric">
                    {formatMoney(month.previousTotalCents, currency)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        }
      >
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={data.monthlyTrend} margin={{ top: 4, right: 4, bottom: 0, left: -12 }}>
            <CartesianGrid stroke={theme.grid} vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 11, fill: theme.axis }}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              tickFormatter={(value: number) => formatMoney(value, currency, { compact: true })}
              tick={{ fontSize: 11, fill: theme.axis }}
              tickLine={false}
              axisLine={false}
              width={64}
            />
            <Tooltip
              cursor={{ fill: theme.grid }}
              content={({ active, payload, label }) =>
                active && payload?.length ? (
                  <ChartTooltip
                    title={String(label)}
                    rows={[
                      {
                        label: "This year",
                        value: formatMoney(Number(payload[0]?.value ?? 0), currency),
                        color: theme.series[0],
                      },
                      {
                        label: "Last year",
                        value: formatMoney(Number(payload[1]?.value ?? 0), currency),
                        color: theme.series[1],
                      },
                    ]}
                  />
                ) : null
              }
            />
            <Bar dataKey="totalCents" fill={theme.series[0]} radius={[4, 4, 0, 0]} maxBarSize={26} />
            <Bar
              dataKey="previousTotalCents"
              fill={theme.series[1]}
              radius={[4, 4, 0, 0]}
              maxBarSize={26}
              fillOpacity={0.55}
            />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <div className="grid gap-4 lg:grid-cols-3">
        <section className="rounded-xl border bg-card p-5 lg:col-span-2">
          <SectionHeader
            title="Recent receipts"
            actions={
              <Button variant="ghost" size="sm" asChild>
                <Link href="/dashboard/receipts">
                  View all
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </Button>
            }
          />
          <ul className="mt-3 space-y-2">
            {data.recentReceipts.map((receipt) => (
              <ReceiptRow key={receipt._id} receipt={receipt} />
            ))}
          </ul>
        </section>

        <div className="space-y-4">
          {data.largestExpense ? (
            <section className="rounded-xl border bg-card p-5">
              <SectionHeader title="Largest expense this year" />
              <ul className="mt-3">
                <ReceiptRow receipt={data.largestExpense} />
              </ul>
            </section>
          ) : null}

          <section className="rounded-xl border bg-card p-5">
            <SectionHeader
              title="Storage"
              description={`${formatBytes(data.storage.usedBytes)} of ${formatBytes(
                data.storage.quotaBytes,
              )} used`}
            />
            <Progress value={storagePercent} className="mt-3" />
            <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
              <HardDrive className="h-3 w-3" />
              {data.receiptCount} receipt{data.receiptCount === 1 ? "" : "s"} stored
            </p>
            {storagePercent > 85 ? (
              <Button variant="outline" size="sm" className="mt-3 w-full" asChild>
                <Link href="/dashboard/billing">Upgrade for more storage</Link>
              </Button>
            ) : null}
          </section>

          <section className="rounded-xl border bg-card p-5">
            <SectionHeader title="Top merchants" description="Highest spend this year" />
            {data.topMerchants.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">Nothing to rank yet.</p>
            ) : (
              <ul className="mt-3 space-y-2.5">
                {data.topMerchants.map((merchant) => (
                  <li key={merchant.name} className="flex items-center gap-3">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted">
                      <ReceiptIcon className="h-3.5 w-3.5 text-muted-foreground" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm">{merchant.name}</span>
                      <span className="block text-xs text-muted-foreground">
                        {merchant.count} receipt{merchant.count === 1 ? "" : "s"}
                      </span>
                    </span>
                    <span className="shrink-0 text-sm font-medium font-numeric">
                      {formatMoney(merchant.totalCents, currency, { compact: true })}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  )
}
