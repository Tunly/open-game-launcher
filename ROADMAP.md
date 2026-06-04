# Open Game Launcher — Improvement Roadmap

> Tracking document for code quality and reliability improvements.
> Each phase is a separate branch + PR. Status reflects the current branch in this repo.

## Overview

| # | Phase | Priority | Effort | Status | Goal |
|---|-------|----------|--------|--------|------|
| 1 | Security & RLS Hardening | High | 1-2 days | Backlog | Close Stripe/RLS/path-traversal/injection holes |
| 2 | Quick-Wins Tooling | Low | 1 day | Backlog | Editorconfig, Prettier, Husky, tsconfig strictness, .gitignore gaps |
| 3 | LibraryPage Decomposition | High | 3-5 days | Backlog | Split 2749-LOC god-component into hooks + subcomponents |
| 4 | Test Coverage | High | 2-3 days | **Completed** (173 tests) | Component/Store/Hook tests with Vitest |
| 5 | Architecture Polish | Medium | 3-4 days | Backlog | Zustand selectors, error helpers, subscription hooks, any→types |
| 6 | CI/CD Hardening | Medium | 1-2 days | Backlog | Windows runner, Rust checks, coverage thresholds in CI |

See `docs/IMPROVEMENTS_FINDINGS.md` for the raw audit.

---

## Phase 4 — Test Coverage

**Branch:** `feature/phase-4-test-coverage`
**Goal:** Raise confidence in critical paths before Phase 3 refactor. Pure additive changes — no behavior modifications.

### Scope (9 test files)

| # | File | Target | Tests | Result |
|---|------|--------|-------|--------|
| 1 | `components/ui/Button.test.tsx` | Variants, sizes, disabled, click | 5 | ✅ 5 |
| 2 | `components/ui/ConfirmDialog.test.tsx` | Open/close, Esc, Enter, A11y | 4 | ✅ 4 |
| 3 | `components/library/PlatformIcons.test.tsx` | Source→icon mapping | 4 | ✅ 6 (3 each) |
| 4 | `components/library/LibrarySidebar.test.tsx` | Filter state, virtualization threshold, empty states | 8 | ✅ 8 |
| 5 | `stores/downloadStore.test.ts` | upsert, remove, derived counts, status normalization | 10 | ✅ 15 |
| 6 | `stores/modInstallStore.test.ts` | queue, progress, sort order, terminal | 8 | ✅ 14 |
| 7 | `hooks/useDebouncedValue.test.ts` | (new hook + tests) | 4 | ✅ 4 |
| 8 | `hooks/useLocalStorageState.test.tsx` | Extend existing (effect-driven updates) | +3 | ✅ +3 (6 → 9) |
| 9 | `lib/supabase/helpers.test.ts` | Row-converter helpers + schema error detection | 6 | ✅ 25 |

**Result:** 89 → **173 tests**, all green. Per-file coverage on the in-scope files is 92-100%.

### Infrastructure

- **Vitest config** (`launcher/vitest.config.ts`):
  - Coverage scope extended to `src/components/ui/**`, `src/components/library/PlatformIcons.tsx`, `src/stores/**`, `src/hooks/**`
  - `lcov` reporter added (for IDE coverage overlays; not uploaded to codecov)
  - Coverage thresholds: 50% lines/branches/functions/statements (warning only at first)
- **Test setup** (`launcher/test/setup.ts`):
  - Existing `MemoryStorage` localStorage mock kept
  - Global `@tauri-apps/api/core` mock: `invoke` → `vi.fn(() => Promise.resolve(undefined))`
  - `IntersectionObserver`/`matchMedia`/`ResizeObserver` stubs
- **Supabase mock helper** (`launcher/test/mocks/supabase.ts`):
  - Reusable fake client with table maps for the row-converter tests
- **Dependencies**: `@testing-library/user-event` (already transitively present via React Testing Library, not added as new)

### Commit strategy

One commit per test file (9 commits total) so review surface stays small.

---

## Phase 3 — LibraryPage Decomposition

**Branch:** `feature/phase-3-librarypage-refactor`
**Goal:** Reduce `pages/LibraryPage.tsx` (2749 LOC) to <500 LOC via hook + subcomponent extraction. Behavior 1:1, no UX change.

### Extracted hooks (`src/hooks/library/`)

