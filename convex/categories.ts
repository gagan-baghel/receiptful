import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import {
  requireActiveWorkspace,
  requireCapability,
  writeAudit,
} from "./model/guards";

const taxTreatmentValidator = v.union(
  v.literal("deductible"),
  v.literal("partial"),
  v.literal("non_deductible"),
);

export const list = query({
  args: {},
  handler: async (ctx) => {
    const { workspace } = await requireActiveWorkspace(ctx);

    const categories = await ctx.db
      .query("categories")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", workspace._id))
      .collect();

    const receipts = await ctx.db
      .query("receipts")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", workspace._id))
      .collect();

    const usage = new Map<string, { count: number; totalCents: number }>();
    for (const receipt of receipts) {
      if (receipt.deletedAt !== undefined || !receipt.categoryId) continue;
      const entry = usage.get(receipt.categoryId) ?? { count: 0, totalCents: 0 };
      entry.count += 1;
      entry.totalCents += receipt.baseAmountCents;
      usage.set(receipt.categoryId, entry);
    }

    return categories
      .filter((category) => category.deletedAt === undefined)
      .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
      .map((category) => ({
        _id: category._id,
        name: category.name,
        color: category.color,
        icon: category.icon,
        taxTreatment: category.taxTreatment,
        deductiblePercent: category.deductiblePercent,
        keywords: category.keywords,
        isSystem: category.isSystem,
        monthlyBudgetCents: category.monthlyBudgetCents,
        receiptCount: usage.get(category._id)?.count ?? 0,
        totalCents: usage.get(category._id)?.totalCents ?? 0,
      }));
  },
});

export const create = mutation({
  args: {
    name: v.string(),
    color: v.string(),
    icon: v.string(),
    taxTreatment: taxTreatmentValidator,
    deductiblePercent: v.optional(v.number()),
    keywords: v.optional(v.array(v.string())),
    monthlyBudgetCents: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { workspace } = await requireActiveWorkspace(ctx);
    const { user } = await requireCapability(ctx, workspace._id, "category.manage");

    const name = args.name.trim();
    if (name.length < 1 || name.length > 60) {
      throw new ConvexError({
        code: "INVALID_INPUT",
        message: "Category name must be 1–60 characters.",
      });
    }

    const duplicate = await ctx.db
      .query("categories")
      .withIndex("by_workspace_name", (q) =>
        q.eq("workspaceId", workspace._id).eq("name", name),
      )
      .unique();

    if (duplicate && duplicate.deletedAt === undefined) {
      throw new ConvexError({
        code: "DUPLICATE",
        message: `A category named "${name}" already exists.`,
      });
    }

    const siblings = await ctx.db
      .query("categories")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", workspace._id))
      .collect();

    const categoryId = await ctx.db.insert("categories", {
      workspaceId: workspace._id,
      name,
      color: args.color,
      icon: args.icon,
      taxTreatment: args.taxTreatment,
      deductiblePercent:
        args.deductiblePercent ?? (args.taxTreatment === "deductible" ? 100 : 0),
      keywords: (args.keywords ?? []).map((keyword) => keyword.toLowerCase().trim()),
      isSystem: false,
      sortOrder: siblings.length,
      monthlyBudgetCents: args.monthlyBudgetCents,
    });

    await writeAudit(ctx, {
      workspaceId: workspace._id,
      actorId: user._id,
      action: "category.created",
      entityType: "category",
      entityId: categoryId,
      meta: { name },
    });

    return categoryId;
  },
});

export const update = mutation({
  args: {
    categoryId: v.id("categories"),
    name: v.optional(v.string()),
    color: v.optional(v.string()),
    icon: v.optional(v.string()),
    taxTreatment: v.optional(taxTreatmentValidator),
    deductiblePercent: v.optional(v.number()),
    keywords: v.optional(v.array(v.string())),
    monthlyBudgetCents: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const category = await ctx.db.get(args.categoryId);
    if (!category) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Category not found." });
    }
    const { user } = await requireCapability(ctx, category.workspaceId, "category.manage");

    const patch: Record<string, unknown> = {};
    if (args.name !== undefined) {
      const name = args.name.trim();
      if (!name || name.length > 60) {
        throw new ConvexError({
          code: "INVALID_INPUT",
          message: "Category name must be 1–60 characters.",
        });
      }
      patch.name = name;
    }
    if (args.color !== undefined) patch.color = args.color;
    if (args.icon !== undefined) patch.icon = args.icon;
    if (args.taxTreatment !== undefined) patch.taxTreatment = args.taxTreatment;
    if (args.deductiblePercent !== undefined) {
      if (args.deductiblePercent < 0 || args.deductiblePercent > 100) {
        throw new ConvexError({
          code: "INVALID_INPUT",
          message: "Deductible percent must be 0–100.",
        });
      }
      patch.deductiblePercent = Math.round(args.deductiblePercent);
    }
    if (args.keywords !== undefined) {
      patch.keywords = args.keywords.map((keyword) => keyword.toLowerCase().trim());
    }
    if (args.monthlyBudgetCents !== undefined) {
      patch.monthlyBudgetCents =
        args.monthlyBudgetCents <= 0 ? undefined : Math.round(args.monthlyBudgetCents);
    }

    await ctx.db.patch(args.categoryId, patch);
    await writeAudit(ctx, {
      workspaceId: category.workspaceId,
      actorId: user._id,
      action: "category.updated",
      entityType: "category",
      entityId: args.categoryId,
    });

    return null;
  },
});

/**
 * Soft-deletes a category. Receipts keep working — they are moved to the
 * replacement category, or left uncategorized when none is given.
 */
export const remove = mutation({
  args: {
    categoryId: v.id("categories"),
    reassignToId: v.optional(v.id("categories")),
  },
  handler: async (ctx, args) => {
    const category = await ctx.db.get(args.categoryId);
    if (!category) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Category not found." });
    }
    const { user } = await requireCapability(ctx, category.workspaceId, "category.manage");

    if (args.reassignToId) {
      const target = await ctx.db.get(args.reassignToId);
      if (!target || target.workspaceId !== category.workspaceId) {
        throw new ConvexError({
          code: "INVALID_INPUT",
          message: "Replacement category not found.",
        });
      }
    }

    const affected = await ctx.db
      .query("receipts")
      .withIndex("by_workspace_category", (q) =>
        q.eq("workspaceId", category.workspaceId).eq("categoryId", args.categoryId),
      )
      .collect();

    for (const receipt of affected) {
      await ctx.db.patch(receipt._id, { categoryId: args.reassignToId });
    }

    await ctx.db.patch(args.categoryId, { deletedAt: Date.now() });
    await writeAudit(ctx, {
      workspaceId: category.workspaceId,
      actorId: user._id,
      action: "category.deleted",
      entityType: "category",
      entityId: args.categoryId,
      meta: { name: category.name, reassigned: affected.length },
    });

    return affected.length;
  },
});

export const reorder = mutation({
  args: { categoryIds: v.array(v.id("categories")) },
  handler: async (ctx, args) => {
    const { workspace } = await requireActiveWorkspace(ctx);
    await requireCapability(ctx, workspace._id, "category.manage");

    for (const [index, categoryId] of args.categoryIds.entries()) {
      const category = await ctx.db.get(categoryId);
      if (!category || category.workspaceId !== workspace._id) continue;
      await ctx.db.patch(categoryId, { sortOrder: index });
    }

    return null;
  },
});
