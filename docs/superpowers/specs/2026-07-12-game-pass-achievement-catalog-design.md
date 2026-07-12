# PC Game Pass Achievement Catalog Design

## Goal

Show every valid PC Game Pass catalog title on the Achievement page, including
titles that are not installed and do not yet have synchronized achievement
data.

## Root Cause

The Achievement page currently starts from `listInstalledGames()`, which only
returns the native installed-game inventory. The Library page extends that
inventory with `mergeGamePassCatalog`, but the Achievement page does not run
that merge. Game Pass catalog titles therefore disappear before achievement
grouping, filtering, cloud hydration, or rendering can process them.

## Data Flow

After the native inventory is loaded and launcher keys are normalized, the
Achievement page passes the games through the existing `mergeGamePassCatalog`
provider merger. That merger remains the single source of truth for:

- reading and refreshing the PC Game Pass catalog cache;
- validating and normalizing catalog records;
- enriching installed Xbox variants with catalog artwork and metadata;
- deduplicating catalog entries against installed Xbox games; and
- appending missing catalog-only titles.

The merged inventory then continues through the existing archive refresh,
hosted achievement hydration, grouping, source filters, sorting, and rendering.

## Display Behavior

Catalog-only titles render as ordinary Xbox achievement rows. They remain
visible even when they have zero achievements. Existing provider-status copy
continues to explain that achievement sync requires an installed Xbox variant
or usable Xbox title identity. No new layout, styling, navigation, or visual
component is introduced; the Retro Manga Launcher design remains unchanged.

## Error Handling

Game Pass catalog failures must not hide the native installed-game inventory.
The existing merger fallback is preserved: it returns the incoming games,
records warnings, and uses cached catalog data when available. Verification
routes continue to skip provider/network hydration as they do today.

## Testing

Add a page-level regression test in `AchievementsPage.test.tsx` that provides an
empty native inventory and a valid cached PC Game Pass catalog entry. The test
must fail before the fix and then prove that the catalog title is rendered on
`/achievements`. Existing Game Pass merger, provider-status, and Achievement
page tests remain green.

Run the focused Vitest suites, TypeScript typecheck, ESLint, and the launcher
build before completion. Because the rendered structure and styling do not
change, visual verification is limited to confirming the existing row renders
for the new data state without console or framework errors.

## Acceptance Criteria

1. Every valid PC Game Pass catalog title can appear on the Achievement page,
   even when the native installed-game list is empty.
2. Installed Xbox games are not duplicated by matching catalog entries.
3. Catalog-only titles without achievement data remain visible with honest
   provider-status messaging.
4. A failed catalog refresh does not remove installed games or cached catalog
   entries.
5. Verification routes retain their current no-provider-call behavior.
6. The existing OG Launcher visual system is unchanged.
