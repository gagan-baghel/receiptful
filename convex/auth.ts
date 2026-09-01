import { Password } from "@convex-dev/auth/providers/Password";
import { convexAuth } from "@convex-dev/auth/server";
import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import { action } from "./_generated/server";
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

type SignInArgs = {
  provider?: string;
  params?: unknown;
  verifier?: string;
  refreshToken?: string;
  calledBy?: string;
};

type SignInResult = {
  redirect?: string;
  verifier?: string;
  tokens?: unknown;
  started?: boolean;
};

const {
  auth,
  signIn: unguardedSignIn,
  signOut,
  store,
  isAuthenticated,
} = convexAuth({
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

export { auth, signOut, store, isAuthenticated };

/**
 * The guarded sign-in surface.
 *
 * `unguardedSignIn` is deliberately never exported, so `api.auth.signIn` — the
 * only credential entry point the client or anyone else can reach — always
 * runs through this throttle. The previous design advanced the counter from
 * the browser after a failure, which meant an attacker simply never called it.
 *
 * Only password attempts are throttled. Token refreshes and OAuth callbacks
 * carry no guessable secret and would otherwise be penalised for a user who
 * mistyped their password earlier.
 */
export const signIn = action({
  args: {
    provider: v.optional(v.string()),
    params: v.optional(v.any()),
    verifier: v.optional(v.string()),
    refreshToken: v.optional(v.string()),
    calledBy: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const params = (args.params ?? {}) as Record<string, unknown>;
    const flowParam = typeof params.flow === "string" ? params.flow : undefined;
    const email = typeof params.email === "string" ? params.email : "";

    const flow: "signIn" | "signUp" | "reset" | null =
      args.provider !== "password" || !email
        ? null
        : flowParam === "signUp"
          ? "signUp"
          : flowParam === "reset" || flowParam === "reset-verification"
            ? "reset"
            : "signIn";

    if (flow) {
      const state = await ctx.runQuery(internal.rateLimits.peek, {
        identifier: email,
        flow,
      });

      if (!state.allowed) {
        throw new ConvexError({
          code: "RATE_LIMITED",
          message: `Too many attempts. Try again in ${Math.max(
            1,
            Math.ceil(state.retryAfterSeconds / 60),
          )} minute${Math.ceil(state.retryAfterSeconds / 60) === 1 ? "" : "s"}.`,
          retryAfterSeconds: state.retryAfterSeconds,
        });
      }
    }

    try {
      // ponytail: Convex's registered actions are invocable at runtime but not
      // typed as callable. Calling the handler directly is what lets the
      // unguarded action stay unexported — the alternative is exporting it and
      // leaving an unthrottled endpoint open, which defeats the whole guard.
      // Upgrade path: a first-class `beforeSignIn` hook in @convex-dev/auth.
      const delegate = unguardedSignIn as unknown as (
        actionCtx: typeof ctx,
        actionArgs: SignInArgs,
      ) => Promise<SignInResult>;

      const result = await delegate(ctx, args);
      if (flow) {
        await ctx.runMutation(internal.rateLimits.noteSuccess, {
          identifier: email,
          flow,
        });
      }
      return result;
    } catch (error) {
      if (flow) {
        // Count the failure before rethrowing, so the next attempt sees it even
        // if the caller never reports anything back.
        await ctx.runMutation(internal.rateLimits.noteFailure, {
          identifier: email,
          flow,
        });
      }
      throw error;
    }
  },
});
