# Open Game Launcher — Improvement Roadmap

> Tracking document for code quality and reliability improvements.
> Each phase is a separate branch + PR. Status reflects the current branch in this repo.

## Overview

| #   | Phase                     | Priority | Effort   | Status      | Goal                                                                |
| --- | ------------------------- | -------- | -------- | ----------- | ------------------------------------------------------------------- |
| 1   | Security & RLS Hardening  | High     | 1-2 days | Completed   | Close Stripe/RLS/path-traversal/injection holes                     |
| 2   | Quick-Wins Tooling        | Low      | 1 day    | Completed   | Editorconfig, Prettier, Husky, tsconfig strictness, .gitignore gaps |
| 3   | LibraryPage Decomposition | High     | 3-5 days | Completed   | Split 2749-LOC god-component into hooks + subcomponents             |
| 4   | Architecture Polish       | Medium   | 3-4 days | In Progress | Refactored downloads into module, created platform detect submodules, Zustand selectors |
| 5   | CI/CD Hardening           | Medium   | 1-2 days | In Progress | Ubuntu CI workflow (lint, typecheck, tests), Dependabot config      |

See `docs/IMPROVEMENTS_FINDINGS.md` for the raw audit.

---

## Backlog & Open Phases (Phases 4, 5)

### Phase 4 — Architecture Polish

- Remove `eslint-disable @typescript-eslint/no-explicit-any` header in `lib/supabase/mods.ts` (Done for `crossplay.ts` and `family.ts`)
- Split `commands/games/detect.rs` (4373 LOC) and `commands/downloads.rs` (3295 LOC) by platform/feature (In Progress — epic/steam detectors split out; downloads module wrapper created)

### Phase 5 — CI/CD

- Add Dependabot config for weekly NPM, Cargo, and GitHub Actions updates (Done)
- Add GitHub Actions CI workflow for Ubuntu running typecheck/lint/test/build (Done)
- Add Windows + macOS runners
- Add `cargo fmt --check`, `cargo clippy -D warnings`, `cargo test` jobs in CI
- Add Supabase migration check (`supabase db lint`)
- Parallel jobs (typecheck/lint/test/rust-check)

---

## Verification checklist (per phase)

- [ ] `pnpm typecheck` passes
- [ ] `pnpm lint` passes
- [ ] `pnpm test` passes
- [ ] For UI changes: `pnpm build` passes
- [ ] For Rust changes: `cargo test` passes
- [ ] For Supabase changes: `supabase db reset` clean
- [ ] Visual review against `docs/PROJECT_DESIGN.md` (UI work)
