# Last Played Persistence Design

## Goal

`Last Played` must persist for installed games from every supported launcher and for manually added games, including sessions shorter than one minute. A library refresh or application restart must not remove a timestamp that OG Launcher recorded from an explicit launch or an observed running process.

## Existing Constraint

Older scanner versions used install-directory modification times as activity. Those timestamps have no trustworthy gameplay provenance and must remain excluded. The fix therefore must not preserve every non-Steam timestamp unconditionally.

## Design

The native activity path will treat an explicit zero-minute value as evidence that OG Launcher observed real gameplay activity:

- A successful OG Launcher start records the current timestamp and initializes missing `playtime_minutes` to `0`.
- The process poller records the timestamp immediately on the first observed running transition, rather than waiting for the first complete minute or process exit.
- Activity updates with a zero-minute delta initialize missing playtime to `0` without increasing existing playtime.
- Inventory refresh preserves a cached timestamp whenever `playtime_minutes` is present, including `Some(0)`.
- Legacy timestamps paired with `playtime_minutes: None` continue to be dropped.

No database schema, frontend type, or visual change is required. The existing `Option<u32>` field already distinguishes unknown playtime (`None`) from observed activity below one minute (`Some(0)`).

## Data Flow

1. OG Launcher starts a cached game, or the poller detects its process.
2. The native cache receives `last_played_at` and an explicit playtime value (`0` when no full minute has elapsed).
3. Cache repair retains the timestamp because activity now has provenance.
4. The existing `game_activity_updated` event updates the Library immediately.
5. A later scan merges the timestamp because explicit zero-minute activity is preserved.
6. Normal polling continues adding one minute after each complete tracked minute.

## Error Handling

- Failed launches do not record activity because recording remains after successful process/URI start.
- Games whose actual process cannot be identified still receive a timestamp when launched through OG Launcher.
- Externally launched games require a successful process match; without one, OG Launcher has no trustworthy observation to record.
- Legacy cache rows with no playtime provenance remain unchanged and are still cleaned.

## Testing

Regression coverage will verify:

- a short manual/non-Steam launch stores a timestamp with explicit zero-minute playtime;
- a first process observation schedules immediate persistence;
- zero-minute activity survives cache repair and inventory refresh;
- timestamps without any playtime provenance are still rejected;
- existing minute accumulation and process-matching tests remain green.

Verification will include focused Rust tests, the full Rust library test suite, frontend tests covering Library activity updates, TypeScript typechecking, linting, and a production build.
