import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction, internalMutation, query } from "./_generated/server";
import { notifyUser } from "./model/guards";
import { todayIso } from "./model/lib";
import { purgeReceipt } from "./model/receipts";

const TRASH_RETENTION_DAYS = 30;
const ACCOUNT_DELETION_GRACE_DAYS = 30;

/** Permanently removes receipts that have sat in trash past the retention window. */
export const purgeExpiredTrash = internalMutation({
  args: {},
  handler: async (ctx) => {
    const cutoff = Date.now() - TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000;

    const workspaces = await ctx.db.query("workspaces").collect();
    let purged = 0;

    for (const workspace of workspaces) {
      const trashed = await ctx.db
        .query("receipts")
        .withIndex("by_workspace_deleted", (q) => q.eq("workspaceId", workspace._id))
        .filter((q) => q.neq(q.field("deletedAt"), undefined))
        .collect();

      for (const receipt of trashed) {
        if ((receipt.deletedAt ?? 0) > cutoff) continue;
        await purgeReceipt(ctx, receipt);
        purged += 1;
      }
    }

    return purged;
  },
});

/** Cleans up invites nobody accepted. */
export const expireInvites = internalMutation({
  args: {},
  handler: async (ctx) => {
    const invites = await ctx.db.query("invites").collect();
    let removed = 0;

    for (const invite of invites) {
      const stale =
        invite.acceptedAt !== undefined ||
        invite.revokedAt !== undefined ||
        invite.expiresAt < Date.now();
      // Keep a short tail of resolved invites for the audit trail.
      if (stale && invite._creationTime < Date.now() - 60 * 24 * 60 * 60 * 1000) {
        await ctx.db.delete(invite._id);
        removed += 1;
      }
    }

    return removed;
  },
});

/** Archives receipts once they pass a workspace member's auto-archive window. */
export const autoArchive = internalMutation({
  args: {},
  handler: async (ctx) => {
    const settings = await ctx.db.query("settings").collect();
    let archived = 0;

    for (const setting of settings) {
      if (!setting.autoArchiveAfterDays) continue;

      const cutoffDate = new Date();
      cutoffDate.setUTCDate(cutoffDate.getUTCDate() - setting.autoArchiveAfterDays);
      const cutoff = cutoffDate.toISOString().slice(0, 10);

      const receipts = await ctx.db
        .query("receipts")
        .withIndex("by_uploader", (q) => q.eq("uploaderId", setting.userId))
        .collect();

      for (const receipt of receipts) {
        if (receipt.isArchived || receipt.deletedAt !== undefined) continue;
        if (receipt.date >= cutoff) continue;
        if (receipt.approvalStatus === "submitted") continue;
        await ctx.db.patch(receipt._id, { isArchived: true });
        archived += 1;
      }
    }

    return archived;
  },
});

/** Completes account deletions that are past their grace period. */
export const purgeDeletedAccounts = internalMutation({
  args: {},
  handler: async (ctx) => {
    const cutoff = Date.now() - ACCOUNT_DELETION_GRACE_DAYS * 24 * 60 * 60 * 1000;
    const users = await ctx.db.query("users").collect();
    let purged = 0;

    for (const user of users) {
      if (!user.deletionRequestedAt || user.deletionRequestedAt > cutoff) continue;

      const memberships = await ctx.db
        .query("members")
        .withIndex("by_user", (q) => q.eq("userId", user._id))
        .collect();

      for (const membership of memberships) {
        const workspace = await ctx.db.get(membership.workspaceId);
        // A solo workspace goes with its owner; shared ones are left intact.
        if (workspace && workspace.ownerId === user._id) {
          const others = await ctx.db
            .query("members")
            .withIndex("by_workspace", (q) => q.eq("workspaceId", workspace._id))
            .collect();

          if (others.length === 1) {
            const receipts = await ctx.db
              .query("receipts")
              .withIndex("by_workspace", (q) => q.eq("workspaceId", workspace._id))
              .collect();
            for (const receipt of receipts) await purgeReceipt(ctx, receipt);
            await ctx.db.patch(workspace._id, { deletedAt: Date.now() });
          }
        }
        await ctx.db.delete(membership._id);
      }

      const settings = await ctx.db
        .query("settings")
        .withIndex("by_user", (q) => q.eq("userId", user._id))
        .unique();
      if (settings) await ctx.db.delete(settings._id);

      const notifications = await ctx.db
        .query("notifications")
        .withIndex("by_user", (q) => q.eq("userId", user._id))
        .collect();
      for (const notification of notifications) await ctx.db.delete(notification._id);

      await ctx.db.delete(user._id);
      purged += 1;
    }

    return purged;
  },
});

