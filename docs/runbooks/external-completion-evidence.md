# External Completion Evidence

The local checkout is covered by deterministic tests, frontend coverage,
screenshots, DOM checks, static-class checks, and a current-platform Tauri
debug-bundle smoke. The items below are deliberately not marked complete until
the named external proof artifact exists and passes preflight with checked proof
rows, required detail fields, accepted external locators, fresh capture
timestamps, and non-placeholder environment values.

Use this helper without secrets in logs:

```bash
pnpm completion:gate:plan
pnpm completion:gate:status
pnpm external:evidence:plan
pnpm external:evidence:next
pnpm external:evidence:packet
pnpm external:evidence:runbook
pnpm external:evidence:status
pnpm external:evidence:template
pnpm external:evidence:worklist
pnpm external:evidence:preflight
pnpm hosted:deploy-gate:plan
pnpm hosted:deploy-gate:packet
pnpm hosted:deploy-gate:scheduler-packet
pnpm hosted:cron-evidence:plan
pnpm hosted:cron-evidence
pnpm hosted:cron-evidence:packet
pnpm hosted:cron-evidence:artifact-hints
```

For a current-platform release-boundary rehearsal, use `pnpm completion:gate`.
It first runs the local deterministic gate, then hosted deploy preflight,
hosted deploy smoke, hosted cron evidence collector, and this external evidence
preflight. It must fail until the real external artifacts and required
environment values below are present. Cross-platform signoff comes from the
configured CI runners, but GitHub Actions does not mirror the local gate
exactly: coverage runs as a separate informational artifact job, and no CI
Tauri debug-bundle smoke exists. The `v*` tag path uses the frontend, Rust, and
Supabase CI jobs plus an unscoped `pnpm completion:gate:external` tag job in the
`hosted-production` Environment before any draft-release artifacts are created.
That tag job validates launcher/Tauri version alignment and rejects semver-valid
`v*` tags whose checked-out commit is not the current `origin/main` commit.
Before final release-boundary verification, run `pnpm completion:gate:status`.
The final `pnpm completion:gate:external` run is unscoped and also runs hosted
deploy preflight, hosted deploy smoke, hosted cron evidence, and external
evidence preflight.

To focus one lane:

```bash
OGL_EXTERNAL_EVIDENCE_GATES=hosted-supabase-cron pnpm external:evidence:preflight
```

Use `pnpm external:evidence:status` when an operator or CI job needs a
machine-readable missing-evidence packet without turning the run red. The JSON
contains gate IDs, readiness booleans, missing environment names, redacted
environment reason codes (`missing`, `placeholder`, or `malformed`), missing
artifact/proof/detail rows, redacted artifact detail reason codes, redacted
proof-evidence reason codes, template-only banner findings, unreadable artifact
findings, secret-scan findings, redacted follow-up commands, and aggregate
ready/missing counts; it does not print raw environment values or artifact
values.

Use `pnpm external:evidence:next` when an operator needs a compact
non-mutating handoff. It prints only non-ready selected gates, missing
environment names, missing artifacts/proofs/detail fields, missing artifact
proof coverage, redacted artifact detail/proof-evidence reason codes, blocking
findings, and existing follow-up commands such as
`pnpm external:evidence:template`,
`pnpm external:evidence:status`, `pnpm external:evidence:preflight`,
`pnpm hosted:deploy-gate:scheduler-packet`, `pnpm hosted:cron-evidence`,
`pnpm hosted:cron-evidence:packet`, and
`pnpm hosted:cron-evidence:artifact-hints`. It is redacted output only: it does
not print raw environment values, does not use local screenshot paths as proof,
does not mark proof rows checked, and does not assert that an external system
has succeeded.

Use `pnpm external:evidence:worklist` when an operator needs a per-artifact fill
list. It groups each selected artifact by readiness state, missing proof labels,
complete missing detail field names, redacted reason codes for rejected detail
and proof-evidence rows, blocking finding labels, and the same follow-up
commands. It is redacted output only: it does not write artifacts, does not
include proof checkboxes, does not print environment values or artifact values,
and does not mark external evidence complete.

Use `pnpm external:evidence:packet` when an operator needs one redacted handoff
document before a release run. It includes selected gate counts, ready counts,
required environment names, artifact paths, proof requirements, evidence detail
fields, per-gate commands, and the same missing-evidence next steps. It is
non-mutating and does not print environment values, mark proof rows checked, or
assert external success.

Use `pnpm external:evidence:runbook` when an operator needs a sequenced
operator runbook instead of a status summary. It groups the selected gates into
artifact preparation, evidence capture, and release-boundary verification,
listing artifact paths, proof labels, detail field names, and commands only. It
does not include proof checkboxes, write artifacts, print environment values, or
assert external success.

