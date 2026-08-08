import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import {
  DEFAULT_CATEGORIES,
  DEFAULT_FOLDERS,
  DEFAULT_TAGS,
  PLAN_SEATS,
  PLAN_STORAGE_BYTES,
} from "./defaults";

function slugify(input: string) {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
}

async function uniqueSlug(ctx: MutationCtx, base: string) {
  const root = slugify(base) || "workspace";
  let candidate = root;
  let suffix = 1;

  while (
    await ctx.db
      .query("workspaces")
      .withIndex("by_slug", (q) => q.eq("slug", candidate))
      .unique()
  ) {
    suffix += 1;
    candidate = `${root}-${suffix}`;
  }

  return candidate;
}

/**
 * Creates a workspace with its seed categories, folders and tags, and makes
 * `userId` the owner. Safe to call once per new user.
 */
export async function createWorkspaceForUser(
  ctx: MutationCtx,
  userId: Id<"users">,
  options: { name: string; currency?: string; timezone?: string; locale?: string },
): Promise<Id<"workspaces">> {
  const slug = await uniqueSlug(ctx, options.name);

  const workspaceId = await ctx.db.insert("workspaces", {
    name: options.name,
    slug,
    ownerId: userId,
    baseCurrency: options.currency ?? "USD",
    locale: options.locale ?? "en-US",
    timezone: options.timezone ?? "UTC",
    fiscalYearStartMonth: 1,
    plan: "free",
    planSeats: PLAN_SEATS.free,
    storageUsedBytes: 0,
    storageQuotaBytes: PLAN_STORAGE_BYTES.free,
    receiptCount: 0,
    taxLabel: "Tax",
    defaultTaxRateBps: 0,
  });

  await ctx.db.insert("members", {
    workspaceId,
    userId,
    role: "owner",
    status: "active",
    joinedAt: Date.now(),
    lastActiveAt: Date.now(),
  });

  await Promise.all(
    DEFAULT_CATEGORIES.map((category, index) =>
      ctx.db.insert("categories", {
        workspaceId,
        name: category.name,
        color: category.color,
        icon: category.icon,
        taxTreatment: category.taxTreatment,
        deductiblePercent: category.deductiblePercent,
        keywords: category.keywords,
        isSystem: true,
        sortOrder: index,
      }),
    ),
  );

  await Promise.all(
    DEFAULT_FOLDERS.map((folder) =>
      ctx.db.insert("folders", {
        workspaceId,
        name: folder.name,
        color: folder.color,
        icon: folder.icon,
        createdBy: userId,
        receiptCount: 0,
      }),
    ),
  );

  await Promise.all(
    DEFAULT_TAGS.map((tag) =>
      ctx.db.insert("tags", {
        workspaceId,
        name: tag.name,
        color: tag.color,
        usageCount: 0,
      }),
    ),
  );

  await ctx.db.patch(userId, { defaultWorkspaceId: workspaceId });

  await ctx.db.insert("auditLogs", {
    workspaceId,
    actorId: userId,
    action: "workspace.created",
    entityType: "workspace",
    entityId: workspaceId,
  });

  return workspaceId;
}

/** Creates the user's settings row with sensible defaults if missing. */
export async function ensureSettings(ctx: MutationCtx, userId: Id<"users">) {
  const existing = await ctx.db
    .query("settings")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .unique();

  if (existing) return existing._id;

  return await ctx.db.insert("settings", {
    userId,
    theme: "system",
    currency: "USD",
    language: "en",
    timezone: "UTC",
    dateFormat: "MMM d, yyyy",
    weekStartsOn: 1,
    notifyReceiptProcessed: true,
    notifyApproval: true,
    notifyBudgetExceeded: true,
    notifyUploadFailed: true,
    notifyWeeklyDigest: true,
    notifyTaxReminder: true,
    pushEnabled: false,
    emailEnabled: true,
    autoCategorize: true,
    reducedMotion: false,
  });
}
