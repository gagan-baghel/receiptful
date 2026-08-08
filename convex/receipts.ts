import { paginationOptsValidator } from "convex/server";
import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { internalMutation, mutation, query } from "./_generated/server";
import {
  assertCanEditReceipt,
  assertCapability,
  requireActiveWorkspace,
  requireMember,
  requireReceipt,
  writeActivity,
  writeAudit,
} from "./model/guards";
import {
  computeReceiptStatus,
  isValidIsoDate,
  normalizeMerchant,
  todayIso,
} from "./model/lib";
import {
  adjustWorkspaceUsage,
  findDuplicate,
  purgeReceipt,
  refreshSearchText,
  serializeReceipt,
} from "./model/receipts";
import { paymentMethodValidator } from "./schema";

const sortValidator = v.union(
  v.literal("date_desc"),
  v.literal("date_asc"),
  v.literal("amount_desc"),
  v.literal("amount_asc"),
  v.literal("merchant_asc"),
  v.literal("created_desc"),
);

export const filtersValidator = v.object({
  search: v.optional(v.string()),
  from: v.optional(v.string()),
  to: v.optional(v.string()),
  categoryIds: v.optional(v.array(v.id("categories"))),
  tagIds: v.optional(v.array(v.id("tags"))),
  folderIds: v.optional(v.array(v.id("folders"))),
  merchants: v.optional(v.array(v.string())),
  paymentMethods: v.optional(v.array(paymentMethodValidator)),
  currencies: v.optional(v.array(v.string())),
  minCents: v.optional(v.number()),
  maxCents: v.optional(v.number()),
  taxDeductible: v.optional(v.boolean()),
  reimbursable: v.optional(v.boolean()),
  classification: v.optional(
    v.union(v.literal("business"), v.literal("personal")),
  ),
  approvalStatus: v.optional(
    v.union(
      v.literal("none"),
      v.literal("submitted"),
      v.literal("approved"),
      v.literal("rejected"),
      v.literal("returned"),
    ),
  ),
  needsReview: v.optional(v.boolean()),
  archived: v.optional(v.boolean()),
  uploaderId: v.optional(v.id("users")),
  sort: v.optional(sortValidator),
});

export type Filters = {
  search?: string;
  from?: string;
  to?: string;
  categoryIds?: Id<"categories">[];
  tagIds?: Id<"tags">[];
  folderIds?: Id<"folders">[];
  merchants?: string[];
  paymentMethods?: Doc<"receipts">["paymentMethod"][];
  currencies?: string[];
  minCents?: number;
  maxCents?: number;
  taxDeductible?: boolean;
  reimbursable?: boolean;
  classification?: "business" | "personal";
  approvalStatus?: Doc<"receipts">["approvalStatus"];
  needsReview?: boolean;
  archived?: boolean;
  uploaderId?: Id<"users">;
  sort?:
    | "date_desc"
    | "date_asc"
    | "amount_desc"
    | "amount_asc"
    | "merchant_asc"
    | "created_desc";
};

/**
 * All non-indexed predicates, applied in JS to a page of index results.
 * Pages may come back under-filled; the client keeps paginating.
 */
function matchesFilters(
  receipt: Doc<"receipts">,
  filters: Filters,
  tagMatches: Set<string> | null,
  folderMatches: Set<string> | null,
): boolean {
  if (filters.categoryIds?.length) {
    if (!receipt.categoryId || !filters.categoryIds.includes(receipt.categoryId)) {
      return false;
    }
  }
  if (tagMatches && !tagMatches.has(receipt._id)) return false;
  if (folderMatches && !folderMatches.has(receipt._id)) return false;

  if (filters.merchants?.length) {
    const normalized = filters.merchants.map(normalizeMerchant);
    if (!normalized.includes(receipt.merchantNormalized)) return false;
  }
  if (filters.paymentMethods?.length && !filters.paymentMethods.includes(receipt.paymentMethod)) {
    return false;
  }
  if (filters.currencies?.length && !filters.currencies.includes(receipt.currency)) {
    return false;
  }
  if (filters.minCents !== undefined && receipt.baseAmountCents < filters.minCents) return false;
  if (filters.maxCents !== undefined && receipt.baseAmountCents > filters.maxCents) return false;
  if (filters.taxDeductible !== undefined && receipt.taxDeductible !== filters.taxDeductible) {
    return false;
  }
  if (filters.reimbursable !== undefined && receipt.reimbursable !== filters.reimbursable) {
    return false;
  }
  if (filters.classification && receipt.classification !== filters.classification) return false;
  if (filters.approvalStatus && receipt.approvalStatus !== filters.approvalStatus) return false;
  if (filters.needsReview !== undefined) {
    const needsReview = receipt.status === "needs_review" || receipt.reviewedAt === undefined;
    if (needsReview !== filters.needsReview) return false;
  }
  if (filters.uploaderId && receipt.uploaderId !== filters.uploaderId) return false;
  if (filters.from && receipt.date < filters.from) return false;
  if (filters.to && receipt.date > filters.to) return false;

  return true;
}

