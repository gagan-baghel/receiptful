import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import {
  assertCapability,
  notifyUser,
  requireActiveWorkspace,
  requireMember,
  requireReceipt,
  requireUser,
  writeActivity,
  writeAudit,
} from "./model/guards";

/** Approvals visible to the caller: their own submissions and, for reviewers, the queue. */
export const list = query({
  args: {},
  handler: async (ctx) => {
    const { workspace, member, user } = await requireActiveWorkspace(ctx);
    const canReview = ["owner", "admin", "manager"].includes(member.role);

    const rows = canReview
      ? await ctx.db
          .query("approvals")
          .withIndex("by_workspace_status", (q) =>
            q.eq("workspaceId", workspace._id).eq("status", "submitted"),
          )
          .collect()
      : [];

    const mine = await ctx.db
      .query("approvals")
      .withIndex("by_submitter", (q) => q.eq("submitterId", user._id))
      .order("desc")
      .take(50);

    const decided = canReview
      ? (
          await ctx.db
            .query("approvals")
            .withIndex("by_workspace_status", (q) =>
              q.eq("workspaceId", workspace._id).eq("status", "approved"),
            )
            .order("desc")
            .take(25)
        ).concat(
          await ctx.db
            .query("approvals")
            .withIndex("by_workspace_status", (q) =>
              q.eq("workspaceId", workspace._id).eq("status", "rejected"),
            )
            .order("desc")
            .take(25),
        )
      : [];

    const hydrate = async (approval: (typeof rows)[number]) => {
      const submitter = await ctx.db.get(approval.submitterId);
      const report = approval.reportId ? await ctx.db.get(approval.reportId) : null;
      const receipt = approval.receiptId ? await ctx.db.get(approval.receiptId) : null;
      const comments = await ctx.db
        .query("approvalComments")
        .withIndex("by_approval", (q) => q.eq("approvalId", approval._id))
        .collect();

      return {
        _id: approval._id,
        status: approval.status,
        amountCents: approval.amountCents,
        submittedAt: approval.submittedAt,
        decidedAt: approval.decidedAt,
        submitterName: submitter?.name ?? "",
        submitterId: approval.submitterId,
        reportId: approval.reportId,
        receiptId: approval.receiptId,
        title: report?.name ?? receipt?.merchant ?? "Expense",
        subtitle: report
          ? `${report.receiptIds.length} receipts · ${report.fromDate} to ${report.toDate}`
          : receipt
            ? receipt.date
            : "",
        commentCount: comments.length,
      };
    };

    return {
      queue: await Promise.all(rows.map(hydrate)),
      mine: await Promise.all(mine.map(hydrate)),
      decided: await Promise.all(
        decided.sort((a, b) => (b.decidedAt ?? 0) - (a.decidedAt ?? 0)).map(hydrate),
      ),
      canReview,
      currency: workspace.baseCurrency,
    };
  },
});

export const get = query({
  args: { approvalId: v.id("approvals") },
  handler: async (ctx, args) => {
    const approval = await ctx.db.get(args.approvalId);
    if (!approval) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Approval not found." });
    }
    const { member, user } = await requireMember(ctx, approval.workspaceId);

    const canReview = ["owner", "admin", "manager"].includes(member.role);
    if (!canReview && approval.submitterId !== user._id) {
      throw new ConvexError({ code: "FORBIDDEN", message: "Approval not found." });
    }

    const comments = await ctx.db
      .query("approvalComments")
      .withIndex("by_approval", (q) => q.eq("approvalId", args.approvalId))
      .collect();

    const submitter = await ctx.db.get(approval.submitterId);
    const report = approval.reportId ? await ctx.db.get(approval.reportId) : null;

    return {
      _id: approval._id,
      status: approval.status,
      amountCents: approval.amountCents,
      submittedAt: approval.submittedAt,
      decidedAt: approval.decidedAt,
      submitterName: submitter?.name ?? "",
      reportId: approval.reportId,
      receiptId: approval.receiptId,
      reportName: report?.name ?? null,
      canReview,
      history: await Promise.all(
        comments
          .sort((a, b) => a._creationTime - b._creationTime)
          .map(async (comment) => {
            const author = await ctx.db.get(comment.authorId);
            return {
              _id: comment._id,
              body: comment.body,
              action: comment.action,
              createdAt: comment._creationTime,
              authorName: author?.name ?? "",
              authorImage: author?.image,
            };
          }),
      ),
    };
  },
});