For `rollout-tracks`, the generated commands include
`pnpm hosted:deploy-gate:plan` and `pnpm hosted:deploy-gate:packet` so hosted
production deployment evidence can be prepared from the reviewed deploy-gate
handoff. Those packet commands are still local handoff text and do not prove a
hosted deployment by themselves.

For `hosted-supabase-cron`, this lane-specific preflight checks the scheduler
bearer secret environment names and the redacted external artifact. Run
`pnpm hosted:deploy-gate:scheduler-packet` to prepare the scheduler command
packet and confirm its `SUPABASE_FUNCTIONS_URL` setup step before copying
scheduler commands, then run `pnpm hosted:cron-evidence` separately with REST
read auth to collect and validate the sanitized Supabase evidence rows. The
generated external evidence packet, runbook, next-step, and worklist handoffs
repeat those REST collector prerequisites as
`SUPABASE_REST_URL or SUPABASE_URL or SUPABASE_PROJECT_REF` plus
`SUPABASE_SERVICE_ROLE_KEY or SUPABASE_ANON_KEY + SUPABASE_AUTH_JWT` beside the
hosted-cron commands so operators do not discover that dependency late. If those
rows are ready, `pnpm hosted:cron-evidence:plan` confirms the selected lanes,
`pnpm hosted:cron-evidence:packet` prints a durable redacted row validation
handoff plus artifact detail hints, and
`pnpm hosted:cron-evidence:artifact-hints` prints only those detail fields for
the external artifact. These checks are complementary and none replaces the
operator-reviewed proof rows.

For `store-stripe-live`, only the price-drop scheduler lane belongs to the
Store/Stripe artifact. Use
`OGL_HOSTED_CRON_EVIDENCE_CHECKS=price-drop pnpm hosted:cron-evidence:plan`,
`OGL_HOSTED_CRON_EVIDENCE_CHECKS=price-drop pnpm hosted:cron-evidence`,
`OGL_HOSTED_CRON_EVIDENCE_CHECKS=price-drop pnpm hosted:cron-evidence:packet`,
and
`OGL_HOSTED_CRON_EVIDENCE_CHECKS=price-drop pnpm hosted:cron-evidence:artifact-hints`
so missing presence/account-deletion rows do not block the Store/Stripe handoff.
The Store/Stripe price-drop scheduler artifact must still identify
`store_price_drop_notification_runs` and `notify-price-drop`; paste evidence
from the price-drop-only `artifact-hints` command as flat `Gate-Specific
Evidence` fields in
`docs/verification/external/store-price-drop-scheduler-live.md`. Evidence from
`presence_poll_runs`, `account_deletion_processor_runs`, or their functions does
not satisfy this proof.
For `hosted-supabase-cron`, leave the collector unscoped so all three scheduler
lanes are required.

`/settings?verify=external-completion-evidence-summary` renders these lanes as
a local no-write UI map. Screenshots are stored in
`docs/verification/screenshots/settings-external-completion-evidence-summary-local.png`
and
`docs/verification/screenshots/settings-external-completion-evidence-summary-mobile.png`.
These screenshots are local UI verification artifacts only; they are not
external completion evidence and do not satisfy any gate.

Scoped `OGL_EXTERNAL_EVIDENCE_GATES=... pnpm external:evidence:preflight`
runs are preparation checks for a single proof lane. The unscoped
`pnpm external:evidence:preflight` and release-boundary
`pnpm completion:gate:external` runs are the final proof checks; they must run
in a release tag/SHA context through `GITHUB_REF_NAME` or `GITHUB_REF` and
`GITHUB_SHA`.