async function resolveJoinFilters(
  ctx: Parameters<typeof serializeReceipt>[0],
  filters: Filters,
) {
  let tagMatches: Set<string> | null = null;
  let folderMatches: Set<string> | null = null;

  if (filters.tagIds?.length) {
    tagMatches = new Set();
    for (const tagId of filters.tagIds) {
      const links = await ctx.db
        .query("receiptTags")
        .withIndex("by_tag", (q) => q.eq("tagId", tagId))
        .collect();
      for (const link of links) tagMatches.add(link.receiptId);
    }
  }

  if (filters.folderIds?.length) {
    folderMatches = new Set();
    for (const folderId of filters.folderIds) {
      const links = await ctx.db
        .query("receiptFolders")
        .withIndex("by_folder", (q) => q.eq("folderId", folderId))
        .collect();
      for (const link of links) folderMatches.add(link.receiptId);
    }
  }

  return { tagMatches, folderMatches };
}

function sortReceipts(receipts: Doc<"receipts">[], sort: Filters["sort"]) {
  const sorted = [...receipts];
  switch (sort) {
    case "date_asc":
      return sorted.sort((a, b) => a.date.localeCompare(b.date));
    case "amount_desc":
      return sorted.sort((a, b) => b.baseAmountCents - a.baseAmountCents);
    case "amount_asc":
      return sorted.sort((a, b) => a.baseAmountCents - b.baseAmountCents);
    case "merchant_asc":
      return sorted.sort((a, b) => a.merchant.localeCompare(b.merchant));
    case "created_desc":
      return sorted.sort((a, b) => b._creationTime - a._creationTime);
    default:
      return sorted.sort((a, b) => b.date.localeCompare(a.date));
  }
}

export const list = query({
  args: {
    paginationOpts: paginationOptsValidator,
    filters: v.optional(filtersValidator),
  },
  handler: async (ctx, args) => {
    const { workspace } = await requireActiveWorkspace(ctx);
    const filters: Filters = (args.filters ?? {}) as Filters;
    const includeArchived = filters.archived === true;

    const { tagMatches, folderMatches } = await resolveJoinFilters(ctx, filters);

    // Free-text search routes through the search index; everything else scans
    // the workspace/date index which is already in the desired sort order.
    if (filters.search && filters.search.trim().length > 0) {
      const term = filters.search.trim().slice(0, 200);
      const results = await ctx.db
        .query("receipts")
        .withSearchIndex("search_all", (q) =>
          q.search("searchText", term).eq("workspaceId", workspace._id),
        )
        .paginate(args.paginationOpts);

      const page = results.page.filter(
        (receipt) =>
          receipt.deletedAt === undefined &&
          receipt.isArchived === includeArchived &&
          matchesFilters(receipt, filters, tagMatches, folderMatches),
      );

      return {
        ...results,
        page: await Promise.all(page.map((receipt) => serializeReceipt(ctx, receipt))),
      };
    }

    const results = await ctx.db
      .query("receipts")
      .withIndex("by_workspace_archived_date", (q) => {
        const scoped = q.eq("workspaceId", workspace._id).eq("isArchived", includeArchived);
        if (filters.from && filters.to) return scoped.gte("date", filters.from).lte("date", filters.to);
        if (filters.from) return scoped.gte("date", filters.from);
        if (filters.to) return scoped.lte("date", filters.to);
        return scoped;
      })
      .order(filters.sort === "date_asc" ? "asc" : "desc")
      .paginate(args.paginationOpts);

    const page = results.page.filter(
      (receipt) =>
        receipt.deletedAt === undefined &&
        matchesFilters(receipt, filters, tagMatches, folderMatches),
    );

    const ordered =
      filters.sort && !["date_desc", "date_asc"].includes(filters.sort)
        ? sortReceipts(page, filters.sort)
        : page;

    return {
      ...results,
      page: await Promise.all(ordered.map((receipt) => serializeReceipt(ctx, receipt))),
    };
  },
});

/** Instant-search surface for the command palette. Capped, no pagination. */
export const quickSearch = query({
  args: { term: v.string(), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const term = args.term.trim();
    if (term.length === 0) return [];

    const { workspace } = await requireActiveWorkspace(ctx);

    const results = await ctx.db
      .query("receipts")
      .withSearchIndex("search_all", (q) =>
        q.search("searchText", term.slice(0, 200)).eq("workspaceId", workspace._id),
      )
      .take(Math.min(args.limit ?? 8, 25));

    return await Promise.all(
      results
        .filter((receipt) => receipt.deletedAt === undefined)
        .map((receipt) => serializeReceipt(ctx, receipt)),
    );
  },
});

