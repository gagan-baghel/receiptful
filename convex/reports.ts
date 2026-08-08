import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";
import {
  assertCapability,
  requireActiveWorkspace,
  requireMember,
  writeAudit,
} from "./model/guards";
import { quarterOf, todayIso } from "./model/lib";

const reportTypeValidator = v.union(
  v.literal("expense"),
  v.literal("monthly"),
  v.literal("quarterly"),
  v.literal("yearly"),
  v.literal("business"),
  v.literal("project"),
  v.literal("tax"),
);

type ReportFilters = {
  categoryIds?: Id<"categories">[];
  tagIds?: Id<"tags">[];
  folderIds?: Id<"folders">[];
  classification?: "business" | "personal";
  taxDeductibleOnly?: boolean;
  reimbursableOnly?: boolean;
  uploaderId?: Id<"users">;
  projectName?: string;
  includeArchived?: boolean;
};

async function selectReceipts(
  ctx: QueryCtx,
  workspaceId: Id<"workspaces">,
  fromDate: string,
  toDate: string,
  filters: ReportFilters,
) {
  const rows = await ctx.db
    .query("receipts")
    .withIndex("by_workspace_date", (q) =>
      q.eq("workspaceId", workspaceId).gte("date", fromDate).lte("date", toDate),
    )
    .collect();

  let tagMatches: Set<string> | null = null;
  if (filters.tagIds?.length) {
    tagMatches = new Set();
    for (const tagId of filters.tagIds) {
      const links = await ctx.db
        .query("receiptTags")
        .withIndex("by_tag", (q) => q.eq("tagId", tagId))
        .collect();
      for (const link of links) tagMatches.add(link.receiptId);
    }
  }

  let folderMatches: Set<string> | null = null;
  if (filters.folderIds?.length) {
    folderMatches = new Set();
    for (const folderId of filters.folderIds) {
      const links = await ctx.db
        .query("receiptFolders")
        .withIndex("by_folder", (q) => q.eq("folderId", folderId))
        .collect();
      for (const link of links) folderMatches.add(link.receiptId);
    }
  }

  return rows.filter((receipt) => {
    if (receipt.deletedAt !== undefined) return false;
    if (receipt.isArchived && !filters.includeArchived) return false;
    if (filters.categoryIds?.length) {
      if (!receipt.categoryId || !filters.categoryIds.includes(receipt.categoryId)) {
        return false;
      }
    }
    if (tagMatches && !tagMatches.has(receipt._id)) return false;
    if (folderMatches && !folderMatches.has(receipt._id)) return false;
    if (filters.classification && receipt.classification !== filters.classification) {
      return false;
    }
    if (filters.taxDeductibleOnly && !receipt.taxDeductible) return false;
    if (filters.reimbursableOnly && !receipt.reimbursable) return false;
    if (filters.uploaderId && receipt.uploaderId !== filters.uploaderId) return false;
    if (filters.projectName && receipt.projectName !== filters.projectName) return false;
    return true;
  });
}

/** Fully-resolved rows for on-screen preview and every export format. */
async function buildRows(ctx: QueryCtx, receipts: Doc<"receipts">[]) {
  return await Promise.all(
    receipts.map(async (receipt) => {
      const category = receipt.categoryId ? await ctx.db.get(receipt.categoryId) : null;
      const uploader = await ctx.db.get(receipt.uploaderId);

      const tagLinks = await ctx.db
        .query("receiptTags")
        .withIndex("by_receipt", (q) => q.eq("receiptId", receipt._id))
        .collect();
      const tags = (
        await Promise.all(tagLinks.map((link) => ctx.db.get(link.tagId)))
      )
        .filter((tag): tag is Doc<"tags"> => tag !== null)
        .map((tag) => tag.name);

      return {
        _id: receipt._id,
        date: receipt.date,
        merchant: receipt.merchant,
        category: category?.name ?? "Uncategorized",
        categoryColor: category?.color ?? "#94a3b8",
        amountCents: receipt.amountCents,
        baseAmountCents: receipt.baseAmountCents,
        currency: receipt.currency,
        taxCents: receipt.taxCents ?? 0,
        subtotalCents: receipt.subtotalCents ?? null,
        paymentMethod: receipt.paymentMethod,
        cardLast4: receipt.cardLast4 ?? "",
        invoiceNumber: receipt.invoiceNumber ?? "",
        classification: receipt.classification,
        taxDeductible: receipt.taxDeductible,
        reimbursable: receipt.reimbursable,
        projectName: receipt.projectName ?? "",
        notes: receipt.notes ?? "",
        tags,
        uploader: uploader?.name ?? "",
        reviewed: receipt.reviewedAt !== undefined,
        pageCount: receipt.pageCount,
      };
    }),
  );
}

