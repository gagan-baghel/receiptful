import type { EmailConfig } from "@convex-dev/auth/server";
import { ConvexError } from "convex/values";

/**
 * Transactional email for password resets.
 *
 * Delivery goes through Resend when AUTH_RESEND_KEY is set on the Convex
 * deployment. Without it the flow refuses loudly rather than pretending an
 * email was sent — a silent no-op here would strand users at a dead end.
 */
function generateCode() {
  const bytes = new Uint8Array(4);
  crypto.getRandomValues(bytes);
  // 8 digits, zero-padded, from cryptographic randomness.
  const value = new DataView(bytes.buffer).getUint32(0) % 100_000_000;
  return String(value).padStart(8, "0");
}

async function sendWithResend(args: {
  to: string;
  subject: string;
  html: string;
  text: string;
}) {
  const apiKey = process.env.AUTH_RESEND_KEY;

  if (!apiKey) {
    throw new ConvexError({
      code: "EMAIL_NOT_CONFIGURED",
      message:
        "Password reset email could not be sent because no email provider is configured. Set AUTH_RESEND_KEY on the Convex deployment, or ask a workspace admin to reset your access.",
    });
  }

  const from = process.env.AUTH_EMAIL_FROM ?? "Receiptful <onboarding@resend.dev>";

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [args.to],
      subject: args.subject,
      html: args.html,
      text: args.text,
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new ConvexError({
      code: "EMAIL_SEND_FAILED",
      message: `Could not send the reset email (${response.status}). ${detail.slice(0, 200)}`,
    });
  }
}

/**
 * Invitation email. Returns false when no provider is configured so the caller
 * can tell the admin to share the link by hand instead of pretending it sent.
 */
export async function sendInviteEmail(args: {
  to: string;
  workspaceName: string;
  inviterName: string;
  role: string;
  url: string;
}): Promise<boolean> {
  if (!process.env.AUTH_RESEND_KEY) return false;

  const who = args.inviterName ? `${args.inviterName} invited you` : "You have been invited";
  const escape = (value: string) =>
    value.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

  await sendWithResend({
    to: args.to,
    subject: `${who} to ${args.workspaceName} on Receiptful`,
    text: `${who} to join ${args.workspaceName} on Receiptful as a ${args.role}.\n\nAccept: ${args.url}\n\nThis link expires in 7 days.`,
    html: `
      <div style="font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;color:#0f172a">
        <h1 style="font-size:20px;margin:0 0 8px">Join ${escape(args.workspaceName)}</h1>
        <p style="margin:0 0 24px;color:#475569;font-size:14px;line-height:1.6">
          ${escape(who)} to track receipts and expenses together as a <strong>${escape(args.role)}</strong>.
        </p>
        <p style="margin:0 0 24px">
          <a href="${escape(args.url)}" style="display:inline-block;background:#0f172a;color:#fff;text-decoration:none;padding:11px 20px;border-radius:6px;font-size:14px;font-weight:600">Accept invitation</a>
        </p>
        <p style="margin:0;color:#64748b;font-size:13px;line-height:1.6">
          This link expires in 7 days. If you weren't expecting it, you can ignore this email.
        </p>
      </div>
    `,
  });

  return true;
}

export const ResetPasswordEmail: EmailConfig = {
  id: "reset-password-email",
  type: "email",
  name: "Password reset",
  from: process.env.AUTH_EMAIL_FROM ?? "Receiptful <onboarding@resend.dev>",
  maxAge: 60 * 20, // 20 minutes
  // The provider owns code generation so the code never round-trips the client.
  generateVerificationToken: async () => generateCode(),
  async sendVerificationRequest({ identifier: email, token, expires }) {
    const minutes = Math.max(
      1,
      Math.round((expires.getTime() - Date.now()) / 60_000),
    );

    await sendWithResend({
      to: email,
      subject: `${token} is your Receiptful reset code`,
      text: `Your Receiptful password reset code is ${token}. It expires in ${minutes} minutes. If you didn't request this, you can ignore this email.`,
      html: `
        <div style="font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;color:#0f172a">
          <h1 style="font-size:20px;margin:0 0 8px">Reset your password</h1>
          <p style="margin:0 0 24px;color:#475569;font-size:14px;line-height:1.6">
            Enter this code in Receiptful to choose a new password.
          </p>
          <p style="font-size:32px;font-weight:700;letter-spacing:6px;margin:0 0 24px;font-variant-numeric:tabular-nums">${token}</p>
          <p style="margin:0;color:#64748b;font-size:13px;line-height:1.6">
            This code expires in ${minutes} minutes. If you didn't request a password reset, you can safely ignore this email.
          </p>
        </div>
      `,
    });
  },
} as EmailConfig;
