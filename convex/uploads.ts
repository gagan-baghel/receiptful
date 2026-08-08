import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import { mutation } from "./_generated/server";
import {
  assertCanEditReceipt,
  assertCapability,
  requireActiveWorkspace,
  requireReceipt,
  writeActivity,
} from "./model/guards";
import { adjustWorkspaceUsage } from "./model/receipts";

const ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/heic",
  "image/heif",
  "application/pdf",
]);

const MAX_PAGE_BYTES = 20 * 1024 * 1024;
const MAX_PAGES = 25;

export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    const { member, workspace } = await requireActiveWorkspace(ctx);
    assertCapability(member.role, "receipt.create");

    if (workspace.storageUsedBytes >= workspace.storageQuotaBytes) {
      throw new ConvexError({
        code: "STORAGE_FULL",
        message: "Storage is full. Delete receipts or upgrade your plan to add more.",
      });
    }

    return await ctx.storage.generateUploadUrl();
  },
});

/**
 * Attaches an uploaded blob to a receipt. Size and content type are read from
 * Convex storage metadata, never from the client — a client that lies about
 * either has its blob deleted here.
 */
export const attachPage = mutation({
  args: {
    receiptId: v.id("receipts"),
    storageId: v.id("_storage"),
    order: v.optional(v.number()),
    width: v.optional(v.number()),
    height: v.optional(v.number()),
    isThumbnail: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const context = await requireReceipt(ctx, args.receiptId);
    assertCanEditReceipt(context, context.receipt);
    const { receipt, workspace } = context;

    const metadata = await ctx.db.system.get(args.storageId);
    if (!metadata) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Upload not found." });
    }

    const contentType = metadata.contentType ?? "";
    if (!ALLOWED_TYPES.has(contentType)) {
      await ctx.storage.delete(args.storageId);
      throw new ConvexError({
        code: "UNSUPPORTED_TYPE",
        message: `${contentType || "That file type"} is not supported. Upload a JPEG, PNG, WebP, HEIC or PDF.`,
      });
    }

    if (metadata.size > MAX_PAGE_BYTES) {
      await ctx.storage.delete(args.storageId);
      throw new ConvexError({
        code: "FILE_TOO_LARGE",
        message: "Each page must be 20 MB or smaller.",
      });
    }

    if (workspace.storageUsedBytes + metadata.size > workspace.storageQuotaBytes) {
      await ctx.storage.delete(args.storageId);
      throw new ConvexError({
        code: "STORAGE_FULL",
        message: "This upload would exceed your storage quota.",
      });
    }

    if (args.isThumbnail) {
      if (receipt.thumbnailId) {
        await ctx.storage.delete(receipt.thumbnailId).catch(() => undefined);
      }
      await ctx.db.patch(args.receiptId, { thumbnailId: args.storageId });
      return null;
    }

    const existing = await ctx.db
      .query("receiptPages")
      .withIndex("by_receipt", (q) => q.eq("receiptId", args.receiptId))
      .collect();

    if (existing.length >= MAX_PAGES) {
      await ctx.storage.delete(args.storageId);
      throw new ConvexError({
        code: "TOO_MANY_PAGES",
        message: `A receipt can hold at most ${MAX_PAGES} pages.`,
      });
    }

    const order =
      args.order ?? existing.reduce((max, page) => Math.max(max, page.order + 1), 0);

    await ctx.db.insert("receiptPages", {
      receiptId: args.receiptId,
      workspaceId: workspace._id,
      storageId: args.storageId,
      order,
      mimeType: contentType,
      width: args.width,
      height: args.height,
      rotation: 0,
      sizeBytes: metadata.size,
    });

    await ctx.db.patch(args.receiptId, {
      pageCount: existing.length + 1,
      storageBytes: receipt.storageBytes + metadata.size,
    });

    await adjustWorkspaceUsage(ctx, workspace._id, { bytes: metadata.size });

    return null;
  },
});

/** Closes out an upload and kicks off extraction. */
export const finalize = mutation({
  args: { receiptId: v.id("receipts"), runOcr: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    const context = await requireReceipt(ctx, args.receiptId);
    assertCanEditReceipt(context, context.receipt);

    const pages = await ctx.db
      .query("receiptPages")
      .withIndex("by_receipt", (q) => q.eq("receiptId", args.receiptId))
      .collect();

    if (pages.length === 0) {
      throw new ConvexError({
        code: "NO_PAGES",
        message: "Add at least one page before saving.",
      });
    }

    await ctx.runMutation(internal.ocrStore.ensureDefaults, { receiptId: args.receiptId });

    await writeActivity(ctx, {
      workspaceId: context.workspace._id,
      receiptId: args.receiptId,
      actorId: context.user._id,
      type: "uploaded",
      summary: `Uploaded ${pages.length} page${pages.length === 1 ? "" : "s"}`,
    });

    if (args.runOcr === false) {
      await ctx.db.patch(args.receiptId, { status: "needs_review" });
      return null;
    }

    await ctx.db.patch(args.receiptId, { status: "processing" });
    await ctx.scheduler.runAfter(0, internal.ocr.processReceipt, {
      receiptId: args.receiptId,
    });

    return null;
  },
});

