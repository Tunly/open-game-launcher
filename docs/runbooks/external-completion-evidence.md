# External Completion Evidence

This runbook covers the release-blocking proof that cannot be produced by the
local deterministic test suite. External gates remain incomplete until their
committed artifacts contain reviewed, redacted live evidence and pass preflight.
The artifact index and current templates live in
[`docs/verification/external/`](../verification/external/README.md).

## Operator sequence

1. Inspect the current boundary and generate a redacted handoff:

   ```bash
   pnpm completion:gate:status
   pnpm external:evidence:status
   pnpm external:evidence:next
   pnpm external:evidence:worklist
   pnpm external:evidence:packet
   pnpm external:evidence:runbook
   ```

2. Prepare hosted deployment or scheduler commands where the gate requires
   them:

   ```bash
   pnpm hosted:deploy-gate:plan
   pnpm hosted:deploy-gate:packet
   pnpm hosted:deploy-gate:scheduler-packet
   pnpm hosted:cron-evidence:plan
   pnpm hosted:cron-evidence:packet
   ```

3. Capture the live run in the named external system. Fill the matching
   committed template with redacted locators, required detail fields, a current
   UTC timestamp, release ref and commit SHA. Remove its `Template only` banner
   and check a proof row only after its evidence has been reviewed.

4. Run the scoped preparation check:

   ```bash
   OGL_EXTERNAL_EVIDENCE_GATES=<gate-id> pnpm external:evidence:preflight
   ```

   PowerShell:

   ```powershell
   $env:OGL_EXTERNAL_EVIDENCE_GATES='<gate-id>'
   pnpm external:evidence:preflight
   Remove-Item Env:OGL_EXTERNAL_EVIDENCE_GATES
   ```

5. Run the unscoped release boundary with the real release tag/SHA context:

   ```bash
   pnpm completion:gate:status
   pnpm completion:gate:external
   ```

Scoped preflight is only a lane preparation check. It never replaces the final
unscoped check.

## Command roles

- `external:evidence:status` emits machine-readable readiness and redacted
  reason codes without failing on missing proof.
- `external:evidence:next` prints only non-ready gates and their next actions.
  It is the compact non-mutating handoff.
- `external:evidence:worklist` lists every artifact field and proof still to
  fill.
- `external:evidence:packet` produces one redacted handoff document.
- `external:evidence:runbook` prints the generated capture sequence. Use it as
  the sequenced operator runbook.
- `external:evidence:template` prints current templates; generated templates
  also contain per-proof `Capture Handoff` guidance.
- `external:evidence:preflight` validates environment shapes, artifact and
  proof ownership, detail fields, locators, release freshness, cron receipts
  and secret-free content.

These commands are non-mutating unless their own help says otherwise. Handoff
output does not prove an external run, fill an artifact, or check a proof row.
It never prints raw environment values.

## Release boundary

`pnpm completion:gate` is the current-platform rehearsal. It runs the local
deterministic gate, hosted deploy preflight/smoke, hosted cron collection and
external evidence preflight. It is expected to fail until real external proof
and required environment values exist.

Its hosted boundary includes `pnpm hosted:deploy-gate:preflight` and
`pnpm hosted:deploy-gate:smoke`.

The final `pnpm completion:gate:external` run is unscoped and requires the
release context through `GITHUB_REF_NAME` or `GITHUB_REF` plus `GITHUB_SHA`.
The release tag path waits for coverage before the external completion gate.
The release tag workflow waits for coverage and the frontend, Rust and Supabase
CI jobs, then runs this gate in the `hosted-production` Environment before
creating draft-release artifacts. It also verifies launcher/Tauri version
alignment and rejects a `v*` tag whose commit is not current `origin/main`.
Cross-platform signoff comes from the configured CI runners. In CI, coverage
runs as a separate threshold-enforcing CI job. CI does not duplicate the local
Tauri debug-bundle smoke.

During the release-boundary cron lane, one gitignored receipt path is shared by
`hosted:cron-evidence` and `external:evidence:preflight`. Scheduler artifacts
must contain the collector's `Hosted cron receipt SHA256`. Preflight compares
the receipt SHA, selected lanes, table, function, run ID, scheduled/non-dry-run
state and status. A missing, stale, scoped, mismatched or secret-bearing receipt
keeps the boundary red even if the Markdown rows look complete.

## Gate map

## store-stripe-live

Required shell environment:

