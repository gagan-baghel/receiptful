import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import { fieldConfidenceValidator, lineItemValidator } from "./schema";
import { notifyUser, writeActivity } from "./model/guards";
import {
  computeReceiptStatus,
  deriveLowConfidenceFields,
  isValidIsoDate,
  normalizeMerchant,
  suggestCategory,
  todayIso,
} from "./model/lib";
import { refreshSearchText } from "./model/receipts";

/** Everything the OCR action needs, in one round trip. */
export const loadForOcr = internalQuery({
  args: { receiptId: v.id("receipts") },
  handler: async (ctx, args) => {
    const receipt = await ctx.db.get(args.receiptId);
    if (!receipt) return null;

    const pages = await ctx.db
      .query("receiptPages")
      .withIndex("by_receipt", (q) => q.eq("receiptId", args.receiptId))
      .collect();

    const settings = await ctx.db
      .query("settings")
      .withIndex("by_user", (q) => q.eq("userId", receipt.uploaderId))
      .unique();

    const workspace = await ctx.db.get(receipt.workspaceId);

    return {
      receiptId: receipt._id,
      workspaceId: receipt.workspaceId,
      baseCurrency: workspace?.baseCurrency ?? "USD",
      taxLabel: workspace?.taxLabel ?? "Tax",
      autoCategorize: settings?.autoCategorize ?? true,
      pages: pages
        .sort((a, b) => a.order - b.order)
        .slice(0, 8)
        .map((page) => ({ storageId: page.storageId, mimeType: page.mimeType })),
    };
  },
});

export const markProcessing = internalMutation({
  args: { receiptId: v.id("receipts"), provider: v.string() },
  handler: async (ctx, args) => {
    const receipt = await ctx.db.get(args.receiptId);
    if (!receipt) return null;

    await ctx.db.patch(args.receiptId, { status: "processing" });

    const existing = await ctx.db
      .query("ocrResults")
      .withIndex("by_receipt", (q) => q.eq("receiptId", args.receiptId))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        status: "pending",
        provider: args.provider,
        error: undefined,
      });
      return null;
    }

    await ctx.db.insert("ocrResults", {
      receiptId: args.receiptId,
      workspaceId: receipt.workspaceId,
      provider: args.provider,
      status: "pending",
      overallConfidence: 0,
      fieldConfidences: [],
    });
    return null;
  },
});

/**
 * Applies extracted fields to the receipt. User-edited values win: any field the
 * uploader already filled in by hand is never overwritten by OCR.
 */
