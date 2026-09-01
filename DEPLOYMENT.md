# Deploying Receiptful

## 1. Provision the production Convex deployment

```bash
npx convex deploy
```

This creates the prod deployment and prints its URL. Everything below is set
against **prod**, so pass `--prod` on each command.

## 2. Set the auth keys on prod

Convex Auth signs its own JWTs, so prod needs its own keypair:

```bash
node -e '
const { generateKeyPair, exportPKCS8, exportJWK } = require("jose");
generateKeyPair("RS256", { extractable: true }).then(async ({ privateKey, publicKey }) => {
  const { execFileSync } = require("child_process");
  const jwks = JSON.stringify({ keys: [{ use: "sig", ...(await exportJWK(publicKey)) }] });
  execFileSync("npx", ["convex", "env", "set", "--prod", "JWT_PRIVATE_KEY", "--", await exportPKCS8(privateKey)], { stdio: "inherit" });
  execFileSync("npx", ["convex", "env", "set", "--prod", "JWKS", "--", jwks], { stdio: "inherit" });
});'
```

Then point auth at the real origin:

```bash
npx convex env set --prod SITE_URL https://your-domain.com
```

## 3. Turn on automatic extraction

Without this the app still works end to end — receipts upload, store and land in
the review queue with a clear "enter the details manually" notice. With it, every
field is read automatically.

```bash
npx convex env set --prod ANTHROPIC_API_KEY sk-ant-...
```

## 4. Enable password-reset emails (optional)

Sign-in and sign-up work without this. The *forgot password* flow needs an email
sender, and says so plainly if it's missing rather than silently failing.

```bash
npx convex env set --prod AUTH_RESEND_KEY re_...
npx convex env set --prod AUTH_EMAIL_FROM "Receiptful <noreply@your-domain.com>"
```

## 4b. Billing entitlements

Plan changes grant real seats and storage, so self-serve upgrades are refused
unless you opt in. Leave this unset until a payment provider is wired up:

```bash
npx convex env set --prod BILLING_SELF_SERVE 1
```

Invitation emails go out through the same Resend key as password resets. Without
it, invites are still created and the team screen says to share the link by hand.

## 5. Deploy the web app

Set these on the host (Vercel, etc.):

| Variable | Value |
|---|---|
| `CONVEX_DEPLOY_KEY` | from the Convex dashboard → Settings → Deploy keys |
| `NEXT_PUBLIC_CONVEX_URL` | the prod deployment URL from step 1 |

Build command:

```bash
npx convex deploy --cmd 'npm run build'
```

This pushes the backend and builds the frontend against it in one step.

## 6. Smoke test

1. Sign up — you should land on `/dashboard/welcome` with a workspace already
   holding 14 categories, 3 folders and 5 tags.
2. Add a receipt — it uploads, generates a thumbnail, and either fills in
   automatically or lands in the review queue.
3. Check `/dashboard/tax` and export a report as CSV.

## After deploying rollups

Dashboard and analytics totals are served from a pre-aggregated `rollups`
table, maintained incrementally on every receipt write. Receipts created before
that table existed need one backfill:

```bash
npx convex run --prod maintenance:rebuildRollups
```

Safe to re-run at any time — it clears each workspace's buckets before
recounting them.

## Scheduled jobs

These run automatically once deployed (see `convex/crons.ts`):

| Job | When | What it does |
|---|---|---|
| Budget alerts | daily 07:00 UTC | Notifies managers once per period when spend crosses a threshold |
| Purge trash | daily 03:00 UTC | Permanently removes receipts deleted more than 30 days ago |
| Expire invites | daily 03:30 UTC | Clears resolved invitations older than 60 days |
| Auto-archive | daily 04:00 UTC | Archives receipts past a member's auto-archive window |
| Account deletion | daily 04:30 UTC | Completes deletions past their 30-day grace period |
| Exchange rates | daily 05:00 UTC | Refreshes FX rates for multi-currency totals |
| Tax reminders | 5th of Jan/Apr/Jul/Oct | Nudges owners about unreviewed deductible receipts |

## Local development

```bash
npm run dev        # Next.js and Convex together
npm run verify     # typecheck, unit checks, production build
```
