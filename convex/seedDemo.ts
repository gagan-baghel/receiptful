/**
 * Dev-only data seeding for [scripts/capture-screenshots.mjs](../scripts/capture-screenshots.mjs).
 * Not wired into any user-facing flow — only reachable via `npx convex run
 * seedDemo:run`, which requires deploy access to the Convex project.
 */
import { internalMutation } from "./_generated/server";
import { normalizeMerchant, buildSearchText } from "./model/lib";
import { PLAN_SEATS, PLAN_STORAGE_BYTES } from "./model/defaults";
import type { Id } from "./_generated/dataModel";

type Spec = {
  merchant: string;
  amount: number;
  date: string;
  category: string;
  paymentMethod: "card" | "cash" | "bank_transfer";
  classification: "business" | "personal";
  taxDeductible: boolean;
  reimbursable: boolean;
  needsReview?: boolean;
  folder?: string;
  tags?: string[];
  invoiceNumber?: string;
};

const RECEIPTS: Spec[] = [
  { merchant: "Blue Bottle Coffee", amount: 27.54, date: "2026-08-04", category: "Food & Dining", paymentMethod: "card", classification: "business", taxDeductible: true, reimbursable: false, folder: "Business" },
  { merchant: "Shell Service Station", amount: 68.2, date: "2026-08-03", category: "Fuel & Transport", paymentMethod: "card", classification: "business", taxDeductible: true, reimbursable: true, folder: "Business", tags: ["Reimbursement"] },
  { merchant: "Hyatt Regency", amount: 412, date: "2026-08-02", category: "Hotel & Lodging", paymentMethod: "card", classification: "business", taxDeductible: true, reimbursable: true, needsReview: true, folder: "Business", tags: ["Client"] },
  { merchant: "Figma", amount: 45, date: "2026-08-01", category: "Subscriptions", paymentMethod: "card", classification: "business", taxDeductible: true, reimbursable: false, tags: ["Important"] },
  { merchant: "Whole Foods Market", amount: 86.42, date: "2026-07-28", category: "Groceries", paymentMethod: "card", classification: "personal", taxDeductible: false, reimbursable: false, folder: "Personal" },
  { merchant: "Delta Air Lines", amount: 612.3, date: "2026-07-22", category: "Travel", paymentMethod: "card", classification: "business", taxDeductible: true, reimbursable: true, folder: "Business", tags: ["Client"], invoiceNumber: "DL-88213" },
  { merchant: "Marriott Downtown", amount: 298.5, date: "2026-07-21", category: "Hotel & Lodging", paymentMethod: "card", classification: "business", taxDeductible: true, reimbursable: true, folder: "Business" },
  { merchant: "Staples", amount: 54.12, date: "2026-07-15", category: "Office & Supplies", paymentMethod: "card", classification: "business", taxDeductible: true, reimbursable: false, folder: "Tax Documents", tags: ["Tax"] },
  { merchant: "CVS Pharmacy", amount: 32.9, date: "2026-07-10", category: "Medical & Health", paymentMethod: "card", classification: "personal", taxDeductible: true, reimbursable: false },
  { merchant: "Netflix", amount: 15.49, date: "2026-07-05", category: "Entertainment", paymentMethod: "card", classification: "personal", taxDeductible: false, reimbursable: false },
  { merchant: "Udemy", amount: 89.99, date: "2026-06-27", category: "Education", paymentMethod: "card", classification: "business", taxDeductible: true, reimbursable: false, folder: "Business" },
  { merchant: "Uber", amount: 23.15, date: "2026-06-20", category: "Fuel & Transport", paymentMethod: "card", classification: "business", taxDeductible: true, reimbursable: true, tags: ["Reimbursement"] },
  { merchant: "AWS", amount: 214.77, date: "2026-06-12", category: "Subscriptions", paymentMethod: "card", classification: "business", taxDeductible: true, reimbursable: false, folder: "Tax Documents", tags: ["Tax"] },
  { merchant: "Trader Joe's", amount: 61.03, date: "2026-06-05", category: "Groceries", paymentMethod: "cash", classification: "personal", taxDeductible: false, reimbursable: false },
  { merchant: "LegalZoom Consulting", amount: 450, date: "2026-05-29", category: "Professional Services", paymentMethod: "bank_transfer", classification: "business", taxDeductible: true, reimbursable: false, folder: "Tax Documents", tags: ["Tax"], invoiceNumber: "LZ-4471" },
  { merchant: "Starbucks", amount: 8.75, date: "2026-05-18", category: "Food & Dining", paymentMethod: "card", classification: "personal", taxDeductible: false, reimbursable: false },
  { merchant: "Con Edison", amount: 132.44, date: "2026-05-08", category: "Utilities", paymentMethod: "bank_transfer", classification: "business", taxDeductible: true, reimbursable: false, folder: "Business" },
  { merchant: "Amazon", amount: 178.2, date: "2026-04-30", category: "Shopping", paymentMethod: "card", classification: "personal", taxDeductible: false, reimbursable: false },
  { merchant: "Target", amount: 42.1, date: "2026-04-22", category: "Shopping", paymentMethod: "card", classification: "personal", taxDeductible: false, reimbursable: false, needsReview: true },
  { merchant: "Apollo Pharmacy", amount: 19.99, date: "2026-04-15", category: "Medical & Health", paymentMethod: "card", classification: "personal", taxDeductible: true, reimbursable: false },
];

