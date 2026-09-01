import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { buildSearchText, normalizeMerchant } from "./lib";
import { applyRollupDelta, contributionOf } from "./rollups";

export type ReceiptListItem = Awaited<ReturnType<typeof serializeReceipt>>;

/**
 * Shapes a receipt for list/grid rendering. Resolves the joins the UI always
 * needs (category, tags, thumbnail) and nothing else — detail views load more.
 */
export async function serializeReceipt(ctx: QueryCtx, receipt: Doc<"receipts">) {
  const [category, tagLinks, thumbnailUrl] = await Promise.all([
    receipt.categoryId ? ctx.db.get(receipt.categoryId) : Promise.resolve(null),
    ctx.db
      .query("receiptTags")
      .withIndex("by_receipt", (q) => q.eq("receiptId", receipt._id))
      .collect(),
    receipt.thumbnailId ? ctx.storage.getUrl(receipt.thumbnailId) : Promise.resolve(null),
  ]);

  const tags = (
    await Promise.all(tagLinks.map((link) => ctx.db.get(link.tagId)))
  ).filter((tag): tag is Doc<"tags"> => tag !== null);

  return {
    _id: receipt._id,
    status: receipt.status,
    merchant: receipt.merchant,
    amountCents: receipt.amountCents,
    baseAmountCents: receipt.baseAmountCents,
    taxCents: receipt.taxCents,
    subtotalCents: receipt.subtotalCents,
    currency: receipt.currency,
    date: receipt.date,
    time: receipt.time,
    paymentMethod: receipt.paymentMethod,
    cardLast4: receipt.cardLast4,
    notes: receipt.notes,
    categoryId: receipt.categoryId,
    category: category
      ? { _id: category._id, name: category.name, color: category.color, icon: category.icon }
      : null,
    tags: tags.map((tag) => ({ _id: tag._id, name: tag.name, color: tag.color })),
    taxDeductible: receipt.taxDeductible,
    classification: receipt.classification,
    reimbursable: receipt.reimbursable,
    approvalStatus: receipt.approvalStatus,
    ocrConfidence: receipt.ocrConfidence,
    lowConfidenceFields: receipt.lowConfidenceFields,
    reviewedAt: receipt.reviewedAt,
    duplicateOfId: receipt.duplicateOfId,
    isArchived: receipt.isArchived,
    deletedAt: receipt.deletedAt,
    pageCount: receipt.pageCount,
    thumbnailUrl,
    uploaderId: receipt.uploaderId,
    createdAt: receipt._creationTime,
    projectName: receipt.projectName,
    invoiceNumber: receipt.invoiceNumber,
  };
}

/** Recomputes the denormalized search haystack after any field edit. */
export async function refreshSearchText(
  ctx: MutationCtx,
  receiptId: Id<"receipts">,
) {
  const receipt = await ctx.db.get(receiptId);
  if (!receipt) return;

  const [category, tagLinks, folderLinks, ocr] = await Promise.all([
    receipt.categoryId ? ctx.db.get(receipt.categoryId) : Promise.resolve(null),
    ctx.db
      .query("receiptTags")
      .withIndex("by_receipt", (q) => q.eq("receiptId", receiptId))
      .collect(),
    ctx.db
      .query("receiptFolders")
      .withIndex("by_receipt", (q) => q.eq("receiptId", receiptId))
      .collect(),
    ctx.db
      .query("ocrResults")
      .withIndex("by_receipt", (q) => q.eq("receiptId", receiptId))
      .first(),
  ]);

  const tags = (await Promise.all(tagLinks.map((link) => ctx.db.get(link.tagId))))
    .filter((tag): tag is Doc<"tags"> => tag !== null)
    .map((tag) => tag.name);

  const folders = (
    await Promise.all(folderLinks.map((link) => ctx.db.get(link.folderId)))
  )
    .filter((folder): folder is Doc<"folders"> => folder !== null)
    .map((folder) => folder.name);

  const searchText = buildSearchText({
    merchant: receipt.merchant,
    notes: receipt.notes,
    items: receipt.items,
    rawOcrText: ocr?.rawText,
    tags,
    categoryName: category?.name,
    folderNames: folders,
    invoiceNumber: receipt.invoiceNumber,
    receiptNumber: receipt.receiptNumber,
    address: receipt.address,
    paymentMethod: receipt.paymentMethod,
    currency: receipt.currency,
    cardLast4: receipt.cardLast4,
    date: receipt.date,
    amountLabel: (receipt.amountCents / 100).toFixed(2),
  });

  await ctx.db.patch(receiptId, {
    searchText,
    merchantNormalized: normalizeMerchant(receipt.merchant),
  });
}

