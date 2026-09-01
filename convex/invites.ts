"use node";

import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction } from "./_generated/server";
import { sendInviteEmail } from "./model/email";

/**
 * Delivers an invitation. Scheduled from `team.invite` rather than awaited, so
 * a slow or misconfigured mail provider never blocks creating the invite — the
 * link works either way, and the team screen still shows it for manual sharing.
 */
export const deliver = internalAction({
  args: {
    inviteId: v.id("invites"),
    to: v.string(),
    token: v.string(),
    workspaceName: v.string(),
    inviterName: v.string(),
    role: v.string(),
  },
  handler: async (ctx, args) => {
    const origin = (process.env.SITE_URL ?? "").replace(/\/$/, "");
    if (!origin) return null;

    try {
      const sent = await sendInviteEmail({
        to: args.to,
        workspaceName: args.workspaceName,
        inviterName: args.inviterName,
        role: args.role,
        url: `${origin}/join/${args.token}`,
      });
      await ctx.runMutation(internal.team.markInviteDelivery, {
        inviteId: args.inviteId,
        sent,
      });
    } catch {
      // Delivery is best-effort; the invite link is already valid.
      await ctx.runMutation(internal.team.markInviteDelivery, {
        inviteId: args.inviteId,
        sent: false,
      });
    }
    return null;
  },
});
