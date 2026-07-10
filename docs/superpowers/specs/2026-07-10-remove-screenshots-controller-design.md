# Screenshot and Controller Feature Removal Design

## Goal

Remove all screenshot product functionality and all Gyro/Haptics/Controller
functionality from OG Launcher while preserving unrelated visual verification
artifacts and protecting existing hosted user data from silent deletion.

## Scope

The screenshot product boundary includes:

- overlay and desktop screenshot capture;
- screenshot tabs, galleries, lightboxes, upload actions and cloud sync;
- screenshot likes, reports, public/community feeds and ranking;
- screenshot-specific frontend types, hooks, helpers, commands and tests;
- screenshot tables, RPCs, policies, storage paths and generated database types;
- active documentation, verification inventory entries and release evidence claims.

The controller product boundary includes:

- controller-layout, Gyro, Haptics and Steam Input product claims;
- controller-specific frontend/backend/database code and tests;
- active documentation and verification claims.

PNG files used only to document unrelated UI behavior are not product
screenshot functionality and remain in the repository. Historical migrations
may remain when required for safe upgrades, but the final migrated schema and
all active product surfaces must contain neither feature.

## Architecture

Removal proceeds from the public surface inward. Routes and components lose
the screenshot actions first, shared types and helpers are removed after their
callers, native command registration and implementations are removed next, and
the hosted schema is retired with a final safety migration. Documentation is
then rewritten to describe the reduced product boundary without presenting the
removed features as implemented, planned, blocked or externally verifiable.

No replacement capture, media-gallery or controller abstraction is introduced.
Existing artwork uploads remain only if they operate on the separate
`game-artwork` product boundary and do not reuse screenshot tables, buckets or
copy.

## Data Migration Safety

The final migration must inventory every screenshot table, storage object,
policy, trigger, function and publication entry before removal. It must abort
with an actionable error when user-owned screenshot rows or storage objects
exist, rather than deleting user content silently. Once empty, it removes the
feature objects in dependency-safe order and verifies that they cannot be
recreated accidentally by later migrations.

Controller migration history follows the same established safe-removal rule:
historical creation/removal migrations may remain for deployed databases, but
the final schema has no controller-layout objects. Unneeded unshipped remnants
may be removed when doing so does not break ordered migration replay.

## User Experience

- Overlay and anti-cheat fallback surfaces contain no screenshot action or tab.
- Library/game-detail surfaces contain no screenshot gallery, upload, like or
  lightbox controls.
- Community surfaces contain no screenshot feed, ranking, report or rollout
  language.
- Settings and profile surfaces contain no Gyro, Haptics, controller-layout or
  Steam Input controls or readiness language.
- Empty states do not advertise either removed feature.
- Remaining UI continues to follow the Retro Manga Launcher design system.

## Documentation

Active claims are removed from `README.md`, `FEATURE_PLAN.md`, `CHANGELOG.md`,
`PR_BODY.md`, verification indexes, runbooks and release evidence templates.
Documentation may continue to use the word "screenshot" only for a PNG/JPEG
that is verification evidence for an unrelated UI surface. It must not describe
a launcher screenshot product capability.

External gates are updated so screenshot rollout, screenshot capture and
controller/Gyro/Haptics evidence are not required for release completion.

## Testing

Removal is protected by repository-wide contract tests that fail while active
product references or registered commands remain. Focused UI tests confirm the
Overlay, Library and Community surfaces no longer expose screenshot controls.
Migration tests confirm ordered replay reaches a screenshot/controller-free
schema and that non-empty user data blocks destructive removal.

Verification includes focused Vitest/Node/Rust/Supabase checks, route and UI
evidence inventory checks, formatting, lint, typecheck and the relevant local
completion gates. Existing failures unrelated to this removal are reported and
left untouched.

## Acceptance Criteria

1. No user-facing screenshot capture, gallery, upload, like, report or feed
   capability remains.
2. No user-facing controller, Gyro, Haptics or Steam Input capability remains.
3. No native or hosted callable API for either feature remains active.
4. The final migrated schema contains no feature tables, RPCs, policies,
   triggers, publication entries or accessible storage bucket paths.
5. Existing hosted user content cannot be silently deleted by the migration.
6. Active docs and external gates make no product or roadmap claim for either
   feature.
7. Unrelated verification screenshots and the separate custom-artwork system
   continue to work.

## Non-Goals

- Replacing screenshots with another capture or media system.
- Adding a new controller abstraction.
- Deleting unrelated UI evidence images.
- Removing custom artwork merely because it stores image files.
- Rewriting unrelated dirty-worktree changes.
