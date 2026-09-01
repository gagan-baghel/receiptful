import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { query } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";
import { requireActiveWorkspace } from "./model/guards";
import { addDaysIso, startOfMonthIso, todayIso } from "./model/lib";
import { serializeReceipt } from "./model/receipts";

/**
 * Reads come from the `rollups` table, so their cost scales with the number of
 * date buckets in range — never with the number of receipts. The only receipt
 * rows these queries touch are the handful they actually display.
 */

type Bucket = {
  bucket: string;
  key: string;
  label?: string;
  totalCents: number;
  count: number;
  taxCents: number;
  deductibleCents: number;
};

async function readRollups(
  ctx: QueryCtx,
  workspaceId: Doc<"workspaces">["_id"],
  kind: "day" | "category" | "merchant",
  from: string,
  to: string,
): Promise<Bucket[]> {
  const rows = await ctx.db
    .query("rollups")
    .withIndex("by_workspace_kind_bucket", (q) =>
      q
        .eq("workspaceId", workspaceId)
        .eq("kind", kind)
        .gte("bucket", from)
        .lte("bucket", to),
    )
    .collect();

  return rows.map((row) => ({
    bucket: row.bucket,
    key: row.key,
    label: row.label,
    totalCents: row.totalCents,
    count: row.count,
    taxCents: row.taxCents,
    deductibleCents: row.deductibleCents,
  }));
}

function inRange(receipt: Doc<"receipts">, from: string, to: string) {
  return receipt.date >= from && receipt.date <= to;
}

function total(buckets: Bucket[]) {
  return buckets.reduce((sum, bucket) => sum + bucket.totalCents, 0);
}

function countOf(buckets: Bucket[]) {
  return buckets.reduce((sum, bucket) => sum + bucket.count, 0);
}

function within(buckets: Bucket[], from: string, to: string) {
  return buckets.filter((bucket) => bucket.bucket >= from && bucket.bucket <= to);
}

/** Cheap "how many, roughly" for the attention tiles — capped, never a scan. */
const ATTENTION_CAP = 100;

async function countByStatus(
  ctx: QueryCtx,
  workspaceId: Doc<"workspaces">["_id"],
  status: Doc<"receipts">["status"],
) {
  const rows = await ctx.db
    .query("receipts")
    .withIndex("by_workspace_status", (q) =>
      q.eq("workspaceId", workspaceId).eq("status", status),
    )
    .take(ATTENTION_CAP + 1);

  return rows.filter((receipt) => receipt.deletedAt === undefined).length;
}

