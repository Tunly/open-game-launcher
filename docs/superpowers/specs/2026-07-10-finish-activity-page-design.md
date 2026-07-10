# Activity Page Production Completion Design

## Goal

Finish `/activity` as a production-ready yearly recap backed exclusively by the
signed-in user's real Supabase play sessions. The normal route must never
present synthetic sessions as user history.

## Root Causes

The current session query selects only `game_sessions` columns while its mapper
expects `game_title` and `game_cover_url` fields that do not exist on that table.
Hosted recaps therefore fall back to raw game UUIDs. The query is also not
paginated, the page does not distinguish an unconfigured backend from a
signed-out user, and its retry callback is discarded. Local sample sessions are
silently substituted whenever Supabase is unavailable, year selection permits a
future year, and share feedback survives a year change.

## Chosen Architecture

Use the existing `game_sessions.game_id -> games.id` foreign key through a
relational Supabase select. Each session page includes the related game title
and cover URL, and the mapper normalizes that nested row into the existing
`UserPlaySession` contract.

No database migration, view, RPC, or client-side second game lookup is added.
The read layer owns pagination so every caller receives a complete result for
its requested range rather than an implicit first backend page.

The Activity page requests one calendar year at a time with an inclusive start
and exclusive end timestamp. A lightweight paginated `started_at` query
discovers the user's available activity years without downloading every full
session row. The current year and previous year remain available even when
empty; future years are rejected.

## Data Contract

- `getUserPlaySessions` keeps its existing options and adds transparent,
  deterministic pagination.
- The session select joins `games(title, cover_url)` and maps missing related
  metadata to a neutral `Unknown Game` label, never a visible UUID.
- Calendar filters are applied by Supabase before pagination.
- A dedicated year-index read returns unique, non-future years in descending
  order.
- The React hook accepts stable calendar-range inputs, exposes available years,
  distinguishes authentication from backend configuration, and retains its
  race/unmount protection and `refetch` action.

## User Experience

The existing Retro Manga Launcher composition remains: paper and halftone
background, thick black borders, hard shadows, red/teal accents, dense recap
panels, `neo-title`, `neo-copy`, and header navigation with `OG-Launcher`.

The page has explicit mutually exclusive states:

1. Supabase unavailable: explain that Activity requires the hosted data service.
2. Signed out: explain that account activity requires sign-in and link to
   `/auth`.
3. Loading: retain the compact launcher loading panel.
4. Error: show an honest load failure with a working Retry action.
5. Empty year: explain that no sessions were recorded for that calendar year.
6. Ready: show stats, share/export controls, month tape, top games, and patterns.

Normal runtime states contain no hard-coded session rows. A development-only
visual verification fixture may exist only behind an explicit verification
query, must be labelled `Verification Preview` and `Sample Data`, and must never
activate on plain `/activity` or in a production build.

Changing the year resets copy/share feedback. The selector never offers a
future year and preserves a route-selected historical year when valid. Existing
performance-history links remain functional and identify the selected game.

## Error Handling and Integrity

- Pagination stops only after a short/empty page and propagates non-schema
  Supabase errors.
- Missing-schema behavior remains compatible with the repository's existing
  graceful fallback policy but produces an honest empty/backend state rather
  than sample activity.
- Related-game metadata is treated as optional so orphaned or restricted rows
  cannot crash the recap.
- Retry repeats both the selected-year session read and the year-index read.
- Stale responses after auth, year, retry, cleanup, or unmount cannot overwrite
  the latest state.

## Testing

Follow test-driven development:

- Data-layer tests first prove relational game enrichment, multi-page reads,
  calendar filters, year de-duplication, and missing metadata fallback.
- Hook tests prove configured/signed-out distinction, range forwarding,
  available-year loading, retry, stale-response protection, and errors.
- Page tests prove there is no implicit demo data, cover backend/sign-in/error/
  retry/empty/ready states, reject future years, keep year navigation stable,
  reset share status, and preserve export/share behavior.
- Existing recap aggregation and Activity-to-Performance tests remain green.
- Run focused tests followed by format check, typecheck, lint, the full frontend
  test suite, production build, route inventory, and UI evidence checks.
- Refresh desktop and 390px mobile Activity screenshots so they show the current
  complete share panel and have no horizontal overflow.

## Acceptance Criteria

1. Plain `/activity` displays only real Supabase data for the signed-in user.
2. Real sessions display game titles and cover metadata from `games`, never raw
   UUIDs as titles.
3. A year with more rows than one backend page is complete.
4. Backend, signed-out, loading, error/retry, empty, and ready states are clear
   and tested.
5. Year navigation cannot create a fictional future recap and remains stable
   after switching years.
6. Copy/share/export output always matches the currently selected year.
7. The page remains responsive and conforms to `docs/PROJECT_DESIGN.md`.
8. Relevant tests and required frontend verification commands pass with fresh
   evidence.

## Non-Goals

- Adding a local SQLite/Tauri Activity history reader.
- Introducing a new Supabase migration, view, or RPC.
- Reworking unrelated Community/Friends activity feeds.
- Refactoring unrelated dirty-worktree changes.
