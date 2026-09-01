import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { ensureSettings } from "./model/bootstrap";
import { requireActiveWorkspace, requireUser, writeAudit } from "./model/guards";
import { isSupportedCurrency, minorUnitFactor } from "./model/lib";

const DEFAULT_SETTINGS = {
  theme: "system" as const,
  currency: "USD",
  language: "en",
  timezone: "UTC",
  dateFormat: "MMM d, yyyy",
  weekStartsOn: 1,
  notifyReceiptProcessed: true,
  notifyApproval: true,
  notifyBudgetExceeded: true,
  notifyUploadFailed: true,
  notifyWeeklyDigest: true,
  notifyTaxReminder: true,
  pushEnabled: false,
  emailEnabled: true,
  autoCategorize: true,
  reducedMotion: false,
};

/**
 * The single bootstrap query the app shell subscribes to. Returns null when
 * signed out so the client can render the marketing/auth surface immediately.
 */
export const me = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;

    const user = await ctx.db.get(userId);
    if (!user) return null;

    const settingsDoc = await ctx.db
      .query("settings")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();

    const memberships = await ctx.db
      .query("members")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();

    const workspaces = await Promise.all(
      memberships.map(async (membership) => {
        const workspace = await ctx.db.get(membership.workspaceId);
        if (!workspace || workspace.deletedAt !== undefined) return null;
        return {
          _id: workspace._id,
          name: workspace.name,
          slug: workspace.slug,
          plan: workspace.plan,
          baseCurrency: workspace.baseCurrency,
          role: membership.role,
        };
      }),
    );

    const availableWorkspaces = workspaces.filter(
      (workspace): workspace is NonNullable<typeof workspace> => workspace !== null,
    );

    const activeWorkspaceId =
      availableWorkspaces.find((workspace) => workspace._id === user.defaultWorkspaceId)
        ?._id ?? availableWorkspaces[0]?._id ?? null;

    const activeMembership = memberships.find(
      (membership) => membership.workspaceId === activeWorkspaceId,
    );

    const activeWorkspace = activeWorkspaceId
      ? await ctx.db.get(activeWorkspaceId)
      : null;

    const unreadCount = (
      await ctx.db
        .query("notifications")
        .withIndex("by_user_unread", (q) => q.eq("userId", userId).eq("readAt", undefined))
        .take(100)
    ).length;

    return {
      user: {
        _id: user._id,
        name: user.name ?? "",
        email: user.email ?? "",
        image: user.image,
        jobTitle: user.jobTitle ?? "",
        onboardingCompleted: user.onboardingCompleted ?? false,
        deletionRequestedAt: user.deletionRequestedAt,
      },
      settings: settingsDoc
        ? {
            theme: settingsDoc.theme,
            currency: settingsDoc.currency,
            language: settingsDoc.language,
            timezone: settingsDoc.timezone,
            dateFormat: settingsDoc.dateFormat,
            weekStartsOn: settingsDoc.weekStartsOn,
            notifyReceiptProcessed: settingsDoc.notifyReceiptProcessed,
            notifyApproval: settingsDoc.notifyApproval,
            notifyBudgetExceeded: settingsDoc.notifyBudgetExceeded,
            notifyUploadFailed: settingsDoc.notifyUploadFailed,
            notifyWeeklyDigest: settingsDoc.notifyWeeklyDigest,
            notifyTaxReminder: settingsDoc.notifyTaxReminder,
            pushEnabled: settingsDoc.pushEnabled,
            emailEnabled: settingsDoc.emailEnabled,
            autoCategorize: settingsDoc.autoCategorize,
            autoArchiveAfterDays: settingsDoc.autoArchiveAfterDays,
            reducedMotion: settingsDoc.reducedMotion,
          }
        : DEFAULT_SETTINGS,
      workspaces: availableWorkspaces,
      activeWorkspace: activeWorkspace
        ? {
            _id: activeWorkspace._id,
            name: activeWorkspace.name,
            slug: activeWorkspace.slug,
            plan: activeWorkspace.plan,
            baseCurrency: activeWorkspace.baseCurrency,
            taxLabel: activeWorkspace.taxLabel,
            defaultTaxRateBps: activeWorkspace.defaultTaxRateBps,
            timezone: activeWorkspace.timezone,
            fiscalYearStartMonth: activeWorkspace.fiscalYearStartMonth,
            storageUsedBytes: activeWorkspace.storageUsedBytes,
            storageQuotaBytes: activeWorkspace.storageQuotaBytes,
            receiptCount: activeWorkspace.receiptCount,
            requireApprovalOverCents: activeWorkspace.requireApprovalOverCents,
          }
        : null,
      role: activeMembership?.role ?? null,
      unreadNotifications: unreadCount,
    };
  },
});

