# Hosted Supabase cron Evidence

Gate: `hosted-supabase-cron`
Artifact: `docs/verification/external/hosted-supabase-cron.md`

> Template only. No external evidence has been captured yet; leave proof rows unchecked until live evidence is attached and redacted.

## Required Environment Names

- `SUPABASE_URL` set in the external run environment
- `PRICE_DROP_NOTIFY_SECRET` set in the external run environment
- `ACCOUNT_DELETION_PROCESSOR_SECRET` set in the external run environment
- `PRESENCE_POLL_SECRET` set in the external run environment

## Required Proof Checklist

Leave each item unchecked until the external run evidence is captured and redacted. `pnpm external:evidence:preflight` accepts checked `- [x]` rows only in the artifact assigned to that proof.

- [ ] poll-platform-presence scheduled run writes fresh evidence.
- [ ] notify-price-drop scheduled run writes fresh evidence.
- [ ] process-account-deletions scheduled run writes fresh evidence.

## Proof Evidence Mapping

When a proof row is checked, fill the matching evidence line with a specific redacted run ID, dashboard link, external artifact locator, workflow ID, signed log, or `sha256:<64-hex>` reference. Accepted dashboard URL hosts are Supabase, Stripe live Dashboard, GitHub Actions/releases/deployments, Vercel, Netlify, Cloudflare, App Store Connect, Google Play Console, Firebase, and OneSignal; otherwise use `run:`/`artifact:`/`sha256:` style locators. Generic text such as `redacted`, `see above`, local files, localhost URLs, and example URLs do not satisfy preflight.
Proof evidence values must name the proof lane they support, for example `stripe-webhook`, `stripe-tax-invoice`, `price-drop`, `presence-poll`, `account-deletion`, `mod.io/CurseForge`, `presence-bridge`, `catalog-cloud-transfer`, `achievement-cache`, `overlay`, `backup-restore`, `client-mount-apply`, `community-rollout`, `controller-profile-sync`, `plugin-marketplace`, `mobile-push`, or `hosted-deploy`; bare `evt_...` values are accepted only for the Stripe webhook signature proof. Syntactically specific but generic IDs such as `run-generic-1` stay blocked. Compound proof values must include every required term in the same value: mod-provider evidence includes both `mod.io` and `CurseForge`; external-drive backup/restore proof evidence and hardware matrix evidence include `Windows`, `macOS`, and `Linux`.

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

### presence-poll
- Hosted cron table:
- Function:
- Run ID:
- Scheduled:
- dry_run=false:
- Status:

### account-deletion
- Hosted cron table:
- Function:
- Run ID:
- Scheduled:
- dry_run=false:
- Status:

## Evidence Captured

Preflight requires non-empty, non-placeholder values for each evidence detail field below. `Captured at` must be a freshly captured current UTC ISO-8601 timestamp within 30 days and not more than 10 minutes in the future. `Release ref` must name the release tag, `Commit SHA` must be a full 40-hex commit, and release CI requires them to match `GITHUB_REF_NAME` and `GITHUB_SHA` exactly. `Redaction notes` must use positive wording such as `raw secrets removed`, `tokens redacted`, or `no raw secrets`; contradictory wording such as `not redacted`, `unredacted`, `contains raw`, or `not reviewed` is rejected. Local `docs/verification/screenshots/*` paths, `file://` URLs, localhost/loopback/private-network URLs, and `example.com` URLs do not satisfy external completion evidence.

- Captured at:
- Release ref:
- Commit SHA:
- Operator:
- Environment:
- Redacted run IDs, dashboard links, screenshots, or signed deployment logs:
- Redaction notes:

## Secret Handling

Operator reminders only. Preflight enforces this boundary by scanning artifact content for secret-shaped values.

- Raw provider keys, Stripe secrets, bearer tokens, JWTs, Supabase service-role/auth/access tokens, scheduler secrets, mobile push/provider secrets, private keys, device tokens, and webhook secrets are absent.
- Logs and screenshots are redacted before this artifact is committed.