export const get = query({
  args: { receiptId: v.id("receipts") },
  handler: async (ctx, args) => {
    const { receipt, workspace, member } = await requireReceipt(ctx, args.receiptId, {
      includeDeleted: true,
    });

    const [pages, ocr, tagLinks, folderLinks, comments, versions, activityRows] =
      await Promise.all([
        ctx.db
          .query("receiptPages")
          .withIndex("by_receipt", (q) => q.eq("receiptId", receipt._id))
          .collect(),
        ctx.db
          .query("ocrResults")
          .withIndex("by_receipt", (q) => q.eq("receiptId", receipt._id))
          .first(),
        ctx.db
          .query("receiptTags")
          .withIndex("by_receipt", (q) => q.eq("receiptId", receipt._id))
          .collect(),
        ctx.db
          .query("receiptFolders")
          .withIndex("by_receipt", (q) => q.eq("receiptId", receipt._id))
          .collect(),
        ctx.db
          .query("comments")
          .withIndex("by_receipt", (q) => q.eq("receiptId", receipt._id))
          .collect(),
        ctx.db
          .query("receiptVersions")
          .withIndex("by_receipt", (q) => q.eq("receiptId", receipt._id))
          .order("desc")
          .take(25),
        ctx.db
          .query("activity")
          .withIndex("by_receipt", (q) => q.eq("receiptId", receipt._id))
          .order("desc")
          .take(50),
      ]);

    const pagesWithUrls = await Promise.all(
      pages
        .sort((a, b) => a.order - b.order)
        .map(async (page) => ({
          _id: page._id,
          order: page.order,
          rotation: page.rotation,
          mimeType: page.mimeType,
          width: page.width,
          height: page.height,
          sizeBytes: page.sizeBytes,
          url: await ctx.storage.getUrl(page.storageId),
        })),
    );

    const tags = (await Promise.all(tagLinks.map((link) => ctx.db.get(link.tagId))))
      .filter((tag): tag is Doc<"tags"> => tag !== null)
      .map((tag) => ({ _id: tag._id, name: tag.name, color: tag.color }));

    const folders = (
      await Promise.all(folderLinks.map((link) => ctx.db.get(link.folderId)))
    )
      .filter((folder): folder is Doc<"folders"> => folder !== null)
      .map((folder) => ({ _id: folder._id, name: folder.name, color: folder.color }));

    const category = receipt.categoryId ? await ctx.db.get(receipt.categoryId) : null;
    const uploader = await ctx.db.get(receipt.uploaderId);

    const commentsWithAuthors = await Promise.all(
      comments
        .filter((comment) => comment.deletedAt === undefined)
        .map(async (comment) => {
          const author = await ctx.db.get(comment.authorId);
          return {
            _id: comment._id,
            body: comment.body,
            createdAt: comment._creationTime,
            editedAt: comment.editedAt,
            authorId: comment.authorId,
            authorName: author?.name ?? "Unknown",
            authorImage: author?.image,
          };
        }),
    );

    const timeline = await Promise.all(
      activityRows.map(async (row) => {
        const actor = row.actorId ? await ctx.db.get(row.actorId) : null;
        return {
          _id: row._id,
          type: row.type,
          summary: row.summary,
          createdAt: row._creationTime,
          actorName: actor?.name ?? "System",
        };
      }),
    );

    // Same merchant, most recent first — powers the "related receipts" rail.
    const related = (
      await ctx.db
        .query("receipts")
        .withIndex("by_workspace_merchant", (q) =>
          q
            .eq("workspaceId", workspace._id)
            .eq("merchantNormalized", receipt.merchantNormalized),
        )
        .take(12)
    )
      .filter((other) => other._id !== receipt._id && other.deletedAt === undefined)
      .slice(0, 6);

    return {
      receipt: {
        ...(await serializeReceipt(ctx, receipt)),
        subtotalCents: receipt.subtotalCents,
        tipCents: receipt.tipCents,
        exchangeRate: receipt.exchangeRate,
        invoiceNumber: receipt.invoiceNumber,
        receiptNumber: receipt.receiptNumber,
        businessNumber: receipt.businessNumber,
        address: receipt.address,
        phone: receipt.phone,
        website: receipt.website,
        email: receipt.email,
        latitude: receipt.latitude,
        longitude: receipt.longitude,
        items: receipt.items,
        storageBytes: receipt.storageBytes,
        reviewedBy: receipt.reviewedBy,
      },
      pages: pagesWithUrls,
      ocr: ocr
        ? {
            status: ocr.status,
            provider: ocr.provider,
            rawText: ocr.rawText,
            overallConfidence: ocr.overallConfidence,
            fieldConfidences: ocr.fieldConfidences,
            error: ocr.error,
            processedAt: ocr.processedAt,
          }
        : null,
      tags,
      folders,
      category: category
        ? { _id: category._id, name: category.name, color: category.color }
        : null,
      uploader: uploader
        ? { _id: uploader._id, name: uploader.name ?? "", image: uploader.image }
        : null,
      comments: commentsWithAuthors.sort((a, b) => a.createdAt - b.createdAt),
      versions: versions.map((version) => ({
        _id: version._id,
        changes: version.changes,
        editedBy: version.editedBy,
        createdAt: version._creationTime,
      })),
      timeline,
      related: await Promise.all(related.map((other) => serializeReceipt(ctx, other))),
      viewerRole: member.role,
      workspaceCurrency: workspace.baseCurrency,
    };
  },
});

