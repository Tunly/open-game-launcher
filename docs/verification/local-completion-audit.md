# Local Completion Audit - 2026-06-18

This audit defines the local completion boundary for this checkout. It is a
release-readiness boundary, not a claim that external provider, hardware, or
hosted production systems have been exercised.
Last refreshed: 2026-06-20 for completion-gate, external evidence, and hosted
cron evidence helper semantics. The full local completion gate was last recorded
separately; no live external evidence was collected in this workspace.

## Local Completion Boundary

- Local app code, deterministic readiness routes, Supabase Edge contracts, Rust
  command contracts, frontend tests, linting, typechecking, formatting,
  Supabase Edge Function Deno checking, and screenshot, DOM, and static-class
  evidence are the parts that can be completed in this workspace.
- `FEATURE_PLAN.md` remains the source of truth for work that needs external
  systems. Items that require live provider credentials, physical devices,
  hosted cron rows, production dashboards, marketplace review, app-store
  distribution, or provider terms approval stay open until that evidence exists.
- Readiness panels and verify routes may show local fixtures, dry-runs, staging
  packets, and no-write contract evidence. They must not be described as live
  success unless the backing external evidence exists.

## Current Local Evidence

- Automated inventory: Vitest frontend tests, frontend coverage execution,
  current-platform Tauri debug bundle smoke, Rust tests, Deno Edge contracts,
  and Node operational tests are covered by the completion gate and focused
  helper commands below. Treat fresh command output as the source of truth for
  mutable test counts instead of copying aggregate totals into this document.
- Developer automation is locally wired: Dependabot tracks GitHub Actions,
  launcher npm, and Tauri Cargo dependency lanes, and the Husky pre-commit hook
  runs the launcher `lint-staged` guard through the existing `format:check` and
  `lint` commands.
- Tooling versions are pinned for reproducibility: the repository declares
  Node.js `>=22.12 <26`, GitHub Actions reads `.node-version` (`22.12.0`),
  GitHub Actions use verified SHA refs on fixed runner labels, Rust uses
  `rust-toolchain.toml` (`1.95.0`) locally and in CI, Supabase CI uses CLI
  `2.104.0`, Deno CI and fallback use `v2.8.3`/`deno@2.8.3`, and hosted deploy
  commands run through the launcher-pinned Supabase CLI instead of an ambient
  global binary.
- The local Supabase DB lint command is wrapped by `scripts/supabase-db-lint.mjs`
  so fresh machines start the local database before linting, existing local DB
  sessions are not stopped, and Supabase CLI credential output is redacted.
  CI also runs the wrapper test before tag packaging can reach the external
  release boundary.
- Edge Function coverage includes checkout/webhook/order support, store license
  signing, price-drop cron contracts, presence polling, account export/deletion,
  hosted community artwork moderation, RAWG assets, trusted playtime and
  achievement ingestion, invite hosted proof, remote companion relay, mobile
  push registration, and shared privacy/store boundaries without live secrets.
- Native Rust coverage includes external launcher dispatch URI validation with a
  test-injected opener, no-process rejection of unsafe Steam/EA/Ubisoft/Battle.net
  payloads, Epic/Legendary tracking without URI launch, controller layout filename
  sanitization, explicit keyboard/mouse output mappings, supported controller
  input labels, filtering for unknown or empty virtual input bindings before
  runtime output paths can use them, and Cross-Store Save Sync apply/rollback
  coverage for nested multi-file copies, overwrite-plus-new-file manifests,
  source/target/backup symlink-ancestor rejection, manifest symlink rejection,
  apply preflight blocking before any copy/backup/manifest mutation, and
  rollback preflight blocking before any restore/delete mutation.
