import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireActiveWorkspace, requireCapability } from "./model/guards";
import { refreshSearchText } from "./model/receipts";

export const list = query({
  args: {},
  handler: async (ctx) => {
    const { workspace } = await requireActiveWorkspace(ctx);

    const tags = await ctx.db
      .query("tags")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", workspace._id))
      .collect();

    return tags
      .sort((a, b) => b.usageCount - a.usageCount || a.name.localeCompare(b.name))
      .map((tag) => ({
        _id: tag._id,
        name: tag.name,
        color: tag.color,
        usageCount: tag.usageCount,
      }));
  },
});

export const create = mutation({
  args: { name: v.string(), color: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const { workspace } = await requireActiveWorkspace(ctx);
    await requireCapability(ctx, workspace._id, "tag.manage");

    const name = args.name.trim().replace(/^#/, "");
    if (!name || name.length > 40) {
      throw new ConvexError({
        code: "INVALID_INPUT",
        message: "Tag name must be 1–40 characters.",
      });
    }

    const existing = await ctx.db
      .query("tags")
      .withIndex("by_workspace_name", (q) =>
        q.eq("workspaceId", workspace._id).eq("name", name),
      )
      .unique();

    if (existing) return existing._id;

    return await ctx.db.insert("tags", {
      workspaceId: workspace._id,
      name,
      color: args.color ?? "#64748b",
      usageCount: 0,
    });
  },
});

export const update = mutation({
  args: { tagId: v.id("tags"), name: v.optional(v.string()), color: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const tag = await ctx.db.get(args.tagId);
    if (!tag) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Tag not found." });
    }
    await requireCapability(ctx, tag.workspaceId, "tag.manage");

    const patch: Record<string, unknown> = {};
    if (args.color !== undefined) patch.color = args.color;
    if (args.name !== undefined) {
      const name = args.name.trim().replace(/^#/, "");
      if (!name || name.length > 40) {
        throw new ConvexError({
          code: "INVALID_INPUT",
          message: "Tag name must be 1–40 characters.",
        });
      }
      patch.name = name;
    }

    await ctx.db.patch(args.tagId, patch);

    // The tag name is part of every tagged receipt's search haystack.
    if (patch.name) {
      const links = await ctx.db
        .query("receiptTags")
        .withIndex("by_tag", (q) => q.eq("tagId", args.tagId))
        .collect();
      for (const link of links) await refreshSearchText(ctx, link.receiptId);
    }

    return null;
  },
});

export const remove = mutation({
  args: { tagId: v.id("tags") },
  handler: async (ctx, args) => {
    const tag = await ctx.db.get(args.tagId);
    if (!tag) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Tag not found." });
    }
    await requireCapability(ctx, tag.workspaceId, "tag.manage");

    const links = await ctx.db
      .query("receiptTags")
      .withIndex("by_tag", (q) => q.eq("tagId", args.tagId))
      .collect();

    for (const link of links) {
      await ctx.db.delete(link._id);
      await refreshSearchText(ctx, link.receiptId);
    }

    await ctx.db.delete(args.tagId);
    return null;
  },
});