/**
 * Everything the dashboard renders, in one subscription.
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

    const days = await readRollups(
      ctx,
      workspace._id,
      "day",
      `${previousYear}-01-01`,
      `${year}-12-31`,
    );

    const thisYear = within(days, `${year}-01-01`, `${year}-12-31`);
    const lastYear = within(days, `${previousYear}-01-01`, `${previousYear}-12-31`);
    const thisMonth = within(days, monthStart, today);
    const lastMonth = within(days, previousMonthStart, previousMonthEnd);
    const todayBuckets = within(days, today, today);

    const byDate = new Map(days.map((bucket) => [bucket.bucket, bucket]));

    const weeklyTrend = Array.from({ length: 7 }, (_, index) => {
      const date = addDaysIso(weekStart, index);
      const bucket = byDate.get(date);
      return {
        date,
        totalCents: bucket?.totalCents ?? 0,
        count: bucket?.count ?? 0,
      };
    });

    const monthlyTrend = Array.from({ length: 12 }, (_, index) => {
      const suffix = String(index + 1).padStart(2, "0");
      const month = `${year}-${suffix}`;
      const current = days.filter((bucket) => bucket.bucket.startsWith(month));
      const previous = days.filter((bucket) =>
        bucket.bucket.startsWith(`${previousYear}-${suffix}`),
      );
      return {
        month,
        label: new Date(`${month}-01T00:00:00Z`).toLocaleString("en-US", {
          month: "short",
          timeZone: "UTC",
        }),
        totalCents: total(current),
        previousTotalCents: total(previous),
        count: countOf(current),
      };
    });

    const categories = await ctx.db
      .query("categories")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", workspace._id))
      .collect();

    const categoryBuckets = await readRollups(
      ctx,
      workspace._id,
      "category",
      today.slice(0, 7),
      today.slice(0, 7),
    );

    const topCategories = categoryBuckets
      .map((bucket) => {
        const category = categories.find((item) => item._id === bucket.key);
        return {
          categoryId: bucket.key === "uncategorized" ? null : bucket.key,
          name: category?.name ?? "Uncategorized",
          color: category?.color ?? "#94a3b8",
          icon: category?.icon ?? "Receipt",
          totalCents: bucket.totalCents,
          count: bucket.count,
        };
      })
      .sort((a, b) => b.totalCents - a.totalCents)
      .slice(0, 6);

    const merchantBuckets = await readRollups(
      ctx,
      workspace._id,
      "merchant",
      year,
      year,
    );

    const topMerchants = merchantBuckets
      .map((bucket) => ({
        name: bucket.label ?? "Unknown merchant",
        totalCents: bucket.totalCents,
        count: bucket.count,
      }))
      .sort((a, b) => b.totalCents - a.totalCents)
      .slice(0, 6);

    const [pendingReview, ocrFailures, processing] = await Promise.all([
      countByStatus(ctx, workspace._id, "needs_review"),
      countByStatus(ctx, workspace._id, "failed"),
      countByStatus(ctx, workspace._id, "processing"),
    ]);

    const awaitingApproval = (
      await ctx.db
        .query("receipts")
        .withIndex("by_workspace_approval", (q) =>
          q.eq("workspaceId", workspace._id).eq("approvalStatus", "submitted"),
        )
        .take(ATTENTION_CAP + 1)
    ).filter((receipt) => receipt.deletedAt === undefined).length;

    // Recent and largest read a bounded window of rows, not the archive.
    const recentRows = (
      await ctx.db
        .query("receipts")
        .withIndex("by_workspace", (q) => q.eq("workspaceId", workspace._id))
        .order("desc")
        .take(40)
    ).filter((receipt) => receipt.deletedAt === undefined);

    const recent = recentRows.slice(0, 8);

    const largestCandidates = (
      await ctx.db
        .query("receipts")
        .withIndex("by_workspace_date", (q) =>
          q
            .eq("workspaceId", workspace._id)
            .gte("date", `${year}-01-01`)
            .lte("date", `${year}-12-31`),
        )
        .order("desc")
        .take(200)
    ).filter((receipt) => receipt.deletedAt === undefined && !receipt.isArchived);

    const largest = [...largestCandidates].sort(
      (a, b) => b.baseAmountCents - a.baseAmountCents,
    )[0];

    const duplicates = recentRows.filter(
      (receipt) => receipt.duplicateOfId !== undefined,
    ).length;

    const monthTotal = total(thisMonth);
    const lastMonthTotal = total(lastMonth);
    const yearTotal = total(thisYear);
    const yearCount = countOf(thisYear);

    return {
      currency: workspace.baseCurrency,
      today: {
        totalCents: total(todayBuckets),
        count: countOf(todayBuckets),
      },
      month: {
        totalCents: monthTotal,
        count: countOf(thisMonth),
        previousTotalCents: lastMonthTotal,
        changePercent:
          lastMonthTotal > 0
            ? Math.round(((monthTotal - lastMonthTotal) / lastMonthTotal) * 100)
            : null,
      },
      year: {
        totalCents: yearTotal,
        count: yearCount,
        previousTotalCents: total(lastYear),
      },
      averageReceiptCents: yearCount > 0 ? Math.round(yearTotal / yearCount) : 0,
      receiptCount: workspace.receiptCount,
      weeklyTrend,
      monthlyTrend,
      topCategories,
      topMerchants,
      largestExpense: largest ? await serializeReceipt(ctx, largest) : null,
      recentReceipts: await Promise.all(
        recent.map((receipt) => serializeReceipt(ctx, receipt)),
      ),
      attention: {
        pendingReview,
        ocrFailures,
        processing,
        duplicates,
        awaitingApproval,
        missingTaxInfo: thisYear.reduce(
          (sum, bucket) => sum + (bucket.deductibleCents > 0 && bucket.taxCents === 0 ? 1 : 0),
          0,
        ),
      },
      tax: {
        readyCount: yearCount,
        readyTotalCents: thisYear.reduce(
          (sum, bucket) => sum + bucket.deductibleCents,
          0,
        ),
        deductibleTotalCents: thisYear.reduce(
          (sum, bucket) => sum + bucket.deductibleCents,
          0,
        ),
        taxPaidCents: thisYear.reduce((sum, bucket) => sum + bucket.taxCents, 0),
      },
      storage: {
        usedBytes: workspace.storageUsedBytes,
        quotaBytes: workspace.storageQuotaBytes,
      },
      viewerName: user.name ?? "",
    };
  },
});

/** Time series for the analytics screen, served from the day rollups. */
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

    // ponytail: rollups do not split by classification, so that filter still
    // needs the receipt rows. It is range-scoped, which bounds it; split the
    // rollup key by classification if this becomes the hot path.
    if (args.classification) {
      const receipts = (
        await ctx.db
          .query("receipts")
          .withIndex("by_workspace_date", (q) =>
            q.eq("workspaceId", workspace._id).gte("date", args.from).lte("date", args.to),
          )
          .take(5000)
      ).filter(
        (receipt) =>
          receipt.deletedAt === undefined &&
          !receipt.isArchived &&
          receipt.classification === args.classification,
      );

      return buildSeries(
        receipts.map((receipt) => ({
          bucket: receipt.date,
          totalCents: receipt.baseAmountCents,
          count: 1,
          taxCents: receipt.taxCents ?? 0,
        })),
        args.granularity,
        workspace.baseCurrency,
      );
    }

    const days = await readRollups(ctx, workspace._id, "day", args.from, args.to);
    return buildSeries(days, args.granularity, workspace.baseCurrency);
  },
});

