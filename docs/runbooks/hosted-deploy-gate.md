# Hosted Deploy Gate

This gate is manual by design. It deploys Supabase Edge Functions only from a
GitHub Environment and then runs hosted smokes before any scheduler is enabled.
Cron smokes must not mutate user-facing data; `poll-platform-presence` writes
only a sanitized `presence_poll_runs` evidence record, `notify-price-drop`
writes only a sanitized `store_price_drop_notification_runs` evidence record,
and `process-account-deletions` writes only a sanitized
`account_deletion_processor_runs` evidence record.

## GitHub Environment Secrets

Create `hosted-staging` and `hosted-production` environments with:

- `SUPABASE_ACCESS_TOKEN`
- `SUPABASE_PROJECT_REF`
- `SUPABASE_URL`
- `PRICE_DROP_NOTIFY_SECRET`
- `ACCOUNT_DELETION_PROCESSOR_SECRET`
- `PRESENCE_POLL_SECRET`

`SUPABASE_URL` stays in this required workflow secret set for workflow consistency.
It keeps runtime secrets, status packets, and operator handoffs aligned.
The hosted Functions base URL can still derive from
`SUPABASE_PROJECT_REF` or a directly configured `SUPABASE_FUNCTIONS_URL`;
whichever values are present must point at the same hosted Supabase project.

Optional GitHub Environment variables:

- `OGL_HOSTED_DEPLOY_FUNCTIONS`: comma-separated subset for targeted deploy/smoke runs
- `OGL_HOSTED_SMOKE_ORIGIN`: expected hosted launcher origin for OPTIONS CORS smoke validation