/**
 * Quarterly nudge for anyone with unreviewed deductible receipts, sent in the
 * month after each quarter closes.
 */
export const taxReminders = internalMutation({
  args: {},
  handler: async (ctx) => {
    const today = todayIso();
    const month = Number(today.slice(5, 7));
    if (![1, 4, 7, 10].includes(month)) return 0;

    const workspaces = await ctx.db.query("workspaces").collect();
    let sent = 0;

    for (const workspace of workspaces) {
      if (workspace.deletedAt !== undefined) continue;

      const year = month === 1 ? String(Number(today.slice(0, 4)) - 1) : today.slice(0, 4);

      const receipts = await ctx.db
        .query("receipts")
        .withIndex("by_workspace_date", (q) =>
          q
            .eq("workspaceId", workspace._id)
            .gte("date", `${year}-01-01`)
            .lte("date", `${year}-12-31`),
        )
        .collect();

      const outstanding = receipts.filter(
        (receipt) =>
          receipt.deletedAt === undefined &&
          receipt.taxDeductible &&
          receipt.reviewedAt === undefined,
      );

      if (outstanding.length === 0) continue;

      const members = await ctx.db
        .query("members")
        .withIndex("by_workspace", (q) => q.eq("workspaceId", workspace._id))
        .collect();

      for (const member of members) {
        if (!["owner", "admin"].includes(member.role)) continue;
        await notifyUser(ctx, {
          userId: member.userId,
          workspaceId: workspace._id,
          type: "tax_reminder",
          title: "Tax records need review",
          body: `${outstanding.length} deductible receipt${
            outstanding.length === 1 ? "" : "s"
          } from ${year} still need reviewing.`,
          link: "/dashboard/tax",
        });
        sent += 1;
      }
    }

    return sent;
  },
});

export const storeRates = internalMutation({
  args: { base: v.string(), ratesJson: v.string() },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("exchangeRates")
      .withIndex("by_base", (q) => q.eq("base", args.base))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        ratesJson: args.ratesJson,
        fetchedAt: Date.now(),
      });
      return null;
    }

    await ctx.db.insert("exchangeRates", {
      base: args.base,
      ratesJson: args.ratesJson,
      fetchedAt: Date.now(),
    });
    return null;
  },
});

/**
 * Refreshes FX rates from a public endpoint. Failure is non-fatal: receipts
 * keep their stored rate and the UI lets users override it by hand.
 */
export const refreshExchangeRates = internalAction({
  args: {},
  handler: async (ctx) => {
    try {
      const response = await fetch("https://open.er-api.com/v6/latest/USD");
      if (!response.ok) return null;

      const payload = (await response.json()) as {
        result?: string;
        rates?: Record<string, number>;
      };

      if (payload.result !== "success" || !payload.rates) return null;

      await ctx.runMutation(internal.maintenance.storeRates, {
        base: "USD",
        ratesJson: JSON.stringify(payload.rates),
      });
    } catch {
      // Leave the previous snapshot in place.
    }
    return null;
  },
});

/** Latest FX snapshot, for converting a foreign-currency receipt at entry time. */
export const exchangeRates = query({
  args: {},
  handler: async (ctx) => {
    const row = await ctx.db
      .query("exchangeRates")
      .withIndex("by_base", (q) => q.eq("base", "USD"))
      .unique();

    if (!row) return null;

    return {
      base: row.base,
      rates: JSON.parse(row.ratesJson) as Record<string, number>,
      fetchedAt: row.fetchedAt,
    };
  },
});