export const submitReport = mutation({
  args: { reportId: v.id("reports"), note: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const report = await ctx.db.get(args.reportId);
    if (!report) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Report not found." });
    }
    const { user, workspace, member } = await requireMember(ctx, report.workspaceId);
    assertCapability(member.role, "report.create");

    if (report.createdBy !== user._id) {
      throw new ConvexError({
        code: "FORBIDDEN",
        message: "Only the report's author can submit it.",
      });
    }
    if (report.approvalStatus === "submitted") {
      throw new ConvexError({
        code: "ALREADY_SUBMITTED",
        message: "This report is already in review.",
      });
    }
    if (report.approvalStatus === "approved") {
      throw new ConvexError({
        code: "ALREADY_APPROVED",
        message: "This report was already approved.",
      });
    }

    const reviewers = (
      await ctx.db
        .query("members")
        .withIndex("by_workspace", (q) => q.eq("workspaceId", workspace._id))
        .collect()
    ).filter(
      (candidate) =>
        candidate.userId !== user._id &&
        candidate.status === "active" &&
        ["owner", "admin", "manager"].includes(candidate.role),
    );

    if (reviewers.length === 0) {
      throw new ConvexError({
        code: "NO_REVIEWER",
        message:
          "No one can review this yet. Invite a manager or admin to the workspace first.",
      });
    }

    // The submitter's own manager gets it when one is set.
    const assigned =
      reviewers.find((reviewer) => reviewer.userId === member.managerId) ?? reviewers[0];

    const approvalId = await ctx.db.insert("approvals", {
      workspaceId: workspace._id,
      reportId: args.reportId,
      submitterId: user._id,
      reviewerId: assigned.userId,
      status: "submitted",
      amountCents: report.totalCents,
      submittedAt: Date.now(),
    });

    await ctx.db.patch(args.reportId, {
      approvalStatus: "submitted",
      submittedAt: Date.now(),
    });

    for (const receiptId of report.receiptIds) {
      await ctx.db.patch(receiptId, { approvalStatus: "submitted" });
    }

    if (args.note?.trim()) {
      await ctx.db.insert("approvalComments", {
        approvalId,
        authorId: user._id,
        body: args.note.trim().slice(0, 2000),
        action: "submitted",
      });
    }

    for (const reviewer of reviewers) {
      await notifyUser(ctx, {
        userId: reviewer.userId,
        workspaceId: workspace._id,
        type: "approval",
        title: "Expense report submitted",
        body: `${user.name ?? "A teammate"} submitted "${report.name}" for approval.`,
        link: `/dashboard/approvals/${approvalId}`,
      });
    }

    await writeAudit(ctx, {
      workspaceId: workspace._id,
      actorId: user._id,
      action: "approval.submitted",
      entityType: "approval",
      entityId: approvalId,
      meta: { reportId: args.reportId, amountCents: report.totalCents },
    });

    return approvalId;
  },
});