export const trash = query({
  args: {},
  handler: async (ctx) => {
    const { workspace } = await requireActiveWorkspace(ctx);
    const deleted = await ctx.db
      .query("receipts")
      .withIndex("by_workspace_deleted", (q) => q.eq("workspaceId", workspace._id))
      .filter((q) => q.neq(q.field("deletedAt"), undefined))
      .order("desc")
      .take(200);

    return await Promise.all(deleted.map((receipt) => serializeReceipt(ctx, receipt)));
  },
});

export const create = mutation({
  args: {
    merchant: v.optional(v.string()),
    amountCents: v.optional(v.number()),
    currency: v.optional(v.string()),
    date: v.optional(v.string()),
    categoryId: v.optional(v.id("categories")),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { user, member, workspace } = await requireActiveWorkspace(ctx);
    assertCapability(member.role, "receipt.create");

    const date = args.date && isValidIsoDate(args.date) ? args.date : todayIso();
    const merchant = (args.merchant ?? "").trim();

    const receiptId = await ctx.db.insert("receipts", {
      workspaceId: workspace._id,
      uploaderId: user._id,
      status: "uploading",
      merchant,
      merchantNormalized: normalizeMerchant(merchant),
      amountCents: Math.max(0, Math.round(args.amountCents ?? 0)),
      currency: args.currency ?? workspace.baseCurrency,
      baseAmountCents: Math.max(0, Math.round(args.amountCents ?? 0)),
      exchangeRate: 1,
      date,
      paymentMethod: "unknown",
      categoryId: args.categoryId,
      items: [],
      notes: args.notes,
      taxDeductible: false,
      classification: "business",
      reimbursable: false,
      ocrConfidence: 0,
      lowConfidenceFields: [],
      approvalStatus: "none",
      pageCount: 0,
      storageBytes: 0,
      isArchived: false,
      searchText: merchant,
    });

    await adjustWorkspaceUsage(ctx, workspace._id, { receipts: 1 });
    await writeActivity(ctx, {
      workspaceId: workspace._id,
      receiptId,
      actorId: user._id,
      type: "created",
      summary: "Receipt created",
    });

    return receiptId;
  },
});

const editableFields = {
  merchant: v.optional(v.string()),
  amountCents: v.optional(v.number()),
  subtotalCents: v.optional(v.number()),
  taxCents: v.optional(v.number()),
  tipCents: v.optional(v.number()),
  currency: v.optional(v.string()),
  exchangeRate: v.optional(v.number()),
  date: v.optional(v.string()),
  time: v.optional(v.string()),
  paymentMethod: v.optional(paymentMethodValidator),
  cardLast4: v.optional(v.string()),
  invoiceNumber: v.optional(v.string()),
  receiptNumber: v.optional(v.string()),
  businessNumber: v.optional(v.string()),
  address: v.optional(v.string()),
  phone: v.optional(v.string()),
  website: v.optional(v.string()),
  email: v.optional(v.string()),
  latitude: v.optional(v.number()),
  longitude: v.optional(v.number()),
  categoryId: v.optional(v.union(v.id("categories"), v.null())),
  notes: v.optional(v.string()),
  taxDeductible: v.optional(v.boolean()),
  classification: v.optional(v.union(v.literal("business"), v.literal("personal"))),
  reimbursable: v.optional(v.boolean()),
  projectName: v.optional(v.string()),
  items: v.optional(
    v.array(
      v.object({
        description: v.string(),
        quantity: v.optional(v.number()),
        unitPriceCents: v.optional(v.number()),
        totalCents: v.number(),
      }),
    ),
  ),
};