`pnpm external:evidence:preflight` requires every selected required environment
name to hold a non-placeholder value with the expected shape, every selected
artifact file to exist, per-artifact proof coverage for assigned proof rows,
each named proof to appear as a checked `- [x]` checklist row outside Markdown
code fences, HTML comments, and indented code blocks, a matching
`Evidence for <proof>:` line with a specific redacted run/dashboard/artifact
locator or `sha256:<64-hex>` reference for every checked proof, non-empty and
specific, non-placeholder Evidence Captured and Gate-Specific Evidence detail
fields outside inactive
Markdown, lane-scoped hosted cron detail sections for every selected scheduler
proof, `Captured at` as a UTC ISO-8601 timestamp within 30 days and not more
than 10 minutes in the future, `Release ref` as the exact release tag,
`Commit SHA` as the full 40-hex release commit, release CI exact matches
against `GITHUB_REF_NAME` and `GITHUB_SHA`, and blocks common raw secret shapes
such as Stripe live/test and restricted keys, webhook secrets, bearer tokens,
JWT-like tokens, provider API
keys/tokens, provider API-key headers, Supabase service-role/auth/access tokens,
bare `sbp_...` deploy tokens, hosted scheduler secrets, mobile push/provider
secrets, private keys, device tokens, and unredacted secret fixtures. Unchecked template rows,
checked rows inside fenced/commented/indented examples, missing per-artifact
proof coverage, checked proof rows without specific matching proof evidence
mappings, placeholder/copied env values, malformed env values,
placeholder/weak detail values, a retained `Template only` banner once proof
rows or detail rows are filled, local `docs/verification/screenshots/*`
locators, relative/local/file path locators, arbitrary HTTPS URLs outside the
accepted host/pattern list, Stripe test-mode Dashboard URLs such as
`dashboard.stripe.com/test/...`, generic locator values, stale/future capture
times, non-ISO capture times, and checked rows without captured evidence
details stay blocked.

When `preflight`, `next`, `worklist`, or `status` reports artifact reason
codes, treat them as redacted diagnostics for the field named beside the code:
`missing` means the row or proof-specific `Evidence for ...` mapping is absent;
`placeholder` and `weak` mean the row still contains generic fill text;
`malformed_timestamp`, `stale_timestamp`, and `future_timestamp` apply to
`Captured at`; `release_ref_context_missing` and
`commit_sha_context_missing` mean an unscoped release-boundary check is missing
release tag/SHA context; `release_ref_mismatch` and `commit_sha_mismatch` apply
to release-boundary rows that do not match CI; `local_path` rejects local files,
workspace paths, and `docs/verification/screenshots/*`; `unapproved_url`
rejects unsupported hosts, non-HTTPS URLs, query/hash/userinfo URLs, localhost,
private-network URLs, and example URLs; `malformed_locator` means no accepted
external locator, run ID, workflow ID, signed log, artifact ID, or
`sha256:<64-hex>` reference was present; `missing_lane_terms` means the value is
syntactically specific but does not name the required proof lane; and
`wrong_expected_value` means a lane-specific expected value such as cron table,
function, status, `dry_run=false`, or redaction wording does not match.

Proof evidence values must name the proof lane they support: use identifiers
such as `stripe-webhook`, `stripe-tax-invoice`, `price-drop`, `presence-poll`,
`account-deletion`, `mod.io/CurseForge`, `presence-bridge`,
`catalog-cloud-transfer`, `achievement-cache`, `overlay`, `backup-restore`,
`client-mount-apply`, `community-rollout`, `controller-profile-sync`,
`plugin-marketplace`, `mobile-push`, or `hosted-deploy`. Bare `evt_...` values
are accepted only for the Stripe webhook signature proof. Syntactically
specific but generic IDs such as `run-generic-1` stay blocked. Compound proof
values must include every required term in the same value: mod-provider evidence
includes both `mod.io` and `CurseForge`; external-drive backup/restore proof
evidence and hardware matrix evidence include `Windows`, `macOS`, and `Linux`.

## store-stripe-live

Required environment names:

- `SUPABASE_URL`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `PRICE_DROP_NOTIFY_SECRET`

Required artifacts:

- `docs/verification/external/store-stripe-live-staging.md`
- `docs/verification/external/store-price-drop-scheduler-live.md`

Proof required:

- Stripe webhook signature delivery reaches stripe-webhook.
- Stripe Tax and invoice settings are verified in Dashboard.
- Hosted price-drop scheduler writes fresh run evidence.

Evidence rows by artifact. The Stripe artifact uses flat dashboard/webhook
fields; the scheduler artifact uses flat `Gate-Specific Evidence` fields.
For `docs/verification/external/store-price-drop-scheduler-live.md`, fill flat Gate-Specific Evidence fields
from the price-drop-only hosted cron artifact hints:

- `docs/verification/external/store-stripe-live-staging.md`:
  Stripe webhook event ID.
- `docs/verification/external/store-stripe-live-staging.md`:
  Stripe Dashboard evidence.
- `docs/verification/external/store-stripe-live-staging.md`:
  Supabase function log run ID.
- `docs/verification/external/store-price-drop-scheduler-live.md`:
  Hosted cron table.
- `docs/verification/external/store-price-drop-scheduler-live.md`: Function.
- `docs/verification/external/store-price-drop-scheduler-live.md`: Run ID.
- `docs/verification/external/store-price-drop-scheduler-live.md`: Scheduled.
- `docs/verification/external/store-price-drop-scheduler-live.md`:
  `dry_run=false`.