- Frontend verification includes screenshots for routed Retro Manga launcher
  states, component tests for selected modal backdrops, static class checks for
  non-route-mounted overlays, cart/checkout, auth username setup, Library
  desktop/mobile, local hosted-readiness panels, mobile session/library/chat contract
  proofs, One-Click Setup rollback/audit no-write contract desktop/mobile
  evidence, Hosted Cron Evidence Summary desktop/mobile evidence, External
  Completion Evidence Summary desktop/mobile evidence, Remote Play Epic/EOS
  Provider Contract desktop/mobile evidence, Broadcasting Audience Status
  Contract desktop/mobile evidence, AI Recommendations Consent Audit/Gateway
  Eval evidence, Controller runtime safety evidence, Friends roster action
  handoff desktop/mobile evidence, and no-horizontal-overflow DOM checks for
  explicitly recorded screenshot sweep routes.
- UI screenshot evidence is locally gated for dirty worktrees and CI diffs: when
  `launcher/src/**/*.tsx`, `launcher/src/index.css`, or visible UI
  configuration files such as `launcher/src/components/layout/navigation.ts`,
  `launcher/src/lib/app-shell-skins.ts`, or
  `launcher/src/lib/theme-skin-readiness.ts` change, every changed
  `docs/verification/screenshots/*.png` artifact must have a
  `docs/verification/README.md` entry with route/state, local/mock/env-gated/live
  evidence boundary, and Retro Manga/OG-Launcher or overflow/wrapping language;
  test/spec, declaration, `vite-env.d.ts`, and `launcher/src/lib/types/**` files
  are ignored.
- Release artifact tracking is locally gated: release-critical app/Tauri
  sources, public artwork assets, Supabase Function and migration sources,
  scripts, runbooks, external evidence templates, screenshot artifacts,
  toolchain pins, package/CI manifests, lint-staged config, and hosted evidence
  UI summaries must be tracked by Git before `completion:gate:local` can
  represent a clean-checkout-reproducible state.
- AI Recommendations Hosted Eval Contract local evidence is limited to
  `/library?verify=ai-recommendations-hosted-eval-contract` screenshots, DOM
  overflow checks, and contract tests for deterministic baseline fixtures,
  prompt regression, quality thresholds, safety/abuse fixtures, consent sample
  review, hosted runner boundaries, cloud profile replay blockers, provider
  telemetry replay blockers, and rollout rollback gates. It is not a model call,
  prompt upload, hosted inference run, cloud profile replay, provider telemetry
  fetch, live hosted eval, A/B rollout, or launch automation proof.
- Broadcasting Audience Status Contract local evidence is limited to
  `/community?verify=broadcasting-audience-status-contract` screenshots, DOM
  overflow checks, and contract tests for preview-state labels, stale fallback,
  rollback clear order, provider state-event blockers, audience-count blockers,
  chat-presence blockers, public-status write blockers, and Supabase audience-row
  blockers. It is not provider live-state reads, viewer-count polling, callback
  replay, public live badge mutation, RTMP output, VOD sync, or live audience
  proof.
- Remote Play Epic/EOS Provider Contract local evidence is limited to
  `/library?verify=remote-play-epic-eos-provider-contract` screenshots, panel
  overflow checks, and contract tests for provider-state labels, invite-envelope
  shape, URI fallback, provider error mapping, and stream-proof blockers. It is
  not Epic/EOS provider-session detection, invite delivery, invite acceptance, or
  live streaming proof.
- External Completion Evidence Summary local evidence is limited to
  `/settings?verify=external-completion-evidence-summary` screenshots, summary
  panel gate cards, and no-write contract tests for Store/Stripe, hosted cron,
  provider-live, hardware/OS, and rollout lanes. Local dry-runs and fixture
  screenshots do not satisfy the named external artifacts.
