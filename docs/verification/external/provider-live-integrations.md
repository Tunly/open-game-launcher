# Provider live integrations Evidence

Gate: `provider-live-integrations`
Artifact: `docs/verification/external/provider-live-integrations.md`

> Template only. No external evidence has been captured yet; leave proof rows unchecked until live evidence is attached and redacted.

## Required Environment Names

- `STEAM_WEB_API_KEY` set in the external run environment
- `PRESENCE_PROVIDER_TOKEN` set in the external run environment
- `MOD_IO_API_KEY` set in the external run environment
- `CURSEFORGE_API_KEY` set in the external run environment

## Required Proof Checklist

Leave each item unchecked until the external run evidence is captured and redacted. `pnpm external:evidence:preflight` accepts checked `- [x]` rows only in the artifact assigned to that proof.

- [ ] mod.io and CurseForge staging probes use real provider keys.
- [ ] Non-Steam presence bridges return redacted live provider evidence.
- [ ] Provider-approved catalog/cloud transfer flows are verified.
- [ ] Achievement/provider cache E2E runs against real client data.

## Capture Handoff

Use these operator handoffs to collect redacted live evidence before checking proof rows. Handoffs are guidance only; they do not execute commands or satisfy preflight by themselves.

- mod.io and CurseForge staging probes use real provider keys.: Run live staging probes with real mod.io and CurseForge credentials, then attach redacted provider response and rate-limit evidence. Evidence cues: `mod.io`, `CurseForge`, `live-probe`.
- Non-Steam presence bridges return redacted live provider evidence.: Exercise non-Steam presence bridges against live provider sessions and attach redacted response evidence for the presence bridge lane. Evidence cues: `non-steam`, `presence-bridge`, `presence-provider`.
- Provider-approved catalog/cloud transfer flows are verified.: Record provider-approved catalog and cloud-transfer review evidence, including the client/provider matrix and approval source. Evidence cues: `catalog-cloud-transfer`, `provider-approved`.
- Achievement/provider cache E2E runs against real client data.: Run achievement/provider cache E2E against real client data and attach redacted run evidence from the cache hydration lane. Evidence cues: `achievement-cache`, `provider-cache`, `real-client`.

## Proof Evidence Mapping

When a proof row is checked, fill the matching evidence line with a specific redacted run ID, dashboard link, external artifact locator, workflow ID, signed log, or `sha256:<64-hex>` reference. Accepted dashboard URL hosts are Supabase, Stripe live Dashboard, GitHub Actions/releases/deployments, Vercel, Netlify, Cloudflare, App Store Connect, and Google Play Console; otherwise use `run:`/`artifact:`/`sha256:` style locators. Generic text such as `redacted`, `see above`, local files, localhost URLs, and example URLs do not satisfy preflight.
Stripe Dashboard URLs used for Store/Stripe evidence must point at concrete detail paths such as `/events/evt_...`, `/invoices/in_...`, or targeted tax/invoice settings; generic `/settings`, `/customers`, and `/payments` dashboard pages do not satisfy preflight.
Proof evidence values must name the proof lane they support, for example `stripe-webhook`, `stripe-tax-invoice`, `license-key-custody-live-license-issuance`, `price-drop`, `presence-poll`, `account-deletion`, `mod.io/CurseForge`, `non-steam-presence-bridge-provider`, `provider-approved-catalog-cloud-transfer`, `achievement-provider-cache-real-client`, `fullscreen-anti-cheat-overlay`, `backup-restore`, `client-mount-apply-provider-client`, `community-artwork-rollout`, `plugin-marketplace-execution-update`, or `hosted-deploy`; bare `evt_...` values are accepted only for the Stripe webhook signature proof. Syntactically specific but generic IDs such as `run-generic-1` stay blocked. Compound proof values must include every required term in the same value: mod-provider evidence includes both `mod.io` and `CurseForge`; external-drive backup/restore proof evidence includes `Windows`, `macOS`, and `Linux`; long native overlay proof evidence includes a numeric measured duration/window; hardware matrix evidence includes one `Windows`, one `macOS`, and one `Linux` row, each with `title:`, `client:`, and a specific locator.

- Evidence for mod.io and CurseForge staging probes use real provider keys.:
- Evidence for Non-Steam presence bridges return redacted live provider evidence.:
- Evidence for Provider-approved catalog/cloud transfer flows are verified.:
- Evidence for Achievement/provider cache E2E runs against real client data.:

## Gate-Specific Evidence

Fill these rows with concrete external values for this gate. Keep secrets redacted; values must still include a specific accepted locator or ID containing digits, such as `run:...`, `probe-...`, `session-...`, `workflow-...`, `deployment-...`, or `artifact-...`; lane-specific hosted cron collector IDs such as `price-drop-cli-scheduled` are accepted for hosted cron Run ID rows, and Stripe webhook event IDs must be bare `evt_...` values.
Provider/client matrix values must include both `mod.io` and `CurseForge`.

- Provider/client matrix:
- Live probe run ID:
- Provider response evidence:

## Lane-Specific Evidence

- none

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

- Raw provider keys, Stripe secrets, bearer tokens, JWTs, Supabase service-role/auth/access tokens, scheduler secrets, private keys, and webhook secrets are absent.
- Logs and screenshots are redacted before this artifact is committed.
