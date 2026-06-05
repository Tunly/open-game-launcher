-- Extended playtime tracking: allow users to update and delete their own game sessions
-- (manual correction / retroactive edits per FEATURE_PLAN §14).
-- Existing policy `game_sessions_update_own_open` only permits updates on open sessions,
-- which is too narrow for fixing `ended_at`/`duration_minutes` after the fact.
-- We DROP that policy and replace it with a broader one that allows updates on any of
-- the user's own sessions, while still enforcing ownership.

drop policy if exists game_sessions_update_own_open on public.game_sessions;

create policy game_sessions_update_own
  on public.game_sessions
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy game_sessions_delete_own
  on public.game_sessions
  for delete
  to authenticated
  using (auth.uid() = user_id);

-- Index that helps the Settings-page aggregation query (per-day / per-week rollups)
-- when filtering by user_id + a time range.
create index if not exists game_sessions_user_started_at_idx
  on public.game_sessions (user_id, started_at desc);
