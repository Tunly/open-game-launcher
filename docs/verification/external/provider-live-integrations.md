# Provider live integrations Evidence

Gate: `provider-live-integrations`
Artifact: `docs/verification/external/provider-live-integrations.md`

> Template only. No external evidence has been captured yet; leave proof rows unchecked until live evidence is attached and redacted.

## Required Environment Names

- `STEAM_WEB_API_KEY` set in the external run environment
- `PRESENCE_PROVIDER_TOKEN` set in the external run environment

## Required Proof Checklist

Check a row only after capturing and redacting its live evidence. `pnpm external:evidence:preflight` accepts `- [x]` only in the artifact assigned to that proof.

- [ ] Nexus website search handoff and Steam Workshop client handoff are verified against live providers.
- [ ] Non-Steam presence bridges return redacted live provider evidence.
- [ ] Provider-approved catalog/cloud transfer flows are verified.
- [ ] Achievement/provider cache E2E runs against real client data.

## Capture Handoff

Use these handoffs to collect redacted live evidence. Handoffs are guidance only; they do not execute commands or satisfy preflight by themselves.

- Nexus website search handoff and Steam Workshop client handoff are verified against live providers.: Hand off an installed game and search to the official Nexus Mods website, open a verified Steam AppID in Steam Workshop, and attach redacted provider/client evidence. Evidence cues: `Nexus`, `Steam Workshop`, `live-provider`.
- Non-Steam presence bridges return redacted live provider evidence.: Exercise non-Steam presence bridges against live provider sessions and attach redacted response evidence for the presence bridge lane. Evidence cues: `non-steam`, `presence-bridge`, `presence-provider`.
- Provider-approved catalog/cloud transfer flows are verified.: Record provider-approved catalog and cloud-transfer review evidence, including the client/provider matrix and approval source. Evidence cues: `catalog-cloud-transfer`, `provider-approved`.
- Achievement/provider cache E2E runs against real client data.: Run achievement/provider cache E2E against real client data and attach redacted run evidence from the cache hydration lane. Evidence cues: `achievement-cache`, `provider-cache`, `real-client`.

## Proof Evidence Mapping

For every checked proof, add a specific redacted run/dashboard/workflow/artifact locator, signed log, or `sha256:<64-hex>` reference. Accepted dashboard URL hosts are Supabase, Stripe live Dashboard, GitHub Actions/releases/deployments, Vercel, Netlify, Cloudflare, App Store Connect, and Google Play Console; otherwise use `run:`/`artifact:`/`sha256:`. Local/example URLs and generic text do not pass.
Stripe Dashboard evidence must use a concrete event, invoice, or tax/invoice-settings path, not generic `/settings`, `/customers`, or `/payments` pages.
Proof evidence values must name the proof lane: `stripe-webhook`, `stripe-tax-invoice`, `license-key-custody-live-license-issuance`, `price-drop`, `presence-poll`, `account-deletion`, `nexus-steam-workshop-live-provider`, `non-steam-presence-bridge-provider`, `provider-approved-catalog-cloud-transfer`, `achievement-provider-cache-real-client`, `fullscreen-anti-cheat-overlay`, `backup-restore`, `client-mount-apply-provider-client`, `community-artwork-rollout`, `plugin-marketplace-execution-update`, or `hosted-deploy`. Compound values must include their required providers, OSes, duration/window, and matrix fields; bare `evt_...` is accepted only for Stripe webhook proof.

- Evidence for Nexus website search handoff and Steam Workshop client handoff are verified against live providers.:
- Evidence for Non-Steam presence bridges return redacted live provider evidence.:
- Evidence for Provider-approved catalog/cloud transfer flows are verified.:
- Evidence for Achievement/provider cache E2E runs against real client data.:

## Gate-Specific Evidence

Add concrete redacted locators or IDs containing digits (`run:`, `probe-`, `session-`, `workflow-`, `deployment-`, or `artifact-`). Hosted cron Run IDs may use lane-specific collector IDs; Stripe webhook IDs must be bare `evt_...` values.
Provider/client matrix values must include both `Nexus` and `Steam Workshop`.

- Provider/client matrix:
- Live probe run ID:
- Provider response evidence:

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