- External evidence preflight now requires the named artifact files, checked
  `- [x]` proof rows outside Markdown code fences, HTML comments, and indented
  code blocks, per-artifact proof coverage, specific `Evidence for <proof>:`
  mappings for every checked proof, non-placeholder required environment values,
  non-empty, specific, non-placeholder captured evidence detail fields outside
  inactive Markdown, a fresh UTC ISO-8601 `Captured at` timestamp, and no
  secret-shaped Stripe, bearer, JWT, provider API key/token, provider API-key
  header, Supabase service-role/auth/access token, hosted scheduler secret,
  mobile push/provider secret, private key, device token, or fixture-secret
  content before an external gate can pass; unchecked template
  rows, fenced/commented/indented examples, missing per-artifact proof coverage,
  missing or generic per-proof evidence mappings, placeholder/copied env values,
  placeholder/weak detail values, local `docs/verification/screenshots/*`
  locators, placeholder/example URLs, localhost/loopback/private-network URLs,
  `file://` paths, generic locator values, stale/future capture times, non-ISO
  capture times, and checked rows without captured evidence details stay
  blocked.
- External evidence operator packet and runbook output are local handoff only:
  they summarize selected gate counts, required environment names, artifact
  paths, proof requirements, evidence detail fields, per-gate commands, capture
  order, and missing-evidence next steps without printing environment values,
  mutating artifacts, checking proof rows, or claiming external success.
- Hosted Cron Evidence Summary local evidence is limited to
  `/settings?verify=hosted-cron-evidence-summary` screenshots, evidence packet
  and scheduler-lane cards, and no-write contract tests for price-drop, account
  deletion, and presence scheduler lanes. Dry-run, stale, missing, placeholder-env,
  secret-bearing, unsafe-run-id, missing-count, invalid-count, semantically
  impossible aggregate-count, unsafe-REST-target, or verify-route-written
  evidence rows do not prove live hosted scheduling; the external artifact must
  still attach scheduler configuration/dashboard evidence proving the row came
  from the real scheduler.
- Hosted cron evidence tests mirror the account-deletion storage bucket count
  against the Edge Function contract so local collector validation cannot drift
  silently from destructive cleanup coverage.
- Hosted cron evidence packet output is local handoff only: it reports missing
  REST/auth env names, sanitized row validation state, count summaries, and
  artifact detail hints only after the selected scheduled non-dry-run rows
  validate; by default the collector selects all three scheduler lanes, while
  Store/Stripe price-drop evidence can focus `price-drop` with
  `OGL_HOSTED_CRON_EVIDENCE_CHECKS=price-drop`; it does not call Edge Functions,
  create schedules, write rows, print REST/auth values, check proof rows, or
  prove scheduler ownership.
- Hosted deploy gate packet output is local handoff only: it reports missing
  GitHub Environment env names, required Supabase runtime secret names, deploy
  function `verify_jwt` flags, dry-run/OPTIONS smoke plans, scheduler handoff
  shapes, and next commands without printing secret values, deploying
  functions, calling hosted functions, creating schedulers, or proving external
  success.
- One-Click Setup rollback/audit evidence is limited to
  `/settings?verify=one-click-setup-rollback-audit-contract` desktop/mobile
  screenshots, DOM checks, and no-write contract tests for setup-step ledger
  order, redacted failure packets, empty writes/deletes/live-calls ledgers, and
  unknown-step blockers; real rollback proof still requires external
  hosted/provider evidence.
- Cross-Store Save Sync local evidence includes a provider save-mapping fixture
  layer that reviews Steam/GOG/Epic external IDs, install paths, relative path
  mapping rules, save-root shapes, and save-file counts, then shows those rules
  in the Cloud Saves panel only as local suggestions and metadata provenance.
  This is local fixture review plus an `accepted=false` automatic path-map apply
  request template only, not provider API validation, provider cloud transfer,
  live Supabase/keychain E2E, or a real migration run.
- Performance polling is locally gated: active game attribution polls native
  metrics at 1Hz, while standalone/idle overlay attribution uses local preview
  without native polling.
- Latest focused operational verification commands:

