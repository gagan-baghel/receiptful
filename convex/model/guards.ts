import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

export type Role = "owner" | "admin" | "manager" | "member" | "viewer";

const ROLE_RANK: Record<Role, number> = {
  owner: 5,
  admin: 4,
  manager: 3,
  member: 2,
  viewer: 1,
};

/**
 * Capabilities are checked server-side on every mutation. The client never
 * decides what a role may do — it only hides UI it knows will be rejected.
 */
export const CAPABILITIES = {
  "receipt.create": "member",
  "receipt.editOwn": "member",
  "receipt.editAny": "manager",
  "receipt.deleteOwn": "member",
  "receipt.deleteAny": "manager",
  "receipt.approve": "manager",
  "budget.manage": "manager",
  "report.create": "member",
  "category.manage": "admin",
  "folder.manage": "member",
  "tag.manage": "member",
  "member.manage": "admin",
  "workspace.manage": "admin",
  "workspace.billing": "owner",
  "workspace.transfer": "owner",
  "workspace.delete": "owner",
} as const;

export type Capability = keyof typeof CAPABILITIES;

export class AuthError extends ConvexError<{ code: string; message: string }> {
  constructor(code: string, message: string) {
    super({ code, message });
  }
}

export async function getUserIdOrNull(ctx: QueryCtx) {
  return await getAuthUserId(ctx);
}

export async function requireUser(ctx: QueryCtx): Promise<Doc<"users">> {
  const userId = await getAuthUserId(ctx);
  if (!userId) {
    throw new AuthError("UNAUTHENTICATED", "You must be signed in.");
  }
  const user = await ctx.db.get(userId);
  if (!user) {
    throw new AuthError("UNAUTHENTICATED", "Your account no longer exists.");
  }
  return user;
}

export type MemberContext = {
  user: Doc<"users">;
  member: Doc<"members">;
  workspace: Doc<"workspaces">;
};

/**
 * The single row-level authorization gate. Every workspace-scoped query and
 * mutation routes through this — there is no other way to reach a workspace.
 */
export async function requireMember(
  ctx: QueryCtx,
  workspaceId: Id<"workspaces">,
): Promise<MemberContext> {
  const user = await requireUser(ctx);
  const member = await ctx.db
    .query("members")
    .withIndex("by_workspace_user", (q) =>
      q.eq("workspaceId", workspaceId).eq("userId", user._id),
    )
    .unique();

  if (!member || member.status !== "active") {
    throw new AuthError("FORBIDDEN", "You do not have access to this workspace.");
  }

  const workspace = await ctx.db.get(workspaceId);
  if (!workspace || workspace.deletedAt !== undefined) {
    throw new AuthError("NOT_FOUND", "Workspace not found.");
  }

  return { user, member, workspace };
}

/** Higher rank means more authority. Used to stop privilege escalation. */
export function roleRank(role: Role): number {
  return ROLE_RANK[role];
}

export function hasCapability(role: Role, capability: Capability): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[CAPABILITIES[capability] as Role];
}

export function assertCapability(role: Role, capability: Capability) {
  if (!hasCapability(role, capability)) {
    throw new AuthError(
      "FORBIDDEN",
      `Your role (${role}) cannot perform this action.`,
    );
  }
}

export async function requireCapability(
  ctx: QueryCtx,
  workspaceId: Id<"workspaces">,
  capability: Capability,
): Promise<MemberContext> {
  const context = await requireMember(ctx, workspaceId);
  assertCapability(context.member.role, capability);
  return context;
}

