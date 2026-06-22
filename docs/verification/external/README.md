# External Evidence Index

This directory holds the release-blocking external evidence artifacts. These
files are templates until a release operator captures redacted live evidence,
fills the required detail rows, checks the matching proof rows, and passes the
scoped and unscoped external preflights.

Do not paste raw secrets into these artifacts. Local screenshots under
`docs/verification/screenshots/`, local file paths, localhost URLs, private
network URLs, and example URLs are not external completion proof.

## Operator Flow

```bash
pnpm completion:gate:status
pnpm external:evidence:status
pnpm external:evidence:next
pnpm external:evidence:worklist
pnpm external:evidence:packet
pnpm external:evidence:runbook
pnpm hosted:deploy-gate:packet
pnpm hosted:deploy-gate:scheduler-packet
pnpm hosted:cron-evidence:packet
pnpm hosted:cron-evidence:artifact-hints
pnpm external:evidence:preflight
pnpm completion:gate:external
```

Use scoped preflights while preparing one lane:

```bash
OGL_EXTERNAL_EVIDENCE_GATES=<gate-id> pnpm external:evidence:preflight
```

The final release-boundary check is unscoped. It must run with release tag and
SHA context, and it must include hosted deploy preflight, hosted deploy smoke,
hosted cron evidence, and external evidence preflight.

## Gate Matrix

| Gate | Artifact | First handoff commands | Final scoped check |
| --- | --- | --- | --- |
| `store-stripe-live` | `docs/verification/external/store-stripe-live-staging.md` | `OGL_EXTERNAL_EVIDENCE_GATES=store-stripe-live pnpm external:evidence:worklist` | `OGL_EXTERNAL_EVIDENCE_GATES=store-stripe-live pnpm external:evidence:preflight` |
| `store-stripe-live` | `docs/verification/external/store-price-drop-scheduler-live.md` | `pnpm hosted:deploy-gate:scheduler-packet`; `OGL_HOSTED_CRON_EVIDENCE_CHECKS=price-drop pnpm hosted:cron-evidence:artifact-hints` | `OGL_EXTERNAL_EVIDENCE_GATES=store-stripe-live pnpm external:evidence:preflight` |
| `hosted-supabase-cron` | `docs/verification/external/hosted-supabase-cron.md` | `pnpm hosted:deploy-gate:scheduler-packet`; `pnpm hosted:cron-evidence:packet`; `pnpm hosted:cron-evidence:artifact-hints` | `OGL_EXTERNAL_EVIDENCE_GATES=hosted-supabase-cron pnpm external:evidence:preflight` |
| `provider-live-integrations` | `docs/verification/external/provider-live-integrations.md` | `OGL_EXTERNAL_EVIDENCE_GATES=provider-live-integrations pnpm external:evidence:worklist` | `OGL_EXTERNAL_EVIDENCE_GATES=provider-live-integrations pnpm external:evidence:preflight` |
| `hardware-os-e2e` | `docs/verification/external/hardware-os-e2e.md` | `OGL_EXTERNAL_EVIDENCE_GATES=hardware-os-e2e pnpm external:evidence:worklist` | `OGL_EXTERNAL_EVIDENCE_GATES=hardware-os-e2e pnpm external:evidence:preflight` |
| `rollout-tracks` | `docs/verification/external/rollout-tracks.md` | `pnpm hosted:deploy-gate:packet`; `OGL_EXTERNAL_EVIDENCE_GATES=rollout-tracks pnpm external:evidence:worklist` | `OGL_EXTERNAL_EVIDENCE_GATES=rollout-tracks pnpm external:evidence:preflight` |

## Proof Boundaries

- `store-stripe-live` needs real Stripe live webhook, Stripe Dashboard, license
  custody/live issuance, and price-drop scheduler evidence.
  `OGL_LICENSE_SIGNING_KEY` is a hosted runtime prerequisite for the license
  lane, but the external preflight proves it through redacted custody and live
  issuance locators instead of requiring or printing the raw signing key.
- `hosted-supabase-cron` needs all three scheduled Supabase lanes:
  price-drop, presence-poll, and account-deletion.
- `provider-live-integrations` needs real provider keys, live provider probes,
  non-Steam presence bridge evidence, provider-approved catalog/cloud transfer
  evidence, and achievement/provider cache E2E against real client data.
- `hardware-os-e2e` needs real-title overlay, long native overlay sessions,
  backup/restore across Windows, macOS, and Linux, and real provider-client
  mount/apply evidence.
- `rollout-tracks` needs hosted community rollout, controller layout/profile
  sync, plugin marketplace review, mobile store/push provider evidence, and
  hosted production deployment evidence.

For full field-level rules and accepted locator shapes, use
`docs/runbooks/external-completion-evidence.md`.
