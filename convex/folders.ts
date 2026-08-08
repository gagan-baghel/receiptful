import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import {
  requireActiveWorkspace,
  requireCapability,
  writeAudit,
} from "./model/guards";
import { serializeReceipt } from "./model/receipts";

export const list = query({
  args: {},
  handler: async (ctx) => {
    const { workspace } = await requireActiveWorkspace(ctx);

    const folders = await ctx.db
      .query("folders")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", workspace._id))
      .collect();

    // Totals come from the receipts themselves so archived/deleted rows drop out.
    const totals = new Map<string, { count: number; totalCents: number }>();
    for (const folder of folders) {
      const folderLinks = await ctx.db
        .query("receiptFolders")
        .withIndex("by_folder", (q) => q.eq("folderId", folder._id))
        .collect();

      let count = 0;
      let totalCents = 0;
      for (const link of folderLinks) {
        const receipt = await ctx.db.get(link.receiptId);
        if (!receipt || receipt.deletedAt !== undefined) continue;
        count += 1;
        totalCents += receipt.baseAmountCents;
      }
      totals.set(folder._id, { count, totalCents });
    }

    return folders
      .filter((folder) => folder.deletedAt === undefined)
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((folder) => ({
        _id: folder._id,
        name: folder.name,
        parentId: folder.parentId,
        color: folder.color,
        icon: folder.icon,
        receiptCount: totals.get(folder._id)?.count ?? 0,
        totalCents: totals.get(folder._id)?.totalCents ?? 0,
        createdAt: folder._creationTime,
      }));
  },
});

export const get = query({
  args: { folderId: v.id("folders") },
  handler: async (ctx, args) => {
    const folder = await ctx.db.get(args.folderId);
    if (!folder || folder.deletedAt !== undefined) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Folder not found." });
    }
    const { workspace } = await requireActiveWorkspace(ctx);
    if (folder.workspaceId !== workspace._id) {
      throw new ConvexError({ code: "FORBIDDEN", message: "Folder not found." });
    }

    const links = await ctx.db
      .query("receiptFolders")
      .withIndex("by_folder", (q) => q.eq("folderId", args.folderId))
      .collect();

    const receipts = [];
    for (const link of links) {
      const receipt = await ctx.db.get(link.receiptId);
      if (!receipt || receipt.deletedAt !== undefined) continue;
      receipts.push(await serializeReceipt(ctx, receipt));
    }

    return {
      folder: {
        _id: folder._id,
        name: folder.name,
        color: folder.color,
        icon: folder.icon,
        parentId: folder.parentId,
      },
      receipts: receipts.sort((a, b) => b.date.localeCompare(a.date)),
      totalCents: receipts.reduce((sum, receipt) => sum + receipt.baseAmountCents, 0),
    };
  },
});

export const create = mutation({
  args: {
    name: v.string(),
    color: v.optional(v.string()),
    icon: v.optional(v.string()),
    parentId: v.optional(v.id("folders")),
  },
  handler: async (ctx, args) => {
    const { workspace } = await requireActiveWorkspace(ctx);
    const { user } = await requireCapability(ctx, workspace._id, "folder.manage");

    const name = args.name.trim();
    if (!name || name.length > 60) {
      throw new ConvexError({
        code: "INVALID_INPUT",
        message: "Folder name must be 1–60 characters.",
      });
    }

    const duplicate = await ctx.db
      .query("folders")
      .withIndex("by_workspace_name", (q) =>
        q.eq("workspaceId", workspace._id).eq("name", name),
      )
      .unique();

    if (duplicate && duplicate.deletedAt === undefined) {
      throw new ConvexError({
        code: "DUPLICATE",
        message: `A folder named "${name}" already exists.`,
      });
    }

    if (args.parentId) {
      const parent = await ctx.db.get(args.parentId);
      if (!parent || parent.workspaceId !== workspace._id) {
        throw new ConvexError({
          code: "INVALID_INPUT",
          message: "Parent folder not found.",
        });
      }
    }

    const folderId = await ctx.db.insert("folders", {
      workspaceId: workspace._id,
      name,
      parentId: args.parentId,
      color: args.color ?? "#2563eb",
      icon: args.icon ?? "Folder",
      createdBy: user._id,
      receiptCount: 0,
    });

    await writeAudit(ctx, {
      workspaceId: workspace._id,
      actorId: user._id,
      action: "folder.created",
      entityType: "folder",
      entityId: folderId,
      meta: { name },
    });

    return folderId;
  },
});

export const update = mutation({
  args: {
    folderId: v.id("folders"),
    name: v.optional(v.string()),
    color: v.optional(v.string()),
    icon: v.optional(v.string()),
    parentId: v.optional(v.union(v.id("folders"), v.null())),
  },
  handler: async (ctx, args) => {
    const folder = await ctx.db.get(args.folderId);
    if (!folder) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Folder not found." });
    }
    await requireCapability(ctx, folder.workspaceId, "folder.manage");

    const patch: Record<string, unknown> = {};
    if (args.name !== undefined) {
      const name = args.name.trim();
      if (!name || name.length > 60) {
        throw new ConvexError({
          code: "INVALID_INPUT",
          message: "Folder name must be 1–60 characters.",
        });
      }
      patch.name = name;
    }
    if (args.color !== undefined) patch.color = args.color;
    if (args.icon !== undefined) patch.icon = args.icon;
    if (args.parentId !== undefined) {
      if (args.parentId === null) {
        patch.parentId = undefined;
      } else {
        if (args.parentId === args.folderId) {
          throw new ConvexError({
            code: "INVALID_INPUT",
            message: "A folder cannot be its own parent.",
          });
        }
        // Walk up the chain so a move can never create a cycle.
        let cursor = await ctx.db.get(args.parentId);
        while (cursor) {
          if (cursor._id === args.folderId) {
            throw new ConvexError({
              code: "INVALID_INPUT",
              message: "That move would nest the folder inside itself.",
            });
          }
          cursor = cursor.parentId ? await ctx.db.get(cursor.parentId) : null;
        }
        patch.parentId = args.parentId;
      }
    }

    await ctx.db.patch(args.folderId, patch);
    return null;
  },
});

export const remove = mutation({
  args: { folderId: v.id("folders") },
  handler: async (ctx, args) => {
    const folder = await ctx.db.get(args.folderId);
    if (!folder) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Folder not found." });
    }
    const { user } = await requireCapability(ctx, folder.workspaceId, "folder.manage");

    const children = await ctx.db
      .query("folders")
      .withIndex("by_workspace_parent", (q) =>
        q.eq("workspaceId", folder.workspaceId).eq("parentId", args.folderId),
      )
      .collect();

    for (const child of children) {
      await ctx.db.patch(child._id, { parentId: folder.parentId });
    }

    // Receipts are never deleted with a folder — only the membership is removed.
    const links = await ctx.db
      .query("receiptFolders")
      .withIndex("by_folder", (q) => q.eq("folderId", args.folderId))
      .collect();

    for (const link of links) await ctx.db.delete(link._id);

    await ctx.db.patch(args.folderId, { deletedAt: Date.now() });
    await writeAudit(ctx, {
      workspaceId: folder.workspaceId,
      actorId: user._id,
      action: "folder.deleted",
      entityType: "folder",
      entityId: args.folderId,
      meta: { name: folder.name, unlinked: links.length },
    });

    return null;
  },
});
