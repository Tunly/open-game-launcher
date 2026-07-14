# Store and Stripe live staging Evidence

Gate: `store-stripe-live`
Artifact: `docs/verification/external/store-stripe-live-staging.md`

> Template only. No external evidence has been captured yet; leave proof rows unchecked until live evidence is attached and redacted.

## Required Environment Names

- `SUPABASE_URL` set in the external run environment
- `STRIPE_SECRET_KEY` set in the external run environment
- `STRIPE_WEBHOOK_SECRET` set in the external run environment

## Required Proof Checklist

Check a row only after capturing and redacting its live evidence. `pnpm external:evidence:preflight` accepts `- [x]` only in the artifact assigned to that proof.

- [ ] Stripe webhook signature delivery reaches stripe-webhook.
- [ ] Stripe Tax and invoice settings are verified in Dashboard.
- [ ] Production license signing key custody and live license issuance are verified.

## Capture Handoff

Use these handoffs to collect redacted live evidence. Handoffs are guidance only; they do not execute commands or satisfy preflight by themselves.

- Stripe webhook signature delivery reaches stripe-webhook.: Trigger a live Stripe webhook delivery to stripe-webhook, then attach the redacted Stripe event locator and Supabase function log run ID. Evidence cues: `stripe-webhook`, `evt_`.
- Stripe Tax and invoice settings are verified in Dashboard.: Capture redacted Stripe live Dashboard evidence for Tax, invoice creation, and billing settings used by the release checkout lane. Evidence cues: `stripe-tax-invoice`, `dashboard`.
- Production license signing key custody and live license issuance are verified.: Capture redacted hosted runtime-secret custody evidence for the production license signing key, then issue a live license through the Stripe webhook fulfillment path and attach the redacted license/order/function locator without exposing the signing key. Evidence cues: `license-key-custody`, `live-license-issuance`.

## Proof Evidence Mapping

For every checked proof, add a specific redacted run/dashboard/workflow/artifact locator, signed log, or `sha256:<64-hex>` reference. Accepted dashboard URL hosts are Supabase, Stripe live Dashboard, GitHub Actions/releases/deployments, Vercel, Netlify, Cloudflare, App Store Connect, and Google Play Console; otherwise use `run:`/`artifact:`/`sha256:`. Local/example URLs and generic text do not pass.
Stripe Dashboard evidence must use a concrete event, invoice, or tax/invoice-settings path, not generic `/settings`, `/customers`, or `/payments` pages.
Proof evidence values must name the proof lane: `stripe-webhook`, `stripe-tax-invoice`, `license-key-custody-live-license-issuance`, `price-drop`, `presence-poll`, `account-deletion`, `nexus-steam-workshop-live-provider`, `non-steam-presence-bridge-provider`, `provider-approved-catalog-cloud-transfer`, `achievement-provider-cache-real-client`, `fullscreen-anti-cheat-overlay`, `backup-restore`, `client-mount-apply-provider-client`, `community-artwork-rollout`, `plugin-marketplace-execution-update`, or `hosted-deploy`. Compound values must include their required providers, OSes, duration/window, and matrix fields; bare `evt_...` is accepted only for Stripe webhook proof.

- Evidence for Stripe webhook signature delivery reaches stripe-webhook.:
- Evidence for Stripe Tax and invoice settings are verified in Dashboard.:
- Evidence for Production license signing key custody and live license issuance are verified.:

## Gate-Specific Evidence

Add concrete redacted locators or IDs containing digits (`run:`, `probe-`, `session-`, `workflow-`, `deployment-`, or `artifact-`). Hosted cron Run IDs may use lane-specific collector IDs; Stripe webhook IDs must be bare `evt_...` values.

- Stripe webhook event ID:
- Stripe Dashboard evidence:
- Supabase function log run ID:
- License key custody evidence:
- Live license issuance evidence:

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
