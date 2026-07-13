# Last Played Persistence Implementation Plan

## Audited Status — 2026-07-13

The zero-minute provenance, first-observation scheduling, and cache-preservation
changes are implemented in the current working tree. Focused native playtime
tests pass. The historical checkboxes below remain the original red/green
execution recipe rather than a retroactive claim about each development step.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist trustworthy `Last Played` timestamps for short sessions across every supported installed launcher and manually added games.

**Architecture:** Keep the existing optional playtime field as the provenance marker: `None` remains unknown/legacy, while `Some(0)` means OG Launcher observed activity shorter than a full minute. Record that marker on explicit launches and first process observation, then preserve it through cache repair and inventory refresh.

**Tech Stack:** Rust, Tauri 2, native SQLite-backed local entity cache, Cargo test harness.

---

## File Structure

- Modify `launcher/src-tauri/src/commands/games/core.rs`: preserve cached timestamps when playtime is explicitly present, including zero, and extend the existing provenance regression test.
- Modify `launcher/src-tauri/src/commands/games/playtime.rs`: centralize activity mutation, initialize zero-minute provenance, persist first process observation immediately, and add unit tests.
- Verify existing frontend listeners in `launcher/src/hooks/library/useLibrarySync.ts` without changing them; they already consume `game_activity_updated` correctly.

### Task 1: Preserve Explicit Zero-Minute Activity Through Refresh

**Files:**
- Modify: `launcher/src-tauri/src/commands/games/core.rs:3271-3292`
- Test: `launcher/src-tauri/src/commands/games/core.rs:5086-5102`

- [ ] **Step 1: Extend the existing provenance test with zero-minute activity**

After the assertion that a timestamp with `playtime_minutes: None` is dropped, set explicit zero-minute playtime and assert that the timestamp is retained:

```rust
cached_game.playtime_minutes = Some(0);
merge_cached_game_activity(&mut scanned_game, &cached_game);
assert_eq!(
    scanned_game.last_played_at.as_deref(),
    Some("2026-06-01T12:00:00Z")
);
```

- [ ] **Step 2: Run the regression test and verify RED**

Run `cargo test merge_cached_game_activity_drops_unproven_directory_timestamp --lib`.

Expected: FAIL because the current `> 0` guard rejects `Some(0)`.

- [ ] **Step 3: Implement the minimal provenance condition**

Replace the positive-minute check with presence semantics:

```rust
if cached_game.playtime_minutes.is_some() {
    match (&game.last_played_at, &cached_game.last_played_at) {
        (Some(current), Some(cached)) if cached > current => {
            game.last_played_at = Some(cached.clone());
        }
        (None, Some(cached)) => {
            game.last_played_at = Some(cached.clone());
        }
        _ => {}
    }
}
```

- [ ] **Step 4: Run the focused test and verify GREEN**

Run the same Cargo test. Expected: PASS.

### Task 2: Record Short Activity with Explicit Zero-Minute Provenance

**Files:**
- Modify: `launcher/src-tauri/src/commands/games/playtime.rs:164-267`
- Modify: `launcher/src-tauri/src/commands/games/playtime.rs:587-636`
- Test: `launcher/src-tauri/src/commands/games/playtime.rs` test module

- [ ] **Step 1: Add a failing unit test for short activity mutation**

```rust
#[test]
fn activity_timestamp_initializes_zero_minute_provenance() {
    let mut game = test_game();
    let played_at = "2026-07-12T20:00:00Z".to_string();

    apply_game_activity_update(&mut game, Some(played_at.clone()), 0);

    assert_eq!(game.last_played_at, Some(played_at));
    assert_eq!(game.playtime_minutes, Some(0));
}
```

- [ ] **Step 2: Run the test and verify RED**

Run `cargo test activity_timestamp_initializes_zero_minute_provenance --lib`.

Expected: compilation failure because `apply_game_activity_update` does not exist.

- [ ] **Step 3: Add the minimal activity mutation helper**

```rust
fn apply_game_activity_update(
    game: &mut InstalledGame,
    last_played: Option<String>,
    add_playtime_minutes: u32,
) {
    let has_observed_activity = last_played.is_some();
    if has_observed_activity {
        game.last_played_at = last_played;
    }
    if has_observed_activity || add_playtime_minutes > 0 {
        game.playtime_minutes = Some(
            game.playtime_minutes
                .unwrap_or_default()
                .saturating_add(add_playtime_minutes),
        );
    }
}
```

Use this helper in both cache mutation call sites instead of separately assigning timestamp and only adding playtime when the delta is positive.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run the same Cargo test. Expected: PASS.

### Task 3: Persist the First Observed Process Transition Immediately

**Files:**
- Modify: `launcher/src-tauri/src/commands/games/playtime.rs:168-218`
- Test: `launcher/src-tauri/src/commands/games/playtime.rs` test module

- [ ] **Step 1: Add a failing scheduling test**

```rust
#[test]
fn first_running_observation_schedules_zero_minute_activity() {
    let mut game = test_game();
    game.last_played_at = Some("2026-07-12T20:00:00Z".to_string());

    assert_eq!(
        first_running_activity_update(false, &game),
        Some((game.last_played_at.clone(), 0))
    );
    assert_eq!(first_running_activity_update(true, &game), None);
}
```

- [ ] **Step 2: Run the test and verify RED**

Run `cargo test first_running_observation_schedules_zero_minute_activity --lib`.

Expected: compilation failure because `first_running_activity_update` does not exist.

- [ ] **Step 3: Implement immediate first-observation scheduling**

```rust
fn first_running_activity_update(
    was_running: bool,
    game: &InstalledGame,
) -> Option<(Option<String>, u32)> {
    (!was_running).then(|| (game.last_played_at.clone(), 0))
}
```

Immediately after assigning `game.last_played_at` in the running branch, insert this update into `activity_updates`. Keep the existing one-minute update afterward so it overwrites the zero delta when a full minute is reached in the same poll.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run the same Cargo test. Expected: PASS.

### Task 4: Verify the Integrated Behavior

**Files:**
- Verify: `launcher/src-tauri/src/commands/games/core.rs`
- Verify: `launcher/src-tauri/src/commands/games/playtime.rs`
- Verify: `launcher/src/hooks/library/useLibrarySync.ts`

- [ ] **Step 1: Run all native library tests**

Run `cargo test --lib` from `launcher/src-tauri`. Expected: all tests pass with zero failures.

- [ ] **Step 2: Run focused Library frontend tests**

Run `pnpm test -- src/hooks/library/__tests__/useLibrarySync.test.tsx src/hooks/library/__tests__/useProviderPicking.test.tsx` from `launcher`. Expected: both files pass.

- [ ] **Step 3: Run repository-required frontend checks**

Run `pnpm typecheck`, `pnpm lint`, and `pnpm build` from `launcher`. Expected: every command exits with code 0.

- [ ] **Step 4: Inspect the scoped diff**

Run `git diff --check -- launcher/src-tauri/src/commands/games/core.rs launcher/src-tauri/src/commands/games/playtime.rs` and inspect the same scoped diff. Expected: no whitespace errors; only the planned provenance, immediate-persistence, and regression-test changes are attributable to this task among the pre-existing user edits.
