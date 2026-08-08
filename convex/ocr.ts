"use node";

import Anthropic from "@anthropic-ai/sdk";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalAction } from "./_generated/server";
import { parseAmountToCents } from "./model/lib";

const MODEL = "claude-opus-5";
const PROVIDER = "claude-opus-5";

/** Media types Claude accepts as image blocks. Anything else goes as a document. */
const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);

const EXTRACTION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "merchant", "total", "subtotal", "tax", "tip", "currency", "date", "time",
    "payment_method", "card_last4", "invoice_number", "receipt_number",
    "business_number", "address", "phone", "website", "email", "items",
    "confidence", "full_text",
  ],
  properties: {
    merchant: { type: "string", description: "Business name. Empty string if not visible." },
    total: { type: "string", description: "Grand total as it appears, digits only e.g. '42.50'. Empty if absent." },
    subtotal: { type: "string", description: "Pre-tax subtotal. Empty if absent." },
    tax: { type: "string", description: "Total tax/GST/VAT amount. Empty if absent." },
    tip: { type: "string", description: "Tip or gratuity. Empty if absent." },
    currency: { type: "string", description: "ISO 4217 code inferred from symbol or locale, e.g. USD. Empty if unclear." },
    date: { type: "string", description: "Transaction date as yyyy-mm-dd. Empty if not visible." },
    time: { type: "string", description: "Transaction time as HH:mm, 24-hour. Empty if absent." },
    payment_method: {
      type: "string",
      enum: ["card", "cash", "bank_transfer", "wallet", "cheque", "other", ""],
      description: "How it was paid. Empty if not determinable.",
    },
    card_last4: { type: "string", description: "Last four digits of the card. Empty if absent." },
    invoice_number: { type: "string" },
    receipt_number: { type: "string" },
    business_number: { type: "string", description: "Tax/VAT/GST/ABN registration number." },
    address: { type: "string", description: "Merchant street address on the receipt." },
    phone: { type: "string" },
    website: { type: "string" },
    email: { type: "string" },
    items: {
      type: "array",
      description: "Line items. Empty array if none are itemized.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["description", "quantity", "unit_price", "total"],
        properties: {
          description: { type: "string" },
          quantity: { type: "string", description: "Quantity as written, or empty." },
          unit_price: { type: "string" },
          total: { type: "string" },
        },
      },
    },
    confidence: {
      type: "object",
      additionalProperties: false,
      required: ["merchant", "amount", "date", "tax", "overall"],
      description: "Your confidence 0.0-1.0 that each value is correct. Use low values for guesses.",
      properties: {
        merchant: { type: "number" },
        amount: { type: "number" },
        date: { type: "number" },
        tax: { type: "number" },
        overall: { type: "number" },
      },
    },
    full_text: { type: "string", description: "All legible text on the receipt, reading order." },
  },
} as const;

type Extraction = {
  merchant: string;
  total: string;
  subtotal: string;
  tax: string;
  tip: string;
  currency: string;
  date: string;
  time: string;
  payment_method: string;
  card_last4: string;
  invoice_number: string;
  receipt_number: string;
  business_number: string;
  address: string;
  phone: string;
  website: string;
  email: string;
  items: { description: string; quantity: string; unit_price: string; total: string }[];
  confidence: {
    merchant: number;
    amount: number;
    date: number;
    tax: number;
    overall: number;
  };
  full_text: string;
};

const SYSTEM_PROMPT = `You extract structured data from receipts and invoices.

Rules:
- Report only what is legible on the image. Never invent a value; return an empty string when a field is not present or you cannot read it.
- Amounts: digits and a decimal point only, no currency symbols or thousands separators.
- The total is the final amount charged, after tax and tip. If several totals appear, take the last/largest one that represents the amount paid.
- Dates: convert to yyyy-mm-dd. Resolve ambiguous formats using other clues on the receipt (locale, currency, month names). If the year is two digits, assume the current century.
- Confidence: be honest. Use values below 0.75 for anything blurry, cropped, ambiguous, or inferred rather than read directly. A low score routes the field to human review, which is the desired outcome when you are unsure.
- Multiple pages are one receipt: merge them, and prefer the page showing the payment total.`;

function clampConfidence(value: unknown): number {
  const numeric = typeof value === "number" ? value : 0;
  if (!Number.isFinite(numeric)) return 0;
  return Math.min(1, Math.max(0, numeric));
}

