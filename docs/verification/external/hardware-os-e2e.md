# Hardware and OS E2E Evidence

Gate: `hardware-os-e2e`
Artifact: `docs/verification/external/hardware-os-e2e.md`

> Template only. No external evidence has been captured yet; leave proof rows unchecked until live evidence is attached and redacted.

## Required Environment Names

- none

## Required Proof Checklist

Check a row only after capturing and redacting its live evidence. `pnpm external:evidence:preflight` accepts `- [x]` only in the artifact assigned to that proof.

- [ ] Fullscreen/anti-cheat overlay evidence is captured on real titles.
- [ ] Long native overlay sessions produce stable runtime/session evidence.
- [ ] External-drive backup/restore E2E runs on Windows, macOS, and Linux.
- [ ] Real client mount/apply behavior is tested against provider clients.

## Capture Handoff

Use these handoffs to collect redacted live evidence. Handoffs are guidance only; they do not execute commands or satisfy preflight by themselves.

- Fullscreen/anti-cheat overlay evidence is captured on real titles.: Capture real-title fullscreen and anti-cheat overlay behavior with redacted title, OS, and session evidence. Evidence cues: `overlay`, `fullscreen`, `anti-cheat`.
- Long native overlay sessions produce stable runtime/session evidence.: Run long native overlay sessions and attach redacted runtime/session evidence showing stability over the measured window. Evidence cues: `native-overlay`, `long-session`.
- External-drive backup/restore E2E runs on Windows, macOS, and Linux.: Run external-drive backup and restore E2E on Windows, macOS, and Linux, then attach redacted per-OS run evidence. Evidence cues: `external-drive`, `backup-restore`, `Windows`, `macOS`, `Linux`.
- Real client mount/apply behavior is tested against provider clients.: Exercise real client mount/apply behavior against provider clients and attach redacted apply, rollback, and provider-client evidence. Evidence cues: `client-mount`, `mount-apply`, `provider-client`.

## Proof Evidence Mapping

For every checked proof, add a specific redacted run/dashboard/workflow/artifact locator, signed log, or `sha256:<64-hex>` reference. Accepted dashboard URL hosts are Supabase, Stripe live Dashboard, GitHub Actions/releases/deployments, Vercel, Netlify, Cloudflare, App Store Connect, and Google Play Console; otherwise use `run:`/`artifact:`/`sha256:`. Local/example URLs and generic text do not pass.
Stripe Dashboard evidence must use a concrete event, invoice, or tax/invoice-settings path, not generic `/settings`, `/customers`, or `/payments` pages.
Proof evidence values must name the proof lane: `stripe-webhook`, `stripe-tax-invoice`, `license-key-custody-live-license-issuance`, `price-drop`, `presence-poll`, `account-deletion`, `non-steam-presence-bridge-provider`, `provider-approved-catalog-cloud-transfer`, `achievement-provider-cache-real-client`, `fullscreen-anti-cheat-overlay`, `backup-restore`, `client-mount-apply-provider-client`, `community-artwork-rollout`, `plugin-marketplace-execution-update`, or `hosted-deploy`. Compound values must include their required providers, OSes, duration/window, and matrix fields; bare `evt_...` is accepted only for Stripe webhook proof.

- Evidence for Fullscreen/anti-cheat overlay evidence is captured on real titles.:
- Evidence for Long native overlay sessions produce stable runtime/session evidence.:
- Evidence for External-drive backup/restore E2E runs on Windows, macOS, and Linux.:
- Evidence for Real client mount/apply behavior is tested against provider clients.:

## Gate-Specific Evidence

Add concrete redacted locators or IDs containing digits (`run:`, `probe-`, `session-`, `workflow-`, `deployment-`, or `artifact-`). Hosted cron Run IDs may use lane-specific collector IDs; Stripe webhook IDs must be bare `evt_...` values.
OS/title/client matrix values must include one `Windows`, one `macOS`, and one `Linux` row separated by `|` or `;`; each row must include `title:`, `client:`, and a specific locator.
Session/run ID values must include `overlay`, `session`/`run`, and a numeric duration/window such as `duration:30m`.

- OS/title/client matrix:
- Hardware profile:
- Session/run ID:

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