- `SUPABASE_URL`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `PRICE_DROP_NOTIFY_SECRET`

Artifacts:

- [`docs/verification/external/store-stripe-live-staging.md`](../verification/external/store-stripe-live-staging.md)
- [`docs/verification/external/store-price-drop-scheduler-live.md`](../verification/external/store-price-drop-scheduler-live.md)

Proof covers the live Stripe webhook signature, Stripe Tax/invoice settings,
production signing-key custody plus live license issuance, and one fresh hosted
price-drop scheduler run. `OGL_LICENSE_SIGNING_KEY` is a hosted runtime
prerequisite but deliberately is not a preflight shell variable; prove
custody with redacted evidence and a
`live license issuance/order/function locator`. Never paste the signing key.

Capture checkout/webhook, Stripe Dashboard, Supabase `stripe-webhook`, order or
license and secret-custody locators in the Stripe artifact. Collect only the
price-drop scheduler lane for the second artifact:

```bash
OGL_HOSTED_CRON_EVIDENCE_CHECKS=price-drop pnpm hosted:cron-evidence:plan
OGL_HOSTED_CRON_EVIDENCE_CHECKS=price-drop pnpm hosted:cron-evidence
OGL_HOSTED_CRON_EVIDENCE_CHECKS=price-drop pnpm hosted:cron-evidence:packet
OGL_HOSTED_CRON_EVIDENCE_CHECKS=price-drop pnpm hosted:cron-evidence:artifact-hints
```

The scheduler artifact uses flat `Gate-Specific Evidence` fields and must name
`store_price_drop_notification_runs` and `notify-price-drop`. Presence or
account-deletion rows do not satisfy it.

## hosted-supabase-cron

Required shell environment:

- `SUPABASE_URL`
- `PRICE_DROP_NOTIFY_SECRET`
- `ACCOUNT_DELETION_PROCESSOR_SECRET`
- `PRESENCE_POLL_SECRET`

The collector additionally needs a REST URL from `SUPABASE_REST_URL`,
`SUPABASE_URL` or `SUPABASE_PROJECT_REF`, plus either
`SUPABASE_SERVICE_ROLE_KEY` or `SUPABASE_ANON_KEY` with `SUPABASE_AUTH_JWT`.

Artifact:

- [`docs/verification/external/hosted-supabase-cron.md`](../verification/external/hosted-supabase-cron.md)

Proof covers fresh scheduled, non-dry-run rows for `price-drop`,
`presence-poll`, and `account-deletion`. Keep the collector unscoped and fill a
complete table/function/run-ID/scheduled/`dry_run=false`/status block for every
lane; one generic run cannot satisfy all three.

```bash
pnpm hosted:deploy-gate:scheduler-packet
pnpm hosted:cron-evidence:plan
pnpm hosted:cron-evidence
pnpm hosted:cron-evidence:packet
pnpm hosted:cron-evidence:artifact-hints
```

## provider-live-integrations

Required shell environment:

- `STEAM_WEB_API_KEY`
- `PRESENCE_PROVIDER_TOKEN`

Artifact:

- [`docs/verification/external/provider-live-integrations.md`](../verification/external/provider-live-integrations.md)

Proof covers Nexus website search handoff and Steam Workshop handoff against live
providers, non-Steam presence bridges, approved catalog/cloud transfers and
achievement/provider-cache E2E against real client data. The provider/client
matrix must name both `Nexus` and `Steam Workshop`.

Use `open_provider_mod` for the no-slug Nexus website search handoff and for a
verified Steam AppID. Copy only redacted run and provider locators. A separately
registered native Nexus build is optional and is not a release prerequisite.

For the bridge lane, deploy `poll-platform-presence` with the Supabase service
configuration, scheduler secret, `PRESENCE_PROVIDER_TOKEN`, and
`EPIC_PRESENCE_ENDPOINT`, `GOG_PRESENCE_ENDPOINT`, `EA_PRESENCE_ENDPOINT`,
`XBOX_PRESENCE_ENDPOINT`, `BATTLENET_PRESENCE_ENDPOINT`, and
`UBISOFT_PRESENCE_ENDPOINT`. Run a non-dry-run live session and capture its
provider bridge run ID, function-log locator and provider response locator. The
template and generated worklist are authoritative for the exact row names.

## hardware-os-e2e

Required shell environment: none.

Artifact:

- [`docs/verification/external/hardware-os-e2e.md`](../verification/external/hardware-os-e2e.md)