function summarize(rows: Awaited<ReturnType<typeof buildRows>>) {
  const totalCents = rows.reduce((total, row) => total + row.baseAmountCents, 0);
  const taxTotalCents = rows.reduce((total, row) => total + row.taxCents, 0);

  const byCategory = new Map<string, { totalCents: number; count: number; color: string }>();
  for (const row of rows) {
    const entry = byCategory.get(row.category) ?? {
      totalCents: 0,
      count: 0,
      color: row.categoryColor,
    };
    entry.totalCents += row.baseAmountCents;
    entry.count += 1;
    byCategory.set(row.category, entry);
  }

  return {
    totalCents,
    taxTotalCents,
    count: rows.length,
    averageCents: rows.length > 0 ? Math.round(totalCents / rows.length) : 0,
    deductibleCents: rows
      .filter((row) => row.taxDeductible)
      .reduce((total, row) => total + row.baseAmountCents, 0),
    reimbursableCents: rows
      .filter((row) => row.reimbursable)
      .reduce((total, row) => total + row.baseAmountCents, 0),
    byCategory: [...byCategory.entries()]
      .map(([name, value]) => ({ name, ...value }))
      .sort((a, b) => b.totalCents - a.totalCents),
  };
}

const filtersArg = v.optional(
  v.object({
    categoryIds: v.optional(v.array(v.id("categories"))),
    tagIds: v.optional(v.array(v.id("tags"))),
    folderIds: v.optional(v.array(v.id("folders"))),
    classification: v.optional(
      v.union(v.literal("business"), v.literal("personal")),
    ),
    taxDeductibleOnly: v.optional(v.boolean()),
    reimbursableOnly: v.optional(v.boolean()),
    uploaderId: v.optional(v.id("users")),
    projectName: v.optional(v.string()),
    includeArchived: v.optional(v.boolean()),
  }),
);

/** Live preview — recomputed as the user tweaks the report builder. */
export const preview = query({
  args: { fromDate: v.string(), toDate: v.string(), filters: filtersArg },
  handler: async (ctx, args) => {
    const { workspace } = await requireActiveWorkspace(ctx);

    const receipts = await selectReceipts(
      ctx,
      workspace._id,
      args.fromDate,
      args.toDate,
      (args.filters ?? {}) as ReportFilters,
    );

    const rows = await buildRows(
      ctx,
      receipts.sort((a, b) => a.date.localeCompare(b.date)),
    );

    return {
      rows,
      summary: summarize(rows),
      currency: workspace.baseCurrency,
      workspaceName: workspace.name,
      taxLabel: workspace.taxLabel,
    };
  },
});

export const list = query({
  args: {},
  handler: async (ctx) => {
    const { workspace } = await requireActiveWorkspace(ctx);

    const reports = await ctx.db
      .query("reports")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", workspace._id))
      .order("desc")
      .take(100);

    return await Promise.all(
      reports.map(async (report) => {
        const creator = await ctx.db.get(report.createdBy);
        return {
          _id: report._id,
          name: report.name,
          type: report.type,
          fromDate: report.fromDate,
          toDate: report.toDate,
          totalCents: report.totalCents,
          taxTotalCents: report.taxTotalCents,
          currency: report.currency,
          receiptCount: report.receiptIds.length,
          approvalStatus: report.approvalStatus,
          submittedAt: report.submittedAt,
          createdAt: report._creationTime,
          createdByName: creator?.name ?? "",
        };
      }),
    );
  },
});

