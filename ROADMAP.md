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

### Backlog: Downloads Split (`commands/downloads/legacy.rs`)

Inventur ergab 11 klare Modulgrenzen in `legacy.rs` (3617 LOC):

| Sub-Modul | LOC ca. | Inhalt |
|---|---|---|
| `downloads/types.rs` | 250 | `StartDownloadResponse`, `DownloadItemPayload`, `DownloadStatusKind`, Status-Konstanten, `ActiveDownload`, `InternalDownloadSource`, `SteamCefTarget`, `SteamDownloadControlAction` |
| `downloads/history.rs` | 250 | `load/save/trim_download_history`, `terminal_sort_rank`, `is_*_status` Helfer, `MAX_HISTORY`/`TTL` Konsts |
| `downloads/steam_cef.rs` | 700 | CEF/CDP-Download-Steuerung (Targets, Expressions, Launch mit Debugging) |
| `downloads/steam_state.rs` | 200 | `SteamDownloadState` Parsing, `calculate_steam_progress`, VDF-Extraktion |
| `downloads/internal_download.rs` | 250 | `download_internal_game_file(_once)` |
| `downloads/reconcile.rs` | 400 | `reconcile_downloads`, `ReconciliationResult` |
| `downloads/health.rs` | 140 | `check_provider_health` + 4 Plattform-Health-Checks |
| `downloads/install.rs` | 200 | `install_downloaded_game_package`, Manifest-Write, Cache-Update |
| `downloads/utils.rs` | 150 | `normalize_game_id`, Plattform/Provider-Lookup, `verify_sha256`, `get_dir_size` |
| `downloads/watcher.rs` | 300 | `start_global_download_watcher` |
| `downloads/start.rs` | 700 | `start_download` als Top-Level-Command, intern ggf. weiter in Phasen zerlegbar |

**Migration:** Sub-Module eins nach dem anderen, jeder mit Re-Export in `downloads::` Shims bis alle migriert sind, dann `legacy.rs` löschen. Jeder Sub-PR per Modul, `cargo check` + `cargo test` dazwischen. Geschätzter Aufwand: 1-2 Tage, verteilt auf 10+ kleine PRs.

### Phase 5 — CI/CD

- Add Windows + macOS runners
- Add `cargo fmt --check`, `cargo clippy -D warnings`, `cargo test` jobs
- Add Supabase migration check (`supabase db lint`)
- Parallel jobs (typecheck/lint/test/rust-check)
- Coverage thresholds in CI

**Already in place (b97aee5)**

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