function optional(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

/**
 * Reads a receipt's pages with Claude vision and writes the extracted fields.
 * When ANTHROPIC_API_KEY is unset the receipt is routed to manual entry instead
 * of failing — the product stays fully usable without the integration.
 */
export const processReceipt = internalAction({
  args: { receiptId: v.id("receipts") },
  handler: async (ctx, args) => {
    const apiKey = process.env.ANTHROPIC_API_KEY;

    if (!apiKey) {
      await ctx.runMutation(internal.ocrStore.recordFailure, {
        receiptId: args.receiptId,
        provider: PROVIDER,
        error:
          "Automatic extraction is not configured. Set ANTHROPIC_API_KEY in the Convex deployment to enable it.",
        skipped: true,
      });
      return null;
    }

    const job = await ctx.runQuery(internal.ocrStore.loadForOcr, {
      receiptId: args.receiptId,
    });

    if (!job || job.pages.length === 0) {
      await ctx.runMutation(internal.ocrStore.recordFailure, {
        receiptId: args.receiptId,
        provider: PROVIDER,
        error: "No pages were attached to this receipt.",
      });
      return null;
    }

    await ctx.runMutation(internal.ocrStore.markProcessing, {
      receiptId: args.receiptId,
      provider: PROVIDER,
    });

    const startedAt = Date.now();

    try {
      const content: Anthropic.ContentBlockParam[] = [];

      for (const page of job.pages) {
        const blob = await ctx.storage.get(page.storageId as Id<"_storage">);
        if (!blob) continue;
        const data = Buffer.from(await blob.arrayBuffer()).toString("base64");

        if (IMAGE_TYPES.has(page.mimeType)) {
          content.push({
            type: "image",
            source: { type: "base64", media_type: page.mimeType as "image/jpeg", data },
          });
        } else if (page.mimeType === "application/pdf") {
          content.push({
            type: "document",
            source: { type: "base64", media_type: "application/pdf", data },
          });
        }
      }

      if (content.length === 0) {
        throw new Error("Pages could not be read from storage.");
      }

      content.push({
        type: "text",
        text: `Extract the receipt data. The workspace base currency is ${job.baseCurrency} and it labels sales tax as "${job.taxLabel}" — use these only to resolve ambiguity, never to override what the receipt actually shows.`,
      });

      const client = new Anthropic({ apiKey });

      const response = await client.messages.create({
        model: MODEL,
        max_tokens: 8000,
        system: SYSTEM_PROMPT,
        output_config: {
          effort: "low",
          format: { type: "json_schema", schema: EXTRACTION_SCHEMA },
        },
        messages: [{ role: "user", content }],
      });

      if (response.stop_reason === "refusal") {
        throw new Error("The image could not be processed.");
      }

      const textBlock = response.content.find((block) => block.type === "text");
      if (!textBlock || textBlock.type !== "text") {
        throw new Error("No extraction was returned.");
      }

      const extracted = JSON.parse(textBlock.text) as Extraction;

      const confidences = [
        { field: "merchant", confidence: clampConfidence(extracted.confidence?.merchant) },
        { field: "amount", confidence: clampConfidence(extracted.confidence?.amount) },
        { field: "date", confidence: clampConfidence(extracted.confidence?.date) },
        { field: "tax", confidence: clampConfidence(extracted.confidence?.tax) },
      ].filter((entry) => {
        // Only score fields the model actually returned a value for.
        if (entry.field === "merchant") return Boolean(optional(extracted.merchant));
        if (entry.field === "amount") return Boolean(optional(extracted.total));
        if (entry.field === "date") return Boolean(optional(extracted.date));
        return Boolean(optional(extracted.tax));
      });

      // A field the model could not read at all is maximally uncertain.
      for (const [field, value] of [
        ["merchant", extracted.merchant],
        ["amount", extracted.total],
        ["date", extracted.date],
      ] as const) {
        if (!optional(value)) confidences.push({ field, confidence: 0 });
      }

      const items = (extracted.items ?? [])
        .filter((item) => optional(item.description))
        .map((item) => {
          const quantity = Number.parseFloat(item.quantity);
          return {
            description: item.description.trim(),
            quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : undefined,
            unitPriceCents: optional(item.unit_price)
              ? parseAmountToCents(item.unit_price)
              : undefined,
            totalCents: parseAmountToCents(item.total || "0"),
          };
        });

      await ctx.runMutation(internal.ocrStore.applyExtraction, {
        receiptId: args.receiptId,
        provider: PROVIDER,
        rawText: optional(extracted.full_text),
        durationMs: Date.now() - startedAt,
        fields: {
          merchant: optional(extracted.merchant),
          amountCents: optional(extracted.total)
            ? parseAmountToCents(extracted.total)
            : undefined,
          subtotalCents: optional(extracted.subtotal)
            ? parseAmountToCents(extracted.subtotal)
            : undefined,
          taxCents: optional(extracted.tax) ? parseAmountToCents(extracted.tax) : undefined,
          tipCents: optional(extracted.tip) ? parseAmountToCents(extracted.tip) : undefined,
          currency: optional(extracted.currency)?.toUpperCase(),
          date: optional(extracted.date),
          time: optional(extracted.time),
          paymentMethod: optional(extracted.payment_method),
          cardLast4: optional(extracted.card_last4),
          invoiceNumber: optional(extracted.invoice_number),
          receiptNumber: optional(extracted.receipt_number),
          businessNumber: optional(extracted.business_number),
          address: optional(extracted.address),
          phone: optional(extracted.phone),
          website: optional(extracted.website),
          email: optional(extracted.email),
          items,
        },
        fieldConfidences: confidences,
        overallConfidence: clampConfidence(extracted.confidence?.overall),
      });

      await ctx.runMutation(internal.receipts.flagDuplicates, {
        receiptId: args.receiptId,
      });
    } catch (error) {
      const message =
        error instanceof Anthropic.APIError
          ? `${error.status ?? ""} ${error.message}`.trim()
          : error instanceof Error
            ? error.message
            : "Unknown extraction error.";

      await ctx.runMutation(internal.ocrStore.recordFailure, {
        receiptId: args.receiptId,
        provider: PROVIDER,
        error: message,
      });
    }

    return null;
  },
});
