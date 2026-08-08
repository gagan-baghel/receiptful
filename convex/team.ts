import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { PLAN_SEATS } from "./model/defaults";
import {
  CAPABILITIES,
  hasCapability,
  notifyUser,
  requireActiveWorkspace,
  requireCapability,
  requireUser,
  roleRank,
  writeAudit,
} from "./model/guards";
import { roleValidator } from "./schema";

function newToken() {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export const members = query({
  args: {},
  handler: async (ctx) => {
    const { workspace, member: viewer } = await requireActiveWorkspace(ctx);

    const rows = await ctx.db
      .query("members")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", workspace._id))
      .collect();

    const receipts = await ctx.db
      .query("receipts")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", workspace._id))
      .collect();

    const stats = new Map<string, { count: number; totalCents: number }>();
    for (const receipt of receipts) {
      if (receipt.deletedAt !== undefined) continue;
      const entry = stats.get(receipt.uploaderId) ?? { count: 0, totalCents: 0 };
      entry.count += 1;
      entry.totalCents += receipt.baseAmountCents;
      stats.set(receipt.uploaderId, entry);
    }

    const people = await Promise.all(
      rows.map(async (row) => {
        const user = await ctx.db.get(row.userId);
        return {
          _id: row._id,
          userId: row.userId,
          name: user?.name ?? "",
          email: user?.email ?? "",
          image: user?.image,
          role: row.role,
          department: row.department ?? "",
          status: row.status,
          joinedAt: row.joinedAt,
          lastActiveAt: row.lastActiveAt,
          isOwner: workspace.ownerId === row.userId,
          receiptCount: stats.get(row.userId)?.count ?? 0,
          totalCents: stats.get(row.userId)?.totalCents ?? 0,
        };
      }),
    );

    const invites = hasCapability(viewer.role, "member.manage")
      ? (
          await ctx.db
            .query("invites")
            .withIndex("by_workspace", (q) => q.eq("workspaceId", workspace._id))
            .collect()
        )
          .filter(
            (invite) =>
              invite.acceptedAt === undefined &&
              invite.revokedAt === undefined &&
              invite.expiresAt > Date.now(),
          )
          .map((invite) => ({
            _id: invite._id,
            email: invite.email,
            role: invite.role,
            token: invite.token,
            expiresAt: invite.expiresAt,
            createdAt: invite._creationTime,
          }))
      : [];

    return {
      members: people.sort((a, b) => roleRank(b.role) - roleRank(a.role)),
      invites,
      seatsUsed: people.length,
      seatLimit: PLAN_SEATS[workspace.plan],
      viewerRole: viewer.role,
      capabilities: Object.fromEntries(
        Object.keys(CAPABILITIES).map((capability) => [
          capability,
          hasCapability(viewer.role, capability as keyof typeof CAPABILITIES),
        ]),
      ),
    };
  },
});

export const invite = mutation({
  args: { email: v.string(), role: roleValidator, department: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const { workspace } = await requireActiveWorkspace(ctx);
    const { user, member } = await requireCapability(ctx, workspace._id, "member.manage");

    const email = args.email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
      throw new ConvexError({
        code: "INVALID_INPUT",
        message: "Enter a valid email address.",
      });
    }
    if (args.role === "owner") {
      throw new ConvexError({
        code: "INVALID_ROLE",
        message: "Use Transfer ownership to make someone the owner.",
      });
    }
    // Nobody can hand out more authority than they hold.
    if (roleRank(args.role) >= roleRank(member.role) && member.role !== "owner") {
      throw new ConvexError({
        code: "FORBIDDEN",
        message: "You cannot invite someone at or above your own role.",
      });
    }

    const existingMembers = await ctx.db
      .query("members")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", workspace._id))
      .collect();

    if (existingMembers.length >= PLAN_SEATS[workspace.plan]) {
      throw new ConvexError({
        code: "SEATS_EXCEEDED",
        message: `The ${workspace.plan} plan includes ${PLAN_SEATS[workspace.plan]} seats. Upgrade to invite more people.`,
      });
    }

    for (const existing of existingMembers) {
      const memberUser = await ctx.db.get(existing.userId);
      if (memberUser?.email?.toLowerCase() === email) {
        throw new ConvexError({
          code: "ALREADY_MEMBER",
          message: "That person is already in this workspace.",
        });
      }
    }

    const openInvites = await ctx.db
      .query("invites")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", workspace._id))
      .collect();

    for (const openInvite of openInvites) {
      if (
        openInvite.email === email &&
        openInvite.acceptedAt === undefined &&
        openInvite.revokedAt === undefined &&
        openInvite.expiresAt > Date.now()
      ) {
        return openInvite.token;
      }
    }

    const token = newToken();
    const inviteId = await ctx.db.insert("invites", {
      workspaceId: workspace._id,
      email,
      role: args.role,
      token,
      invitedBy: user._id,
      expiresAt: Date.now() + INVITE_TTL_MS,
    });

    await writeAudit(ctx, {
      workspaceId: workspace._id,
      actorId: user._id,
      action: "member.invited",
      entityType: "invite",
      entityId: inviteId,
      meta: { email, role: args.role },
    });

    return token;
  },
});