export const get = query({
  args: { reportId: v.id("reports") },
  handler: async (ctx, args) => {
    const report = await ctx.db.get(args.reportId);
    if (!report) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Report not found." });
    }
    const { workspace } = await requireMember(ctx, report.workspaceId);

    const receipts = (
      await Promise.all(report.receiptIds.map((id) => ctx.db.get(id)))
    ).filter((receipt): receipt is Doc<"receipts"> => receipt !== null);

    const rows = await buildRows(
      ctx,
      receipts.sort((a, b) => a.date.localeCompare(b.date)),
    );

    const approval = await ctx.db
      .query("approvals")
      .withIndex("by_report", (q) => q.eq("reportId", args.reportId))
      .first();

    const comments = approval
      ? await ctx.db
          .query("approvalComments")
          .withIndex("by_approval", (q) => q.eq("approvalId", approval._id))
          .collect()
      : [];

    return {
      report: {
        _id: report._id,
        name: report.name,
        type: report.type,
        fromDate: report.fromDate,
        toDate: report.toDate,
        approvalStatus: report.approvalStatus,
        submittedAt: report.submittedAt,
        createdAt: report._creationTime,
      },
      rows,
      summary: summarize(rows),
      currency: report.currency,
      workspaceName: workspace.name,
      taxLabel: workspace.taxLabel,
      approval: approval
        ? {
            _id: approval._id,
            status: approval.status,
            submittedAt: approval.submittedAt,
            decidedAt: approval.decidedAt,
            comments: await Promise.all(
              comments.map(async (comment) => {
                const author = await ctx.db.get(comment.authorId);
                return {
                  _id: comment._id,
                  body: comment.body,
                  action: comment.action,
                  createdAt: comment._creationTime,
                  authorName: author?.name ?? "",
                };
              }),
            ),
          }
        : null,
    };
  },
});

export const create = mutation({
  args: {
    name: v.string(),
    type: reportTypeValidator,
    fromDate: v.string(),
    toDate: v.string(),
    filters: filtersArg,
  },
  handler: async (ctx, args) => {
    const { workspace, member, user } = await requireActiveWorkspace(ctx);
    assertCapability(member.role, "report.create");

    const name = args.name.trim();
    if (!name || name.length > 120) {
      throw new ConvexError({
        code: "INVALID_INPUT",
        message: "Report name must be 1–120 characters.",
      });
    }
    if (args.fromDate > args.toDate) {
      throw new ConvexError({
        code: "INVALID_INPUT",
        message: "The start date must be before the end date.",
      });
    }

    const filters = (args.filters ?? {}) as ReportFilters;
    if (args.type === "tax") filters.taxDeductibleOnly = true;
    if (args.type === "business") filters.classification = "business";

    const receipts = await selectReceipts(
      ctx,
      workspace._id,
      args.fromDate,
      args.toDate,
      filters,
    );

    if (receipts.length === 0) {
      throw new ConvexError({
        code: "EMPTY_REPORT",
        message: "No receipts match these settings. Widen the date range or filters.",
      });
    }

    const reportId = await ctx.db.insert("reports", {
      workspaceId: workspace._id,
      createdBy: user._id,
      name,
      type: args.type,
      fromDate: args.fromDate,
      toDate: args.toDate,
      filtersJson: JSON.stringify(filters),
      receiptIds: receipts.map((receipt) => receipt._id),
      totalCents: receipts.reduce((total, receipt) => total + receipt.baseAmountCents, 0),
      taxTotalCents: receipts.reduce(
        (total, receipt) => total + (receipt.taxCents ?? 0),
        0,
      ),
      currency: workspace.baseCurrency,
      approvalStatus: "none",
    });

    await writeAudit(ctx, {
      workspaceId: workspace._id,
      actorId: user._id,
      action: "report.created",
      entityType: "report",
      entityId: reportId,
      meta: { name, receiptCount: receipts.length },
    });

    return reportId;
  },
});

export const remove = mutation({
  args: { reportId: v.id("reports") },
  handler: async (ctx, args) => {
    const report = await ctx.db.get(args.reportId);
    if (!report) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Report not found." });
    }
    const { user, member } = await requireMember(ctx, report.workspaceId);

    if (report.createdBy !== user._id) {
      assertCapability(member.role, "workspace.manage");
    }
    if (report.approvalStatus === "submitted") {
      throw new ConvexError({
        code: "IN_REVIEW",
        message: "Withdraw the report from review before deleting it.",
      });
    }

    const approvals = await ctx.db
      .query("approvals")
      .withIndex("by_report", (q) => q.eq("reportId", args.reportId))
      .collect();

    for (const approval of approvals) {
      const comments = await ctx.db
        .query("approvalComments")
        .withIndex("by_approval", (q) => q.eq("approvalId", approval._id))
        .collect();
      for (const comment of comments) await ctx.db.delete(comment._id);
      await ctx.db.delete(approval._id);
    }

    await ctx.db.delete(args.reportId);
    return null;
  },
});