Proof covers real-title fullscreen/anti-cheat overlay behavior, a long native
overlay session with numeric measured duration/window, external-drive
backup/restore on Windows, macOS and Linux, and real provider-client
mount/apply. The OS matrix needs one row per OS, each with `title:`, `client:`
and a specific locator.

## rollout-tracks

Required shell environment: none.

Artifact:

- [`docs/verification/external/rollout-tracks.md`](../verification/external/rollout-tracks.md)

Proof covers hosted community artwork rollout, plugin marketplace execution and
update review, and hosted production deployment. Prepare deployment evidence
with:

```bash
pnpm hosted:deploy-gate:plan
pnpm hosted:deploy-gate:packet
```

The hosted deployment must be a GitHub Actions `CI` run from `main` with
`hosted_deploy_gate=true`, `hosted_environment=hosted-production`,
`hosted_deploy_action=all`, and `hosted_deploy_dry_run=false`. Put the labelled
locator in both the matching proof-evidence row and `Hosted deploy evidence`,
for example:

```text
hosted-deploy CI main hosted_deploy_gate=true hosted_environment=hosted-production hosted_deploy_action=all hosted_deploy_dry_run=false workflow: https://github.com/<owner>/<repo>/actions/runs/<id>
```

A bare Actions URL or workflow ID is insufficient.

## Evidence and security rules

- Never paste raw secrets, private keys or complete authorization headers into
  artifacts, logs or handoff text. Required values must be real and match their
  expected shape; `set`, `secret-value`, sample credentials, `TBD` and `TODO`
  remain blocked.
- Use hosted HTTPS Supabase project URLs with a 20-character lowercase alphanumeric project ref,
  live Stripe `sk_live_` and `whsec_` values, and a
  plausible `SUPABASE_ACCESS_TOKEN` with an `sbp_` prefix.
  REST auth values must be JWT-shaped; provider tokens must be plausibly long
  and scheduler secrets must be token-safe values of at least 32 characters.
  Preflight reports only redacted reason codes such as `missing`, `placeholder`
  or `malformed`.
- Each checked proof must belong to that artifact and have a matching
  `Evidence for <proof>:` value in the same file. Use a specific `run:`,
  `run_id:`, `workflow:`, `deployment:`, `artifact:`, `log:`, `signed-log:` or
  `sha256:<64-hex>` reference, or a recognized dashboard/deployment URL.
- Accepted URLs include Supabase Dashboard, Stripe Dashboard, GitHub
  Actions/releases/deployments, Vercel, Netlify, Cloudflare, App Store Connect
  and Google Play Console. Do not include URL userinfo, query strings or
  fragments. Arbitrary URLs are not accepted proof.
- Local or relative paths, `file://`, localhost/private-network URLs, fixture
  screenshots and `docs/verification/screenshots/*` may support readiness but
  never satisfy external proof.
- Proof evidence must identify its lane. Compound evidence must contain every
  required provider, OS, duration or matrix term in the same value. Bare
  `evt_...` is allowed only for the Stripe webhook-signature proof; generic IDs
  such as `run-generic-1` remain blocked.
- Proof evidence values must name the proof lane. Current lane identifiers are
  `stripe-webhook`, `non-steam-presence-bridge-provider`,
  `provider-approved-catalog-cloud-transfer`,
  `achievement-provider-cache-real-client`, `fullscreen-anti-cheat-overlay`,
  `community-artwork-rollout`, and `plugin-marketplace-execution-update`; the
  generated worklist supplies the complete current set.
- Fill all template detail rows with concrete redacted values. `Operator: me`,
  `Environment: test`, `see above`, `N/A`, `none`, `pending`, `sample` and
  `example` are not acceptable. `Redaction notes` must positively state that
  raw secrets or tokens were removed; contradictory or unreviewed wording is
  blocked.
- Set `Captured at` to current UTC ISO-8601 time, no older than 30 days and no
  more than ten minutes in the future. Set `Release ref` to the exact release
  tag and `Commit SHA` to its full 40-hex commit.
- Keep active proof and detail rows outside code fences, HTML comments and
  indented code blocks. Remove `Template only` before filling evidence or
  checking a proof.

Run `pnpm external:evidence:worklist` for the authoritative missing fields and
capture hints, then `pnpm external:evidence:preflight` for the authoritative
acceptance result. The committed templates are the field-level contract; this
runbook intentionally does not duplicate their complete checklists or generated
reason-code output.
