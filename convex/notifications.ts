import { paginationOptsValidator } from "convex/server";
import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireUser } from "./model/guards";

export const list = query({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);

    const results = await ctx.db
      .query("notifications")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .order("desc")
      .paginate(args.paginationOpts);

    return {
      ...results,
      page: results.page.map((notification) => ({
        _id: notification._id,
        type: notification.type,
        title: notification.title,
        body: notification.body,
        link: notification.link,
        readAt: notification.readAt,
        createdAt: notification._creationTime,
      })),
    };
  },
});

/** Unread badge count, capped so the query stays cheap. */
export const unreadCount = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const unread = await ctx.db
      .query("notifications")
      .withIndex("by_user_unread", (q) => q.eq("userId", user._id).eq("readAt", undefined))
      .take(100);
    return unread.length;
  },
});

export const markRead = mutation({
  args: { notificationIds: v.array(v.id("notifications")) },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);

    for (const notificationId of args.notificationIds) {
      const notification = await ctx.db.get(notificationId);
      if (!notification || notification.userId !== user._id) continue;
      if (notification.readAt !== undefined) continue;
      await ctx.db.patch(notificationId, { readAt: Date.now() });
    }

    return null;
  },
});

export const markAllRead = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);

    const unread = await ctx.db
      .query("notifications")
      .withIndex("by_user_unread", (q) => q.eq("userId", user._id).eq("readAt", undefined))
      .collect();

    const now = Date.now();
    for (const notification of unread) {
      await ctx.db.patch(notification._id, { readAt: now });
    }

    return unread.length;
  },
});

export const remove = mutation({
  args: { notificationId: v.id("notifications") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const notification = await ctx.db.get(args.notificationId);

    if (!notification || notification.userId !== user._id) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Notification not found." });
    }

    await ctx.db.delete(args.notificationId);
    return null;
  },
});

export const clearAll = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const rows = await ctx.db
      .query("notifications")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();

    for (const row of rows) await ctx.db.delete(row._id);
    return rows.length;
  },
});