export const revokeInvite = mutation({
  args: { inviteId: v.id("invites") },
  handler: async (ctx, args) => {
    const invite = await ctx.db.get(args.inviteId);
    if (!invite) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Invite not found." });
    }
    await requireCapability(ctx, invite.workspaceId, "member.manage");
    await ctx.db.patch(args.inviteId, { revokedAt: Date.now() });
    return null;
  },
});

/** Reads an invite before sign-in so the join screen can show what it is. */
export const previewInvite = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const invite = await ctx.db
      .query("invites")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .unique();

    if (!invite || invite.revokedAt !== undefined) return { status: "invalid" as const };
    if (invite.acceptedAt !== undefined) return { status: "accepted" as const };
    if (invite.expiresAt < Date.now()) return { status: "expired" as const };

    const workspace = await ctx.db.get(invite.workspaceId);
    const inviter = await ctx.db.get(invite.invitedBy);

    return {
      status: "valid" as const,
      workspaceName: workspace?.name ?? "",
      inviterName: inviter?.name ?? "",
      email: invite.email,
      role: invite.role,
    };
  },
});

export const acceptInvite = mutation({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);

    const invite = await ctx.db
      .query("invites")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .unique();

    if (!invite || invite.revokedAt !== undefined) {
      throw new ConvexError({ code: "INVALID_INVITE", message: "This invite is no longer valid." });
    }
    if (invite.acceptedAt !== undefined) {
      throw new ConvexError({ code: "INVALID_INVITE", message: "This invite was already used." });
    }
    if (invite.expiresAt < Date.now()) {
      throw new ConvexError({ code: "INVALID_INVITE", message: "This invite has expired." });
    }
    if ((user.email ?? "").toLowerCase() !== invite.email) {
      throw new ConvexError({
        code: "EMAIL_MISMATCH",
        message: `This invite was sent to ${invite.email}. Sign in with that address to accept it.`,
      });
    }

    const existing = await ctx.db
      .query("members")
      .withIndex("by_workspace_user", (q) =>
        q.eq("workspaceId", invite.workspaceId).eq("userId", user._id),
      )
      .unique();

    if (!existing) {
      await ctx.db.insert("members", {
        workspaceId: invite.workspaceId,
        userId: user._id,
        role: invite.role,
        status: "active",
        joinedAt: Date.now(),
        lastActiveAt: Date.now(),
      });
    }

    await ctx.db.patch(invite._id, { acceptedAt: Date.now() });
    await ctx.db.patch(user._id, { defaultWorkspaceId: invite.workspaceId });

    await notifyUser(ctx, {
      userId: invite.invitedBy,
      workspaceId: invite.workspaceId,
      type: "member_joined",
      title: "Invite accepted",
      body: `${user.name ?? invite.email} joined the workspace.`,
      link: "/dashboard/team",
    });

    await writeAudit(ctx, {
      workspaceId: invite.workspaceId,
      actorId: user._id,
      action: "member.joined",
      entityType: "member",
      entityId: user._id,
    });

    return invite.workspaceId;
  },
});

export const updateMember = mutation({
  args: {
    memberId: v.id("members"),
    role: v.optional(roleValidator),
    department: v.optional(v.string()),
    status: v.optional(v.union(v.literal("active"), v.literal("suspended"))),
  },
  handler: async (ctx, args) => {
    const target = await ctx.db.get(args.memberId);
    if (!target) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Member not found." });
    }
    const { user, member, workspace } = await requireCapability(
      ctx,
      target.workspaceId,
      "member.manage",
    );

    if (target.userId === workspace.ownerId && args.role && args.role !== "owner") {
      throw new ConvexError({
        code: "OWNER_LOCKED",
        message: "Transfer ownership before changing the owner's role.",
      });
    }
    if (args.role === "owner") {
      throw new ConvexError({
        code: "INVALID_ROLE",
        message: "Use Transfer ownership to make someone the owner.",
      });
    }
    if (member.role !== "owner" && roleRank(target.role) >= roleRank(member.role)) {
      throw new ConvexError({
        code: "FORBIDDEN",
        message: "You cannot modify someone at or above your own role.",
      });
    }
    if (args.role && member.role !== "owner" && roleRank(args.role) >= roleRank(member.role)) {
      throw new ConvexError({
        code: "FORBIDDEN",
        message: "You cannot promote someone to your own role or higher.",
      });
    }
    if (target.userId === user._id && args.status === "suspended") {
      throw new ConvexError({
        code: "INVALID_INPUT",
        message: "You cannot suspend your own account.",
      });
    }

    const patch: Record<string, unknown> = {};
    if (args.role !== undefined) patch.role = args.role;
    if (args.department !== undefined) patch.department = args.department.trim() || undefined;
    if (args.status !== undefined) patch.status = args.status;

    await ctx.db.patch(args.memberId, patch);

    if (args.role) {
      await notifyUser(ctx, {
        userId: target.userId,
        workspaceId: target.workspaceId,
        type: "role_changed",
        title: "Your role changed",
        body: `You are now a ${args.role} in ${workspace.name}.`,
        link: "/dashboard/settings",
      });
    }

    await writeAudit(ctx, {
      workspaceId: target.workspaceId,
      actorId: user._id,
      action: "member.updated",
      entityType: "member",
      entityId: args.memberId,
      meta: patch,
    });

    return null;
  },
});

