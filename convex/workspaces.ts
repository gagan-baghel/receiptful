import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { createWorkspaceForUser } from "./model/bootstrap";
import { PLAN_SEATS, PLAN_STORAGE_BYTES } from "./model/defaults";
import {
  requireActiveWorkspace,
  requireCapability,
  requireUser,
  writeAudit,
} from "./model/guards";
import { isSupportedCurrency } from "./model/lib";

export const create = mutation({
  args: {
    name: v.string(),
    currency: v.optional(v.string()),
    timezone: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const name = args.name.trim();

    if (name.length < 2 || name.length > 80) {
      throw new ConvexError({
        code: "INVALID_INPUT",
        message: "Workspace name must be 2–80 characters.",
      });
    }
    if (args.currency && !isSupportedCurrency(args.currency)) {
      throw new ConvexError({ code: "INVALID_INPUT", message: "Unsupported currency." });
    }

    return await createWorkspaceForUser(ctx, user._id, {
      name,
      currency: args.currency,
      timezone: args.timezone,
    });
  },
});

export const update = mutation({
  args: {
    workspaceId: v.id("workspaces"),
    name: v.optional(v.string()),
    baseCurrency: v.optional(v.string()),
    locale: v.optional(v.string()),
    timezone: v.optional(v.string()),
    fiscalYearStartMonth: v.optional(v.number()),
    taxLabel: v.optional(v.string()),
    defaultTaxRateBps: v.optional(v.number()),
    requireApprovalOverCents: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { user } = await requireCapability(ctx, args.workspaceId, "workspace.manage");

    const patch: Record<string, unknown> = {};

    if (args.name !== undefined) {
      const name = args.name.trim();
      if (name.length < 2 || name.length > 80) {
        throw new ConvexError({
          code: "INVALID_INPUT",
          message: "Workspace name must be 2–80 characters.",
        });
      }
      patch.name = name;
    }
    if (args.baseCurrency !== undefined) {
      if (!isSupportedCurrency(args.baseCurrency)) {
        throw new ConvexError({ code: "INVALID_INPUT", message: "Unsupported currency." });
      }
      patch.baseCurrency = args.baseCurrency;
    }
    if (args.locale !== undefined) patch.locale = args.locale;
    if (args.timezone !== undefined) patch.timezone = args.timezone;
    if (args.fiscalYearStartMonth !== undefined) {
      if (args.fiscalYearStartMonth < 1 || args.fiscalYearStartMonth > 12) {
        throw new ConvexError({ code: "INVALID_INPUT", message: "Invalid fiscal month." });
      }
      patch.fiscalYearStartMonth = args.fiscalYearStartMonth;
    }
    if (args.taxLabel !== undefined) patch.taxLabel = args.taxLabel.trim().slice(0, 16) || "Tax";
    if (args.defaultTaxRateBps !== undefined) {
      if (args.defaultTaxRateBps < 0 || args.defaultTaxRateBps > 10000) {
        throw new ConvexError({ code: "INVALID_INPUT", message: "Tax rate must be 0–100%." });
      }
      patch.defaultTaxRateBps = Math.round(args.defaultTaxRateBps);
    }
    if (args.requireApprovalOverCents !== undefined) {
      patch.requireApprovalOverCents =
        args.requireApprovalOverCents < 0 ? undefined : Math.round(args.requireApprovalOverCents);
    }

    await ctx.db.patch(args.workspaceId, patch);
    await writeAudit(ctx, {
      workspaceId: args.workspaceId,
      actorId: user._id,
      action: "workspace.updated",
      entityType: "workspace",
      entityId: args.workspaceId,
      meta: patch,
    });
    return null;
  },
});

/**
 * Renames the caller's active workspace. Used right after sign-up, where the
 * client knows the chosen name but not yet the generated workspace id.
 */
export const renameActive = mutation({
  args: { name: v.string() },
  handler: async (ctx, args) => {
    const { workspace, member, user } = await requireActiveWorkspace(ctx);
    if (!["owner", "admin"].includes(member.role)) {
      throw new ConvexError({
        code: "FORBIDDEN",
        message: "Only owners and admins can rename a workspace.",
      });
    }

    const name = args.name.trim();
    if (name.length < 2 || name.length > 80) {
      throw new ConvexError({
        code: "INVALID_INPUT",
        message: "Workspace name must be 2–80 characters.",
      });
    }

    await ctx.db.patch(workspace._id, { name });
    await writeAudit(ctx, {
      workspaceId: workspace._id,
      actorId: user._id,
      action: "workspace.renamed",
      entityType: "workspace",
      entityId: workspace._id,
      meta: { name },
    });

    return null;
  },
});