export const update = mutation({
  args: { receiptId: v.id("receipts"), ...editableFields },
  handler: async (ctx, args) => {
    const context = await requireReceipt(ctx, args.receiptId);
    assertCanEditReceipt(context, context.receipt);
    const { receipt, user, workspace } = context;

    const { receiptId, ...updates } = args;
    const patch: Record<string, unknown> = {};
    const changes: { field: string; from: string; to: string }[] = [];

    const record = (field: string, from: unknown, to: unknown) => {
      if (String(from ?? "") === String(to ?? "")) return;
      changes.push({ field, from: String(from ?? ""), to: String(to ?? "") });
    };

    if (updates.merchant !== undefined) {
      const merchant = updates.merchant.trim().slice(0, 200);
      record("merchant", receipt.merchant, merchant);
      patch.merchant = merchant;
      patch.merchantNormalized = normalizeMerchant(merchant);
    }

    for (const field of ["amountCents", "subtotalCents", "taxCents", "tipCents"] as const) {
      const value = updates[field];
      if (value === undefined) continue;
      if (!Number.isFinite(value) || value < 0 || value > 1_000_000_000_00) {
        throw new ConvexError({
          code: "INVALID_INPUT",
          message: "Amounts must be between 0 and 1,000,000,000.",
        });
      }
      record(field, receipt[field], Math.round(value));
      patch[field] = Math.round(value);
    }

    if (updates.date !== undefined) {
      if (!isValidIsoDate(updates.date)) {
        throw new ConvexError({ code: "INVALID_INPUT", message: "Invalid date." });
      }
      record("date", receipt.date, updates.date);
      patch.date = updates.date;
    }

    if (updates.time !== undefined) {
      if (updates.time && !/^\d{2}:\d{2}$/.test(updates.time)) {
        throw new ConvexError({ code: "INVALID_INPUT", message: "Time must be HH:mm." });
      }
      patch.time = updates.time || undefined;
    }

    if (updates.currency !== undefined) {
      record("currency", receipt.currency, updates.currency);
      patch.currency = updates.currency;
    }
    if (updates.exchangeRate !== undefined) {
      if (updates.exchangeRate <= 0 || updates.exchangeRate > 100000) {
        throw new ConvexError({ code: "INVALID_INPUT", message: "Invalid exchange rate." });
      }
      patch.exchangeRate = updates.exchangeRate;
    }

    if (updates.categoryId !== undefined) {
      if (updates.categoryId === null) {
        patch.categoryId = undefined;
      } else {
        const category = await ctx.db.get(updates.categoryId);
        if (!category || category.workspaceId !== workspace._id) {
          throw new ConvexError({ code: "INVALID_INPUT", message: "Unknown category." });
        }
        record("category", receipt.categoryId, updates.categoryId);
        patch.categoryId = updates.categoryId;
      }
    }

    if (updates.cardLast4 !== undefined) {
      if (updates.cardLast4 && !/^\d{4}$/.test(updates.cardLast4)) {
        throw new ConvexError({
          code: "INVALID_INPUT",
          message: "Card last 4 must be four digits.",
        });
      }
      patch.cardLast4 = updates.cardLast4 || undefined;
    }

    for (const field of [
      "paymentMethod", "invoiceNumber", "receiptNumber", "businessNumber",
      "address", "phone", "website", "email", "notes", "projectName",
    ] as const) {
      const value = updates[field];
      if (value === undefined) continue;
      record(field, receipt[field], value);
      patch[field] = typeof value === "string" ? value.trim().slice(0, 2000) || undefined : value;
    }

    for (const field of ["taxDeductible", "reimbursable", "classification"] as const) {
      const value = updates[field];
      if (value === undefined) continue;
      record(field, receipt[field], value);
      patch[field] = value;
    }

    for (const field of ["latitude", "longitude"] as const) {
      const value = updates[field];
      if (value === undefined) continue;
      patch[field] = value;
    }

    if (updates.items !== undefined) {
      patch.items = updates.items.slice(0, 200).map((item) => ({
        description: item.description.trim().slice(0, 300),
        quantity: item.quantity,
        unitPriceCents: item.unitPriceCents ? Math.round(item.unitPriceCents) : undefined,
        totalCents: Math.round(item.totalCents),
      }));
      record("items", `${receipt.items.length} items`, `${updates.items.length} items`);
    }

    // Any human edit clears the low-confidence flag on the touched fields.
    const editedFields = new Set(changes.map((change) => change.field));
    const remainingLowConfidence = receipt.lowConfidenceFields.filter(
      (field) => !editedFields.has(field) && !editedFields.has(`${field}Cents`),
    );
    patch.lowConfidenceFields = remainingLowConfidence;

    const nextAmount = (patch.amountCents as number | undefined) ?? receipt.amountCents;
    const nextRate = (patch.exchangeRate as number | undefined) ?? receipt.exchangeRate;
    patch.baseAmountCents = Math.round(nextAmount * nextRate);

    patch.status = computeReceiptStatus({
      merchant: (patch.merchant as string | undefined) ?? receipt.merchant,
      amountCents: nextAmount,
      date: (patch.date as string | undefined) ?? receipt.date,
      lowConfidenceFields: remainingLowConfidence,
    });

    await ctx.db.patch(receiptId, patch);
    await refreshSearchText(ctx, receiptId);

    if (changes.length > 0) {
      await ctx.db.insert("receiptVersions", {
        receiptId,
        workspaceId: workspace._id,
        editedBy: user._id,
        changes,
      });
      await writeActivity(ctx, {
        workspaceId: workspace._id,
        receiptId,
        actorId: user._id,
        type: "edited",
        summary: `Updated ${changes.map((change) => change.field).join(", ")}`,
      });
    }

    return null;
  },
});

