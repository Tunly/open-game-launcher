# External Completion Evidence Runbook

This runbook describes the four external evidence lanes that remain in the
release boundary. Evidence is collected outside the repository, redacted, and
attached to the matching artifact before a release can claim readiness.

## Shared rules

- Never commit credentials, bearer tokens, private keys, or raw provider output.
- Use fresh UTC timestamps, the release tag, and the full commit SHA.
- Keep proof rows unchecked until the external run is complete and reviewed.
- Use concrete run, workflow, deployment, artifact, or approved dashboard
  locators; local paths and example URLs do not count.
- Run `pnpm completion:gate:status` before the final release-boundary check.

## hosted-supabase-cron

Required environment names:

- `SUPABASE_URL`
- `PRICE_DROP_NOTIFY_SECRET`
- `ACCOUNT_DELETION_PROCESSOR_SECRET`
- `PRESENCE_POLL_SECRET`

Artifact:

- `docs/verification/external/hosted-supabase-cron.md`

The artifact must cover fresh scheduled, non-dry-run rows for all three lanes:
price drop, presence polling, and account deletion. Use the collector and
scheduler packet commands:

```bash
pnpm hosted:deploy-gate:scheduler-packet
pnpm hosted:cron-evidence:plan
pnpm hosted:cron-evidence
pnpm hosted:cron-evidence:packet
pnpm hosted:cron-evidence:artifact-hints
OGL_EXTERNAL_EVIDENCE_GATES=hosted-supabase-cron pnpm external:evidence:preflight
```

## provider-live-integrations

Required environment names:

- `STEAM_WEB_API_KEY`
- `PRESENCE_PROVIDER_TOKEN`

Artifact:

- `docs/verification/external/provider-live-integrations.md`

Collect redacted real-provider presence, catalog/cloud-transfer, and
achievement-cache evidence. Include the provider/client matrix and concrete
run locators without exposing provider credentials.

## hardware-os-e2e

Artifact:

- `docs/verification/external/hardware-os-e2e.md`

Collect real-title overlay/session evidence, Windows/macOS/Linux backup and
restore evidence, and real provider-client mount/apply behavior. Include each
OS, title, client, and session/run locator.

## rollout-tracks

Artifact:

- `docs/verification/external/rollout-tracks.md`

Collect hosted community-artwork rollout evidence, plugin marketplace review
and update evidence, and a hosted production deployment workflow locator. The
workflow proof must identify the `CI` run from `main` and the production
hosted-deploy inputs.

## Release-boundary commands

```bash
pnpm external:evidence:status
pnpm external:evidence:next
pnpm external:evidence:worklist
pnpm external:evidence:packet
pnpm external:evidence:runbook
pnpm external:evidence:preflight
pnpm completion:gate:external
```

These commands are redacted and non-mutating unless explicitly documented
otherwise. A local pass means the evidence packet is structurally complete; it
is not proof that external production systems are healthy.