export const updateProfile = mutation({
  args: {
    name: v.optional(v.string()),
    jobTitle: v.optional(v.string()),
    image: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);

    const patch: Record<string, string> = {};
    if (args.name !== undefined) {
      const name = args.name.trim();
      if (!name) {
        throw new ConvexError({ code: "INVALID_INPUT", message: "Name cannot be empty." });
      }
      patch.name = name.slice(0, 120);
    }
    if (args.jobTitle !== undefined) patch.jobTitle = args.jobTitle.trim().slice(0, 120);
    if (args.image !== undefined) patch.image = args.image;

    await ctx.db.patch(user._id, patch);
    return null;
  },
});

export const completeOnboarding = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    await ctx.db.patch(user._id, { onboardingCompleted: true });
    return null;
  },
});

export const updateSettings = mutation({
  args: {
    theme: v.optional(
      v.union(v.literal("light"), v.literal("dark"), v.literal("system")),
    ),
    currency: v.optional(v.string()),
    language: v.optional(v.string()),
    timezone: v.optional(v.string()),
    dateFormat: v.optional(v.string()),
    weekStartsOn: v.optional(v.number()),
    notifyReceiptProcessed: v.optional(v.boolean()),
    notifyApproval: v.optional(v.boolean()),
    notifyBudgetExceeded: v.optional(v.boolean()),
    notifyUploadFailed: v.optional(v.boolean()),
    notifyWeeklyDigest: v.optional(v.boolean()),
    notifyTaxReminder: v.optional(v.boolean()),
    pushEnabled: v.optional(v.boolean()),
    emailEnabled: v.optional(v.boolean()),
    autoCategorize: v.optional(v.boolean()),
    autoArchiveAfterDays: v.optional(v.number()),
    reducedMotion: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const settingsId = await ensureSettings(ctx, user._id);

    if (args.currency !== undefined && !isSupportedCurrency(args.currency)) {
      throw new ConvexError({
        code: "INVALID_INPUT",
        message: `${args.currency} is not a supported currency.`,
      });
    }
    if (args.weekStartsOn !== undefined && (args.weekStartsOn < 0 || args.weekStartsOn > 6)) {
      throw new ConvexError({ code: "INVALID_INPUT", message: "Invalid week start." });
    }
    if (
      args.autoArchiveAfterDays !== undefined &&
      (args.autoArchiveAfterDays < 30 || args.autoArchiveAfterDays > 3650)
    ) {
      throw new ConvexError({
        code: "INVALID_INPUT",
        message: "Auto-archive must be between 30 and 3650 days.",
      });
    }

    const patch = Object.fromEntries(
      Object.entries(args).filter(([, value]) => value !== undefined),
    );

    await ctx.db.patch(settingsId, patch);
    return null;
  },
});

/**
 * Two-step account deletion. The request is reversible for 30 days; the
 * scheduled sweep in crons.ts performs the irreversible purge.
 */
export const requestAccountDeletion = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const owned = await ctx.db
      .query("workspaces")
      .withIndex("by_owner", (q) => q.eq("ownerId", user._id))
      .collect();

    for (const workspace of owned) {
      if (workspace.deletedAt !== undefined) continue;
      const otherMembers = await ctx.db
        .query("members")
        .withIndex("by_workspace", (q) => q.eq("workspaceId", workspace._id))
        .collect();
      if (otherMembers.some((member) => member.userId !== user._id)) {
        throw new ConvexError({
          code: "TRANSFER_REQUIRED",
          message: `Transfer ownership of "${workspace.name}" before deleting your account.`,
        });
      }
    }

    await ctx.db.patch(user._id, { deletionRequestedAt: Date.now() });
    return null;
  },
});

export const cancelAccountDeletion = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    await ctx.db.patch(user._id, { deletionRequestedAt: undefined });
    return null;
  },
});

/**
 * Personal data export.
 *
 * Scoped to the requesting user, not the workspace: this is "my data", so it
 * covers the receipts they uploaded and the records attached to them, plus
 * their own account, settings and notifications. Exporting every colleague's
 * expense history to any member — which the workspace-wide version did — is a
 * disclosure, not a subject access request.
 */