/**
 * Year-end tax view: deductible totals by category with the workspace's
 * per-category deductible percentage applied, plus the gaps to fix.
 */
export const taxSummary = query({
  args: { year: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const { workspace } = await requireActiveWorkspace(ctx);
    const year = args.year ?? todayIso().slice(0, 4);

    const receipts = (
      await ctx.db
        .query("receipts")
        .withIndex("by_workspace_date", (q) =>
          q
            .eq("workspaceId", workspace._id)
            .gte("date", `${year}-01-01`)
            .lte("date", `${year}-12-31`),
        )
        .collect()
    ).filter((receipt) => receipt.deletedAt === undefined);

    const categories = await ctx.db
      .query("categories")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", workspace._id))
      .collect();

    const deductible = receipts.filter((receipt) => receipt.taxDeductible);

    const byCategory = new Map<
      string,
      { name: string; color: string; grossCents: number; claimableCents: number; count: number }
    >();

    for (const receipt of deductible) {
      const category = categories.find((item) => item._id === receipt.categoryId);
      const key = category?._id ?? "uncategorized";
      const percent = category?.deductiblePercent ?? 100;
      const entry = byCategory.get(key) ?? {
        name: category?.name ?? "Uncategorized",
        color: category?.color ?? "#94a3b8",
        grossCents: 0,
        claimableCents: 0,
        count: 0,
      };
      entry.grossCents += receipt.baseAmountCents;
      entry.claimableCents += Math.round((receipt.baseAmountCents * percent) / 100);
      entry.count += 1;
      byCategory.set(key, entry);
    }

    const quarters = [1, 2, 3, 4].map((quarter) => {
      const rows = deductible.filter((receipt) => quarterOf(receipt.date) === quarter);
      return {
        quarter,
        totalCents: rows.reduce((total, receipt) => total + receipt.baseAmountCents, 0),
        taxCents: rows.reduce((total, receipt) => total + (receipt.taxCents ?? 0), 0),
        count: rows.length,
      };
    });

    const missingTax = deductible.filter((receipt) => (receipt.taxCents ?? 0) === 0);
    const missingReceipt = deductible.filter((receipt) => receipt.pageCount === 0);
    const unreviewed = deductible.filter((receipt) => receipt.reviewedAt === undefined);

    return {
      year,
      currency: workspace.baseCurrency,
      taxLabel: workspace.taxLabel,
      totalDeductibleCents: deductible.reduce(
        (total, receipt) => total + receipt.baseAmountCents,
        0,
      ),
      totalClaimableCents: [...byCategory.values()].reduce(
        (total, entry) => total + entry.claimableCents,
        0,
      ),
      totalTaxPaidCents: deductible.reduce(
        (total, receipt) => total + (receipt.taxCents ?? 0),
        0,
      ),
      deductibleCount: deductible.length,
      byCategory: [...byCategory.values()].sort((a, b) => b.grossCents - a.grossCents),
      quarters,
      gaps: {
        missingTaxAmount: missingTax.length,
        missingReceiptImage: missingReceipt.length,
        unreviewed: unreviewed.length,
      },
      verifiedCount: deductible.filter(
        (receipt) => receipt.reviewedAt !== undefined && receipt.pageCount > 0,
      ).length,
    };
  },
});

/** Years that actually contain receipts — drives the tax-year picker. */
export const availableYears = query({
  args: {},
  handler: async (ctx) => {
    const { workspace } = await requireActiveWorkspace(ctx);
    const receipts = await ctx.db
      .query("receipts")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", workspace._id))
      .collect();

    const years = new Set<string>();
    for (const receipt of receipts) {
      if (receipt.deletedAt === undefined) years.add(receipt.date.slice(0, 4));
    }
    years.add(todayIso().slice(0, 4));

    return [...years].sort((a, b) => b.localeCompare(a));
  },
});