export const decide = mutation({
  args: {
    approvalId: v.id("approvals"),
    decision: v.union(
      v.literal("approved"),
      v.literal("rejected"),
      v.literal("returned"),
    ),
    comment: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const approval = await ctx.db.get(args.approvalId);
    if (!approval) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Approval not found." });
    }
    const { user, member, workspace } = await requireMember(ctx, approval.workspaceId);
    assertCapability(member.role, "receipt.approve");

    if (approval.submitterId === user._id) {
      throw new ConvexError({
        code: "SELF_APPROVAL",
        message: "You cannot review your own submission.",
      });
    }
    // Assignment has to mean something. A manager who is not the assigned
    // reviewer cannot quietly decide someone else's queue; owners and admins
    // can, because someone has to be able to unblock a departed reviewer.
    const canOverride = member.role === "owner" || member.role === "admin";
    if (approval.reviewerId && approval.reviewerId !== user._id && !canOverride) {
      throw new ConvexError({
        code: "NOT_REVIEWER",
        message: "This submission is assigned to another reviewer.",
      });
    }
    if (approval.status !== "submitted") {
      throw new ConvexError({
        code: "ALREADY_DECIDED",
        message: "This submission has already been reviewed.",
      });
    }
    if (args.decision !== "approved" && !args.comment?.trim()) {
      throw new ConvexError({
        code: "COMMENT_REQUIRED",
        message: "Add a comment explaining the decision.",
      });
    }

    await ctx.db.patch(args.approvalId, {
      status: args.decision,
      decidedBy: user._id,
      decidedAt: Date.now(),
    });

    if (args.comment?.trim()) {
      await ctx.db.insert("approvalComments", {
        approvalId: args.approvalId,
        authorId: user._id,
        body: args.comment.trim().slice(0, 2000),
        action: args.decision,
      });
    }

    if (approval.reportId) {
      const report = await ctx.db.get(approval.reportId);
      await ctx.db.patch(approval.reportId, { approvalStatus: args.decision });
      for (const receiptId of report?.receiptIds ?? []) {
        await ctx.db.patch(receiptId, { approvalStatus: args.decision });
        await writeActivity(ctx, {
          workspaceId: workspace._id,
          receiptId,
          actorId: user._id,
          type: `approval_${args.decision}`,
          summary: `Expense ${args.decision} by ${user.name ?? "reviewer"}`,
        });
      }
    }

    if (approval.receiptId) {
      await ctx.db.patch(approval.receiptId, { approvalStatus: args.decision });
    }

    const verb =
      args.decision === "approved"
        ? "approved"
        : args.decision === "rejected"
          ? "rejected"
          : "returned for changes";

    await notifyUser(ctx, {
      userId: approval.submitterId,
      workspaceId: workspace._id,
      type: "approval",
      title: `Expense ${verb}`,
      body: args.comment?.trim()
        ? `${user.name ?? "Your reviewer"}: ${args.comment.trim().slice(0, 140)}`
        : `${user.name ?? "Your reviewer"} ${verb} your submission.`,
      link: `/dashboard/approvals/${args.approvalId}`,
    });

    await writeAudit(ctx, {
      workspaceId: workspace._id,
      actorId: user._id,
      action: `approval.${args.decision}`,
      entityType: "approval",
      entityId: args.approvalId,
    });

    return null;
  },
});

export const withdraw = mutation({
  args: { approvalId: v.id("approvals") },
  handler: async (ctx, args) => {
    const approval = await ctx.db.get(args.approvalId);
    if (!approval) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Approval not found." });
    }
    const user = await requireUser(ctx);
    await requireMember(ctx, approval.workspaceId);

    if (approval.submitterId !== user._id) {
      throw new ConvexError({
        code: "FORBIDDEN",
        message: "Only the submitter can withdraw this.",
      });
    }
    if (approval.status !== "submitted") {
      throw new ConvexError({
        code: "ALREADY_DECIDED",
        message: "This submission has already been reviewed.",
      });
    }

    if (approval.reportId) {
      const report = await ctx.db.get(approval.reportId);
      await ctx.db.patch(approval.reportId, {
        approvalStatus: "none",
        submittedAt: undefined,
      });
      for (const receiptId of report?.receiptIds ?? []) {
        await ctx.db.patch(receiptId, { approvalStatus: "none" });
      }
    }
    if (approval.receiptId) {
      await ctx.db.patch(approval.receiptId, { approvalStatus: "none" });
    }

    // The submission and its comments are the audit trail the product promises,
    // so withdrawal closes the approval rather than erasing it.
    await ctx.db.patch(args.approvalId, {
      status: "none",
      withdrawnAt: Date.now(),
      decidedAt: Date.now(),
    });

    await ctx.db.insert("approvalComments", {
      approvalId: args.approvalId,
      authorId: user._id,
      body: "Withdrew this submission.",
      action: "none",
    });

    await writeAudit(ctx, {
      workspaceId: approval.workspaceId,
      actorId: user._id,
      action: "approval.withdrawn",
      entityType: "approval",
      entityId: args.approvalId,
    });

    return null;
  },
});

/**
 * Submits a single receipt for approval — the path a workspace's
 * `requireApprovalOverCents` threshold routes through. Previously the schema
 * carried `approvals.receiptId` and four functions read it, but nothing ever
 * created one, so the whole single-receipt branch was unreachable.
 */