| Hook | Responsibility |
|------|----------------|
| `useLibraryState` | Installed games, selection, cache hydration |
| `useLibraryFilters` | Search/filter/sort memoization |
| `useAchievementAutoSync` | Achievement polling + debouncing |
| `useProviderPicking` | Platform detection + login flow |
| `useBattleNetSync` | WebSocket payload decoding |
| `useFocusSync` | Window focus → library refresh |
| `useManualCollections` | CRUD on `user_game_collections` |
| `useDynamicCollections` | Smart-collection rules engine |

### Extracted components (`src/components/library/`)

| Component | Responsibility |
|-----------|----------------|
| `LibraryFilters` | Search + sort + filter chip bar |
| `LibraryList` | Game rows + virtualization |
| `GameDetailPanel` | Wraps the existing `GameDetails.tsx` |
| `AddGameDialog` | "Spiel hinzufügen" modal |
| `ProviderPickerDialog` | Platform picker |
| `AchievementSyncPanel` | Auto-sync UI |
| `CustomArtworkPanel` | Artwork editor |

### Bug-fix byproducts

- Remove 4× `eslint-disable-next-line react-hooks/exhaustive-deps`
- Centralize 50+ `console.warn/log` calls
- Replace `useState`-for-derived with `useMemo`
- Keep all Phase 4 tests green

---

## Backlog (Phases 1, 2, 5, 6)

### Phase 1 — Security (Critical)

| File | Issue |
|------|-------|
| `supabase/functions/stripe-create-checkout/index.ts:14-31` | No JWT check, body `user_id` trusted, wrong column (`metadata`) |
| `supabase/migrations/20260602120400_overlay_and_monitor.sql:173` | `price_history` missing SELECT policy |
| `supabase/migrations/20260602120300_store_schema.sql` | `store_orders`/`store_order_items`/`store_builds`/`store_licenses` missing write policies; `store_products` allows dev to self-publish |
| `launcher/src-tauri/src/commands/family.rs:10-12` | Shell injection in `cmd /C echo {} | clip` |
| `launcher/src-tauri/src/commands/games/core.rs:559-566` | PowerShell injection in `uninstall_game` |
| `launcher/src-tauri/src/commands/games/core.rs:1712-1720` | Path traversal in `ensure_path_inside_root` |
| `launcher/src-tauri/src/commands/secure_store.rs:44-123` | Plaintext token JSON fallback |
| `launcher/src-tauri/src/commands/perf_monitor.rs:35,63` | `Mutex::lock().unwrap()` → panic on poison |

### Phase 2 — Tooling Quick-Wins

- `.editorconfig` + `.gitattributes` (CRLF warnings)
- Prettier + `format` script
- Husky + lint-staged
- Tighten `tsconfig.json`: `noUncheckedIndexedAccess`, `noUnusedLocals`, `noImplicitOverride`
- Vitest coverage thresholds (Phase 4 step)
- Add 8 missing patterns to `.gitignore`
- Delete `_test.py`, `AchievementsPage.py`, duplicate `tc.log`
- Add `supabase/functions/.env.example`, `CONTRIBUTING.md`, `CHANGELOG.md`, `SECURITY.md`, `CODE_OF_CONDUCT.md`
- `eslint-plugin-jsx-a11y` + `eslint-plugin-boundaries`

### Phase 5 — Architecture Polish

- Replace Zustand "method-in-selector" with plain selectors (`downloadStore.activeCount` → `useDownloadStore(selectActiveCount)`)
- Consolidate 6+ `getErrorMessage` implementations to single `lib/formatters.ts`
- Remove `eslint-disable @typescript-eslint/no-explicit-any` headers in `lib/supabase/{crossplay,mods,family}.ts`
- Extract subscription helper `useSupabaseSubscription(channel, cb)` to replace 6+ ad-hoc `useEffect` + `listen()` patterns
- Move 7× `std::thread::spawn` in `scan_installed_games` to `tokio::task::spawn_blocking`
- Split `commands/games/detect.rs` (4373 LOC) and `commands/downloads.rs` (3295 LOC) by platform/feature

### Phase 6 — CI/CD

- Add Windows + macOS runners
- Add `cargo fmt --check`, `cargo clippy -D warnings`, `cargo test` jobs
- Add Supabase migration check (`supabase db lint`)
- Parallel jobs (typecheck/lint/test/rust-check)
- Dependabot / Renovate config

---

## Verification checklist (per phase)

- [ ] `pnpm typecheck` passes
- [ ] `pnpm lint` passes
- [ ] `pnpm test` passes
- [ ] For UI changes: `pnpm build` passes
- [ ] For Rust changes: `cargo test` passes
- [ ] For Supabase changes: `supabase db reset` clean
- [ ] Visual review against `docs/PROJECT_DESIGN.md` (UI work)