export const exportMyData = query({
  args: {},
  handler: async (ctx) => {
    const { user, workspace } = await requireActiveWorkspace(ctx);

    const receipts = (
      await ctx.db
        .query("receipts")
        .withIndex("by_uploader", (q) => q.eq("uploaderId", user._id))
        .collect()
    ).filter((receipt) => receipt.workspaceId === workspace._id);

    const categories = await ctx.db
      .query("categories")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", workspace._id))
      .collect();

    const folders = await ctx.db
      .query("folders")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", workspace._id))
      .collect();

    const tags = await ctx.db
      .query("tags")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", workspace._id))
      .collect();

    const budgets = await ctx.db
      .query("budgets")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", workspace._id))
      .collect();

    const settings = await ctx.db
      .query("settings")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .unique();

    const notifications = await ctx.db
      .query("notifications")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();

    // Records attached to the user's own receipts, so the export is complete
    // rather than just the tidy parts.
    const receiptIds = new Set(receipts.map((receipt) => receipt._id));

    const comments = (
      await Promise.all(
        receipts.map((receipt) =>
          ctx.db
            .query("comments")
            .withIndex("by_receipt", (q) => q.eq("receiptId", receipt._id))
            .collect(),
        ),
      )
    ).flat();

    const versions = (
      await Promise.all(
        receipts.map((receipt) =>
          ctx.db
            .query("receiptVersions")
            .withIndex("by_receipt", (q) => q.eq("receiptId", receipt._id))
            .collect(),
        ),
      )
    ).flat();

    const approvals = (
      await ctx.db
        .query("approvals")
        .withIndex("by_submitter", (q) => q.eq("submitterId", user._id))
        .collect()
    ).filter((approval) => approval.workspaceId === workspace._id);

    const minor = (currency: string) => (minorUnitFactor(currency) === 1 ? 1 : 100);

    return {
      exportedAt: new Date().toISOString(),
      scope: "The account, settings and receipts belonging to the requesting user.",
      account: {
        name: user.name,
        email: user.email,
        jobTitle: user.jobTitle,
        onboardingCompleted: user.onboardingCompleted ?? false,
        deletionRequestedAt: user.deletionRequestedAt ?? null,
      },
      settings: settings
        ? {
            theme: settings.theme,
            currency: settings.currency,
            language: settings.language,
            timezone: settings.timezone,
            dateFormat: settings.dateFormat,
            autoCategorize: settings.autoCategorize,
            autoArchiveAfterDays: settings.autoArchiveAfterDays ?? null,
          }
        : null,
      workspace: { name: workspace.name, baseCurrency: workspace.baseCurrency },
      receipts: receipts.map((receipt) => ({
        id: receipt._id,
        merchant: receipt.merchant,
        amount: receipt.amountCents / minor(receipt.currency),
        currency: receipt.currency,
        amountInBaseCurrency: receipt.baseAmountCents / minor(workspace.baseCurrency),
        exchangeRate: receipt.exchangeRate,
        tax: receipt.taxCents ? receipt.taxCents / minor(receipt.currency) : null,
        date: receipt.date,
        paymentMethod: receipt.paymentMethod,
        cardLast4: receipt.cardLast4 ?? null,
        category: categories.find((c) => c._id === receipt.categoryId)?.name ?? null,
        notes: receipt.notes ?? "",
        taxDeductible: receipt.taxDeductible,
        classification: receipt.classification,
        reimbursable: receipt.reimbursable,
        approvalStatus: receipt.approvalStatus,
        pageCount: receipt.pageCount,
        isArchived: receipt.isArchived,
        deletedAt: receipt.deletedAt ?? null,
        items: receipt.items,
      })),
      comments: comments
        .filter((comment) => receiptIds.has(comment.receiptId))
        .map((comment) => ({
          receiptId: comment.receiptId,
          body: comment.body,
          createdAt: new Date(comment._creationTime).toISOString(),
        })),
      editHistory: versions.map((version) => ({
        receiptId: version.receiptId,
        changes: version.changes,
        editedAt: new Date(version._creationTime).toISOString(),
      })),
      approvalsSubmitted: approvals.map((approval) => ({
        status: approval.status,
        amount: approval.amountCents / minor(workspace.baseCurrency),
        submittedAt: new Date(approval.submittedAt).toISOString(),
        decidedAt: approval.decidedAt ? new Date(approval.decidedAt).toISOString() : null,
      })),
      notifications: notifications.map((notification) => ({
        type: notification.type,
        title: notification.title,
        body: notification.body,
        readAt: notification.readAt ? new Date(notification.readAt).toISOString() : null,
        createdAt: new Date(notification._creationTime).toISOString(),
      })),
      categories: categories.map((c) => ({ name: c.name, taxTreatment: c.taxTreatment })),
      folders: folders.map((f) => ({ name: f.name })),
      tags: tags.map((t) => ({ name: t.name })),
      budgets: budgets.map((b) => ({
        name: b.name,
        limit: b.limitCents / minor(workspace.baseCurrency),
        period: b.period,
      })),
      /** Receipt images are not inlined; download them from each receipt. */
      note:
        "Receipt images are excluded from this JSON. Open a receipt to download its pages.",
    };
  },
});

export const changeActiveWorkspace = mutation({
  args: { workspaceId: v.id("workspaces") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const membership = await ctx.db
      .query("members")
      .withIndex("by_workspace_user", (q) =>
        q.eq("workspaceId", args.workspaceId).eq("userId", user._id),
      )
      .unique();

    if (!membership || membership.status !== "active") {
      throw new ConvexError({
        code: "FORBIDDEN",
        message: "You are not a member of that workspace.",
      });
    }

    await ctx.db.patch(user._id, { defaultWorkspaceId: args.workspaceId });
    await ctx.db.patch(membership._id, { lastActiveAt: Date.now() });
    await writeAudit(ctx, {
      workspaceId: args.workspaceId,
      actorId: user._id,
      action: "workspace.switched",
      entityType: "workspace",
      entityId: args.workspaceId,
    });
    return null;
  },
});
