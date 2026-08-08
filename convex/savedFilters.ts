import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireActiveWorkspace } from "./model/guards";

export const list = query({
  args: {},
  handler: async (ctx) => {
    const { workspace, user } = await requireActiveWorkspace(ctx);

    const rows = await ctx.db
      .query("savedFilters")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", workspace._id))
      .collect();

    return rows
      .filter((row) => row.userId === user._id || row.isShared)
      .map((row) => ({
        _id: row._id,
        name: row.name,
        filters: JSON.parse(row.filtersJson) as Record<string, unknown>,
        isShared: row.isShared,
        isOwn: row.userId === user._id,
        createdAt: row._creationTime,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  },
});

export const save = mutation({
  args: {
    name: v.string(),
    filtersJson: v.string(),
    isShared: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { workspace, user } = await requireActiveWorkspace(ctx);

    const name = args.name.trim();
    if (!name || name.length > 60) {
      throw new ConvexError({
        code: "INVALID_INPUT",
        message: "Filter name must be 1–60 characters.",
      });
    }

    try {
      JSON.parse(args.filtersJson);
    } catch {
      throw new ConvexError({ code: "INVALID_INPUT", message: "Invalid filter payload." });
    }
    if (args.filtersJson.length > 8000) {
      throw new ConvexError({ code: "INVALID_INPUT", message: "Filter is too large." });
    }

    const existing = await ctx.db
      .query("savedFilters")
      .withIndex("by_workspace_user", (q) =>
        q.eq("workspaceId", workspace._id).eq("userId", user._id),
      )
      .collect();

    const duplicate = existing.find((row) => row.name === name);
    if (duplicate) {
      await ctx.db.patch(duplicate._id, {
        filtersJson: args.filtersJson,
        isShared: args.isShared ?? duplicate.isShared,
      });
      return duplicate._id;
    }

    if (existing.length >= 50) {
      throw new ConvexError({
        code: "TOO_MANY",
        message: "You can save up to 50 filters. Delete one first.",
      });
    }

    return await ctx.db.insert("savedFilters", {
      workspaceId: workspace._id,
      userId: user._id,
      name,
      filtersJson: args.filtersJson,
      isShared: args.isShared ?? false,
    });
  },
});

export const remove = mutation({
  args: { filterId: v.id("savedFilters") },
  handler: async (ctx, args) => {
    const { user, member } = await requireActiveWorkspace(ctx);
    const row = await ctx.db.get(args.filterId);

    if (!row) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Saved filter not found." });
    }
    if (row.userId !== user._id && !["owner", "admin"].includes(member.role)) {
      throw new ConvexError({
        code: "FORBIDDEN",
        message: "You can only delete your own saved filters.",
      });
    }

    await ctx.db.delete(args.filterId);
    return null;
  },
});
