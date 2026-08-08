import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { query } from "./_generated/server";
import { requireActiveWorkspace } from "./model/guards";
import { addDaysIso, startOfMonthIso, todayIso } from "./model/lib";
import { serializeReceipt } from "./model/receipts";

function sum(receipts: Doc<"receipts">[]) {
  return receipts.reduce((total, receipt) => total + receipt.baseAmountCents, 0);
}

function inRange(receipt: Doc<"receipts">, from: string, to: string) {
  return receipt.date >= from && receipt.date <= to;
}

/**
 * Everything the dashboard renders, in one subscription. Scoped to the current
 * and previous year so year-over-year comparisons work without a second query.
 */
export const dashboard = query({
  args: {},
  handler: async (ctx) => {
    const { workspace, user } = await requireActiveWorkspace(ctx);

    const today = todayIso();
    const year = today.slice(0, 4);
    const previousYear = String(Number(year) - 1);
    const monthStart = startOfMonthIso(today);
    const weekStart = addDaysIso(today, -6);
    const previousMonthEnd = addDaysIso(monthStart, -1);
    const previousMonthStart = startOfMonthIso(previousMonthEnd);

    const receipts = await ctx.db
      .query("receipts")
      .withIndex("by_workspace_date", (q) =>
        q.eq("workspaceId", workspace._id).gte("date", `${previousYear}-01-01`),
      )
      .collect();

    const live = receipts.filter((receipt) => receipt.deletedAt === undefined);
    const active = live.filter((receipt) => !receipt.isArchived);

    const thisYear = active.filter((receipt) => receipt.date.startsWith(year));
    const lastYear = active.filter((receipt) => receipt.date.startsWith(previousYear));
    const thisMonth = active.filter((receipt) => inRange(receipt, monthStart, today));
    const lastMonth = active.filter((receipt) =>
      inRange(receipt, previousMonthStart, previousMonthEnd),
    );
    const todayReceipts = active.filter((receipt) => receipt.date === today);

    // Rolling 7-day trend, oldest first.
    const weeklyTrend = Array.from({ length: 7 }, (_, index) => {
      const date = addDaysIso(weekStart, index);
      const dayReceipts = active.filter((receipt) => receipt.date === date);
      return { date, totalCents: sum(dayReceipts), count: dayReceipts.length };
    });

    const monthlyTrend = Array.from({ length: 12 }, (_, index) => {
      const month = `${year}-${String(index + 1).padStart(2, "0")}`;
      const monthReceipts = active.filter((receipt) => receipt.date.startsWith(month));
      const previous = lastYear.filter((receipt) =>
        receipt.date.startsWith(`${previousYear}-${String(index + 1).padStart(2, "0")}`),
      );
      return {
        month,
        label: new Date(`${month}-01T00:00:00Z`).toLocaleString("en-US", {
          month: "short",
          timeZone: "UTC",
        }),
        totalCents: sum(monthReceipts),
        previousTotalCents: sum(previous),
        count: monthReceipts.length,
      };
    });

    const categories = await ctx.db
      .query("categories")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", workspace._id))
      .collect();

    const byCategory = new Map<string, { totalCents: number; count: number }>();
    for (const receipt of thisMonth) {
      const key = receipt.categoryId ?? "uncategorized";
      const entry = byCategory.get(key) ?? { totalCents: 0, count: 0 };
      entry.totalCents += receipt.baseAmountCents;
      entry.count += 1;
      byCategory.set(key, entry);
    }

    const topCategories = [...byCategory.entries()]
      .map(([key, value]) => {
        const category = categories.find((item) => item._id === key);
        return {
          categoryId: key === "uncategorized" ? null : key,
          name: category?.name ?? "Uncategorized",
          color: category?.color ?? "#94a3b8",
          icon: category?.icon ?? "Receipt",
          ...value,
        };
      })
      .sort((a, b) => b.totalCents - a.totalCents)
      .slice(0, 6);

    const byMerchant = new Map<string, { name: string; totalCents: number; count: number }>();
    for (const receipt of thisYear) {
      if (!receipt.merchantNormalized) continue;
      const entry = byMerchant.get(receipt.merchantNormalized) ?? {
        name: receipt.merchant,
        totalCents: 0,
        count: 0,
      };
      entry.totalCents += receipt.baseAmountCents;
      entry.count += 1;
      byMerchant.set(receipt.merchantNormalized, entry);
    }

    const topMerchants = [...byMerchant.values()]
      .sort((a, b) => b.totalCents - a.totalCents)
      .slice(0, 6);

    const pendingReview = live.filter(
      (receipt) => receipt.status === "needs_review" && !receipt.isArchived,
    );
    const ocrFailures = live.filter((receipt) => receipt.status === "failed");
    const processing = live.filter((receipt) => receipt.status === "processing");
    const taxReady = thisYear.filter(
      (receipt) => receipt.taxDeductible && receipt.reviewedAt !== undefined,
    );
    const missingTaxInfo = thisYear.filter(
      (receipt) => receipt.taxDeductible && (receipt.taxCents ?? 0) === 0,
    );
    const duplicates = live.filter((receipt) => receipt.duplicateOfId !== undefined);
    const awaitingApproval = live.filter(
      (receipt) => receipt.approvalStatus === "submitted",
    );

    const largest = [...thisYear].sort(
      (a, b) => b.baseAmountCents - a.baseAmountCents,
    )[0];

    const recent = [...live]
      .sort((a, b) => b._creationTime - a._creationTime)
      .slice(0, 8);

    const monthTotal = sum(thisMonth);
    const lastMonthTotal = sum(lastMonth);

    return {
      currency: workspace.baseCurrency,
      today: {
        totalCents: sum(todayReceipts),
        count: todayReceipts.length,
      },
      month: {
        totalCents: monthTotal,
        count: thisMonth.length,
        previousTotalCents: lastMonthTotal,
        changePercent:
          lastMonthTotal > 0
            ? Math.round(((monthTotal - lastMonthTotal) / lastMonthTotal) * 100)
            : null,
      },
      year: {
        totalCents: sum(thisYear),
        count: thisYear.length,
        previousTotalCents: sum(lastYear),
      },
      averageReceiptCents:
        thisYear.length > 0 ? Math.round(sum(thisYear) / thisYear.length) : 0,
      receiptCount: live.length,
      weeklyTrend,
      monthlyTrend,
      topCategories,
      topMerchants,
      largestExpense: largest ? await serializeReceipt(ctx, largest) : null,
      recentReceipts: await Promise.all(
        recent.map((receipt) => serializeReceipt(ctx, receipt)),
      ),
      attention: {
        pendingReview: pendingReview.length,
        ocrFailures: ocrFailures.length,
        processing: processing.length,
        duplicates: duplicates.length,
        awaitingApproval: awaitingApproval.length,
        missingTaxInfo: missingTaxInfo.length,
      },
      tax: {
        readyCount: taxReady.length,
        readyTotalCents: sum(taxReady),
        deductibleTotalCents: sum(thisYear.filter((receipt) => receipt.taxDeductible)),
        taxPaidCents: thisYear.reduce(
          (total, receipt) => total + (receipt.taxCents ?? 0),
          0,
        ),
      },
      storage: {
        usedBytes: workspace.storageUsedBytes,
        quotaBytes: workspace.storageQuotaBytes,
      },
      viewerName: user.name ?? "",
    };
  },
});

