-- Allow authenticated launcher clients to sync their own playtime stats.
-- RLS remains the authority for row ownership.
grant select, insert, update on table public.user_game_stats to authenticated;

alter table public.user_game_stats enable row level security;

drop policy if exists launcher_playtime_stats_insert_own on public.user_game_stats;
create policy launcher_playtime_stats_insert_own
  on public.user_game_stats
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists launcher_playtime_stats_update_own on public.user_game_stats;
create policy launcher_playtime_stats_update_own
  on public.user_game_stats
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