Runtime secrets must also exist in the Supabase project before deploy/smoke:
`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`,
`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `OGL_LICENSE_SIGNING_KEY`,
`RAWG_API_KEY`, `PRICE_DROP_NOTIFY_SECRET`,
`ACCOUNT_DELETION_PROCESSOR_SECRET`, `PRESENCE_POLL_SECRET`,
`STEAM_WEB_API_KEY`, `PRESENCE_PROVIDER_TOKEN`, and optional
`<PLATFORM>_PRESENCE_ENDPOINT` bridge URLs.

`preflight` also runs the launcher-pinned Supabase CLI as
`pnpm --dir launcher exec supabase secrets list --project-ref` and checks only
the required Supabase runtime secret names. It does not print CLI output, secret
values, digests, or copied runtime payloads; failures list missing secret names
only.

Required hosted deploy gate environment values and the resolved hosted Functions
base URL must be real non-placeholder values before smoke fetch; placeholders
such as `set`, `secret-value`, `TBD`, `TODO`, `anon`, `jwt`, or
`service-secret`, `your-project-ref`, and `replace-with-random-cron-secret` are
rejected. `SUPABASE_ACCESS_TOKEN` must be a plausible `sbp_` access token, and
cron smoke bearer secrets must be 32+ token-safe non-placeholder values, not
`configured-*` labels. Smoke fetches only run against HTTPS hosted Supabase
`*.supabase.co` Functions URLs without userinfo, query strings, or fragments so
bearer smoke secrets are not sent to arbitrary hosts or credential-bearing
copied URLs.

## Local Plan

```bash
pnpm hosted:deploy-gate:plan
pnpm hosted:deploy-gate:packet
pnpm hosted:deploy-gate:preflight
pnpm hosted:deploy-gate:deploy:dry-run
pnpm hosted:deploy-gate:deploy:live
pnpm hosted:deploy-gate:smoke
pnpm hosted:deploy-gate:all:live
pnpm hosted:deploy-gate:scheduler-packet
pnpm hosted:deploy-gate:test
```

Legacy `pnpm hosted:deploy-gate <action>` invocations remain supported for
local compatibility, but CI and this runbook use explicit aliases so dry-run,
live deploy, and smoke-only steps are easy to distinguish.

Use `pnpm hosted:deploy-gate:packet` when an operator needs one redacted
handoff before running the GitHub Environment workflow. It lists missing
environment names, required Supabase runtime secret names, deploy function
`verify_jwt` flags, dry-run/OPTIONS smoke plans, scheduler handoff shapes, and
next commands. It does not print secret values, deploy functions, call hosted
functions, create schedulers, or prove external success.

## GitHub Run

Use **Actions -> CI -> Run workflow**:

- `hosted_deploy_gate`: `true`
- `hosted_deploy_dry_run`: `false` for a real deploy, `true` for a deploy dry-run
- `hosted_environment`: `hosted-staging` or `hosted-production`
- `hosted_deploy_action`: `preflight`, `deploy`, `smoke`, or `all`

Run `hosted-production` `deploy`, `smoke`, and `all` only from the `main`
workflow ref. CI validates that production deploy/smoke runs use
`refs/heads/main` and that the checked-out commit is the current `origin/main`
commit before any hosted preflight, deploy, or smoke command runs.

`preflight` verifies that the GitHub Environment has the required deployment and
smoke secrets, resolves a safe hosted Functions URL, and checks Supabase runtime
secret names in the target project. `deploy` runs
`pnpm --dir launcher exec supabase functions deploy` for the known function set.
`smoke` calls live hosted functions with dry-run payloads and fails if a
response writes notifications, presence rows, activity rows, or account
deletions. The presence, price-drop, and account-deletion smokes also fail
unless the hosted functions return server-authored evidence `runId` values.
OPTIONS smokes cover CORS/module sanity for every deployed Edge Function without
mutating rows. Each OPTIONS response must return
`Access-Control-Allow-Origin: *` or the configured `OGL_HOSTED_SMOKE_ORIGIN`;
if `Access-Control-Allow-Methods` is present, it must include `OPTIONS`.
The account-deletion dry-run smoke also validates that the response lists the
same user storage buckets as the local account deletion contract, so an empty
`storageBuckets` response does not count as proof.
Those `runId` values must be safe evidence identifiers, not copied tokens,
Stripe secrets, bearer values, JWT-shaped strings, or hosted cron secret names;
unsafe values fail validation without printing the raw value.

When `hosted_deploy_dry_run` is `true`, the deploy step runs
`pnpm hosted:deploy-gate:deploy:dry-run`. It prints deploy commands, does not
deploy Supabase functions, and does not mock secrets. The dry-run still uses the
selected GitHub Environment; missing or placeholder values still fail the gate
checks. A dry-run does not count as Hosted-Deploy proof or
Post-Deploy-Smoke-Proof. With `hosted_deploy_action` set to `all`, dry-run mode
also skips the post-deploy smoke because no hosted deploy happened; direct
`hosted_deploy_action: smoke` runs remain available for an already-deployed
environment. Production smoke-only runs still execute preflight first so the
runtime secret-name check remains part of the handoff.

## Scheduler Handoff

Enable scheduled functions only after `smoke` passes:

Run `pnpm hosted:deploy-gate:scheduler-packet` to print a redacted scheduler command/config packet from the same `schedulerPlan` source used below. The
packet includes function name, cadence, secret environment variable name, and
the exact JSON body, preserving `dryRun` and `dry_run` spelling. It also
reports whether the scheduler base URL is already available from
`SUPABASE_FUNCTIONS_URL` or needs the emitted redacted derivation step from
`SUPABASE_URL` or `SUPABASE_PROJECT_REF`. Set `SUPABASE_FUNCTIONS_URL` before
copying scheduler commands, either directly or by using that emitted shell
template. It does not read or print secret values, does not create schedulers,
does not call hosted functions, does not mutate data, and does not prove
external scheduler success.

If more than one of `SUPABASE_FUNCTIONS_URL`, `SUPABASE_URL`, and
`SUPABASE_PROJECT_REF` is configured, they must point at the same hosted
Supabase project ref. When the packet detects a mismatch it reports a redacted
`mismatch` state, lists only the required env-name relationship, and suppresses
copyable scheduler command/URL fields until the target refs are corrected.

- `poll-platform-presence`: every minute, Authorization: Bearer `$PRESENCE_POLL_SECRET`, body `{"dryRun":false,"force":false,"limit":100,"triggerSource":"scheduled"}`
- `notify-price-drop`: hourly or after price imports, Authorization: Bearer `$PRICE_DROP_NOTIFY_SECRET`, body `{"dryRun":false,"limit":500,"triggerSource":"scheduled"}`
- `process-account-deletions`: daily, Authorization: Bearer `$ACCOUNT_DELETION_PROCESSOR_SECRET`, body `{"dry_run":false,"limit":20,"triggerSource":"scheduled"}`

Each scheduled request must use the exact bearer secret shown above; keep the
same mapping in GitHub Environment secrets and Supabase runtime secrets.