/** Storage breakdown for the settings screen — real bytes, no estimates. */
export const storageStats = query({
  args: {},
  handler: async (ctx) => {
    const { workspace } = await requireActiveWorkspace(ctx);

    const pages = await ctx.db
      .query("receiptPages")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", workspace._id))
      .collect();

    const receipts = await ctx.db
      .query("receipts")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", workspace._id))
      .collect();

    const trashedBytes = receipts
      .filter((receipt) => receipt.deletedAt !== undefined)
      .reduce((sum, receipt) => sum + receipt.storageBytes, 0);

    const archivedBytes = receipts
      .filter((receipt) => receipt.isArchived && receipt.deletedAt === undefined)
      .reduce((sum, receipt) => sum + receipt.storageBytes, 0);

    const totalBytes = pages.reduce((sum, page) => sum + page.sizeBytes, 0);

    const byType = pages.reduce<Record<string, number>>((acc, page) => {
      const key = page.mimeType === "application/pdf" ? "PDF" : "Image";
      acc[key] = (acc[key] ?? 0) + page.sizeBytes;
      return acc;
    }, {});

    return {
      usedBytes: totalBytes,
      quotaBytes: workspace.storageQuotaBytes,
      pageCount: pages.length,
      receiptCount: receipts.filter((receipt) => receipt.deletedAt === undefined).length,
      trashedBytes,
      archivedBytes,
      byType: Object.entries(byType).map(([label, bytes]) => ({ label, bytes })),
      plan: workspace.plan,
    };
  },
});

/**
 * Plan changes. Billing is entitlement-only: the app enforces seats and storage
 * limits, and payment capture is handled by the billing provider integration.
 */
export const changePlan = mutation({
  args: {
    workspaceId: v.id("workspaces"),
    plan: v.union(v.literal("free"), v.literal("pro"), v.literal("business")),
  },
  handler: async (ctx, args) => {
    const { user, workspace } = await requireCapability(
      ctx,
      args.workspaceId,
      "workspace.billing",
    );

    const members = await ctx.db
      .query("members")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .collect();

    const seats = PLAN_SEATS[args.plan];
    if (members.length > seats) {
      throw new ConvexError({
        code: "SEATS_EXCEEDED",
        message: `The ${args.plan} plan includes ${seats} seats but this workspace has ${members.length} members. Remove members first.`,
      });
    }

    const quota = PLAN_STORAGE_BYTES[args.plan];
    if (workspace.storageUsedBytes > quota) {
      throw new ConvexError({
        code: "STORAGE_EXCEEDED",
        message: "Free up storage before downgrading to this plan.",
      });
    }

    await ctx.db.patch(args.workspaceId, {
      plan: args.plan,
      planSeats: seats,
      storageQuotaBytes: quota,
    });

    await writeAudit(ctx, {
      workspaceId: args.workspaceId,
      actorId: user._id,
      action: "workspace.plan_changed",
      entityType: "workspace",
      entityId: args.workspaceId,
      meta: { from: workspace.plan, to: args.plan },
    });

    return null;
  },
});

export const remove = mutation({
  args: { workspaceId: v.id("workspaces"), confirmName: v.string() },
  handler: async (ctx, args) => {
    const { user, workspace } = await requireCapability(
      ctx,
      args.workspaceId,
      "workspace.delete",
    );

    if (args.confirmName.trim() !== workspace.name) {
      throw new ConvexError({
        code: "CONFIRMATION_MISMATCH",
        message: "Type the workspace name exactly to confirm deletion.",
      });
    }

    await ctx.db.patch(args.workspaceId, { deletedAt: Date.now() });
    await writeAudit(ctx, {
      workspaceId: args.workspaceId,
      actorId: user._id,
      action: "workspace.deleted",
      entityType: "workspace",
      entityId: args.workspaceId,
    });

    const remaining = await ctx.db
      .query("members")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();

    const next = remaining.find((member) => member.workspaceId !== args.workspaceId);
    await ctx.db.patch(user._id, { defaultWorkspaceId: next?.workspaceId });

    return null;
  },
});

/** Recent audit trail for the security tab. */
export const auditTrail = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const { workspace } = await requireCapability(
      ctx,
      (await requireActiveWorkspace(ctx)).workspace._id,
      "workspace.manage",
    );

    const logs = await ctx.db
      .query("auditLogs")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", workspace._id))
      .order("desc")
      .take(Math.min(args.limit ?? 50, 200));

    return await Promise.all(
      logs.map(async (log) => {
        const actor = log.actorId ? await ctx.db.get(log.actorId) : null;
        return {
          _id: log._id,
          action: log.action,
          entityType: log.entityType,
          entityId: log.entityId,
          createdAt: log._creationTime,
          actorName: actor?.name ?? "System",
          meta: log.meta,
        };
      }),
    );
  },
});