export const retryOcr = mutation({
  args: { receiptId: v.id("receipts") },
  handler: async (ctx, args) => {
    const context = await requireReceipt(ctx, args.receiptId);
    assertCanEditReceipt(context, context.receipt);

    await ctx.db.patch(args.receiptId, { status: "processing" });
    await ctx.scheduler.runAfter(0, internal.ocr.processReceipt, {
      receiptId: args.receiptId,
    });

    await writeActivity(ctx, {
      workspaceId: context.workspace._id,
      receiptId: args.receiptId,
      actorId: context.user._id,
      type: "ocr_retried",
      summary: "Re-ran automatic extraction",
    });

    return null;
  },
});

export const removePage = mutation({
  args: { pageId: v.id("receiptPages") },
  handler: async (ctx, args) => {
    const page = await ctx.db.get(args.pageId);
    if (!page) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Page not found." });
    }

    const context = await requireReceipt(ctx, page.receiptId);
    assertCanEditReceipt(context, context.receipt);

    await ctx.storage.delete(page.storageId);
    await ctx.db.delete(args.pageId);

    const remaining = await ctx.db
      .query("receiptPages")
      .withIndex("by_receipt", (q) => q.eq("receiptId", page.receiptId))
      .collect();

    // Keep page order dense so the reorder UI never shows gaps.
    const ordered = remaining.sort((a, b) => a.order - b.order);
    for (const [index, item] of ordered.entries()) {
      if (item.order !== index) await ctx.db.patch(item._id, { order: index });
    }

    await ctx.db.patch(page.receiptId, {
      pageCount: ordered.length,
      storageBytes: Math.max(0, context.receipt.storageBytes - page.sizeBytes),
    });

    await adjustWorkspaceUsage(ctx, context.workspace._id, { bytes: -page.sizeBytes });

    return null;
  },
});

export const reorderPages = mutation({
  args: { receiptId: v.id("receipts"), pageIds: v.array(v.id("receiptPages")) },
  handler: async (ctx, args) => {
    const context = await requireReceipt(ctx, args.receiptId);
    assertCanEditReceipt(context, context.receipt);

    const pages = await ctx.db
      .query("receiptPages")
      .withIndex("by_receipt", (q) => q.eq("receiptId", args.receiptId))
      .collect();

    const known = new Set(pages.map((page) => page._id as string));
    if (args.pageIds.length !== pages.length || args.pageIds.some((id) => !known.has(id))) {
      throw new ConvexError({
        code: "INVALID_INPUT",
        message: "The page list does not match this receipt.",
      });
    }

    for (const [index, pageId] of args.pageIds.entries()) {
      await ctx.db.patch(pageId, { order: index });
    }

    return null;
  },
});

export const rotatePage = mutation({
  args: { pageId: v.id("receiptPages"), rotation: v.number() },
  handler: async (ctx, args) => {
    const page = await ctx.db.get(args.pageId);
    if (!page) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Page not found." });
    }

    const context = await requireReceipt(ctx, page.receiptId);
    assertCanEditReceipt(context, context.receipt);

    const normalized = ((Math.round(args.rotation / 90) * 90) % 360 + 360) % 360;
    await ctx.db.patch(args.pageId, { rotation: normalized });

    return null;
  },
});

/**
 * Replaces a page's image in place — the retake flow. The old blob is released
 * so a retaken page never double-counts against storage.
 */
export const replacePage = mutation({
  args: { pageId: v.id("receiptPages"), storageId: v.id("_storage") },
  handler: async (ctx, args) => {
    const page = await ctx.db.get(args.pageId);
    if (!page) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Page not found." });
    }

    const context = await requireReceipt(ctx, page.receiptId);
    assertCanEditReceipt(context, context.receipt);

    const metadata = await ctx.db.system.get(args.storageId);
    if (!metadata || !ALLOWED_TYPES.has(metadata.contentType ?? "")) {
      await ctx.storage.delete(args.storageId);
      throw new ConvexError({
        code: "UNSUPPORTED_TYPE",
        message: "That file type is not supported.",
      });
    }
    if (metadata.size > MAX_PAGE_BYTES) {
      await ctx.storage.delete(args.storageId);
      throw new ConvexError({
        code: "FILE_TOO_LARGE",
        message: "Each page must be 20 MB or smaller.",
      });
    }

    await ctx.storage.delete(page.storageId);
    await ctx.db.patch(args.pageId, {
      storageId: args.storageId,
      mimeType: metadata.contentType ?? page.mimeType,
      sizeBytes: metadata.size,
      rotation: 0,
    });

    const delta = metadata.size - page.sizeBytes;
    await ctx.db.patch(page.receiptId, {
      storageBytes: Math.max(0, context.receipt.storageBytes + delta),
    });
    await adjustWorkspaceUsage(ctx, context.workspace._id, { bytes: delta });

    return null;
  },
});
