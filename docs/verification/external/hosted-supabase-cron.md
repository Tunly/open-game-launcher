# Hosted Supabase cron Evidence

Gate: `hosted-supabase-cron`
Artifact: `docs/verification/external/hosted-supabase-cron.md`

> Template only. No external evidence has been captured yet; leave proof rows unchecked until live evidence is attached and redacted.

## Required Environment Names

- `SUPABASE_URL` set in the external run environment
- `PRICE_DROP_NOTIFY_SECRET` set in the external run environment
- `ACCOUNT_DELETION_PROCESSOR_SECRET` set in the external run environment
- `PRESENCE_POLL_SECRET` set in the external run environment

## Hosted Cron REST Collector Environment

Required when running `pnpm hosted:cron-evidence`, `pnpm hosted:cron-evidence:packet`, or `pnpm hosted:cron-evidence:artifact-hints` for this artifact; these values collect row evidence only and do not satisfy proof rows by themselves.

- `SUPABASE_REST_URL or SUPABASE_URL or SUPABASE_PROJECT_REF` set in the operator shell
- `SUPABASE_SERVICE_ROLE_KEY or SUPABASE_ANON_KEY + SUPABASE_AUTH_JWT` set in the operator shell

## Required Proof Checklist

Check a row only after capturing and redacting its live evidence. `pnpm external:evidence:preflight` accepts `- [x]` only in the artifact assigned to that proof.

- [ ] poll-platform-presence scheduled run writes fresh evidence.
- [ ] notify-price-drop scheduled run writes fresh evidence.
- [ ] process-account-deletions scheduled run writes fresh evidence.

## Capture Handoff

Use these handoffs to collect redacted live evidence. Handoffs are guidance only; they do not execute commands or satisfy preflight by themselves.

- poll-platform-presence scheduled run writes fresh evidence.: Run the presence scheduled lane, use `pnpm hosted:cron-evidence:artifact-hints --checks=presence-poll` for interim validation, then remember that the final hosted-supabase-cron proof needs unscoped grouped `pnpm hosted:cron-evidence:artifact-hints` output after all three scheduler lanes are fresh; paste the reviewed latest non-dry-run `presence_poll_runs` row for `poll-platform-presence`. Evidence cues: `presence-poll`, `presence_poll_runs`.
- notify-price-drop scheduled run writes fresh evidence.: Run the price-drop scheduled lane, use `pnpm hosted:cron-evidence:artifact-hints --checks=price-drop` for interim validation, then remember that the final hosted-supabase-cron proof needs unscoped grouped `pnpm hosted:cron-evidence:artifact-hints` output after all three scheduler lanes are fresh; paste the reviewed latest non-dry-run `store_price_drop_notification_runs` row for `notify-price-drop`. Evidence cues: `price-drop`, `store_price_drop_notification_runs`.
- process-account-deletions scheduled run writes fresh evidence.: Run the account-deletion scheduled lane, use `pnpm hosted:cron-evidence:artifact-hints --checks=account-deletion` for interim validation, then remember that the final hosted-supabase-cron proof needs unscoped grouped `pnpm hosted:cron-evidence:artifact-hints` output after all three scheduler lanes are fresh; paste the reviewed latest non-dry-run `account_deletion_processor_runs` row for `process-account-deletions`. Evidence cues: `account-deletion`, `account_deletion_processor_runs`.

## Proof Evidence Mapping

For every checked proof, add a specific redacted run/dashboard/workflow/artifact locator, signed log, or `sha256:<64-hex>` reference. Accepted dashboard URL hosts are Supabase, GitHub Actions/releases/deployments, Vercel, Netlify, Cloudflare, App Store Connect, and Google Play Console; otherwise use `run:`/`artifact:`/`sha256:`. Local/example URLs and generic text do not pass.
Proof evidence values must name the proof lane: `license-key-custody-live-license-issuance`, `price-drop`, `presence-poll`, `account-deletion`, `non-steam-presence-bridge-provider`, `provider-approved-catalog-cloud-transfer`, `achievement-provider-cache-real-client`, `fullscreen-anti-cheat-overlay`, `backup-restore`, `client-mount-apply-provider-client`, `community-artwork-rollout`, `plugin-marketplace-execution-update`, or `hosted-deploy`. Compound values must include their required providers, OSes, duration/window, and matrix fields; bare `evt_...` is accepted only for Stripe webhook proof.

- Evidence for poll-platform-presence scheduled run writes fresh evidence.:
- Evidence for notify-price-drop scheduled run writes fresh evidence.:
- Evidence for process-account-deletions scheduled run writes fresh evidence.:

## Gate-Specific Evidence

- none

## Lane-Specific Evidence

Fill one section per lane with the matching `pnpm hosted:cron-evidence:artifact-hints` output after operator review. A single hosted cron detail block cannot satisfy multiple scheduled lanes.
Expected hosted cron values: `Hosted cron table: store_price_drop_notification_runs`, `Function: notify-price-drop`, `Scheduled: scheduled`, `dry_run=false: false` or `confirmed false`, and `Status: completed` for price-drop; `Hosted cron table: presence_poll_runs`, `Function: poll-platform-presence`, `Scheduled: scheduled`, `dry_run=false: false` or `confirmed false`, and `Status: completed` for presence-poll; `Hosted cron table: account_deletion_processor_runs`, `Function: process-account-deletions`, `Scheduled: scheduled`, `dry_run=false: false` or `confirmed false`, and `Status: completed` for account-deletion.

### price-drop

- Hosted cron table:
- Function:
- Run ID:
- Scheduled:
- dry_run=false:
- Status:
- Hosted cron receipt SHA256:

### presence-poll

- Hosted cron table:
- Function:
- Run ID:
- Scheduled:
- dry_run=false:
- Status:
- Hosted cron receipt SHA256:

### account-deletion

- Hosted cron table:
- Function:
- Run ID:
- Scheduled:
- dry_run=false:
- Status:
- Hosted cron receipt SHA256:

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

- Raw provider keys, bearer tokens, JWTs, Supabase service-role/auth/access tokens, scheduler secrets, and private keys are absent.
- Logs and screenshots are redacted before this artifact is committed.

