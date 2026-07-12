# PC Game Pass Achievement Catalog Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every valid PC Game Pass catalog title visible on the Achievement page, including catalog-only titles with no synchronized achievements.

**Architecture:** Keep `mergeGamePassCatalog` as the single catalog/cache/normalization/deduplication boundary. The Achievement page will run that merger after normalizing the native inventory and before archive refresh or hosted hydration; verification routes will retain their current provider-free behavior.

**Tech Stack:** React 19, TypeScript 6, Vitest 4, Testing Library, Vite 8, existing OG Launcher provider mergers.

## Global Constraints

- Preserve the Retro Manga Launcher visual system from `docs/PROJECT_DESIGN.md`.
- Keep `OG-Launcher` and primary navigation unchanged.
- Do not modify layout, styling, navigation, or achievement copy outside the existing provider-status message.
- Preserve existing Game Pass validation, cache refresh, normalization, artwork enrichment, and deduplication behavior.
- A failed catalog refresh must leave installed games and usable cached catalog entries visible.
- Verification routes must not trigger Game Pass provider or network hydration.
- Browser plugin and Playwright are unavailable in this workspace; do not add a browser dependency for this fix. Use the rendered Testing Library page test plus the production build as UI evidence.
- Preserve all unrelated uncommitted workspace changes, especially in `launcher/src/hooks/library/useLibrarySync.ts` and its tests.

---

## File Structure

- Modify `launcher/src/pages/AchievementsPage.tsx`: add the existing Game Pass catalog merger to the page inventory-loading boundary.
- Modify `launcher/src/pages/AchievementsPage.test.tsx`: add a page-level cached-catalog regression and isolate Local Storage state between tests.
- No new production module or UI component is needed.

### Task 1: Load the PC Game Pass catalog into the Achievement inventory

**Files:**
- Modify: `launcher/src/pages/AchievementsPage.tsx:17-20,397-428`
- Test: `launcher/src/pages/AchievementsPage.test.tsx:1-30,66-114`

**Interfaces:**
- Consumes: `mergeGamePassCatalog(games: Game[], context: MergeContext): Promise<ProviderResult>` from `launcher/src/library/providers/gamepass.ts`.
- Produces: the existing `localGames: Game[]` and `games: Game[]` state now include normalized, deduplicated PC Game Pass catalog entries.

- [ ] **Step 1: Add the failing page-level regression test**

Add the storage-key import:

```ts
import { STORAGE_KEYS } from "../lib/storage-keys";
```

Clear Local Storage in the existing `beforeEach` immediately after `vi.clearAllMocks()`:

```ts
localStorage.clear();
```

Add this test after the normal-route readiness-panel test:

```tsx
it("loads PC Game Pass catalog titles beyond the native installed inventory", async () => {
  localStorage.setItem(
    STORAGE_KEYS.GAME_PASS_CATALOG_CACHE,
    JSON.stringify([
      {
        id: "gamepass-9NBLGGH4R315",
        externalId: "9NBLGGH4R315",
        title: "Game Pass Archive",
        description: "",
        coverUrl: null,
        logoUrl: null,
      },
    ]),
  );

  renderAchievementsRoute("/achievements");

  const heading = await screen.findByRole("heading", { name: "Game Pass Archive" });
  const row = within(heading.closest("article")!);
  expect(row.getByText(/pc game pass catalog entry/i)).toBeInTheDocument();
  expect(launcherMocks.syncGameAchievements).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run the new test and verify the red state**

Run:

```powershell
pnpm --dir launcher exec vitest run src/pages/AchievementsPage.test.tsx -t "loads PC Game Pass catalog titles beyond the native installed inventory"
```

Expected: FAIL because the page cannot find the `Game Pass Archive` heading; `listInstalledGames()` returned an empty array and the page has not consumed the catalog cache.

- [ ] **Step 3: Add the minimal catalog merge to the Achievement page**

Add the provider import:

```ts
import { mergeGamePassCatalog } from "../library/providers";
```

Change the normalized inventory declaration from `const` to `let`, then merge the catalog before publishing `localGames` and `games`:

```ts
let allGames = listedGames.map((game) => {
  const launcher = normalizeLauncherKey(game.launcher, game.id);
  return launcher === game.launcher ? game : { ...game, launcher };
});

if (!shouldSkipRemoteHydration) {
  const catalogResult = await mergeGamePassCatalog(allGames, {
    forceRefresh: false,
    setStatusMessage,
    shouldApplyResult: () => mounted,
  });
  for (const warning of catalogResult.warnings) {
    console.warn(warning);
  }
  if (catalogResult.statusMessage && mounted) {
    setStatusMessage(catalogResult.statusMessage);
  }
  allGames = catalogResult.games;
}
```

Keep the existing mounted checks, state publication, archive refresh, error handling, and hosted hydration unchanged after this block.

- [ ] **Step 4: Run the focused regression and verify the green state**

Run:

```powershell
pnpm --dir launcher exec vitest run src/pages/AchievementsPage.test.tsx -t "loads PC Game Pass catalog titles beyond the native installed inventory"
```

Expected: PASS; the cached catalog title renders and no unsupported provider sync call is attempted.

- [ ] **Step 5: Run the related regression suites**

Run:

```powershell
pnpm --dir launcher exec vitest run src/pages/AchievementsPage.test.tsx src/library/providers/__tests__/gamepass.test.ts src/hooks/library/__tests__/useLibrarySync.test.tsx src/lib/__tests__/achievement-providers.test.ts
```

Expected: all four test files pass with no unhandled errors. The existing verification-route assertions must continue to show no remote/provider hydration.

The new Testing Library assertion is the rendered interaction proof for this data-only UI change: `/achievements` loads with an empty native inventory, consumes the cached catalog, and paints the existing Xbox achievement row and provider-status message.

- [ ] **Step 6: Run static checks and the production build**

Run:

```powershell
pnpm --dir launcher typecheck
pnpm --dir launcher exec eslint src/pages/AchievementsPage.tsx src/pages/AchievementsPage.test.tsx
pnpm --dir launcher build
```

Expected: all three commands exit with code 0. Record any unrelated failure without modifying unrelated user changes.

- [ ] **Step 7: Review the final diff and commit only the fix files**

Run:

```powershell
git diff --check -- launcher/src/pages/AchievementsPage.tsx launcher/src/pages/AchievementsPage.test.tsx
git diff -- launcher/src/pages/AchievementsPage.tsx launcher/src/pages/AchievementsPage.test.tsx
git status --short
git add -- launcher/src/pages/AchievementsPage.tsx launcher/src/pages/AchievementsPage.test.tsx docs/superpowers/plans/2026-07-12-game-pass-achievement-catalog.md
git commit -m "fix: show Game Pass catalog achievements"
```

Expected: the diff contains only the Game Pass inventory merge, the regression test, and this plan; the commit succeeds without staging unrelated workspace changes.
