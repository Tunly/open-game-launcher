# Achievement Popup Removal Design

## Goal

Remove achievement popup notifications completely from OG Launcher. Achievement
sync, progress, history, pages, overlay achievement lists, and social activity
remain available; only transient unlock notifications are retired.

## Root Cause

The silent background achievement sync compares provider results with the local
game snapshot. Unlocks missing from that snapshot are classified as new, even
when they were earned previously. The sync then emits popup events regardless
of silent mode. A global listener in the main launcher renders those events as
"Achievement unlocked" notifications.

## Removal Boundary

The implementation removes the full popup path:

- `AchievementPopupLayer` and its component tests;
- popup mounts in the main launcher and overlay window;
- popup emission from `useAchievementAutoSync` and its mock expectations;
- `emitAchievementPopup` and `useAchievementPopup` from the overlay library;
- `AchievementPopupPayload` from active TypeScript types;
- the native `emit_achievement_popup` Tauri command, payload structure, event
  emission, and command registration.

No replacement toast or notification system is introduced.

## Preserved Behavior

- Provider achievement synchronization continues unchanged.
- Newly discovered unlocks may still update launcher state and status copy.
- Achievement pages, game-detail progress, overlay achievement lists, profile
  statistics, and activity-feed entries remain intact.
- Sync errors and hosted-ingestion behavior remain unchanged.

## Testing

Add a source-boundary regression test that rejects popup components, popup APIs,
the native command, and the `achievement-unlocked` event in active code. Update
the auto-sync tests so a discovered unlock updates state without emitting a
popup. Run focused tests, TypeScript checks, Rust tests, and the relevant build
checks before completion.

## Acceptance Criteria

1. No launcher or overlay window can display an achievement popup.
2. No frontend or native callable popup API remains.
3. Achievement synchronization and persistent achievement views still work.
4. Regression tests fail if the popup path is reintroduced.
