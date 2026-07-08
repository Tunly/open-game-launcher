# Store and Stripe live staging Evidence

Gate: `store-stripe-live`
Artifact: `docs/verification/external/store-stripe-live-staging.md`

> Template only. No external evidence has been captured yet; leave proof rows unchecked until live evidence is attached and redacted.

## Required Environment Names

- `SUPABASE_URL` set in the external run environment
- `STRIPE_SECRET_KEY` set in the external run environment
- `STRIPE_WEBHOOK_SECRET` set in the external run environment

## Required Proof Checklist

Leave each item unchecked until the external run evidence is captured and redacted. `pnpm external:evidence:preflight` accepts checked `- [x]` rows only in the artifact assigned to that proof.

- [ ] Stripe webhook signature delivery reaches stripe-webhook.
- [ ] Stripe Tax and invoice settings are verified in Dashboard.
- [ ] Production license signing key custody and live license issuance are verified.

## Capture Handoff

Use these operator handoffs to collect redacted live evidence before checking proof rows. Handoffs are guidance only; they do not execute commands or satisfy preflight by themselves.

- Stripe webhook signature delivery reaches stripe-webhook.: Trigger a live Stripe webhook delivery to stripe-webhook, then attach the redacted Stripe event locator and Supabase function log run ID. Evidence cues: `stripe-webhook`, `evt_`.
- Stripe Tax and invoice settings are verified in Dashboard.: Capture redacted Stripe live Dashboard evidence for Tax, invoice creation, and billing settings used by the release checkout lane. Evidence cues: `stripe-tax-invoice`, `dashboard`.
- Production license signing key custody and live license issuance are verified.: Capture redacted hosted runtime-secret custody evidence for the production license signing key, then issue a live license through the Stripe webhook fulfillment path and attach the redacted license/order/function locator without exposing the signing key. Evidence cues: `license-key-custody`, `live-license-issuance`.

## Proof Evidence Mapping

When a proof row is checked, fill the matching evidence line with a specific redacted run ID, dashboard link, external artifact locator, workflow ID, signed log, or `sha256:<64-hex>` reference. Accepted dashboard URL hosts are Supabase, Stripe live Dashboard, GitHub Actions/releases/deployments, Vercel, Netlify, Cloudflare, App Store Connect, Google Play Console, Firebase, and OneSignal; otherwise use `run:`/`artifact:`/`sha256:` style locators. Generic text such as `redacted`, `see above`, local files, localhost URLs, and example URLs do not satisfy preflight.
Stripe Dashboard URLs used for Store/Stripe evidence must point at concrete detail paths such as `/events/evt_...`, `/invoices/in_...`, or targeted tax/invoice settings; generic `/settings`, `/customers`, and `/payments` dashboard pages do not satisfy preflight.
Proof evidence values must name the proof lane they support, for example `stripe-webhook`, `stripe-tax-invoice`, `license-key-custody-live-license-issuance`, `price-drop`, `presence-poll`, `account-deletion`, `mod.io/CurseForge`, `non-steam-presence-bridge-provider`, `provider-approved-catalog-cloud-transfer`, `achievement-provider-cache-real-client`, `fullscreen-anti-cheat-overlay`, `backup-restore`, `client-mount-apply-provider-client`, `community-artwork-screenshot-rollout`, `plugin-marketplace-execution-update`, `mobile-push-provider-store-distribution`, or `hosted-deploy`; bare `evt_...` values are accepted only for the Stripe webhook signature proof. Syntactically specific but generic IDs such as `run-generic-1` stay blocked. Compound proof values must include every required term in the same value: mod-provider evidence includes both `mod.io` and `CurseForge`; external-drive backup/restore proof evidence includes `Windows`, `macOS`, and `Linux`; long native overlay proof evidence includes a numeric measured duration/window; hardware matrix evidence includes one `Windows`, one `macOS`, and one `Linux` row, each with `title:`, `client:`, and a specific locator.

- Evidence for Stripe webhook signature delivery reaches stripe-webhook.:
- Evidence for Stripe Tax and invoice settings are verified in Dashboard.:
- Evidence for Production license signing key custody and live license issuance are verified.:

## Gate-Specific Evidence

Fill these rows with concrete external values for this gate. Keep secrets redacted; values must still include a specific accepted locator or ID containing digits, such as `run:...`, `probe-...`, `session-...`, `workflow-...`, `deployment-...`, or `artifact-...`; lane-specific hosted cron collector IDs such as `price-drop-cli-scheduled` are accepted for hosted cron Run ID rows, and Stripe webhook event IDs must be bare `evt_...` values.

- Stripe webhook event ID:
- Stripe Dashboard evidence:
- Supabase function log run ID:
- License key custody evidence:
- Live license issuance evidence:

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
