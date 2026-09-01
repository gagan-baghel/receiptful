import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";

/**
 * Incremental aggregation for the dashboard and analytics screens.
 *
 * A receipt contributes to three rollup grains: its day, its category-month and
 * its merchant-year. Every receipt write computes the difference between what
 * the row used to contribute and what it contributes now, so the totals stay
 * exact without anything ever re-reading the receipt table.
 */

export type Contribution = {
  workspaceId: Id<"workspaces">;
  date: string;
  totalCents: number;
  taxCents: number;
  deductibleCents: number;
  categoryKey: string;
  merchantKey: string;
  merchantLabel: string;
};

/**
 * What a receipt currently adds to the totals, or null when it adds nothing.
 * Deleted and archived receipts are excluded here rather than filtered later,
 * which is what keeps the rollups and the list views agreeing.
 */
export function contributionOf(
  receipt: Doc<"receipts"> | null | undefined,
): Contribution | null {
  if (!receipt) return null;
  if (receipt.deletedAt !== undefined) return null;
  if (receipt.isArchived) return null;

  return {
    workspaceId: receipt.workspaceId,
    date: receipt.date,
    totalCents: receipt.baseAmountCents,
    taxCents: receipt.taxCents ?? 0,
    deductibleCents: receipt.taxDeductible ? receipt.baseAmountCents : 0,
    categoryKey: receipt.categoryId ?? "uncategorized",
    merchantKey: receipt.merchantNormalized || "unknown",
    merchantLabel: receipt.merchant || "Unknown merchant",
  };
}

type Grain = { kind: "day" | "category" | "merchant"; bucket: string; key: string; label?: string };

function grainsFor(contribution: Contribution): Grain[] {
  return [
    { kind: "day", bucket: contribution.date, key: "" },
    {
      kind: "category",
      bucket: contribution.date.slice(0, 7),
      key: contribution.categoryKey,
    },
    {
      kind: "merchant",
      bucket: contribution.date.slice(0, 4),
      key: contribution.merchantKey,
      label: contribution.merchantLabel,
    },
  ];
}

async function bump(
  ctx: MutationCtx,
  workspaceId: Id<"workspaces">,
  grain: Grain,
  delta: { totalCents: number; count: number; taxCents: number; deductibleCents: number },
) {
  if (
    delta.totalCents === 0 &&
    delta.count === 0 &&
    delta.taxCents === 0 &&
    delta.deductibleCents === 0
  ) {
    return;
  }

  const existing = await ctx.db
    .query("rollups")
    .withIndex("by_workspace_kind_bucket_key", (q) =>
      q
        .eq("workspaceId", workspaceId)
        .eq("kind", grain.kind)
        .eq("bucket", grain.bucket)
        .eq("key", grain.key),
    )
    .unique();

  if (!existing) {
    if (delta.count <= 0) return;
    await ctx.db.insert("rollups", {
      workspaceId,
      kind: grain.kind,
      bucket: grain.bucket,
      key: grain.key,
      label: grain.label,
      totalCents: delta.totalCents,
      count: delta.count,
      taxCents: delta.taxCents,
      deductibleCents: delta.deductibleCents,
    });
    return;
  }

  const count = existing.count + delta.count;

  // An empty bucket is deleted rather than left at zero, so range scans stay
  // proportional to buckets that actually hold something.
  if (count <= 0) {
    await ctx.db.delete(existing._id);
    return;
  }

  await ctx.db.patch(existing._id, {
    totalCents: existing.totalCents + delta.totalCents,
    count,
    taxCents: existing.taxCents + delta.taxCents,
    deductibleCents: existing.deductibleCents + delta.deductibleCents,
    label: grain.label ?? existing.label,
  });
}

/** Applies the difference between a receipt's old and new contribution. */
export async function applyRollupDelta(
  ctx: MutationCtx,
  before: Contribution | null,
  after: Contribution | null,
) {
  if (!before && !after) return;

  if (before) {
    for (const grain of grainsFor(before)) {
      await bump(ctx, before.workspaceId, grain, {
        totalCents: -before.totalCents,
        count: -1,
        taxCents: -before.taxCents,
        deductibleCents: -before.deductibleCents,
      });
    }
  }

  if (after) {
    for (const grain of grainsFor(after)) {
      await bump(ctx, after.workspaceId, grain, {
        totalCents: after.totalCents,
        count: 1,
        taxCents: after.taxCents,
        deductibleCents: after.deductibleCents,
      });
    }
  }
}

/** Convenience for the common "patch a receipt, then resync" shape. */
export async function syncRollups(
  ctx: MutationCtx,
  before: Contribution | null,
  receiptId: Id<"receipts">,
) {
  await applyRollupDelta(ctx, before, contributionOf(await ctx.db.get(receiptId)));
}