export const submitReceipt = mutation({
  args: { receiptId: v.id("receipts"), note: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const { receipt, user, workspace, member } = await requireReceipt(ctx, args.receiptId);
    assertCapability(member.role, "receipt.create");

    if (receipt.uploaderId !== user._id) {
      throw new ConvexError({
        code: "FORBIDDEN",
        message: "Only the person who added a receipt can submit it.",
      });
    }
    if (receipt.approvalStatus === "submitted") {
      throw new ConvexError({
        code: "ALREADY_SUBMITTED",
        message: "This receipt is already in review.",
      });
    }
    if (receipt.approvalStatus === "approved") {
      throw new ConvexError({
        code: "ALREADY_APPROVED",
        message: "This receipt was already approved.",
      });
    }
    if (receipt.amountCents <= 0) {
      throw new ConvexError({
        code: "INCOMPLETE",
        message: "Add an amount before submitting this receipt.",
      });
    }

    const reviewers = (
      await ctx.db
        .query("members")
        .withIndex("by_workspace", (q) => q.eq("workspaceId", workspace._id))
        .collect()
    ).filter(
      (candidate) =>
        candidate.userId !== user._id &&
        candidate.status === "active" &&
        ["owner", "admin", "manager"].includes(candidate.role),
    );

    if (reviewers.length === 0) {
      throw new ConvexError({
        code: "NO_REVIEWER",
        message:
          "No one can review this yet. Invite a manager or admin to the workspace first.",
      });
    }

    const assigned =
      reviewers.find((reviewer) => reviewer.userId === member.managerId) ?? reviewers[0];

    const approvalId = await ctx.db.insert("approvals", {
      workspaceId: workspace._id,
      receiptId: args.receiptId,
      submitterId: user._id,
      reviewerId: assigned.userId,
      status: "submitted",
      amountCents: receipt.baseAmountCents,
      submittedAt: Date.now(),
    });

    await ctx.db.patch(args.receiptId, { approvalStatus: "submitted" });

    if (args.note?.trim()) {
      await ctx.db.insert("approvalComments", {
        approvalId,
        authorId: user._id,
        body: args.note.trim().slice(0, 2000),
        action: "submitted",
      });
    }

    await notifyUser(ctx, {
      userId: assigned.userId,
      workspaceId: workspace._id,
      type: "approval",
      title: "Expense submitted",
      body: `${user.name ?? "A teammate"} submitted ${receipt.merchant || "a receipt"} for approval.`,
      link: `/dashboard/approvals/${approvalId}`,
    });

    await writeActivity(ctx, {
      workspaceId: workspace._id,
      receiptId: args.receiptId,
      actorId: user._id,
      type: "approval_submitted",
      summary: "Submitted for approval",
    });

    await writeAudit(ctx, {
      workspaceId: workspace._id,
      actorId: user._id,
      action: "approval.submitted",
      entityType: "approval",
      entityId: approvalId,
      meta: { receiptId: args.receiptId, amountCents: receipt.baseAmountCents },
    });

    return approvalId;
  },
});

export const comment = mutation({
  args: { approvalId: v.id("approvals"), body: v.string() },
  handler: async (ctx, args) => {
    const approval = await ctx.db.get(args.approvalId);
    if (!approval) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Approval not found." });
    }
    const { user, member, workspace } = await requireMember(ctx, approval.workspaceId);

    const canReview = ["owner", "admin", "manager"].includes(member.role);
    if (!canReview && approval.submitterId !== user._id) {
      throw new ConvexError({ code: "FORBIDDEN", message: "Approval not found." });
    }

    const body = args.body.trim();
    if (!body) {
      throw new ConvexError({ code: "INVALID_INPUT", message: "Comment cannot be empty." });
    }

    const commentId = await ctx.db.insert("approvalComments", {
      approvalId: args.approvalId,
      authorId: user._id,
      body: body.slice(0, 2000),
    });

    const recipient =
      approval.submitterId === user._id ? approval.reviewerId : approval.submitterId;

    if (recipient) {
      await notifyUser(ctx, {
        userId: recipient,
        workspaceId: workspace._id,
        type: "approval",
        title: "New comment on an expense",
        body: `${user.name ?? "Someone"}: ${body.slice(0, 140)}`,
        link: `/dashboard/approvals/${args.approvalId}`,
      });
    }

    return commentId;
  },
});
