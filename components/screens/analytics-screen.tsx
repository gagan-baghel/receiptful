"use client"

import { useQuery } from "convex/react"
import { BarChart3 } from "lucide-react"
import { useState } from "react"
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"

import { ChartCard, ChartLegend, ChartTooltip } from "@/components/charts/chart-primitives"
import { PageHeader } from "@/components/common/page-header"
import { ChartSkeleton, EmptyState } from "@/components/common/states"
import { StatCard } from "@/components/common/stat-card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { api } from "@/convex/_generated/api"
import { categoryColor, useChartTheme } from "@/lib/chart-theme"
import { formatDate, formatMoney, isoDaysAgo, todayIso } from "@/lib/format"

const RANGES = [
  { value: "30", label: "Last 30 days", granularity: "day" as const },
  { value: "90", label: "Last 90 days", granularity: "week" as const },
  { value: "180", label: "Last 6 months", granularity: "week" as const },
  { value: "365", label: "Last 12 months", granularity: "month" as const },
]

export function AnalyticsScreen() {
  const [range, setRange] = useState("90")
  const theme = useChartTheme()

  const selected = RANGES.find((item) => item.value === range) ?? RANGES[1]
  const from = isoDaysAgo(Number(range))
  const to = todayIso()

  const trends = useQuery(api.analytics.trends, {
    from,
    to,
    granularity: selected.granularity,
  })
  const breakdown = useQuery(api.analytics.breakdown, { from, to })
  const yearly = useQuery(api.analytics.yearOverYear, {})

  if (trends === undefined || breakdown === undefined || yearly === undefined) {
    return (
      <div className="space-y-5">
        <PageHeader title="Analytics" description="Loading your spending patterns…" />
        <ChartSkeleton />
        <ChartSkeleton />
      </div>
    )
  }

  const currency = trends.currency

  if (trends.count === 0) {
    return (
      <div className="space-y-5">
        <PageHeader title="Analytics" description="Where your money actually goes." />
        <EmptyState
          icon={BarChart3}
          title="Not enough data yet"
          description="Add a few receipts and this page fills with trends, category splits and year-over-year comparisons."
        />
      </div>
    )
  }

  const changePercent =
    breakdown.priorTotalCents > 0
      ? ((breakdown.totalCents - breakdown.priorTotalCents) / breakdown.priorTotalCents) * 100
      : null

  return (
    <div className="space-y-5">
      <PageHeader
        title="Analytics"
        description="Where your money actually goes."
        actions={
          <Select value={range} onValueChange={setRange}>
            <SelectTrigger className="w-40" aria-label="Date range">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {RANGES.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Total spend"
          value={formatMoney(trends.totalCents, currency)}
          hint={selected.label.toLowerCase()}
          changePercent={changePercent}
        />
        <StatCard
          label="Receipts"
          value={String(trends.count)}
          hint={`Avg ${formatMoney(trends.averageCents, currency)}`}
          invertChange={false}
        />
        <StatCard
          label="Business"
          value={formatMoney(breakdown.classification.businessCents, currency)}
          hint={`${Math.round(
            breakdown.totalCents > 0
              ? (breakdown.classification.businessCents / breakdown.totalCents) * 100
              : 0,
          )}% of spend`}
        />
        <StatCard
          label="Personal"
          value={formatMoney(breakdown.classification.personalCents, currency)}
          hint={`${Math.round(
            breakdown.totalCents > 0
              ? (breakdown.classification.personalCents / breakdown.totalCents) * 100
              : 0,
          )}% of spend`}
        />
      </div>

      <ChartCard
        title="Spending over time"
        description={`${formatDate(from)} – ${formatDate(to)}`}
        tableView={
          <table className="w-full text-xs">
            <caption className="sr-only">Spend per period</caption>
            <thead>
              <tr className="text-left text-muted-foreground">
                <th scope="col" className="py-1 pr-4 font-medium">Period</th>
                <th scope="col" className="py-1 pr-4 font-medium">Receipts</th>
                <th scope="col" className="py-1 font-medium">Total</th>
              </tr>
            </thead>
            <tbody>
              {trends.series.map((point) => (
                <tr key={point.bucket} className="border-t">
                  <td className="py-1 pr-4">{point.bucket}</td>
                  <td className="py-1 pr-4 font-numeric">{point.count}</td>
                  <td className="py-1 font-numeric">{formatMoney(point.totalCents, currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        }
      >
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={trends.series} margin={{ top: 4, right: 4, bottom: 0, left: -12 }}>
            <CartesianGrid stroke={theme.grid} vertical={false} />
            <XAxis
              dataKey="bucket"
              tick={{ fontSize: 11, fill: theme.axis }}
              tickLine={false}
              axisLine={false}
              minTickGap={24}
            />
            <YAxis
              tickFormatter={(value: number) => formatMoney(value, currency, { compact: true })}
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
                    title={String(label)}
                    rows={[
                      {
                        label: "Spent",
                        value: formatMoney(Number(payload[0].value), currency),
                        color: theme.series[0],
                      },
                      { label: "Receipts", value: String(payload[0].payload.count) },
                    ]}
                  />
                ) : null
              }
            />
            <Line
              type="monotone"
              dataKey="totalCents"
              stroke={theme.series[0]}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, strokeWidth: 2, stroke: theme.tooltipBg }}
            />
          </LineChart>
        </ResponsiveContainer>
      </ChartCard>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard
          title="By category"
          description="Share of spend in this period."
          tableView={
            <table className="w-full text-xs">
              <caption className="sr-only">Spend by category</caption>
              <thead>
                <tr className="text-left text-muted-foreground">
                  <th scope="col" className="py-1 pr-4 font-medium">Category</th>
                  <th scope="col" className="py-1 pr-4 font-medium">Share</th>
                  <th scope="col" className="py-1 font-medium">Total</th>
                </tr>
              </thead>
              <tbody>
                {breakdown.categories.map((category) => (
                  <tr key={category.id} className="border-t">
                    <td className="py-1 pr-4">{category.name}</td>
                    <td className="py-1 pr-4 font-numeric">{category.sharePercent}%</td>
                    <td className="py-1 font-numeric">
                      {formatMoney(category.totalCents, currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          }
        >
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie
                data={breakdown.categories.slice(0, 8)}
                dataKey="totalCents"
                nameKey="name"
                innerRadius={50}
                outerRadius={80}
                paddingAngle={2}
                stroke={theme.tooltipBg}
                strokeWidth={2}
              >
                {breakdown.categories.slice(0, 8).map((category, index) => (
                  <Cell key={category.id} fill={categoryColor(category.color, index, theme)} />
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
                        { label: "Receipts", value: String(payload[0].payload.count) },
                      ]}
                    />
                  ) : null
                }
              />
            </PieChart>
          </ResponsiveContainer>

          <ul className="mt-3 space-y-1.5">
            {breakdown.categories.slice(0, 8).map((category, index) => (
              <li key={category.id} className="flex items-center gap-2 text-xs">
                <span
                  aria-hidden
                  className="h-2 w-2 shrink-0 rounded-sm"
                  style={{ background: categoryColor(category.color, index, theme) }}
                />
                <span className="min-w-0 flex-1 truncate">{category.name}</span>
                <span className="font-numeric text-muted-foreground">
                  {category.sharePercent}% ·{" "}
                  {formatMoney(category.totalCents, currency, { compact: true })}
                </span>
              </li>
            ))}
          </ul>
        </ChartCard>

        <ChartCard title="Top merchants" description="Highest spend in this period.">
          {breakdown.merchants.length === 0 ? (
            <p className="py-16 text-center text-sm text-muted-foreground">
              No merchants to rank yet.
            </p>
          ) : (
            <ResponsiveContainer width="100%" height={320}>
              <BarChart
                data={breakdown.merchants.slice(0, 10)}
                layout="vertical"
                margin={{ top: 0, right: 12, bottom: 0, left: 0 }}
              >
                <CartesianGrid stroke={theme.grid} horizontal={false} />
                <XAxis
                  type="number"
                  tickFormatter={(value: number) =>
                    formatMoney(value, currency, { compact: true })
                  }
                  tick={{ fontSize: 11, fill: theme.axis }}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  tick={{ fontSize: 11, fill: theme.axis }}
                  tickLine={false}
                  axisLine={false}
                  width={110}
                />
                <Tooltip
                  cursor={{ fill: theme.grid }}
                  content={({ active, payload, label }) =>
                    active && payload?.length ? (
                      <ChartTooltip
                        title={String(label)}
                        rows={[
                          {
                            label: "Spent",
                            value: formatMoney(Number(payload[0].value), currency),
                            color: theme.series[0],
                          },
                          { label: "Receipts", value: String(payload[0].payload.count) },
                        ]}
                      />
                    ) : null
                  }
                />
                <Bar dataKey="totalCents" fill={theme.series[0]} radius={[0, 4, 4, 0]} maxBarSize={20} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </div>

      <ChartCard
        title="Year over year"
        description={`${yearly.year} against ${yearly.previousYear}`}
        legend={
          <ChartLegend
            items={[
              { label: yearly.year, color: theme.series[0] },
              { label: yearly.previousYear, color: theme.series[1] },
            ]}
          />
        }
        tableView={
          <table className="w-full text-xs">
            <caption className="sr-only">Monthly spend, year over year</caption>
            <thead>
              <tr className="text-left text-muted-foreground">
                <th scope="col" className="py-1 pr-4 font-medium">Month</th>
                <th scope="col" className="py-1 pr-4 font-medium">{yearly.year}</th>
                <th scope="col" className="py-1 font-medium">{yearly.previousYear}</th>
              </tr>
            </thead>
            <tbody>
              {yearly.months.map((month) => (
                <tr key={month.month} className="border-t">
                  <td className="py-1 pr-4">{month.label}</td>
                  <td className="py-1 pr-4 font-numeric">
                    {formatMoney(month.currentCents, currency)}
                  </td>
                  <td className="py-1 font-numeric">
                    {formatMoney(month.priorCents, currency)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        }
      >
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={yearly.months} margin={{ top: 4, right: 4, bottom: 0, left: -12 }}>
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
                        label: yearly.year,
                        value: formatMoney(Number(payload[0]?.value ?? 0), currency),
                        color: theme.series[0],
                      },
                      {
                        label: yearly.previousYear,
                        value: formatMoney(Number(payload[1]?.value ?? 0), currency),
                        color: theme.series[1],
                      },
                    ]}
                  />
                ) : null
              }
            />
            <Bar dataKey="currentCents" fill={theme.series[0]} radius={[4, 4, 0, 0]} maxBarSize={24} />
            <Bar
              dataKey="priorCents"
              fill={theme.series[1]}
              radius={[4, 4, 0, 0]}
              maxBarSize={24}
              fillOpacity={0.55}
            />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>
    </div>
  )
}