export const markReviewed = mutation({
  args: { receiptId: v.id("receipts"), reviewed: v.boolean() },
  handler: async (ctx, args) => {
    const context = await requireReceipt(ctx, args.receiptId);
    assertCanEditReceipt(context, context.receipt);

    await ctx.db.patch(args.receiptId, {
      reviewedAt: args.reviewed ? Date.now() : undefined,
      reviewedBy: args.reviewed ? context.user._id : undefined,
      status: args.reviewed ? "ready" : context.receipt.status,
      lowConfidenceFields: args.reviewed ? [] : context.receipt.lowConfidenceFields,
    });

    await writeActivity(ctx, {
      workspaceId: context.workspace._id,
      receiptId: args.receiptId,
      actorId: context.user._id,
      type: args.reviewed ? "reviewed" : "unreviewed",
      summary: args.reviewed ? "Marked as reviewed" : "Reopened for review",
    });

    return null;
  },
});

export const setArchived = mutation({
  args: { receiptIds: v.array(v.id("receipts")), archived: v.boolean() },
  handler: async (ctx, args) => {
    for (const receiptId of args.receiptIds) {
      const context = await requireReceipt(ctx, receiptId);
      assertCanEditReceipt(context, context.receipt);
      await ctx.db.patch(receiptId, { isArchived: args.archived });
      await writeActivity(ctx, {
        workspaceId: context.workspace._id,
        receiptId,
        actorId: context.user._id,
        type: args.archived ? "archived" : "unarchived",
        summary: args.archived ? "Archived" : "Restored from archive",
      });
    }
    return null;
  },
});

/** Soft delete — recoverable from trash until the retention sweep purges it. */
export const remove = mutation({
  args: { receiptIds: v.array(v.id("receipts")) },
  handler: async (ctx, args) => {
    for (const receiptId of args.receiptIds) {
      const context = await requireReceipt(ctx, receiptId);
      const isOwn = context.receipt.uploaderId === context.user._id;
      assertCapability(context.member.role, isOwn ? "receipt.deleteOwn" : "receipt.deleteAny");

      await ctx.db.patch(receiptId, { deletedAt: Date.now() });
      await writeAudit(ctx, {
        workspaceId: context.workspace._id,
        actorId: context.user._id,
        action: "receipt.deleted",
        entityType: "receipt",
        entityId: receiptId,
      });
    }
    return null;
  },
});

export const restore = mutation({
  args: { receiptIds: v.array(v.id("receipts")) },
  handler: async (ctx, args) => {
    for (const receiptId of args.receiptIds) {
      const context = await requireReceipt(ctx, receiptId, { includeDeleted: true });
      assertCanEditReceipt(context, context.receipt);
      await ctx.db.patch(receiptId, { deletedAt: undefined });
      await writeActivity(ctx, {
        workspaceId: context.workspace._id,
        receiptId,
        actorId: context.user._id,
        type: "restored",
        summary: "Restored from trash",
      });
    }
    return null;
  },
});

export const purge = mutation({
  args: { receiptIds: v.array(v.id("receipts")) },
  handler: async (ctx, args) => {
    for (const receiptId of args.receiptIds) {
      const context = await requireReceipt(ctx, receiptId, { includeDeleted: true });
      const isOwn = context.receipt.uploaderId === context.user._id;
      assertCapability(context.member.role, isOwn ? "receipt.deleteOwn" : "receipt.deleteAny");

      await writeAudit(ctx, {
        workspaceId: context.workspace._id,
        actorId: context.user._id,
        action: "receipt.purged",
        entityType: "receipt",
        entityId: receiptId,
        meta: { merchant: context.receipt.merchant, amountCents: context.receipt.amountCents },
      });
      await purgeReceipt(ctx, context.receipt);
    }
    return null;
  },
});

