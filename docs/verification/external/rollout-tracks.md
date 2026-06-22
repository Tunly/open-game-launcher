# Rollout tracks Evidence

Gate: `rollout-tracks`
Artifact: `docs/verification/external/rollout-tracks.md`

> Template only. No external evidence has been captured yet; leave proof rows unchecked until live evidence is attached and redacted.

## Required Environment Names

- none

## Required Proof Checklist

Leave each item unchecked until the external run evidence is captured and redacted. `pnpm external:evidence:preflight` accepts checked `- [x]` rows only in the artifact assigned to that proof.

- [ ] Hosted community artwork/screenshots rollout is exercised beyond fixtures.
- [ ] Production controller layout rollout and profile sync are verified.
- [ ] Plugin marketplace execution/update channels are externally reviewed.
- [ ] Native mobile apps, push-provider delivery, and store distribution are verified.
- [ ] Hosted production deployment evidence is attached.

Here, screenshots means hosted community screenshot content, not `docs/verification/screenshots/*` artifacts.

## Capture Handoff

Use these operator handoffs to collect redacted live evidence before checking proof rows. Handoffs are guidance only; they do not execute commands or satisfy preflight by themselves.

- Hosted community artwork/screenshots rollout is exercised beyond fixtures.: Exercise hosted community artwork and screenshot rollout beyond local fixtures, then attach redacted rollout evidence. Evidence cues: `community-artwork`, `community-screenshots`, `screenshot-rollout`.
- Production controller layout rollout and profile sync are verified.: Verify production controller layout rollout and profile sync, then attach redacted sync and rollout evidence. Evidence cues: `controller-layout`, `profile-sync`.
- Plugin marketplace execution/update channels are externally reviewed.: Attach external review evidence for plugin marketplace execution and update channels without including raw package secrets. Evidence cues: `plugin-marketplace`, `marketplace-execution`, `marketplace-update`, `plugin-update`.
- Native mobile apps, push-provider delivery, and store distribution are verified.: Verify native mobile app distribution and push-provider delivery in store consoles, then attach redacted console evidence. Evidence cues: `mobile`, `store-distribution`, `push-provider`.
- Hosted production deployment evidence is attached.: Run `pnpm hosted:deploy-gate:packet`, then run GitHub Actions `CI` from `main` with `hosted_deploy_gate=true`, `hosted_environment=hosted-production`, `hosted_deploy_action=all`, and `hosted_deploy_dry_run=false`; paste a labelled `hosted-deploy` GitHub Actions run URL plus those CI inputs into both the proof evidence row and `Hosted deploy evidence`. Evidence cues: `hosted-deploy`, `workflow`.

## Proof Evidence Mapping

When a proof row is checked, fill the matching evidence line with a specific redacted run ID, dashboard link, external artifact locator, workflow ID, signed log, or `sha256:<64-hex>` reference. Accepted dashboard URL hosts are Supabase, Stripe live Dashboard, GitHub Actions/releases/deployments, Vercel, Netlify, Cloudflare, App Store Connect, Google Play Console, Firebase, and OneSignal; otherwise use `run:`/`artifact:`/`sha256:` style locators. Generic text such as `redacted`, `see above`, local files, localhost URLs, and example URLs do not satisfy preflight.
Proof evidence values must name the proof lane they support, for example `stripe-webhook`, `stripe-tax-invoice`, `license-key-custody-live-license-issuance`, `price-drop`, `presence-poll`, `account-deletion`, `mod.io/CurseForge`, `non-steam-presence-bridge-provider`, `provider-approved-catalog-cloud-transfer`, `achievement-provider-cache-real-client`, `fullscreen-anti-cheat-overlay`, `backup-restore`, `client-mount-apply-provider-client`, `community-artwork-screenshot-rollout`, `controller-layout-profile-sync`, `plugin-marketplace-execution-update`, `mobile-push-provider-store-distribution`, or `hosted-deploy`; bare `evt_...` values are accepted only for the Stripe webhook signature proof. Syntactically specific but generic IDs such as `run-generic-1` stay blocked. Compound proof values must include every required term in the same value: mod-provider evidence includes both `mod.io` and `CurseForge`; external-drive backup/restore proof evidence includes `Windows`, `macOS`, and `Linux`; long native overlay proof evidence includes a numeric measured duration/window; hardware matrix evidence includes one `Windows`, one `macOS`, and one `Linux` row, each with `title:`, `client:`, and a specific locator.

- Evidence for Hosted community artwork/screenshots rollout is exercised beyond fixtures.:
- Evidence for Production controller layout rollout and profile sync are verified.:
- Evidence for Plugin marketplace execution/update channels are externally reviewed.:
- Evidence for Native mobile apps, push-provider delivery, and store distribution are verified.:
- Evidence for Hosted production deployment evidence is attached.:

## Gate-Specific Evidence

Fill these rows with concrete external values for this gate. Keep secrets redacted; values must still include a specific accepted locator or ID containing digits, such as `run:...`, `probe-...`, `session-...`, `workflow-...`, `deployment-...`, or `artifact-...`; lane-specific hosted cron collector IDs such as `price-drop-cli-scheduled` are accepted for hosted cron Run ID rows, and Stripe webhook event IDs must be bare `evt_...` values.
Community rollout evidence must include `community`, `artwork`, `screenshot`, and `rollout`.
Controller layout/profile sync evidence must include `controller`, `layout`, `profile`, and `sync`.
Marketplace evidence must include `plugin`, `marketplace`, and either `execution` or `update`.
Mobile distribution evidence must include `mobile`, `store`, and `distribution`.
Push-provider evidence must include `push`, `provider`, and either `Firebase` or `OneSignal`.
Hosted deploy evidence must include `hosted-deploy`, a GitHub Actions run URL, `CI`, `main`, `hosted_deploy_gate=true`, `hosted_environment=hosted-production`, `hosted_deploy_action=all`, and `hosted_deploy_dry_run=false`.

- Community rollout evidence:
- Controller layout/profile sync evidence:
- Marketplace evidence:
- Mobile distribution evidence:
- Push-provider evidence:
- Hosted deploy evidence:

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
