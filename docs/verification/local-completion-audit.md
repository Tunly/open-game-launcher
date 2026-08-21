# Local Completion Audit

Last reviewed: 2026-08-14.

This document defines what can be verified in a local checkout. It is not a
release-readiness receipt and does not claim that live providers, hosted
production systems, or physical hardware were exercised. Fresh command output
is the source of truth for test counts and gate status.

## Local boundary

Local verification covers:

- frontend, Rust, Supabase migration, Edge Function, and operational-script
  contracts;
- linting, formatting, typechecking, builds, and current-platform Tauri checks;
- deterministic verify routes and current UI screenshots;
- no-write fixtures, dry-runs, redaction guards, and evidence-template checks.

It does not cover live provider credentials, hosted scheduler execution,
production dashboards, marketplace approval, provider terms approval, or
physical-device and cross-OS runs. Readiness panels and local fixtures must not
be presented as proof of those external outcomes.

## Current local evidence

- The completion gate owns the complete automated inventory. Do not duplicate
  mutable test totals here.
- Route inventory requires every normal production route to have a current
  visual reference. Verify flags are discovered independently from source and
  need a screenshot only when they represent a durable visual reference.
  Removed UI states are not retained as verification archaeology.
- UI evidence checks require screenshots for affected visible UI families and
  require each entry to identify its route/state, evidence boundary, and Retro
  Manga/OG-Launcher styling or overflow result.
- Activity uses `/activity` for the friend feed and `/activity/recap` for the
  local sample-data yearly recap.
- First-party Cloud Saves are removed. Cross-Store Save Copy evidence covers
  explicit local file actions, consent-gated apply/rollback, manifests, hashes,
  and sandbox verification only; it does not prove provider-cloud or Supabase
  save transfer.
- External-evidence parsing rejects placeholders, stale or future timestamps,
  local screenshot locators, private/loopback URLs, weak evidence mappings, and
  secret-shaped content. Local summaries and operator packets are handoff tools,
  not external proof.
- Release tracking requires release-critical source, migrations, scripts,
  runbooks, evidence templates, screenshots, manifests, and toolchain pins to
  be tracked and reproducible from a clean checkout.
- Platform-specific checks report an explicit CI handoff when they cannot run
  on the current host.

## Verification commands

Run the relevant focused checks while developing, then the local completion
gate before handoff:

```bash
pnpm verify:routes
pnpm verify:ui-evidence
pnpm external:evidence:test
pnpm hosted:cron-evidence:test
pnpm hosted:deploy-gate:test
pnpm supabase:functions:test
pnpm supabase:functions:check
pnpm --dir launcher typecheck
pnpm --dir launcher lint
pnpm --dir launcher test
pnpm --dir launcher build
pnpm completion:gate:local
```

`completion:gate:local` begins with the tracked-worktree and whitespace checks.
On success it writes the gitignored
`.codex/completion-gate-local-latest.json`. That receipt is local operator
context only and never replaces fresh output or external evidence.

## External evidence still required

Use `pnpm completion:gate:status` for the current status and
`pnpm external:evidence:worklist` for the next proof item. Release packaging
remains blocked until `pnpm completion:gate:external` passes with real checked
artifacts for these lanes:

- Hosted Supabase cron: scheduled account-deletion and presence
  runs with valid fresh evidence rows.
- Provider integrations: presence bridges, approved catalog/cloud-transfer
  flows, and real achievement cache runs.
- Hardware/OS E2E: overlay/fullscreen/anti-cheat, long native sessions, and
  real-client mount/apply behavior.
- Rollout tracks: hosted artwork rollout, channels, and production deployment.

The canonical proof fields and collection steps live in
`docs/verification/external/` and
`docs/runbooks/external-completion-evidence.md`.

## Completion rule

A feature is locally complete when its deterministic implementation, tests,
documentation, and current visual evidence pass the relevant checks. External
work may be marked complete only after its real evidence artifact passes the
external gate.
