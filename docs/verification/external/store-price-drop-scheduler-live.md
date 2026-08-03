# Store price-drop scheduler live Evidence

Gate: `store-stripe-live`
Artifact: `docs/verification/external/store-price-drop-scheduler-live.md`

> Template only. No external evidence has been captured yet; leave proof rows unchecked until live evidence is attached and redacted.

## Required Environment Names

- `SUPABASE_URL` set in the external run environment
- `PRICE_DROP_NOTIFY_SECRET` set in the external run environment

## Hosted Cron REST Collector Environment

Required when running `pnpm hosted:cron-evidence`, `pnpm hosted:cron-evidence:packet`, or `pnpm hosted:cron-evidence:artifact-hints` for this artifact; these values collect row evidence only and do not satisfy proof rows by themselves.

- `SUPABASE_REST_URL or SUPABASE_URL or SUPABASE_PROJECT_REF` set in the operator shell
- `SUPABASE_SERVICE_ROLE_KEY or SUPABASE_ANON_KEY + SUPABASE_AUTH_JWT` set in the operator shell

## Required Proof Checklist

Check a row only after capturing and redacting its live evidence. `pnpm external:evidence:preflight` accepts `- [x]` only in the artifact assigned to that proof.

- [ ] Hosted price-drop scheduler writes fresh run evidence.

## Capture Handoff

Use these handoffs to collect redacted live evidence. Handoffs are guidance only; they do not execute commands or satisfy preflight by themselves.

- Hosted price-drop scheduler writes fresh run evidence.: Run `pnpm hosted:deploy-gate:scheduler-packet`, capture redacted scheduler dashboard/config proof, then run the price-drop scheduled lane and collect `OGL_HOSTED_CRON_EVIDENCE_CHECKS=price-drop pnpm hosted:cron-evidence:artifact-hints` for the redacted `store_price_drop_notification_runs` row with `notify-price-drop`, `scheduled`, `dry_run=false`, and `completed`; artifact hints fill Gate-Specific Evidence only and do not satisfy the proof row by themselves. Evidence cues: `price-drop`, `store_price_drop_notification_runs`.

## Proof Evidence Mapping

For every checked proof, add a specific redacted run/dashboard/workflow/artifact locator, signed log, or `sha256:<64-hex>` reference. Accepted dashboard URL hosts are Supabase, Stripe live Dashboard, GitHub Actions/releases/deployments, Vercel, Netlify, Cloudflare, App Store Connect, and Google Play Console; otherwise use `run:`/`artifact:`/`sha256:`. Local/example URLs and generic text do not pass.
Stripe Dashboard evidence must use a concrete event, invoice, or tax/invoice-settings path, not generic `/settings`, `/customers`, or `/payments` pages.
Proof evidence values must name the proof lane: `stripe-webhook`, `stripe-tax-invoice`, `license-key-custody-live-license-issuance`, `price-drop`, `presence-poll`, `account-deletion`, `non-steam-presence-bridge-provider`, `provider-approved-catalog-cloud-transfer`, `achievement-provider-cache-real-client`, `fullscreen-anti-cheat-overlay`, `backup-restore`, `client-mount-apply-provider-client`, `community-artwork-rollout`, `plugin-marketplace-execution-update`, or `hosted-deploy`. Compound values must include their required providers, OSes, duration/window, and matrix fields; bare `evt_...` is accepted only for Stripe webhook proof.

- Evidence for Hosted price-drop scheduler writes fresh run evidence.:

## Gate-Specific Evidence

Add concrete redacted locators or IDs containing digits (`run:`, `probe-`, `session-`, `workflow-`, `deployment-`, or `artifact-`). Hosted cron Run IDs may use lane-specific collector IDs; Stripe webhook IDs must be bare `evt_...` values.
Expected hosted cron values: `Hosted cron table: store_price_drop_notification_runs`, `Function: notify-price-drop`, `Scheduled: scheduled`, `dry_run=false: false` or `confirmed false`, and `Status: completed`.

- Hosted cron table:
- Function:
- Run ID:
- Scheduled:
- dry_run=false:
- Status:
- Hosted cron receipt SHA256:

## Lane-Specific Evidence

- none

## Evidence Captured

Preflight requires non-empty, non-placeholder values below. `Captured at` is a current UTC ISO-8601 timestamp (at most 30 days old and no more than 10 minutes ahead). `Release ref` and the full 40-hex `Commit SHA` must match release CI context. Use positive redaction wording such as `raw secrets removed`; local/private/example locators are invalid.

- Captured at:
- Release ref:
- Commit SHA:
- Operator:
- Environment:
- Redacted run IDs, dashboard links, screenshots, or signed deployment logs:
- Redaction notes:

## Secret Handling

Preflight scans artifact content for secret-shaped values.

- Raw provider keys, Stripe secrets, bearer tokens, JWTs, Supabase service-role/auth/access tokens, scheduler secrets, private keys, and webhook secrets are absent.
- Logs and screenshots are redacted before this artifact is committed.