/** Time series for the analytics screen. */
export const trends = query({
  args: {
    from: v.string(),
    to: v.string(),
    granularity: v.union(v.literal("day"), v.literal("week"), v.literal("month")),
    classification: v.optional(
      v.union(v.literal("business"), v.literal("personal")),
    ),
  },
  handler: async (ctx, args) => {
    const { workspace } = await requireActiveWorkspace(ctx);

    const receipts = (
      await ctx.db
        .query("receipts")
        .withIndex("by_workspace_date", (q) =>
          q.eq("workspaceId", workspace._id).gte("date", args.from).lte("date", args.to),
        )
        .collect()
    ).filter(
      (receipt) =>
        receipt.deletedAt === undefined &&
        (!args.classification || receipt.classification === args.classification),
    );

    const buckets = new Map<string, { totalCents: number; count: number; taxCents: number }>();

    for (const receipt of receipts) {
      let key = receipt.date;
      if (args.granularity === "month") {
        key = receipt.date.slice(0, 7);
      } else if (args.granularity === "week") {
        const date = new Date(`${receipt.date}T00:00:00Z`);
        const day = date.getUTCDay();
        // Bucket by ISO week start (Monday).
        date.setUTCDate(date.getUTCDate() - ((day + 6) % 7));
        key = date.toISOString().slice(0, 10);
      }

      const entry = buckets.get(key) ?? { totalCents: 0, count: 0, taxCents: 0 };
      entry.totalCents += receipt.baseAmountCents;
      entry.taxCents += receipt.taxCents ?? 0;
      entry.count += 1;
      buckets.set(key, entry);
    }

    const series = [...buckets.entries()]
      .map(([bucket, value]) => ({ bucket, ...value }))
      .sort((a, b) => a.bucket.localeCompare(b.bucket));

    const totalCents = series.reduce((total, point) => total + point.totalCents, 0);

    return {
      series,
      totalCents,
      count: receipts.length,
      averageCents: receipts.length > 0 ? Math.round(totalCents / receipts.length) : 0,
      currency: workspace.baseCurrency,
    };
  },
});

