# Open Game Launcher — Improvement Roadmap

> Tracking document for code quality and reliability improvements.
> Each phase is a separate branch + PR. Status reflects the current branch in this repo.

## Overview

| #   | Phase                     | Priority | Effort   | Status      | Goal                                                                |
| --- | ------------------------- | -------- | -------- | ----------- | ------------------------------------------------------------------- |
| 1   | Security & RLS Hardening  | High     | 1-2 days | In Progress | Close Stripe/RLS/path-traversal/injection holes (see status below)  |
| 2   | Quick-Wins Tooling        | Low      | 1 day    | Completed   | Editorconfig, Prettier, Husky, tsconfig strictness, .gitignore gaps |
| 3   | LibraryPage Decomposition | High     | 3-5 days | Completed   | Split 2749-LOC god-component into hooks + subcomponents             |
| 4   | Architecture Polish       | Medium   | 3-4 days | In Progress | Zustand selectors, error helpers, subscription hooks, any→types, Rust file splits |
| 5   | CI/CD Hardening           | Medium   | 1-2 days | In Progress | Windows runner, Rust checks, coverage thresholds in CI (PR #25) |

See `docs/IMPROVEMENTS_FINDINGS.md` for the raw audit.

---

## Phase 1 — Security & RLS Hardening (status)

Phase 1 was originally marked Completed in the table above. That was
**premature**. The sub-areas are tracked separately here so the
remaining work is visible.

### Closed in branch `security/hot-spots-a-b-c` (3 commits)

| Commit  | Area             | Fix                                                                                                |
| ------- | ---------------- | -------------------------------------------------------------------------------------------------- |
| df11a4b | Path traversal   | `delete_screenshot` constrained to canonical screenshots dir; legacy `scan_mod_directory` removed. |
| 1743813 | Command injection | New `commands/uri_safety` module with `validate_slug` + `validate_uri_scheme` + `open_uri_safely`. `cmd /C start ""` removed from all three `open_uri` call sites (Windows now uses `rundll32 url.dll,FileProtocolHandler`). |
| acb71fc | WebView attack surface | `tauri.conf.json`: `assetProtocol.scope` tightened to `$APPDATA/**`, `$APPLOCALDATA/**`, `$APPCACHE/**`, `$HOME/**`, plus four explicit Steam library-cache paths. `csp: null` replaced with a strict policy. |
| (this)  | Documentation   | ROADMAP/CHANGELOG brought in line with reality.                                                    |

### Open

| Sub-area | Issue                                                                                                              |
| -------- | ------------------------------------------------------------------------------------------------------------------ |
| D-1      | ✅ **Done** (PR #27). Stripe edge functions now use `requireEnv()` and throw `500 Missing required environment variable: STRIPE_SECRET_KEY` when the secret is unset. |
| D-2      | ✅ **Done** (PR #28). `stripe-webhook/index.ts` verifies `Stripe-Signature` via `constructEvent()`, handles `checkout.session.completed`, upserts into `orders`. |
| D-3      | Audit of RLS coverage was done in `docs/IMPROVEMENTS_FINDINGS.md` (76/76 public tables, 200+ policies). Re-verify on every migration. |

---

## Backlog & Open Phases (Phase 5)

### Phase 4 — Architecture Polish

**Done**

- `commands/downloads/mod.rs` (47 LOC) + `commands/downloads/legacy.rs` (3617 LOC) re-export shim.
- `commands/games/detect.rs` split: `games/mod.rs` is now a 26-LOC module wiring `core`, `detect`, `playtime`, `sync`, `types`, `verify`. `detect/` is active as a directory module with `mod.rs` (2854 LOC) + `epic.rs` (753 LOC) + `steam.rs` (1437 LOC). No flat `detect.rs`, no `legacy.rs` in the subdir.
- Error helpers: `getErrorMessage` in `lib/formatters.ts` with tests in `__tests__/formatters.test.ts`.
- Subscription hook: `lib/supabase/useSupabaseSubscription.ts` extracted and reused across presence/activity/social.
- `eslint-disable @typescript-eslint/no-explicit-any` file-level header at `lib/supabase/mods.ts:17` removed. Two local `// eslint-disable-next-line` comments remain (lines 322, 390) for specific calls where the generated `Database` type is missing tables.
- Zustand `useShallow` adopted in `ModsPage.tsx` (line 21 import, line 112 usage). Audit confirmed no other consumer needs it: all other store calls are already atomare Skalar-/Array-Selektoren mit stabiler Referenz.
- Audit: `createSelector` für die 8 abgeleiteten Selektoren (`selectActiveCount`, `selectPausedCount`, `selectCompletedCount`, `selectTotalProgress` × 2 Stores) bringt keinen messbaren Gewinn, weil Input-Referenz (`state.items`) bei jedem `set` neu ist und Output bereits primitive Zahlen sind (Vergleich via `Object.is`).
- `commands/downloads/legacy.rs` Split-Plan dokumentiert (siehe „Backlog: Downloads Split" unten).

**Decision: Phase 4 closed.** Die einzige verbliebene substantielle Arbeit (Downloads-Split) ist ein mechanischer Refactor, der als eigene Phase 4.5 / 6 in den Backlog wandert.

### Backlog → Done: Downloads Split (Phase 1 + 2)

**Phase 1** (`legacy.rs` → 11 Sub-Module) was completed via PR #19
(`refactor/downloads-split`, commits `beb3e95…6d04a24`).
`commands/downloads/legacy.rs` no longer exists.

**Phase 2** (`start.rs` → 3 new sub-modules) was completed in branch
`refactor/downloads-split-phase-2`:

- `queue.rs` — `get_download_queue`
- `control.rs` — `pause_download`, `cancel_download`, `archive_download`
- `external_dispatch.rs` — Steam/Epic/EA/Ubisoft/Battle.net URI dispatch
- `lifecycle.rs` — `DownloadLifecycle` enum (External/Internal dispatch)
- `external_download.rs` — external-launcher tracking loop
- `internal_lifecycle.rs` — internal HTTP(S) download → install lifecycle

`start.rs` is now 173 LOC of pure orchestration (down from 856).

### Phase 5 — CI/CD

- Add Windows + macOS runners ✅ PR #25 (phase-5-ci-hardening) reactivates CI with 7 parallel jobs
- Add `cargo fmt --check`, `cargo clippy -D warnings`, `cargo test` jobs ✅ (3 Rust jobs)
- Add Supabase migration check (`supabase db lint`) ✅
- Parallel jobs (typecheck/lint/test/rust-check) ✅
- Coverage thresholds in CI ✅ (per-pattern thresholds in vitest.config.ts)

**Already in place**

- PR #25 is open and merges into main. The old `if: ${{ false }}` guard has been removed; the workflow now runs on `push` + `pull_request` + `workflow_dispatch`.

---

## Verification checklist (per phase)

- [ ] `pnpm typecheck` passes
- [ ] `pnpm lint` passes
- [ ] `pnpm test` passes
- [ ] For UI changes: `pnpm build` passes
- [ ] For Rust changes: `cargo test` passes
- [ ] For Supabase changes: `supabase db reset` clean
- [ ] Visual review against `docs/PROJECT_DESIGN.md` (UI work)
