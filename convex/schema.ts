import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

/**
 * Money is stored as integer minor units (cents) everywhere. Never floats.
 * All workspace-scoped tables carry `workspaceId` as the first index field so
 * row-level authorization is a single index lookup.
 */

export const roleValidator = v.union(
  v.literal("owner"),
  v.literal("admin"),
  v.literal("manager"),
  v.literal("member"),
  v.literal("viewer"),
);

export const receiptStatusValidator = v.union(
  v.literal("uploading"),
  v.literal("processing"),
  v.literal("needs_review"),
  v.literal("ready"),
  v.literal("failed"),
);

export const approvalStatusValidator = v.union(
  v.literal("none"),
  v.literal("submitted"),
  v.literal("approved"),
  v.literal("rejected"),
  v.literal("returned"),
);

export const paymentMethodValidator = v.union(
  v.literal("card"),
  v.literal("cash"),
  v.literal("bank_transfer"),
  v.literal("wallet"),
  v.literal("cheque"),
  v.literal("other"),
  v.literal("unknown"),
);

export const lineItemValidator = v.object({
  description: v.string(),
  quantity: v.optional(v.number()),
  unitPriceCents: v.optional(v.number()),
  totalCents: v.number(),
});

/** Per-field OCR confidence, 0..1. Absent means the field was user-entered. */
export const fieldConfidenceValidator = v.object({
  field: v.string(),
  confidence: v.number(),
});