/** Resolves the caller's active workspace, falling back to their first membership. */
export async function requireActiveWorkspace(
  ctx: QueryCtx,
): Promise<MemberContext> {
  const user = await requireUser(ctx);

  if (user.defaultWorkspaceId) {
    const member = await ctx.db
      .query("members")
      .withIndex("by_workspace_user", (q) =>
        q.eq("workspaceId", user.defaultWorkspaceId!).eq("userId", user._id),
      )
      .unique();
    const workspace = await ctx.db.get(user.defaultWorkspaceId);
    if (member && member.status === "active" && workspace && !workspace.deletedAt) {
      return { user, member, workspace };
    }
  }

  const fallback = await ctx.db
    .query("members")
    .withIndex("by_user", (q) => q.eq("userId", user._id))
    .first();

  if (!fallback) {
    throw new AuthError("NO_WORKSPACE", "You are not a member of any workspace.");
  }

  const workspace = await ctx.db.get(fallback.workspaceId);
  if (!workspace) {
    throw new AuthError("NO_WORKSPACE", "Workspace not found.");
  }

  return { user, member: fallback, workspace };
}

/**
 * Loads a receipt and proves the caller may see it. Soft-deleted receipts are
 * only visible when explicitly requested (the trash view).
 */
export async function requireReceipt(
  ctx: QueryCtx,
  receiptId: Id<"receipts">,
  options: { includeDeleted?: boolean } = {},
) {
  const receipt = await ctx.db.get(receiptId);
  if (!receipt) {
    throw new AuthError("NOT_FOUND", "Receipt not found.");
  }
  if (receipt.deletedAt !== undefined && !options.includeDeleted) {
    throw new AuthError("NOT_FOUND", "Receipt not found.");
  }
  const context = await requireMember(ctx, receipt.workspaceId);
  return { ...context, receipt };
}

/** Members may edit their own receipts; managers and above may edit any. */
export function assertCanEditReceipt(
  context: MemberContext,
  receipt: Doc<"receipts">,
) {
  const isOwner = receipt.uploaderId === context.user._id;
  if (isOwner) {
    assertCapability(context.member.role, "receipt.editOwn");
    return;
  }
  assertCapability(context.member.role, "receipt.editAny");
}

export async function writeAudit(
  ctx: MutationCtx,
  args: {
    workspaceId: Id<"workspaces">;
    actorId?: Id<"users">;
    action: string;
    entityType: string;
    entityId: string;
    meta?: Record<string, unknown>;
  },
) {
  await ctx.db.insert("auditLogs", {
    workspaceId: args.workspaceId,
    actorId: args.actorId,
    action: args.action,
    entityType: args.entityType,
    entityId: args.entityId,
    meta: args.meta ? JSON.stringify(args.meta) : undefined,
  });
}

export async function writeActivity(
  ctx: MutationCtx,
  args: {
    workspaceId: Id<"workspaces">;
    receiptId?: Id<"receipts">;
    actorId?: Id<"users">;
    type: string;
    summary: string;
    meta?: Record<string, unknown>;
  },
) {
  await ctx.db.insert("activity", {
    workspaceId: args.workspaceId,
    receiptId: args.receiptId,
    actorId: args.actorId,
    type: args.type,
    summary: args.summary,
    meta: args.meta ? JSON.stringify(args.meta) : undefined,
  });
}

export async function notifyUser(
  ctx: MutationCtx,
  args: {
    userId: Id<"users">;
    workspaceId: Id<"workspaces">;
    type: string;
    title: string;
    body: string;
    link?: string;
  },
) {
  const settings = await ctx.db
    .query("settings")
    .withIndex("by_user", (q) => q.eq("userId", args.userId))
    .unique();

  // Respect per-category notification preferences before writing the row.
  const muted =
    settings &&
    ((args.type === "receipt_processed" && !settings.notifyReceiptProcessed) ||
      (args.type === "approval" && !settings.notifyApproval) ||
      (args.type === "budget_exceeded" && !settings.notifyBudgetExceeded) ||
      (args.type === "upload_failed" && !settings.notifyUploadFailed) ||
      (args.type === "tax_reminder" && !settings.notifyTaxReminder));

  if (muted) return;

  await ctx.db.insert("notifications", {
    userId: args.userId,
    workspaceId: args.workspaceId,
    type: args.type,
    title: args.title,
    body: args.body,
    link: args.link,
  });
}