- `docs/verification/external/store-price-drop-scheduler-live.md`: Status.

Recommended hosted cron collector commands for the scheduler artifact:

```bash
OGL_HOSTED_CRON_EVIDENCE_CHECKS=price-drop pnpm hosted:cron-evidence:plan
OGL_HOSTED_CRON_EVIDENCE_CHECKS=price-drop pnpm hosted:cron-evidence
OGL_HOSTED_CRON_EVIDENCE_CHECKS=price-drop pnpm hosted:cron-evidence:packet
OGL_HOSTED_CRON_EVIDENCE_CHECKS=price-drop pnpm hosted:cron-evidence:artifact-hints
```

## hosted-supabase-cron

Required environment names for external preflight:

- `SUPABASE_URL`
- `PRICE_DROP_NOTIFY_SECRET`
- `ACCOUNT_DELETION_PROCESSOR_SECRET`
- `PRESENCE_POLL_SECRET`

Additional REST read environment for `pnpm hosted:cron-evidence`:

- `SUPABASE_URL` or `SUPABASE_REST_URL` or `SUPABASE_PROJECT_REF`
- `SUPABASE_SERVICE_ROLE_KEY` or both `SUPABASE_ANON_KEY` and `SUPABASE_AUTH_JWT`

Required artifacts:

- `docs/verification/external/hosted-supabase-cron.md`

Proof required:

- poll-platform-presence scheduled run writes fresh evidence.
- notify-price-drop scheduled run writes fresh evidence.
- process-account-deletions scheduled run writes fresh evidence.

Lane-specific evidence rows. Fill one complete block for each scheduled lane in
`docs/verification/external/hosted-supabase-cron.md`; a single generic cron run
cannot satisfy all three proofs:

- `price-drop`: Hosted cron table, Function, Run ID, Scheduled,
  `dry_run=false`, Status.
- `presence-poll`: Hosted cron table, Function, Run ID, Scheduled,
  `dry_run=false`, Status.
- `account-deletion`: Hosted cron table, Function, Run ID, Scheduled,
  `dry_run=false`, Status.

Recommended hosted cron collector commands for this gate:

```bash
pnpm hosted:cron-evidence:plan
pnpm hosted:cron-evidence
pnpm hosted:cron-evidence:packet
pnpm hosted:cron-evidence:artifact-hints
```

## provider-live-integrations

Required environment names:

- `STEAM_WEB_API_KEY`
- `PRESENCE_PROVIDER_TOKEN`
- `MOD_IO_API_KEY`
- `CURSEFORGE_API_KEY`

For the mod provider proof, store the real mod.io and CurseForge keys through
the desktop secret command `set_mod_provider_secret`, run the native
`run_mod_provider_staging_probe()` command for both providers, and paste only
the redacted run ID plus provider response evidence into
`docs/verification/external/provider-live-integrations.md`.

The desktop keychain proof and the external preflight env check are separate:
the same live mod.io and CurseForge values must also be injected through the
Release Vault or shell environment as `MOD_IO_API_KEY` and
`CURSEFORGE_API_KEY`. Do not write those values into artifacts.

Required artifacts:

- `docs/verification/external/provider-live-integrations.md`

Proof required:

- mod.io and CurseForge staging probes use real provider keys.
- Non-Steam presence bridges return redacted live provider evidence.
- Provider-approved catalog/cloud transfer flows are verified.
- Achievement/provider cache E2E runs against real client data.

Gate-specific evidence rows:

- Provider/client matrix.
- Live probe run ID.
- Provider response evidence.

Provider/client matrix values must include both `mod.io` and `CurseForge`.

## hardware-os-e2e

Required environment names:

- none

Required artifacts:

- `docs/verification/external/hardware-os-e2e.md`

Proof required:

- Fullscreen/anti-cheat overlay evidence is captured on real titles.
- Long native overlay sessions produce stable runtime/session evidence.
- External-drive backup/restore E2E runs on Windows, macOS, and Linux.
- Real client mount/apply behavior is tested against provider clients.

Gate-specific evidence rows:

- OS/title/client matrix.
- Hardware profile.
- Session/run ID.

OS/title/client matrix values must include `Windows`, `macOS`, and `Linux`.

## rollout-tracks

Required environment names:

- none

Required artifacts:

- `docs/verification/external/rollout-tracks.md`

Proof required:

- Hosted community artwork/screenshots rollout is exercised beyond fixtures.
- Production controller layout rollout and profile sync are verified.
- Plugin marketplace execution/update channels are externally reviewed.
- Native mobile apps, push-provider delivery, and store distribution are verified.
- Hosted production deployment evidence is attached.