function buildSeries(
  rows: { bucket: string; totalCents: number; count: number; taxCents: number }[],
  granularity: "day" | "week" | "month",
  currency: string,
) {
  const buckets = new Map<string, { totalCents: number; count: number; taxCents: number }>();

  for (const row of rows) {
    let key = row.bucket;
    if (granularity === "month") {
      key = row.bucket.slice(0, 7);
    } else if (granularity === "week") {
      const date = new Date(`${row.bucket}T00:00:00Z`);
      const day = date.getUTCDay();
      // Bucket by ISO week start (Monday).
      date.setUTCDate(date.getUTCDate() - ((day + 6) % 7));
      key = date.toISOString().slice(0, 10);
    }

    const entry = buckets.get(key) ?? { totalCents: 0, count: 0, taxCents: 0 };
    entry.totalCents += row.totalCents;
    entry.taxCents += row.taxCents;
    entry.count += row.count;
    buckets.set(key, entry);
  }

  const series = [...buckets.entries()]
    .map(([bucket, value]) => ({ bucket, ...value }))
    .sort((a, b) => a.bucket.localeCompare(b.bucket));

  const totalCents = series.reduce((sum, point) => sum + point.totalCents, 0);
  const count = series.reduce((sum, point) => sum + point.count, 0);

  return {
    series,
    totalCents,
    count,
    averageCents: count > 0 ? Math.round(totalCents / count) : 0,
    currency,
  };
}

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


/** Month-by-month current vs previous year, from the day rollups. */
export const yearOverYear = query({
  args: { year: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const { workspace } = await requireActiveWorkspace(ctx);
    const year = args.year ?? todayIso().slice(0, 4);
    const previousYear = String(Number(year) - 1);

    const days = await readRollups(
      ctx,
      workspace._id,
      "day",
      `${previousYear}-01-01`,
      `${year}-12-31`,
    );

    const months = Array.from({ length: 12 }, (_, index) => {
      const suffix = String(index + 1).padStart(2, "0");
      const currentTotal = total(
        days.filter((bucket) => bucket.bucket.startsWith(`${year}-${suffix}`)),
      );
      const priorTotal = total(
        days.filter((bucket) => bucket.bucket.startsWith(`${previousYear}-${suffix}`)),
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
      currentTotalCents: months.reduce((sum, month) => sum + month.currentCents, 0),
      priorTotalCents: months.reduce((sum, month) => sum + month.priorCents, 0),
    };
  },
});
