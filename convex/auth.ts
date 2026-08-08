import { Password } from "@convex-dev/auth/providers/Password";
import { convexAuth } from "@convex-dev/auth/server";
import { ConvexError } from "convex/values";
import type { DataModel, Id } from "./_generated/dataModel";
import { createWorkspaceForUser, ensureSettings } from "./model/bootstrap";
import { ResetPasswordEmail } from "./model/email";

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new ConvexError({ code: "INVALID_INPUT", message: `${field} is required.` });
  }
  return value.trim();
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const ReceiptfulPassword = Password<DataModel>({
  profile(params) {
    const email = requireString(params.email, "Email").toLowerCase();
    if (!EMAIL_PATTERN.test(email)) {
      throw new ConvexError({
        code: "INVALID_INPUT",
        message: "Enter a valid email address.",
      });
    }

    const name = typeof params.name === "string" ? params.name.trim() : "";

    return {
      email,
      name: name.length > 0 ? name : email.split("@")[0],
    };
  },
  validatePasswordRequirements(password) {
    if (password.length < 8) {
      throw new ConvexError({
        code: "WEAK_PASSWORD",
        message: "Password must be at least 8 characters.",
      });
    }
    if (!/[a-z]/.test(password) || !/[A-Z]/.test(password)) {
      throw new ConvexError({
        code: "WEAK_PASSWORD",
        message: "Password must include an uppercase and a lowercase letter.",
      });
    }
    if (!/[0-9]/.test(password)) {
      throw new ConvexError({
        code: "WEAK_PASSWORD",
        message: "Password must include at least one number.",
      });
    }
  },
  reset: ResetPasswordEmail,
});

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [ReceiptfulPassword],
  callbacks: {
    async afterUserCreatedOrUpdated(ctx, { userId, existingUserId }) {
      if (existingUserId) return;

      const typedUserId = userId as Id<"users">;
      await ensureSettings(ctx as never, typedUserId);

      const user = await ctx.db.get(typedUserId);
      const displayName =
        (user as { name?: string } | null)?.name?.trim() || "My";

      await createWorkspaceForUser(ctx as never, typedUserId, {
        name: `${displayName}'s Workspace`,
      });
    },
  },
});