export const run = internalMutation({
  args: {},
  handler: async (ctx) => {
    // The dev deployment accumulates workspaces across capture runs — the
    // most recently created one is the account this run just signed up.
    const workspace = await ctx.db.query("workspaces").order("desc").first();
    if (!workspace) throw new Error("No workspace found — sign up first.");

    // A 3-person demo team needs more than the free plan's 1 seat.
    await ctx.db.patch(workspace._id, {
      plan: "pro",
      planSeats: PLAN_SEATS.pro,
      storageQuotaBytes: PLAN_STORAGE_BYTES.pro,
    });

    const categories = await ctx.db
      .query("categories")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", workspace._id))
      .collect();
    const folders = await ctx.db
      .query("folders")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", workspace._id))
      .collect();
    const tags = await ctx.db
      .query("tags")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", workspace._id))
      .collect();

    const categoryId = (name: string) => categories.find((c) => c.name === name)?._id;
    const folderId = (name: string) => folders.find((f) => f.name === name)?._id;
    const tagId = (name: string) => tags.find((t) => t.name === name)?._id;

    const managerId = await ctx.db.insert("users", {
      name: "Priya Shah",
      email: "priya@example.com",
    });
    await ctx.db.insert("members", {
      workspaceId: workspace._id,
      userId: managerId,
      role: "manager",
      department: "Finance",
      status: "active",
      joinedAt: Date.now() - 20 * 86400000,
      lastActiveAt: Date.now() - 3600000,
    });

    const memberId = await ctx.db.insert("users", {
      name: "Marcus Webb",
      email: "marcus@example.com",
    });
    await ctx.db.insert("members", {
      workspaceId: workspace._id,
      userId: memberId,
      role: "member",
      department: "Sales",
      status: "active",
      joinedAt: Date.now() - 15 * 86400000,
      lastActiveAt: Date.now() - 7200000,
    });

    await ctx.db.insert("invites", {
      workspaceId: workspace._id,
      email: "jordan@example.com",
      role: "viewer",
      token: "demo-preview-token",
      invitedBy: workspace.ownerId,
      expiresAt: Date.now() + 6 * 86400000,
    });

    const receiptIds: Id<"receipts">[] = [];
    const receiptIdByMerchant = new Map<string, Id<"receipts">>();

    for (const spec of RECEIPTS) {
      const amountCents = Math.round(spec.amount * 100);
      const catId = categoryId(spec.category);
      const merchantNormalized = normalizeMerchant(spec.merchant);

      const searchText = buildSearchText({
        merchant: spec.merchant,
        categoryName: spec.category,
        invoiceNumber: spec.invoiceNumber,
        paymentMethod: spec.paymentMethod,
        tags: spec.tags,
        folderNames: spec.folder ? [spec.folder] : undefined,
      });

      const receiptId = await ctx.db.insert("receipts", {
        workspaceId: workspace._id,
        uploaderId: workspace.ownerId,
        status: spec.needsReview ? "needs_review" : "ready",
        merchant: spec.merchant,
        merchantNormalized,
        amountCents,
        taxCents: spec.needsReview ? undefined : Math.round(amountCents * 0.08),
        currency: workspace.baseCurrency,
        baseAmountCents: amountCents,
        exchangeRate: 1,
        date: spec.date,
        paymentMethod: spec.paymentMethod,
        invoiceNumber: spec.invoiceNumber,
        categoryId: catId,
        items: [],
        taxDeductible: spec.taxDeductible,
        classification: spec.classification,
        reimbursable: spec.reimbursable,
        ocrConfidence: spec.needsReview ? 0.58 : 0.94,
        lowConfidenceFields: spec.needsReview ? ["taxCents"] : [],
        reviewedAt: spec.needsReview ? undefined : Date.now(),
        reviewedBy: spec.needsReview ? undefined : workspace.ownerId,
        approvalStatus: "none",
        pageCount: 0,
        storageBytes: 0,
        isArchived: false,
        searchText,
      });

      receiptIds.push(receiptId);
      receiptIdByMerchant.set(spec.merchant, receiptId);

      const fId = spec.folder ? folderId(spec.folder) : undefined;
      if (fId) {
        await ctx.db.insert("receiptFolders", { receiptId, folderId: fId, workspaceId: workspace._id });
        const folder = folders.find((f) => f._id === fId)!;
        folder.receiptCount += 1;
        await ctx.db.patch(fId, { receiptCount: folder.receiptCount });
      }

      for (const name of spec.tags ?? []) {
        const tId = tagId(name);
        if (!tId) continue;
        await ctx.db.insert("receiptTags", { receiptId, tagId: tId, workspaceId: workspace._id });
        const tag = tags.find((t) => t._id === tId)!;
        tag.usageCount += 1;
        await ctx.db.patch(tId, { usageCount: tag.usageCount });
      }
    }

    // One flagged duplicate, to populate the dashboard's duplicate-detection panel.
    const original = receiptIdByMerchant.get("Blue Bottle Coffee");
    if (original) {
      await ctx.db.insert("receipts", {
        workspaceId: workspace._id,
        uploaderId: workspace.ownerId,
        status: "ready",
        merchant: "Blue Bottle Coffee",
        merchantNormalized: normalizeMerchant("Blue Bottle Coffee"),
        amountCents: 2754,
        currency: workspace.baseCurrency,
        baseAmountCents: 2754,
        exchangeRate: 1,
        date: "2026-08-04",
        paymentMethod: "card",
        categoryId: categoryId("Food & Dining"),
        items: [],
        taxDeductible: true,
        classification: "business",
        reimbursable: false,
        ocrConfidence: 0.91,
        lowConfidenceFields: [],
        reviewedAt: Date.now(),
        reviewedBy: workspace.ownerId,
        duplicateOfId: original,
        approvalStatus: "none",
        pageCount: 0,
        storageBytes: 0,
        isArchived: false,
        searchText: buildSearchText({ merchant: "Blue Bottle Coffee", categoryName: "Food & Dining" }),
      });
    }

    // Budgets
    await ctx.db.insert("budgets", {
      workspaceId: workspace._id,
      name: "Monthly workspace ceiling",
      scope: "workspace",
      period: "monthly",
      limitCents: 200000,
      alertThresholdPercent: 80,
      startDate: "2026-08-01",
      createdBy: workspace.ownerId,
      isActive: true,
    });
    await ctx.db.insert("budgets", {
      workspaceId: workspace._id,
      name: "Dining budget",
      scope: "category",
      categoryId: categoryId("Food & Dining"),
      period: "monthly",
      limitCents: 15000,
      alertThresholdPercent: 75,
      startDate: "2026-08-01",
      createdBy: workspace.ownerId,
      isActive: true,
    });

    // Reports + approvals
    const julyReceipts = [
      receiptIdByMerchant.get("Delta Air Lines")!,
      receiptIdByMerchant.get("Marriott Downtown")!,
    ];
    const julyTotal = 61230 + 29850;
    const report1 = await ctx.db.insert("reports", {
      workspaceId: workspace._id,
      createdBy: workspace.ownerId,
      name: "July client travel",
      type: "expense",
      fromDate: "2026-07-01",
      toDate: "2026-07-31",
      filtersJson: "{}",
      receiptIds: julyReceipts,
      totalCents: julyTotal,
      taxTotalCents: Math.round(julyTotal * 0.08),
      currency: workspace.baseCurrency,
      approvalStatus: "submitted",
      submittedAt: Date.now() - 2 * 86400000,
    });
    await ctx.db.insert("approvals", {
      workspaceId: workspace._id,
      reportId: report1,
      submitterId: workspace.ownerId,
      reviewerId: managerId,
      status: "submitted",
      amountCents: julyTotal,
      submittedAt: Date.now() - 2 * 86400000,
    });
    for (const id of julyReceipts) await ctx.db.patch(id, { approvalStatus: "submitted" });

    const juneReceipts = [
      receiptIdByMerchant.get("Udemy")!,
      receiptIdByMerchant.get("Uber")!,
      receiptIdByMerchant.get("AWS")!,
    ];
    const juneTotal = 8999 + 2315 + 21477;
    const report2 = await ctx.db.insert("reports", {
      workspaceId: workspace._id,
      createdBy: memberId,
      name: "Q2 tools & transport",
      type: "expense",
      fromDate: "2026-06-01",
      toDate: "2026-06-30",
      filtersJson: "{}",
      receiptIds: juneReceipts,
      totalCents: juneTotal,
      taxTotalCents: Math.round(juneTotal * 0.08),
      currency: workspace.baseCurrency,
      approvalStatus: "approved",
      submittedAt: Date.now() - 20 * 86400000,
    });
    await ctx.db.insert("approvals", {
      workspaceId: workspace._id,
      reportId: report2,
      submitterId: memberId,
      reviewerId: workspace.ownerId,
      status: "approved",
      amountCents: juneTotal,
      submittedAt: Date.now() - 20 * 86400000,
      decidedAt: Date.now() - 19 * 86400000,
    });
    for (const id of juneReceipts) await ctx.db.patch(id, { approvalStatus: "approved" });

    await ctx.db.patch(workspace._id, {
      receiptCount: receiptIds.length + 1,
    });

    return { receipts: receiptIds.length + 1 };
  },
});