export const applyExtraction = internalMutation({
  args: {
    receiptId: v.id("receipts"),
    provider: v.string(),
    rawText: v.optional(v.string()),
    durationMs: v.number(),
    fields: v.object({
      merchant: v.optional(v.string()),
      amountCents: v.optional(v.number()),
      subtotalCents: v.optional(v.number()),
      taxCents: v.optional(v.number()),
      tipCents: v.optional(v.number()),
      currency: v.optional(v.string()),
      date: v.optional(v.string()),
      time: v.optional(v.string()),
      paymentMethod: v.optional(v.string()),
      cardLast4: v.optional(v.string()),
      invoiceNumber: v.optional(v.string()),
      receiptNumber: v.optional(v.string()),
      businessNumber: v.optional(v.string()),
      address: v.optional(v.string()),
      phone: v.optional(v.string()),
      website: v.optional(v.string()),
      email: v.optional(v.string()),
      items: v.optional(v.array(lineItemValidator)),
    }),
    fieldConfidences: v.array(fieldConfidenceValidator),
    overallConfidence: v.number(),
  },
  handler: async (ctx, args) => {
    const receipt = await ctx.db.get(args.receiptId);
    if (!receipt) return null;

    const { fields } = args;
    const patch: Record<string, unknown> = {};

    if (fields.merchant && !receipt.merchant.trim()) {
      patch.merchant = fields.merchant.slice(0, 200);
      patch.merchantNormalized = normalizeMerchant(fields.merchant);
    }
    if (fields.amountCents !== undefined && receipt.amountCents <= 0) {
      patch.amountCents = Math.max(0, Math.round(fields.amountCents));
    }
    for (const key of ["subtotalCents", "taxCents", "tipCents"] as const) {
      const value = fields[key];
      if (value !== undefined && receipt[key] === undefined) {
        patch[key] = Math.max(0, Math.round(value));
      }
    }
    if (fields.currency && fields.currency.length === 3) {
      patch.currency = fields.currency.toUpperCase();
    }
    if (fields.date && isValidIsoDate(fields.date)) {
      patch.date = fields.date;
    }
    if (fields.time && /^\d{2}:\d{2}$/.test(fields.time)) patch.time = fields.time;
    if (fields.cardLast4 && /^\d{4}$/.test(fields.cardLast4)) {
      patch.cardLast4 = fields.cardLast4;
    }

    const methods = ["card", "cash", "bank_transfer", "wallet", "cheque", "other"];
    if (fields.paymentMethod && methods.includes(fields.paymentMethod)) {
      patch.paymentMethod = fields.paymentMethod;
    }

    for (const key of [
      "invoiceNumber", "receiptNumber", "businessNumber",
      "address", "phone", "website", "email",
    ] as const) {
      const value = fields[key];
      if (value && !receipt[key]) patch[key] = value.slice(0, 500);
    }

    if (fields.items?.length && receipt.items.length === 0) {
      patch.items = fields.items.slice(0, 200).map((item) => ({
        description: item.description.slice(0, 300),
        quantity: item.quantity,
        unitPriceCents: item.unitPriceCents ? Math.round(item.unitPriceCents) : undefined,
        totalCents: Math.round(item.totalCents),
      }));
    }

    const lowConfidenceFields = deriveLowConfidenceFields(args.fieldConfidences);
    patch.lowConfidenceFields = lowConfidenceFields;
    patch.ocrConfidence = args.overallConfidence;

    const merchant = (patch.merchant as string | undefined) ?? receipt.merchant;
    const amountCents = (patch.amountCents as number | undefined) ?? receipt.amountCents;
    const date = (patch.date as string | undefined) ?? receipt.date;
    patch.baseAmountCents = Math.round(amountCents * receipt.exchangeRate);

    // Auto-categorize from the workspace's own categories and their keywords.
    if (!receipt.categoryId) {
      const settings = await ctx.db
        .query("settings")
        .withIndex("by_user", (q) => q.eq("userId", receipt.uploaderId))
        .unique();

      if (settings?.autoCategorize !== false) {
        const categories = await ctx.db
          .query("categories")
          .withIndex("by_workspace", (q) => q.eq("workspaceId", receipt.workspaceId))
          .collect();

        const suggestion = suggestCategory(categories, {
          merchant,
          items: (patch.items as { description: string }[] | undefined) ?? receipt.items,
          rawText: args.rawText,
        });

        if (suggestion) {
          patch.categoryId = suggestion.categoryId;
          const category = categories.find((c) => c._id === suggestion.categoryId);
          if (category) {
            patch.taxDeductible = category.taxTreatment !== "non_deductible";
          }
        }
      }
    }

    patch.status = computeReceiptStatus({
      merchant,
      amountCents,
      date,
      lowConfidenceFields,
    });

    await ctx.db.patch(args.receiptId, patch);

    const existing = await ctx.db
      .query("ocrResults")
      .withIndex("by_receipt", (q) => q.eq("receiptId", args.receiptId))
      .first();

    const ocrRow = {
      status: "succeeded" as const,
      provider: args.provider,
      rawText: args.rawText?.slice(0, 50000),
      overallConfidence: args.overallConfidence,
      fieldConfidences: args.fieldConfidences,
      durationMs: args.durationMs,
      processedAt: Date.now(),
      error: undefined,
    };

    if (existing) {
      await ctx.db.patch(existing._id, ocrRow);
    } else {
      await ctx.db.insert("ocrResults", {
        receiptId: args.receiptId,
        workspaceId: receipt.workspaceId,
        ...ocrRow,
      });
    }

    await refreshSearchText(ctx, args.receiptId);
    await writeActivity(ctx, {
      workspaceId: receipt.workspaceId,
      receiptId: args.receiptId,
      type: "ocr_completed",
      summary: `Extracted ${args.fieldConfidences.length} fields (${Math.round(
        args.overallConfidence * 100,
      )}% confidence)`,
    });

    await notifyUser(ctx, {
      userId: receipt.uploaderId,
      workspaceId: receipt.workspaceId,
      type: "receipt_processed",
      title: "Receipt processed",
      body: `${merchant || "Receipt"} is ready${
        patch.status === "needs_review" ? " — a few fields need your review." : "."
      }`,
      link: `/dashboard/receipts/${args.receiptId}`,
    });

    return null;
  },
});

/**
 * Records an OCR failure. The receipt stays fully usable — it drops into the
 * review queue for manual entry rather than being lost.
 */
export const recordFailure = internalMutation({
  args: {
    receiptId: v.id("receipts"),
    provider: v.string(),
    error: v.string(),
    skipped: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const receipt = await ctx.db.get(args.receiptId);
    if (!receipt) return null;

    await ctx.db.patch(args.receiptId, {
      status: "needs_review",
      lowConfidenceFields: ["merchant", "amount", "date"],
      ocrConfidence: 0,
    });

    const existing = await ctx.db
      .query("ocrResults")
      .withIndex("by_receipt", (q) => q.eq("receiptId", args.receiptId))
      .first();

    const row = {
      status: args.skipped ? ("skipped" as const) : ("failed" as const),
      provider: args.provider,
      error: args.error.slice(0, 1000),
      overallConfidence: 0,
      processedAt: Date.now(),
    };

    if (existing) {
      await ctx.db.patch(existing._id, row);
    } else {
      await ctx.db.insert("ocrResults", {
        receiptId: args.receiptId,
        workspaceId: receipt.workspaceId,
        fieldConfidences: [],
        ...row,
      });
    }

    await writeActivity(ctx, {
      workspaceId: receipt.workspaceId,
      receiptId: args.receiptId,
      type: args.skipped ? "ocr_skipped" : "ocr_failed",
      summary: args.skipped
        ? "Automatic extraction unavailable — enter details manually"
        : `Extraction failed: ${args.error.slice(0, 120)}`,
    });

    if (!args.skipped) {
      await notifyUser(ctx, {
        userId: receipt.uploaderId,
        workspaceId: receipt.workspaceId,
        type: "upload_failed",
        title: "Could not read receipt",
        body: "We couldn't extract the details automatically. Tap to enter them manually.",
        link: `/dashboard/receipts/${args.receiptId}`,
      });
    }

    return null;
  },
});

/** Seeds an empty receipt so manual entry starts from a sane state. */
export const ensureDefaults = internalMutation({
  args: { receiptId: v.id("receipts") },
  handler: async (ctx, args) => {
    const receipt = await ctx.db.get(args.receiptId);
    if (!receipt) return null;
    if (!isValidIsoDate(receipt.date)) {
      await ctx.db.patch(args.receiptId, { date: todayIso() });
    }
    return null;
  },
});
