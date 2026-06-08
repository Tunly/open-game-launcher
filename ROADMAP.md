# Open Game Launcher — Improvement Roadmap

> Tracking document for code quality and reliability improvements.
> All phases completed. This document is now an archive/history.

## Overview

| #   | Phase                     | Priority | Effort   | Status    | Goal                                                                |
| --- | ------------------------- | -------- | -------- | --------- | ------------------------------------------------------------------- |
| 1   | Security & RLS Hardening  | High     | 1-2 days | Completed | Close Stripe/RLS/path-traversal/injection holes                    |
| 2   | Quick-Wins Tooling        | Low      | 1 day    | Completed | Editorconfig, Prettier, Husky, tsconfig strictness, .gitignore gaps |
| 3   | LibraryPage Decomposition | High     | 3-5 days | Completed | Split 2749-LOC god-component into hooks + subcomponents             |
| 4   | Architecture Polish       | Medium   | 3-4 days | Completed | Zustand selectors, error helpers, subscription hooks, Rust splits   |
| 5   | CI/CD Hardening           | Medium   | 1-2 days | Completed | 7 parallel jobs, Windows runner, Rust checks, coverage, build-upload, deep-link |

See `docs/IMPROVEMENTS_FINDINGS.md` for the raw audit.

---

## Phase 1 — Security & RLS Hardening

### Security fixes (branch `security/hot-spots-a-b-c`)

| Commit  | Area             | Fix                                                                                                |
| ------- | ---------------- | -------------------------------------------------------------------------------------------------- |
| df11a4b | Path traversal   | `delete_screenshot` constrained to canonical screenshots dir; legacy `scan_mod_directory` removed. |
| 1743813 | Command injection | `commands/uri_safety` with `validate_slug` + `validate_uri_scheme` + `open_uri_safely`. `cmd /C start ""` removed, Windows uses `rundll32`. |
| acb71fc | WebView surface  | `tauri.conf.json`: `assetProtocol.scope` tightened, `csp: null` → strict policy.                  |

### Stripe hardening (branch `fix/D-1-stripe-hard-fail`, PR #27)

| Sub-area | Status |
| -------- | ------ |
| D-1      | ✅ `_shared/env.ts` `requireEnv()` — `STRIPE_SECRET_KEY` and `SUPABASE_SERVICE_ROLE_KEY` hard-fail (500) when unset. |
| D-2      | ✅ `stripe-webhook/index.ts` (PR #28) — verifies `Stripe-Signature` via `constructEvent()`, handles `checkout.session.completed`. |
| D-3      | ✅ RLS audit complete (76/76 tables, 200+ policies in `docs/IMPROVEMENTS_FINDINGS.md`). Re-run `supabase db lint` on any future migration. |

---

## Phase 2 — Quick-Wins Tooling

✅ Editorconfig, Prettier, Husky, tsconfig strictness, .gitignore gaps.

---

## Phase 3 — LibraryPage Decomposition

✅ 2749-LOC `LibraryPage` split into hooks + subcomponents.

---

## Phase 4 — Architecture Polish

- ✅ `commands/downloads/mod.rs` (47 LOC) + legacy split into 11 sub-modules (PR #19)
- ✅ `commands/games/detect.rs` → `detect/` directory module with `epic.rs` + `steam.rs`
- ✅ Error helpers: `getErrorMessage` in `lib/formatters.ts`
- ✅ Subscription hook: `useSupabaseSubscription.ts`
- ✅ `eslint-disable no-explicit-any` removed (2 local suppressions remain)
- ✅ Zustand `useShallow` adopted in `ModsPage.tsx`
- ✅ Downloads Split Phase 2 (PR #26): `start.rs` 856 → 173 LOC, 6 new sub-modules

---

## Phase 5 — CI/CD

- ✅ Windows + macOS runners (7 parallel jobs)
- ✅ `cargo fmt --check`, `cargo clippy -D warnings`, `cargo test`
- ✅ `supabase db lint`
- ✅ Coverage thresholds (per-pattern in `vitest.config.ts`)
- ✅ Workflow reactivated: `if: ${{ false }}` guard removed (PR #25)
- ✅ Build & Upload job: 3-platform release builds on `v*` tags, auto GitHub Release
- ✅ Deep-link: `oglauncher://` scheme registered (Windows registry + Tauri plugin + single-instance handler)

---

## Verification checklist (all passing)

- [x] `pnpm typecheck` — 0 errors
- [x] `pnpm lint` — clean
- [x] `pnpm test` — 288/288
- [x] `pnpm build` — passes
- [x] `cargo test --lib` — 84/84
- [x] `cargo fmt --all -- --check` — clean
- [x] `cargo clippy -D warnings` — 0 new (23 pre-existing tracked)
