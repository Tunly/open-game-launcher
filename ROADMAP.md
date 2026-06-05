# Open Game Launcher — Improvement Roadmap

> Tracking document for code quality and reliability improvements.
> Each phase is a separate branch + PR. Status reflects the current branch in this repo.

## Overview

| #   | Phase                     | Priority | Effort   | Status      | Goal                                                                |
| --- | ------------------------- | -------- | -------- | ----------- | ------------------------------------------------------------------- |
| 1   | Security & RLS Hardening  | High     | 1-2 days | Completed   | Close Stripe/RLS/path-traversal/injection holes                     |
| 2   | Quick-Wins Tooling        | Low      | 1 day    | Completed   | Editorconfig, Prettier, Husky, tsconfig strictness, .gitignore gaps |
| 3   | LibraryPage Decomposition | High     | 3-5 days | Completed   | Split 2749-LOC god-component into hooks + subcomponents             |
| 4   | Architecture Polish       | Medium   | 3-4 days | In Progress | Zustand selectors, error helpers, subscription hooks, any→types, Rust file splits |
| 5   | CI/CD Hardening           | Medium   | 1-2 days | Backlog     | Windows runner, Rust checks, coverage thresholds in CI              |

See `docs/IMPROVEMENTS_FINDINGS.md` for the raw audit.

---

## Backlog & Open Phases (Phases 4, 5)

### Phase 4 — Architecture Polish

**Done**

- `commands/downloads.rs` split into `downloads/mod.rs` (47 LOC) + `downloads/legacy.rs` (3617 LOC).
- Error helpers: `getErrorMessage` in `lib/formatters.ts` with tests in `__tests__/formatters.test.ts`.
- Subscription hook: `lib/supabase/useSupabaseSubscription.ts` extracted and reused across presence/activity/social.

**Still open**

- Finish `commands/games/detect.rs` split: `games/detect/{epic,steam,legacy}.rs` exist on disk (5203+1437+753 LOC) but `games/mod.rs:4` still exposes only the flat `pub mod detect;` (4998 LOC). The subdir is dead code today — wire up `pub mod detect;` as a directory module (`detect/mod.rs`) or move contents into the file.
- Zustand selectors: no `useShallow` / `createSelector` usage in `launcher/src` (searched 0 matches). Library/download/modInstall stores still select full state.
- Remove `eslint-disable @typescript-eslint/no-explicit-any` header at `lib/supabase/mods.ts:17`. The header was already removed at commit `68d49d8` / `90c244d` / `250ae6c`, then re-introduced by `b97aee5` ("Add controller runtime + UI and assorted fixes") and currently present in `HEAD`.
- `commands/downloads/legacy.rs` (3617 LOC) — decide whether to further decompose.

### Phase 5 — CI/CD

- Add Windows + macOS runners
- Add `cargo fmt --check`, `cargo clippy -D warnings`, `cargo test` jobs
- Add Supabase migration check (`supabase db lint`)
- Parallel jobs (typecheck/lint/test/rust-check)
- Coverage thresholds in CI

**Already in place (b97aee5)**

- Dependabot config at `.github/dependabot.yml` (weekly NPM, Cargo, GitHub Actions updates).
- GitHub Actions Ubuntu CI workflow (lint, typecheck, test, build).

---

## Verification checklist (per phase)

- [ ] `pnpm typecheck` passes
- [ ] `pnpm lint` passes
- [ ] `pnpm test` passes
- [ ] For UI changes: `pnpm build` passes
- [ ] For Rust changes: `cargo test` passes
- [ ] For Supabase changes: `supabase db reset` clean
- [ ] Visual review against `docs/PROJECT_DESIGN.md` (UI work)
