# Hardware and OS E2E Evidence

Gate: `hardware-os-e2e`
Artifact: `docs/verification/external/hardware-os-e2e.md`

> Template only. No external evidence has been captured yet; leave proof rows unchecked until live evidence is attached and redacted.

## Required Environment Names

- none

## Required Proof Checklist

Leave each item unchecked until the external run evidence is captured and redacted. `pnpm external:evidence:preflight` accepts checked `- [x]` rows only in the artifact assigned to that proof.

- [ ] Fullscreen/anti-cheat overlay evidence is captured on real titles.
- [ ] Long native overlay sessions produce stable runtime/session evidence.
- [ ] External-drive backup/restore E2E runs on Windows, macOS, and Linux.
- [ ] Real client mount/apply behavior is tested against provider clients.

## Capture Handoff

Use these operator handoffs to collect redacted live evidence before checking proof rows. Handoffs are guidance only; they do not execute commands or satisfy preflight by themselves.

- Fullscreen/anti-cheat overlay evidence is captured on real titles.: Capture real-title fullscreen and anti-cheat overlay behavior with redacted title, OS, and session evidence. Evidence cues: `overlay`, `fullscreen`, `anti-cheat`.
- Long native overlay sessions produce stable runtime/session evidence.: Run long native overlay sessions and attach redacted runtime/session evidence showing stability over the measured window. Evidence cues: `native-overlay`, `long-session`.
- External-drive backup/restore E2E runs on Windows, macOS, and Linux.: Run external-drive backup and restore E2E on Windows, macOS, and Linux, then attach redacted per-OS run evidence. Evidence cues: `external-drive`, `backup-restore`, `Windows`, `macOS`, `Linux`.
- Real client mount/apply behavior is tested against provider clients.: Exercise real client mount/apply behavior against provider clients and attach redacted apply, rollback, and provider-client evidence. Evidence cues: `client-mount`, `mount-apply`, `provider-client`.

## Proof Evidence Mapping

When a proof row is checked, fill the matching evidence line with a specific redacted run ID, dashboard link, external artifact locator, workflow ID, signed log, or `sha256:<64-hex>` reference. Accepted dashboard URL hosts are Supabase, Stripe live Dashboard, GitHub Actions/releases/deployments, Vercel, Netlify, Cloudflare, App Store Connect, Google Play Console, Firebase, and OneSignal; otherwise use `run:`/`artifact:`/`sha256:` style locators. Generic text such as `redacted`, `see above`, local files, localhost URLs, and example URLs do not satisfy preflight.
Proof evidence values must name the proof lane they support, for example `stripe-webhook`, `stripe-tax-invoice`, `license-key-custody-live-license-issuance`, `price-drop`, `presence-poll`, `account-deletion`, `mod.io/CurseForge`, `non-steam-presence-bridge-provider`, `provider-approved-catalog-cloud-transfer`, `achievement-provider-cache-real-client`, `fullscreen-anti-cheat-overlay`, `backup-restore`, `client-mount-apply-provider-client`, `community-artwork-screenshot-rollout`, `controller-layout-profile-sync`, `plugin-marketplace-execution-update`, `mobile-push-provider-store-distribution`, or `hosted-deploy`; bare `evt_...` values are accepted only for the Stripe webhook signature proof. Syntactically specific but generic IDs such as `run-generic-1` stay blocked. Compound proof values must include every required term in the same value: mod-provider evidence includes both `mod.io` and `CurseForge`; external-drive backup/restore proof evidence and hardware matrix evidence include `Windows`, `macOS`, and `Linux`.

- Evidence for Fullscreen/anti-cheat overlay evidence is captured on real titles.:
- Evidence for Long native overlay sessions produce stable runtime/session evidence.:
- Evidence for External-drive backup/restore E2E runs on Windows, macOS, and Linux.:
- Evidence for Real client mount/apply behavior is tested against provider clients.:

## Gate-Specific Evidence

Fill these rows with concrete external values for this gate. Keep secrets redacted; values must still include a specific accepted locator or ID containing digits, such as `run:...`, `probe-...`, `session-...`, `workflow-...`, `deployment-...`, or `artifact-...`; lane-specific hosted cron collector IDs such as `price-drop-cli-scheduled` are accepted for hosted cron Run ID rows, and Stripe webhook event IDs must be bare `evt_...` values.
OS/title/client matrix values must include `Windows`, `macOS`, and `Linux`.

- OS/title/client matrix:
- Hardware profile:
- Session/run ID:

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

- Raw provider keys, Stripe secrets, bearer tokens, JWTs, Supabase service-role/auth/access tokens, scheduler secrets, mobile push/provider secrets, private keys, device tokens, and webhook secrets are absent.
- Logs and screenshots are redacted before this artifact is committed.
