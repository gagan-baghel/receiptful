import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { internalMutation, internalQuery } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import { fieldConfidenceValidator, lineItemValidator } from "./schema";
import { notifyUser, writeActivity } from "./model/guards";
import {
  computeReceiptStatus,
  deriveLowConfidenceFields,
  isSaneAmount,
  isSupportedCurrency,
  isValidIsoDate,
  normalizeMerchant,
  suggestCategory,
  todayIso,
} from "./model/lib";
import { convertForWorkspace } from "./model/fx";
import { refreshSearchText } from "./model/receipts";
import { contributionOf, syncRollups } from "./model/rollups";

/**
 * Fields a human has already changed by hand. Every edit writes a
 * `receiptVersions` row, so this is an exact record of what the user has
 * claimed ownership of — extraction must never write over any of it.
 */
async function humanEditedFields(
  ctx: MutationCtx,
  receiptId: Id<"receipts">,
): Promise<Set<string>> {
  const versions = await ctx.db
    .query("receiptVersions")
    .withIndex("by_receipt", (q) => q.eq("receiptId", receiptId))
    .collect();

  const edited = new Set<string>();
  for (const version of versions) {
    for (const change of version.changes) edited.add(change.field);
  }
  return edited;
}

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
    promptVersion: v.string(),
    rawText: v.optional(v.string()),
    durationMs: v.number(),
    inputTokens: v.optional(v.number()),
    outputTokens: v.optional(v.number()),
    attempts: v.optional(v.number()),
    /** Deterministic checks the action ran against the model's own numbers. */
    inconsistencies: v.optional(v.array(v.string())),
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

    const workspace = await ctx.db.get(receipt.workspaceId);
    if (!workspace) return null;

    // Every human edit writes a receiptVersions row naming the fields it
    // touched. Extraction may fill a blank, but it must never overwrite a
    // value a person already decided — including date, currency and payment
    // method, which this merge used to clobber unconditionally.
    const versions = await ctx.db
      .query("receiptVersions")
      .withIndex("by_receipt", (q) => q.eq("receiptId", args.receiptId))
      .collect();

    const humanEdited = new Set<string>();
    for (const version of versions) {
      for (const change of version.changes) humanEdited.add(change.field);
    }
    const locked = (field: string) => humanEdited.has(field);

    const { fields } = args;
    const patch: Record<string, unknown> = {};

    if (fields.merchant && !receipt.merchant.trim() && !locked("merchant")) {
      patch.merchant = fields.merchant.slice(0, 200);
      patch.merchantNormalized = normalizeMerchant(fields.merchant);
    }
    if (
      fields.amountCents !== undefined &&
      isSaneAmount(fields.amountCents) &&
      receipt.amountCents <= 0 &&
      !locked("amountCents")
    ) {
      patch.amountCents = Math.round(fields.amountCents);
    }
    for (const key of ["subtotalCents", "taxCents", "tipCents"] as const) {
      const value = fields[key];
      if (value === undefined || !isSaneAmount(value)) continue;
      if (receipt[key] === undefined && !locked(key)) patch[key] = Math.round(value);
    }
    if (
      fields.currency &&
      isSupportedCurrency(fields.currency.toUpperCase()) &&
      !locked("currency")
    ) {
      patch.currency = fields.currency.toUpperCase();
    }
    if (fields.date && isValidIsoDate(fields.date) && !locked("date")) {
      patch.date = fields.date;
    }
    if (fields.time && /^\d{2}:\d{2}$/.test(fields.time) && !locked("time")) {
      patch.time = fields.time;
    }
    if (fields.cardLast4 && /^\d{4}$/.test(fields.cardLast4) && !locked("cardLast4")) {
      patch.cardLast4 = fields.cardLast4;
    }

    const methods = ["card", "cash", "bank_transfer", "wallet", "cheque", "other"];
    if (
      fields.paymentMethod &&
      methods.includes(fields.paymentMethod) &&
      receipt.paymentMethod === "unknown" &&
      !locked("paymentMethod")
    ) {
      patch.paymentMethod = fields.paymentMethod;
    }

    for (const key of [
      "invoiceNumber", "receiptNumber", "businessNumber",
      "address", "phone", "website", "email",
    ] as const) {
      const value = fields[key];
      if (value && !receipt[key] && !locked(key)) patch[key] = value.slice(0, 500);
    }

    if (fields.items?.length && receipt.items.length === 0 && !locked("items")) {
      patch.items = fields.items.slice(0, 200).map((item) => ({
        description: item.description.slice(0, 300),
        quantity: item.quantity,
        unitPriceCents: item.unitPriceCents ? Math.round(item.unitPriceCents) : undefined,
        totalCents: Math.max(0, Math.round(item.totalCents)),
      }));
    }

    // A field that failed a deterministic cross-check is low-confidence no
    // matter how sure the model claimed to be.
    const inconsistencies = args.inconsistencies ?? [];
    const lowConfidenceFields = [
      ...new Set([
        ...deriveLowConfidenceFields(args.fieldConfidences),
        ...inconsistencies,
      ]),
    ].filter((field) => !locked(field));

    patch.lowConfidenceFields = lowConfidenceFields;
    patch.ocrConfidence = inconsistencies.length > 0
      ? Math.min(args.overallConfidence, 0.5)
      : args.overallConfidence;

    const merchant = (patch.merchant as string | undefined) ?? receipt.merchant;
    const amountCents = (patch.amountCents as number | undefined) ?? receipt.amountCents;
    const date = (patch.date as string | undefined) ?? receipt.date;
    const currency = (patch.currency as string | undefined) ?? receipt.currency;

    const converted = await convertForWorkspace(ctx, {
      amountCents,
      currency,
      baseCurrency: workspace.baseCurrency,
      overrideRate: currency === receipt.currency ? receipt.exchangeRate : undefined,
    });
    patch.exchangeRate = converted.exchangeRate;
    patch.baseAmountCents = converted.baseAmountCents;

    // Auto-categorize from the workspace's own categories and their keywords.
    if (!receipt.categoryId && !locked("category")) {
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
        });

        if (suggestion) {
          patch.categoryId = suggestion.categoryId;
          const category = categories.find((c) => c._id === suggestion.categoryId);
          if (category) {
            patch.taxDeductible = category.taxTreatment !== "non_deductible";
          }
          // A guessed category is flagged so the reviewer knows it was inferred
          // rather than chosen — it drives a tax claim.
          if (!lowConfidenceFields.includes("category")) {
            lowConfidenceFields.push("category");
            patch.lowConfidenceFields = lowConfidenceFields;
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

    const rollupBefore = contributionOf(receipt);
    await ctx.db.patch(args.receiptId, patch);
    await syncRollups(ctx, rollupBefore, args.receiptId);

    const existing = await ctx.db
      .query("ocrResults")
      .withIndex("by_receipt", (q) => q.eq("receiptId", args.receiptId))
      .first();

    const ocrRow = {
      status: "succeeded" as const,
      provider: args.provider,
      promptVersion: args.promptVersion,
      rawText: args.rawText?.slice(0, 50000),
      overallConfidence: patch.ocrConfidence as number,
      fieldConfidences: args.fieldConfidences,
      durationMs: args.durationMs,
      inputTokens: args.inputTokens,
      outputTokens: args.outputTokens,
      attempts: args.attempts,
      inconsistencies,
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
      summary: inconsistencies.length
        ? `Extracted with ${inconsistencies.length} field${
            inconsistencies.length === 1 ? "" : "s"
          } needing a check`
        : `Extracted ${args.fieldConfidences.length} fields (${Math.round(
            (patch.ocrConfidence as number) * 100,
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