/**
 * Removes a member. Their receipts stay in the workspace — expense history is
 * workspace data, not personal data, and deleting it would corrupt reports.
 */
export const removeMember = mutation({
  args: { memberId: v.id("members") },
  handler: async (ctx, args) => {
    const target = await ctx.db.get(args.memberId);
    if (!target) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Member not found." });
    }
    const { user, member, workspace } = await requireCapability(
      ctx,
      target.workspaceId,
      "member.manage",
    );

    if (target.userId === workspace.ownerId) {
      throw new ConvexError({
        code: "OWNER_LOCKED",
        message: "Transfer ownership before removing the owner.",
      });
    }
    if (member.role !== "owner" && roleRank(target.role) >= roleRank(member.role)) {
      throw new ConvexError({
        code: "FORBIDDEN",
        message: "You cannot remove someone at or above your own role.",
      });
    }

    await ctx.db.delete(args.memberId);

    const removedUser = await ctx.db.get(target.userId);
    if (removedUser?.defaultWorkspaceId === target.workspaceId) {
      const other = await ctx.db
        .query("members")
        .withIndex("by_user", (q) => q.eq("userId", target.userId))
        .first();
      await ctx.db.patch(target.userId, { defaultWorkspaceId: other?.workspaceId });
    }

    await writeAudit(ctx, {
      workspaceId: target.workspaceId,
      actorId: user._id,
      action: "member.removed",
      entityType: "member",
      entityId: args.memberId,
      meta: { userId: target.userId },
    });

    return null;
  },
});

export const transferOwnership = mutation({
  args: { toUserId: v.id("users"), confirmName: v.string() },
  handler: async (ctx, args) => {
    const { workspace } = await requireActiveWorkspace(ctx);
    const { user } = await requireCapability(ctx, workspace._id, "workspace.transfer");

    if (args.confirmName.trim() !== workspace.name) {
      throw new ConvexError({
        code: "CONFIRMATION_MISMATCH",
        message: "Type the workspace name exactly to confirm the transfer.",
      });
    }
    if (args.toUserId === user._id) {
      throw new ConvexError({
        code: "INVALID_INPUT",
        message: "You already own this workspace.",
      });
    }

    const nextOwner = await ctx.db
      .query("members")
      .withIndex("by_workspace_user", (q) =>
        q.eq("workspaceId", workspace._id).eq("userId", args.toUserId),
      )
      .unique();

    if (!nextOwner || nextOwner.status !== "active") {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "That person is not an active member of this workspace.",
      });
    }

    const currentOwner = await ctx.db
      .query("members")
      .withIndex("by_workspace_user", (q) =>
        q.eq("workspaceId", workspace._id).eq("userId", user._id),
      )
      .unique();

    await ctx.db.patch(nextOwner._id, { role: "owner" });
    if (currentOwner) await ctx.db.patch(currentOwner._id, { role: "admin" });
    await ctx.db.patch(workspace._id, { ownerId: args.toUserId });

    await notifyUser(ctx, {
      userId: args.toUserId,
      workspaceId: workspace._id,
      type: "ownership_transferred",
      title: "You now own this workspace",
      body: `${user.name ?? "The previous owner"} transferred ${workspace.name} to you.`,
      link: "/dashboard/settings",
    });

    await writeAudit(ctx, {
      workspaceId: workspace._id,
      actorId: user._id,
      action: "workspace.ownership_transferred",
      entityType: "workspace",
      entityId: workspace._id,
      meta: { to: args.toUserId },
    });

    return null;
  },
});

export const leaveWorkspace = mutation({
  args: { workspaceId: v.id("workspaces") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const workspace = await ctx.db.get(args.workspaceId);
    if (!workspace) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Workspace not found." });
    }
    if (workspace.ownerId === user._id) {
      throw new ConvexError({
        code: "OWNER_LOCKED",
        message: "Transfer ownership before leaving this workspace.",
      });
    }

    const membership = await ctx.db
      .query("members")
      .withIndex("by_workspace_user", (q) =>
        q.eq("workspaceId", args.workspaceId).eq("userId", user._id),
      )
      .unique();

    if (membership) await ctx.db.delete(membership._id);

    const other = await ctx.db
      .query("members")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .first();
    await ctx.db.patch(user._id, { defaultWorkspaceId: other?.workspaceId });

    return null;
  },
});
