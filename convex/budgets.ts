import { ConvexError, v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { internalMutation, mutation, query } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";
import {
  notifyUser,
  requireActiveWorkspace,
  requireCapability,
  writeAudit,
} from "./model/guards";
import { periodRange, todayIso } from "./model/lib";

const scopeValidator = v.union(
  v.literal("workspace"),
  v.literal("category"),
  v.literal("project"),
  v.literal("department"),
);

const periodValidator = v.union(
  v.literal("monthly"),
  v.literal("quarterly"),
  v.literal("yearly"),
);

/** Spend against a budget for the period containing `reference`. */
async function computeSpend(
  ctx: QueryCtx,
  budget: Doc<"budgets">,
  reference: string,
) {
  const { from, to, key } = periodRange(budget.period, reference);

  const receipts = await ctx.db
    .query("receipts")
    .withIndex("by_workspace_date", (q) =>
      q.eq("workspaceId", budget.workspaceId).gte("date", from).lte("date", to),
    )
    .collect();

  let spentCents = 0;
  let receiptCount = 0;

  for (const receipt of receipts) {
    if (receipt.deletedAt !== undefined) continue;
    if (budget.scope === "category" && receipt.categoryId !== budget.categoryId) continue;
    if (budget.scope === "project" && receipt.projectName !== budget.projectName) continue;
    if (budget.scope === "department") {
      const member = await ctx.db
        .query("members")
        .withIndex("by_workspace_user", (q) =>
          q.eq("workspaceId", budget.workspaceId).eq("userId", receipt.uploaderId),
        )
        .unique();
      if (member?.department !== budget.department) continue;
    }
    spentCents += receipt.baseAmountCents;
    receiptCount += 1;
  }

  const percentUsed =
    budget.limitCents > 0 ? Math.round((spentCents / budget.limitCents) * 100) : 0;

  return {
    from,
    to,
    periodKey: key,
    spentCents,
    receiptCount,
    remainingCents: budget.limitCents - spentCents,
    percentUsed,
    status:
      percentUsed >= 100
        ? ("exceeded" as const)
        : percentUsed >= budget.alertThresholdPercent
          ? ("warning" as const)
          : ("healthy" as const),
  };
}

export const list = query({
  args: { reference: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const { workspace } = await requireActiveWorkspace(ctx);
    const reference = args.reference ?? todayIso();

    const budgets = await ctx.db
      .query("budgets")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", workspace._id))
      .collect();

    return await Promise.all(
      budgets
        .filter((budget) => budget.isActive)
        .map(async (budget) => {
          const progress = await computeSpend(ctx, budget, reference);
          const category = budget.categoryId ? await ctx.db.get(budget.categoryId) : null;
          return {
            _id: budget._id,
            name: budget.name,
            scope: budget.scope,
            period: budget.period,
            limitCents: budget.limitCents,
            alertThresholdPercent: budget.alertThresholdPercent,
            categoryId: budget.categoryId,
            categoryName: category?.name ?? null,
            categoryColor: category?.color ?? null,
            projectName: budget.projectName,
            department: budget.department,
            ...progress,
          };
        }),
    );
  },
});

export const create = mutation({
  args: {
    name: v.string(),
    scope: scopeValidator,
    period: periodValidator,
    limitCents: v.number(),
    alertThresholdPercent: v.optional(v.number()),
    categoryId: v.optional(v.id("categories")),
    projectName: v.optional(v.string()),
    department: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { workspace } = await requireActiveWorkspace(ctx);
    const { user } = await requireCapability(ctx, workspace._id, "budget.manage");

    const name = args.name.trim();
    if (!name || name.length > 80) {
      throw new ConvexError({
        code: "INVALID_INPUT",
        message: "Budget name must be 1–80 characters.",
      });
    }
    if (args.limitCents <= 0) {
      throw new ConvexError({
        code: "INVALID_INPUT",
        message: "Budget limit must be greater than zero.",
      });
    }
    if (args.scope === "category" && !args.categoryId) {
      throw new ConvexError({
        code: "INVALID_INPUT",
        message: "Choose a category for a category budget.",
      });
    }
    if (args.scope === "project" && !args.projectName?.trim()) {
      throw new ConvexError({
        code: "INVALID_INPUT",
        message: "Enter a project name for a project budget.",
      });
    }
    if (args.scope === "department" && !args.department?.trim()) {
      throw new ConvexError({
        code: "INVALID_INPUT",
        message: "Enter a department for a department budget.",
      });
    }

    const threshold = args.alertThresholdPercent ?? 80;
    if (threshold < 1 || threshold > 100) {
      throw new ConvexError({
        code: "INVALID_INPUT",
        message: "Alert threshold must be between 1 and 100.",
      });
    }

    const budgetId = await ctx.db.insert("budgets", {
      workspaceId: workspace._id,
      name,
      scope: args.scope,
      categoryId: args.categoryId,
      projectName: args.projectName?.trim(),
      department: args.department?.trim(),
      period: args.period,
      limitCents: Math.round(args.limitCents),
      alertThresholdPercent: Math.round(threshold),
      startDate: todayIso(),
      createdBy: user._id,
      isActive: true,
    });

    await writeAudit(ctx, {
      workspaceId: workspace._id,
      actorId: user._id,
      action: "budget.created",
      entityType: "budget",
      entityId: budgetId,
      meta: { name, limitCents: args.limitCents },
    });

    return budgetId;
  },
});

export const update = mutation({
  args: {
    budgetId: v.id("budgets"),
    name: v.optional(v.string()),
    limitCents: v.optional(v.number()),
    alertThresholdPercent: v.optional(v.number()),
    period: v.optional(periodValidator),
    isActive: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const budget = await ctx.db.get(args.budgetId);
    if (!budget) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Budget not found." });
    }
    await requireCapability(ctx, budget.workspaceId, "budget.manage");

    const patch: Record<string, unknown> = {};
    if (args.name !== undefined) {
      const name = args.name.trim();
      if (!name || name.length > 80) {
        throw new ConvexError({
          code: "INVALID_INPUT",
          message: "Budget name must be 1–80 characters.",
        });
      }
      patch.name = name;
    }
    if (args.limitCents !== undefined) {
      if (args.limitCents <= 0) {
        throw new ConvexError({
          code: "INVALID_INPUT",
          message: "Budget limit must be greater than zero.",
        });
      }
      patch.limitCents = Math.round(args.limitCents);
      // A new limit means previously-sent alerts no longer apply.
      patch.lastAlertedPeriod = undefined;
    }
    if (args.alertThresholdPercent !== undefined) {
      if (args.alertThresholdPercent < 1 || args.alertThresholdPercent > 100) {
        throw new ConvexError({
          code: "INVALID_INPUT",
          message: "Alert threshold must be between 1 and 100.",
        });
      }
      patch.alertThresholdPercent = Math.round(args.alertThresholdPercent);
    }
    if (args.period !== undefined) patch.period = args.period;
    if (args.isActive !== undefined) patch.isActive = args.isActive;

    await ctx.db.patch(args.budgetId, patch);
    return null;
  },
});