export const duplicate = mutation({
  args: { receiptId: v.id("receipts") },
  handler: async (ctx, args) => {
    const { receipt, user, workspace, member } = await requireReceipt(ctx, args.receiptId);
    assertCapability(member.role, "receipt.create");

    const { _id, _creationTime, ...rest } = receipt;
    const copyId = await ctx.db.insert("receipts", {
      ...rest,
      merchant: `${receipt.merchant} (copy)`,
      uploaderId: user._id,
      reviewedAt: undefined,
      reviewedBy: undefined,
      approvalStatus: "none",
      duplicateOfId: undefined,
      deletedAt: undefined,
      // Pages are not copied: the copy references no blobs, so it owns no bytes.
      pageCount: 0,
      storageBytes: 0,
      thumbnailId: undefined,
    });

    const tagLinks = await ctx.db
      .query("receiptTags")
      .withIndex("by_receipt", (q) => q.eq("receiptId", receipt._id))
      .collect();
    for (const link of tagLinks) {
      await ctx.db.insert("receiptTags", {
        receiptId: copyId,
        tagId: link.tagId,
        workspaceId: workspace._id,
      });
      const tag = await ctx.db.get(link.tagId);
      if (tag) await ctx.db.patch(tag._id, { usageCount: tag.usageCount + 1 });
    }

    await adjustWorkspaceUsage(ctx, workspace._id, { receipts: 1 });
    await refreshSearchText(ctx, copyId);
    await writeActivity(ctx, {
      workspaceId: workspace._id,
      receiptId: copyId,
      actorId: user._id,
      type: "duplicated",
      summary: `Duplicated from ${receipt.merchant}`,
    });

    return copyId;
  },
});

export const bulkUpdate = mutation({
  args: {
    receiptIds: v.array(v.id("receipts")),
    categoryId: v.optional(v.union(v.id("categories"), v.null())),
    addTagIds: v.optional(v.array(v.id("tags"))),
    removeTagIds: v.optional(v.array(v.id("tags"))),
    addFolderIds: v.optional(v.array(v.id("folders"))),
    removeFolderIds: v.optional(v.array(v.id("folders"))),
    taxDeductible: v.optional(v.boolean()),
    classification: v.optional(v.union(v.literal("business"), v.literal("personal"))),
    reimbursable: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    if (args.receiptIds.length > 500) {
      throw new ConvexError({
        code: "TOO_MANY",
        message: "Update at most 500 receipts at a time.",
      });
    }

    for (const receiptId of args.receiptIds) {
      const context = await requireReceipt(ctx, receiptId);
      assertCanEditReceipt(context, context.receipt);
      const { workspace, user } = context;

      const patch: Record<string, unknown> = {};
      if (args.categoryId !== undefined) {
        patch.categoryId = args.categoryId === null ? undefined : args.categoryId;
      }
      if (args.taxDeductible !== undefined) patch.taxDeductible = args.taxDeductible;
      if (args.classification !== undefined) patch.classification = args.classification;
      if (args.reimbursable !== undefined) patch.reimbursable = args.reimbursable;
      if (Object.keys(patch).length > 0) await ctx.db.patch(receiptId, patch);

      for (const tagId of args.addTagIds ?? []) {
        const existing = await ctx.db
          .query("receiptTags")
          .withIndex("by_receipt_tag", (q) => q.eq("receiptId", receiptId).eq("tagId", tagId))
          .unique();
        if (existing) continue;
        const tag = await ctx.db.get(tagId);
        if (!tag || tag.workspaceId !== workspace._id) continue;
        await ctx.db.insert("receiptTags", { receiptId, tagId, workspaceId: workspace._id });
        await ctx.db.patch(tagId, { usageCount: tag.usageCount + 1 });
      }

      for (const tagId of args.removeTagIds ?? []) {
        const existing = await ctx.db
          .query("receiptTags")
          .withIndex("by_receipt_tag", (q) => q.eq("receiptId", receiptId).eq("tagId", tagId))
          .unique();
        if (!existing) continue;
        await ctx.db.delete(existing._id);
        const tag = await ctx.db.get(tagId);
        if (tag) await ctx.db.patch(tagId, { usageCount: Math.max(0, tag.usageCount - 1) });
      }

      for (const folderId of args.addFolderIds ?? []) {
        const existing = await ctx.db
          .query("receiptFolders")
          .withIndex("by_receipt_folder", (q) =>
            q.eq("receiptId", receiptId).eq("folderId", folderId),
          )
          .unique();
        if (existing) continue;
        const folder = await ctx.db.get(folderId);
        if (!folder || folder.workspaceId !== workspace._id) continue;
        await ctx.db.insert("receiptFolders", {
          receiptId,
          folderId,
          workspaceId: workspace._id,
        });
        await ctx.db.patch(folderId, { receiptCount: folder.receiptCount + 1 });
      }

      for (const folderId of args.removeFolderIds ?? []) {
        const existing = await ctx.db
          .query("receiptFolders")
          .withIndex("by_receipt_folder", (q) =>
            q.eq("receiptId", receiptId).eq("folderId", folderId),
          )
          .unique();
        if (!existing) continue;
        await ctx.db.delete(existing._id);
        const folder = await ctx.db.get(folderId);
        if (folder) {
          await ctx.db.patch(folderId, {
            receiptCount: Math.max(0, folder.receiptCount - 1),
          });
        }
      }

      await refreshSearchText(ctx, receiptId);
      await writeActivity(ctx, {
        workspaceId: workspace._id,
        receiptId,
        actorId: user._id,
        type: "bulk_updated",
        summary: "Updated in bulk",
      });
    }

    return null;
  },
});

