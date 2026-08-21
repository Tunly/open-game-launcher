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
- `ACCOUNT_DELETION_PROCESSOR_SECRET`
- `PRESENCE_POLL_SECRET`

Artifact:

- `docs/verification/external/hosted-supabase-cron.md`

The artifact must cover fresh scheduled, non-dry-run rows for all three lanes:
scheduler packet commands:

```bash
pnpm hosted:deploy-gate:plan
pnpm hosted:deploy-gate:packet
pnpm hosted:deploy-gate:preflight
pnpm hosted:deploy-gate:smoke
pnpm hosted:deploy-gate:scheduler-packet
pnpm hosted:cron-evidence:plan
OGL_HOSTED_CRON_EVIDENCE_CHECKS=presence-poll pnpm hosted:cron-evidence:plan
pnpm hosted:cron-evidence
pnpm hosted:cron-evidence:packet
pnpm hosted:cron-evidence:artifact-hints
OGL_EXTERNAL_EVIDENCE_GATES=hosted-supabase-cron pnpm external:evidence:preflight
```

## provider-live-integrations

Required environment names:

- `STEAM_WEB_API_KEY`
- `PRESENCE_PROVIDER_TOKEN`

Optional presence bridge endpoints:

- `EPIC_PRESENCE_ENDPOINT`
- `GOG_PRESENCE_ENDPOINT`
- `EA_PRESENCE_ENDPOINT`
- `XBOX_PRESENCE_ENDPOINT`
- `BATTLENET_PRESENCE_ENDPOINT`
- `UBISOFT_PRESENCE_ENDPOINT`

Artifact:

- `docs/verification/external/provider-live-integrations.md`

Collect redacted real-provider presence, catalog/cloud-transfer, and
achievement-cache evidence. Include the provider/client matrix and concrete
run locators without exposing provider credentials. Each non-dry-run live
session must include a provider bridge run ID.

## hardware-os-e2e

Artifact:

- `docs/verification/external/hardware-os-e2e.md`

Collect real-title overlay/session evidence and real provider-client mount/apply
behavior. Include each OS, title, client, and session/run locator.

## rollout-tracks

Artifact:

- `docs/verification/external/rollout-tracks.md`

Collect hosted community-artwork rollout evidence, plugin marketplace review
and update evidence, and a hosted production deployment workflow locator. The
workflow proof must identify the `CI` run from `main` and the production
hosted-deploy inputs.

## Release-boundary commands

Coverage runs as a separate threshold-enforcing CI job. Release tag path waits for coverage before the external completion gate.

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

## Proof evidence lane identity

Proof evidence values must name the proof lane: `presence-poll`,
`account-deletion`, `non-steam-presence-bridge-provider`,
`provider-approved-catalog-cloud-transfer`,
`achievement-provider-cache-real-client`, `fullscreen-anti-cheat-overlay`,
`client-mount-apply-provider-client`,
`community-artwork-rollout`, `plugin-marketplace-execution-update`, or
`hosted-deploy`. Compound values must include their required providers, OSes,
duration/window, and matrix fields.

## Next steps mode

`pnpm external:evidence:next` prints a compact non-mutating handoff of the
current gate status and next operator action. `pnpm external:evidence:runbook`
prints this sequenced operator runbook.

## REST collector prerequisites

- The project ref is the 20-character lowercase alphanumeric project ref.
- `SUPABASE_ACCESS_TOKEN` must start with `sbp_`.
- REST auth values must be JWT-shaped (service-role key or anon key plus
  auth JWT) and must match the REST auth project ref.