export const remove = mutation({
  args: { budgetId: v.id("budgets") },
  handler: async (ctx, args) => {
    const budget = await ctx.db.get(args.budgetId);
    if (!budget) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Budget not found." });
    }
    const { user } = await requireCapability(ctx, budget.workspaceId, "budget.manage");

    await ctx.db.delete(args.budgetId);
    await writeAudit(ctx, {
      workspaceId: budget.workspaceId,
      actorId: user._id,
      action: "budget.deleted",
      entityType: "budget",
      entityId: args.budgetId,
      meta: { name: budget.name },
    });

    return null;
  },
});

/**
 * Scheduled sweep. Notifies once per budget per period the first time spend
 * crosses the alert threshold, so users are not re-alerted on every receipt.
 */
export const checkThresholds = internalMutation({
  args: {},
  handler: async (ctx) => {
    const today = todayIso();
    const budgets = await ctx.db.query("budgets").collect();

    for (const budget of budgets) {
      if (!budget.isActive) continue;

      const progress = await computeSpend(ctx, budget, today);
      if (progress.status === "healthy") continue;
      if (budget.lastAlertedPeriod === progress.periodKey) continue;

      const members = await ctx.db
        .query("members")
        .withIndex("by_workspace", (q) => q.eq("workspaceId", budget.workspaceId))
        .collect();

      const recipients = members.filter((member) =>
        ["owner", "admin", "manager"].includes(member.role),
      );

      const amount = (progress.spentCents / 100).toFixed(2);
      const limit = (budget.limitCents / 100).toFixed(2);

      for (const member of recipients) {
        await notifyUser(ctx, {
          userId: member.userId,
          workspaceId: budget.workspaceId,
          type: "budget_exceeded",
          title:
            progress.status === "exceeded"
              ? `Budget exceeded: ${budget.name}`
              : `Budget at ${progress.percentUsed}%: ${budget.name}`,
          body: `${amount} of ${limit} spent this ${budget.period.replace("ly", "")}.`,
          link: "/dashboard/budgets",
        });
      }

      await ctx.db.patch(budget._id, { lastAlertedPeriod: progress.periodKey });
    }

    return null;
  },
});