export const addComment = mutation({
  args: { receiptId: v.id("receipts"), body: v.string() },
  handler: async (ctx, args) => {
    const { receipt, user, workspace } = await requireReceipt(ctx, args.receiptId);
    const body = args.body.trim();

    if (!body) {
      throw new ConvexError({ code: "INVALID_INPUT", message: "Comment cannot be empty." });
    }

    const commentId = await ctx.db.insert("comments", {
      receiptId: args.receiptId,
      workspaceId: workspace._id,
      authorId: user._id,
      body: body.slice(0, 4000),
    });

    await writeActivity(ctx, {
      workspaceId: workspace._id,
      receiptId: args.receiptId,
      actorId: user._id,
      type: "commented",
      summary: "Added a comment",
    });

    // Keep the uploader in the loop when someone else comments.
    if (receipt.uploaderId !== user._id) {
      await ctx.db.insert("notifications", {
        userId: receipt.uploaderId,
        workspaceId: workspace._id,
        type: "comment",
        title: `${user.name ?? "Someone"} commented`,
        body: body.slice(0, 140),
        link: `/dashboard/receipts/${args.receiptId}`,
      });
    }

    return commentId;
  },
});

export const removeComment = mutation({
  args: { commentId: v.id("comments") },
  handler: async (ctx, args) => {
    const comment = await ctx.db.get(args.commentId);
    if (!comment) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Comment not found." });
    }
    const { user, member } = await requireMember(ctx, comment.workspaceId);

    if (comment.authorId !== user._id && member.role !== "owner" && member.role !== "admin") {
      throw new ConvexError({
        code: "FORBIDDEN",
        message: "You can only delete your own comments.",
      });
    }

    await ctx.db.patch(args.commentId, { deletedAt: Date.now() });
    return null;
  },
});

export const dismissDuplicate = mutation({
  args: { receiptId: v.id("receipts") },
  handler: async (ctx, args) => {
    const context = await requireReceipt(ctx, args.receiptId);
    assertCanEditReceipt(context, context.receipt);
    await ctx.db.patch(args.receiptId, { duplicateOfId: undefined });
    return null;
  },
});

/** Re-runs duplicate detection after OCR fills in merchant and amount. */
export const flagDuplicates = internalMutation({
  args: { receiptId: v.id("receipts") },
  handler: async (ctx, args) => {
    const receipt = await ctx.db.get(args.receiptId);
    if (!receipt) return null;

    const duplicateOfId = await findDuplicate(ctx, receipt);
    if (duplicateOfId) {
      await ctx.db.patch(args.receiptId, { duplicateOfId });
      await writeActivity(ctx, {
        workspaceId: receipt.workspaceId,
        receiptId: args.receiptId,
        type: "duplicate_flagged",
        summary: "Possible duplicate detected",
      });
    }
    return null;
  },
});

/** Distinct merchants for filter chips and autocomplete. */
export const merchants = query({
  args: {},
  handler: async (ctx) => {
    const { workspace } = await requireActiveWorkspace(ctx);
    const receipts = await ctx.db
      .query("receipts")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", workspace._id))
      .collect();

    const byMerchant = new Map<string, { name: string; count: number; totalCents: number }>();
    for (const receipt of receipts) {
      if (receipt.deletedAt !== undefined || !receipt.merchant) continue;
      const existing = byMerchant.get(receipt.merchantNormalized);
      if (existing) {
        existing.count += 1;
        existing.totalCents += receipt.baseAmountCents;
      } else {
        byMerchant.set(receipt.merchantNormalized, {
          name: receipt.merchant,
          count: 1,
          totalCents: receipt.baseAmountCents,
        });
      }
    }

    return [...byMerchant.values()].sort((a, b) => b.count - a.count);
  },
});
