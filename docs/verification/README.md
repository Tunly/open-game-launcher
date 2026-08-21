# Verification

This directory contains local verification records and the templates for proof
that must be collected outside this checkout. Local screenshots and automated
checks are not substitutes for hosted, provider-live, hardware, rollout, or
production evidence.

## Screenshot evidence

The machine-readable source of truth for the curated current visual references is
[`screenshot-manifest.json`](./screenshot-manifest.json). Screenshot files live
in [`screenshots/`](./screenshots/). This is not a visual history or a promise
to capture every internal `?verify=` diagnostic state.

Each manifest entry contains:

- `file`: repository-relative path below `docs/verification/`;
- `routes`: concrete app routes represented by the image;
- `verify`: production `?verify=` flags represented by the image;
- `purpose`: concise description of the captured state;
- `boundary`: a key from the manifest's `boundaries` map.

The shared `visualEvidence` text applies to every entry. Together with
`purpose` and the expanded boundary it records the required strong evidence
description: route or UI state, local/mock/preflight boundary, and
OG-Launcher/Retro Manga styling or responsive overflow coverage.

When UI changes:

1. Update or replace a canonical PNG for the affected route when the change
   has durable visual review value. Add a new image only for a materially
   distinct layout, workflow, error, empty, or security state.
2. Keep desktop/mobile pairs only where the layout materially differs.
3. Store the image directly in `docs/verification/screenshots/` with a
   descriptive, stable file name and add or update its manifest entry. Use
   concrete examples for dynamic routes,
   such as `/u/manga-rider`, rather than `/u/:username`.
4. State the truthful boundary. Local, mocked, browser-preview, dry-run, and
   preflight captures must not imply hosted or live success.
5. Run the checks below.

Do not add a second Markdown screenshot inventory. The JSON manifest is kept
compact with one object per line so entries remain reviewable without
inflating this guide.

## Checks

```bash
pnpm verify:routes:test
pnpm verify:routes
pnpm verify:ui-evidence:test
pnpm verify:ui-evidence
```

`verify:routes` discovers production routes and verify flags, requires visual
coverage for every normal app route, requires one-to-one consistency inside
the curated manifest, and validates PNG signatures, dimensions, and chunk
structure. Manifested verify flags must be active production states; internal
diagnostic flags do not each require a permanent screenshot.

`verify:ui-evidence` watches visible launcher sources. When one changes, the
same diff must contain a PNG whose manifest entry has a strong description and
matches the affected route family. Tests, declarations, and non-visual type
files are ignored.

The broader release boundary is checked by:

```bash
pnpm completion:gate:status
pnpm completion:gate:local
pnpm completion:gate:external
```

The local gate is deterministic and cannot prove external completion. The
external gate remains blocked until its real artifacts and environment values
are supplied.

## Other evidence

- [`local-completion-audit.md`](./local-completion-audit.md) summarizes what the
  checkout can verify locally and which completion lanes remain external.
- [`external/README.md`](./external/README.md) indexes external proof templates.
- [`../runbooks/external-completion-evidence.md`](../runbooks/external-completion-evidence.md)
  is the operator workflow for live capture.
- [`../runbooks/hosted-cron-evidence.md`](../runbooks/hosted-cron-evidence.md)
  covers the read-only hosted scheduler collector.

External evidence must use fresh UTC timestamps, the exact release tag and
full commit SHA, specific redacted run/dashboard/artifact locators, and checked
proof rows. Never commit provider secrets, bearer tokens, service-role keys,
private keys, or raw invite tokens.

The operator handoff commands are:

```bash
pnpm external:evidence:next
pnpm external:evidence:worklist
pnpm external:evidence:packet
pnpm external:evidence:runbook
pnpm external:evidence:preflight
pnpm completion:gate:status
pnpm completion:gate:external
```