/** Category and merchant breakdowns with period-over-period deltas. */
export const breakdown = query({
  args: { from: v.string(), to: v.string() },
  handler: async (ctx, args) => {
    const { workspace } = await requireActiveWorkspace(ctx);

    const spanDays = Math.max(
      1,
      Math.round(
        (new Date(`${args.to}T00:00:00Z`).getTime() -
          new Date(`${args.from}T00:00:00Z`).getTime()) /
          86_400_000,
      ) + 1,
    );
    const priorFrom = addDaysIso(args.from, -spanDays);
    const priorTo = addDaysIso(args.from, -1);

    const receipts = await ctx.db
      .query("receipts")
      .withIndex("by_workspace_date", (q) =>
        q.eq("workspaceId", workspace._id).gte("date", priorFrom).lte("date", args.to),
      )
      .collect();

    const live = receipts.filter((receipt) => receipt.deletedAt === undefined);
    const current = live.filter((receipt) => inRange(receipt, args.from, args.to));
    const prior = live.filter((receipt) => inRange(receipt, priorFrom, priorTo));

    const categories = await ctx.db
      .query("categories")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", workspace._id))
      .collect();

    const group = (rows: Doc<"receipts">[], key: "categoryId" | "merchantNormalized") => {
      const map = new Map<string, { totalCents: number; count: number; label: string }>();
      for (const receipt of rows) {
        const raw = receipt[key];
        const id = raw ?? "uncategorized";
        const label =
          key === "categoryId"
            ? categories.find((category) => category._id === raw)?.name ?? "Uncategorized"
            : receipt.merchant || "Unknown merchant";
        const entry = map.get(id) ?? { totalCents: 0, count: 0, label };
        entry.totalCents += receipt.baseAmountCents;
        entry.count += 1;
        map.set(id, entry);
      }
      return map;
    };

    const currentCategories = group(current, "categoryId");
    const priorCategories = group(prior, "categoryId");
    const currentMerchants = group(current, "merchantNormalized");

    const totalCents = current.reduce(
      (total, receipt) => total + receipt.baseAmountCents,
      0,
    );

    return {
      currency: workspace.baseCurrency,
      totalCents,
      priorTotalCents: prior.reduce(
        (total, receipt) => total + receipt.baseAmountCents,
        0,
      ),
      categories: [...currentCategories.entries()]
        .map(([id, value]) => {
          const category = categories.find((item) => item._id === id);
          const priorTotal = priorCategories.get(id)?.totalCents ?? 0;
          return {
            id,
            name: value.label,
            color: category?.color ?? "#94a3b8",
            totalCents: value.totalCents,
            count: value.count,
            priorTotalCents: priorTotal,
            sharePercent:
              totalCents > 0 ? Math.round((value.totalCents / totalCents) * 100) : 0,
          };
        })
        .sort((a, b) => b.totalCents - a.totalCents),
      merchants: [...currentMerchants.values()]
        .map((value) => ({
          name: value.label,
          totalCents: value.totalCents,
          count: value.count,
        }))
        .sort((a, b) => b.totalCents - a.totalCents)
        .slice(0, 15),
      paymentMethods: [...current.reduce((map, receipt) => {
        const entry = map.get(receipt.paymentMethod) ?? { totalCents: 0, count: 0 };
        entry.totalCents += receipt.baseAmountCents;
        entry.count += 1;
        map.set(receipt.paymentMethod, entry);
        return map;
      }, new Map<string, { totalCents: number; count: number }>())]
        .map(([method, value]) => ({ method, ...value }))
        .sort((a, b) => b.totalCents - a.totalCents),
      classification: {
        businessCents: current
          .filter((receipt) => receipt.classification === "business")
          .reduce((total, receipt) => total + receipt.baseAmountCents, 0),
        personalCents: current
          .filter((receipt) => receipt.classification === "personal")
          .reduce((total, receipt) => total + receipt.baseAmountCents, 0),
      },
    };
  },
});

/** Month-by-month current vs previous year, for the comparison chart. */
export const yearOverYear = query({
  args: { year: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const { workspace } = await requireActiveWorkspace(ctx);
    const year = args.year ?? todayIso().slice(0, 4);
    const previousYear = String(Number(year) - 1);

    const receipts = (
      await ctx.db
        .query("receipts")
        .withIndex("by_workspace_date", (q) =>
          q
            .eq("workspaceId", workspace._id)
            .gte("date", `${previousYear}-01-01`)
            .lte("date", `${year}-12-31`),
        )
        .collect()
    ).filter((receipt) => receipt.deletedAt === undefined);

    const months = Array.from({ length: 12 }, (_, index) => {
      const suffix = String(index + 1).padStart(2, "0");
      const currentTotal = sum(
        receipts.filter((receipt) => receipt.date.startsWith(`${year}-${suffix}`)),
      );
      const priorTotal = sum(
        receipts.filter((receipt) => receipt.date.startsWith(`${previousYear}-${suffix}`)),
      );
      return {
        month: suffix,
        label: new Date(`${year}-${suffix}-01T00:00:00Z`).toLocaleString("en-US", {
          month: "short",
          timeZone: "UTC",
        }),
        currentCents: currentTotal,
        priorCents: priorTotal,
        changePercent:
          priorTotal > 0
            ? Math.round(((currentTotal - priorTotal) / priorTotal) * 100)
            : null,
      };
    });

    return {
      year,
      previousYear,
      months,
      currency: workspace.baseCurrency,
      currentTotalCents: months.reduce((total, month) => total + month.currentCents, 0),
      priorTotalCents: months.reduce((total, month) => total + month.priorCents, 0),
    };
  },
});
