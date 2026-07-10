# Finish Activity Page Implementation Plan

> **Execution rule:** Follow red-green-refactor for every behavior change. Preserve unrelated dirty-worktree changes and stage only Activity-owned files.

**Goal:** Make `/activity` a production-ready yearly recap sourced only from complete, enriched Supabase session data.

**Architecture:** The Supabase playtime layer performs paginated relational reads from `game_sessions` to `games`, plus a compact paginated year-index read. The existing session hook gains stable range/year inputs and explicit authentication metadata. The Activity page consumes those contracts and renders honest backend, sign-in, loading, failure/retry, empty, and ready states without implicit sample data.

**Tech stack:** React 19, TypeScript, React Router, Supabase JS, Vitest/Testing Library, Tailwind CSS.

---

## Task 1: Complete and enrich the Supabase session read

**Files:**

- Modify: `launcher/src/lib/supabase/playtime.ts`
- Modify: `launcher/src/lib/supabase/__tests__/playtime.test.ts`

1. Add failing tests for a relational `games(title, cover_url)` projection, nested metadata mapping, missing-related-game fallback, multiple result pages, and inclusive-start/exclusive-end filters.
2. Run `pnpm exec vitest run src/lib/supabase/__tests__/playtime.test.ts` and confirm the new tests fail for the expected missing behavior.
3. Implement deterministic page-size-based reads that rebuild the Supabase query per page, preserve existing missing-schema/error behavior, and return normalized `UserPlaySession` rows.
4. Add a paginated `getUserPlaySessionYears` read that selects only `started_at`, de-duplicates valid non-future years, and sorts descending.
5. Re-run the focused test until green, then run `pnpm typecheck` for the data contract.

## Task 2: Expose yearly/authenticated loading through the hook

**Files:**

- Modify: `launcher/src/hooks/useUserPlaySessions.ts`
- Modify: `launcher/src/hooks/__tests__/useUserPlaySessions.test.tsx`

1. Add failing tests for stable `since`/`until` forwarding, optional available-year loading, `isAuthenticated`, retry of both reads, error propagation, and stale response protection across a range/year change.
2. Run `pnpm exec vitest run src/hooks/__tests__/useUserPlaySessions.test.tsx` and confirm red.
3. Extend the hook options/result without breaking callers that use the no-argument form.
4. Fetch selected sessions and available years together when requested; preserve cleanup/unmount guards and reset state honestly when unconfigured or signed out.
5. Re-run the focused hook tests until green.

## Task 3: Finish Activity page states and year integrity

**Files:**

- Modify: `launcher/src/pages/GameActivityDashboardPage.tsx`
- Modify: `launcher/src/pages/GameActivityDashboardPage.test.tsx`

1. Add failing page tests proving plain `/activity` never uses hard-coded sessions, unconfigured and signed-out states are distinct, load errors have Retry, empty years are honest, future years are rejected, available years remain stable, joined titles are rendered, and share feedback resets on year change.
2. Run `pnpm exec vitest run src/pages/GameActivityDashboardPage.test.tsx` and confirm red.
3. Remove normal-route sample-session generation and calculate an inclusive calendar-year start plus exclusive next-year boundary.
4. Pass the stable range into the hook; build the year selector from current year, previous year, selected valid year, and returned Supabase years only.
5. Add Retro Manga styled backend/sign-in/error/retry/empty panels; wire `/auth` and `refetch`; keep existing ready recap/share composition.
6. Reset share status when the selected recap year changes and remove out-of-palette warning/error colors.
7. Re-run page, recap, ActivitySection, and route tests until green.

## Task 4: Explicit visual verification mode and evidence

**Files:**

- Modify only if needed: `launcher/src/pages/GameActivityDashboardPage.tsx`
- Modify: `launcher/src/pages/GameActivityDashboardPage.test.tsx`
- Refresh: `docs/verification/screenshots/game-activity-dashboard-yearly-recap-local-preview.png`
- Refresh: `docs/verification/screenshots/game-activity-dashboard-yearly-recap-local-preview-mobile.png`
- Refresh if current flows are captured: Activity share/browser-share screenshots
- Modify: `docs/verification/README.md` only when names or descriptions change

1. If real credentials are unavailable for deterministic local screenshots, add a development-only explicit verification fixture guarded by a dedicated query flag and `import.meta.env.DEV`.
2. Prove by test that plain `/activity` cannot activate it and that the verification surface is visibly labelled `Verification Preview` and `Sample Data`.
3. Capture current desktop and 390px mobile screenshots including the complete share panel, header navigation, and no horizontal overflow.
4. Inspect both images visually against `docs/PROJECT_DESIGN.md` and iterate on any overflow or style defect.

## Task 5: Final review and verification

1. Review the full Activity-owned diff for requirement coverage, unsafe raw identifiers, stale state, and accidental unrelated edits.
2. Run:
   - `pnpm format:check`
   - `pnpm typecheck`
   - `pnpm lint`
   - `pnpm test`
   - `pnpm build`
   - root `pnpm verify:routes`
   - root `pnpm verify:ui-evidence`
3. Run `git diff --check` for the Activity-owned files.
4. Obtain an independent final code review; fix every important finding and re-run its covering tests.
5. Report exact passing counts and any repository-wide failure proven unrelated to Activity work.