export default defineSchema({
  ...authTables,

  users: defineTable({
    name: v.optional(v.string()),
    image: v.optional(v.string()),
    email: v.optional(v.string()),
    emailVerificationTime: v.optional(v.number()),
    phone: v.optional(v.string()),
    phoneVerificationTime: v.optional(v.number()),
    isAnonymous: v.optional(v.boolean()),
    // Profile extensions
    jobTitle: v.optional(v.string()),
    defaultWorkspaceId: v.optional(v.id("workspaces")),
    onboardingCompleted: v.optional(v.boolean()),
    deletionRequestedAt: v.optional(v.number()),
  })
    .index("email", ["email"])
    .index("phone", ["phone"]),

  workspaces: defineTable({
    name: v.string(),
    slug: v.string(),
    ownerId: v.id("users"),
    baseCurrency: v.string(),
    locale: v.string(),
    timezone: v.string(),
    fiscalYearStartMonth: v.number(), // 1-12
    plan: v.union(v.literal("free"), v.literal("pro"), v.literal("business")),
    planSeats: v.number(),
    storageUsedBytes: v.number(),
    storageQuotaBytes: v.number(),
    receiptCount: v.number(),
    taxLabel: v.string(), // "GST" | "VAT" | "Sales Tax"
    defaultTaxRateBps: v.number(), // basis points, e.g. 1800 = 18%
    requireApprovalOverCents: v.optional(v.number()),
    logoStorageId: v.optional(v.id("_storage")),
    deletedAt: v.optional(v.number()),
  })
    .index("by_slug", ["slug"])
    .index("by_owner", ["ownerId"]),

  members: defineTable({
    workspaceId: v.id("workspaces"),
    userId: v.id("users"),
    role: roleValidator,
    department: v.optional(v.string()),
    managerId: v.optional(v.id("users")),
    status: v.union(v.literal("active"), v.literal("suspended")),
    joinedAt: v.number(),
    lastActiveAt: v.optional(v.number()),
  })
    .index("by_workspace", ["workspaceId"])
    .index("by_user", ["userId"])
    .index("by_workspace_user", ["workspaceId", "userId"])
    .index("by_workspace_role", ["workspaceId", "role"]),

  invites: defineTable({
    workspaceId: v.id("workspaces"),
    email: v.string(),
    role: roleValidator,
    token: v.string(),
    invitedBy: v.id("users"),
    expiresAt: v.number(),
    acceptedAt: v.optional(v.number()),
    revokedAt: v.optional(v.number()),
  })
    .index("by_workspace", ["workspaceId"])
    .index("by_token", ["token"])
    .index("by_email", ["email"]),

  categories: defineTable({
    workspaceId: v.id("workspaces"),
    name: v.string(),
    color: v.string(),
    icon: v.string(),
    taxTreatment: v.union(
      v.literal("deductible"),
      v.literal("partial"),
      v.literal("non_deductible"),
    ),
    deductiblePercent: v.number(), // 0-100
    /** Lowercase merchant/keyword hints used by the auto-categorizer. */
    keywords: v.array(v.string()),
    isSystem: v.boolean(),
    sortOrder: v.number(),
    monthlyBudgetCents: v.optional(v.number()),
    deletedAt: v.optional(v.number()),
  })
    .index("by_workspace", ["workspaceId"])
    .index("by_workspace_name", ["workspaceId", "name"]),

  folders: defineTable({
    workspaceId: v.id("workspaces"),
    name: v.string(),
    parentId: v.optional(v.id("folders")),
    color: v.string(),
    icon: v.string(),
    createdBy: v.id("users"),
    receiptCount: v.number(),
    deletedAt: v.optional(v.number()),
  })
    .index("by_workspace", ["workspaceId"])
    .index("by_workspace_parent", ["workspaceId", "parentId"])
    .index("by_workspace_name", ["workspaceId", "name"]),

  tags: defineTable({
    workspaceId: v.id("workspaces"),
    name: v.string(),
    color: v.string(),
    usageCount: v.number(),
  })
    .index("by_workspace", ["workspaceId"])
    .index("by_workspace_name", ["workspaceId", "name"]),

  receipts: defineTable({
    workspaceId: v.id("workspaces"),
    uploaderId: v.id("users"),
    status: receiptStatusValidator,

    // Core extracted/edited fields
    merchant: v.string(),
    merchantNormalized: v.string(), // lowercased, for grouping + dedupe
    amountCents: v.number(),
    subtotalCents: v.optional(v.number()),
    taxCents: v.optional(v.number()),
    tipCents: v.optional(v.number()),
    currency: v.string(),
    /** Amount converted to workspace base currency at capture time. */
    baseAmountCents: v.number(),
    exchangeRate: v.number(),
    date: v.string(), // ISO yyyy-mm-dd, indexed for range scans
    time: v.optional(v.string()), // HH:mm
    paymentMethod: paymentMethodValidator,
    cardLast4: v.optional(v.string()),
    invoiceNumber: v.optional(v.string()),
    receiptNumber: v.optional(v.string()),
    businessNumber: v.optional(v.string()),

    // Merchant contact block
    address: v.optional(v.string()),
    phone: v.optional(v.string()),
    website: v.optional(v.string()),
    email: v.optional(v.string()),
    latitude: v.optional(v.number()),
    longitude: v.optional(v.number()),

    categoryId: v.optional(v.id("categories")),
    items: v.array(lineItemValidator),
    notes: v.optional(v.string()),

    // Classification
    taxDeductible: v.boolean(),
    classification: v.union(v.literal("business"), v.literal("personal")),
    reimbursable: v.boolean(),
    projectName: v.optional(v.string()),

    // Quality + review
    ocrConfidence: v.number(), // 0..1 overall
    lowConfidenceFields: v.array(v.string()),
    reviewedAt: v.optional(v.number()),
    reviewedBy: v.optional(v.id("users")),
    duplicateOfId: v.optional(v.id("receipts")),

    approvalStatus: approvalStatusValidator,

    // Lifecycle
    pageCount: v.number(),
    storageBytes: v.number(),
    thumbnailId: v.optional(v.id("_storage")),
    isArchived: v.boolean(),
    deletedAt: v.optional(v.number()),

    /** Denormalized haystack: merchant + notes + items + raw OCR text + tags. */
    searchText: v.string(),
  })
    .index("by_workspace", ["workspaceId"])
    .index("by_workspace_date", ["workspaceId", "date"])
    .index("by_workspace_status", ["workspaceId", "status"])
    .index("by_workspace_category", ["workspaceId", "categoryId"])
    .index("by_workspace_merchant", ["workspaceId", "merchantNormalized"])
    .index("by_workspace_archived_date", ["workspaceId", "isArchived", "date"])
    .index("by_workspace_deleted", ["workspaceId", "deletedAt"])
    .index("by_workspace_approval", ["workspaceId", "approvalStatus"])
    .index("by_uploader", ["uploaderId"])
    .searchIndex("search_all", {
      searchField: "searchText",
      filterFields: ["workspaceId", "isArchived", "categoryId", "classification"],
    }),

  receiptPages: defineTable({
    receiptId: v.id("receipts"),
    workspaceId: v.id("workspaces"),
    storageId: v.id("_storage"),
    order: v.number(),
    mimeType: v.string(),
    width: v.optional(v.number()),
    height: v.optional(v.number()),
    rotation: v.number(), // 0 | 90 | 180 | 270
    sizeBytes: v.number(),
  })
    .index("by_receipt", ["receiptId", "order"])
    .index("by_workspace", ["workspaceId"]),

  ocrResults: defineTable({
    receiptId: v.id("receipts"),
    workspaceId: v.id("workspaces"),
    provider: v.string(),
    status: v.union(
      v.literal("pending"),
      v.literal("succeeded"),
      v.literal("failed"),
      v.literal("skipped"),
    ),
    rawText: v.optional(v.string()),
    overallConfidence: v.number(),
    fieldConfidences: v.array(fieldConfidenceValidator),
    error: v.optional(v.string()),
    durationMs: v.optional(v.number()),
    processedAt: v.optional(v.number()),
  })
    .index("by_receipt", ["receiptId"])
    .index("by_workspace_status", ["workspaceId", "status"]),

  receiptTags: defineTable({
    receiptId: v.id("receipts"),
    tagId: v.id("tags"),
    workspaceId: v.id("workspaces"),
  })
    .index("by_receipt", ["receiptId"])
    .index("by_tag", ["tagId"])
    .index("by_receipt_tag", ["receiptId", "tagId"]),

  receiptFolders: defineTable({
    receiptId: v.id("receipts"),
    folderId: v.id("folders"),
    workspaceId: v.id("workspaces"),
  })
    .index("by_receipt", ["receiptId"])
    .index("by_folder", ["folderId"])
    .index("by_receipt_folder", ["receiptId", "folderId"]),

  receiptVersions: defineTable({
    receiptId: v.id("receipts"),
    workspaceId: v.id("workspaces"),
    editedBy: v.id("users"),
    changes: v.array(
      v.object({ field: v.string(), from: v.string(), to: v.string() }),
    ),
  }).index("by_receipt", ["receiptId"]),

  comments: defineTable({
    receiptId: v.id("receipts"),
    workspaceId: v.id("workspaces"),
    authorId: v.id("users"),
    body: v.string(),
    editedAt: v.optional(v.number()),
    deletedAt: v.optional(v.number()),
  }).index("by_receipt", ["receiptId"]),

  activity: defineTable({
    workspaceId: v.id("workspaces"),
    receiptId: v.optional(v.id("receipts")),
    actorId: v.optional(v.id("users")),
    type: v.string(),
    summary: v.string(),
    meta: v.optional(v.string()),
  })
    .index("by_receipt", ["receiptId"])
    .index("by_workspace", ["workspaceId"]),

  budgets: defineTable({
    workspaceId: v.id("workspaces"),
    name: v.string(),
    scope: v.union(
      v.literal("workspace"),
      v.literal("category"),
      v.literal("project"),
      v.literal("department"),
    ),
    categoryId: v.optional(v.id("categories")),
    projectName: v.optional(v.string()),
    department: v.optional(v.string()),
    period: v.union(
      v.literal("monthly"),
      v.literal("quarterly"),
      v.literal("yearly"),
    ),
    limitCents: v.number(),
    alertThresholdPercent: v.number(),
    startDate: v.string(),
    createdBy: v.id("users"),
    lastAlertedPeriod: v.optional(v.string()),
    isActive: v.boolean(),
  })
    .index("by_workspace", ["workspaceId"])
    .index("by_workspace_active", ["workspaceId", "isActive"]),

  reports: defineTable({
    workspaceId: v.id("workspaces"),
    createdBy: v.id("users"),
    name: v.string(),
    type: v.union(
      v.literal("expense"),
      v.literal("monthly"),
      v.literal("quarterly"),
      v.literal("yearly"),
      v.literal("business"),
      v.literal("project"),
      v.literal("tax"),
    ),
    fromDate: v.string(),
    toDate: v.string(),
    filtersJson: v.string(),
    receiptIds: v.array(v.id("receipts")),
    totalCents: v.number(),
    taxTotalCents: v.number(),
    currency: v.string(),
    approvalStatus: approvalStatusValidator,
    submittedAt: v.optional(v.number()),
  })
    .index("by_workspace", ["workspaceId"])
    .index("by_workspace_type", ["workspaceId", "type"])
    .index("by_creator", ["createdBy"]),

  approvals: defineTable({
    workspaceId: v.id("workspaces"),
    reportId: v.optional(v.id("reports")),
    receiptId: v.optional(v.id("receipts")),
    submitterId: v.id("users"),
    reviewerId: v.optional(v.id("users")),
    status: approvalStatusValidator,
    amountCents: v.number(),
    submittedAt: v.number(),
    decidedAt: v.optional(v.number()),
  })
    .index("by_workspace_status", ["workspaceId", "status"])
    .index("by_reviewer", ["reviewerId", "status"])
    .index("by_submitter", ["submitterId"])
    .index("by_report", ["reportId"])
    .index("by_receipt", ["receiptId"]),

  approvalComments: defineTable({
    approvalId: v.id("approvals"),
    authorId: v.id("users"),
    body: v.string(),
    action: v.optional(approvalStatusValidator),
  }).index("by_approval", ["approvalId"]),

  notifications: defineTable({
    userId: v.id("users"),
    workspaceId: v.id("workspaces"),
    type: v.string(),
    title: v.string(),
    body: v.string(),
    link: v.optional(v.string()),
    readAt: v.optional(v.number()),
  })
    .index("by_user", ["userId"])
    .index("by_user_unread", ["userId", "readAt"]),

  settings: defineTable({
    userId: v.id("users"),
    theme: v.union(v.literal("light"), v.literal("dark"), v.literal("system")),
    currency: v.string(),
    language: v.string(),
    timezone: v.string(),
    dateFormat: v.string(),
    weekStartsOn: v.number(),
    notifyReceiptProcessed: v.boolean(),
    notifyApproval: v.boolean(),
    notifyBudgetExceeded: v.boolean(),
    notifyUploadFailed: v.boolean(),
    notifyWeeklyDigest: v.boolean(),
    notifyTaxReminder: v.boolean(),
    pushEnabled: v.boolean(),
    emailEnabled: v.boolean(),
    autoCategorize: v.boolean(),
    autoArchiveAfterDays: v.optional(v.number()),
    reducedMotion: v.boolean(),
  }).index("by_user", ["userId"]),

  savedFilters: defineTable({
    workspaceId: v.id("workspaces"),
    userId: v.id("users"),
    name: v.string(),
    filtersJson: v.string(),
    isShared: v.boolean(),
  })
    .index("by_workspace_user", ["workspaceId", "userId"])
    .index("by_workspace", ["workspaceId"]),

  /** Daily FX snapshot so multi-currency totals roll up to a base currency. */
  exchangeRates: defineTable({
    base: v.string(),
    ratesJson: v.string(),
    fetchedAt: v.number(),
  }).index("by_base", ["base"]),

  auditLogs: defineTable({
    workspaceId: v.id("workspaces"),
    actorId: v.optional(v.id("users")),
    action: v.string(),
    entityType: v.string(),
    entityId: v.string(),
    meta: v.optional(v.string()),
  })
    .index("by_workspace", ["workspaceId"])
    .index("by_workspace_entity", ["workspaceId", "entityType", "entityId"]),
});
