# Local-Only Custom Artwork Design

## Goal

Keep custom game artwork private to the current OG-Launcher installation. The game settings popover must allow the user to choose a local banner, icon, or logo, while removing automatic suggestions and every hosted community-artwork interaction from the normal game-details experience.

## User Interface

The existing **Custom Artwork** section keeps the three local file controls: Banner, Icon, and Logo. The preview/confirmation modal and Reset Artwork action remain unchanged.

The following surfaces are removed from `GameDetails`:

- Auto Artwork suggestions and their apply/replace cards.
- Hosted community artwork upload and pending-review controls.
- Community Art Deck, including hosted loading, voting, reporting, and importing.

The surrounding Retro Manga Launcher styling, settings layout, and unrelated game controls remain unchanged.

## Data Flow and Storage

Selecting a local file continues through the current preview flow. Confirmed artwork is converted to a data URL and stored under the existing `launcher.libraryCustomArtwork` local-storage entry. Reset removes the corresponding local entry.

The normal `GameDetails` component must no longer call the Supabase community-artwork API to list, upload, vote on, or report artwork. No new native or hosted persistence is introduced.

Existing scanned provider artwork remains available as the fallback when no local custom artwork is set.

## Scope Boundaries

This change does not remove the Supabase community-artwork implementation, migrations, or isolated verification components elsewhere in the repository. It removes the feature from the normal game-details UI and prevents that surface from issuing hosted artwork requests. Unrelated local changes already present in `GameDetails.tsx`, `useLibrarySync.ts`, and other files must be preserved.

## Verification

- A focused component test proves that Auto Artwork, hosted upload, and Community Art Deck are absent.
- Existing local-artwork hook tests continue to prove preview, confirmation, local persistence, and reset behavior.
- Run the focused tests, typecheck, lint, and production build.