Gate-specific evidence rows:

- Community rollout evidence.
- Controller layout/profile sync evidence.
- Marketplace evidence.
- Mobile distribution evidence.
- Push-provider evidence.
- Hosted deploy evidence.

Hosted deploy proof comes from the GitHub Actions `CI` workflow run from
`main` with `hosted_deploy_gate=true`,
`hosted_environment=hosted-production`, `hosted_deploy_action=all`, and
`hosted_deploy_dry_run=false`. Paste a labelled locator such as
`hosted-deploy workflow: https://github.com/<owner>/<repo>/actions/runs/<id>`
or `hosted-deploy workflow-<id>` into both `Evidence for Hosted production
deployment evidence is attached.` and `Hosted deploy evidence`; a bare Actions
URL lacks the lane label required by preflight.

Here, screenshots means hosted community screenshot content, not
`docs/verification/screenshots/*` artifacts.

## Rules

- Do not paste raw secrets into evidence artifacts.
- Do not satisfy required environment names with placeholders such as `set`,
  `secret-value`, `sk_live_secret`, `whsec_secret`, `TBD`, or `TODO`.
- Required environment values must also match their expected shape:
  `SUPABASE_URL` must be HTTPS on a hosted Supabase project host with a
  20-character lowercase alphanumeric project ref, Supabase REST and Functions
  URLs must use the same hosted project-ref shape with `/rest/v1` or
  `/functions/v1`, Stripe live keys must start with `sk_live_`, Stripe webhook
  secrets must start with `whsec_`, `SUPABASE_ACCESS_TOKEN` must be a plausible
  `sbp_` token, REST auth values must be JWT-shaped Supabase tokens,
  provider keys/tokens must be plausibly long non-template secrets, and
  scheduler secrets must be 32+ token-safe non-template secrets.
- Each selected artifact must contain the checked proof rows assigned to that
  artifact; proof rows from one artifact cannot satisfy another artifact's
  per-artifact proof coverage.
- Each checked proof row must have a matching `Evidence for <proof>:` row in the
  same artifact. The value must point to a specific redacted run ID, dashboard
  link, external artifact locator, workflow ID, signed log, or
  `sha256:<64-hex>` proof reference.
- Do not check a proof row until the matching external run evidence is captured
  and redacted.
- Remove the `Template only` banner before checking any proof row or filling any
  Evidence Captured or Gate-Specific Evidence row.
- Do not place the required checked proof rows or Evidence Captured detail rows
  inside Markdown code fences, HTML comments, or indented code blocks; inactive
  examples are ignored by preflight.
- Do not use placeholder Evidence Captured values such as `TBD`, `TODO`,
  `N/A`, `none`, `pending`, `placeholder`, `sample`, or `example`.
- Do not use weak Evidence Captured values such as `Operator: me`,
  `Environment: test`, redacted evidence details of `see above`, or
  `Redaction notes: ok`.
- `Redaction notes` must use positive wording such as `raw secrets removed`,
  `tokens redacted`, or `no raw secrets`. Contradictory wording such as
  `not redacted`, `unredacted`, `contains raw`, or `not reviewed` stays
  blocked.
- Do not use local or relative paths as external evidence locators, including
  `docs/verification/screenshots/*`, `./`, `../`, `/tmp`, drive-letter paths, or
  `file://` paths.
- Do not use arbitrary HTTPS URLs as external run evidence. Use accepted
  evidence classes such as `run:`, `run_id:`, `workflow:`, `deployment:`,
  `artifact:`, `log:`, `signed-log:`, or a full `sha256:<64-hex>` reference, or
  use a recognized dashboard/deployment host and path such as Supabase Dashboard,
  Stripe Dashboard, GitHub Actions/release/deployment, Vercel, Netlify,
  Cloudflare, App Store Connect, Google Play Console, Firebase Console, or
  OneSignal. Accepted dashboard/deployment URLs must not include userinfo,
  query strings, or fragments.
- Fill `Captured at` with a freshly captured current UTC ISO-8601 timestamp;
  the timestamp must be within 30 days and not more than 10 minutes in the
  future when preflight runs.
- Fill `Operator`, `Environment`, concrete redacted external run IDs/dashboard
  links/hosted-run logs/external-system screenshots, and `Redaction notes` for
  each artifact before running preflight.
- Evidence may include redacted command output, external run IDs, dashboard
  links, hosted-run logs, external-system screenshots, and signed deployment
  logs.
- Local dry-runs and fixture screenshots, including
  `docs/verification/screenshots/*`, can support readiness, but they do not
  satisfy this checklist.
