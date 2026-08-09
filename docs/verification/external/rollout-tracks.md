# Rollout tracks Evidence

Gate: `rollout-tracks`
Artifact: `docs/verification/external/rollout-tracks.md`

> Template only. No external evidence has been captured yet; leave proof rows unchecked until live evidence is attached and redacted.

## Required Environment Names

- none

## Required Proof Checklist

Check a row only after capturing and redacting its live evidence. `pnpm external:evidence:preflight` accepts `- [x]` only in the artifact assigned to that proof.

- [ ] Hosted community artwork rollout is exercised beyond fixtures.
- [ ] Plugin marketplace execution/update channels are externally reviewed.
- [ ] Hosted production deployment evidence is attached.

## Capture Handoff

Use these handoffs to collect redacted live evidence. Handoffs are guidance only; they do not execute commands or satisfy preflight by themselves.

- Hosted community artwork rollout is exercised beyond fixtures.: Exercise hosted community artwork rollout beyond local fixtures, then attach redacted rollout evidence. Evidence cues: `community-artwork`, `artwork-rollout`.
- Plugin marketplace execution/update channels are externally reviewed.: Attach external review evidence for plugin marketplace execution and update channels without including raw package secrets. Evidence cues: `plugin-marketplace`, `marketplace-execution`, `marketplace-update`, `plugin-update`.
- Hosted production deployment evidence is attached.: Run `pnpm hosted:deploy-gate:packet`, then run GitHub Actions `CI` from `main` with `hosted_deploy_gate=true`, `hosted_environment=hosted-production`, `hosted_deploy_action=all`, and `hosted_deploy_dry_run=false`; paste a labelled `hosted-deploy` GitHub Actions run URL plus those CI inputs into both the proof evidence row and `Hosted deploy evidence`. Evidence cues: `hosted-deploy`, `workflow`.

## Proof Evidence Mapping

For every checked proof, add a specific redacted run/dashboard/workflow/artifact locator, signed log, or `sha256:<64-hex>` reference. Accepted dashboard URL hosts are Supabase, GitHub Actions/releases/deployments, Vercel, Netlify, Cloudflare, App Store Connect, and Google Play Console; otherwise use `run:`/`artifact:`/`sha256:`. Local/example URLs and generic text do not pass.
Proof evidence values must name the proof lane: `license-key-custody-live-license-issuance`, `price-drop`, `presence-poll`, `account-deletion`, `non-steam-presence-bridge-provider`, `provider-approved-catalog-cloud-transfer`, `achievement-provider-cache-real-client`, `fullscreen-anti-cheat-overlay`, `backup-restore`, `client-mount-apply-provider-client`, `community-artwork-rollout`, `plugin-marketplace-execution-update`, or `hosted-deploy`. Compound values must include their required providers, OSes, duration/window, and matrix fields; bare `evt_...` is accepted only for Stripe webhook proof.

- Evidence for Hosted community artwork rollout is exercised beyond fixtures.:
- Evidence for Plugin marketplace execution/update channels are externally reviewed.:
- Evidence for Hosted production deployment evidence is attached.:

## Gate-Specific Evidence

Add concrete redacted locators or IDs containing digits (`run:`, `probe-`, `session-`, `workflow-`, `deployment-`, or `artifact-`). Hosted cron Run IDs may use lane-specific collector IDs.
Community rollout evidence must include `community`, `artwork`, and `rollout`.
Marketplace evidence must include `plugin`, `marketplace`, and either `execution` or `update`.
Hosted deploy evidence must include `hosted-deploy`, a GitHub Actions run URL, `CI`, `main`, `hosted_deploy_gate=true`, `hosted_environment=hosted-production`, `hosted_deploy_action=all`, and `hosted_deploy_dry_run=false`.

- Community rollout evidence:
- Marketplace evidence:
- Hosted deploy evidence:

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

- Raw provider keys, bearer tokens, JWTs, Supabase service-role/auth/access tokens, scheduler secrets, and private keys are absent.
- Logs and screenshots are redacted before this artifact is committed.