```bash
pnpm completion:gate:local # passed
git diff --check HEAD # passed via completion:gate:local
pnpm completion:gate:external # fails until hosted deploy, hosted cron, and external proof artifacts pass preflight
pnpm hosted:deploy-gate:test # passed
pnpm completion:gate:test # passed
pnpm release:tag:test # passed
pnpm tauri:debug-bundle:test # passed
pnpm tauri:debug-bundle # passed on linux with a debug .deb bundle smoke
pnpm external:evidence:test # passed
pnpm hosted:cron-evidence:test # passed
pnpm supabase:db:lint:test # passed
NODE_ENV=development pnpm --dir launcher install --frozen-lockfile # passed; prepare installs Husky hook path
pnpm --dir launcher lint-staged --diff HEAD --no-stash --concurrent false # passed
pnpm supabase:functions:runner:test # passed
pnpm supabase:functions:check # passed
pnpm verify:ui-evidence:test # passed
pnpm verify:ui-evidence # passed
pnpm verify:routes:test # passed
pnpm verify:routes # passed; see fresh command output for current route and screenshot counts
```

`completion:gate:local` starts with `git diff --check HEAD`, so staged and
unstaged whitespace and patch metadata errors are covered by the same
deterministic local gate. On this Linux host, the gate logs the Rust Windows
target check as skipped with an explicit `windows-2025` CI handoff; the same gate runs the real
`cargo check --target x86_64-pc-windows-msvc` command on Windows.

## External Evidence Still Required

Current external evidence status is `0/5` gates ready.
`v*` tag packaging and draft release artifacts are blocked by the
`hosted-production` CI release-boundary job until `pnpm completion:gate:external`
passes with real hosted/provider evidence and checked artifacts. The release job
also validates the tag against the launcher/Tauri versions, verifies the tagged
commit is the current `origin/main` commit, and ignores scoped external-evidence
env vars so a tag cannot shrink the proof lane set or release from an unrelated
branch tip.

- Store/Stripe (`store-stripe-live`): real Stripe webhook signature delivery, Stripe Dashboard
  tax/invoice configuration, and real hosted price-drop scheduler execution
  across `docs/verification/external/store-stripe-live-staging.md` and
  `docs/verification/external/store-price-drop-scheduler-live.md`.
- Hosted Supabase cron (`hosted-supabase-cron`): trusted scheduled runs for price-drop notifications,
  account deletion processing, and platform presence polling with real secrets,
  fresh evidence rows, and zero failure counts where aggregate rows expose
  `failed_count`. Use `docs/runbooks/hosted-cron-evidence.md` and
  `pnpm hosted:deploy-gate:scheduler-packet`, confirm its
  `SUPABASE_FUNCTIONS_URL` setup step, then run `pnpm hosted:cron-evidence` and
  `pnpm hosted:cron-evidence:artifact-hints` after scheduler handoff with
  `SUPABASE_REST_URL or SUPABASE_URL or SUPABASE_PROJECT_REF` plus
  `SUPABASE_SERVICE_ROLE_KEY or SUPABASE_ANON_KEY + SUPABASE_AUTH_JWT`.
- Provider integrations (`provider-live-integrations`): real provider-key staging for
  mod.io/CurseForge, live non-Steam presence bridges,
  provider-approved catalog/cloud transfer flows, real achievement/provider
  cache E2E, and provider terms approval where needed.
- Hardware/OS E2E (`hardware-os-e2e`): fullscreen/anti-cheat overlay evidence, long native
  overlay sessions, protected-title validation, external-drive backup/restore
  E2E on Windows/macOS/Linux, and real client mount/apply behavior against
  provider clients.
- Rollout tracks (`rollout-tracks`): community-wide hosted artwork/screenshots rollout,
  production controller layout rollout, plugin marketplace execution/update
  channels, native mobile apps, push-provider delivery, app-store distribution,
  hosted production deployment, and One-Click Setup hosted/auth/provider
  rollback proof. Use `docs/runbooks/external-completion-evidence.md` plus
  `pnpm external:evidence:worklist` and `pnpm external:evidence:preflight` to
  track required proof artifacts.

## Completion Rule

A feature is locally complete when its deterministic code path, tests, docs, and
visual evidence are present and the remaining `FEATURE_PLAN.md` task requires
external evidence. Do not convert those external tasks to "done" without the
real evidence artifact and a fresh verification note.