/**
 * Flags near-identical receipts: same normalized merchant, same amount, within
 * three days. Catches the common "uploaded the same photo twice" case without
 * blocking legitimate repeat purchases.
 */
export async function findDuplicate(
  ctx: QueryCtx,
  receipt: Doc<"receipts">,
): Promise<Id<"receipts"> | null> {
  if (!receipt.merchantNormalized || receipt.amountCents <= 0) return null;

  const candidates = await ctx.db
    .query("receipts")
    .withIndex("by_workspace_merchant", (q) =>
      q
        .eq("workspaceId", receipt.workspaceId)
        .eq("merchantNormalized", receipt.merchantNormalized),
    )
    .take(50);

  const receiptTime = new Date(`${receipt.date}T00:00:00Z`).getTime();
  const threeDays = 3 * 24 * 60 * 60 * 1000;

  for (const candidate of candidates) {
    if (candidate._id === receipt._id) continue;
    if (candidate.deletedAt !== undefined) continue;
    if (candidate.amountCents !== receipt.amountCents) continue;

    const candidateTime = new Date(`${candidate.date}T00:00:00Z`).getTime();
    if (Math.abs(candidateTime - receiptTime) <= threeDays) {
      return candidate._id;
    }
  }

  return null;
}

/** Keeps workspace.receiptCount and storageUsedBytes truthful. */
export async function adjustWorkspaceUsage(
  ctx: MutationCtx,
  workspaceId: Id<"workspaces">,
  delta: { receipts?: number; bytes?: number },
) {
  const workspace = await ctx.db.get(workspaceId);
  if (!workspace) return;

  await ctx.db.patch(workspaceId, {
    receiptCount: Math.max(0, workspace.receiptCount + (delta.receipts ?? 0)),
    storageUsedBytes: Math.max(0, workspace.storageUsedBytes + (delta.bytes ?? 0)),
  });
}

/** Removes a receipt and every row that references it, including blobs. */
export async function purgeReceipt(ctx: MutationCtx, receipt: Doc<"receipts">) {
  await applyRollupDelta(ctx, contributionOf(receipt), null);

  const [pages, tagLinks, folderLinks, comments, versions, activity, ocr, approvals] =
    await Promise.all([
      ctx.db
        .query("receiptPages")
        .withIndex("by_receipt", (q) => q.eq("receiptId", receipt._id))
        .collect(),
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
        .collect(),
      ctx.db
        .query("activity")
        .withIndex("by_receipt", (q) => q.eq("receiptId", receipt._id))
        .collect(),
      ctx.db
        .query("ocrResults")
        .withIndex("by_receipt", (q) => q.eq("receiptId", receipt._id))
        .collect(),
      ctx.db
        .query("approvals")
        .withIndex("by_receipt", (q) => q.eq("receiptId", receipt._id))
        .collect(),
    ]);

  for (const page of pages) {
    await ctx.storage.delete(page.storageId);
    await ctx.db.delete(page._id);
  }

  if (receipt.thumbnailId) {
    await ctx.storage.delete(receipt.thumbnailId).catch(() => undefined);
  }

  for (const link of tagLinks) {
    const tag = await ctx.db.get(link.tagId);
    if (tag) await ctx.db.patch(tag._id, { usageCount: Math.max(0, tag.usageCount - 1) });
    await ctx.db.delete(link._id);
  }

  for (const link of folderLinks) {
    const folder = await ctx.db.get(link.folderId);
    if (folder) {
      await ctx.db.patch(folder._id, {
        receiptCount: Math.max(0, folder.receiptCount - 1),
      });
    }
    await ctx.db.delete(link._id);
  }

  for (const row of [...comments, ...versions, ...activity, ...ocr, ...approvals]) {
    await ctx.db.delete(row._id);
  }

  await adjustWorkspaceUsage(ctx, receipt.workspaceId, {
    receipts: -1,
    bytes: -receipt.storageBytes,
  });

  await ctx.db.delete(receipt._id);
}
