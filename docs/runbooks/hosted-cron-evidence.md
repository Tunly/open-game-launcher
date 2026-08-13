# Hosted Cron Evidence

Use this after `docs/runbooks/hosted-deploy-gate.md` passes and scheduled
Supabase or external cron jobs are enabled. This is a read-only evidence check:
it reads sanitized aggregate tables through Supabase REST and never calls Edge
Functions or writes rows.

## Required Environment

For the read-only REST collector:

- `SUPABASE_URL` or `SUPABASE_REST_URL` or `SUPABASE_PROJECT_REF`
- `SUPABASE_SERVICE_ROLE_KEY` or both `SUPABASE_ANON_KEY` and `SUPABASE_AUTH_JWT`
- optional `OGL_HOSTED_CRON_FRESHNESS_HOURS` (overrides all lane defaults)
- optional `OGL_HOSTED_CRON_EVIDENCE_CHECKS` comma-separated check IDs

For the `hosted-supabase-cron` external evidence preflight:

- `SUPABASE_URL`
- `ACCOUNT_DELETION_PROCESSOR_SECRET`
- `PRESENCE_POLL_SECRET`

Both sets are required for completion. The REST collector uses only REST read
auth and does not call Edge Functions; the scheduler bearer secrets prove the
external scheduler invocation contract and are checked by the hosted deploy gate
and lane-specific external preflight.

Required environment values must be real non-placeholder values; placeholders
such as `set`, `secret-value`, `TBD`, `TODO`, `anon`, `jwt`, or
`service-secret`, `your-project-ref`, and `replace-me` are rejected. REST and
Supabase URLs must resolve to HTTPS `*.supabase.co` hosts without userinfo,
query strings, or fragments before auth headers are sent.
REST auth values must be JWT-shaped Supabase tokens before any fetch:
`SUPABASE_SERVICE_ROLE_KEY` must carry role `service_role`,
`SUPABASE_ANON_KEY` must carry role `anon`, and `SUPABASE_AUTH_JWT` must carry
role `authenticated` for the same plausible hosted Supabase project identity.
Weak placeholders such as `configured-*`, `anon-real`, or `jwt-real` are
rejected by env name only.

Do not paste secret values into reports. The local `plan` output redacts the
REST base URL to a configured/not-configured state.

## Commands

```bash
pnpm hosted:cron-evidence:plan
pnpm hosted:cron-evidence
pnpm hosted:cron-evidence:packet
pnpm hosted:cron-evidence:artifact-hints
OGL_HOSTED_CRON_EVIDENCE_CHECKS=presence-poll pnpm hosted:cron-evidence:artifact-hints
pnpm hosted:cron-evidence:artifact-hints --checks=presence-poll
OGL_EXTERNAL_EVIDENCE_GATES=hosted-supabase-cron pnpm external:evidence:preflight
pnpm completion:gate:external
```

commands use:

```powershell
pnpm hosted:cron-evidence:packet
Remove-Item Env:OGL_HOSTED_CRON_EVIDENCE_CHECKS

$env:OGL_EXTERNAL_EVIDENCE_GATES='hosted-supabase-cron'
pnpm external:evidence:preflight
Remove-Item Env:OGL_EXTERNAL_EVIDENCE_GATES
```

Without `OGL_HOSTED_CRON_EVIDENCE_CHECKS` or `--checks`, the collector checks
all scheduler lanes. Use `--checks` only for interim lane diagnostics; the

Without `OGL_HOSTED_CRON_FRESHNESS_HOURS`, lane freshness defaults are:

- `presence-poll`: `0.25` hours / 15 minutes
- `account-deletion`: `25` hours

Leave `OGL_HOSTED_CRON_FRESHNESS_HOURS` unset unless a release operator
intentionally overrides every selected lane. Setting a broad value such as `25`
hours also applies to `presence-poll` and weakens its 15 minute freshness
window.

The selected checks read the latest scheduled attempt for each selected table:

- `presence_poll_runs`
- `account_deletion_processor_runs`

The REST query filters only to `trigger_source = scheduled`, orders by
`completed_at` descending, and validates the newest scheduled row. If that
latest row is failed, dry-run, stale, or malformed, the lane fails rather than
skipping backward to an older passing-shaped row. Each row must have:

- `trigger_source = scheduled`
- `dry_run = false`
- `status = completed`
- `completed_at` inside the freshness window
- a safe non-secret `run_id` evidence identifier
- all selected aggregate count fields present as numeric non-negative integers
- aggregate counts that match the lane semantics:
  - presence `polled_count + skipped_count = scanned_count`,
    `provider_result_summary.total = polled_count`, `skipped_summary.total =
skipped_count`, `presence_updated_count <= polled_count`, and
    `activity_inserted_count <= presence_updated_count`
  - account deletion `due_request_count <= limit_count`,
    `completed_count + failed_count = claimed_count`, `claimed_count +
skipped_count = due_request_count`, `would_process_count = 0`,
    `skipped_summary` total matching `skipped_count`, and
    `storage_bucket_count` matching configured deletion buckets
- `failed_count = 0` when the aggregate row exposes `failed_count`

## Evidence Storage

When the command passes, use `pnpm hosted:cron-evidence:packet` as the durable
redacted operator packet and save the reviewed packet plus operator notes in:

- `docs/verification/external/hosted-supabase-cron.md`

For artifact handoff, `pnpm hosted:cron-evidence:packet` summarizes the
sanitized validation state for the selected tables and prints artifact detail
hints only when every selected scheduled, non-dry-run REST row validates. The
narrower `pnpm hosted:cron-evidence:artifact-hints` command skips the generic
plan prefix, reuses the same validated rows, and prints only the paste-clean
Artifact Evidence Details required by external artifacts: Hosted cron table,
Function, Run ID, Scheduled,
`dry_run=false`, and Status. For the full `hosted-supabase-cron` gate, details
`### account-deletion`. Each checked scheduler proof needs its own matching
lane block; one generic cron detail block cannot satisfy all three hosted cron
During `pnpm completion:gate:external`, the collector also writes a gitignored
`.codex/completion-gate/hosted-cron-<run>.json` receipt and the artifact hints
include `Hosted cron receipt SHA256`; the following
`external:evidence:preflight` run requires the pasted lane details and receipt
SHA to match that same collector run. Standalone packet/hints commands remain
operator handoffs and do not create release proof by themselves.
Both outputs are redacted handoff text only. The hosted cron packet does not check proof rows before an operator reviews artifacts. It does not mark external
completion, does not prove scheduler dashboard ownership, and must not include
raw REST URLs, bearer tokens, Supabase keys, scheduler secrets, or other secret
values. The packet points to
`OGL_EXTERNAL_EVIDENCE_GATES=hosted-supabase-cron pnpm external:evidence:preflight`.

The report should include:

- command timestamp and environment name
- redacted command output
- scheduler configuration or dashboard screenshot
- latest `runId` per selected table
- failure notes if a table is stale or missing

## Completion Boundary

Dry-run rows from `hosted_deploy_gate` prove deploy readiness only. They do not
complete the hosted cron gate. The completion gate requires real scheduled,
non-dry-run rows for the selected scheduler lanes with fresh sanitized evidence,
safe redacted run IDs, lane-scoped artifact detail blocks, numeric aggregate
counts, semantically consistent aggregate summaries, and zero failure counts
where the evidence table reports
failures. The collector verifies row shape, freshness, safe REST target
`skipped_summary.inactive = 0` completion rule; the external evidence artifact
must still include scheduler configuration or dashboard evidence proving the row
came from the real scheduler and not a manual authorized call.
